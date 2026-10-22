/**
 * The frame loop: fixed 60 Hz sim steps from an accumulator (at most 5 per
 * frame), world time scaled by hit-stop and fast-forward, keys never eaten
 * (they enter the sim on the next step even during hit-stop, 05 §5).
 * Owner: integrator (LANES.md). Stub: signatures fixed, body TODO.
 */
import type { FrameInfo } from "./contracts";

export interface LoopHooks {
  /** One sim tick. */
  step(): void;
  /** Once a frame after the steps. */
  frame(info: FrameInfo): void;
  /** World time scale for this frame (hit-stop, fast-forward); 1 by default. */
  timeScale?(now: number): number;
}

export interface Loop {
  start(): void;
  stop(): void;
  /** Paused loops render but do not step (focus loss, menu). */
  setPaused(paused: boolean): void;
}

export function createLoop(hooks: LoopHooks): Loop {
  // TODO(integrator): kit/platform runFrameLoop.
  throw new Error("app/loop: not built yet (integrator)");
}
