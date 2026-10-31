// Fire test C is the dragon fire for the demo since 01/11 (owner 31/10): on with no `?fire=`, the others only when
// asked for; Settings › Reduced motion reaches it (VFX_STANDARD §3.8: soften, never drop what marks the hit).
import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";
import { FIRE_A } from "../../src/view/fire-a";
import { FIRE_B } from "../../src/view/fire-b";
import { FIRE_C, FIRE_C_SIZE, fireCFromSearch } from "../../src/view/fire-c";
import type { FlipbookId, FlipbookMeta, FlipbookPool } from "../../src/view/flipbook";
import { FxCore, seededRandom } from "../../src/view/fx";

// kit textures() paints on a canvas: a canvas that paints nothing is enough here.
beforeAll(() => {
  const g = globalThis as unknown as { document?: unknown };
  g.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => null }) };
});

describe("the default dragon fire", () => {
  it("is test C with no fire in the URL (or fire=c); r10, a and b turn it off for a comparison", () => {
    expect(fireCFromSearch("")).toBe(true);
    expect(fireCFromSearch("?seed=7&title=0")).toBe(true);
    expect(fireCFromSearch("?fire=c")).toBe(true);
    expect(fireCFromSearch("?fire=r10")).toBe(false);
    expect(fireCFromSearch("?fire=a")).toBe(false);
    expect(fireCFromSearch("?fire=b")).toBe(false);
  });

  it("plays C and neither test A nor test B on a page with no fire switch", () => {
    expect(FIRE_C.on).toBe(true);
    expect(FIRE_C.celSmoke).toBe(false);
    expect(FIRE_A.on).toBe(false);
    expect(FIRE_B.on).toBe(false);
  });
});

/** A made-up atlas for pool `id`: what spawn() reads (the bench and the game load the real ones). */
function meta(id: FlipbookId, cols: number, rows: number, frames: number): FlipbookMeta {
  return { id, url: id + ".webp", cols, rows, frames, fps: 30, loop: false, blend: "normal", aspect: 1, pivot: [0.5, 0.5], start: 0, heading: 0, alpha: true };
}

interface Sprite {
  size: number;
  alpha: number;
  /** Tint × intensity, red channel. */
  red: number;
}

/** The pool's live sprites, read from its state rows (x y z, vx vy vz, size, …, life at 11, alpha at 14, rgb at 21). */
function sprites(pool: FlipbookPool): Sprite[] {
  const st = (pool as unknown as { state: Float32Array }).state;
  const out: Sprite[] = [];
  for (let o = 0; o < st.length; o += 31) if (st[o + 11]! > 0) out.push({ size: st[o + 6]!, alpha: st[o + 14]!, red: st[o + 21]! });
  return out;
}

interface Mark {
  size: number;
  grow: number;
  alpha: number;
}

/** The ground marks of `kind` (9: test C's shockwave) live in the core's mark pool. */
function marks(core: FxCore, kind: number): Mark[] {
  const pool = core.marks as unknown as { seed: Float32Array; size: Float32Array; grow: Float32Array; alpha: Float32Array; life: Float32Array };
  const out: Mark[] = [];
  for (let i = 0; i < pool.life.length; i += 1) {
    if (pool.life[i]! > 0 && Math.floor(pool.seed[i]!) === kind) out.push({ size: pool.size[i]!, grow: pool.grow[i]!, alpha: pool.alpha[i]! });
  }
  return out;
}

/** One STRONG (Perfect, T3) word bolt landing on a foe on dry ground, test C's atlases in. */
function strongHit(reduced: boolean): FxCore {
  const core = new FxCore("high", { reduced, random: seededRandom(3110) });
  const pools = core.flip.pools;
  pools["impact-burst-c"].attach(meta("impact-burst-c", 5, 5, 24), new THREE.Texture());
  pools["sparks-c"].attach(meta("sparks-c", 1, 1, 1), new THREE.Texture());
  pools["smoke-c"].attach(meta("smoke-c", 3, 1, 3), new THREE.Texture());
  pools["scorch-c"].attach(meta("scorch-c", 2, 1, 2), new THREE.Texture());
  core.update(1 / 60, 0, new THREE.Vector3(0, 60, 60), 600);
  // boltLanded: the burst (wordHit) and then the burnt ground, as a landed bolt draws them.
  (core as unknown as { boltLanded(at: THREE.Vector3, tier: number, dx: number, dz: number, strong: boolean): void }).boltLanded(new THREE.Vector3(0, 1, -15), 3, 0, -1, true);
  return core;
}

describe("test C under Settings › Reduced motion (VFX_STANDARD §3.8)", () => {
  let full: FxCore;
  let soft: FxCore;
  beforeAll(() => {
    full = strongHit(false);
    soft = strongHit(true);
  });

  it("draws test C, not round 10, for a strong word", () => {
    expect(sprites(full.flip.pools["impact-burst-c"]).length).toBe(2);
    expect(sprites(full.flip.pools["sparks-c"]).length).toBe(9);
    expect(sprites(full.flip.pools["smoke-c"]).length).toBe(2);
    expect(sprites(full.flip.pools["scorch-c"]).length).toBe(1);
    expect(marks(full, 9).length).toBe(2);
  });

  it("keeps the burst at 0.8 of its size", () => {
    const [a] = sprites(full.flip.pools["impact-burst-c"]);
    const [b] = sprites(soft.flip.pools["impact-burst-c"]);
    expect(b!.size / a!.size).toBeCloseTo(0.8, 5);
  });

  it("throws fewer, dimmer sparks (5 for 9, 0.6 bright)", () => {
    const a = sprites(full.flip.pools["sparks-c"]);
    const b = sprites(soft.flip.pools["sparks-c"]);
    expect(b.length).toBe(5);
    expect(Math.max(...b.map((s) => s.red)) / Math.max(...a.map((s) => s.red))).toBeCloseTo(0.6, 5);
  });

  it("lets one smoke puff rise, smaller and at 0.6 of its opacity", () => {
    const a = sprites(full.flip.pools["smoke-c"]);
    const b = sprites(soft.flip.pools["smoke-c"]);
    expect(b.length).toBe(1);
    expect(b[0]!.alpha).toBeCloseTo(0.6 * a[0]!.alpha, 5);
    expect(b[0]!.size / a[0]!.size).toBeCloseTo(0.8, 5);
  });

  it("softens the shockwave: 0.8 across, 0.6 alpha, a shorter sweep (0.5 → 1 of its size, not 0.2 → 1)", () => {
    const a = marks(full, 9);
    const b = marks(soft, 9);
    expect(b.length).toBe(2);
    const reach = (m: Mark): number => m.size * (1 + m.grow);
    const rk = reach(a[0]!) / FIRE_C_SIZE.shock;
    expect(reach(a[0]!)).toBeCloseTo(FIRE_C_SIZE.shock * rk, 5);
    expect(reach(b[0]!) / reach(a[0]!)).toBeCloseTo(0.8, 5);
    expect(a[0]!.size / reach(a[0]!)).toBeCloseTo(0.2, 5);
    expect(b[0]!.size / reach(b[0]!)).toBeCloseTo(0.5, 5);
    for (let k = 0; k < 2; k += 1) expect(b[k]!.alpha / a[k]!.alpha).toBeCloseTo(0.6, 5);
  });

  it("keeps the burnt ground that marks the hit, at 0.8 of its size", () => {
    const [a] = sprites(full.flip.pools["scorch-c"]);
    const [b] = sprites(soft.flip.pools["scorch-c"]);
    expect(b!.size / a!.size).toBeCloseTo(0.8, 5);
  });
});
