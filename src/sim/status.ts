/**
 * Statuses on foes, units and the Dragons (03 §2.3): slow keeps the strongest
 * under its cap, hard control (stun, root, freeze) shrinks on repeats (×1,
 * ×0.6, ×0.3) then grants Vững 4 s, burn stacks 3 per source (a breath burn
 * and a Chớp word burn tick apart, each credited to its own source), poison
 * keeps the strongest, Wet comes from the river. Our hard control is only
 * counted (G15 is a measured gate, 00 §7: tune numbers, never clip in code).
 * Damage over time ticks once a second; heal over time (potions) every tick.
 * Owner: sim-ourside (LANES.md).
 */
import { ENEMIES } from "../content/data/enemies";
import { GENERALS } from "../content/data/generals";
import { DAMAGE, STATUS } from "../content/rules";
import type { DamageType, EnemyDef, EntityRef, FoeId, GeneralDef, KillSource, Stance, StatusId } from "../content/types";
import { auraPct } from "./auras";
import { damageEnemy, damageHero } from "./combat";
import { emit } from "./events";
import { TICK_HZ, msToTicks, ticksToMs, uToM } from "./fixed";
import { damageUnit, healUnit } from "./units";
import type { EnemyState, World } from "./world";

export interface StatusEntry {
  readonly id: StatusId;
  /** Tick it ends (exclusive). */
  until: number;
  /** Strength in % (slow, mark, vulnerable, haste), per-second damage (burn per stack, poison) or the total heal (regen). */
  value: number;
  stacks: number;
  /** Tick it starts; Vững after a third hard control starts when that control ends. */
  start: number;
  /** HP already healed (regen). */
  done: number;
  /** The `status` on event went out. */
  shown: boolean;
  /** Our side's control on a foe: counts for diminishing returns and G15. */
  readonly ours: boolean;
  /** Kill source of its damage (a burn from Phun Lửa counts as breath). */
  readonly by: KillSource;
  readonly source: EntityRef | null;
}

/** Statuses on one actor, oldest first; small on purpose (5 icons shown, 03 §2.3). */
export interface StatusSet {
  readonly list: StatusEntry[];
  /** Hard-control hits in the current 10 s window, for diminishing returns. */
  hardHits: number;
  hardWindowEnds: number;
  /** Foes: ticks alive and ticks under our hard control (G15 guard). */
  life: number;
  hardTicks: number;
}

export function createStatusSet(): StatusSet {
  return { list: [], hardHits: 0, hardWindowEnds: 0, life: 0, hardTicks: 0 };
}

export interface ApplyStatus {
  readonly id: StatusId;
  readonly durationMs: number;
  readonly value?: number;
  /** Tenacity of the target in %, already capped (03 §2.3); `tenacityFor` gives a foe's. */
  readonly tenacityPct?: number;
  /** Who dealt it: the kill source of its damage over time (default "status"). */
  readonly by?: KillSource;
  readonly source?: EntityRef;
  /** Self effects (E19 stands stunned after a charge): no diminishing returns, not our control. */
  readonly self?: boolean;
}

const HARD: ReadonlySet<StatusId> = new Set<StatusId>(["stun", "root", "freeze"]);
/** Kept per strength: the strongest live one wins (slowPct, hastePct). */
const BY_VALUE: ReadonlySet<StatusId> = new Set<StatusId>(["slow", "haste"]);
/** One entry, the strongest value and the latest end. */
const STRONGEST: ReadonlySet<StatusId> = new Set<StatusId>(["poison", "vulnerable", "fortify"]);
/** Control that tenacity shortens besides hard control. */
const TENACITY: ReadonlySet<StatusId> = new Set<StatusId>(["stun", "root", "freeze", "grounded", "taunt"]);

const HERO_REF: EntityRef = { kind: "hero" };

const isActive = (entry: StatusEntry, tick: number): boolean => entry.start <= tick && entry.until > tick;

export function hasStatus(set: StatusSet, id: StatusId, tick: number): boolean {
  for (const entry of set.list) if (entry.id === id && isActive(entry, tick)) return true;
  return false;
}

