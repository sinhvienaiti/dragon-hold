/**
 * Gold in a run (00 §4.9, 03 §3): 200 at start plus a budget of
 * 900 × f_lanes × f_type split 60 % kills (by threat share; a cluster pays
 * once), 25 % wave ends (each +10 % on the last), 15 % call-early,
 * learn-ahead and events. Integers; gold never goes below 0.
 * Owner: sim-ourside (LANES.md). Stub: signatures fixed, bodies TODO.
 */
import { ECONOMY, stageGoldBudget } from "../content/rules";
import type { GoldReason } from "../content/types";
import type { EnemyState, WorldInit, World } from "./world";

export interface EconomyState {
  gold: number;
  /** The stage budget besides the start gold, and what each pool has paid so far. */
  readonly budget: number;
  killPaid: number;
  waveEndPaid: number;
  otherPaid: number;
}

export function createEconomyState(init: WorldInit): EconomyState {
  const groundLanes = init.lanes.filter((lane) => !lane.sky).length;
  return { gold: ECONOMY.startGold, budget: stageGoldBudget(groundLanes, init.stage.type, init.stage.goldTypePct), killPaid: 0, waveEndPaid: 0, otherPaid: 0 };
}

/** Adds gold and emits `gold`. */
export function earn(world: World, amount: number, reason: GoldReason): void {
  // TODO(sim-ourside)
}

/** Takes gold if there is enough; emits `gold` and returns true. */
export function spend(world: World, amount: number, reason: GoldReason): boolean {
  // TODO(sim-ourside)
  return false;
}

/** Kill gold by threat share (cleanup calls it once per dead foe). */
export function onEnemyKilled(world: World, enemy: EnemyState): void {
  // TODO(sim-ourside)
}

/** Wave-end gold (waves calls it when a wave ends). */
export function payWaveEnd(world: World, wave: number): void {
  // TODO(sim-ourside)
}

/** "learn-ahead" in prep: +5 per word, at most +40 (00 §4.9). */
export function learnAhead(world: World, correct: number): void {
  // TODO(sim-ourside)
}

/** "review-card" in a break: right answers +10 gold, +2 XP (01 §6.5). */
export function reviewCard(world: World, correct: boolean): void {
  // TODO(sim-ourside)
}

/** Per-tick economy (Giếng Vàng later); M0 has none. */
export function stepEconomy(world: World): void {
  // TODO(sim-ourside)
}
