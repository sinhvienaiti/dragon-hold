// dh-vfx-word: Hỏa Long's word attack frame by frame at a held clock (docs/games/VFX_STANDARD.md §5.3 part 1,
// §4.5 capture rules, §5.6 measures). The page's requestAnimationFrame and performance.now are held (`heldclock`
// in the URL): the game only moves when the scenario steps it one 60 Hz frame, so the same seed types the same word
// at the same tick on every build (before and after sheets line up frame for frame). Per size × camera × ground:
//   A  one frame after each letter, and the held frame before the last key (pre);
//   R, T, I  every frame from the last key (f0) to f35 (the strike lands at f12, DAMAGE.strikeDelayTicks);
//   F  every 15 frames (250 ms) to f180;
// each frame twice: with the DOM overlay (sheets) and canvas only (measures: white-out, tag contrast, flash).
// CLIP=1 adds a 3 s clip at 60 fps, rendered frame by frame; LIVE=1 types words at the real clock and reads
// key → release (needs the after build's fx.lastRelease).
//   URL=http://127.0.0.1:4157/ LABEL=after node scripts/visual/cdp-run.mjs scripts/visual/scenarios/dh-vfx-word.mjs --width=1920 --height=1080
// Env: LABEL (before|after), SIZES=1280x720,1920x1080, CAMS=play,close, GROUNDS=light,dark, SEED, KEY_GAP (frames
// between keys, 7), QUERY (extra URL options, e.g. bloom=1&mouthlight=0), CLIP=1, CLIP_SIZE=1920x1080, LIVE=1,
// ONLY_CLIP=1. Output: OUT_DIR or tmp/vfx/<LABEL>/ (ignored by Git).
// Owner: view-crowd-fx (LANES.md).
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { badResources, BASE, press } from "./lib/dh.mjs";
import { beside, brightestGain, clip, lum255, meanLuma, montage, readRgb, tagContrast, whiteOut } from "./lib/vfx-measure.mjs";

const LABEL = process.env.LABEL ?? "after";
const OUT = resolve(process.env.OUT_DIR ?? join("tmp/vfx", LABEL));
const SIZES = (process.env.SIZES ?? "1280x720,1920x1080").split(",").map((s) => s.split("x").map(Number));
const CAMS = (process.env.CAMS ?? "play,close").split(",");
const GROUNDS = (process.env.GROUNDS ?? "light,dark").split(",");
const SEED = process.env.SEED ?? "20261028";
const KEY_GAP = Number(process.env.KEY_GAP ?? "7");
const QUERY = process.env.QUERY ?? "";
const REFERENCE = process.env.REFERENCE ?? resolve("../../tmp/vfx/owner-reference-layered-vfx.webp");
/** Frames after the last key drawn one by one (R, T, I), then F every F_STEP frames to F_END. */
const DENSE = 36;
const F_STEP = 15;
const F_END = 180;
/** Word tags (ui/tags.ts): plate rgba(35, 28, 23, 0.9); dimmest text is the meaning line #EADFC4. */
const PLATE = [35, 28, 23];
const PLATE_ALPHA = 0.9;
const TEXT_LUM = Math.min(lum255(0xff, 0xf4, 0xd6), lum255(0x7f, 0xf5, 0xe0), lum255(0xea, 0xdf, 0xc4));

/** The held clock and the speech stub, in every document the page opens. */
const SHIM = `(() => {
  try { const s = window.speechSynthesis; if (s) { s.speak = () => {}; s.cancel = () => {}; } } catch {}
  if (!new URLSearchParams(location.search).has("heldclock")) return;
  const realRaf = window.requestAnimationFrame.bind(window);
  const queue = [];
  let now = 1000;
  performance.now = () => now;
  window.requestAnimationFrame = (callback) => { queue.push(callback); return queue.length; };
  window.cancelAnimationFrame = () => {};
  window.__clock = {
    step(n = 1) {
      for (let i = 0; i < n; i += 1) {
        now += 1000 / 60;
        for (const callback of queue.splice(0)) { try { callback(now); } catch (error) { console.error(error); } }
      }
      return now;
    },
    get now() { return now; },
    realRaf,
  };
})()`;