/** Current slow in %, after the cap for this kind of foe. */
export function slowPct(set: StatusSet, tick: number, capPct: number): number {
  let best = 0;
  for (const entry of set.list) if (entry.id === "slow" && isActive(entry, tick) && entry.value > best) best = entry.value;
  return best > capPct ? capPct : best;
}

/** Strongest live value of `id` (0: none). */
export function statusValue(set: StatusSet, id: StatusId, tick: number): number {
  let best = 0;
  for (const entry of set.list) if (entry.id === id && isActive(entry, tick) && entry.value > best) best = entry.value;
  return best;
}

/** Stun, root or freeze active. */
export function isHardControlled(set: StatusSet, tick: number): boolean {
  for (const entry of set.list) if (HARD.has(entry.id) && isActive(entry, tick)) return true;
  return false;
}

/** May walk: not stunned, rooted, frozen or flinching. */
export function canMove(set: StatusSet, tick: number): boolean {
  return !isHardControlled(set, tick) && !hasStatus(set, "flinch", tick);
}

/** May strike: stun, freeze and flinch stop every attack; root stops melee only (03 §2.3 Giam). */
export function canAttack(set: StatusSet, tick: number, ranged: boolean): boolean {
  if (hasStatus(set, "stun", tick) || hasStatus(set, "freeze", tick) || hasStatus(set, "flinch", tick)) return false;
  return ranged || !hasStatus(set, "root", tick);
}

/** Damage taken × permille: Đánh dấu and vulnerable sources multiply (00 §4.2). */
export function vulnerablePm(set: StatusSet, tick: number): number {
  const mark = hasStatus(set, "mark", tick) ? DAMAGE.vulnerablePct.mark : 0;
  const other = statusValue(set, "vulnerable", tick);
  return Math.round(((1000 + mark * 10) * (1000 + other * 10)) / 1000);
}

/** Armour × permille: Phá giáp halves it (00 §4.2). */
export const armourPm = (set: StatusSet, tick: number): number => (hasStatus(set, "sunder", tick) ? DAMAGE.sunderPm : 1000);

/** Healing received in %: poison and curse cut it by half (03 §2.3). */
export function healPct(set: StatusSet, tick: number): number {
  return hasStatus(set, "poison", tick) || hasStatus(set, "curse", tick) ? 100 - STATUS.poison.healCutPct : 100;
}

// ── Foe traits ──────────────────────────────────────────────────────────────

export const foeDef = (foe: FoeId): EnemyDef | GeneralDef => (ENEMIES as Record<string, EnemyDef>)[foe] ?? (GENERALS as Record<string, GeneralDef>)[foe]!;

/** Stance now: a low flyer that is grounded or frozen walks like a ground foe (03 §2.3). */
export function stanceNow(world: World, enemy: EnemyState): Stance {
  const stance = foeDef(enemy.foe).stance;
  if (stance === "low-air" && (hasStatus(enemy.statuses, "grounded", world.tick) || hasStatus(enemy.statuses, "freeze", world.tick))) return "ground";
  return stance;
}

/** Tenacity in % (03 §2.3): big 15, elite +15, general 35, plus aura; cap 80. */
export function tenacityFor(world: World, enemy: EnemyState): number {
  const def = foeDef(enemy.foe);
  const tiers = STATUS.tenacityPct;
  let pct = enemy.general ? tiers.general : "tier" in def && (def.tier === "heavy" || def.tier === "giant") ? tiers.big : tiers.small;
  if (enemy.elite) pct += tiers.eliteBonus;
  pct += auraPct(world, enemy, "tenacity");
  return pct > STATUS.tenacityCapPct ? STATUS.tenacityCapPct : pct;
}

/** Slow cap in % for this foe (03 §2.3): 60, generals 45. */
export const slowCapFor = (enemy: EnemyState): number => (enemy.general ? STATUS.slowCapPct.general : STATUS.slowCapPct.foe);

