#!/usr/bin/env node
// Fire test B (owner 31/10 "Làm thử B"; DRAGON_FIRE_DIAGNOSIS_2026-10-31 §2 option B, parent repo): the strong word
// hit from the owner-approved transparent cel clips (FIREFLY_VFX_LIST §5), written under new names into
// public/assets/dragon-hold/vfx/fire-b/ (never over the round-10 or test-A atlases):
//   impact-cel-b.webp  impact-cel v2 (anime burst: flash, starburst, hollow ring, break-up; real straight alpha),
//                      recoloured through a heat ramp: the art's own heat (white, yellow, orange, crimson) capped by
//                      how deep a pixel sits in the burst, so the flat white heart shrinks to the inner ~25 % and the
//                      ladder reads white-yellow > yellow > orange > crimson; dark streaks lift to crimson (no char);
//                      the khaki smoky disc in the hollow (cells 22–26) is cut out (transparent, feathered).
//                      Cells 512 → 256 (the burst is ~100 px at 1080).
//   smoke-cel-b.webp   smoke-cel v2 (cel puff, white to charcoal), cells 0–17 only (the last six have a flat top),
//                      its dark outline ring replaced by the colour just inside it, recoloured to a warm grey ramp
//                      by its own light (the art's bluish greys read cold, round 9 "never cool navy").
//   halo-b.webp        a blurred, orange copy of the recoloured burst's peak (the additive heat glow under it).
//   scorch-b.webp      the painted 038 scorch as data: A = a soft round coverage, R = the painting's detail,
//                      G = a wide falloff (the order it shrinks away in); the game colours it (warm brown, ember edge).
//   manifest.json      read by src/view/fire-b.ts (fireBFlipbooks).
//   node scripts/assets/prepare-fire-b.mjs --from <VFXLAB_HOME>/out/dragon-hold [--scorch <scorch.png>] [--sheet <dir>]
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync, rmSync } from "node:fs";
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

const from = resolve(arg("--from", join(process.env.HOME ?? "", "VFXLab/out/dragon-hold")));
const scorchSrc = resolve(arg("--scorch", join(ROOT, "../dragon-hold/art-src/vfx/scorch.png")));
const sheetDir = arg("--sheet", null);
const out = join(ROOT, "public/assets/dragon-hold/vfx/fire-b");
mkdirSync(out, { recursive: true });
const flipbooks = {};

