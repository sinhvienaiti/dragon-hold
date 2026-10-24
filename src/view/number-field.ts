/**
 * kit/feedback's NumberField with a box as big as what NumberSprites draws.
 * The kit's box() counts the digits only and one font size of height, but
 * each glyph quad overhangs its advance by 0.2 on both sides, is 1.25 font
 * sizes tall from the number's top, and a Chớp / Hoàn hảo number carries the
 * "HOÀN HẢO" label, wider than two or three digits. Two such numbers placed
 * side by side (4 px apart by their boxes) touched on screen (round 2 gate,
 * hitstop-storm 720p); measured as drawn (dh-numbers-drawn, review 2 minor 2),
 * a number's digits also reached up to 13.5 px below its box at 720p, onto the
 * label of the number under it. Here the box takes the label's and the
 * glyphs' drawn width and the glyphs' ink rows (the atlas fonts measured once,
 * outline included), so spawn() and settle() keep them apart.
 * Kit drift: the same fix belongs in shared/game-kit feedback/numbers.ts.
 * Owner: view-crowd-fx (LANES.md).
 */
import { NumberField, STYLE, popScale, type FeedbackProfile, type Rect } from "../kit/feedback";

/** NumberSprites' layout (kit feedback/numbers.ts): glyph advance, label height share, the atlas cell and fonts. */
const ADVANCE = 0.58;
const GLYPH_OVERHANG = 0.2;
const LABEL = 0.42;
const CELL_H = 64;
const DIGIT_FONT = 'italic 800 52px "Exo 2", "Be Vietnam Pro", system-ui, sans-serif';
const LABEL_FONT = '800 40px "Be Vietnam Pro", "Exo 2", system-ui, sans-serif';
/** Digits sit at the cell's middle + 2 px with a 9 px outline; the label at its row's middle with an 8 px one (+ 1 px of edge smoothing). */
const DIGIT_MID = CELL_H / 2 + 2;
const DIGIT_OUTLINE = 4.5 + 1;
const LABEL_OUTLINE = 4 + 1;
/** Quads: a glyph is 1.25 font sizes tall from the number's top; the label 1.3 label heights from 1.05 above it. */
const GLYPH_H = 1.25;
const LABEL_H = 1.3;
const LABEL_UP = 1.05;
/** Breathing room so neighbours do not kiss (CSS px). */
const PAD_PX = 3;

/** Ink rows inside an atlas cell, 0 (top) – 1 (bottom). */
interface InkRows {
  readonly digitTop: number;
  readonly digitBottom: number;
  readonly labelTop: number;
  readonly labelBottom: number;
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

export class DrawnNumberField extends NumberField {
  /** The label's drawn width over its height, measured once like NumberSprites does. */
  private labelAspect = -1;
  private ink: InkRows | null = null;

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

  /** Where the digits' and the label's ink sit in their cells; without a canvas, the whole cell. */
  private inkRows(): InkRows {
    if (this.ink !== null) return this.ink;
    let rows: InkRows = { digitTop: 0, digitBottom: 1, labelTop: 0, labelBottom: 1 };
    const canvas = globalThis.document?.createElement("canvas");
    const paint = canvas?.getContext("2d");
    if (paint) {
      paint.textBaseline = "middle";
      paint.font = DIGIT_FONT;
      const digits = paint.measureText("0123456789×");
      paint.font = LABEL_FONT;
      const label = paint.measureText(this.profile.numbers.label);
      if (digits.actualBoundingBoxAscent > 0 && label.actualBoundingBoxAscent > 0) {
        rows = {
          digitTop: clamp01((DIGIT_MID - digits.actualBoundingBoxAscent - DIGIT_OUTLINE) / CELL_H),
          digitBottom: clamp01((DIGIT_MID + digits.actualBoundingBoxDescent + DIGIT_OUTLINE) / CELL_H),
          labelTop: clamp01((CELL_H / 2 - label.actualBoundingBoxAscent - LABEL_OUTLINE) / CELL_H),
          labelBottom: clamp01((CELL_H / 2 + label.actualBoundingBoxDescent + LABEL_OUTLINE) / CELL_H),
        };
      }
    }
    this.ink = rows;
    return rows;
  }

  override box(i: number, out: Rect, x = this.x[i]!, y = this.y[i]!): Rect {
    super.box(i, out, x, y);
    const px = this.fontPx * this.size[i]! * popScale(this.tier[i]!, this.pop[i]!, this.profile.tiers);
    const perfect = this.style[i] === STYLE.perfect;
    let width = out.w + 2 * GLYPH_OVERHANG * ADVANCE * px;
    if (perfect) width = Math.max(width, px * LABEL * this.aspect());
    width += PAD_PX;
    out.x = x - width / 2;
    out.w = width;
    // Rows: full-size glyph quads start at the number's top (y − px / 2); the "×N" tail is smaller and inside them.
    const ink = this.inkRows();
    const glyphTop = y - px / 2;
    let top = glyphTop + GLYPH_H * px * ink.digitTop;
    let bottom = glyphTop + GLYPH_H * px * ink.digitBottom;
    if (perfect) {
      const lh = px * LABEL;
      const labelTop = glyphTop - LABEL_UP * lh;
      top = Math.min(top, labelTop + LABEL_H * lh * ink.labelTop);
      bottom = Math.max(bottom, labelTop + LABEL_H * lh * ink.labelBottom);
    }
    out.y = top - PAD_PX / 2;
    out.h = bottom - top + PAD_PX;
    return out;
  }
}