/** Movement speed after slows, in permille of the base (movement multiplies auras and fords on top). */
export function statusSpeedPm(world: World, enemy: EnemyState): number {
  if (!canMove(enemy.statuses, world.tick)) return 0;
  return 1000 - slowPct(enemy.statuses, world.tick, slowCapFor(enemy)) * 10;
}

/** Non-typing damage share, permille (G8: 200–350, hard cap 400; over it, lower numbers in our-side.ts, never add rules, 03 §1). */
export function ourSideSharePm(world: World): number {
  const stats = world.stats;
  const total = stats.damageWord + stats.damageSkill + stats.damageOurSide;
  return total > 0 ? Math.round((stats.damageOurSide * 1000) / total) : 0;
}

/** Share of foe lifetime under our hard control, permille (G15 reads it per run; ≤ 350). */
export const hardControlSharePm = (world: World): number =>
  world.stats.foeTicks > 0 ? Math.round((world.stats.hardControlTicks * 1000) / world.stats.foeTicks) : 0;

// ── Applying ────────────────────────────────────────────────────────────────

function targetPos(world: World, target: EntityRef): readonly [number, number] {
  switch (target.kind) {
    case "enemy": {
      const enemy = world.enemies.list[target.slot];
      return enemy ? [uToM(enemy.x), uToM(enemy.z)] : [0, 0];
    }
    case "unit": {
      const unit = world.units.list[target.slot];
      return unit ? [uToM(unit.x), uToM(unit.z)] : [0, 0];
    }
    case "trap":
    case "house": {
      const slot = world.slots[target.slot];
      return slot ? [uToM(slot.x), uToM(slot.z)] : [0, 0];
    }
    case "guide":
      return world.map.dais.guideAt;
    case "hero":
      return world.map.dais.center;
  }
}

function announce(world: World, target: EntityRef, id: StatusId, on: boolean, ticks: number): void {
  const [x, z] = targetPos(world, target);
  emit(world, { type: "status", target, status: id, on, durationMs: ticksToMs(ticks), x, z });
}

/** Ticks of hard control still to run on this set from `tick` (ours only: our control on a foe). */
function hardLeft(set: StatusSet, tick: number, oursOnly = false): number {
  let end = tick;
  for (const entry of set.list) if (HARD.has(entry.id) && (!oursOnly || entry.ours) && entry.until > end) end = entry.until;
  return end - tick;
}

/** Hard control after diminishing returns and Vững; 0 when resisted. */
function hardTicks(world: World, set: StatusSet, ticks: number): number {
  const tick = world.tick;
  for (const entry of set.list) if (entry.id === "steadfast" && entry.until > tick) return 0;
  if (set.hardHits >= STATUS.hardFactorPm.length) {
    // The third control still runs; Vững follows it.
    if (hardLeft(set, tick) > 0) return 0;
    set.hardHits = 0;
  }
  if (tick >= set.hardWindowEnds) {
    set.hardHits = 0;
    set.hardWindowEnds = tick + msToTicks(STATUS.hardWindowMs);
  }
  const granted = Math.round((ticks * STATUS.hardFactorPm[set.hardHits]!) / 1000);
  const left = hardLeft(set, tick);
  // Nothing past the control already running: no change, no diminishing step.
  if (granted <= left) return 0;
  set.hardHits += 1;
  if (set.hardHits >= STATUS.hardFactorPm.length) {
    // Vững 4 s from the end of this third control (03 §2.3).
    const end = tick + granted;
    set.list.push(entryOf("steadfast", end, end + msToTicks(STATUS.steadfastMs), 0, false, "status", null));
  }
  return granted;
}

function entryOf(id: StatusId, start: number, until: number, value: number, ours: boolean, by: KillSource, source: EntityRef | null): StatusEntry {
  return { id, until, value, stacks: 1, start, done: 0, shown: false, ours, by, source };
}

