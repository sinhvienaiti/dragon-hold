// dh-vfx-skyfire: Sky Fire (Thiên Hỏa) frame by frame at a held clock (docs/games/VFX_STANDARD.md §5.3 part 2, §4.5
// capture rules, §5.6 measures). The page's requestAnimationFrame and performance.now are held (dh-vfx-word's SHIM):
// the same seed reaches the same wave tick on every build, so before and after sheets line up frame for frame.
// Per size × camera × ground: wave 1 runs until a foe stands in the word zone; the densest group gets the cast (the
// sim's own rule, at that foe's point, so every build casts at the same spot), then
//   A, R, T, I  every frame from the cast (f0) to f70 (R at f12, the sim's impact at f48: rules delayMs 800);
//   F           every 15 frames (250 ms) to f420 (7 s, the fissure's life);
// each frame twice: with the DOM overlay (sheets) and canvas only (measures: white-out, tag contrast, flashes).
// CLIP=1 adds a 3 s clip at 60 fps (frame by frame at the held clock); LIVE=1 presses Alt+2 at the real clock and
// reads key → first drawn frame of the cast (the after build's fx.lastCast).
//   URL=http://127.0.0.1:4157/ LABEL=after node scripts/visual/cdp-run.mjs scripts/visual/scenarios/dh-vfx-skyfire.mjs --width=1920 --height=1080
// Env: LABEL (before|after), SIZES=1280x720,1920x1080, CAMS=play,close, GROUNDS=light,dark, SEED, QUERY (extra URL
// options, e.g. bloom=1&mouthlight=0), CLIP=1, CLIP_SIZE=1920x1080, ONLY_CLIP=1, LIVE=1, KEEP_PNG=1 (keep the
// canvas-only PNGs; by default they are dropped once measured). Output: OUT_DIR or tmp/vfx/skyfire-<LABEL>/ (ignored).
// Owner: view-crowd-fx (LANES.md).
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { badResources, BASE, MOD, press } from "./lib/dh.mjs";
import { aim, open, SHIM, step } from "./dh-vfx-word.mjs";
import { beside, brightBlob, clip, headSize, lum255, meanLuma, montage, readRgb, tagContrast, whiteOut } from "./lib/vfx-measure.mjs";

const LABEL = process.env.LABEL ?? "after";
const OUT = resolve(process.env.OUT_DIR ?? join("tmp/vfx", "skyfire-" + LABEL));
const SIZES = (process.env.SIZES ?? "1280x720,1920x1080").split(",").map((s) => s.split("x").map(Number));
const CAMS = (process.env.CAMS ?? "play,close").split(",");
const GROUNDS = (process.env.GROUNDS ?? "light,dark").split(",");
const SEED = process.env.SEED ?? "20261028";
const REFERENCE = process.env.REFERENCE ?? resolve("../../tmp/vfx/owner-reference-layered-vfx.webp");
/** Frames drawn one by one from the cast (A, R, T, I), then F every F_STEP frames to F_END (7 s). */
const DENSE = 70;
const F_STEP = 15;
const F_END = 420;
/** Sky Fire's timing in frames (rules delayMs 800 = 48 frames; VFX_STANDARD §5.3 part 2). */
const R_AT = 12;
const I_AT = 48;
/** Word tags (ui/tags.ts): plate rgba(35, 28, 23, 0.9); dimmest text is the meaning line #EADFC4. */
const PLATE = [35, 28, 23];
const PLATE_ALPHA = 0.9;
const TEXT_LUM = Math.min(lum255(0xff, 0xf4, 0xd6), lum255(0x7f, 0xf5, 0xe0), lum255(0xea, 0xdf, 0xc4));
/** Frames on the before/after key sheets. */
export const KEY_FRAMES = ["pre", "f000", "f003", "f006", "f011", "f012", "f013", "f016", "f020", "f030", "f040", "f047", "f048", "f049", "f051", "f054", "f058", "f063", "f070", "f085", "f145", "f235", "f325", "f415"];

