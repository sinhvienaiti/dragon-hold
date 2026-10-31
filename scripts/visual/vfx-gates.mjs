#!/usr/bin/env node
// VFX self-gates (round 11, the coordinator's gates before a judged round), on captured frames:
//   (a) colour: the share of the effect's pixels that read mustard/olive (hue 45°–95°, saturation > 0.2, value
//       0.3–0.8), every frame after the hit; and salmon/peach (hue 10°–30°, saturation < 0.45, value > 0.85) inside
//       Sky Fire's target ring round the impact;
//   (b) Sky Fire's shockwave: a ring at the rule radius (4 m) on screen by the impact frame + 12;
//   (c) straight edges: the longest straight run of the fire body's outline (fire-coloured pixels), px;
//   (d) the PLAIN clip is a plain shot (its grades: no Perfect).
// "The effect's pixels" are those the effect changed: a pixel counts when no pixel of the reference frame (shortly
// before the hit) within ±`win` px is within `t` (max channel, of 255) of it, so small camera moves and the grass
// texture do not count, and the grass itself (hue ≈ 86°, inside the olive band) never does.
//
//   node scripts/visual/vfx-gates.mjs clip <clip dir with c###.jpg and clip.json> [--kind word|sky] [--json out]
//                                         [--debug <dir>] [--from <frame>] [--to <frame>]
//   node scripts/visual/vfx-gates.mjs crops <_crops dir> [--json out] [--debug <dir>]   (AFTER-pre.png reference,
//                                         AFTER-f010… frames, the whole crop is the box)
//
// Fire test A (31/10): the helpers are exported for scripts/visual/fire-gates.mjs (DRAGON_FIRE_DIAGNOSIS §3's
// measured acceptance); run as a script, this file does what it did in round 11.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const mode = args[0];
const dir = args[1];
const opt = (name, fallback) => {
  const i = args.indexOf("--" + name);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback;
};
const T = Number(opt("t", 20));
// ±px searched in the reference: Sky Fire's impact shakes the camera hard (RMSE 0.17 at f068→f069), a word hit little.
let WIN = Number(opt("win", 10));
const STEP = 2;

export function read(file, box) {
  const crop = box ? ["-crop", `${box.w}x${box.h}+${box.x}+${box.y}`, "+repage"] : [];
  const raw = spawnSync("magick", [file, ...crop, "-depth", "8", "rgb:-"], { maxBuffer: 512 << 20 });
  if (raw.status !== 0) throw new Error("cannot read " + file + ": " + raw.stderr);
  let w = box ? box.w : 0;
  let h = box ? box.h : 0;
  if (!box) {
    const size = spawnSync("magick", ["identify", "-format", "%w %h", file], { encoding: "utf8" }).stdout.trim().split(/\s+/).map(Number);
    [w, h] = size;
  }
  return { w, h, d: raw.stdout };
}

export function hsv(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const v = max / 255;
  const s = max === 0 ? 0 : (max - min) / max;
  let hue = 0;
  if (max !== min) {
    if (max === r) hue = 60 * (((g - b) / (max - min)) % 6);
    else if (max === g) hue = 60 * ((b - r) / (max - min) + 2);
    else hue = 60 * ((r - g) / (max - min) + 4);
  }
  if (hue < 0) hue += 360;
  return [hue, s, v];
}
export const olive = (h, s, v) => h >= 45 && h <= 95 && s > 0.2 && v >= 0.3 && v <= 0.8;
export const salmon = (h, s, v) => h >= 10 && h <= 30 && s < 0.45 && v > 0.85;
export const fireBody = (h, s, v) => (h <= 45 || h >= 340) && s >= 0.35 && v >= 0.35;

/** Changed mask (1 = the effect changed it) for img against ref (same box), every STEP px; full res when step = 1. */
export function changed(img, ref, step = STEP, win = WIN, t = T) {
  const { w, h } = img;
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const i = (y * w + x) * 3;
      const r = img.d[i], g = img.d[i + 1], b = img.d[i + 2];
      let near = false;
      for (let dy = -win; dy <= win && !near; dy += 2) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -win; dx <= win; dx += 2) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          const j = (yy * w + xx) * 3;
          if (Math.abs(ref.d[j] - r) <= t && Math.abs(ref.d[j + 1] - g) <= t && Math.abs(ref.d[j + 2] - b) <= t) {
            near = true;
            break;
          }
        }
      }
      if (!near) out[y * w + x] = 1;
    }
  }
  return out;
}

