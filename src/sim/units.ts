/**
 * Blockers and helpers (03 §9): units stand within 4 m of their block point
 * (the rally point), stop foes while their block slots cover the foe's weight
 * (else the foe pushes on at 50 % speed), fight the foes they block first,
 * regen 4 %/s after 3 s unhit, fall into a bud and rise in place after the
 * respawn time; all rise at wave end. Flyers cannot be blocked unless
 * grounded. E18's pounce over a blocker is movement's (sim-battle): it lets
 * go (`blockedBy = −1`) and leaps 3 m, which frees the quarters here.
 * M0: Vệ Binh Rêu (2 slots = 8 quarters, 450 HP, G1, 12 VL / 1.2 s, 14 s).
 * List position = unit index (EntityRef "unit"); selling re-indexes, which
 * only happens in prep and breaks when no foe is alive.
 * Owner: sim-ourside (LANES.md).
 */
import { OUR_SIDE_TUNING, UNITS } from "../content/data/our-side";
import { BLOCK, CHAIN, DAMAGE, OUR_SIDE } from "../content/rules";
import type { DamageType, EntityRef, UnitDef, UnitId } from "../content/types";
import { damageEnemy, reductionPm } from "./combat";
import { emit } from "./events";
import { dist2, mmToU, msToTicks, uToM } from "./fixed";
import { pointAt, type LanePoint } from "./lanes";
import { armourPm, canAttack, canMove, createStatusSet, foeDef, healPct, resetStatusSet, stanceNow, statusValue, type StatusSet } from "./status";
import { chainTier } from "./words";
import type { EnemyState, WorldInit, World } from "./world";

export interface UnitState {
  /** Position in `units.list` (EntityRef `{ kind: "unit", slot: index }`). */
  index: number;
  /** Map slot (block point) index. */
  readonly slot: number;
  readonly unit: UnitId;
  level: number;
  hp: number;
  hpMax: number;
  /** Temporary HP taken first, ≤ 50 % max HP, never regenerates (03 §2.1). */
  shield: number;
  /** Lane index and the block point's distance from the gate, u. */
  readonly lane: number;
  readonly home: number;
  /** Where it stands now along the lane (home − leash … home), and its offset across it. */
  along: number;
  readonly lateral: number;
  /** Position in u (within the leash of its point). */
  x: number;
  z: number;
  /** Tick it rises again (−1: standing). */
  downUntil: number;
  /** Block quarters in use. */
  blockUsed: number;
  attackAt: number;
  lastHitAt: number;
  statuses: StatusSet;
}

export interface UnitsState {
  readonly list: UnitState[];
  /** Tick block counts were last rebuilt from the foes (−1: never). */
  countedAt: number;
  /** Chain 40+: tick of the next shield on every unit (03 §10.4). */
  shieldAt: number;
}

export function createUnitsState(init: WorldInit): UnitsState {
  return { list: [], countedAt: -1, shieldAt: 0 };
}

const point: LanePoint = { x: 0, z: 0 };

/** Stat × permille after `level`, each level multiplying by (100 + pct) % (03 §9.2). */
function levelPm(level: number, pct: number): number {
  let pm = 1000;
  for (let at = 1; at < level; at += 1) pm = Math.round((pm * (100 + pct)) / 100);
  return pm;
}

/** Max HP at `level`: base × g(c), +40 % a level. */
export const unitHpMax = (world: World, def: UnitDef, level: number): number =>
  Math.round((def.hp * world.gPm * levelPm(level, def.upgrade.hpPct ?? OUR_SIDE.unitHpPerLevelPct)) / 1_000_000);

/** One blow at `level` with the chain bonus: base × g(c), +25 % a level, at least 1. */
export function unitDamage(world: World, def: UnitDef, level: number): number {
  const chainPct = CHAIN.ourSideBonusPct[chainTier(world.words.chain)] ?? 0;
  const pm = levelPm(level, def.upgrade.attackPct ?? OUR_SIDE.unitAttackPerLevelPct);
  const amount = Math.round((def.attack.damage * world.gPm * pm * (100 + chainPct)) / 100_000_000);
  return amount < 1 ? 1 : amount;
}

/** Block capacity of one unit in quarters (03 §9.1: slots are whole foes). */
const capacity = (unit: UnitState): number => UNITS[unit.unit].blockSlots * 4;

const standing = (unit: UnitState): boolean => unit.downUntil < 0;

function place(world: World, unit: UnitState): void {
  const lane = world.lanes[unit.lane];
  if (!lane) return;
  pointAt(lane, unit.along, unit.lateral, point);
  unit.x = point.x;
  unit.z = point.z;
}

