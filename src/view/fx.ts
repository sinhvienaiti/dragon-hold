/**
 * Combat VFX by feedback tier T0–T5 through kit/feedback's dragon profile
 * (05 §5–6): fireballs that land on the strike tick, breath cone, sky fire,
 * hit sparks and debris by material, numbers, hit-stop that never eats keys.
 * Source to adapt: Space src/defense/view/vfx.ts.
 * Owner: view-crowd-fx (LANES.md). Stub: signatures fixed, body TODO.
 */
import type { Presenter } from "../app/contracts";
import type { Stage } from "./stage";

export interface FxPresenter extends Presenter {
  /** World time scale the loop should run at this frame (hit-stop 0.05, else 1). */
  timeScale(now: number): number;
}

export function createFx(stage: Stage): FxPresenter {
  // TODO(view-crowd-fx)
  throw new Error("view/fx: not built yet (view-crowd-fx lane)");
}