const META = `(() => {
  const d = window.__dh; const s = d.state(); const fx = d.numberLayer(); const core = fx && fx.core;
  const tags = [...document.querySelectorAll('.dh-tag')].filter((t) => { const c = getComputedStyle(t); return c.display !== 'none' && c.visibility !== 'hidden' && Number(c.opacity) > 0.05 && !t.closest('[hidden]'); })
    .map((t) => t.querySelector('.dh-tag__body')).filter(Boolean).map((b) => { const r = b.getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; }).filter((r) => r[2] > 4 && r[3] > 4);
  return { tick: s.tick, phase: s.phase, stats: core && core.stats ? core.stats() : null, light: core && core.mouthLightLevel !== undefined ? core.mouthLightLevel : null, drawCalls: d.perf().drawCalls, tags };
})()`;

const step = (page, n = 1) => page.eval("window.__clock.step(" + n + ")");
const state = (page) => page.eval("window.__dh.state()");

/** Opens the game at a held clock, models in, wave 1 running; returns the frames stepped so far. */
async function open(page, w, h, ground, extra = "") {
  await page.viewport(w, h, 1);
  const query = ["heldclock=1", "prelearn=0", "q=high", "wpm=35", "seed=" + SEED, ground === "dark" ? "dusk=1" : "", QUERY, extra].filter(Boolean).join("&");
  await page.goto(BASE + "/?" + query, { settle: 300 });
  let waited = 0;
  for (; waited < 120; waited += 1) {
    if ((await page.eval("window.__dh?.ready === true")) === true) break;
    await page.sleep(250);
  }
  // Models and textures load at the real clock; 40 frames 100 ms apart draw them in (a fixed count: same tick each run).
  for (let k = 0; k < 40; k += 1) {
    await step(page, 1);
    await page.sleep(100);
  }
  await press(page, "Enter");
  let frames = 40;
  for (let k = 0; k < 40; k += 1) {
    await step(page, 30);
    frames += 30;
    if ((await state(page)).phase === "wave") break;
  }
  return { query, frames, waitedMs: waited * 250 };
}

/** Steps until a live word sits on a drawn foe; returns it and its foe. */
async function target(page) {
  for (let k = 0; k < 400; k += 1) {
    const found = await page.eval(`(() => { const d = window.__dh; const word = d.words().find((w) => w.target && w.visible && w.kind === 'enemy' && w.text.length >= 4 && w.typed === 0);
      if (!word) return null; const foe = d.foes().find((f) => f.slot === word.target.slot && f.serial === word.target.serial); return foe ? { word, foe } : null; })()`);
    if (found) return { ...found, framesWaited: k * 5 };
    await step(page, 5);
  }
  return null;
}

/** Camera: "play" is the home view (05 §3); "close" the nearest zoom (0.6), side-on to the shot, on the sun side. */
async function aim(page, cam, foe) {
  if (cam !== "close") return null;
  const shot = (Math.atan2(foe.x, foe.z) * 180) / Math.PI;
  const yawA = shot + 90;
  const yawB = shot - 90;
  const yawDeg = Math.cos((yawA * Math.PI) / 180) >= Math.cos((yawB * Math.PI) / 180) ? yawA : yawB;
  const view = { yawDeg, pitchDeg: 42, zoom: 0.6, targetX: foe.x * 0.5, targetZ: foe.z * 0.5 };
  await page.eval("window.__dh.setView(" + JSON.stringify(view) + ", true)");
  await step(page, 1);
  return view;
}

