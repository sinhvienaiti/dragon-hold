#!/usr/bin/env node
// Fire test A's measured acceptance (DRAGON_FIRE_DIAGNOSIS_2026-10-31 §3, parent repo) on one dh-fire-bench run
// (<size>-<ground>-<variant>/: ref.png, nofoe.png, s###.png, fire-s###.png and smoke-s###.png masks, run.json).
// f0 is the frame the impact clip is first drawn; frames f-5 … f+90 are read. "The effect" is what changed against
// the frame before the shot (vfx-gates.mjs `changed`, ±win px, the damage numbers cut out); the fire and smoke masks
// are the flipbooks alone, depth-tested (dh-fire-bench `mask`).
// The foe's own pixels (ref against nofoe, grown 3 px, tracked frame by frame) are left out of the colour shares.
//   olive        mustard/olive share (hue 45–95°, s > 0.2, v 0.3–0.8) of the effect's interior in the fire's fade frames,
//                f0 until the fire mask is under 5 % of its peak (≤ 0.02); oliveAll: every frame f0…f+90 (smoke, scorch)
//   brown        brown-silhouette share (hue 0–30°, s ≥ 0.5, v ≤ 0.35) of the effect's interior, from f+15 (≤ 0.03)
//   straight     the longest straight run of the fire body's outline, px, f0…f+60 (≤ 20 at 1080)
//   ladder       at the peak (f0…f+10, most light gained in the fire mask), greyscale (sRGB luma):
//                rim (outer band of the fire mask) ≤ 0.30, body (0.3–0.8 R) ≥ ground + 0.15, core p90 (≤ 0.3 R) ≥ 0.90
//                with the white (luma ≥ 0.9) inside 0.3 R, white (luma ≥ 0.95) ≤ 6 % of the field
//   colour       core hue 35–55° (circular mean, s ≥ 0.15, v ≥ 0.5, ≤ 0.3 R); peach (hue 10–30°, s ≤ 0.45, v ≥ 0.85)
//                ≤ 2 % of the fire mask, f0…f+30
//   smoke        largest smoke area ≤ the fire's peak area; frames it covers the foe (≥ 25 % of its pixels) ≤ 10;
//                lit − shaded (each puff split round its local centre by the sun on screen) ≥ 0.12; coverage drop ≤ 25 % a frame (while ≥ 10 % of peak)
//   iou          fire outline IoU(f, f+4), f0…f+20 (≤ 0.85)
//   flashFirst   the impact's first frame: mean luma gained in a disc of 0.08 H round the struck point, f0 over the
//                brightest of f0…f+8 (≥ 0.95, §3.1 rule 5)
// Test B adds (the judges' test-A defects, measured):
//   size         the fire's equivalent diameter (2√(area/π)) at its largest, f0…f+40, over the foe's height on screen
//                (base to top): 1.6–2.2; with its bounding height and the centroid's offset from the struck point
//   fireFoe      frames the fire covers ≥ 50 % of the foe's pixels (it hid the foe f0…f+18 in test A) (≤ 10)
//   heroes       the Dragons' visible pixels (hero-s###.png) under the fire or the smoke: the largest share and the
//                frames over 5 % (units stay over the effects) (≤ 0.05 and 0)
//   black        near-black share (v < 0.12) of the effect's interior, f0…f+90 (the ink blot) (≤ 0.01)
//   charEarly    dark (v < 0.3) changed pixels outside the fire mask, f0…f+6, over the fire's area then (char before
//                anything burned) (≤ 0.02)
//   smokeStart   the first frame with smoke on screen, f0 = 0
//   left2.5s     changed pixels round the foe's feet (an ellipse 1.5 × 1.0 foe heights; the foe grown 6 px and the
//                Dragons, as now and as at the shot, left out) at f+150 over their largest count f+30…f+90 (≤ 0.05: the
//                scorch has gone by ~2.5 s); needs S_END ≥ f0 + 150
//   oliveChanged the olive share counted on changed pixels only (no hole filling): ground seen unchanged through the
//                hollow of test B's ring is not the effect; test A's gate fills holes (its lace of holes was a veil)
// Test C adds (its brief: 2.5–3× the foe at the peak, smoke off the Dragons, smoke gone by ~2 s):
//   sizeSolid    the same equivalent diameter counted on the fire's solid part only (coverage ≥ 0.5), f0…f+40, over
//                the foe's height: target 2.5–3.0 (the 1.6–2.2 band above was test B's)
//   heroSmoke    frames the smoke alone covers > 5 % of the Dragons' visible pixels (≤ 10); heroFire the same for the fire
//   smokeEnd     the last frame with smoke on screen (gone by ~f+120)
//   node scripts/visual/fire-gates.mjs <run dir> [--json out.json]
//   node scripts/visual/fire-gates.mjs --all <bench dir> [out dir]   (every run: gates.json and gates.md; a run with its
//   own gates-run.json, written by `<run dir> --json <run dir>/gates-run.json`, is reused)
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { changed, clearTags, hsv, interior, olive, read, salmon, straightest } from "./vfx-gates.mjs";

const brown = (h, s, v) => h <= 30 && s >= 0.5 && v <= 0.35;
const luma = (d, i) => (0.2126 * d[i * 3] + 0.7152 * d[i * 3 + 1] + 0.0722 * d[i * 3 + 2]) / 255;