// ── pixels ────────────────────────────────────────────────────────────────
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
const mix = (a, b, t) => a + (b - a) * t;
function hsv(r, g, b) {
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const d = mx - mn;
  let h = 0;
  if (d > 0) {
    if (mx === r) h = ((g - b) / d) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, mx ? d / mx : 0, mx / 255];
}
/** Chamfer (3-4) distance in px from each `inside` pixel to the nearest outside one (0 outside). */
function distanceIn(inside, w, h) {
  const BIG = 1e9;
  const d = new Float64Array(w * h);
  for (let p = 0; p < d.length; p += 1) d[p] = inside[p] ? BIG : 0;
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : d[y * w + x]);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const p = y * w + x;
      if (!d[p]) continue;
      d[p] = Math.min(d[p], at(x - 1, y) + 3, at(x, y - 1) + 3, at(x - 1, y - 1) + 4, at(x + 1, y - 1) + 4);
    }
  }
  for (let y = h - 1; y >= 0; y -= 1) {
    for (let x = w - 1; x >= 0; x -= 1) {
      const p = y * w + x;
      if (!d[p]) continue;
      d[p] = Math.min(d[p], at(x + 1, y) + 3, at(x, y + 1) + 3, at(x + 1, y + 1) + 4, at(x - 1, y + 1) + 4);
    }
  }
  for (let p = 0; p < d.length; p += 1) d[p] /= 3;
  return d;
}
/** Separable box blur (radius r), run `passes` times (≈ a gaussian). */
function blur(values, w, h, r, passes = 2) {
  let a = Float64Array.from(values);
  let b = new Float64Array(w * h);
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
/** Smooth value noise in [0, 1] (seeded lattice). */
function noise2(x, y, seed = 0) {
  const hash = (i, j) => {
    let n = (i * 374761393 + j * 668265263 + seed * 2246822519) | 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
  };
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  return mix(mix(hash(xi, yi), hash(xi + 1, yi), sx), mix(hash(xi, yi + 1), hash(xi + 1, yi + 1), sx), sy);
}

// ── the heat ramp (sRGB stops; white-yellow > yellow > orange > red > crimson, never char) ──
// The 0.92 stop is a warm yellow under luma 0.9 (it was a pale cream at 0.92 luma): with it the "white" heart (luma
// ≥ 0.9) covered ~0.36 of the radius, over the 0.30 limit (VFX_STANDARD §3.5.3).
const RAMP = [
  [0.2, [165, 24, 20]],
  [0.32, [214, 46, 22]],
  [0.45, [244, 92, 24]],
  [0.58, [255, 142, 28]],
  [0.7, [255, 182, 38]],
  [0.82, [255, 212, 60]],
  [0.92, [255, 228, 112]],
  [1.0, [255, 251, 232]],
];
function ramp(h) {
  h = clamp(h, RAMP[0][0], 1);
  for (let i = 1; i < RAMP.length; i += 1) {
    if (h <= RAMP[i][0]) {
      const [h0, c0] = RAMP[i - 1];
      const [h1, c1] = RAMP[i];
      const t = (h - h0) / (h1 - h0);
      return [mix(c0[0], c1[0], t), mix(c0[1], c1[1], t), mix(c0[2], c1[2], t)];
    }
  }
  return RAMP.at(-1)[1];
}
/** The art's own heat: white 1, yellow ~0.82, orange ~0.6, red ~0.3, crimson 0.24; dim and dark lift to crimson. */
function artHeat(r, g, b) {
  const [hue, s, v] = hsv(r, g, b);
  const hh = hue > 300 ? 0 : Math.min(hue, 60);
  const hueHeat = 0.24 + 0.58 * clamp(hh / 55);
  const white = smooth(0.5, 0.12, s) * smooth(0.7, 0.92, v);
  const heat = mix(hueHeat, 1.0, white) * mix(0.62, 1.0, smooth(0.3, 0.78, v));
  return Math.max(0.2, heat);
}

// ── impact-cel v2: recolour by a capped heat, cut the khaki hollow ─────────
function prepareImpact(version) {
  const json = JSON.parse(readFileSync(join(from, "impact-cel", "impact-cel__" + version + ".json"), "utf8"));
  if (json.channels !== "rgba" || json.premultiplied) throw new Error("impact-cel " + version + ": expected straight RGBA");
  const img = readRgba(join(from, "impact-cel", json.image));
  const [cw, ch] = json.cell;
  const outImg = { w: img.w, h: img.h, d: new Uint8ClampedArray(img.d.length) };
  const stats = [];
  for (let f = 0; f < json.frames; f += 1) {
    const ox = (f % json.cols) * cw;
    const oy = Math.floor(f / json.cols) * ch;
    const n = cw * ch;
    const a = new Float64Array(n);
    const rgb = new Float64Array(n * 3);
    let sx = 0;
    let sy = 0;
    let sa = 0;
    for (let y = 0; y < ch; y += 1) {
      for (let x = 0; x < cw; x += 1) {
        const o = ((oy + y) * img.w + ox + x) * 4;
        const p = y * cw + x;
        a[p] = img.d[o + 3] / 255;
        rgb[p * 3] = img.d[o];
        rgb[p * 3 + 1] = img.d[o + 1];
        rgb[p * 3 + 2] = img.d[o + 2];
        if (a[p] >= 0.5) {
          sx += x;
          sy += y;
          sa += 1;
        }
      }
    }
    const cx = sa ? sx / sa : cw / 2;
    const cy = sa ? sy / sa : ch / 2;
    const R = Math.sqrt(sa / Math.PI) || 1;
    // The hollow (cells 23+): the smoky khaki, grey or dark disc inside the ring goes transparent (feathered). Cell 22
    // only starts to open (a cut there drew a white crescent with two holes, a face): its dark streaks are lifted below.
    if (f >= 23) {
      const cut = new Float64Array(n);
      for (let p = 0; p < n; p += 1) {
        if (a[p] < 0.05) continue;
        const [hue, s, v] = hsv(rgb[p * 3], rgb[p * 3 + 1], rgb[p * 3 + 2]);
        const khaki = hue >= 35 && hue <= 150 && s < 0.6 && v > 0.12 && v < 0.92;
        const grey = s < 0.2 && v < 0.88;
        const dark = v < 0.34;
        const r = Math.hypot((p % cw) - cx, Math.floor(p / cw) - cy) / R;
        if ((khaki || grey || dark) && r < 0.85) cut[p] = 1;
      }
      const soft = blur(cut, cw, ch, 2, 2);
      for (let p = 0; p < n; p += 1) a[p] *= 1 - clamp(soft[p] * 1.6);
    }
    // How deep each pixel sits in the burst (0 at its edge, 1 at its deepest), wobbled by a low noise.
    const inside = new Uint8Array(n);
    for (let p = 0; p < n; p += 1) inside[p] = a[p] >= 0.5 ? 1 : 0;
    const dist = blur(distanceIn(inside, cw, ch), cw, ch, 2, 1);
    // The outer edge only (the hollow's inner edge is the ring's hot side, not its rim): the mask with its holes
    // filled (what the cell's border cannot reach through empty pixels).
    const reach = new Uint8Array(n);
    const stack = [];
    for (let x = 0; x < cw; x += 1) stack.push(x, (ch - 1) * cw + x);
    for (let y = 0; y < ch; y += 1) stack.push(y * cw, y * cw + cw - 1);
    while (stack.length) {
      const p = stack.pop();
      if (reach[p] || inside[p]) continue;
      reach[p] = 1;
      const x = p % cw;
      const y = (p - x) / cw;
      if (x > 0) stack.push(p - 1);
      if (x < cw - 1) stack.push(p + 1);
      if (y > 0) stack.push(p - cw);
      if (y < ch - 1) stack.push(p + cw);
    }
    const outer = blur(distanceIn(reach.map((v) => 1 - v), cw, ch), cw, ch, 1, 1);
    let dmax = 0;
    for (let p = 0; p < n; p += 1) dmax = Math.max(dmax, dist[p]);
    let white = 0;
    let solid = 0;
    for (let y = 0; y < ch; y += 1) {
      for (let x = 0; x < cw; x += 1) {
        const p = y * cw + x;
        const dn = (dmax > 0 ? dist[p] / dmax : 0) + (noise2(x / 22, y / 22, 7) - 0.5) * 0.12 + (noise2(x / 7, y / 7, 3) - 0.5) * 0.04;
        // Depth in px too: a thin ring or ray is never lifted to yellow or white by its own normalised depth.
        const deep = smooth(10, 22, dist[p]);
        // The cap: rays and rims yellow-orange, the body yellow, white only in the deep heart (its inner ~25 %).
        const cap = 0.7 + 0.13 * smooth(0.1, 0.18, dn) * deep + 0.17 * smooth(0.7, 0.8, dn) * deep;
        // A floor that rises with depth: the art's dark streaks inside the body turn yellow, never char or crimson
        // lines in the heart (on the thin rays they stay a crimson stroke).
        const floor = 0.2 + 0.55 * smooth(0.22, 0.5, dn) * deep;
        // A crisp crimson rim round the body (the value ladder's dark edge, hot red, never char): its outer ~4 px
        // (of 512), fading into the orange by ~11 px; not on the rays beyond the body's radius (they stay hot).
        const r = Math.hypot(x - cx, y - cy) / R;
        const rimCap = mix(1, 0.24 + 0.76 * smooth(3.5, 12, outer[p]), 1 - smooth(0.95, 1.2, r));
        const heat = Math.min(Math.max(artHeat(rgb[p * 3], rgb[p * 3 + 1], rgb[p * 3 + 2]), floor), cap, rimCap);
        const c = ramp(heat);
        const o = ((oy + y) * img.w + ox + x) * 4;
        outImg.d[o] = c[0];
        outImg.d[o + 1] = c[1];
        outImg.d[o + 2] = c[2];
        outImg.d[o + 3] = Math.round(a[p] * 255);
        if (a[p] >= 0.5) {
          solid += 1;
          if (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2] >= 0.9 * 255) white += 1;
        }
      }
    }
    stats.push({ f, R: +R.toFixed(1), whiteRofR: solid ? +Math.sqrt(white / solid).toFixed(3) : 0 });
  }
  const full = join(out, "impact-cel-" + version + ".full.png");
  writeRgba(outImg, full);
  return { json, full, stats };
}