/** Crop box around Hỏa Long and the foe (sheet tiles), 16:9, inside the frame. */
async function cropBox(page, foe, w, h) {
  const a = await page.eval("window.__dh.project(0, 3.6, 0)");
  const b = await page.eval("window.__dh.project(" + foe.x + ", 1, " + foe.z + ")");
  const s = h / 720;
  let x0 = Math.min(a.x, b.x);
  let x1 = Math.max(a.x, b.x);
  let y0 = Math.min(a.y, b.y);
  let y1 = Math.max(a.y, b.y);
  const pad = 70 * s;
  x0 -= pad; x1 += pad; y0 -= pad * 1.4; y1 += pad;
  let cw = Math.max(x1 - x0, 360 * s);
  let ch = Math.max(y1 - y0, 200 * s);
  if (cw / ch < 16 / 9) cw = (ch * 16) / 9;
  else ch = (cw * 9) / 16;
  cw = Math.min(cw, w);
  ch = Math.min(ch, h);
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const x = Math.min(Math.max(0, cx - cw / 2), w - cw);
  const y = Math.min(Math.max(0, cy - ch / 2), h - ch);
  return { x: Math.round(x), y: Math.round(y), w: Math.round(cw), h: Math.round(ch), mouth: a, foe: b };
}

/** One frame: with the overlay (sheet) and canvas only (measures). */
async function grab(page, dir, name, label, frames) {
  const meta = await page.eval(META);
  const jpg = join(dir, name + ".jpg");
  await page.shot(jpg);
  await page.eval("document.getElementById('dh-overlay').style.visibility = 'hidden'");
  const png = join(dir, "m-" + name + ".png");
  await page.shot(png);
  await page.eval("document.getElementById('dh-overlay').style.visibility = ''");
  frames.push({ name, label, jpg, png, ...meta });
}

const phaseOf = (f) => (f <= 3 ? "R" : f < 12 ? "T" : f < DENSE ? "I" : "F");

/** One capture: size × camera × ground. */
async function capture(page, [w, h], cam, ground) {
  const dir = join(OUT, w + "x" + h + "-" + cam + "-" + ground);
  mkdirSync(dir, { recursive: true });
  const opened = await open(page, w, h, ground);
  const picked = await target(page);
  if (!picked) return { dir, error: "no word on a drawn foe", opened };
  const view = await aim(page, cam, picked.foe);
  const crop = await cropBox(page, picked.foe, w, h);
  const frames = [];
  const text = picked.word.text;
  await grab(page, dir, "a-00", "A start", frames);
  for (let i = 0; i < text.length - 1; i += 1) {
    await press(page, "Key" + text[i].toUpperCase());
    await step(page, 1);
    await grab(page, dir, "a-" + String(i + 1).padStart(2, "0"), "A " + text.slice(0, i + 1), frames);
    await step(page, KEY_GAP - 1);
  }
  await grab(page, dir, "pre", "A held (pre)", frames);
  await press(page, "Key" + text[text.length - 1].toUpperCase());
  for (let f = 0; f <= F_END; f += f < DENSE ? 1 : F_STEP) {
    await step(page, f === 0 ? 1 : f <= DENSE ? 1 : F_STEP);
    await grab(page, dir, "f" + String(f).padStart(3, "0"), "f" + f + " " + Math.round((f * 1000) / 60) + " ms " + phaseOf(f), frames);
  }
  const end = await state(page);
  writeFileSync(join(dir, "meta.json"), JSON.stringify({ opened, picked, view, crop, end, frames }, null, 1));
  return { dir, opened, picked, view, crop, frames, grades: end.grades };
}