export function buildUnit(world: World, slot: number, unit: UnitId): UnitState | null {
  const state = world.slots[slot];
  if (!state || state.lane < 0) return null;
  const def = UNITS[unit];
  const hp = unitHpMax(world, def, 1);
  const spread = mmToU(OUR_SIDE_TUNING.unitSpreadMm);
  // A quick place (C6+) stands up when its 2 s build ends.
  const building = state.activeAt > world.tick ? state.activeAt : -1;
  let first: UnitState | null = null;
  for (let k = 0; k < def.count; k += 1) {
    const made: UnitState = {
      index: world.units.list.length,
      slot,
      unit,
      level: 1,
      hp,
      hpMax: hp,
      shield: 0,
      lane: state.lane,
      home: state.along,
      along: state.along,
      lateral: Math.round((spread * (2 * k - (def.count - 1))) / 2),
      x: state.x,
      z: state.z,
      downUntil: building,
      blockUsed: 0,
      attackAt: world.tick,
      lastHitAt: -1,
      statuses: createStatusSet(),
    };
    place(world, made);
    world.units.list.push(made);
    first ??= made;
  }
  return first;
}

export function levelUnits(world: World, slot: number, level: number): void {
  for (const unit of world.units.list) {
    if (unit.slot !== slot) continue;
    const hpMax = unitHpMax(world, UNITS[unit.unit], level);
    unit.level = level;
    if (standing(unit)) unit.hp += hpMax - unit.hpMax;
    unit.hpMax = hpMax;
  }
}

/** Sold: the units of `slot` leave; the rest are re-indexed (prep and breaks only: no foe holds a reference). */
export function removeUnits(world: World, slot: number): void {
  const list = world.units.list;
  const remap: number[] = list.map(() => -1);
  let next = 0;
  for (let index = 0; index < list.length; index += 1) if (list[index]!.slot !== slot) remap[index] = next++;
  for (const enemy of world.enemies.list) if (enemy.blockedBy >= 0) enemy.blockedBy = remap[enemy.blockedBy] ?? -1;
  for (let index = list.length - 1; index >= 0; index -= 1) if (list[index]!.slot === slot) list.splice(index, 1);
  list.forEach((unit, index) => {
    unit.index = index;
  });
  world.units.countedAt = -1;
}

// ── Blocking (03 §9.1) ─────────────────────────────────────────────────────

/** Block weight of a foe in quarters now (0: cannot be blocked). Grounded low flyers weigh like ground foes of their tier. */
export function blockWeight(world: World, enemy: EnemyState): number {
  const def = foeDef(enemy.foe);
  if (def.blockQuarters > 0) return stanceNow(world, enemy) === "ground" ? def.blockQuarters : 0;
  if (def.stance === "low-air" && stanceNow(world, enemy) === "ground" && "tier" in def) return BLOCK.weightQuarters[def.tier];
  return 0;
}

/** A standing unit and a foe on its lane touch. */
function touching(world: World, unit: UnitState, enemy: EnemyState): boolean {
  if (!standing(unit) || unit.lane !== enemy.lane) return false;
  const reach = mmToU(OUR_SIDE_TUNING.contactMm);
  const gap = enemy.along - unit.along;
  return gap >= -reach && gap <= reach;
}

/** Rebuilds block counts from the foes once a tick (deaths and falls free their quarters). */
function recount(world: World): void {
  const units = world.units;
  if (units.countedAt === world.tick) return;
  units.countedAt = world.tick;
  for (const unit of units.list) unit.blockUsed = 0;
  for (const enemy of world.enemies.list) {
    if (!enemy.alive || enemy.blockedBy < 0) continue;
    const unit = units.list[enemy.blockedBy];
    const weight = blockWeight(world, enemy);
    if (!unit || !standing(unit) || weight <= 0) {
      enemy.blockedBy = -1;
      continue;
    }
    unit.blockUsed += weight;
  }
}

function release(world: World, enemy: EnemyState): void {
  const unit = world.units.list[enemy.blockedBy];
  if (unit) {
    unit.blockUsed -= blockWeight(world, enemy);
    if (unit.blockUsed < 0) unit.blockUsed = 0;
  }
  enemy.blockedBy = -1;
}

const enemyRef = (enemy: EnemyState): EntityRef => ({ kind: "enemy", slot: enemy.slot, serial: enemy.serial });
const unitRef = (unit: UnitState): EntityRef => ({ kind: "unit", slot: unit.index });

function attackEvent(world: World, source: EntityRef, from: { x: number; z: number }, target: EntityRef, to: { x: number; z: number }, stage: "windup" | "strike"): void {
  emit(world, { type: "attack", source, target, stage, x: uToM(from.x), z: uToM(from.z), tx: uToM(to.x), tz: uToM(to.z) });
}

