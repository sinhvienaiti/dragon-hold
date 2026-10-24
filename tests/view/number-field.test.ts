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
});