/** A grey mask (half size) upsampled ×2 to the frame, inside `box`: Uint8Array of 0–255 (zeros when absent). */
function readMask(file, box, w, h) {
  if (!existsSync(file)) return new Uint8Array(box.w * box.h);
  const size = spawnSync("magick", ["identify", "-format", "%w %h", file], { encoding: "utf8" }).stdout.trim().split(/\s+/).map(Number);
  const raw = spawnSync("magick", [file, "-depth", "8", "gray:-"], { maxBuffer: 256 << 20 }).stdout;
  const [mw, mh] = size;
  const out = new Uint8Array(box.w * box.h);
  for (let y = 0; y < box.h; y += 1) {
    const my = Math.min(mh - 1, Math.floor(((y + box.y) * mh) / h));
    for (let x = 0; x < box.w; x += 1) {
      const mx = Math.min(mw - 1, Math.floor(((x + box.x) * mw) / w));
      out[y * box.w + x] = raw[my * mw + mx];
    }
  }
  return out;
}

/** Binary erosion by a (2r+1)² square, separable. */
function erode(mask, w, h, r) {
  const tmp = new Uint8Array(w * h);
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      let all = 1;
      for (let k = -r; k <= r && all; k += 1) {
        const xx = x + k;
        if (xx < 0 || xx >= w || !mask[y * w + xx]) all = 0;
      }
      tmp[y * w + x] = all;
    }
  }
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      let all = 1;
      for (let k = -r; k <= r && all; k += 1) {
        const yy = y + k;
        if (yy < 0 || yy >= h || !tmp[yy * w + x]) all = 0;
      }
      out[y * w + x] = all;
    }
  }
  return out;
}

/** Sum over the (2r+1)² box round each pixel (an integral image). */
function boxSum(values, w, h, r) {
  const I = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y += 1) {
    let row = 0;
    for (let x = 0; x < w; x += 1) {
      row += values[y * w + x];
      I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1] + row;
    }
  }
  const out = new Float64Array(w * h);
  for (let y = 0; y < h; y += 1) {
    const y0 = Math.max(0, y - r);
    const y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x += 1) {
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(w, x + r + 1);
      out[y * w + x] = I[y1 * (w + 1) + x1] - I[y0 * (w + 1) + x1] - I[y1 * (w + 1) + x0] + I[y0 * (w + 1) + x0];
    }
  }
  return out;
}

const median = (values) => {
  if (values.length === 0) return null;
  const v = Float64Array.from(values).sort();
  return v[Math.floor(v.length / 2)];
};
const pct = (values, p) => {
  if (values.length === 0) return null;
  const v = Float64Array.from(values).sort();
  return v[Math.min(v.length - 1, Math.floor(v.length * p))];
};
const r4 = (x) => (x === null || x === undefined || Number.isNaN(x) ? null : +x.toFixed(4));