/** Applies a status with 03 §2.3 stacking rules and emits a `status` event when it turns on; returns the ticks it got (0: resisted). */
export function applyStatus(world: World, target: EntityRef, set: StatusSet, status: ApplyStatus): number {
  const tick = world.tick;
  const id = status.id;
  let ticks = msToTicks(status.durationMs);
  if (ticks <= 0) return 0;
  const value = status.value ?? 0;
  const ours = status.self !== true && target.kind === "enemy";
  if (TENACITY.has(id) && status.self !== true) {
    const tenacity = status.tenacityPct ?? 0;
    ticks = Math.round((ticks * (100 - (tenacity > STATUS.tenacityCapPct ? STATUS.tenacityCapPct : tenacity))) / 100);
  }
  if (target.kind === "enemy") {
    const enemy = world.enemies.list[target.slot];
    if (id === "grounded") {
      // Only low flyers come down; generals for half the time (03 §2.3).
      if (!enemy || foeDef(enemy.foe).stance !== "low-air") return 0;
      if (enemy.general) ticks = Math.round((ticks * STATUS.grounded.generalPm) / 1000);
    }
  }
  if (HARD.has(id) && status.self !== true) ticks = hardTicks(world, set, ticks);
  if (ticks <= 0) return 0;
  const until = tick + ticks;
  const wasOn = hasStatus(set, id, tick);
  const by = status.by ?? "status";
  const source = status.source ?? null;

  let entry: StatusEntry | undefined;
  if (BY_VALUE.has(id)) entry = set.list.find((item) => item.id === id && item.value === value && item.start <= tick);
  else if (id === "burn") entry = set.list.find((item) => item.id === id && item.by === by && item.start <= tick);
  else if (id !== "regen") entry = set.list.find((item) => item.id === id && item.start <= tick);
  if (entry) {
    if (until > entry.until) entry.until = until;
    if (id === "burn") {
      if (entry.stacks < STATUS.burn.stacks) entry.stacks += 1;
      if (value > entry.value) entry.value = value;
    } else if (STRONGEST.has(id) && value > entry.value) entry.value = value;
  } else {
    entry = entryOf(id, tick, until, value, ours && HARD.has(id), by, source);
    set.list.push(entry);
  }
  if (!wasOn) announce(world, target, id, true, entry.until - tick);
  entry.shown = true;
  return ticks;
}

/** Removes every entry of `id` (Lửa xóa Ướt, a unit rising); emits the off event if one was on. */
export function clearStatus(world: World, target: EntityRef, set: StatusSet, id: StatusId): void {
  const wasOn = hasStatus(set, id, world.tick);
  for (let index = set.list.length - 1; index >= 0; index -= 1) if (set.list[index]!.id === id) set.list.splice(index, 1);
  if (wasOn) announce(world, target, id, false, 0);
}

/** Drops every status (a unit falls); no events. */
export function resetStatusSet(set: StatusSet): void {
  set.list.length = 0;
  set.hardHits = 0;
  set.hardWindowEnds = 0;
}

// ── Stepping ────────────────────────────────────────────────────────────────

/** Damage type of a damage-over-time status (03 §2.3: Cháy is P magic, Độc is C true). */
const dotType = (id: StatusId): DamageType | null => (id === "burn" ? "magic" : id === "poison" ? "true" : null);

/** Damage over time due this tick: at the end of each second it has run (a 4 s burn ticks 4 times). */
function dotDue(entry: StatusEntry, tick: number): number {
  if (dotType(entry.id) === null || tick < entry.start || tick >= entry.until) return 0;
  if ((tick - entry.start + 1) % TICK_HZ !== 0) return 0;
  return entry.value * entry.stacks;
}

/** Heal over time due this tick after the heal cut `pct` (regen: `value` spread evenly; running totals keep cut heals exact). */
function hotDue(entry: StatusEntry, tick: number, pct: number): number {
  if (entry.id !== "regen" || tick < entry.start) return 0;
  const length = entry.until - entry.start;
  const elapsed = tick + 1 - entry.start;
  const total = Math.floor((entry.value * (elapsed < length ? elapsed : length)) / length);
  const due = Math.floor((total * pct) / 100) - Math.floor((entry.done * pct) / 100);
  entry.done = total;
  return due;
}