/** Measures of one capture (VFX_STANDARD §5.6). */
function measure(run, h) {
  const frames = run.frames;
  const s = h / 720;
  const pre = frames.find((f) => f.name === "pre");
  const preImg = readRgb(pre.png);
  const dense = frames.filter((f) => /^f0[0-3]\d$/.test(f.name));
  const f0 = readRgb(dense[0].png);
  // The flash: the brightest gain of f0 over pre near the mouth (a box round the projected head).
  const m = run.crop.mouth;
  const search = { x: Math.round(m.x - 140 * s), y: Math.round(m.y - 110 * s), w: Math.round(280 * s), h: Math.round(220 * s) };
  const cell = Math.round(18 * s);
  const spot = brightestGain(f0, preImg, search, cell);
  const roi = { x: spot.x - cell / 2, y: spot.y - cell / 2, w: cell, h: cell };
  const base = meanLuma(preImg, roi);
  const series = dense.slice(0, 8).map((f) => +(meanLuma(readRgb(f.png), roi) - base).toFixed(4));
  const peak = Math.max(...series);
  const effect = frames.filter((f) => f.name !== "a-00");
  let whiteMax = 0;
  let whiteAt = null;
  const contrasts = [];
  for (const f of effect) {
    const img = f.name === "pre" ? preImg : readRgb(f.png);
    const white = whiteOut(img);
    if (white > whiteMax) {
      whiteMax = white;
      whiteAt = f.name;
    }
    const c = tagContrast(img, f.tags, PLATE, PLATE_ALPHA, TEXT_LUM);
    if (c !== null) contrasts.push({ frame: f.name, contrast: c });
  }
  contrasts.sort((a, b) => a.contrast - b.contrast);
  const lights = dense.slice(0, 8).map((f) => f.light);
  const lightPeak = Math.max(...lights.map((v) => v ?? 0));
  return {
    flash: { roi, series, firstOverPeak: peak > 0 ? +(series[0] / peak).toFixed(3) : null },
    light: { series: lights, firstOverPeak: lightPeak > 0 ? +((lights[0] ?? 0) / lightPeak).toFixed(3) : null },
    whiteOutMaxPct: +(whiteMax * 100).toFixed(2),
    whiteOutAt: whiteAt,
    tagContrast: { samples: contrasts.length, worst: contrasts[0] ?? null, p01: contrasts.length ? +contrasts[Math.floor(contrasts.length * 0.01)].contrast.toFixed(2) : null },
  };
}

/** Sheets of one capture: the crop round the strike (every frame) and a few whole frames. */
function sheets(run, w, h) {
  const dir = run.dir;
  const tile = Math.round(Math.min(480, run.crop.w));
  const crop = montage(
    run.frames.map((f) => ({ file: f.jpg, label: f.label + " · tick " + f.tick, crop: run.crop })),
    join(dir, "sheet-crop.jpg"),
    { columns: 8, tileW: tile, title: LABEL + " · " + w + "x" + h + " · " + run.dir.split("/").pop() + " · \"" + run.picked.word.text + "\"" },
  );
  const pick = ["a-00", "pre", "f000", "f002", "f006", "f012", "f014", "f020", "f036", "f066", "f126", "f171"];
  const full = montage(
    run.frames.filter((f) => pick.includes(f.name)).map((f) => ({ file: f.jpg, label: f.label })),
    join(dir, "sheet-full.jpg"),
    { columns: 4, tileW: 640, title: LABEL + " · " + w + "x" + h + " · whole frames" },
  );
  return { crop, full };
}

/** A 3 s clip at 60 fps, frame by frame at the held clock: typing, release, flight, impact, aftermath. */
async function recordClip(page, [w, h]) {
  const dir = join(OUT, "clip-" + w + "x" + h);
  mkdirSync(dir, { recursive: true });
  await open(page, w, h, "light");
  const picked = await target(page);
  if (!picked) return { error: "no word" };
  const text = picked.word.text;
  const keyAt = new Map();
  for (let i = 0; i < text.length; i += 1) keyAt.set(20 + i * KEY_GAP, text[i]);
  for (let f = 0; f < 180; f += 1) {
    if (keyAt.has(f)) await press(page, "Key" + keyAt.get(f).toUpperCase());
    await step(page, 1);
    await page.shot(join(dir, "c" + String(f).padStart(3, "0") + ".jpg"));
  }
  const file = clip(join(dir, "c%03d.jpg"), join(OUT, "clip-" + LABEL + "-" + w + "x" + h + ".mp4"), 60);
  return { file, word: text, releaseFrame: 20 + (text.length - 1) * KEY_GAP };
}