export function fireGates(dir) {
  const run = JSON.parse(readFileSync(join(dir, "run.json"), "utf8"));
  const [W, H] = run.size;
  const k = H / 1080;
  const f0 = run.f0;
  const name = (i) => "s" + String(i).padStart(3, "0");
  const at = run.track[f0];
  const box = { x: Math.max(0, Math.round(at.hit.x - 0.28 * H)), y: Math.max(0, Math.round(at.hit.y - 0.36 * H)) };
  box.w = Math.min(W - box.x, Math.round(0.56 * H));
  box.h = Math.min(H - box.y, Math.round(0.52 * H));
  const win = Math.max(6, Math.round(10 * k));
  const ref = read(join(dir, "ref.png"), box);
  const refFull = read(join(dir, "ref.png"));
  // The foe's own pixels: where the frame with it differs from the frame without it, round its anchors.
  const nofoe = read(join(dir, "nofoe.png"), box);
  const fh = Math.max(8, Math.abs(at.base.y - at.top.y));
  const foe = new Uint8Array(box.w * box.h);
  let foePx = 0;
  for (let y = 0; y < box.h; y += 1) {
    const gy = y + box.y;
    if (gy < at.top.y - 0.4 * fh || gy > at.base.y + 0.15 * fh) continue;
    for (let x = 0; x < box.w; x += 1) {
      const gx = x + box.x;
      if (Math.abs(gx - at.base.x) > 0.8 * fh) continue;
      const i = (y * box.w + x) * 3;
      const d = Math.max(Math.abs(ref.d[i] - nofoe.d[i]), Math.abs(ref.d[i + 1] - nofoe.d[i + 1]), Math.abs(ref.d[i + 2] - nofoe.d[i + 2]));
      if (d > 40) {
        foe[y * box.w + x] = 1;
        foePx += 1;
      }
    }
  }
  // The foe is not the effect: its pixels (and its shadow), grown 3 px and moved with it, stay out of the colour
  // shares (a moss-grunt is olive itself; when it flinches its own pixels count as changed).
  const foeOut = new Uint8Array(box.w * box.h);
  {
    const grown = erode(foe.map((v) => 1 - v), box.w, box.h, 3);
    for (let p = 0; p < foeOut.length; p += 1) foeOut[p] = 1 - grown[p];
  }
  // Where the foe is now: its hit reaction moves its body on screen (its logical spot stays). Each frame, the shift
  // (± 0.6 of its height) that best matches its reference pixels not under the fire or the smoke; held when too
  // little of it shows.
  const foeList = [];
  for (let p = 0; p < foe.length; p += 1) if (foe[p]) foeList.push(p);
  const reach = Math.round(0.6 * fh);
  let shift = [0, 0];
  const track = (img, fire, smoke) => {
    let best = null;
    for (let dy = -reach; dy <= reach; dy += 1) {
      for (let dx = -reach; dx <= reach; dx += 1) {
        let sum = 0;
        let n = 0;
        for (const p of foeList) {
          const x = (p % box.w) + dx;
          const y = Math.floor(p / box.w) + dy;
          if (x < 0 || y < 0 || x >= box.w || y >= box.h) continue;
          const q = y * box.w + x;
          if (fire[q] >= 26 || smoke[q] >= 26) continue;
          sum += Math.abs(img.d[q * 3] - ref.d[p * 3]) + Math.abs(img.d[q * 3 + 1] - ref.d[p * 3 + 1]) + Math.abs(img.d[q * 3 + 2] - ref.d[p * 3 + 2]);
          n += 1;
        }
        if (n < 0.3 * foeList.length) continue;
        const cost = sum / n + 0.2 * Math.hypot(dx - shift[0], dy - shift[1]);
        if (best === null || cost < best.cost) best = { cost, d: [dx, dy] };
      }
    }
    if (best !== null) shift = best.d;
    return shift;
  };
  const shifted = (mask, d, p) => {
    const x = (p % box.w) - d[0];
    const y = Math.floor(p / box.w) - d[1];
    return x >= 0 && y >= 0 && x < box.w && y < box.h && mask[y * box.w + x] === 1;
  };
  // The sun's direction on screen (from the struck point a metre toward the sun).
  const sx = at.sun.x - at.hit.x;
  const sy = at.sun.y - at.hit.y;
  const sl = Math.hypot(sx, sy) || 1;
  const sun = [sx / sl, sy / sl];

  const rows = [];
  const fireMasks = new Map();
  const foeH = Math.max(8, at.base.y - at.top.y);
  // The Dragons as at the shot (the first captured frame), grown 6 px: their idle moves them off the reference.
  const heroAtShot = (() => {
    const m = readMask(join(dir, "hero-" + name(0) + ".png"), box, W, H);
    const bin = new Float64Array(m.length);
    for (let p = 0; p < m.length; p += 1) bin[p] = m[p] >= 64 ? 1 : 0;
    return boxSum(bin, box.w, box.h, 6);
  })();
  const foeGrown = (() => {
    const bin = new Float64Array(foe.length);
    for (let p = 0; p < foe.length; p += 1) bin[p] = foe[p];
    const sum = boxSum(bin, box.w, box.h, 6);
    return Uint8Array.from(sum, (v) => (v > 0 ? 1 : 0));
  })();
  // Up to f+160 where captured (the scorch's 2.5 s); the summary windows of test A stay f0…f+90.
  for (let f = f0 - 5; f <= f0 + 160 && f < run.track.length && existsSync(join(dir, name(f) + ".png")); f += 1) {
    const rel = f - f0;
    const img = read(join(dir, name(f) + ".png"), box);
    const tags = run.track[f]?.numbers ?? [];
    const full = clearTags(changed(img, ref, 1, win), box, tags);
    const inner = interior(full, box.w, box.h);
    const fire = readMask(join(dir, "fire-" + name(f) + ".png"), box, W, H);
    const smoke = readMask(join(dir, "smoke-" + name(f) + ".png"), box, W, H);
    const hero = readMask(join(dir, "hero-" + name(f) + ".png"), box, W, H);
    const foeAt = rel >= 0 ? [...track(img, fire, smoke)] : [0, 0];
    let region = 0;
    let ol = 0;
    let br = 0;
    let black = 0;
    let darkOut = 0;
    let heroPx = 0;
    let heroUnder = 0;
    let heroSmoke = 0;
    let heroFire = 0;
    let fireOnFoe = 0;
    let changedN = 0;
    let changedOlive = 0;
    let feet = 0;
    const heroNow = (() => {
      const bin = new Float64Array(hero.length);
      for (let p = 0; p < hero.length; p += 1) bin[p] = hero[p] >= 64 ? 1 : 0;
      return boxSum(bin, box.w, box.h, 6);
    })();
    for (let y = 0; y < box.h; y += 1) {
      for (let x = 0; x < box.w; x += 1) {
        const p = y * box.w + x;
        if (hero[p] >= 128) {
          heroPx += 1;
          if (fire[p] >= 128 || smoke[p] >= 128) heroUnder += 1;
          if (smoke[p] >= 128) heroSmoke += 1;
          if (fire[p] >= 128) heroFire += 1;
        }
        if (fire[p] >= 128 && shifted(foe, foeAt, p)) fireOnFoe += 1;
        if (full[p] && !shifted(foeOut, foeAt, p) && hero[p] < 64) {
          const [h2, s2, v2] = hsv(img.d[p * 3], img.d[p * 3 + 1], img.d[p * 3 + 2]);
          changedN += 1;
          if (olive(h2, s2, v2)) changedOlive += 1;
        }
        if (full[p] && !shifted(foeGrown, foeAt, p) && heroNow[p] === 0 && heroAtShot[p] === 0) {
          const ex = (x + box.x - at.base.x) / (1.5 * foeH);
          const ey = (y + box.y - at.base.y) / (1.0 * foeH);
          if (ex * ex + ey * ey <= 1) feet += 1;
        }
        if (!inner[p] || shifted(foeOut, foeAt, p) || hero[p] >= 64) continue;
        const [hh, s, v] = hsv(img.d[p * 3], img.d[p * 3 + 1], img.d[p * 3 + 2]);
        region += 1;
        if (olive(hh, s, v)) ol += 1;
        if (brown(hh, s, v)) br += 1;
        if (v < 0.12) black += 1;
        if (v < 0.3 && fire[p] < 26 && smoke[p] < 26) darkOut += 1;
      }
    }
    // The impact's light: mean luma gained over the reference in a disc of 0.08 H round the struck point.
    let discGain = 0;
    let discN = 0;
    {
      const hx = at.hit.x - box.x;
      const hy = at.hit.y - box.y;
      const rr = 0.08 * H;
      for (let y = Math.max(0, Math.floor(hy - rr)); y < Math.min(box.h, Math.ceil(hy + rr)); y += 1) {
        for (let x = Math.max(0, Math.floor(hx - rr)); x < Math.min(box.w, Math.ceil(hx + rr)); x += 1) {
          if ((x - hx) ** 2 + (y - hy) ** 2 > rr * rr) continue;
          const p = y * box.w + x;
          discGain += luma(img.d, p) - luma(ref.d, p);
          discN += 1;
        }
      }
    }
    // Fire mask stats: area (coverage ≥ 0.15), peach share, light gained, centroid.
    let fireArea = 0;
    let fireSolid = 0;
    let peach = 0;
    let gain = 0;
    let cx = 0;
    let cy = 0;
    let cw = 0;
    const fireBin = new Uint8Array(box.w * box.h);
    for (let p = 0; p < fire.length; p += 1) {
      if (fire[p] < 38) continue;
      if (fire[p] >= 128) fireSolid += 1;
      fireBin[p] = 1;
      fireArea += 1;
      const [hh, s, v] = hsv(img.d[p * 3], img.d[p * 3 + 1], img.d[p * 3 + 2]);
      if (salmon(hh, s, v)) peach += 1;
      gain += Math.max(0, luma(img.d, p) - luma(ref.d, p));
      const wgt = fire[p] / 255;
      cx += (p % box.w) * wgt;
      cy += Math.floor(p / box.w) * wgt;
      cw += wgt;
    }
    fireMasks.set(rel, fireBin);
    // Smoke: area, coverage, foe cover, lit − shaded.
    let smokeArea = 0;
    let smokeCov = 0;
    let foeCovered = 0;
    // Dense smoke pixels clear of the fire (the lit − shaded sample).
    let sn = 0;
    for (let p = 0; p < smoke.length; p += 1) {
      smokeCov += smoke[p] / 255;
      if (smoke[p] >= 38) smokeArea += 1;
      if (smoke[p] >= 128) {
        if (shifted(foe, foeAt, p)) foeCovered += 1;
        if (fire[p] < 26) sn += 1;
      }
    }
    // Lit − shaded inside each puff: every dense smoke pixel's offset from the local centre of the smoke round it
    // (a box of about half a puff's radius), along the sun on screen; the sun side's mean luma minus the other's.
    let lit = null;
    if (sn > 50) {
      const r = Math.max(4, Math.round(0.5 * Math.sqrt(sn / Math.PI / 3)));
      const dense = new Float64Array(box.w * box.h);
      const xs = new Float64Array(box.w * box.h);
      const ys = new Float64Array(box.w * box.h);
      for (let p = 0; p < dense.length; p += 1) {
        if (smoke[p] < 128 || fire[p] >= 26) continue;
        dense[p] = 1;
        xs[p] = p % box.w;
        ys[p] = Math.floor(p / box.w);
      }
      const sumD = boxSum(dense, box.w, box.h, r);
      const sumX = boxSum(xs, box.w, box.h, r);
      const sumY = boxSum(ys, box.w, box.h, r);
      let la = 0;
      let na = 0;
      let lb = 0;
      let nb = 0;
      for (let p = 0; p < dense.length; p += 1) {
        if (!dense[p] || sumD[p] < 4) continue;
        const d = (xs[p] - sumX[p] / sumD[p]) * sun[0] + (ys[p] - sumY[p] / sumD[p]) * sun[1];
        if (d > 0.25 * r) {
          la += luma(img.d, p);
          na += 1;
        } else if (d < -0.25 * r) {
          lb += luma(img.d, p);
          nb += 1;
        }
      }
      if (na > 20 && nb > 20) lit = la / na - lb / nb;
    }
    // Number boxes under smoke (the numbers draw in the overlay, over everything: geometric overlap only).
    let numberOverlap = 0;
    for (const [nx, ny, nw, nh] of tags) {
      let n = 0;
      let c = 0;
      for (let y = Math.max(0, Math.floor(ny - box.y)); y < Math.min(box.h, Math.ceil(ny - box.y + nh)); y += 1) {
        for (let x = Math.max(0, Math.floor(nx - box.x)); x < Math.min(box.w, Math.ceil(nx - box.x + nw)); x += 1) {
          n += 1;
          if (smoke[y * box.w + x] >= 128) c += 1;
        }
      }
      if (n > 0) numberOverlap = Math.max(numberOverlap, c / n);
    }
    const edge = rel >= 0 && rel <= 60 ? straightest(img, full, box, tags) : { length: null };
    rows.push({
      f,
      rel,
      ms: Math.round((rel * 1000) / 60),
      region,
      olive: region ? r4(ol / region) : 0,
      brown: region ? r4(br / region) : 0,
      straightPx: edge.length,
      fireArea,
      peach: fireArea ? r4(peach / fireArea) : 0,
      gain: r4(gain),
      discGain: discN ? r4(discGain / discN) : null,
      centre: cw > 0 ? [cx / cw, cy / cw] : null,
      smokeArea,
      smokeCov: r4(smokeCov),
      foeCover: foePx ? r4(foeCovered / foePx) : 0,
      foeShift: foeAt,
      litMinusShaded: r4(lit),
      numberOverlap: r4(numberOverlap),
      black: region ? r4(black / region) : 0,
      darkOut,
      heroPx,
      heroUnder: heroPx ? r4(heroUnder / heroPx) : 0,
      heroSmoke: heroPx ? r4(heroSmoke / heroPx) : 0,
      heroFire: heroPx ? r4(heroFire / heroPx) : 0,
      fireSolid,
      fireFoe: foePx ? r4(fireOnFoe / foePx) : 0,
      oliveChanged: changedN ? r4(changedOlive / changedN) : 0,
      feet,
      bbox: rel >= 0 && fireArea > 0 ? bboxOf(fireBin, box.w, box.h) : null,
    });
  }
  const tail = rows.filter((r) => r.rel > 90);
  const after = rows.filter((r) => r.rel >= 0 && r.rel <= 90);
  // The peak: most light gained inside the fire mask, f0…f+10.
  const early = after.filter((r) => r.rel <= 10 && r.fireArea > 0);
  const peak = early.reduce((a, b) => (b.gain > a.gain ? b : a), early[0]);
  const ladder = peak ? valueLadder(dir, name(peak.f), box, fireMasks.get(peak.rel), peak, ref, refFull, H) : null;
  // IoU(f, f+4) of the fire outline, f0…f+20, while both carry ≥ 5 % of the peak area.
  const peakArea = Math.max(...after.map((r) => r.fireArea));
  const lastFire = after.reduce((last, r) => (r.fireArea >= 0.05 * peakArea ? r.rel : last), 0);
  const fade = after.filter((r) => r.rel <= lastFire);
  const ious = [];
  for (let rel = 0; rel <= 20; rel += 1) {
    const a = fireMasks.get(rel);
    const b = fireMasks.get(rel + 4);
    if (!a || !b) continue;
    let inter = 0;
    let uni = 0;
    let na = 0;
    let nb = 0;
    for (let p = 0; p < a.length; p += 1) {
      if (a[p]) na += 1;
      if (b[p]) nb += 1;
      if (a[p] && b[p]) inter += 1;
      if (a[p] || b[p]) uni += 1;
    }
    if (na < 0.05 * peakArea || nb < 0.05 * peakArea) continue;
    ious.push({ rel, iou: r4(inter / uni) });
  }
  const smokePeak = Math.max(...after.map((r) => r.smokeArea));
  const covPeak = Math.max(...after.map((r) => r.smokeCov));
  let dropMax = 0;
  let dropAt = null;
  for (let i = 0; i + 1 < after.length; i += 1) {
    const c = after[i].smokeCov;
    if (c < 0.1 * covPeak || c <= 0) continue;
    const d = (c - after[i + 1].smokeCov) / c;
    if (d > dropMax) {
      dropMax = d;
      dropAt = after[i].rel;
    }
  }
  const litRows = after.filter((r) => r.litMinusShaded !== null && r.smokeArea >= 0.3 * smokePeak);
  const straight = after.filter((r) => r.straightPx !== null).map((r) => r.straightPx);
  const summary = {
    size: W + "x" + H,
    ground: run.ground,
    variant: run.variant,
    f0,
    box,
    // The fade frames (the gate): f0 to the last frame the fire covers ≥ 5 % of its peak area. All frames (smoke and
    // scorch too) are reported beside it.
    oliveMax: Math.max(...fade.map((r) => r.olive)),
    oliveAt: fade.reduce((a, b) => (b.olive > a.olive ? b : a)).rel,
    fadeTo: fade.at(-1).rel,
    oliveAll: Math.max(...after.map((r) => r.olive)),
    oliveAllAt: after.reduce((a, b) => (b.olive > a.olive ? b : a)).rel,
    brownMaxFrom15: Math.max(...after.filter((r) => r.rel >= 15).map((r) => r.brown)),
    brownAt: after.filter((r) => r.rel >= 15).reduce((a, b) => (b.brown > a.brown ? b : a)).rel,
    straightMaxPx: Math.max(...straight),
    straightAt: after.filter((r) => r.straightPx !== null).reduce((a, b) => (b.straightPx > a.straightPx ? b : a)).rel,
    peakRel: peak?.rel ?? null,
    ladder,
    peachMax: Math.max(...after.filter((r) => r.rel <= 30).map((r) => r.peach)),
    fireAreaPeak: peakArea,
    smokeAreaPeak: smokePeak,
    smokeOverFire: peakArea ? r4(smokePeak / peakArea) : null,
    smokeFoeFrames: after.filter((r) => r.foeCover >= 0.25).length,
    foePixels: foePx,
    numberUnderSmokeFrames: after.filter((r) => r.numberOverlap >= 0.25).length,
    litMinusShaded: r4(median(litRows.map((r) => r.litMinusShaded))),
    litFrames: litRows.length,
    smokeDropMax: r4(dropMax),
    smokeDropAt: dropAt,
    iouMax: ious.length ? Math.max(...ious.map((x) => x.iou)) : null,
    // The impact's first frame against its brightest, f0 … f+8 (§3.1 rule 5: ≥ 0.95).
    flashFirst: r4(after[0].discGain / Math.max(...after.filter((r) => r.rel <= 8).map((r) => r.discGain))),
    ious,
  };
  // Test B's measures (see the header).
  const big = after.filter((r) => r.rel <= 40).reduce((a, b) => (b.fireArea > a.fireArea ? b : a));
  summary.foeHeightPx = foeH;
  summary.sizePeakRel = big.rel;
  summary.sizeEqOverFoe = r4((2 * Math.sqrt(big.fireArea / Math.PI)) / foeH);
  summary.sizeBoxHOverFoe = big.bbox ? r4(big.bbox.h / foeH) : null;
  summary.sizeBoxWOverFoe = big.bbox ? r4(big.bbox.w / foeH) : null;
  summary.centreOffOverFoe = big.centre ? r4(Math.hypot(big.centre[0] + box.x - at.hit.x, big.centre[1] + box.y - at.hit.y) / foeH) : null;
  const solid = after.filter((r) => r.rel <= 40).reduce((a, b) => (b.fireSolid > a.fireSolid ? b : a));
  summary.sizeSolidOverFoe = r4((2 * Math.sqrt(solid.fireSolid / Math.PI)) / foeH);
  summary.sizeSolidAt = solid.rel;
  summary.fireFoeFrames = after.filter((r) => r.fireFoe >= 0.5).length;
  summary.fireFoeMax = Math.max(...after.map((r) => r.fireFoe));
  const heroRows = [...after, ...tail].filter((r) => r.heroPx > 50);
  summary.heroPixels = heroRows.length ? Math.max(...heroRows.map((r) => r.heroPx)) : 0;
  summary.heroUnderMax = heroRows.length ? Math.max(...heroRows.map((r) => r.heroUnder)) : null;
  summary.heroUnderFrames = heroRows.filter((r) => r.heroUnder > 0.05).length;
  summary.heroSmokeFrames = heroRows.filter((r) => r.heroSmoke > 0.05).length;
  summary.heroFireFrames = heroRows.filter((r) => r.heroFire > 0.05).length;
  summary.heroSmokeMax = heroRows.length ? Math.max(...heroRows.map((r) => r.heroSmoke)) : null;
  summary.blackMax = Math.max(...after.map((r) => r.black));
  summary.blackAt = after.reduce((a, b) => (b.black > a.black ? b : a)).rel;
  const first = after.filter((r) => r.rel <= 6);
  summary.charEarly = r4(Math.max(...first.map((r) => r.darkOut / Math.max(1, r.fireArea))));
  const firstSmoke = after.find((r) => r.smokeArea > 0);
  summary.smokeStart = firstSmoke ? firstSmoke.rel : null;
  const lastSmoke = [...after, ...tail].filter((r) => r.rel >= 0 && r.smokeArea > 0).at(-1);
  summary.smokeEnd = lastSmoke ? lastSmoke.rel : null;
  const at150 = rows.find((r) => r.rel === 150);
  const mid = Math.max(...after.filter((r) => r.rel >= 30).map((r) => r.feet));
  summary.left150 = at150 ? r4(at150.feet / Math.max(1, mid)) : null;
  summary.oliveChangedMax = Math.max(...fade.map((r) => r.oliveChanged));
  summary.oliveChangedAt = fade.reduce((a, b) => (b.oliveChanged > a.oliveChanged ? b : a)).rel;
  summary.brownTail = tail.length ? Math.max(...tail.map((r) => r.brown)) : null;
  summary.oliveTail = tail.length ? Math.max(...tail.map((r) => r.olive)) : null;
  summary.passB = {
    size: summary.sizeEqOverFoe >= 1.6 && summary.sizeEqOverFoe <= 2.2,
    fireFoe: summary.fireFoeFrames <= 10,
    heroes: summary.heroUnderMax === null || (summary.heroUnderMax <= 0.05 && summary.heroUnderFrames === 0),
    black: summary.blackMax <= 0.01,
    charEarly: summary.charEarly <= 0.02,
    left150: summary.left150 === null ? null : summary.left150 <= 0.05,
    oliveChanged: summary.oliveChangedMax <= 0.02,
  };
  summary.passC = {
    sizeSolid: summary.sizeSolidOverFoe >= 2.5 && summary.sizeSolidOverFoe <= 3.0,
    heroSmoke: summary.heroSmokeFrames <= 10,
    smokeEnd: summary.smokeEnd === null || summary.smokeEnd <= 125,
    numberSmoke: summary.numberUnderSmokeFrames <= 10,
  };
  summary.pass = passOf(summary, H);
  return { summary, rows };
}

