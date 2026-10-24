/**
 * kit/feedback's NumberField with a box as big as what NumberSprites draws.
 * The kit's box() counts the digits' advances only and one font size of
 * height, but each italic glyph's ink reaches past its advance, the glyph
 * quads are 1.25 font sizes tall from the number's top, and a Chớp / Hoàn hảo
 * number carries the "HOÀN HẢO" label, wider than two or three digits. Two
 * such numbers placed side by side (4 px apart by their boxes) touched on
 * screen (round 2 gate, hitstop-storm 720p); measured as drawn
 * (dh-numbers-drawn, review 2 minor 2), a number's digits also reached up to
 * 13.5 px below its box at 720p, onto the label of the number under it. Here
 * the box takes the ink of the glyphs and the label as the atlas paints them
 * (kit NUMBER_ATLAS: fonts, cells, rows; the canvas measured once, outline
 * included), so spawn() and settle() keep them apart. Without a canvas every
 * quad counts as ink.
 * Kit drift: the box itself still belongs in shared/game-kit feedback/numbers.ts.
 * Owner: view-crowd-fx (LANES.md).
 */
import { NUMBER_ATLAS, NumberField, STYLE, popScale, type FeedbackProfile, type Rect } from "../kit/feedback";

const A = NUMBER_ATLAS;
/** Breathing room so neighbours do not kiss (CSS px). */
const PAD_PX = 3;
/** Edge smoothing past the stroke, atlas px. */
const SMOOTH = 1;

/** Where the glyphs' and the label's ink sit in the atlas, atlas px. */
interface Ink {
  /** The widest glyph's ink either side of its middle (cell middle = the advance's middle on screen). */
  readonly digitHalf: number;
  /** Digit ink rows from the cell's top. */
  readonly digitTop: number;
  readonly digitBottom: number;
  /** Label ink: its width, and its rows above and below the row's middle. */
  readonly labelWidth: number;
  readonly labelUp: number;
  readonly labelDown: number;
}

const finite = (value: number | undefined): value is number => value !== undefined && Number.isFinite(value);
const SCRATCH_A: Rect = { x: 0, y: 0, w: 0, h: 0 };
const SCRATCH_B: Rect = { x: 0, y: 0, w: 0, h: 0 };

export class DrawnNumberField extends NumberField {
  private ink: Ink | null = null;

  constructor(profile: FeedbackProfile) {
    super(profile);
  }

  /** The atlas ink, measured once with the atlas fonts; without a canvas, the whole quads. */
  private inkOf(): Ink {
    if (this.ink !== null) return this.ink;
    const label = this.profile.numbers.label;
    let ink: Ink = { digitHalf: A.minCellW / 2, digitTop: 0, digitBottom: A.cellH, labelWidth: Math.min(A.width - 8, label.length * 26 + 16), labelUp: A.labelRowH / 2, labelDown: A.labelRowH / 2 };
    const canvas = globalThis.document?.createElement("canvas");
    const paint = canvas?.getContext("2d");
    if (paint) {
      paint.textAlign = "center";
      paint.textBaseline = "middle";
      paint.font = A.digitFont;
      let half = 0;
      for (const glyph of A.glyphs) {
        const m = paint.measureText(glyph);
        half = Math.max(half, finite(m.actualBoundingBoxLeft) && finite(m.actualBoundingBoxRight) ? Math.max(m.actualBoundingBoxLeft, m.actualBoundingBoxRight) : m.width * 0.75);
      }
      const digits = paint.measureText(A.glyphs);
      paint.font = A.labelFont;
      const words = paint.measureText(label);
      if (half > 0 && finite(digits.actualBoundingBoxAscent) && finite(words.actualBoundingBoxAscent)) {
        const inked = finite(words.actualBoundingBoxLeft) && finite(words.actualBoundingBoxRight) ? words.actualBoundingBoxLeft + words.actualBoundingBoxRight : words.width;
        ink = {
          digitHalf: half + A.digitOutline / 2 + SMOOTH,
          digitTop: Math.max(0, A.digitMidY - digits.actualBoundingBoxAscent - A.digitOutline / 2 - SMOOTH),
          digitBottom: Math.min(A.cellH, A.digitMidY + digits.actualBoundingBoxDescent + A.digitOutline / 2 + SMOOTH),
          labelWidth: Math.max(words.width, inked) + A.labelOutline + 2 * SMOOTH,
          labelUp: Math.min(A.labelRowH / 2, words.actualBoundingBoxAscent + A.labelOutline / 2 + SMOOTH),
          labelDown: Math.min(A.labelRowH / 2, words.actualBoundingBoxDescent + A.labelOutline / 2 + SMOOTH),
        };
      }
    }
    this.ink = ink;
    return ink;
  }

  /**
   * The kit's settle() is one pass: a number it lifts can land on one it has
   * already checked and stays there for that frame. dh-hitstop-keys found it
   * every frame in round 3: storm numbers overlapped in 8–11 of ~2,770 frames
   * per run, 3 of them on screen at 1080p (two "1016" labels 40 px into each
   * other), each cleared by one more pass. Here passes run until no two boxes
   * touch (at most 4 a frame). Kit drift: shared/game-kit settle() is one pass.
   */
  override settle(): void {
    for (let pass = 0; pass < 4; pass += 1) {
      super.settle();
      if (!this.anyTouching()) return;
    }
  }

  /** Two live numbers whose boxes overlap. */
  private anyTouching(): boolean {
    const a = SCRATCH_A;
    const b = SCRATCH_B;
    for (let i = 0; i < this.alive.length; i += 1) {
      if (this.alive[i] !== 1) continue;
      this.box(i, a);
      for (let j = i + 1; j < this.alive.length; j += 1) {
        if (this.alive[j] !== 1) continue;
        this.box(j, b);
        if (a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y) return true;
      }
    }
    return false;
  }

  override box(i: number, out: Rect, x = this.x[i]!, y = this.y[i]!): Rect {
    super.box(i, out, x, y);
    const px = this.fontPx * this.size[i]! * popScale(this.tier[i]!, this.pop[i]!, this.profile.tiers);
    const perfect = this.style[i] === STYLE.perfect;
    const ink = this.inkOf();
    const advance = A.advance * px;
    // Screen px per atlas column and row of a glyph (NumberSprites.write: 1.4 advances per 48 columns, 1.25 font sizes per 64 rows).
    const column = (advance * A.glyphQuadW) / A.refCellW;
    const row = (px * A.glyphQuadH) / A.cellH;
    // Each glyph's ink reaches digitHalf columns either side of its advance's middle.
    let width = out.w + 2 * Math.max(0, ink.digitHalf * column - advance / 2);
    const lh = px * A.label;
    if (perfect) width = Math.max(width, (lh * ink.labelWidth) / A.refCellW);
    width += PAD_PX;
    out.x = x - width / 2;
    out.w = width;
    // Rows: full-size glyphs start at the number's top (y − px / 2); the "×N" tail is smaller and inside them.
    const glyphTop = y - px / 2;
    let top = glyphTop + ink.digitTop * row;
    let bottom = glyphTop + ink.digitBottom * row;
    if (perfect) {
      // The label's middle sits labelMidUp label heights above the digits' top, 1.3 label heights per 64 of its rows.
      const middle = glyphTop - A.labelMidUp * lh;
      const labelRow = (lh * A.labelQuadH) / A.cellH;
      top = Math.min(top, middle - ink.labelUp * labelRow);
      bottom = Math.max(bottom, middle + ink.labelDown * labelRow);
    }
    out.y = top - PAD_PX / 2;
    out.h = bottom - top + PAD_PX;
    return out;
  }
}
