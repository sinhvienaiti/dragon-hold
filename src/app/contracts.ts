/**
 * Contracts between the app and the presentation lanes (view, ui, audio,
 * learning). Every presenter reads the world, gets each frame's drained sim
 * events, and sends player intent back only as SimCommands through a sink.
 * Three units are metres; sim u convert with uToM (src/sim/fixed.ts).
 * Owner: architect for M0a setup, integrator afterwards (LANES.md).
 */
import type { SimCommand, SimEvent } from "../content/types";
import type { World } from "../sim/world";

export interface FrameInfo {
  /** Real seconds since the last frame (clamped by the loop). */
  readonly dt: number;
  /** World seconds since the last frame: dt × time scale (hit-stop 0.05, fast-forward 2). */
  readonly worldDt: number;
  /** 0–1 between the last sim tick and the next, for interpolation. */
  readonly alpha: number;
  /** performance.now() of this frame, ms. */
  readonly now: number;
}

/** A view, UI or audio part. Order each frame: onEvents (this frame's batch), then frame. */
export interface Presenter {
  onEvents(events: readonly SimEvent[], world: World): void;
  frame(world: World, info: FrameInfo): void;
  dispose(): void;
}

/** Where player intent goes; the app stamps the tick and feeds the sim. */
export type CommandSink = (command: SimCommand) => void;

/** Screen position of a world point in CSS pixels (tags, chips, numbers). */
export interface ScreenPoint {
  x: number;
  y: number;
  /** In front of the camera and inside the viewport. */
  visible: boolean;
}

/** Projects a world point in metres to the screen; writes into `out`. */
export type Projector = (xM: number, yM: number, zM: number, out: ScreenPoint) => ScreenPoint;

/** Device tier: changes how things are drawn, never the rules (00 D10, 05 §8). */
export type Quality = "low" | "medium" | "high" | "ultra";

/** Command actions from the key table (rules.ts KEYS) that presenters may claim before the sim sees them. */
export interface ActionHandler {
  /** Returns true when it used the action (camera, placement mode, panels). */
  handleAction(action: string): boolean;
}
