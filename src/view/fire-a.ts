/**
 * Fire test A (31/10, docs/games/vfx/DRAGON_FIRE_DIAGNOSIS_2026-10-31.md §3 in the parent repo): the STRONG word hit's
 * impact and aftermath through one fire material (coverage + colour ramp + erosion, a normal body and an additive
 * glow), lit smoke under the fire, the painted 038 scorch and a painted halo. Release, travel, timing, hit-stop and
 * the damage number stay as in round 10.
 *
 * On by default on this branch; `?fire=r10` draws round 10's strong hit (the side-by-side captures). The grade's
 * yellow shoulder is a test-bench switch only (view/fire-bench.ts, `grade=shoulder`).
 * Owner: view-crowd-fx (LANES.md).
 */
import * as THREE from "three";

/** The impact's hot colour (contact ring, embers): a saturated hot yellow for the pastel fireHot (peach once lit). */
export const FIRE_A_HOT = new THREE.Color("#ffb838");
/** The painted scorch's colour: a dark neutral char (a warm brown read as a brown silhouette, black as a hole). */
export const FIRE_A_SCORCH = new THREE.Color("#3b3633");

function fromUrl(): boolean {
  try {
    return new URLSearchParams(globalThis.location?.search ?? "").get("fire") !== "r10";
  } catch {
    return true;
  }
}

export const FIRE_A = { on: fromUrl() };