const impact = prepareImpact("v2");
const half = join(out, "impact-cel-b.src.png");
// 512 → 256 cells (the burst is ~100 px tall at 1080), alpha-weighted.
magick([impact.full, "-filter", "Lanczos", "-resize", "50%", half]);
const impactMade = webp(half, "impact-cel-b.webp");
flipbooks["impact-cel-b"] = {
  file: "impact-cel-b.webp",
  cols: impact.json.cols,
  rows: impact.json.rows,
  frames: impact.json.frames,
  fps: impact.json.fps,
  loop: false,
  blend: "normal",
  cell: [impact.json.cell[0] / 2, impact.json.cell[1] / 2],
  pivot: impact.json.pivot,
  start: 0,
  heading: 0,
  version: "v2",
  source: "Adobe Firefly Video transparent (impact-cel v2), heat-ramp recolour",
  alpha: true,
  ...impactMade,
  width: impact.json.atlas[0] / 2,
  height: impact.json.atlas[1] / 2,
};
console.log("impact-cel-b: " + impact.json.frames + " frames, " + Math.round(impactMade.bytes / 1024) + " KB; white r/R per frame: " + impact.stats.map((s) => s.f + ":" + s.whiteRofR).join(" "));

// The halo: the recoloured burst's peak (cell 16), premultiplied on black, blurred, faded round, turned orange.
{
  const peak = 16;
  const [cw, ch] = impact.json.cell;
  const cx = (peak % impact.json.cols) * cw;
  const cy = Math.floor(peak / impact.json.cols) * ch;
  const haloSrc = join(out, "halo-b.src.png");
  magick([
    impact.full, "-crop", cw + "x" + ch + "+" + cx + "+" + cy, "+repage", "-background", "black", "-alpha", "remove", "-alpha", "off",
    "-gravity", "center", "-extent", Math.round(cw * 1.5) + "x" + Math.round(ch * 1.5),
    "-blur", "0x" + Math.round(cw * 0.1),
    "(", "-size", Math.round(cw * 1.5) + "x" + Math.round(ch * 1.5), "radial-gradient:white-black", "-level", "0%,90%", ")",
    "-compose", "multiply", "-composite",
    "-channel", "G", "-evaluate", "multiply", "0.5", "-channel", "B", "-evaluate", "multiply", "0.16", "+channel",
    "-resize", "256x256", haloSrc,
  ]);
  flipbooks["halo-b"] = { file: "halo-b.webp", cols: 1, rows: 1, frames: 1, fps: 1, loop: false, blend: "additive", cell: [256, 256], pivot: [0.5, 0.5], start: 0, heading: 0, version: "v2-f" + peak, source: "impact-cel-b frame " + peak + ", blurred, orange", alpha: false, ...webp(haloSrc, "halo-b.webp"), width: 256, height: 256 };
  rmSync(haloSrc, { force: true });
}

