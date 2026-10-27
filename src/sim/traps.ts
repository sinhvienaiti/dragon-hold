/**
 * Traps (03 §7): floor traps hit ground and grounded foes, posts reach low
 * air; one shot then recharge, except continuous Gai Chông; auto trigger by
 * foes in the area (M0 has no trigger words, 00 D13). Resonance: word hits on
 * foes inside a recharging trap cut its recharge (03 §10.2).
 * M0: Gai Chông (strip 4 m: slow 25 %, 8 VL/s), Bom Hạt Thông (3 m, ≥ 2 foes
 * or one held by a blocker, 00 D33 (1): 120 VL, push 2 m, 22 s), Lưới Phóng
 * (post, 10 m: grounds the nearest low flyer 3 s, 15 s). Levels 2–3: main effect +45 % then +35 %, recharge −15 %
 * at 3 (03 §7.3); chain 20+ recharges 10 % faster (03 §10.4).
 * Owner: sim-ourside (LANES.md).
 */
import { OUR_SIDE_TUNING, TRAPS } from "../content/data/our-side";
import { CHAIN, OUR_SIDE } from "../content/rules";
import type { EntityRef, Grade, TrapDef, TrapId } from "../content/types";
import { damageEnemy } from "./combat";
import { emit } from "./events";
import { dist2, mmToU, msToTicks, uToM } from "./fixed";
import { knockBack } from "./movement";
import { applyStatus, stanceNow, tenacityFor } from "./status";
import { chainTier } from "./words";
import type { EnemyState, WorldInit, World } from "./world";

export interface TrapState {
  /** Map slot index. */
  readonly slot: number;
  readonly trap: TrapId;
  level: number;
  /** Tick it is ready again (0: ready). */
  readyAt: number;
  /** Recharge already cut by resonance this cycle, ticks. */
  resonated: number;
  /** Continuous traps: tick of the next stab. */
  pulseAt: number;
  /** Off until this tick (E11 fire arrow, later sappers). */
  offUntil: number;
}

export interface TrapsState {
  readonly list: TrapState[];
}

export function createTrapsState(init: WorldInit): TrapsState {
  return { list: [] };
}

/** Main effect × permille at `level` (03 §7.3: ×1.45, then ×1.35 more). */
export function trapMainPm(def: TrapDef, level: number): number {
  let pm = 1000;
  for (let step = 1; step < level && step <= def.upgrade.mainPct.length; step += 1) pm = Math.round((pm * (100 + def.upgrade.mainPct[step - 1]!)) / 100);
  return pm;
}

/** Full recharge in ticks at `level` and the run's chain now. */
export function rechargeTicks(world: World, def: TrapDef, level: number): number {
  let ticks = msToTicks(def.rechargeMs);
  if (level >= 3) ticks = Math.round((ticks * (100 + (def.upgrade.rechargePctAt3 ?? OUR_SIDE.upgradeRechargePctAt3))) / 100);
  if (chainTier(world.words.chain) >= 3) ticks = Math.round((ticks * (100 - CHAIN.trapRechargePctAt20)) / 100);
  return ticks;
}

/** Builds the trap in `slot` (shop calls it after paying); ready at once. */
export function buildTrap(world: World, slot: number, trap: TrapId): void {
  world.traps.list.push({ slot, trap, level: 1, readyAt: 0, resonated: 0, pulseAt: 0, offUntil: 0 });
}

export function levelTrap(world: World, slot: number, level: number): void {
  const trap = world.traps.list.find((item) => item.slot === slot);
  if (trap) trap.level = level;
}

export function removeTrap(world: World, slot: number): void {
  const index = world.traps.list.findIndex((item) => item.slot === slot);
  if (index >= 0) world.traps.list.splice(index, 1);
}

/** E11's fire arrow (02 §2.2: +3 s) and later sappers: the trap rests `ticks` longer. */
export function delayTrap(world: World, slot: number, ticks: number): void {
  const trap = world.traps.list.find((item) => item.slot === slot);
  if (!trap || ticks <= 0) return;
  const from = trap.offUntil > world.tick ? trap.offUntil : world.tick;
  trap.offUntil = from + ticks;
  if (trap.readyAt > world.tick) trap.readyAt += ticks;
}

/** True when the foe stands in the trap's area (strip along its lane, or circle). */
export function inTrapArea(world: World, trap: TrapState, enemy: EnemyState): boolean {
  const def = TRAPS[trap.trap];
  const slot = world.slots[trap.slot]!;
  if (def.area.shape === "strip") {
    if (enemy.lane !== slot.lane) return false;
    const half = mmToU(def.area.lengthMm ?? 0) / 2;
    const width = mmToU(def.area.radiusMm);
    return enemy.along >= slot.along - half && enemy.along <= slot.along + half && enemy.lateral >= -width && enemy.lateral <= width;
  }
  const radius = mmToU(def.area.radiusMm);
  return dist2(enemy.x, enemy.z, slot.x, slot.z) <= radius * radius;
}

/** The trap can strike this foe now: floor traps ground foes, posts low flyers (03 §7.1, data `hits`). */
function canHit(world: World, def: TrapDef, enemy: EnemyState): boolean {
  const stance = stanceNow(world, enemy);
  return (def.hits.ground && stance === "ground") || (def.hits.lowAir && stance === "low-air");
}

