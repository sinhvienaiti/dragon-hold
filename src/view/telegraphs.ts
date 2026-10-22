/**
 * Ground telegraphs from `telegraph` events: enemy warnings red #FF4A4A
 * filling over the wind-up (≥ 0.5 s), ours (Thiên Hỏa) pale orange with a
 * white rim, never red (05 §6); aura rings in withered yellow #C8D24A.
 * Owner: view-crowd-fx (LANES.md). Stub: signatures fixed, body TODO.
 */
import type { Presenter } from "../app/contracts";
import type { Stage } from "./stage";
import type { TerrainView } from "./terrain";

export function createTelegraphs(stage: Stage, terrain: TerrainView): Presenter {
  // TODO(view-crowd-fx)
  throw new Error("view/telegraphs: not built yet (view-crowd-fx lane)");
}