// ── smoke-cel v2: no outline, warm grey, cells 0–17 ───────────────────────
{
  const json = JSON.parse(readFileSync(join(from, "smoke-cel", "smoke-cel__v2.json"), "utf8"));
  if (json.channels !== "rgba" || json.premultiplied) throw new Error("smoke-cel v2: expected straight RGBA");
  const img = readRgba(join(from, "smoke-cel", json.image));
  const [cw, ch] = json.cell;
  const keep = Math.min(json.frames, Number(arg("--smoke-frames", "18")));
  const cols = json.cols;
  const rows = Math.ceil(keep / cols);
  const outImg = { w: cols * cw, h: rows * ch, d: new Uint8ClampedArray(cols * cw * rows * ch * 4) };
  const lw = [0.2126, 0.7152, 0.0722];
  // The clip's charcoal end is lifted to a warm mid grey: at the play camera a charcoal puff behind the foe read as
  // a dark rock (the judges' "rocks or cauliflower" in test A).
  const GREY = [
    [0.0, [92, 85, 79]],
    [0.25, [114, 106, 99]],
    [0.55, [158, 150, 141]],
    [0.85, [222, 215, 204]],
    [1.0, [242, 237, 228]],
  ];
  const grey = (l) => {
    l = clamp(l);
    for (let i = 1; i < GREY.length; i += 1) {
      if (l <= GREY[i][0]) {
        const t = (l - GREY[i - 1][0]) / (GREY[i][0] - GREY[i - 1][0]);
        return GREY[i - 1][1].map((v, k) => mix(v, GREY[i][1][k], t));
      }
    }
    return GREY.at(-1)[1];
  };
  for (let f = 0; f < keep; f += 1) {
    const ox = (f % json.cols) * cw;
    const oy = Math.floor(f / json.cols) * ch;
    const n = cw * ch;
    const a = new Float64Array(n);
    const L = new Float64Array(n);
    for (let y = 0; y < ch; y += 1) {
      for (let x = 0; x < cw; x += 1) {
        const o = ((oy + y) * img.w + ox + x) * 4;
        const p = y * cw + x;
        a[p] = img.d[o + 3] / 255;
        L[p] = (lw[0] * img.d[o] + lw[1] * img.d[o + 1] + lw[2] * img.d[o + 2]) / 255;
      }
    }
    // The outline ring sits in the outer ~5 px: its light comes from just inside it (normalised convolution of the
    // interior, eroded 4 px), so the edge carries the puff's own shade instead of a dark line.
    const solid = new Uint8Array(n);
    for (let p = 0; p < n; p += 1) solid[p] = a[p] >= 0.9 ? 1 : 0;
    const depth = distanceIn(solid, cw, ch);
    const m = new Float64Array(n);
    const lm = new Float64Array(n);
    for (let p = 0; p < n; p += 1) {
      if (depth[p] >= 4) {
        m[p] = 1;
        lm[p] = L[p];
      }
    }
    // The art's thin dark strokes inside the puff (cracks in the first cells): lifted to the shade round them.
    const near = blur(L, cw, ch, 3, 2);
    for (let p = 0; p < n; p += 1) L[p] = Math.max(L[p], near[p] - 0.1);
    for (let p = 0; p < n; p += 1) if (m[p]) lm[p] = L[p];
    const bm = blur(m, cw, ch, 4, 2);
    const bl = blur(lm, cw, ch, 4, 2);
    for (let y = 0; y < ch; y += 1) {
      for (let x = 0; x < cw; x += 1) {
        const p = y * cw + x;
        let l = L[p];
        if (depth[p] < 4 && bm[p] > 0.02) l = mix(bl[p] / bm[p], l, smooth(2, 4, depth[p]));
        const c = grey(l);
        const tx = (f % cols) * cw + x;
        const ty = Math.floor(f / cols) * ch + y;
        const o = (ty * outImg.w + tx) * 4;
        outImg.d[o] = c[0];
        outImg.d[o + 1] = c[1];
        outImg.d[o + 2] = c[2];
        outImg.d[o + 3] = Math.round(a[p] * 255);
      }
    }
  }
  const src = join(out, "smoke-cel-b.src.png");
  writeRgba(outImg, src);
  flipbooks["smoke-cel-b"] = { file: "smoke-cel-b.webp", cols, rows, frames: keep, fps: json.fps, loop: false, blend: "normal", cell: json.cell, pivot: json.pivot, start: 0, heading: 0, version: "v2", source: "Adobe Firefly Video transparent (smoke-cel v2), cells 0-" + (keep - 1) + ", no outline, warm grey", alpha: true, ...webp(src, "smoke-cel-b.webp"), width: outImg.w, height: outImg.h };
  if (!sheetDir) rmSync(src, { force: true });
  console.log("smoke-cel-b: " + keep + " frames");
}

