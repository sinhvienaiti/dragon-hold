/**
 * Procedural ground for the grey box (05 §2, §3): painted heightfield from
 * MapDef.terrain (seed, relief), banks carved for the river, lanes flattened,
 * 40 m skirt. Source to adapt: Space src/defense/view/{terrain,painter}.ts.
 * Owner: view-terrain (LANES.md). Stub: signatures fixed, body TODO.
 */
import type { Group } from "three";
import type { Quality } from "../app/contracts";
import type { MapDef } from "../content/types";

export interface TerrainView {
  readonly group: Group;
  /** Ground height in metres at (x, z) metres, bridge decks included; actors stand on it. */
  heightAt(xM: number, zM: number): number;
  dispose(): void;
}

export function buildTerrain(map: MapDef, quality: Quality): TerrainView {
  // TODO(view-terrain)
  throw new Error("view/terrain: not built yet (view-terrain lane)");
}