/**
 * The standing unit holding `enemy` now (−1: none). Movement asks before a
 * step and must not advance a held foe: a foe already held keeps its unit
 * while they touch; a free one is grabbed by the first unit it touches with
 * room for its weight (03 §9.1).
 */
export function blockerFor(world: World, enemy: EnemyState): number {
  if (!enemy.alive) return -1;
  recount(world);
  const units = world.units;
  const weight = blockWeight(world, enemy);
  if (enemy.blockedBy >= 0) {
    const unit = units.list[enemy.blockedBy];
    if (unit && weight > 0 && touching(world, unit, enemy)) return unit.index;
    release(world, enemy);
  }
  if (weight <= 0) return -1;
  for (const unit of units.list) {
    if (!touching(world, unit, enemy) || unit.blockUsed + weight > capacity(unit)) continue;
    unit.blockUsed += weight;
    enemy.blockedBy = unit.index;
    return unit.index;
  }
  return -1;
}

/** Speed share in % for a foe not held: 50 while it pushes past a unit without room for it (03 §9.1), else 100. */
export function blockPassPct(world: World, enemy: EnemyState): number {
  if (!enemy.alive || enemy.blockedBy >= 0) return 100;
  const weight = blockWeight(world, enemy);
  if (weight <= 0) return 100;
  recount(world);
  for (const unit of world.units.list) if (touching(world, unit, enemy) && unit.blockUsed + weight > capacity(unit)) return BLOCK.passSpeedPct;
  return 100;
}

// ── HP ──────────────────────────────────────────────────────────────────────

/** Heals a standing unit (poison and curse halve it unless `cut` is false: already cut); returns HP gained. */
export function healUnit(world: World, unit: UnitState, amount: number, cut = true): number {
  if (!standing(unit) || amount <= 0) return 0;
  const heal = cut ? Math.floor((amount * healPct(unit.statuses, world.tick)) / 100) : amount;
  const gained = unit.hp + heal > unit.hpMax ? unit.hpMax - unit.hp : heal;
  unit.hp += gained;
  return gained;
}

function fall(world: World, unit: UnitState): void {
  unit.hp = 0;
  unit.shield = 0;
  unit.downUntil = world.tick + msToTicks(UNITS[unit.unit].respawnMs);
  for (const enemy of world.enemies.list) if (enemy.blockedBy === unit.index) enemy.blockedBy = -1;
  unit.blockUsed = 0;
  resetStatusSet(unit.statuses);
  emit(world, { type: "unit-down", unit: unit.index, x: uToM(unit.x), z: uToM(unit.z) });
}

function rise(world: World, unit: UnitState): void {
  unit.downUntil = -1;
  unit.hp = unit.hpMax;
  unit.attackAt = world.tick;
  unit.lastHitAt = world.tick;
  emit(world, { type: "unit-up", unit: unit.index, x: uToM(unit.x), z: uToM(unit.z) });
}

/** Wave end: every fallen unit rises at once (03 §9.1). */
export function riseAll(world: World): void {
  for (const unit of world.units.list) if (!standing(unit)) rise(world, unit);
}

/**
 * Damage to a unit from foes: armour (G1 = 30 %) for physical, resist for magic,
 * nothing for word and true; shield first; emits `hit` (and `unit-down` at 0).
 * Returns HP and shield removed.
 */
export function damageUnit(world: World, index: number, amount: number, type: DamageType, source: EntityRef): number {
  const unit = world.units.list[index];
  if (!unit || !standing(unit) || amount <= 0) return 0;
  const def = UNITS[unit.unit];
  let cut = 0;
  if (type === "physical") {
    const armour = Math.round(((DAMAGE.tierG[def.armour]! + statusValue(unit.statuses, "fortify", world.tick)) * armourPm(unit.statuses, world.tick)) / 1000);
    cut = reductionPm(armour);
  } else if (type === "magic") cut = reductionPm(DAMAGE.tierG[def.resist]!);
  let left = Math.round((amount * (1000 - cut)) / 1000);
  if (left < DAMAGE.minDamage) left = DAMAGE.minDamage;
  const dealt = left > unit.hp + unit.shield ? unit.hp + unit.shield : left;
  const fromShield = dealt < unit.shield ? dealt : unit.shield;
  unit.shield -= fromShield;
  unit.hp -= dealt - fromShield;
  unit.lastHitAt = world.tick;
  emit(world, { type: "hit", target: unitRef(unit), source, amount: dealt, damageType: type, tier: 1, grade: null, x: uToM(unit.x), z: uToM(unit.z), hpLeft: unit.hp });
  if (unit.hp <= 0) fall(world, unit);
  return dealt;
}

