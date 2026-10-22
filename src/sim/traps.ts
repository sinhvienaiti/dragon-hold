/**
 * Traps (03 §7): floor traps hit ground and grounded foes, posts reach low
 * air; one shot then recharge, except continuous Gai Chông; auto trigger by
 * foes in the area (M0 has no trigger words, 00 D13). Resonance: word hits on
 * foes inside a recharging trap cut its recharge (03 §10.2).
 * Owner: sim-ourside (LANES.md). Stub: signatures fixed, bodies TODO.
 */
import type { Grade, TrapId } from "../content/types";
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
}

export interface TrapsState {
  readonly list: TrapState[];
}

export function createTrapsState(init: WorldInit): TrapsState {
  return { list: [] };
}

/** Builds the trap in `slot` (shop calls it after paying). */
export function buildTrap(world: World, slot: number, trap: TrapId): void {
  // TODO(sim-ourside)
}

/** Continuous effects, triggers, recharges; emits `trap-trigger`. */
export function stepTraps(world: World): void {
  // TODO(sim-ourside)
}

/** A word hit `enemy`: recharging traps whose area holds it lose 0.8 s (1.2 s on Chớp, Hoàn hảo), capped at 50 % a cycle. */
export function resonate(world: World, enemy: EnemyState, grade: Grade): void {
  // TODO(sim-ourside)
}
