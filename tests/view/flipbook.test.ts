// Lane view-crowd-fx: the Firefly flipbook layer (VFX round 8) without WebGL: the manifest, the cell maths, the pool.
import * as THREE from "three";
import { afterEach, describe, expect, it } from "vitest";
import { cellRect, FlipbookPool, FlipbookSet, flipbooks, ONE_FRAME, parseFlipbookManifest, type FlipbookMeta } from "../../src/view/flipbook";
import { blankTexture } from "../../src/view/vfx-layers";

const entry = { file: "impact-burst.webp", md5: "0123456789abcdef0123456789abcdef", cols: 8, rows: 4, frames: 30, fps: 12, loop: false, blend: "additive", cell: [256, 256], pivot: [0.5, 0.5] };

describe("parseFlipbookManifest", () => {
  it("reads known ids, builds URLs from the file name and skips unknown ids", () => {
    const metas = parseFlipbookManifest({ version: 1, kind: "firefly", flipbooks: { "impact-burst": entry, "not-an-id": entry } }, "/x/");
    expect([...metas.keys()]).toEqual(["impact-burst"]);
    const meta = metas.get("impact-burst")!;
    expect(meta.url).toBe("/x/impact-burst.webp?v=0123456789abcdef0123456789abcdef");
    expect(meta.frames).toBe(30);
    expect(meta.aspect).toBe(1);
    expect(meta.start).toBe(0);
    expect(meta.heading).toBe(0);
  });

  it("reads a 2:1 cell, a pivot in pixels, a start frame and a heading", () => {
    const metas = parseFlipbookManifest({ version: 1, kind: "firefly", flipbooks: { "muzzle-flash": { ...entry, file: "muzzle-flash.webp", cols: 4, rows: 8, frames: 32, cell: [256, 128], pivot: [64, 64], start: 3, heading: 180 } } });
    const meta = metas.get("muzzle-flash")!;
    expect(meta.aspect).toBe(2);
    expect(meta.pivot).toEqual([0.25, 0.5]);
    expect(meta.start).toBe(3);
    expect(meta.heading).toBeCloseTo(Math.PI);
  });

  it("refuses a broken entry or a path in the file name", () => {
    expect(() => parseFlipbookManifest({ version: 1, kind: "firefly", flipbooks: { embers: { ...entry, cols: 0 } } })).toThrow();
    expect(() => parseFlipbookManifest({ version: 1, kind: "firefly", flipbooks: { embers: { ...entry, file: "../x.webp" } } })).toThrow();
    expect(() => parseFlipbookManifest({ version: 1, kind: "firefly", flipbooks: { embers: { ...entry, frames: 40 } } })).toThrow();
    expect(() => parseFlipbookManifest({ version: 2, kind: "firefly", flipbooks: {} })).toThrow();
  });
});

describe("cellRect", () => {
  it("counts row-major from the image's top-left cell (textures load flipped)", () => {
    const meta = parseFlipbookManifest({ version: 1, kind: "firefly", flipbooks: { "impact-burst": entry } }).get("impact-burst")!;
    const out = new THREE.Vector4();
    expect(cellRect(meta, 0, out).toArray()).toEqual([0, 0.75, 0.125, 0.25]);
    expect(cellRect(meta, 9, out).toArray()).toEqual([0.125, 0.5, 0.125, 0.25]);
    // Past the last frame: the last frame.
    expect(cellRect(meta, 99, out).toArray()).toEqual([0.625, 0, 0.125, 0.25]);
  });
});

describe("FlipbookPool", () => {
  const meta: FlipbookMeta = { id: "impact-burst", url: "/x", cols: 8, rows: 4, frames: 30, fps: 12, loop: false, blend: "additive", aspect: 1, pivot: [0.5, 0.5], start: 0, heading: 0 };

  it("draws nothing before its atlas, then a sprite at full alpha on its first frame", () => {
    const pool = new FlipbookPool("impact-burst", 4, 5, blankTexture());
    pool.spawn(new THREE.Vector3(), 1);
    pool.update(1 / 60);
    expect(pool.live).toBe(0);
    pool.attach(meta, blankTexture());
    pool.spawn(new THREE.Vector3(1, 2, 3), 2, { rate: 2 });
    pool.update(1 / 60);
    expect(pool.live).toBe(1);
    const data = pool.mesh.geometry.getAttribute("iData") as THREE.InstancedBufferAttribute;
    expect(data.getX(0)).toBe(2);
    expect(data.getZ(0)).toBe(0);
    expect(data.getW(0)).toBe(1);
    // A one-shot at rate 2 lives 30 / 24 s; a one-frame sprite one frame.
    pool.spawn(new THREE.Vector3(), 1, { life: ONE_FRAME });
    pool.update(1 / 60);
    expect(pool.live).toBe(2);
    pool.update(1 / 60);
    expect(pool.live).toBe(1);
  });

  it("holds a delayed sprite back, then draws it at its first frame", () => {
    const pool = new FlipbookPool("impact-burst", 4, 5, blankTexture());
    pool.attach(meta, blankTexture());
    pool.spawn(new THREE.Vector3(), 1, { delay: 2 / 60 });
    pool.update(1 / 60);
    expect(pool.live).toBe(0);
    pool.update(1 / 60);
    expect(pool.live).toBe(1);
    expect((pool.mesh.geometry.getAttribute("iData") as THREE.InstancedBufferAttribute).getZ(0)).toBe(0);
  });
});

describe("FlipbookSet", () => {
  afterEach(() => flipbooks.reset());

  it("attaches an atlas that arrives after it was built, and picks a fallback id", () => {
    const set = new FlipbookSet(blankTexture());
    expect(set.pick("impact-big", "fire-burst")).toBeNull();
    flipbooks.add({ id: "fire-burst", url: "/x", cols: 8, rows: 4, frames: 30, fps: 12, loop: false, blend: "additive", aspect: 1, pivot: [0.5, 0.5], start: 0, heading: 0 }, new THREE.Texture());
    expect(set.pick("impact-big", "fire-burst")?.id).toBe("fire-burst");
    set.dispose();
  });
});
