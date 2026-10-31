#!/usr/bin/env node
// Fire test C (31/10, free assets only): the CC0 Kenney support layers for the STRONG word hit, written under new
// names into public/assets/dragon-hold/vfx/fire-c/ (ignored, never in Git; nothing over the round-10, A or B atlases):
//   sparks-c.webp   Kenney Particle Pack flare_01 (a hot dot with a short lens streak) on black, its faint halo cut,
//                   one cell of 256 px: additive embers (the game tints them warm yellow-orange).
//   scorch-c.webp   Kenney Particle Pack scorch_01 and scorch_02 as data in test B's decal layout (flipbook decalB):
//                   A = a soft coverage of the splat (its thin rays softened into lobes), R = its detail, G = a wide
//                   falloff (the order it shrinks away in). 1 cell per source, 256 px. (scorch_03's blotches with
//                   holes read as a honeycomb on the bench, a look the judges marked down in rounds 7–10.)
//   smoke-c.webp    Kenney Particle Pack smoke_07, smoke_08, smoke_04: their wispy alpha (mean ~0.15) remapped to a
//                   dense coverage with a soft ~3 px edge, shaded warm grey by their own density with a lit top
//                   (straight alpha; flipbook smokeB: the game shrinks it away by a threshold, never a see-through veil).
//   kenney/         the Kenney source files used, copied as they are, with the pack's License.txt (CC0).
//   manifest.json   read by src/view/fire-c.ts (fireCFlipbooks).
//   node scripts/assets/prepare-fire-c.mjs [--pack <kenney particle pack dir>] [--sheet <dir>]
// Licence: Kenney Particle Pack 1.1, CC0 1.0 ("You may use these assets in personal and commercial projects. Credit
// would be nice but is not mandatory"). Downloaded 31/10/2026, docs/games/vfx/PACKS.md (parent repo).
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : fallback;
};
const MAGICK = process.env.ART_MAGICK || "magick";
const magick = (args, input) => execFileSync(MAGICK, args, { maxBuffer: 1 << 30, input, stdio: [input ? "pipe" : "ignore", "pipe", "pipe"] });
const md5 = (bytes) => createHash("md5").update(bytes).digest("hex");

const pack = resolve(arg("--pack", join(process.env.HOME ?? "", "VFXLab/packs/kenney-particles/x")));
const transparent = join(pack, "PNG (Transparent)");
const sheetDir = arg("--sheet", null);
const out = join(ROOT, "public/assets/dragon-hold/vfx/fire-c");
const kenneyOut = join(out, "kenney");
mkdirSync(kenneyOut, { recursive: true });
const flipbooks = {};

const USED = ["flare_01.png", "scorch_01.png", "scorch_02.png", "smoke_04.png", "smoke_07.png", "smoke_08.png"];
for (const f of USED) copyFileSync(join(transparent, f), join(kenneyOut, f));
copyFileSync(join(pack, "License.txt"), join(kenneyOut, "License.txt"));

function readRgba(file) {
  const [w, h] = magick(["identify", "-format", "%w %h", file]).toString().trim().split(/\s+/).map(Number);
  return { w, h, d: new Uint8ClampedArray(magick([file, "-depth", "8", "rgba:-"])) };
}
function writeRgba(img, file, extra = []) {
  magick(["-size", img.w + "x" + img.h, "-depth", "8", "rgba:-", ...extra, file], Buffer.from(img.d.buffer, img.d.byteOffset, img.d.length));
}
function webp(src, file, extra = []) {
  const target = join(out, file);
  const temp = target + ".tmp.webp";
  magick([src, ...extra, "-quality", "92", "-define", "webp:alpha-quality=100", "-define", "webp:exact=true", temp]);
  renameSync(temp, target);
  const bytes = readFileSync(target);
  return { md5: md5(bytes), bytes: bytes.length };
}
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const smooth = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};
/** Separable box blur (radius r), run `passes` times (≈ a gaussian). */
function blur(values, w, h, r, passes = 2) {
  let a = Float64Array.from(values);
  const b = new Float64Array(w * h);
  for (let k = 0; k < passes; k += 1) {
    for (let y = 0; y < h; y += 1) {
      let s = 0;
      for (let x = -r; x <= r; x += 1) s += a[y * w + clamp(x, 0, w - 1)];
      for (let x = 0; x < w; x += 1) {
        b[y * w + x] = s / (2 * r + 1);
        s += a[y * w + clamp(x + r + 1, 0, w - 1)] - a[y * w + clamp(x - r, 0, w - 1)];
      }
    }
    for (let x = 0; x < w; x += 1) {
      let s = 0;
      for (let y = -r; y <= r; y += 1) s += b[clamp(y, 0, h - 1) * w + x];
      for (let y = 0; y < h; y += 1) {
        a[y * w + x] = s / (2 * r + 1);
        s += b[clamp(y + r + 1, 0, h - 1) * w + x] - b[clamp(y - r, 0, h - 1) * w + x];
      }
    }
  }
  return a;
}
// Data channels are stored so the sRGB decode in the game gives the value back.
const enc = (v) => {
  v = clamp(v);
  return Math.round(255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055));
};

