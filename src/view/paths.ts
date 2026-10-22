/**
 * Dirt paths along MapDef.lanes (decals or painted ground), the bridge deck
 * as a placeholder primitive, faint sky-lane markers, slot ghosts shown only
 * while placing or in a break (05 §2.1).
 * Owner: view-terrain (LANES.md). Stub: signatures fixed, body TODO.
 */
import type { Group } from "three";
import type { MapDef } from "../content/types";
import type { TerrainView } from "./terrain";

export interface PathsView {
  readonly group: Group;
  /** Shows or hides the slot markers (placement mode, breaks). */
  showSlots(visible: boolean, highlight?: readonly number[]): void;
  dispose(): void;
}

export function buildPaths(map: MapDef, terrain: TerrainView): PathsView {
  // TODO(view-terrain)
  throw new Error("view/paths: not built yet (view-terrain lane)");
}