// ── scorch-b: the 038 painting as coverage, detail and falloff ────────────
{
  const img = readRgba(scorchSrc);
  const { w, h } = img;
  const n = w * h;
  const A = new Float64Array(n);
  const P = new Float64Array(n);
  for (let p = 0; p < n; p += 1) {
    A[p] = img.d[p * 4 + 3] / 255;
    P[p] = (0.2126 * img.d[p * 4] + 0.7152 * img.d[p * 4 + 1] + 0.0722 * img.d[p * 4 + 2]) / 255;
  }
  const soft = blur(A, w, h, 9, 3);
  const wide = blur(A, w, h, 36, 3);
  let wmax = 0;
  for (let p = 0; p < n; p += 1) wmax = Math.max(wmax, wide[p]);
  const pd = blur(P.map((v, p) => v * A[p]), w, h, 1, 1);
  const pa = blur(A, w, h, 1, 1);
  const enc = (v) => {
    v = clamp(v);
    return Math.round(255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055));
  };
  const outImg = { w, h, d: new Uint8ClampedArray(n * 4) };
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const p = y * w + x;
      // A round, soft footprint: the spatter's density, wobbled at its edge, never a flat disc.
      const r = Math.hypot(x / w - 0.5, y / h - 0.5) * 2;
      const cov = smooth(0.06, 0.3, soft[p] + (noise2(x / 18, y / 18, 11) - 0.5) * 0.1) * (1 - smooth(0.86, 1.0, r));
      const detail = pa[p] > 0.02 ? pd[p] / pa[p] : 0.5;
      // Stored so the sRGB decode gives back the value (data, not colour).
      outImg.d[p * 4] = enc(detail);
      outImg.d[p * 4 + 1] = enc(wide[p] / (wmax || 1));
      outImg.d[p * 4 + 2] = 0;
      outImg.d[p * 4 + 3] = Math.round(cov * 255);
    }
  }
  const src = join(out, "scorch-b.src.png");
  writeRgba(outImg, src, ["-resize", "256x256"]);
  flipbooks["scorch-b"] = { file: "scorch-b.webp", cols: 1, rows: 1, frames: 1, fps: 1, loop: false, blend: "normal", cell: [256, 256], pivot: [0.5, 0.5], start: 0, heading: 0, version: "038-b", source: "art-src/vfx/scorch.png (ticket 038): coverage, detail, falloff", alpha: true, ...webp(src, "scorch-b.webp"), width: 256, height: 256 };
  if (!sheetDir) rmSync(src, { force: true });
}