// ── sparks-c: flare_01 on black, 1 cell of 256 ───────────────────────────────
{
  const cells = ["flare_01.png"].map((f, i) => {
    const file = join(out, ".spark-" + i + ".png");
    // The pack's white shapes over black (light = the shape's alpha × its grey), 512 → 256; the faint halo cut (a
    // black point at 14 %): a faint additive yellow over grass reads olive.
    magick([join(transparent, f), "-background", "black", "-alpha", "remove", "-alpha", "off", "-resize", "256x256", "-level", "14%,100%", file]);
    return file;
  });
  const src = join(out, "sparks-c.src.png");
  magick([...cells, "+append", src]);
  flipbooks["sparks-c"] = { file: "sparks-c.webp", cols: 1, rows: 1, frames: 1, fps: 1, loop: false, blend: "additive", cell: [256, 256], pivot: [0.5, 0.5], start: 0, heading: 0, version: "kenney-1.1", source: "Kenney Particle Pack 1.1 (CC0): flare_01", alpha: false, ...webp(src, "sparks-c.webp"), width: 256, height: 256 };
  for (const f of [...cells, src]) if (!sheetDir || f !== src) rmSync(f, { force: true });
}

// ── scorch-c: scorch_01..03 as coverage, detail and falloff (test B's decal layout) ──
{
  const sources = ["scorch_01.png", "scorch_02.png"];
  const files = sources.map((f, i) => {
    const img = readRgba(join(transparent, f));
    const { w, h } = img;
    const n = w * h;
    const A = new Float64Array(n);
    const L = new Float64Array(n);
    for (let p = 0; p < n; p += 1) {
      A[p] = img.d[p * 4 + 3] / 255;
      L[p] = (img.d[p * 4] + img.d[p * 4 + 1] + img.d[p * 4 + 2]) / (3 * 255);
    }
    // The splat's body (its dense blobs); its thin thrown rays softened into short lobes (crisp rays read as an ink
    // splat or a star).
    const soft = blur(A, w, h, 7, 2);
    const wide = blur(A, w, h, 48, 3);
    let wmax = 0;
    for (let p = 0; p < n; p += 1) wmax = Math.max(wmax, wide[p]);
    const outImg = { w, h, d: new Uint8ClampedArray(n * 4) };
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const p = y * w + x;
        const r = Math.hypot(x / w - 0.5, y / h - 0.5) * 2;
        // A short edge (~1 px in game): a long see-through brown fringe over grass reads olive.
        const cov = smooth(0.3, 0.42, soft[p]) * (1 - smooth(0.88, 1.0, r));
        // Detail: the splat's own density (dense blobs light, the thin rays and specks darker).
        const detail = clamp(0.25 + 0.75 * A[p] * (0.6 + 0.4 * L[p]));
        outImg.d[p * 4] = enc(detail);
        outImg.d[p * 4 + 1] = enc(wide[p] / (wmax || 1));
        outImg.d[p * 4 + 2] = 0;
        outImg.d[p * 4 + 3] = Math.round(cov * 255);
      }
    }
    const file = join(out, ".scorch-" + i + ".png");
    writeRgba(outImg, file, ["-resize", "256x256"]);
    return file;
  });
  const src = join(out, "scorch-c.src.png");
  magick([...files, "+append", src]);
  flipbooks["scorch-c"] = { file: "scorch-c.webp", cols: 2, rows: 1, frames: 2, fps: 1, loop: false, blend: "normal", cell: [256, 256], pivot: [0.5, 0.5], start: 0, heading: 0, version: "kenney-1.1", source: "Kenney Particle Pack 1.1 (CC0): scorch_01, scorch_02 as coverage, detail, falloff", alpha: true, ...webp(src, "scorch-c.webp"), width: 512, height: 256 };
  for (const f of files) rmSync(f, { force: true });
  if (sheetDir) {
    mkdirSync(sheetDir, { recursive: true });
    magick([src, "-channel", "A", "-separate", join(sheetDir, "scorch-c-coverage.png")]);
    magick([join(out, "sparks-c.src.png"), join(sheetDir, "sparks-c.png")]);
    rmSync(join(out, "sparks-c.src.png"), { force: true });
  }
  rmSync(src, { force: true });
}