const META = `(() => {
  const d = window.__dh; const s = d.state(); const fx = d.numberLayer(); const core = fx && fx.core;
  const tags = [...document.querySelectorAll('.dh-tag')].filter((t) => { const c = getComputedStyle(t); return c.display !== 'none' && c.visibility !== 'hidden' && Number(c.opacity) > 0.05 && !t.closest('[hidden]'); })
    .map((t) => t.querySelector('.dh-tag__body')).filter(Boolean).map((b) => { const r = b.getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; }).filter((r) => r[2] > 4 && r[3] > 4);
  const p = (v) => (v ? d.project(v.x, v.y, v.z) : null);
  const sky = core && core.skyDebug ? core.skyDebug() : null;
  const w = innerWidth; const h = innerHeight;
  const inFrame = (v) => { const q = d.project(v.x, v.y, v.z); return q.x >= 0 && q.x <= w && q.y >= 0 && q.y <= h; };
  const pathIn = sky && sky.path && sky.path.length ? sky.path.filter(inFrame).length / sky.path.length : null;
  const skyScreen = sky ? { phase: sky.phase, age: sky.age, frame: sky.frame, head: p(sky.head), flash: p(sky.flash), impact: p(sky.impact), mouth: p(sky.mouth), domeM: sky.domeM, streaks: sky.streaks, rocks: sky.rocks, shards: sky.shards, fissures: sky.fissures, pathIn, ring: sky.impact && sky.domeM > 0 ? { c: p(sky.impact), e: d.project(sky.impact.x + sky.domeM, sky.impact.y, sky.impact.z), rule: d.project(sky.impact.x + 4, sky.impact.y, sky.impact.z) } : null } : null;
  const ev = d.events().tally;
  return { tick: s.tick, phase: s.phase, stats: core && core.stats ? core.stats() : null, light: core && core.mouthLightLevel !== undefined ? core.mouthLightLevel : null, lightCd: core && core.light ? core.light.intensity : null, drawCalls: d.perf().drawCalls, tags, sky: skyScreen, hits: ev.hit ?? 0, skills: ev.skill ?? 0 };
})()`;

const state = (page) => page.eval("window.__dh.state()");

/**
 * Steps wave 1 until a drawn foe stands in the word zone (≤ 24 m), then picks the sim's default target: the foe with
 * the most others within 4 m (ties: more HP), as combat.ts skyfire() does.
 */
async function pickTarget(page) {
  let first = -1;
  for (let k = 0; k < 900; k += 1) {
    // In the word zone and 10 m or more out (a short arc would hide under the Dragon); a group of two or more is
    // waited for up to 300 frames after the first foe comes in.
    const pick = await page.eval(`(() => {
      const foes = window.__dh.foes().filter((f) => f.visible && Math.hypot(f.x, f.z) <= 24 && Math.hypot(f.x, f.z) >= 10);
      if (foes.length === 0) return null;
      let best = null;
      for (const f of foes) {
        let n = 0; let hp = 0;
        for (const o of window.__dh.foes()) if (Math.hypot(o.x - f.x, o.z - f.z) <= 4) { n += 1; hp += o.hp; }
        if (!best || n > best.n || (n === best.n && hp > best.hp)) best = { ...f, n, hp };
      }
      return best;
    })()`);
    if (pick && first < 0) first = k;
    if (pick && (pick.n >= 2 || k - first >= 50)) return { ...pick, framesWaited: k * 6 };
    await step(page, 6);
  }
  return null;
}