// Review sheets (optional): the recoloured burst and smoke over dark and light ground.
if (sheetDir) {
  mkdirSync(sheetDir, { recursive: true });
  for (const [name, file, tile] of [["impact-cel-b", half, "8x4"], ["smoke-cel-b", join(out, "smoke-cel-b.src.png"), "8x3"], ["scorch-b", join(out, "scorch-b.src.png"), "1x1"]]) {
    for (const [ground, colour] of [["dark", "#20242a"], ["grass", "#7da34f"], ["sand", "#d9c08e"]]) {
      magick([file, "-background", colour, "-alpha", "remove", "-alpha", "off", "-quality", "88", join(sheetDir, name + "-" + ground + ".jpg")]);
    }
  }
  console.log("sheets: " + sheetDir + " (tiles " + "impact 8x4, smoke 8x3)");
}
rmSync(half, { force: true });
rmSync(impact.full, { force: true });
for (const f of ["smoke-cel-b.src.png", "scorch-b.src.png"]) rmSync(join(out, f), { force: true });

writeFileSync(join(out, "manifest.json"), JSON.stringify({ version: 1, kind: "firefly", flipbooks }, null, 2) + "\n");
console.log("manifest: " + join(out, "manifest.json") + " (" + Object.keys(flipbooks).join(", ") + ")");