// ── smoke-c: smoke_07, smoke_08, smoke_04 as dense, lit, warm grey puffs (3 cells of 256) ──────────
{
  const files = ["smoke_07.png", "smoke_08.png", "smoke_04.png"].map((f, i) => {
    const img = readRgba(join(transparent, f));
    const { w, h } = img;
    const n = w * h;
    const A = new Float64Array(n);
    for (let p = 0; p < n; p += 1) A[p] = img.d[p * 4 + 3] / 255;
    const soft = blur(A, w, h, 3, 2);
    const wide = blur(A, w, h, 24, 2);
    let amax = 0;
    for (let p = 0; p < n; p += 1) amax = Math.max(amax, soft[p]);
    const outImg = { w, h, d: new Uint8ClampedArray(n * 4) };
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const p = y * w + x;
        const r = Math.hypot(x / w - 0.5, y / h - 0.5) * 2;
        const cov = smooth(0.05, 0.22, soft[p] / (amax || 1)) * (1 - smooth(0.85, 1.0, r));
        // Shading: its own density (the puffs inside it) and a light from the top, the underside darker.
        const detail = clamp((A[p] / (amax || 1)) * 0.6 + (wide[p] / (amax || 1)) * 0.8);
        const top = smooth(0.85, 0.15, y / h);
        const v = clamp(0.22 + 0.42 * detail + 0.36 * top);
        // Warm grey (the game tints it further).
        outImg.d[p * 4] = enc(v * 0.97);
        outImg.d[p * 4 + 1] = enc(v * 0.93);
        outImg.d[p * 4 + 2] = enc(v * 0.88);
        outImg.d[p * 4 + 3] = Math.round(cov * 255);
      }
    }
    const file = join(out, ".smoke-" + i + ".png");
    writeRgba(outImg, file, ["-resize", "256x256"]);
    return file;
  });
  const src = join(out, "smoke-c.src.png");
  magick([...files, "+append", src]);
  flipbooks["smoke-c"] = { file: "smoke-c.webp", cols: 3, rows: 1, frames: 3, fps: 1, loop: false, blend: "normal", cell: [256, 256], pivot: [0.5, 0.5], start: 0, heading: 0, version: "kenney-1.1", source: "Kenney Particle Pack 1.1 (CC0): smoke_07, smoke_08, smoke_04 as dense lit puffs", alpha: true, ...webp(src, "smoke-c.webp"), width: 768, height: 256 };
  for (const f of files) rmSync(f, { force: true });
  if (sheetDir) magick([src, "-background", "#7da34f", "-alpha", "remove", "-alpha", "off", join(sheetDir, "smoke-c-grass.png")]);
  rmSync(src, { force: true });
}

writeFileSync(join(out, "manifest.json"), JSON.stringify({ version: 1, kind: "firefly", flipbooks }, null, 2) + "\n");
console.log("manifest: " + join(out, "manifest.json") + " (" + Object.keys(flipbooks).join(", ") + ")");
