import { describe, expect, it } from "vitest";
import { RING_SLOTS, edgeChip, layoutTags, ringSlot, tagFontPx, type Rect, type TagBox, type TagPlace } from "../src/ui/tags";

const overlap = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

function expectNoOverlap(places: readonly TagPlace[], avoid: readonly Rect[] = []) {
  for (let i = 0; i < places.length; i += 1) {
    for (let j = i + 1; j < places.length; j += 1) expect(overlap(places[i]!, places[j]!), "tags " + places[i]!.id + " and " + places[j]!.id).toBe(false);
    for (const zone of avoid) expect(overlap(places[i]!, zone)).toBe(false);
  }
}

/** n tags of realistic size (a 3–10 letter word at 20 px, some with a meaning line). */
function boxes(n: number, ax: (k: number) => number, ay: (k: number) => number): TagBox[] {
  return Array.from({ length: n }, (_, k) => ({ id: k, ax: ax(k), ay: ay(k), w: 60 + (k % 8) * 14, h: k % 3 === 0 ? 46 : 30, priority: n - k }));
}

describe("word tag layout (05 §4.3)", () => {
  for (const [width, height] of [[1280, 720], [1920, 1080]] as const) {
    it("never overlaps, even for 20 tags on one point, at " + width + "×" + height, () => {
      const frame: Rect = { x: width / 2 - 240, y: height - 120, w: 480, h: 104 };
      const stacked = layoutTags(boxes(20, () => width / 2, () => height / 2), { width, height, avoid: [frame] });
      expect(stacked).toHaveLength(20);
      expectNoOverlap(stacked, [frame]);
      for (const place of stacked) {
        expect(place.x).toBeGreaterThanOrEqual(0);
        expect(place.y).toBeGreaterThanOrEqual(0);
        expect(place.x + place.w).toBeLessThanOrEqual(width);
        expect(place.y + place.h).toBeLessThanOrEqual(height);
      }
    });
  }

  it("keeps tags off the learning frame and the HUD even when foes stand behind them", () => {
    const width = 1280;
    const height = 720;
    const frame: Rect = { x: 400, y: 600, w: 480, h: 104 };
    const hud: Rect = { x: 0, y: 0, w: 1280, h: 56 };
    const places = layoutTags(boxes(12, (k) => 420 + k * 36, (k) => (k % 2 === 0 ? 690 : 40)), { width, height, avoid: [frame, hud] });
    expectNoOverlap(places, [frame, hud]);
  });

  it("puts a lone tag right above its anchor with no leader line", () => {
    const [place] = layoutTags([{ id: 1, ax: 500, ay: 300, w: 80, h: 30, priority: 1 }], { width: 1280, height: 720 });
    expect(place).toMatchObject({ x: 460, y: 270, dx: 0, row: 0, shrunk: false, leader: false });
  });

  it("pushes sideways first, then lifts rows with a leader line, then shrinks the frame", () => {
    const tags = boxes(6, () => 640, () => 400).map((box) => ({ ...box, w: 70, h: 30 }));
    const places = layoutTags(tags, { width: 1280, height: 720 });
    const first = places.find((place) => place.id === 0)!;
    expect(first).toMatchObject({ dx: 0, row: 0 });
    const second = places.find((place) => place.id === 1)!;
    expect(second.row).toBe(0);
    expect(Math.abs(second.dx)).toBeGreaterThan(0);
    expect(Math.abs(second.dx)).toBeLessThanOrEqual(120);
    const crowded = layoutTags(boxes(16, () => 640, () => 400).map((box) => ({ ...box, w: 200, h: 30 })), { width: 1280, height: 720 });
    expect(crowded.some((place) => place.row > 0 && place.leader)).toBe(true);
    expectNoOverlap(crowded);
  });

  it("holds a tag's previous spot while it is free (no jumping)", () => {
    const base = { id: 3, ax: 600, ay: 400, w: 80, h: 30, priority: 1 };
    const [place] = layoutTags([{ ...base, prev: { dx: 48, row: 1, shrunk: false } }], { width: 1280, height: 720 });
    expect(place).toMatchObject({ dx: 48, row: 1 });
  });

  it("lays out 20 tags fast enough for a frame (05 §4.3: ≤ 0.3 ms target)", () => {
    const tags = boxes(20, (k) => 300 + (k % 5) * 40, (k) => 300 + Math.floor(k / 5) * 20);
    for (let k = 0; k < 50; k += 1) layoutTags(tags, { width: 1920, height: 1080 });
    const start = performance.now();
    const runs = 200;
    for (let k = 0; k < runs; k += 1) layoutTags(tags, { width: 1920, height: 1080 });
    const ms = (performance.now() - start) / runs;
    expect(ms).toBeLessThan(1);
  });

  it("sizes words 20 px at 1080p and at least 16 px at 720p", () => {
    expect(tagFontPx(1080)).toBe(20);
    expect(tagFontPx(720)).toBe(16);
    expect(tagFontPx(720, 150)).toBe(24);
  });

  it("clamps off-screen foes to an edge chip pointing at them", () => {
    const chip = edgeChip(2000, 360, 1280, 720, 40);
    expect(chip.x).toBeCloseTo(1240);
    expect(chip.y).toBeCloseTo(360);
    expect(chip.angle).toBeCloseTo(0);
    const up = edgeChip(640, -500, 1280, 720, 40);
    expect(up.y).toBeCloseTo(40);
  });

  it("gives foes near the dais fixed ring slots, nearest free to their bearing", () => {
    const step = (Math.PI * 2) / RING_SLOTS;
    expect(ringSlot(0, new Set())).toBe(0);
    expect(ringSlot(step * 3.1, new Set())).toBe(3);
    expect(ringSlot(step * 3.1, new Set([3]))).toBe(4);
    expect(ringSlot(-step, new Set())).toBe(RING_SLOTS - 1);
  });
});
