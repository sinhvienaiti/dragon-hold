import { describe, expect, it } from "vitest";
import { DRAGON, NumberField, STYLE, type Rect } from "../../src/kit/feedback";
import { DrawnNumberField } from "../../src/view/number-field";

/** What NumberSprites draws for number i: the digits with their glyph overhang, and the label for Chớp / Hoàn hảo. */
function drawn(field: NumberField, i: number): Rect {
  const kit = NumberField.prototype.box.call(field, i, { x: 0, y: 0, w: 0, h: 0 });
  const px = kit.h / (field.style[i] === STYLE.perfect ? 1.42 : 1);
  const digits = kit.w + 2 * 0.2 * 0.58 * px;
  // Without a canvas the label is measured as the field does: 26 px a letter + 16 at 40 px, over 48.
  const label = field.style[i] === STYLE.perfect ? px * 0.42 * ((DRAGON.numbers.label.length * 26 + 16) / 48) : 0;
  const w = Math.max(digits, label);
  return { x: field.x[i]! - w / 2, y: kit.y, w, h: kit.h };
}

const touch = (a: Rect, b: Rect): boolean => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

/**
 * The quads NumberSprites writes for number i (kit feedback/numbers.ts write()):
 * one row of digit quads, 1.25 font sizes tall from y − px / 2, and the label's
 * quad 1.3 label heights tall from 1.05 above it. Without a canvas the field
 * takes every cell as ink, so the quads are what it must keep apart.
 */
function quads(field: NumberField, i: number): Rect[] {
  const kit = NumberField.prototype.box.call(field, i, { x: 0, y: 0, w: 0, h: 0 });
  const perfect = field.style[i] === STYLE.perfect;
  const px = kit.h / (perfect ? 1.42 : 1);
  const advance = px * 0.58;
  const n = field.text(i).length;
  const top = field.y[i]! - px / 2;
  const out: Rect[] = [{ x: field.x[i]! - (n * advance) / 2 - advance * 0.2, y: top, w: n * advance + advance * 0.4, h: px * 1.25 }];
  if (perfect) {
    const lh = px * 0.42;
    const lw = lh * ((DRAGON.numbers.label.length * 26 + 16) / 48);
    out.push({ x: field.x[i]! - lw / 2, y: top - lh * 1.05, w: lw, h: lh * 1.3 });
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