/** Clears the mask inside UI tags (the word tags are DOM, not the effect), in box px, padded 4 px. */
export function clearTags(mask, box, tags) {
  for (const [x, y, w, h] of tags) {
    for (let yy = Math.max(0, Math.floor(y - box.y - 4)); yy < Math.min(box.h, Math.ceil(y - box.y + h + 4)); yy += 1) {
      for (let xx = Math.max(0, Math.floor(x - box.x - 4)); xx < Math.min(box.w, Math.ceil(x - box.x + w + 4)); xx += 1) mask[yy * box.w + xx] = 0;
    }
  }
  return mask;
}

/**
 * Interior of a full-res mask: changed pixels whose 5×5 neighbourhood is all changed. The outermost 2 px of a shape
 * are its anti-aliased rim and the JPEG's 2×2 chroma blocks, where any colour mixes with the grass round it; the
 * judges' complaint (and their measure, a block average) is a mustard or olive area, not that rim.
 */
export function interior(mask, w, h) {
  const out = new Uint8Array(w * h);
  for (let y = 2; y < h - 2; y += 1) {
    for (let x = 2; x < w - 2; x += 1) {
      if (!mask[y * w + x]) continue;
      let all = 1;
      for (let dy = -2; dy <= 2 && all; dy += 1) for (let dx = -2; dx <= 2; dx += 1) if (!mask[(y + dy) * w + x + dx]) { all = 0; break; }
      out[y * w + x] = all;
    }
  }
  return out;
}

function colourStats(img, mask, step = STEP, inside = null) {
  let region = 0;
  let ol = 0;
  let sa = 0;
  let ring = 0;
  for (let y = 0; y < img.h; y += step) {
    for (let x = 0; x < img.w; x += step) {
      if (!mask[y * img.w + x]) continue;
      const i = (y * img.w + x) * 3;
      const [hh, s, v] = hsv(img.d[i], img.d[i + 1], img.d[i + 2]);
      region += 1;
      if (olive(hh, s, v)) ol += 1;
      if (inside && inside(x, y)) {
        ring += 1;
        if (salmon(hh, s, v)) sa += 1;
      }
    }
  }
  return { region, olive: ol, oliveShare: region ? ol / region : 0, ring, salmon: sa, salmonShare: ring ? sa / ring : 0 };
}

