/**
 * Fire test C (31/10, owner: free assets only, "Cho tải và thử"): the STRONG word hit keeps round 10's impact peak
 * (its strongest frames, f0…~f+9: impact-burst v2 frames 11–19 at ×1.8, the white core, the crimson tongues, the
 * flashes and comets) and fixes what the two blind judges marked down after it:
 * - burn-out: from ~f+9 the same two fire sprites (pool impact-burst-c, flipbook mode fireC, round 10's atlas) shrink
 *   and cool to deep red and dark crimson with crisp edges (a rising threshold, never a see-through veil: no peach,
 *   pink, khaki or olive, no cross-fade into fog), gone by ~f+25 as round 10's;
 * - embers: a few strong CC0 Kenney sparks (flare_01, its faint halo cut), warm yellow-orange, additive, short-lived,
 *   under gravity, each streak turned along its throw, for round 10's dark-tailed "candy-corn" embers;
 * - smoke: two small puffs behind the foe from f+12, rising, gone by ~2 s: CC0 Kenney smoke_07/08/04 made dense and lit
 *   (smoke-c), or test B's cel smoke with `smoke=cel` (smoke-cel-b); no round-10 density smoke (twice the fire, over
 *   the foe for ~50 frames);
 * - ground: a procedural shockwave ring (mark kind 9: 0.2 → 1.0 of its size in ~0.2 s, thinning away) and a burnt
 *   ground mark from Kenney's CC0 scorch_01/02 in test B's decal material (warm brown, cooling ember edge, after
 *   the fire reaches the ground, gone by ~2.5 s); no round-10 dark oval, soot discs or radial scorch.
 * Release, travel, timing, hit-stop and the damage number stay as round 10.
 *
 * The dragon fire for the demo since 01/11 (owner 31/10 "take the best dragon fire we have for now"; two fresh blind
 * judges put C first: 7 and 7.5, round 10 6.5 and 6, test B 5 and 5.5): on with no `?fire=` at all (or `?fire=c`);
 * `?fire=r10` draws round 10, `?fire=a` test A, `?fire=b` test B, for comparison. Reduced motion (Settings › Graphics,
 * VFX_STANDARD §3.8) softens it in fx.ts: fewer, dimmer sparks, one smoke puff, a smaller and dimmer shockwave with a
 * shorter sweep; the burst ×0.8 in size and its flashes ×0.6 in brightness and ×0.8 in size, as round 10's.
 * Owner: view-crowd-fx (LANES.md).
 */
import * as THREE from "three";

/** The burn-out: from this share of the impact sprite's life (round 10's cooled from 0.3) to its end. */
export const FIRE_C_BURN = {
  /** Round 10's life (frames 11–19 at ×1.8 ≈ 25 frames); the burn-out starts at ~f+9 and ends with it. */
  start: 0.36,
  /** The impact's size × round 10's (round 10's peak as it is; fire-gates reads it at ~4.5× the foe's height). */
  size: 1.0,
  /** How far the burning-out fire goes behind the foe (m × √k, depth only, eased in over its first quarter). */
  behind: 0.5,
  /** The last clip frame drawn while it burns out (round 10 stopped at 19, before the clip's hollow ring). */
  lastFrame: 19,
} as const;

/** Sizes in metres at the play camera's scale k = 1 (fx.ts multiplies by k or √k), tuned on the bench. */
export const FIRE_C_SIZE = {
  /** A spark sprite's cell (flare_01's dot and streak fill ~0.55 of it). */
  spark: 2.0,
  /** The smoke puff billboard's height (test B's cel smoke, its puff ~0.6 of the cell at its largest). */
  smoke: 1.9,
  /** The shockwave's diameter at the end of its growth. */
  shock: 8.0,
  /** The scorch cell on the ground (the Kenney splat fills ~0.3–0.35 of it: ~3 m, past the foe's feet). */
  scorch: 9.5,
} as const;

/** Colours (sRGB hex; THREE.Color makes them linear). */
export const FIRE_C_SPARK = new THREE.Color("#ffb347");
export const FIRE_C_SPARK_HOT = new THREE.Color("#ffd27a");
/** A warm ash brown, light and low in saturation: darker ones went through the grade's toe to a saturated dark brown
 * (the "brown silhouette" the judges marked down) and, at dusk, to near black. */
export const FIRE_C_SCORCH = new THREE.Color("#86766a");
/** The shockwave's hot leading edge and the fire band behind it (dry ground); spray on water. */
export const FIRE_C_SHOCK_EDGE = new THREE.Color("#ffbe48");
export const FIRE_C_SHOCK_DUST = new THREE.Color("#c9471b");
/** The smoke's tint over test B's cel puff (its top white): a warm mid grey with a lighter top. */
export const FIRE_C_SMOKE = new THREE.Color("#ddd6cf");

/**
 * The scene's light on the ground against the day map's (the stage's sky 1.55 and key 3.3): scales test C's unlit
 * scorch and smoke, so at dusk burnt ground is darker than the grass and the smoke is not a glowing white cloud.
 */
export function sceneLight(sky: number, key: number): number {
  return Math.min(1, Math.max(0.55, 0.4 * (sky / 1.55) + 0.6 * (key / 3.3)));
}
export const FIRE_C_SHOCK_SPRAY = new THREE.Color("#dfe9ee");

/** The comparison switches that turn C off; anything else (no `fire`, `fire=c`) plays C, the default. */
export const FIRE_OTHERS = ["r10", "a", "b"] as const;

/** True unless the URL asks for another fire (`?fire=r10|a|b`). */
export function fireCFromSearch(search: string): boolean {
  try {
    const fire = new URLSearchParams(search).get("fire");
    return !(FIRE_OTHERS as readonly (string | null)[]).includes(fire);
  } catch {
    return true;
  }
}

function fromUrl(): boolean {
  return fireCFromSearch(globalThis.location?.search ?? "");
}

export const FIRE_C = { on: fromUrl(), celSmoke: celSmoke() };

function celSmoke(): boolean {
  try {
    return new URLSearchParams(globalThis.location?.search ?? "").get("smoke") === "cel";
  } catch {
    return false;
  }
}
