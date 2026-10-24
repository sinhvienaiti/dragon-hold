/**
 * kit/feedback's NumberField with a box as wide as what NumberSprites draws.
 * The kit's box() counts the digits only, but each glyph quad overhangs its
 * advance by 0.2 on both sides and a Chớp / Hoàn hảo number carries the
 * "HOÀN HẢO" label, wider than two or three digits. Two such numbers placed
 * side by side (4 px apart by their boxes) touched on screen (round 2 gate,
 * hitstop-storm 720p). Here the box takes the label's and the glyphs' drawn
 * width, so spawn() and settle() keep them apart.
 * Kit drift: the same fix belongs in shared/game-kit feedback/numbers.ts.
 * Owner: view-crowd-fx (LANES.md).
 */
import { NumberField, STYLE, popScale, type FeedbackProfile, type Rect } from "../kit/feedback";

/** NumberSprites' layout (kit feedback/numbers.ts): glyph advance, label height share, the label row's font. */
const ADVANCE = 0.58;
const GLYPH_OVERHANG = 0.2;
const LABEL = 0.42;
const CELL_H = 64;
const LABEL_FONT = '800 40px "Be Vietnam Pro", "Exo 2", system-ui, sans-serif';
/** Breathing room so neighbours do not kiss (CSS px). */
const PAD_PX = 3;

export class DrawnNumberField extends NumberField {
  /** The label's drawn width over its height, measured once like NumberSprites does. */
  private labelAspect = -1;

  constructor(profile: FeedbackProfile) {
    super(profile);
  }

  private aspect(): number {
    if (this.labelAspect > 0) return this.labelAspect;
    const label = this.profile.numbers.label;
    let width = label.length * 26 + 16;
    const canvas = globalThis.document?.createElement("canvas");
    const paint = canvas?.getContext("2d");
    if (paint) {
      paint.font = LABEL_FONT;
      width = Math.ceil(paint.measureText(label).width) + 16;
    }
    // lw = lh · labelWidth / (CELL_H · 0.75), as the sprites draw it.
    this.labelAspect = Math.min(1016, width) / (CELL_H * 0.75);
    return this.labelAspect;
  }

  override box(i: number, out: Rect, x = this.x[i]!, y = this.y[i]!): Rect {
    super.box(i, out, x, y);
    const px = this.fontPx * this.size[i]! * popScale(this.tier[i]!, this.pop[i]!, this.profile.tiers);
    let width = out.w + 2 * GLYPH_OVERHANG * ADVANCE * px;
    if (this.style[i] === STYLE.perfect) width = Math.max(width, px * LABEL * this.aspect());
    width += PAD_PX;
    out.x = x - width / 2;
    out.w = width;
    return out;
  }
}
