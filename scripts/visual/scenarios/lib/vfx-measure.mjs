// Frame measures for the VFX captures (docs/games/VFX_STANDARD.md §4.5, §5.6), read from the
// PNG/JPEG files the scenarios write: ImageMagick decodes to raw RGB, the sums are plain JS.
//   whiteOut       share of the field at sRGB luma ≥ 0.95 (≤ 6 %)
//   tagContrast    WCAG contrast of the tag text over its plate over the p99 scene pixel under it (≥ 7 : 1)
//   flashSeries    brightness gain of a box over a reference frame, frame by frame (first frame ≥ 95 % of peak)
// and contact sheets through `magick montage`. Owner: view-crowd-fx (LANES.md).
import { spawnSync } from "node:child_process";

/** macOS needs a font path for montage labels (FEEL_PASS_S1 §7.2). */
const FONT = "/System/Library/Fonts/Supplemental/Arial.ttf";

const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const LIN = Float64Array.from({ length: 256 }, (_, i) => lin(i / 255));
/** Relative luminance of an sRGB colour given 0–255 channels. */
export const lum255 = (r, g, b) => 0.2126 * LIN[r] + 0.7152 * LIN[g] + 0.0722 * LIN[b];

/** Decodes an image to { w, h, data } (RGB, 8 bit). */
export function readRgb(file) {
  const size = spawnSync("magick", ["identify", "-format", "%w %h", file], { encoding: "utf8" });
  const [w, h] = size.stdout.trim().split(/\s+/).map(Number);
  const raw = spawnSync("magick", [file, "-depth", "8", "rgb:-"], { maxBuffer: 256 << 20 });
  if (raw.status !== 0 || !w || !h) throw new Error("vfx-measure: cannot read " + file + ": " + raw.stderr?.toString());
  return { w, h, data: raw.stdout };
}

/** sRGB luma (0–1) of pixel i. */
const luma = (img, i) => (0.2126 * img.data[i * 3] + 0.7152 * img.data[i * 3 + 1] + 0.0722 * img.data[i * 3 + 2]) / 255;

/** Share of pixels (in `box`, default the whole frame) at sRGB luma ≥ `level`. */
export function whiteOut(img, level = 0.95, box = { x: 0, y: 0, w: img.w, h: img.h }) {
  let n = 0;
  let total = 0;
  for (let y = Math.max(0, box.y); y < Math.min(img.h, box.y + box.h); y += 1) {
    for (let x = Math.max(0, box.x); x < Math.min(img.w, box.x + box.w); x += 1) {
      total += 1;
      if (luma(img, y * img.w + x) >= level) n += 1;
    }
  }
  return total === 0 ? 0 : n / total;
}

/** Mean sRGB luma of a box. */
export function meanLuma(img, box) {
  let sum = 0;
  let n = 0;
  for (let y = Math.max(0, Math.round(box.y)); y < Math.min(img.h, Math.round(box.y + box.h)); y += 1) {
    for (let x = Math.max(0, Math.round(box.x)); x < Math.min(img.w, Math.round(box.x + box.w)); x += 1) {
      sum += luma(img, y * img.w + x);
      n += 1;
    }
  }
  return n === 0 ? 0 : sum / n;
}

/**
 * Where `img` got brightest over `base` inside `box`: the centre of the `cell`-px square with the largest mean gain.
 */
export function brightestGain(img, base, box, cell) {
  let best = { x: box.x + box.w / 2, y: box.y + box.h / 2, gain: -1 };
  const step = Math.max(2, Math.round(cell / 3));
  for (let y = Math.max(0, box.y); y + cell <= Math.min(img.h, box.y + box.h); y += step) {
    for (let x = Math.max(0, box.x); x + cell <= Math.min(img.w, box.x + box.w); x += step) {
      const square = { x, y, w: cell, h: cell };
      const gain = meanLuma(img, square) - meanLuma(base, square);
      if (gain > best.gain) best = { x: x + cell / 2, y: y + cell / 2, gain };
    }
  }
  return best;
}

/**
 * Worst WCAG contrast over the word tags: each tag's plate (`plate` [r, g, b] 0–255 at `alpha`) is laid over the
 * scene pixels under it (canvas-only frame), the p99 brightest result is the background, `textLum` the dimmest text.
 */
export function tagContrast(img, rects, plate, alpha, textLum, p = 0.99) {
  let worst = null;
  for (const [rx, ry, rw, rh] of rects) {
    const values = [];
    for (let y = Math.max(0, Math.floor(ry)); y < Math.min(img.h, Math.ceil(ry + rh)); y += 1) {
      for (let x = Math.max(0, Math.floor(rx)); x < Math.min(img.w, Math.ceil(rx + rw)); x += 1) {
        const i = (y * img.w + x) * 3;
        const r = Math.round(alpha * plate[0] + (1 - alpha) * img.data[i]);
        const g = Math.round(alpha * plate[1] + (1 - alpha) * img.data[i + 1]);
        const b = Math.round(alpha * plate[2] + (1 - alpha) * img.data[i + 2]);
        values.push(lum255(r, g, b));
      }
    }
    if (values.length === 0) continue;
    values.sort((a, b) => a - b);
    const bg = values[Math.min(values.length - 1, Math.floor(values.length * p))];
    const contrast = (textLum + 0.05) / (bg + 0.05);
    if (worst === null || contrast < worst) worst = contrast;
  }
  return worst;
}

/** Contact sheet: `items` [{ file, label, crop? {x,y,w,h} }] in rows of `columns`, each tile scaled to `tileW`. */
export function montage(items, out, { columns = 6, tileW = 400, title = "" } = {}) {
  const args = ["montage", "-font", FONT, "-pointsize", "13", "-background", "#1e1e1e", "-fill", "#f0f0f0"];
  for (const item of items) {
    const crop = item.crop ? "[" + Math.round(item.crop.w) + "x" + Math.round(item.crop.h) + "+" + Math.round(item.crop.x) + "+" + Math.round(item.crop.y) + "]" : "";
    args.push("-label", item.label, item.file + crop);
  }
  args.push("-tile", columns + "x", "-geometry", tileW + "x+3+3");
  if (title) args.push("-title", title);
  args.push(out);
  const run = spawnSync("magick", args, { encoding: "utf8", maxBuffer: 64 << 20 });
  if (run.status !== 0) throw new Error("montage failed: " + run.stderr);
  return out;
}

/** Two images side by side at the same height (reference left, sheet right). */
export function beside(left, right, out, height = 900) {
  const run = spawnSync("magick", ["(", left, "-resize", "x" + height, ")", "(", right, "-resize", "x" + height, ")", "-background", "#1e1e1e", "-gravity", "center", "+append", out], { encoding: "utf8" });
  if (run.status !== 0) throw new Error("beside failed: " + run.stderr);
  return out;
}

/** Frames (in order) to an H.264 clip at `fps`. */
export function clip(pattern, out, fps = 60) {
  const run = spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", String(fps), "-i", pattern, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", out], { encoding: "utf8" });
  if (run.status !== 0) throw new Error("ffmpeg failed: " + run.stderr);
  return out;
}
