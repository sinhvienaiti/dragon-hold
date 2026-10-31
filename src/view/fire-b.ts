/**
 * Fire test B (owner 31/10 "Làm thử B"; DRAGON_FIRE_DIAGNOSIS_2026-10-31 §2 option B, parent repo): the STRONG word
 * hit's impact and aftermath from the owner-approved transparent cel clips (FIREFLY_VFX_LIST §5):
 * - impact: impact-cel v2 (anime burst: flash, starburst, hollow ring, break-up) with its real alpha, blended
 *   normally, recoloured offline through a heat ramp (white heart ≤ ~25 % of the radius, then yellow, orange, crimson;
 *   the khaki hollow cut out), stepped frames (cel), ended by the clip's own break-up (no fade; the shader keeps a
 *   toon fade in thirds for a sprite given one); an additive orange halo under it for heat (High has no bloom).
 *   About 1.6–2.2× the foe's height at its peak, centred on the struck point; its first ~4 frames (the white ball)
 *   drawn over the foe, then just behind the foe's middle so the foe stands in front of the starburst.
 * - smoke: smoke-cel v2 (cel puff, warm grey, no outline) rising from the burn spot from f+12, behind the foe and the
 *   fire, no larger than the fire, gone (shrunk) before the clip's flat-top cells.
 * - scorch: the 038 painting as a soft burnt-ground mark: warm dark brown (never black), a glowing ember edge that
 *   cools, appearing under the fire as it reaches the ground, shrinking away by ~2.5 s.
 * Release, travel, timing, hit-stop and the damage number stay as round 10 / test A.
 *
 * `?fire=b` turns it on (test A stays the default on this branch, `?fire=r10` round 10).
 * Owner: view-crowd-fx (LANES.md).
 */
import * as THREE from "three";

/** Sizes in metres at the play camera's scale k = 1 (fx.ts multiplies by k), tuned on the bench (dh-fire-bench). */
export const FIRE_B_SIZE = {
  /** The impact billboard's height (its 256-px cell); the burst's equivalent diameter at its peak is ~0.54 of it. */
  burst: 2.75,
  /** The smoke billboard's height (its cell; the puff fills ~0.6 of it at its largest). */
  smoke: 1.8,
  /** The scorch's diameter on the ground. */
  scorch: 2.7,
} as const;

/**
 * The burst plays from cell 6 (a full white ball with its first rays) through the starburst to cell 22 at ×1.75 the
 * clip's 24 fps (~0.40 s), then the hollow ring and its break-up (cells 23–28) at ×1.2 (~0.21 s: the thin last ring
 * read as a hoop when it lingered), then it is gone. Cells 6–8 (~4 frames) are drawn over the foe (the hit flash).
 */
export const FIRE_B_CLIP = { frame: 6, frontTo: 8, burstTo: 22, rate: 1.75, ringRate: 1.2 } as const;
/**
 * The white ball's depth lift (m × √k, toward the eye): in front of the whole foe for its first ~4 frames, so the
 * white heart is seen at the hit (behind the foe its body hid it); then the burst goes behind the foe.
 */
export const FIRE_B_FRONT_LIFT = 1.2;
/**
 * The burst's centre sits this far over the struck point along the camera's up (m × k), so its white heart shows
 * over the foe's head: the foe stands in front of the burst (its near half over it), and centred its body hid the
 * heart.
 */
export const FIRE_B_RAISE = 0.35;

/** The scorch's colours (linear-light values are made by THREE.Color from these sRGB hex codes). */
export const FIRE_B_SCORCH = new THREE.Color("#604e42");
export const FIRE_B_EMBER = new THREE.Color("#ff6a1a");

function fromUrl(): boolean {
  try {
    return new URLSearchParams(globalThis.location?.search ?? "").get("fire") === "b";
  } catch {
    return false;
  }
}

export const FIRE_B = { on: fromUrl() };