/** Longest straight run (px) of the fire body's outline: a Hough vote on the outline, then the longest gap ≤ 2 run. */
export function straightest(img, mask, box = null, tags = []) {
  const { w, h } = img;
  const body = new Uint8Array(w * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (!mask[y * w + x]) continue;
      const i = (y * w + x) * 3;
      const [hh, s, v] = hsv(img.d[i], img.d[i + 1], img.d[i + 2]);
      // The fire's hot white heart counts as fire (no holes in the body).
      if (fireBody(hh, s, v) || v >= 0.85) body[y * w + x] = 1;
    }
  }
  // Opening (erode, then dilate, 3 px): thin streaks (sparks, a trail's thread, a crack line) are not a body edge.
  const erode = new Uint8Array(w * h);
  for (let y = 3; y < h - 3; y += 1) {
    for (let x = 3; x < w - 3; x += 1) {
      let all = 1;
      for (let dy = -3; dy <= 3 && all; dy += 1) for (let dx = -3; dx <= 3; dx += 1) if (!body[(y + dy) * w + x + dx]) { all = 0; break; }
      erode[y * w + x] = all;
    }
  }
  body.fill(0);
  for (let y = 3; y < h - 3; y += 1) {
    for (let x = 3; x < w - 3; x += 1) {
      if (!erode[y * w + x]) continue;
      for (let dy = -3; dy <= 3; dy += 1) for (let dx = -3; dx <= 3; dx += 1) body[(y + dy) * w + x + dx] = 1;
    }
  }
  const pts = [];
  for (let y = 2; y < h - 2; y += 1) {
    for (let x = 2; x < w - 2; x += 1) {
      const k = y * w + x;
      if (!body[k]) continue;
      if (!body[k - 1] || !body[k + 1] || !body[k - w] || !body[k + w]) {
        // Not along a UI box cut out of the mask (tags, numbers).
        const gx = box ? x + box.x : x;
        const gy = box ? y + box.y : y;
        if (tags.some(([tx, ty, tw, th]) => gx >= tx - 8 && gx <= tx + tw + 8 && gy >= ty - 8 && gy <= ty + th + 8)) continue;
        pts.push(x, y);
      }
    }
  }
  if (pts.length < 40) return { length: 0, points: pts.length / 2 };
  const angles = 90;
  const diag = Math.ceil(Math.hypot(w, h));
  const acc = new Uint32Array(angles * (2 * diag + 1));
  const cs = [];
  for (let a = 0; a < angles; a += 1) cs.push([Math.cos((a * Math.PI) / angles), Math.sin((a * Math.PI) / angles)]);
  for (let p = 0; p < pts.length; p += 2) {
    for (let a = 0; a < angles; a += 1) {
      const r = Math.round(pts[p] * cs[a][0] + pts[p + 1] * cs[a][1]) + diag;
      acc[a * (2 * diag + 1) + r] += 1;
    }
  }
  const peaks = [];
  for (let k = 0; k < acc.length; k += 1) if (acc[k] >= 18) peaks.push(k);
  peaks.sort((a, b) => acc[b] - acc[a]);
  let best = { length: 0 };
  for (const k of peaks.slice(0, 60)) {
    const a = Math.floor(k / (2 * diag + 1));
    const r = (k % (2 * diag + 1)) - diag;
    const [c, s] = cs[a];
    const ts = [];
    for (let p = 0; p < pts.length; p += 2) {
      const d = pts[p] * c + pts[p + 1] * s - r;
      // ±0.5 px: a cut edge (a quad's side, a straight ground line) is straight to a pixel; a lobe or a ring of radius
      // ≤ 100 px bends away from its chord within ~20 px.
      if (Math.abs(d) <= 0.5) ts.push(-pts[p] * s + pts[p + 1] * c);
    }
    ts.sort((x, y) => x - y);
    let start = 0;
    for (let i = 1; i <= ts.length; i += 1) {
      if (i === ts.length || ts[i] - ts[i - 1] > 1.6) {
        const len = ts[i - 1] - ts[start];
        // An outline, not a line through the body's holes: along the run, the body lies on one side only.
        let side = 0;
        let count = 0;
        if (len > best.length) {
          for (let t = ts[start]; t <= ts[i - 1]; t += 2) {
            const x = r * c - t * s;
            const y = r * s + t * c;
            const at = (xx, yy) => {
              const xi = Math.round(xx);
              const yi = Math.round(yy);
              return xi >= 0 && yi >= 0 && xi < w && yi < h && body[yi * w + xi] === 1;
            };
            const plus = at(x + 3 * c, y + 3 * s);
            const minus = at(x - 3 * c, y - 3 * s);
            if (plus !== minus) side += plus ? 1 : -1;
            count += 1;
          }
        }
        if (len > best.length && count > 0 && Math.abs(side) / count >= 0.75) {
          const t0 = ts[start];
          const t1 = ts[i - 1];
          best = { length: +len.toFixed(1), angleDeg: (a * 180) / angles, r, from: [Math.round(r * c - t0 * s), Math.round(r * s + t0 * c)], to: [Math.round(r * c - t1 * s), Math.round(r * s + t1 * c)] };
        }
        start = i;
      }
    }
  }
  return { ...best, points: pts.length / 2 };
}

function debugImage(img, mask, file, edge = null) {
  const out = Buffer.from(img.d);
  if (edge && edge.length > 20 && edge.from) {
    const n = Math.ceil(edge.length);
    for (let k = 0; k <= n; k += 1) {
      const x = Math.round(edge.from[0] + ((edge.to[0] - edge.from[0]) * k) / n);
      const y = Math.round(edge.from[1] + ((edge.to[1] - edge.from[1]) * k) / n);
      for (const [ox, oy] of [[0, 0], [1, 0], [0, 1]]) {
        const xx = x + ox;
        const yy = y + oy;
        if (xx >= 0 && yy >= 0 && xx < img.w && yy < img.h) {
          const i = (yy * img.w + xx) * 3;
          out[i] = 0; out[i + 1] = 255; out[i + 2] = 0;
        }
      }
    }
  }
  for (let y = 0; y < img.h; y += 1) {
    for (let x = 0; x < img.w; x += 1) {
      const sy = y - (y % STEP);
      const sx = x - (x % STEP);
      if (!mask[sy * img.w + sx]) continue;
      const i = (y * img.w + x) * 3;
      const j = (sy * img.w + sx) * 3;
      const [hh, s, v] = hsv(img.d[j], img.d[j + 1], img.d[j + 2]);
      if (olive(hh, s, v)) { out[i] = 255; out[i + 1] = 0; out[i + 2] = 255; }
      else if (salmon(hh, s, v)) { out[i] = 0; out[i + 1] = 255; out[i + 2] = 255; }
    }
  }
  spawnSync("magick", ["-size", `${img.w}x${img.h}`, "-depth", "8", "rgb:-", file], { input: out });
}

