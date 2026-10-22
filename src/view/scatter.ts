/**
 * Pine-river scatter for the grey box: primitive placeholder trees, rocks and
 * bushes (cones, spheres; BatchedMesh or instancing), kept off lanes, slots,
 * water and the dais; impostor ring outside the play area. Real props come
 * as the owner's GLB later.
 * Owner: view-terrain (LANES.md). Stub: signatures fixed, body TODO.
 */
import type { Group } from "three";
import type { Quality } from "../app/contracts";
import type { MapDef } from "../content/types";
import type { TerrainView } from "./terrain";

export interface ScatterView {
  readonly group: Group;
  dispose(): void;
}

export function buildScatter(map: MapDef, terrain: TerrainView, quality: Quality): ScatterView {
  // TODO(view-terrain)
  throw new Error("view/scatter: not built yet (view-terrain lane)");
}