/** A binary mask's bounding box (w, h in px). */
function bboxOf(mask, w, h) {
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let p = 0; p < mask.length; p += 1) {
    if (!mask[p]) continue;
    const x = p % w;
    const y = Math.floor(p / w);
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  return x1 < 0 ? null : { w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** The value ladder and core colour at the peak frame (full-res read of the frame). */
function valueLadder(dir, frame, box, fire, peak, ref, refFull, H) {
  const img = read(join(dir, frame + ".png"), box);
  const full = read(join(dir, frame + ".png"));
  const w = box.w;
  const h = box.h;
  let area = 0;
  for (const v of fire) area += v;
  const R = Math.sqrt(area / Math.PI);
  const [cx, cy] = peak.centre;
  const band = Math.max(2, Math.round(0.1 * R));
  const inner = erode(fire, w, h, band);
  const rim = [];
  const body = [];
  const ground = [];
  const core = [];
  const hues = [];
  let white = 0;
  let whiteIn = 0;
  for (let p = 0; p < fire.length; p += 1) {
    if (!fire[p]) continue;
    const x = p % w;
    const y = Math.floor(p / w);
    const d = Math.hypot(x - cx, y - cy) / (R || 1);
    const l = luma(img.d, p);
    if (!inner[p]) rim.push(l);
    if (d >= 0.3 && d <= 0.8) {
      body.push(l);
      ground.push(luma(ref.d, p));
    }
    if (d <= 0.3) {
      core.push(l);
      const [hh, s, v] = hsv(img.d[p * 3], img.d[p * 3 + 1], img.d[p * 3 + 2]);
      if (s >= 0.15 && v >= 0.5) hues.push(hh);
    }
    if (l >= 0.9) {
      white += 1;
      if (d <= 0.3) whiteIn += 1;
    }
  }
  let sxs = 0;
  let sc = 0;
  for (const hh of hues) {
    sxs += Math.cos((hh * Math.PI) / 180);
    sc += Math.sin((hh * Math.PI) / 180);
  }
  let hue = hues.length ? (Math.atan2(sc, sxs) * 180) / Math.PI : null;
  if (hue !== null && hue < 0) hue += 360;
  // White over the whole field (the existing measure: sRGB luma ≥ 0.95).
  let fieldWhite = 0;
  for (let p = 0; p < full.w * full.h; p += 1) if (luma(full.d, p) >= 0.95) fieldWhite += 1;
  return {
    frame,
    radiusPx: r4(R),
    rimBandPx: band,
    rim: r4(median(rim)),
    body: r4(median(body)),
    ground: r4(median(ground)),
    bodyOverGround: r4(median(body) - median(ground)),
    coreP90: r4(pct(core, 0.9)),
    whiteRadiusOfR: r4(Math.sqrt(white / Math.PI) / (R || 1)),
    whiteInsideShare: white ? r4(whiteIn / white) : null,
    fieldWhite: r4(fieldWhite / (full.w * full.h)),
    coreHue: r4(hue),
  };
}

function passOf(s, H) {
  const L = s.ladder ?? {};
  return {
    olive: s.oliveMax <= 0.02,
    brown: s.brownMaxFrom15 <= 0.03,
    straight: H >= 1080 ? s.straightMaxPx <= 20 : null,
    rim: L.rim !== null && L.rim <= 0.3,
    body: L.bodyOverGround !== null && L.bodyOverGround >= 0.15,
    core: L.coreP90 !== null && L.coreP90 >= 0.9 && L.whiteRadiusOfR <= 0.3,
    fieldWhite: L.fieldWhite <= 0.06,
    coreHue: H >= 1080 ? L.coreHue !== null && L.coreHue >= 35 && L.coreHue <= 55 : null,
    peach: s.peachMax <= 0.02,
    smokeSize: s.smokeAreaPeak <= s.fireAreaPeak,
    smokeFoe: s.smokeFoeFrames <= 10,
    smokeLit: s.litMinusShaded !== null && s.litMinusShaded >= 0.12,
    smokeDrop: s.smokeDropMax <= 0.25,
    iou: s.iouMax !== null && s.iouMax <= 0.85,
    flashFirst: s.flashFirst >= 0.95,
  };
}

/** Every run of a bench capture: gates.json (summaries and rows) and gates.md (one table, run by run). */
export function allGates(bench, out) {
  const runs = readdirSync(bench).filter((d) => existsSync(join(bench, d, "run.json"))).sort();
  const results = {};
  for (const d of runs) {
    // A run already measured on its own (`<run dir> --json <run dir>/gates-run.json`, e.g. several at once) is reused.
    const done = join(bench, d, "gates-run.json");
    results[d] = existsSync(done) ? JSON.parse(readFileSync(done, "utf8")) : fireGates(join(bench, d));
    console.error(d + ": " + Object.entries(results[d].summary.pass).filter(([, v]) => v === false).map(([k]) => k).join(", "));
  }
  writeFileSync(join(out, "gates.json"), JSON.stringify(results, null, 1));
  const n = (x, d = 3) => (x === null || x === undefined ? "–" : typeof x === "number" ? (Number.isInteger(x) ? String(x) : x.toFixed(d)) : String(x));
  const mark = (ok) => (ok === null ? "" : ok ? " ✓" : " ✗");
  const cols = [
    ["olive fade ≤ 0.02", (s) => n(s.oliveMax) + mark(s.pass.olive)],
    ["olive all frames", (s) => n(s.oliveAll) + " @" + s.oliveAllAt],
    ["olive, changed px only (fade) ≤ 0.02", (s) => n(s.oliveChangedMax) + " @" + s.oliveChangedAt + mark(s.passB.oliveChanged)],
    ["brown ≥f+15 ≤ 0.03", (s) => n(s.brownMaxFrom15) + mark(s.pass.brown)],
    ["straight px (≤ 20 @1080)", (s) => n(s.straightMaxPx, 1) + mark(s.pass.straight)],
    ["rim ≤ 0.30", (s) => n(s.ladder?.rim) + mark(s.pass.rim)],
    ["body − ground ≥ 0.15", (s) => n(s.ladder?.bodyOverGround) + mark(s.pass.body)],
    ["core p90 ≥ 0.90", (s) => n(s.ladder?.coreP90) + mark(s.ladder?.coreP90 >= 0.9)],
    ["white r/R ≤ 0.30", (s) => n(s.ladder?.whiteRadiusOfR) + mark(s.ladder?.whiteRadiusOfR <= 0.3)],
    ["field white ≤ 6 %", (s) => n(s.ladder?.fieldWhite, 4) + mark(s.pass.fieldWhite)],
    ["core hue 35–55° (@1080)", (s) => n(s.ladder?.coreHue, 1) + mark(s.pass.coreHue)],
    ["peach ≤ 0.02", (s) => n(s.peachMax) + mark(s.pass.peach)],
    ["smoke / fire area ≤ 1", (s) => n(s.smokeOverFire) + mark(s.pass.smokeSize)],
    ["smoke on foe / number frames ≤ 10", (s) => n(s.smokeFoeFrames) + " / " + n(s.numberUnderSmokeFrames) + mark(s.pass.smokeFoe && s.numberUnderSmokeFrames <= 10)],
    ["lit − shaded ≥ 0.12", (s) => n(s.litMinusShaded) + mark(s.pass.smokeLit)],
    ["smoke drop ≤ 0.25", (s) => n(s.smokeDropMax) + mark(s.pass.smokeDrop)],
    ["IoU(f, f+4) ≤ 0.85", (s) => n(s.iouMax) + mark(s.pass.iou)],
    ["impact f0 / peak ≥ 0.95", (s) => n(s.flashFirst) + mark(s.pass.flashFirst)],
    ["size: eq. diam / foe (1.6–2.2)", (s) => n(s.sizeEqOverFoe, 2) + " (box " + n(s.sizeBoxWOverFoe, 1) + "×" + n(s.sizeBoxHOverFoe, 1) + ")" + mark(s.passB.size)],
    ["C: solid size / foe (2.5–3.0)", (s) => n(s.sizeSolidOverFoe, 2) + " @" + s.sizeSolidAt + mark(s.passC?.sizeSolid)],
    ["centre off / foe", (s) => n(s.centreOffOverFoe, 2)],
    ["fire hides foe, frames ≤ 10", (s) => n(s.fireFoeFrames) + mark(s.passB.fireFoe)],
    ["Dragons under effect, max / frames > 5 %", (s) => n(s.heroUnderMax) + " / " + n(s.heroUnderFrames) + mark(s.passB.heroes)],
    ["near-black ≤ 0.01", (s) => n(s.blackMax) + " @" + s.blackAt + mark(s.passB.black)],
    ["char before fire ≤ 0.02", (s) => n(s.charEarly) + mark(s.passB.charEarly)],
    ["smoke from", (s) => (s.smokeStart === null ? "–" : "f+" + s.smokeStart)],
    ["C: smoke to (≤ f+125)", (s) => (s.smokeEnd === null ? "–" : "f+" + s.smokeEnd) + mark(s.passC?.smokeEnd)],
    ["C: Dragons under smoke / fire, frames > 5 % (smoke ≤ 10)", (s) => n(s.heroSmokeFrames) + " / " + n(s.heroFireFrames) + mark(s.passC?.heroSmoke)],
    ["left at 2.5 s ≤ 0.05", (s) => n(s.left150) + mark(s.passB.left150)],
    ["brown / olive f+91…160", (s) => n(s.brownTail) + " / " + n(s.oliveTail)],
  ];
  const lines = ["| run | " + cols.map((c) => c[0]).join(" | ") + " |", "|---|" + cols.map(() => "---").join("|") + "|"];
  for (const d of runs) lines.push("| " + d + " | " + cols.map((c) => c[1](results[d].summary)).join(" | ") + " |");
  writeFileSync(join(out, "gates.md"), lines.join("\n") + "\n");
  return results;
}

const args = process.argv.slice(2);
if (args[0] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  if (args[0] === "--all") {
    allGates(args[1], args[2] ?? args[1]);
  } else {
    const result = fireGates(args[0]);
    const i = args.indexOf("--json");
    if (i >= 0) writeFileSync(args[i + 1], JSON.stringify(result, null, 1));
    console.log(JSON.stringify(result.summary));
  }
}
