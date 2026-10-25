import { describe, expect, it } from "vitest";
import { DRAGON, NUMBER_ATLAS, NumberField, STYLE, popScale, type Rect } from "../../src/kit/feedback";

/**
 * The damage numbers fx.ts draws: the kit's NumberField with the dragon
 * profile. Its box was the drift of round 3 (digits' advances only, one font
 * size tall, one settle() pass), fixed in shared/game-kit (box as drawn,
 * settle() until none touch); these cases keep the round 2 gate and review 2
 * shots from coming back. Without a canvas the field counts every quad as ink,
 * so the quads NumberSprites writes are what it must keep apart.
 */
const A = NUMBER_ATLAS;
/** Without a canvas: the atlas's smallest cell, and the label measured as the field does (26 px a letter + 16 at 40 px). */
const CELL = A.minCellW;
const LABEL_W = DRAGON.numbers.label.length * 26 + 16;

const zero = (): Rect => ({ x: 0, y: 0, w: 0, h: 0 });
const touch = (a: Rect, b: Rect): boolean => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const fontOf = (field: NumberField, i: number): number => field.fontPx * field.size[i]! * popScale(field.tier[i]!, field.pop[i]!, DRAGON.tiers);

/**
 * The quads NumberSprites writes for number i (kit feedback/numbers.ts write()):
 * one row of digit quads, a cell wide each (1.4 advances per 48 columns) round
 * each advance's middle and 1.25 font sizes tall from y − px / 2, and the
 * label's quad, its middle 0.4 label heights above that, 1.3 label heights per
 * 64 of its rows.
 */
function quads(field: NumberField, i: number): Rect[] {
  const perfect = field.style[i] === STYLE.perfect;
  const px = fontOf(field, i);
  const advance = px * A.advance;
  const n = field.text(i).length;
  const top = field.y[i]! - px / 2;
  const cell = (advance * A.glyphQuadW * CELL) / A.refCellW;
  const out: Rect[] = [{ x: field.x[i]! - (n * advance) / 2 + advance / 2 - cell / 2, y: top, w: (n - 1) * advance + cell, h: px * A.glyphQuadH }];
  if (perfect) {
    const lh = px * A.label;
    const lw = (lh * LABEL_W) / A.refCellW;
    const h = (lh * A.labelQuadH * A.labelRowH) / A.cellH;
    out.push({ x: field.x[i]! - lw / 2, y: top - lh * A.labelMidUp - h / 2, w: lw, h });
  }
  return out;
}

const quadsTouch = (field: NumberField, a: number, b: number): boolean => quads(field, a).some((p) => quads(field, b).some((q) => touch(p, q)));

describe("damage numbers keep what they draw apart", () => {
  it("the box holds every quad of the number (no canvas: the quads are the ink)", () => {
    const field = new NumberField(DRAGON);
    field.fontPx = 16;
    const ids = [field.spawn(1, 300, 300, 7, STYLE.normal, 1, 1, 1, 0, -1, 0), field.spawn(2, 640, 300, 1016, STYLE.perfect, 4, 1.6, 1, 0, -1, 0)];
    for (const i of ids) {
      const box = field.box(i, zero());
      for (const q of quads(field, i)) {
        expect(q.x).toBeGreaterThanOrEqual(box.x);
        expect(q.y).toBeGreaterThanOrEqual(box.y);
        expect(q.x + q.w).toBeLessThanOrEqual(box.x + box.w);
        expect(q.y + q.h).toBeLessThanOrEqual(box.y + box.h);
      }
    }
  });

  it("two Hoàn hảo blows on different foes at one point: the labels stay apart, also as they fly (round 2 gate shot)", () => {
    const field = new NumberField(DRAGON);
    field.fontPx = 16;
    const a = field.spawn(1, 640, 120, 256, STYLE.perfect, 3, 1.6, 0.9, 0, -1, 0);
    const b = field.spawn(2, 640, 120, 126, STYLE.perfect, 3, 1.6, 0.9, 0, -1, 0.01);
    expect([a >= 0, b >= 0]).toEqual([true, true]);
    for (let k = 0; k <= 20 && field.alive[a] === 1 && field.alive[b] === 1; k += 1) {
      expect(quadsTouch(field, a, b)).toBe(false);
      field.update(1 / 60);
    }
  });

  it("a number born just under a Hoàn hảo one keeps its digits off that one's label (review 2 minor 2)", () => {
    const field = new NumberField(DRAGON);
    field.fontPx = 16;
    const a = field.spawn(1, 640, 200, 128, STYLE.perfect, 3, 1.6, 0.9, 0, -1, 0);
    const px = fontOf(field, a);
    // 1 px under where the old digits-only box ended (half a font size under the middle); spawn() lifts 16 px.
    const b = field.spawn(2, 640, field.y[a]! + px / 2 + 1 + px / 2 + A.label * px + 16, 128, STYLE.perfect, 3, 1.6, 0.9, 0, -1, 0.01);
    expect([a >= 0, b >= 0]).toEqual([true, true]);
    expect(quadsTouch(field, a, b)).toBe(false);
    for (let k = 0; k < 20; k += 1) field.update(1 / 60);
    if (field.alive[a] === 1 && field.alive[b] === 1) expect(quadsTouch(field, a, b)).toBe(false);
  });

  it("settles a number lifted onto a third one within the frame (round 3: one pass left them touching)", () => {
    const field = new NumberField(DRAGON);
    field.fontPx = 16;
    // T4 numbers never merge. c (oldest) sits just above a; b (youngest) lands on a.
    const c = field.spawn(1, 200, 600, 120, STYLE.perfect, 4, 1.6, 2, 0, -1, 0);
    const a = field.spawn(2, 640, 600, 120, STYLE.perfect, 4, 1.6, 2, 0, -1, 0.01);
    const b = field.spawn(3, 1000, 600, 120, STYLE.perfect, 4, 1.6, 2, 0, -1, 0.02);
    const h = field.box(a, zero()).h;
    [field.x[a], field.y[a]] = [640, 400];
    [field.x[c], field.y[c]] = [640, 400 - h - 2];
    [field.x[b], field.y[b]] = [640, 400];
    field.settle();
    const ids = [a, b, c];
    for (const i of ids) for (const j of ids) if (j > i) expect(touch(field.box(i, zero()), field.box(j, zero()))).toBe(false);
    expect([field.alive[a], field.alive[b], field.alive[c]]).toEqual([1, 1, 1]);
  });
});
