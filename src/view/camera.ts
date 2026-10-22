/**
 * Free camera (05 §3): always looks at the dais; right-drag tilts 40–75° and
 * yaws 360°; wheel zooms 0.6–1.3; keys from rules.ts KEYS (arrows, Alt + ↑/↓,
 * Alt + 0 reset then 75° overview). Never moves by itself in a wave; shake
 * ≤ 12 px on the canvas only. Source to adapt: Space src/defense/view/camera.ts.
 * Owner: view-terrain (LANES.md). Stub: signatures fixed, body TODO.
 */
import type { PerspectiveCamera } from "three";
import type { ActionHandler } from "../app/contracts";
import type { MapDef } from "../content/types";

export interface CameraRig extends ActionHandler {
  readonly yawDeg: number;
  readonly pitchDeg: number;
  readonly zoom: number;
  update(dt: number): void;
  /** Trauma-based shake from kit/feedback, in pixels (≤ 12). */
  shake(pixels: number): void;
  reset(): void;
  dispose(): void;
}

export function createCameraRig(camera: PerspectiveCamera, map: MapDef, dom: HTMLElement): CameraRig {
  // TODO(view-terrain)
  throw new Error("view/camera: not built yet (view-terrain lane)");
}