const trapRef = (trap: TrapState): EntityRef => ({ kind: "trap", slot: trap.slot });
const enemyRef = (enemy: EnemyState): EntityRef => ({ kind: "enemy", slot: enemy.slot, serial: enemy.serial });

/** Damage of one blow at C-chapter strength: base × g(c) × level, at least 1. */
const blow = (world: World, base: number, mainPm: number): number => {
  const amount = Math.round((base * world.gPm * mainPm) / 1_000_000);
  return amount < 1 ? 1 : amount;
};

function fired(world: World, trap: TrapState, def: TrapDef, count: number): void {
  const slot = world.slots[trap.slot]!;
  trap.readyAt = world.tick + rechargeTicks(world, def, trap.level);
  trap.resonated = 0;
  emit(world, { type: "trap-trigger", slot: trap.slot, trap: trap.trap, x: uToM(slot.x), z: uToM(slot.z), count });
}

const scratch: EnemyState[] = [];

/** A blocker holds one of `foes` (movement set `blockedBy` this tick). */
const heldIn = (foes: readonly EnemyState[]): boolean => foes.some((enemy) => enemy.alive && enemy.blockedBy >= 0);

/** Continuous effects, triggers, recharges; emits `trap-trigger`. */
export function stepTraps(world: World): void {
  const tick = world.tick;
  for (const trap of world.traps.list) {
    const slot = world.slots[trap.slot]!;
    if (tick < slot.activeAt || tick < trap.offUntil) continue;
    const def = TRAPS[trap.trap];
    const effect = def.effect;
    scratch.length = 0;
    for (const enemy of world.enemies.list) if (enemy.alive && canHit(world, def, enemy) && inTrapArea(world, trap, enemy)) scratch.push(enemy);

    if (effect.kind === "spikes") {
      // Slow while inside (lingers a moment), a stab every 0.5 s (03 §7.2).
      for (const enemy of scratch) applyStatus(world, enemyRef(enemy), enemy.statuses, { id: "slow", durationMs: OUR_SIDE_TUNING.spikesLingerMs, value: effect.slowPct, by: "trap", source: trapRef(trap) });
      if (scratch.length === 0 || tick < trap.pulseAt) continue;
      trap.pulseAt = tick + msToTicks(OUR_SIDE_TUNING.spikesPulseMs);
      const perStab = Math.round((effect.dps * OUR_SIDE_TUNING.spikesPulseMs) / 1000);
      const amount = blow(world, perStab, trapMainPm(def, trap.level));
      for (const enemy of scratch) if (enemy.alive) damageEnemy(world, enemy, amount, effect.damageType, trapRef(trap), "trap");
      emit(world, { type: "trap-trigger", slot: trap.slot, trap: trap.trap, x: uToM(slot.x), z: uToM(slot.z), count: scratch.length });
      continue;
    }

    if (tick < trap.readyAt || (scratch.length < def.triggerMin && !(def.triggerHeld === true && heldIn(scratch)))) continue;

    if (effect.kind === "bomb") {
      // One blast for the whole cluster, then push the survivors back along the lane.
      const amount = blow(world, effect.damage, trapMainPm(def, trap.level));
      const count = scratch.length;
      for (const enemy of scratch) if (enemy.alive) damageEnemy(world, enemy, amount, effect.damageType, trapRef(trap), "trap");
      for (const enemy of scratch) if (enemy.alive && effect.pushMm > 0) knockBack(world, enemy, mmToU(effect.pushMm));
      fired(world, trap, def, count);
      continue;
    }

    // Net: the nearest low flyers, grounded (generals half, tenacity shortens it).
    scratch.sort((a, b) => dist2(a.x, a.z, slot.x, slot.z) - dist2(b.x, b.z, slot.x, slot.z) || a.serial - b.serial);
    const ms = Math.round((effect.groundMs * trapMainPm(def, trap.level)) / 1000);
    let netted = 0;
    for (const enemy of scratch) {
      if (netted >= effect.targets) break;
      const got = applyStatus(world, enemyRef(enemy), enemy.statuses, { id: "grounded", durationMs: ms, tenacityPct: tenacityFor(world, enemy), by: "trap", source: trapRef(trap) });
      if (got > 0) netted += 1;
    }
    if (netted > 0) fired(world, trap, def, netted);
  }
  scratch.length = 0;
}

/** A word hit `enemy`: recharging traps whose area holds it lose 0.8 s (1.2 s on Chớp, Hoàn hảo), capped at 50 % a cycle. */
export function resonate(world: World, enemy: EnemyState, grade: Grade): void {
  const tick = world.tick;
  const cut = msToTicks(grade === "flash" || grade === "perfect" ? OUR_SIDE.resonanceBestMs : OUR_SIDE.resonanceMs);
  for (const trap of world.traps.list) {
    const def = TRAPS[trap.trap];
    if (def.continuous || trap.readyAt <= tick || !inTrapArea(world, trap, enemy)) continue;
    const cap = Math.floor((rechargeTicks(world, def, trap.level) * OUR_SIDE.resonanceCapPct) / 100) - trap.resonated;
    const take = cut < cap ? cut : cap;
    if (take <= 0) continue;
    trap.readyAt -= take;
    trap.resonated += take;
  }
}

/** Ticks until the trap in `slot` is ready (0: ready or continuous), for the recharge ring. */
export function trapRechargeLeft(world: World, slot: number): number {
  const trap = world.traps.list.find((item) => item.slot === slot);
  return trap && trap.readyAt > world.tick ? trap.readyAt - world.tick : 0;
}
