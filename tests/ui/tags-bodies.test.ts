import { describe, expect, it } from "vitest";
import { layoutTags, type BodyRect, type Rect, type TagBox } from "../../src/ui/tags";

const overlap = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const covered = (tag: Rect, body: Rect) => {
  const ix = Math.min(tag.x + tag.w, body.x + body.w) - Math.max(tag.x, body.x);
  const iy = Math.min(tag.y + tag.h, body.y + body.h) - Math.max(tag.y, body.y);
  return ix > 0 && iy > 0 ? (ix * iy) / (body.w * body.h) : 0;
};

describe("word tags keep the crowd and its warnings visible (round 2)", () => {
  const view = { width: 1280, height: 720 };

  it("moves off another foe's body standing right where the tag would sit", () => {
    // A foe behind (higher on screen) the tagged one, under the tag's ideal spot.
    const behind: BodyRect = { x: 480, y: 262, w: 40, h: 34, owner: -1 };
    const [place] = layoutTags([{ id: 1, ax: 500, ay: 300, w: 80, h: 30, priority: 1 }], { ...view, bodies: [behind] });
    expect(covered(place!, behind)).toBeLessThanOrEqual(0.2);
    expect(Math.abs(place!.dx)).toBeLessThanOrEqual(120);
    expect(place!.row).toBeLessThanOrEqual(3);
  });

  it("never moves for its own foe's body", () => {
    const own: BodyRect = { x: 480, y: 262, w: 40, h: 34, owner: 1 };
    const [place] = layoutTags([{ id: 1, ax: 500, ay: 300, w: 80, h: 30, priority: 1 }], { ...view, bodies: [own] });
    expect(place).toMatchObject({ dx: 0, row: 0, leader: false });
  });

  it("sits over bodies only when no clear spot is free, and still never overlaps another tag", () => {
    // A wall of foes over every push and row: the tags fall back to the old order.
    const wall: BodyRect[] = [];
    for (let x = 300; x < 760; x += 40) for (let y = 150; y < 320; y += 30) wall.push({ x, y, w: 38, h: 28, owner: -1 });
    const tags: TagBox[] = Array.from({ length: 6 }, (_, k) => ({ id: k, ax: 520, ay: 300, w: 80, h: 30, priority: 6 - k }));
    const places = layoutTags(tags, { ...view, bodies: wall });
    expect(places).toHaveLength(6);
    for (let i = 0; i < places.length; i += 1) for (let j = i + 1; j < places.length; j += 1) expect(overlap(places[i]!, places[j]!)).toBe(false);
    expect(places.find((p) => p.id === 0)).toMatchObject({ dx: 0, row: 0 });
  });

  it("keeps its spot over a body inside its hold (no jumping), leaves it once the hold is over", () => {
    const behind: BodyRect = { x: 480, y: 262, w: 40, h: 34, owner: -1 };
    const base = { id: 1, ax: 500, ay: 300, w: 80, h: 30, priority: 1, prev: { dx: 0, row: 0, shrunk: false } };
    const [held] = layoutTags([{ ...base, firm: true }], { ...view, bodies: [behind] });
    expect(held).toMatchObject({ dx: 0, row: 0 });
    const [moved] = layoutTags([{ ...base, firm: false }], { ...view, bodies: [behind] });
    expect(covered(moved!, behind)).toBeLessThanOrEqual(0.2);
  });

  it("ring tags and edge chips ignore bodies (fixed slots, 05 §4.3)", () => {
    const behind: BodyRect = { x: 480, y: 262, w: 40, h: 34, owner: -1 };
    const [place] = layoutTags([{ id: 1, ax: 500, ay: 300, w: 80, h: 30, priority: 1, clearBodies: false }], { ...view, bodies: [behind] });
    expect(place).toMatchObject({ dx: 0, row: 0 });
  });

  it("lays out 20 tags among 40 bodies within the frame budget", () => {
    const tags: TagBox[] = Array.from({ length: 20 }, (_, k) => ({ id: k, ax: 300 + (k % 5) * 40, ay: 300 + Math.floor(k / 5) * 20, w: 60 + (k % 8) * 14, h: k % 3 === 0 ? 46 : 30, priority: 20 - k }));
    const bodies: BodyRect[] = Array.from({ length: 40 }, (_, k) => ({ x: 260 + (k % 8) * 30, y: 220 + Math.floor(k / 8) * 26, w: 22, h: 30, owner: k < 20 ? k : -1 }));
    for (let k = 0; k < 50; k += 1) layoutTags(tags, { width: 1920, height: 1080, bodies });
    // Best of 5 batches: a busy machine (other workers, a browser) must not fail it.
    let ms = Infinity;
    for (let batch = 0; batch < 5; batch += 1) {
      const start = performance.now();
      const runs = 40;
      for (let k = 0; k < runs; k += 1) layoutTags(tags, { width: 1920, height: 1080, bodies });
      ms = Math.min(ms, (performance.now() - start) / runs);
    }
    expect(ms).toBeLessThan(1);
  });
});
