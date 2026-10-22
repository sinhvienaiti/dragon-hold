/**
 * Run flow (01 §1.2, 00 §4.5): prep (Bày binh) → Enter → warning 6 s → wave
 * → break (20 s Normal, 15 s Hard, Easy waits for Enter) → … → victory.
 * A wave ends when every foe of it is gone; the last one wins the stage
 * with stars by Fire Dragon HP (01 §5). Shift + Enter calls the next wave early.
 * Owner: sim-battle (LANES.md). Stub: signatures fixed, bodies TODO.
 */
import type { WorldInit, World } from "./world";

export interface WaveState {
  /** Next wave to warn about, 1-based. */
  next: number;
  /** Per wave (index n − 1): groups still to spawn, foes alive, ended (1). */
  readonly pending: number[];
  readonly alive: number[];
  readonly ended: number[];
  /** Tick the running wave started (−1: none). */
  startedAt: number;
}

export function createWaveState(init: WorldInit): WaveState {
  const count = init.stage.waves.length;
  return { next: 1, pending: new Array<number>(count).fill(0), alive: new Array<number>(count).fill(0), ended: new Array<number>(count).fill(0), startedAt: -1 };
}

/** "start": prep ends, the first warning begins. */
export function startRun(world: World): void {
  // TODO(sim-battle): prep → warning, emit phase; reject outside prep.
}

/** "call-early" in a break: gold 2 per second left (max 40) and +5 rage (00 §4.5). */
export function callEarly(world: World): void {
  // TODO(sim-battle): pay through economy (reason "call-early"), rage through combat.
}

/** "continue": ends an Easy break that waits for Enter. */
export function continueBreak(world: World): void {
  // TODO(sim-battle)
}

/** Phase timers, wave start (schedules the wave's groups with spawn), wave end, victory and stars. */
export function stepWaves(world: World): void {
  // TODO(sim-battle)
}