/** The unit's target: a foe it blocks first, else the nearest ground foe in reach (03 §9.1). */
function targetOf(world: World, unit: UnitState): EnemyState | null {
  for (const enemy of world.enemies.list) if (enemy.alive && enemy.blockedBy === unit.index) return enemy;
  const range = mmToU(UNITS[unit.unit].attack.rangeMm);
  let best: EnemyState | null = null;
  let bestD2 = range * range;
  for (const enemy of world.enemies.list) {
    if (!enemy.alive || stanceNow(world, enemy) !== "ground") continue;
    const d2 = dist2(enemy.x, enemy.z, unit.x, unit.z);
    if (d2 <= bestD2 && (!best || d2 < bestD2 || enemy.serial < best.serial)) {
      best = enemy;
      bestD2 = d2;
    }
  }
  return best;
}

/** Leash (03 §9.1): an idle unit steps out up to 4 m towards the nearest foe coming down its lane, else walks home. */
function walk(world: World, unit: UnitState): void {
  const leash = mmToU(BLOCK.leashMm);
  const reach = mmToU(OUR_SIDE_TUNING.contactMm);
  let goal = unit.home;
  let best = -1;
  for (const enemy of world.enemies.list) {
    if (!enemy.alive || enemy.lane !== unit.lane || enemy.blockedBy >= 0 || blockWeight(world, enemy) <= 0) continue;
    if (enemy.along < unit.home - leash - reach || enemy.along > unit.along) continue;
    if (enemy.along > best) best = enemy.along;
  }
  if (best >= 0) {
    goal = best + Math.round(reach / 2);
    if (goal < unit.home - leash) goal = unit.home - leash;
    if (goal > unit.home) goal = unit.home;
  }
  if (goal === unit.along) return;
  const step = OUR_SIDE_TUNING.unitSpeedMmS; // mm/s = u per tick
  unit.along = goal > unit.along ? (goal - unit.along > step ? unit.along + step : goal) : unit.along - goal > step ? unit.along - step : goal;
  place(world, unit);
}

/** Unit attacks, regen, falls and respawns; emits `unit-down`, `unit-up`, `hit`. */
export function stepUnits(world: World): void {
  const tick = world.tick;
  const units = world.units;
  recount(world);
  const tier = chainTier(world.words.chain);
  // Chain 40+: a 50 shield (× g(c)) on every unit each 10 s (03 §10.4).
  let shield = 0;
  if (tier >= 4 && tick >= units.shieldAt) {
    units.shieldAt = tick + msToTicks(CHAIN.shieldEveryMsAt40);
    shield = Math.round((CHAIN.shieldAt40 * world.gPm) / 1000);
  } else if (tier < 4) units.shieldAt = tick + msToTicks(CHAIN.shieldEveryMsAt40);
  const beat = tick % 60 === 0;
  const regenDelay = msToTicks(BLOCK.unitRegenDelayMs);

  for (const unit of units.list) {
    if (!standing(unit)) {
      if (tick >= unit.downUntil) rise(world, unit);
      continue;
    }
    // 0 HP from a blow dealt outside damageUnit still turns the unit into a bud.
    if (unit.hp <= 0) {
      fall(world, unit);
      continue;
    }
    const def = UNITS[unit.unit];
    if (shield > 0) {
      const cap = Math.floor((unit.hpMax * 50) / 100);
      unit.shield = unit.shield + shield > cap ? cap : unit.shield + shield;
    }
    // Regen 4 %/s after 3 s unhit; chain 10+ adds 1 %/s (03 §9.1, §10.4).
    if (beat && unit.hp < unit.hpMax) {
      const pct = (tick - unit.lastHitAt >= regenDelay ? BLOCK.unitRegenPctPerS : 0) + (tier >= 2 ? CHAIN.unitRegenPctPerSAt10 : 0);
      if (pct > 0) healUnit(world, unit, Math.round((unit.hpMax * pct) / 100));
    }
    if (unit.blockUsed === 0 && canMove(unit.statuses, tick)) walk(world, unit);
    if (tick < unit.attackAt || !canAttack(unit.statuses, tick, false)) continue;
    const target = targetOf(world, unit);
    if (!target) continue;
    const haste = statusValue(unit.statuses, "haste", tick);
    unit.attackAt = tick + Math.round((msToTicks(def.attack.periodMs) * 100) / (100 + haste));
    attackEvent(world, unitRef(unit), unit, enemyRef(target), target, "strike");
    damageEnemy(world, target, unitDamage(world, def, unit.level), def.attack.damageType, unitRef(unit), "unit");
  }
}
