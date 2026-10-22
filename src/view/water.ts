/**
 * River and stream water from MapDef.river (widths per point, shallows at the
 * ford): animated surface shader, banks, foam where lanes wade.
 * Owner: view-terrain (LANES.md). Stub: signatures fixed, body TODO.
 */
import type { Group } from "three";
import type { MapDef } from "../content/types";
import type { TerrainView } from "./terrain";

export interface WaterView {
  readonly group: Group;
  update(dt: number): void;
  dispose(): void;
}

export function buildWater(map: MapDef, terrain: TerrainView): WaterView {
  // TODO(view-terrain)
  throw new Error("view/water: not built yet (view-terrain lane)");
}