function clipGates() {
  const info = JSON.parse(readFileSync(join(dir, "clip.json"), "utf8"));
  const kind = opt("kind", info.castFrame !== undefined ? "sky" : "word");
  if (kind === "sky" && !args.includes("--win")) WIN = 16;
  const frames = readdirSync(dir).filter((f) => /^c\d{3}\.jpg$/.test(f)).sort();
  const { w: W, h: H } = read(join(dir, frames[0]));
  let hit = -1;
  let centre = null;
  let radius = 0;
  let ringPts = null;
  if (kind === "word") {
    for (let f = 1; f < info.track.length; f += 1) if ((info.track[f]?.hits ?? 0) > (info.track[f - 1]?.hits ?? 0)) { hit = f; break; }
    let last = null;
    for (let f = 0; f <= hit; f += 1) if (info.track[f]?.x !== undefined) last = info.track[f];
    centre = { x: (last.x + last.ground.x) / 2, y: (last.y + last.ground.y) / 2 };
    radius = 8 * Math.hypot(last.r.x - last.ground.x, last.r.y - last.ground.y);
  } else {
    for (let f = 0; f < info.track.length; f += 1) if (info.track[f]?.phase === "I") { hit = f; break; }
    const t = info.track[hit];
    centre = t.c;
    ringPts = t.ring;
    radius = 1.7 * Math.max(...t.ring.map((p) => Math.hypot(p.x - t.c.x, p.y - t.c.y)));
  }
  const box = { x: Math.max(0, Math.round(centre.x - radius)), y: Math.max(0, Math.round(centre.y - radius * 1.1)) };
  box.w = Math.min(W - box.x, Math.round(radius * 2));
  box.h = Math.min(H - box.y, Math.round(radius * 2));
  // The reference is the frame before the shot or the cast: nothing of the effect in it (its own lights included);
  // later the window absorbs the foes' few px of walking.
  const refFrame = Math.max(0, (kind === "sky" ? info.castFrame : info.releaseFrame) - 1);
  const ref = read(join(dir, frames[refFrame]), box);
  const from = Number(opt("from", hit));
  const to = Number(opt("to", frames.length - 1));
  const debug = opt("debug", null);
  if (debug) mkdirSync(debug, { recursive: true });
  // The target ring (Sky Fire): inside the rule ellipse round the impact, in box px.
  let inside = null;
  if (ringPts) {
    const poly = ringPts.map((p) => [p.x - box.x, p.y - box.y]);
    inside = (x, y) => {
      let c = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [xi, yi] = poly[i];
        const [xj, yj] = poly[j];
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
      }
      return c;
    };
  }
  const rows = [];
  for (let f = from; f <= to; f += 1) {
    const img = read(join(dir, frames[f]), box);
    const tags = [...(info.track[refFrame]?.tags ?? []), ...(info.track[f]?.tags ?? [])];
    const mask = clearTags(changed(img, ref), box, tags);
    const full = clearTags(changed(img, ref, 1), box, tags);
    const raw = colourStats(img, mask, STEP);
    const stats = colourStats(img, interior(full, box.w, box.h), STEP, f <= hit + 5 && f >= hit - 2 ? inside : null);
    const edge = straightest(img, full, box, tags);
    let ring = null;
    if (kind === "sky" && f >= hit && f <= hit + 15) {
      // (b) per rule-ring point: a changed pixel that is fire, bright or a dark rim, 0.85–1.15 of the way out.
      let hits = 0;
      for (const p of ringPts) {
        let ok = false;
        for (let k = 0.85; k <= 1.15 && !ok; k += 0.03) {
          const x = Math.round(centre.x + (p.x - centre.x) * k) - box.x;
          const y = Math.round(centre.y + (p.y - centre.y) * k) - box.y;
          if (x < 0 || y < 0 || x >= box.w || y >= box.h || !full[y * box.w + x]) continue;
          const i = (y * box.w + x) * 3;
          const [hh, s, v] = hsv(img.d[i], img.d[i + 1], img.d[i + 2]);
          // Fire or its dark rim; a white flash of the target marker is not a shockwave.
          if (fireBody(hh, s, v) || v < 0.25) ok = true;
        }
        if (ok) hits += 1;
      }
      // Where the fire or its dark rim ends, out along each ring point's ray (0.3–1.6 of the rule radius).
      const ext = [];
      for (const p of ringPts) {
        for (let k = 1.6; k >= 0.3; k -= 0.02) {
          const x = Math.round(centre.x + (p.x - centre.x) * k) - box.x;
          const y = Math.round(centre.y + (p.y - centre.y) * k) - box.y;
          if (x < 0 || y < 0 || x >= box.w || y >= box.h || !full[y * box.w + x]) continue;
          const i = (y * box.w + x) * 3;
          const [hh, s, v] = hsv(img.d[i], img.d[i + 1], img.d[i + 2]);
          if (fireBody(hh, s, v) || v < 0.25) { ext.push(k); break; }
        }
      }
      ext.sort((a2, b2) => a2 - b2);
      ring = { cover: +(hits / ringPts.length).toFixed(3), extent: ext.length ? +ext[Math.floor(ext.length / 2)].toFixed(2) : 0 };
    }
    rows.push({ frame: f, rel: f - hit, region: stats.region, oliveShare: +stats.oliveShare.toFixed(4), oliveRaw: +raw.oliveShare.toFixed(4), salmonInRing: stats.ring ? +stats.salmonShare.toFixed(4) : null, straightPx: edge.length, ring });
    if (debug && (stats.oliveShare > 0.02 || edge.length > 20)) debugImage(img, mask, join(debug, "g" + String(f).padStart(3, "0") + ".png"), edge);
  }
  const after = rows.filter((r) => r.rel >= 0 && r.region > 50);
  const summary = {
    kind,
    hitFrame: hit,
    box,
    grades: info.grades ?? null,
    plainShot: kind === "word" ? (info.grades ? info.grades[0] === 0 : null) : null,
    oliveMax: Math.max(...after.map((r) => r.oliveShare)),
    oliveWorst: after.reduce((a, b) => (b.oliveShare > a.oliveShare ? b : a), after[0])?.frame,
    oliveOver2: after.filter((r) => r.oliveShare >= 0.02).map((r) => r.frame),
    oliveRawMax: Math.max(...after.map((r) => r.oliveRaw)),
    salmonMax: Math.max(0, ...rows.filter((r) => r.salmonInRing !== null).map((r) => r.salmonInRing)),
    straightMax: Math.max(...rows.map((r) => r.straightPx)),
    straightOver20: rows.filter((r) => r.straightPx > 20).map((r) => r.frame),
    ring: kind === "sky" ? rows.filter((r) => r.ring !== null).map((r) => [r.rel, r.ring.cover, r.ring.extent]) : null,
  };
  return { summary, rows };
}

