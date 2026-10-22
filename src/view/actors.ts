/**
 * Maps sim actors to the crowd: foes by serial (spawn, move, death events),
 * placed traps, houses and units as placeholders; interpolates positions with
 * FrameInfo.alpha; heights from TerrainView.heightAt.
 * Owner: view-crowd-fx (LANES.md). Stub: signatures fixed, body TODO.
 */
import type { Presenter } from "../app/contracts";
import type { Stage } from "./stage";
import type { TerrainView } from "./terrain";

export function createActors(stage: Stage, terrain: TerrainView): Presenter {
  // TODO(view-crowd-fx)
  throw new Error("view/actors: not built yet (view-crowd-fx lane)");
}