/** Shows scheduled entries that start now, expires the ended ones with their off events. */
function tidy(world: World, target: EntityRef, set: StatusSet): void {
  const tick = world.tick;
  for (const entry of set.list) {
    if (!entry.shown && entry.start <= tick && entry.until > tick) {
      entry.shown = true;
      if (!set.list.some((other) => other !== entry && other.id === entry.id && other.shown && isActive(other, tick))) announce(world, target, entry.id, true, entry.until - tick);
    }
  }
  let index = 0;
  while (index < set.list.length) {
    const entry = set.list[index]!;
    if (entry.until > tick + 1) {
      index += 1;
      continue;
    }
    // Ends before the next tick.
    set.list.splice(index, 1);
    if (entry.shown && !set.list.some((other) => other.id === entry.id && other.until > tick + 1 && other.start <= tick + 1)) announce(world, target, entry.id, false, 0);
  }
}

/** Ticks damage over time, expires entries, emits `status` off events; counts G15 time on foes. */
export function stepStatus(world: World): void {
  const tick = world.tick;
  const stats = world.stats;
  for (const enemy of world.enemies.list) {
    if (!enemy.alive) continue;
    const set = enemy.statuses;
    set.life += 1;
    stats.foeTicks += 1;
    if (hardLeft(set, tick, true) > 0) {
      set.hardTicks += 1;
      stats.hardControlTicks += 1;
    }
    if (set.list.length === 0) continue;
    const ref: EntityRef = { kind: "enemy", slot: enemy.slot, serial: enemy.serial };
    for (const entry of set.list) {
      // Damage over time on a foe with no named source is the Fire Dragon's (Lửa Chữ, Phun Lửa).
      const dot = dotDue(entry, tick);
      if (dot > 0 && enemy.alive) damageEnemy(world, enemy, dot, dotType(entry.id)!, entry.source ?? HERO_REF, entry.by);
      const hot = hotDue(entry, tick, healPct(set, tick));
      if (hot > 0 && enemy.alive) enemy.hp = enemy.hp + hot > enemy.hpMax ? enemy.hpMax : enemy.hp + hot;
    }
    tidy(world, ref, set);
  }

  for (const unit of world.units.list) {
    const set = unit.statuses;
    if (set.list.length === 0) continue;
    const ref: EntityRef = { kind: "unit", slot: unit.index };
    for (const entry of set.list) {
      if (unit.downUntil >= 0) break;
      const dot = dotDue(entry, tick);
      if (dot > 0) damageUnit(world, unit.index, dot, dotType(entry.id)!, entry.source ?? ref);
      const hot = hotDue(entry, tick, healPct(set, tick));
      if (hot > 0) healUnit(world, unit, hot, false);
    }
    tidy(world, ref, set);
  }

  const hero = world.hero;
  if (hero.statuses.list.length > 0) {
    const ref: EntityRef = { kind: "hero" };
    for (const entry of hero.statuses.list) {
      const dot = dotDue(entry, tick);
      if (dot > 0) damageHero(world, dot, dotType(entry.id)!, entry.source ?? ref);
      const hot = hotDue(entry, tick, healPct(hero.statuses, tick));
      if (hot > 0) healHero(world, hot, false);
    }
    tidy(world, ref, hero.statuses);
  }
}

/** Heals the Fire Dragon by `amount`, poison and curse halving it unless `cut` is false (already cut); returns HP gained. Defeat stays final. */
export function healHero(world: World, amount: number, cut = true): number {
  const hero = world.hero;
  if (amount <= 0 || hero.hp <= 0) return 0;
  const heal = cut ? Math.floor((amount * healPct(hero.statuses, world.tick)) / 100) : amount;
  const gained = hero.hp + heal > hero.hpMax ? hero.hpMax - hero.hp : heal;
  hero.hp += gained;
  return gained;
}

/** Heals Bạch Long while he stands (no statuses on the guide in M0). */
export function healGuide(world: World, amount: number): number {
  const guide = world.guide;
  if (amount <= 0 || guide.downUntil >= 0) return 0;
  const gained = guide.hp + amount > guide.hpMax ? guide.hpMax - guide.hp : amount;
  guide.hp += gained;
  return gained;
}