/** Crop box round the dais, the target and the arc over them (sheet tiles), 16:9, inside the frame. */
async function cropBox(page, foe, w, h) {
  const a = await page.eval("window.__dh.project(0, 4.2, 0)");
  const b = await page.eval("window.__dh.project(" + foe.x + ", 0.5, " + foe.z + ")");
  const apex = await page.eval("window.__dh.project(" + foe.x / 2 + ", 9, " + foe.z / 2 + ")");
  const s = h / 720;
  const pad = 80 * s;
  let x0 = Math.min(a.x, b.x, apex.x) - pad;
  let x1 = Math.max(a.x, b.x, apex.x) + pad;
  let y0 = Math.min(a.y, b.y, apex.y) - pad;
  let y1 = Math.max(a.y, b.y, apex.y) + pad * 0.8;
  let cw = Math.max(x1 - x0, 420 * s);
  let ch = Math.max(y1 - y0, 236 * s);
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

const phaseOf = (f) => (f < R_AT ? "A" : f < I_AT ? (f < R_AT + 8 ? "R+T" : "T") : f < I_AT + 15 ? "I" : "F");

/** One capture: size × camera × ground. */
async function capture(page, [w, h], cam, ground) {
  const dir = join(OUT, w + "x" + h + "-" + cam + "-" + ground);
  mkdirSync(dir, { recursive: true });
  const opened = await open(page, w, h, ground);
  const picked = await pickTarget(page);
  if (!picked) return { dir, error: "no foe in the word zone", opened };
  const view = await aim(page, cam, picked);
  const crop = await cropBox(page, picked, w, h);
  const frames = [];
  await grab(page, dir, "a-00", "before cast", frames);
  await step(page, 1);
  await grab(page, dir, "pre", "pre (frame before the cast)", frames);
  // The sim's command, at the picked foe's point: the default target, the same spot on every build.
  await page.eval("window.__dh.send({ type: 'skill', skill: 'skyfire', at: [" + picked.x + ", " + picked.z + "] })");
  const castTick = (await state(page)).tick;
  for (let f = 0; f <= F_END; f += f < DENSE ? 1 : F_STEP) {
    await step(page, f === 0 ? 1 : f <= DENSE ? 1 : F_STEP);
    await grab(page, dir, "f" + String(f).padStart(3, "0"), "f" + f + " " + Math.round((f * 1000) / 60) + " ms " + phaseOf(f), frames);
  }
  const end = await state(page);
  writeFileSync(join(dir, "meta.json"), JSON.stringify({ opened, picked, view, crop, castTick, end, frames }, null, 1));
  return { dir, opened, picked, view, crop, castTick, frames };
}

/** Gain of a cell over a reference frame, frame by frame. */
const series = (frames, ref, roi) => {
  const base = meanLuma(readRgb(ref.png), roi);
  return frames.map((f) => +(meanLuma(readRgb(f.png), roi) - base).toFixed(4));
};
const firstOverPeak = (values) => {
  const peak = Math.max(...values);
  return peak > 0 ? +(values[0] / peak).toFixed(3) : null;
};

/**
 * Measures of one capture (VFX_STANDARD §5.6). Builds without skyDebug (before) are measured at the same screen points
 * as the after run (`at`: { flash, impact } in px, same scene) and at the impact frame read from the hit tally.
 */
export function measure(run, h, { at = null } = {}) {
  const frames = run.frames;
  const s = h / 720;
  const dense = frames.filter((f) => /^f0[0-6]\d$|^f070$/.test(f.name));
  const byName = new Map(frames.map((f) => [f.name, f]));
  const cast = byName.get("pre");
  const hitsAtCast = cast.hits;
  // The impact frame: the first frame whose hit tally grew after the cast (the sim's area hit), else f48.
  const impactFrame = dense.find((f) => f.hits > hitsAtCast);
  const iAt = impactFrame ? Number(impactFrame.name.slice(1)) : I_AT;
  const releaseFrame = dense.find((f) => f.sky?.phase === "R" || f.sky?.phase === "T");
  const rAt = releaseFrame ? Number(releaseFrame.name.slice(1)) : R_AT;
  const cell = Math.round(18 * s);
  const box = (p) => ({ x: p.x - cell / 2, y: p.y - cell / 2, w: cell, h: cell });
  const flashPx = at?.flash ?? (releaseFrame?.sky?.flash?.visible ? releaseFrame.sky.flash : null);
  const impactPx = at?.impact ?? (impactFrame?.sky?.impact?.visible ? impactFrame.sky.impact : null) ?? run.crop.foe;
  const frameAt = (n) => byName.get("f" + String(n).padStart(3, "0"));
  const release = flashPx
    ? { at: { x: Math.round(flashPx.x), y: Math.round(flashPx.y) }, frame: rAt, series: series([rAt, rAt + 1, rAt + 2, rAt + 3, rAt + 4, rAt + 5, rAt + 6, rAt + 7].map(frameAt).filter(Boolean), frameAt(rAt - 1), box(flashPx)) }
    : null;
  if (release) release.firstOverPeak = firstOverPeak(release.series);
  const impactSeries = series([iAt, iAt + 1, iAt + 2, iAt + 3, iAt + 4, iAt + 5, iAt + 6, iAt + 7, iAt + 8].map(frameAt).filter(Boolean), frameAt(iAt - 1), box(impactPx));
  const impact = { at: { x: Math.round(impactPx.x), y: Math.round(impactPx.y) }, frame: iAt, series: impactSeries, firstOverPeak: firstOverPeak(impactSeries) };
  // The white-hot flash on its first frame, as a blob (core ≥ 0.9 luma, body +0.15 over the frame before).
  const before = readRgb(frameAt(iAt - 1).png);
  const f0 = readRgb(frameAt(iAt).png);
  impact.blob = { core: brightBlob(f0, before, impactPx, { level: 0.9, gain: 0.08, reach: Math.round(160 * s) }), body: brightBlob(f0, before, impactPx, { level: 0, gain: 0.15, reach: Math.round(160 * s) }) };
  // Lights: the light's intensity (cd) frame by frame from R and from I (after builds).
  const lightRow = (from, n) => Array.from({ length: n }, (_, k) => frameAt(from + k)?.lightCd ?? null);
  const lights = { release: lightRow(rAt, 8), impact: lightRow(iAt, 14) };
  const lightFirst = (row) => {
    const v = row.map((x) => x ?? 0);
    const peak = Math.max(...v);
    return peak > 0 ? +(v[0] / peak).toFixed(3) : null;
  };
  lights.releaseFirstOverPeak = lightFirst(lights.release);
  lights.impactFirstOverPeak = lightFirst(lights.impact);
  // T: the fireball head in flight (f14 … impact − 2), against the frame before the cast.
  const preImg = readRgb(cast.png);
  const shot = { x: run.crop.foe.x - run.crop.mouth.x, y: run.crop.foe.y - run.crop.mouth.y };
  const heads = dense
    .filter((f) => {
      const n = Number(f.name.slice(1));
      return n >= rAt + 2 && n <= iAt - 2 && f.sky?.head?.visible;
    })
    .map((f) => ({ frame: f.name, ...(headSize(readRgb(f.png), preImg, f.sky.head, shot, { reach: Math.round(120 * s) }) ?? {}) }));
  const sized = heads.filter((x) => x.along !== undefined);
  // The path: share of the arc inside the frame (after builds report it from the release on).
  const pathRows = dense.filter((f) => typeof f.sky?.pathIn === "number").map((f) => f.sky.pathIn);
  const path = pathRows.length ? { inFrame: +Math.min(...pathRows).toFixed(3) } : null;
  // The dome at its widest against the rule's 4 m on screen (radius in px along screen x).
  const rings = dense.filter((f) => f.sky?.ring?.c && f.sky.ring.e).map((f) => ({ frame: f.name, domeM: f.sky.domeM, px: Math.hypot(f.sky.ring.e.x - f.sky.ring.c.x, f.sky.ring.e.y - f.sky.ring.c.y), rulePx: Math.hypot(f.sky.ring.rule.x - f.sky.ring.c.x, f.sky.ring.rule.y - f.sky.ring.c.y) }));
  const widest = rings.length ? rings.reduce((a, b) => (b.domeM > a.domeM ? b : a)) : null;
  const effect = frames.filter((f) => f.name !== "a-00");
  let whiteMax = 0;
  let whiteAt = null;
  const contrasts = [];
  for (const f of effect) {
    const img = readRgb(f.png);
    const white = whiteOut(img);
    if (white > whiteMax) {
      whiteMax = white;
      whiteAt = f.name;
    }
    const c = tagContrast(img, f.tags, PLATE, PLATE_ALPHA, TEXT_LUM);
    if (c !== null) contrasts.push({ frame: f.name, contrast: c, tags: f.tags.length });
  }
  const sorted = [...contrasts].sort((a, b) => a.contrast - b.contrast);
  const drawCalls = dense.map((f) => f.drawCalls);
  return {
    frames: { release: rAt, impact: iAt },
    release,
    impact,
    lights,
    head: { frames: heads, minAlong: sized.length ? Math.min(...sized.map((x) => x.along)) : null, minAcross: sized.length ? Math.min(...sized.map((x) => x.across)) : null },
    path,
    dome: widest ? { frame: widest.frame, radiusM: +widest.domeM.toFixed(2), px: +widest.px.toFixed(1), rulePx: +widest.rulePx.toFixed(1), ratio: +(widest.px / widest.rulePx).toFixed(3) } : null,
    whiteOutMaxPct: +(whiteMax * 100).toFixed(2),
    whiteOutAt: whiteAt,
    tagContrast: { samples: contrasts.length, tagsMax: Math.max(0, ...contrasts.map((c) => c.tags)), worst: sorted[0] ?? null, p01: sorted.length ? +sorted[Math.floor(sorted.length * 0.01)].contrast.toFixed(2) : null, underImpact: sorted.filter((c) => { const n = Number(c.frame.slice(1)); return n >= iAt && n < iAt + 15; }).slice(0, 3) },
    drawCalls: { idle: frames.find((f) => f.name === "pre")?.drawCalls ?? null, max: Math.max(...drawCalls), atRelease: frameAt(rAt)?.drawCalls ?? null, atImpact: frameAt(iAt + 2)?.drawCalls ?? null },
  };
}

/** Sheets of one capture: every frame cropped, the key frames cropped, a few whole frames. */
function sheets(run, w, h) {
  const dir = run.dir;
  const tile = Math.round(Math.min(480, run.crop.w));
  const title = LABEL + " · " + w + "x" + h + " · " + dir.split("/").pop();
  const crop = montage(run.frames.map((f) => ({ file: f.jpg, label: f.label + " · tick " + f.tick, crop: run.crop })), join(dir, "sheet-crop.jpg"), { columns: 10, tileW: tile, title });
  const keys = montage(
    run.frames.filter((f) => KEY_FRAMES.includes(f.name)).map((f) => ({ file: f.jpg, label: LABEL.toUpperCase() + " " + f.label, crop: run.crop })),
    join(dir, "sheet-keys.jpg"),
    { columns: 8, tileW: tile, title },
  );
  const pick = ["pre", "f006", "f012", "f020", "f036", "f048", "f050", "f054", "f063", "f100", "f220", "f415"];
  const full = montage(run.frames.filter((f) => pick.includes(f.name)).map((f) => ({ file: f.jpg, label: f.label })), join(dir, "sheet-full.jpg"), { columns: 4, tileW: 640, title: title + " · whole frames" });
  return { crop, keys, full };
}

/** A 3 s clip at 60 fps, frame by frame at the held clock: the cast (f20) to the aftermath. */
async function recordClip(page, [w, h]) {
  const dir = join(OUT, "clip-" + w + "x" + h);
  mkdirSync(dir, { recursive: true });
  await open(page, w, h, "light");
  const picked = await pickTarget(page);
  if (!picked) return { error: "no foe" };
  for (let f = 0; f < 180; f += 1) {
    if (f === 20) await page.eval("window.__dh.send({ type: 'skill', skill: 'skyfire', at: [" + picked.x + ", " + picked.z + "] })");
    await step(page, 1);
    await page.shot(join(dir, "c" + String(f).padStart(3, "0") + ".jpg"));
  }
  const file = clip(join(dir, "c%03d.jpg"), join(OUT, "clip-" + LABEL + "-" + w + "x" + h + ".mp4"), 60);
  return { file, castFrame: 20, picked };
}

/** Key → cast at the real clock: Alt+2's keydown to the frame that first drew Sky Fire's charge (fx.lastCast). */
async function live(page) {
  await page.viewport(1920, 1080, 1);
  await page.send("Storage.clearDataForOrigin", { origin: new URL(BASE).origin, storageTypes: "all" });
  await page.goto(BASE + "/?" + ["prelearn=0", "q=high", "wpm=35", "seed=" + SEED, process.env.QUERY ?? ""].filter(Boolean).join("&"), { settle: 300 });
  for (let k = 0; k < 120 && (await page.eval("window.__dh?.ready === true")) !== true; k += 1) await page.sleep(250);
  await page.sleep(2500);
  await press(page, "Enter");
  await page.eval("window.addEventListener('keydown', (e) => { if (e.altKey && e.code === 'Digit2') window.__castKeyAt = performance.now(); }, true)");
  const rows = [];
  for (let tries = 0; tries < 240 && rows.length < 5; tries += 1) {
    const ready = await page.eval("(() => { const d = window.__dh; const w = d.world(); const near = d.foes().some((f) => Math.hypot(f.x, f.z) <= 24); return near && w.tick >= w.combat.readyAt.skyfire; })()");
    if (!ready) {
      await page.sleep(250);
      continue;
    }
    await press(page, "Digit2", MOD.alt);
    await page.sleep(400);
    const row = await page.eval("(() => { const fx = window.__dh.numberLayer(); const c = fx && fx.lastCast; return { keyAt: window.__castKeyAt ?? null, castAt: c ? c.at : null }; })()");
    rows.push({ ...row, ms: row.castAt !== null && row.keyAt !== null ? +(row.castAt - row.keyAt).toFixed(1) : null });
    // Cooldown 24 s; the next cast needs it ready (speed the wait with the dev speed switch).
    await page.eval("window.__dh.setSpeed(8)");
    for (let k = 0; k < 40; k += 1) {
      if (await page.eval("(() => { const w = window.__dh.world(); return w.tick >= w.combat.readyAt.skyfire; })()")) break;
      await page.sleep(250);
    }
    await page.eval("window.__dh.setSpeed(1)");
  }
  const ms = rows.map((r) => r.ms).filter((v) => v !== null && v >= 0);
  return { rows, maxMs: ms.length ? Math.max(...ms) : null, meanMs: ms.length ? +(ms.reduce((a, b) => a + b, 0) / ms.length).toFixed(1) : null };
}

export default async function (page) {
  mkdirSync(OUT, { recursive: true });
  await page.send("Page.addScriptToEvaluateOnNewDocument", { source: SHIM });
  const report = { label: LABEL, seed: SEED, query: process.env.QUERY ?? "", runs: [], at: new Date().toISOString() };
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
            side = beside(REFERENCE, made.keys, join(run.dir, "beside-reference.jpg"), size[1] >= 1080 ? 1200 : 900);
          } catch (error) {
            side = "reference missing: " + String(error).slice(0, 120);
          }
          report.runs.push({ size: size.join("x"), cam, ground, picked: run.picked, castTick: run.castTick, frames: run.frames.length, crop: run.crop, view: run.view, sheets: made, beside: side, measures });
          // Raw canvas-only PNGs are only for the measures (VFX lane disk rule: score, then drop the raw frames).
          if (process.env.KEEP_PNG !== "1") for (const f of run.frames) rmSync(f.png, { force: true });
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
