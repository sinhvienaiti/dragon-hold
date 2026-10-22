/**
 * Damage (00 §4.2, 03 §2.2) and the Fire Dragon's attacks (01 §2.3–2.4):
 * word strikes land 12 ticks after the last key; a dead target turns the
 * strike to the nearest worded foe within 4 m at 50 %; word damage ignores
 * armour; skills Phun Lửa, Thiên Hỏa, Long Hống, Viêm Đế; rage (Long Nộ);
 * Dragon level; foes' wind-ups and strikes on units, houses and Dragons.
 * Owner: sim-battle (LANES.md). Stub: signatures fixed, bodies TODO.
 */
import type { DamageType, EntityRef, Grade, HeroSkillId, KillSource, Vec2, WordKind } from "../content/types";
import type { EnemyState, WorldInit, World } from "./world";

/** A finished word's hit waiting to land. */
export interface WordStrike {
  landsAt: number;
  /** Target foe (slot, serial); null for words without a foe (skill words). */
  slot: number;
  serial: number;
  word: number;
  kind: WordKind;
  grade: Grade;
  /** M_q, M_c and the sum of bonuses, permille (00 §4.2). */
  mqPm: number;
  mcPm: number;
  bonusPm: number;
}

export interface CombatState {
  readonly strikes: WordStrike[];
  /** Per skill: tick it is ready again. */
  readonly readyAt: Record<HeroSkillId, number>;
  /** Long Nộ × 10 (01 §2.4). */
  rage: number;
  lastUltAt: number;
  /** Viêm Đế active until (−1: off). */
  infernoUntil: number;
  /** Urgent word used this wave. */
  urgentUsed: boolean;
}

export function createCombatState(init: WorldInit): CombatState {
  return { strikes: [], readyAt: { breath: 0, skyfire: 0, roar: 0, inferno: 0 }, rage: 0, lastUltAt: -1, infernoUntil: -1, urgentUsed: false };
}

/** Queues a word's hit for tick + 12 (called by words when a word completes). */
export function queueWordStrike(world: World, strike: Omit<WordStrike, "landsAt">): void {
  // TODO(sim-battle)
}

/** Alt + 1/2/5 (and the urgent word's Long Hống); `at` in metres, else the default target (01 §2.4). */
export function castSkill(world: World, skill: HeroSkillId, at?: Vec2): void {
  // TODO(sim-battle): cooldowns, rage, telegraph for Thiên Hỏa, events.
}

/** Strikes and skill impacts due this tick. */
export function stepWordHits(world: World): void {
  // TODO(sim-battle)
}

/** Foes' wind-ups (telegraph events) and strikes on their targets (01 §4.2). */
export function stepEnemyAttacks(world: World): void {
  // TODO(sim-battle)
}

/**
 * Deals damage to a foe: armour or resist by type (word ignores both), vulnerable
 * multipliers, lock protection keeps 1 HP (01 §3.3); emits `hit` and on 0 HP sets
 * alive = false, killedBy, and emits `death`. Returns the HP removed.
 */
export function damageEnemy(world: World, enemy: EnemyState, amount: number, type: DamageType, source: EntityRef, by: KillSource): number {
  // TODO(sim-battle)
  return 0;
}

/** Deals damage to the Fire Dragon (armour 20, resist 20 raw, 01 §2.2); rage +1 per 4 % lost; emits `hit`. */
export function damageHero(world: World, amount: number, type: DamageType, source: EntityRef): number {
  // TODO(sim-battle)
  return 0;
}

/** reduction = G / (G + 100), capped at 75 %, in permille (00 §4.2). */
export function reductionPm(armourG: number): number {
  if (armourG <= 0) return 0;
  const pm = Math.round((armourG * 1000) / (armourG + 100));
  return pm > 750 ? 750 : pm;
}

/** Rage, XP and level-up on a kill (01 §2.4–2.5); cleanup calls it once per dead foe. */
export function onEnemyKilled(world: World, enemy: EnemyState): void {
  // TODO(sim-battle)
}

/** Adds rage × 10 with chain-tier bonus, capped at 100 (01 §2.4); emits `rage`. */
export function addRage(world: World, x10: number): void {
  // TODO(sim-battle)
}

/** Adds Dragon XP and levels up (01 §2.5); emits `hero-level`. */
export function grantXp(world: World, xp: number): void {
  // TODO(sim-battle)
}