/** Key → release at the real clock: the last key's keydown to the frame that drew the bolt at the mouth. */
async function live(page) {
  await page.viewport(1920, 1080, 1);
  await page.goto(BASE + "/?" + ["prelearn=0", "q=high", "wpm=35", "seed=" + SEED, QUERY].filter(Boolean).join("&"), { settle: 300 });
  for (let k = 0; k < 120 && (await page.eval("window.__dh?.ready === true")) !== true; k += 1) await page.sleep(250);
  await page.sleep(2500);
  await press(page, "Enter");
  await page.eval("window.addEventListener('keydown', () => { window.__lastKeyAt = performance.now(); }, true)");
  const rows = [];
  for (let tries = 0; tries < 400 && rows.length < 8; tries += 1) {
    const word = await page.eval("(() => { const w = window.__dh.words().find((x) => x.target && x.visible && x.kind === 'enemy' && x.typed === 0); return w ? w.text : null; })()");
    if (!word) {
      await page.sleep(150);
      continue;
    }
    for (const ch of word) {
      await press(page, "Key" + ch.toUpperCase());
      await page.sleep(90);
    }
    await page.sleep(250);
    const row = await page.eval("(() => { const fx = window.__dh.numberLayer(); const r = fx && fx.lastRelease; return { word: " + JSON.stringify(word) + ", keyAt: window.__lastKeyAt ?? null, releaseAt: r ? r.at : null }; })()");
    rows.push({ ...row, ms: row.releaseAt !== null && row.keyAt !== null ? +(row.releaseAt - row.keyAt).toFixed(1) : null });
  }
  const ms = rows.map((r) => r.ms).filter((v) => v !== null && v >= 0);
  const perf = await page.eval("window.__dh.perf()");
  return { rows, maxMs: ms.length ? Math.max(...ms) : null, meanMs: ms.length ? +(ms.reduce((a, b) => a + b, 0) / ms.length).toFixed(1) : null, keyLatencyMaxMs: perf.keyLatencyMaxMs, keyLatencyMeanMs: perf.keyLatencyMeanMs };
}

export default async function (page) {
  mkdirSync(OUT, { recursive: true });
  await page.send("Page.addScriptToEvaluateOnNewDocument", { source: SHIM });
  const report = { label: LABEL, seed: SEED, query: QUERY, keyGap: KEY_GAP, runs: [], at: new Date().toISOString() };
  if (process.env.ONLY_CLIP !== "1") {
    for (const size of SIZES) {
      for (const cam of CAMS) {
        for (const ground of GROUNDS) {
          const run = await capture(page, size, cam, ground);
          if (run.error) {
            report.runs.push({ size: size.join("x"), cam, ground, error: run.error });
            continue;
          }
          const measures = measure(run, size[1]);
          const made = sheets(run, size[0], size[1]);
          let side = null;
          try {
            side = beside(REFERENCE, made.crop, join(run.dir, "beside-reference.jpg"), size[1] >= 1080 ? 1100 : 820);
          } catch (error) {
            side = "reference missing: " + String(error).slice(0, 120);
          }
          report.runs.push({ size: size.join("x"), cam, ground, word: run.picked.word.text, grades: run.grades, frames: run.frames.length, crop: run.crop, view: run.view, sheets: made, beside: side, measures });
        }
      }
    }
  }
  if (process.env.CLIP === "1" || process.env.ONLY_CLIP === "1") report.clip = await recordClip(page, (process.env.CLIP_SIZE ?? "1920x1080").split("x").map(Number));
  if (process.env.LIVE === "1") report.live = await live(page);
  report.badResources = await badResources(page);
  writeFileSync(join(OUT, "report-" + LABEL + ".json"), JSON.stringify(report, null, 1));
  return report;
}
