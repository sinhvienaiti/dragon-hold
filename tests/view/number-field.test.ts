import { describe, expect, it } from "vitest";
import { DRAGON, NUMBER_ATLAS, NumberField, STYLE, type Rect } from "../../src/kit/feedback";
import { DrawnNumberField } from "../../src/view/number-field";

const A = NUMBER_ATLAS;
/** Without a canvas: the atlas's smallest cell, and the label measured as the field does (26 px a letter + 16 at 40 px). */
const CELL = A.minCellW;
const LABEL_W = DRAGON.numbers.label.length * 26 + 16;

/** What NumberSprites draws for number i: the digits' quads and, for Chớp / Hoàn hảo, the label's width, over the kit box's rows. */
function drawn(field: NumberField, i: number): Rect {
  const kit = NumberField.prototype.box.call(field, i, { x: 0, y: 0, w: 0, h: 0 });
  const px = kit.h / (field.style[i] === STYLE.perfect ? 1.42 : 1);
  const advance = A.advance * px;
  const digits = kit.w - advance + (advance * A.glyphQuadW * CELL) / A.refCellW;
  const label = field.style[i] === STYLE.perfect ? (px * A.label * LABEL_W) / A.refCellW : 0;
  const w = Math.max(digits, label);
  return { x: field.x[i]! - w / 2, y: kit.y, w, h: kit.h };
}

const touch = (a: Rect, b: Rect): boolean => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

/**
 * The quads NumberSprites writes for number i (kit feedback/numbers.ts write()):
 * one row of digit quads, a cell wide each (1.4 advances per 48 columns) round
 * each advance's middle and 1.25 font sizes tall from y − px / 2, and the
 * label's quad, its middle 0.4 label heights above that, 1.3 label heights per
 * 64 of its rows. Without a canvas the field takes every quad as ink, so the
 * quads are what it must keep apart.
 */
function quads(field: NumberField, i: number): Rect[] {
  const kit = NumberField.prototype.box.call(field, i, { x: 0, y: 0, w: 0, h: 0 });
  const perfect = field.style[i] === STYLE.perfect;
  const px = kit.h / (perfect ? 1.42 : 1);
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

/** A Hoàn hảo number, then a second one on another foe just below it: their kit boxes do not touch (1 px apart). */
function stacked(field: NumberField): [number, number] {
  field.fontPx = 16;
  const a = field.spawn(1, 640, 200, 128, STYLE.perfect, 3, 1.6, 0.9, 0, -1, 0);
  const box = NumberField.prototype.box.call(field, a, { x: 0, y: 0, w: 0, h: 0 });
  const px = box.h / 1.42;
  // spawn() lifts a number 16 px; the second box's top lands 1 px under the first box's bottom.
  const b = field.spawn(2, 640, box.y + box.h + 1 + px / 2 + 0.42 * px + 16, 128, STYLE.perfect, 3, 1.6, 0.9, 0, -1, 0.01);
  return [a, b];
}

/** Two Hoàn hảo blows on different foes at the same screen point (T3: never merged). */
function storm(field: NumberField): [number, number] {
  field.fontPx = 16;
  const a = field.spawn(1, 640, 120, 256, STYLE.perfect, 3, 1.6, 0.9, 0, -1, 0);
  const b = field.spawn(2, 640, 120, 126, STYLE.perfect, 3, 1.6, 0.9, 0, -1, 0.01);
  return [a, b];
}

describe("damage numbers keep their drawn labels apart", () => {
  it("the kit's digit-only box lets two labels touch (the round 2 gate shot)", () => {
    const field = new NumberField(DRAGON);
    const [a, b] = storm(field);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(b).toBeGreaterThanOrEqual(0);
    expect(touch(drawn(field, a), drawn(field, b))).toBe(true);
  });

  it("the drawn box moves the second number clear of the first", () => {
    const field = new DrawnNumberField(DRAGON);
    const [a, b] = storm(field);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(b).toBeGreaterThanOrEqual(0);
    expect(touch(drawn(field, a), drawn(field, b))).toBe(false);
    // Still apart after they fly a while (settle() runs every update).
    for (let k = 0; k < 20; k += 1) field.update(1 / 60);
    if (field.alive[a] === 1 && field.alive[b] === 1) expect(touch(drawn(field, a), drawn(field, b))).toBe(false);
  });

  it("the kit's box ends a font size down, so a number's digits reach the label under it", () => {
    const field = new NumberField(DRAGON);
    const [a, b] = stacked(field);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(b).toBeGreaterThanOrEqual(0);
    expect(quadsTouch(field, a, b)).toBe(true);
  });

  it("settles a number lifted onto a third one within the frame (the kit's one pass leaves them touching)", () => {
    const overlapping = (field: NumberField): number => {
      const ids = [...field.alive].map((alive, i) => (alive === 1 ? i : -1)).filter((i) => i >= 0);
      let count = 0;
      for (const i of ids) for (const j of ids) if (j > i && touch(field.box(i, { x: 0, y: 0, w: 0, h: 0 }), field.box(j, { x: 0, y: 0, w: 0, h: 0 }))) count += 1;
      return count;
    };
    // c (oldest) sits just above a; b (youngest, never merged: T4) lands on a. One pass lifts b off a onto c.
    const place = (field: NumberField): void => {
      field.fontPx = 16;
      const c = field.spawn(1, 200, 600, 120, STYLE.perfect, 4, 1.6, 2, 0, -1, 0);
      const a = field.spawn(2, 640, 600, 120, STYLE.perfect, 4, 1.6, 2, 0, -1, 0.01);
      const b = field.spawn(3, 1000, 600, 120, STYLE.perfect, 4, 1.6, 2, 0, -1, 0.02);
      const h = field.box(a, { x: 0, y: 0, w: 0, h: 0 }).h;
      [field.x[a], field.y[a]] = [640, 400];
      [field.x[c], field.y[c]] = [640, 400 - h - 2];
      [field.x[b], field.y[b]] = [640, 400];
    };
    const kit = new NumberField(DRAGON);
    place(kit);
    NumberField.prototype.settle.call(kit);
    expect(overlapping(kit)).toBe(1);
    const drawnField = new DrawnNumberField(DRAGON);
    place(drawnField);
    drawnField.settle();
    expect(overlapping(drawnField)).toBe(0);
  });

  it("the drawn box takes the glyph rows too: stacked numbers keep their quads apart", () => {
    const field = new DrawnNumberField(DRAGON);
    const [a, b] = stacked(field);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(b).toBeGreaterThanOrEqual(0);
    expect(quadsTouch(field, a, b)).toBe(false);
    for (let k = 0; k < 20; k += 1) field.update(1 / 60);
    if (field.alive[a] === 1 && field.alive[b] === 1) expect(quadsTouch(field, a, b)).toBe(false);
  });
});
