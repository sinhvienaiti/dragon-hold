/**
 * Spawning (02 §5.2–5.5): a wave's groups queue at their gates, gaps scaled
 * by 1000 / k_E and difficulty; one group per gate every 1.5 s; lanes start
 * ≥ 0.6 s apart; the live cap holds groups at the gate (00 §4.8, D10).
 * Clusters spawn together with 0.5 m jitter from the `spawn` RNG stream.
 * Owner: sim-battle (LANES.md). Stub: signatures fixed, bodies TODO.
 */
import type { FoeId, SpawnShape, WaveDef } from "../content/types";
import type { EnemyState, WorldInit, World } from "./world";

export interface QueuedGroup {
  /** Tick it may leave the gate. */
  at: number;
  wave: number;
  lane: number;
  shape: SpawnShape;
  foe: FoeId;
  count: number;
  elite: boolean;
}

export interface SpawnState {
  readonly queue: QueuedGroup[];
  /** Per lane: the earliest tick its gate may send the next group. */
  readonly gateFreeAt: number[];
  /** Next swarm cluster id. */
  nextCluster: number;
}

export function createSpawnState(init: WorldInit): SpawnState {
  return { queue: [], gateFreeAt: init.lanes.map(() => 0), nextCluster: 1 };
}

/** Queues every group of `wave` (called by waves at wave start). */
export function scheduleWave(world: World, wave: WaveDef): void {
  // TODO(sim-battle)
}

/** Releases due groups that fit under the live cap. */
export function stepSpawn(world: World): void {
  // TODO(sim-battle)
}

/** One foe at its gate on `lane`, HP by W × 90 × g(c) × difficulty (00 §4.1); emits `spawn`. Null at the live cap. */
export function spawnFoe(world: World, foe: FoeId, lane: number, wave: number, options: { elite?: boolean; cluster?: number; lateral?: number } = {}): EnemyState | null {
  // TODO(sim-battle): allocEnemy, fill from ENEMIES / GENERALS, place on the lane.
  return null;
}