function cropGates() {
  const files = readdirSync(dir).filter((f) => /^AFTER-f\d{3}\.png$/.test(f)).sort();
  const ref = read(join(dir, "AFTER-pre.png"));
  const from = opt("from", "f010");
  const debug = opt("debug", null);
  if (debug) mkdirSync(debug, { recursive: true });
  const rows = [];
  for (const f of files) {
    const name = f.slice(6, 10);
    if (name < from) continue;
    const img = read(join(dir, f));
    const mask = changed(img, ref);
    const full = changed(img, ref, 1);
    const raw = colourStats(img, mask);
    const stats = colourStats(img, interior(full, img.w, img.h));
    const edge = straightest(img, full);
    rows.push({ frame: name, region: stats.region, oliveShare: +stats.oliveShare.toFixed(4), oliveRaw: +raw.oliveShare.toFixed(4), straightPx: edge.length });
    if (debug && (stats.oliveShare > 0.02 || edge.length > 20)) debugImage(img, mask, join(debug, name + ".png"), edge);
  }
  const live = rows.filter((r) => r.region > 50);
  return { summary: { oliveMax: Math.max(...live.map((r) => r.oliveShare)), oliveRawMax: Math.max(...live.map((r) => r.oliveRaw)), oliveOver2: live.filter((r) => r.oliveShare >= 0.02).map((r) => r.frame), straightMax: Math.max(...rows.map((r) => r.straightPx)) }, rows };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = mode === "clip" ? clipGates() : mode === "crops" ? cropGates() : null;
  if (!result) {
    console.error("usage: vfx-gates.mjs clip|crops <dir> [...]");
    process.exit(2);
  }
  const json = opt("json", null);
  if (json) writeFileSync(json, JSON.stringify(result, null, 1));
  console.log(JSON.stringify(result.summary));
  if (args.includes("--rows")) for (const r of result.rows) console.log(JSON.stringify(r));
}
