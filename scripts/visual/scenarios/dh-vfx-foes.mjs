// dh-vfx-foes (VFX step 3, VFX_STANDARD §3.3 row "Quái ra đòn", §4.5 capture rules): each foe kind's blow on
// Hỏa Long, and its spawn, through view/foe-showcase.ts (?bench=foes: the painted map, the owner's models, the real
// fx, telegraph and hero presenters fed made-up events) at a held clock, frame by frame:
//   A  the wind-up from its first frame to the last before the strike (start, middle, end),
//   R  the strike frame and the next three,
//   T, I, F  frames 5, 8, 12, 20 and 40 after it (an arrow or sting lands within 4–9 frames),
//   spawn  frames 0, 2, 6, 12 and 24 after the foe comes in.
// Env: OUT_DIR (default tmp/vfx/foes), SIZES (1920x1080,1280x720), GROUNDS (light,dark), CAMS (play,close),
// FOES (comma list, default every enemy kind the bench crowd has), URL.
// Per combo and foe: <combo>/<foe>/*.jpg, a sheet <combo>/<foe>-sheet.jpg cropped round the foe and the Dragon, and
// report.json (frame names, screen points, the fx counters, draw calls).
// Owner: view-crowd-fx (LANES.md).
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { montage } from "./lib/vfx-measure.mjs";
import { SHIM, step } from "./dh-vfx-word.mjs";

const OUT = resolve(process.env.OUT_DIR ?? "tmp/vfx/foes");
const BASE = (process.env.URL ?? "http://127.0.0.1:4141/").replace(/\/$/, "");
const SIZES = (process.env.SIZES ?? "1920x1080,1280x720").split(",").map((s) => s.split("x").map(Number));
const GROUNDS = (process.env.GROUNDS ?? "light,dark").split(",");
const CAMS = (process.env.CAMS ?? "play,close").split(",");
const FOES = (process.env.FOES ?? "moss-grunt,moss-archer,blight-wolf,tusk-boar,thorn-wasp,thorn-ant").split(",");
/** Where each foe stands (m): in front of the dais on the camera's side, ranged ones farther out. */
const SPOT = {
  "moss-grunt": [-2.5, 6.4],
  "moss-archer": [-6, 10],
  "blight-wolf": [-2.5, 6.4],
  "tusk-boar": [-3, 7],
  "thorn-wasp": [-5, 8],
  "thorn-ant": [-2, 6],
};

async function open(page, w, h, dark) {
  await page.viewport(w, h, 1);
  await page.goto(BASE + "/?bench=foes&heldclock=1", { settle: 300 });
  await page.eval(
    "(() => { window.__foesReady = false; import('/src/view/foe-showcase.ts').then((m) => { const host = document.createElement('div');" +
      " host.style.cssText = 'position:fixed;inset:0;z-index:50;background:#a9c2cf'; document.body.append(host);" +
      " return m.runFoeShowcase(host, 'high', " +
      (dark ? "true" : "false") +
      "); }).then(() => { window.__foesReady = true; }, (e) => { window.__foesError = String(e); }); return true; })()",
  );
  for (let i = 0; i < 240; i += 1) {
    const state = await page.eval("({ ready: window.__foesReady, error: window.__foesError ?? null })");
    if (state.error) throw new Error(state.error);
    if (state.ready) break;
    await step(page, 2);
    await page.sleep(150);
  }
  // Load done: let the ground bake, the water and the models settle.
  await step(page, 60);
}

async function grab(page, dir, name, frames) {
  const file = join(dir, name + ".jpg");
  await page.shot(file);
  const meta = await page.eval("(() => { const f = window.__dhFoes; return { counts: f.counts() }; })()");
  frames.push({ name, file, ...meta });
}

export default async function (page) {
  mkdirSync(OUT, { recursive: true });
  await page.send("Page.addScriptToEvaluateOnNewDocument", { source: SHIM });
  const report = { at: new Date().toISOString(), runs: [] };
  for (const [w, h] of SIZES) {
    for (const ground of GROUNDS) {
      try {
        await open(page, w, h, ground === "dark");
      } catch (error) {
        report.runs.push({ size: w + "x" + h, ground, error: String(error).slice(0, 300) });
        continue;
      }
      for (const cam of CAMS) {
        const combo = w + "x" + h + "-" + cam + "-" + ground;
        let previous = null;
        for (const foe of FOES) {
          const dir = join(OUT, combo, foe);
          mkdirSync(dir, { recursive: true });
          const [x, z] = SPOT[foe] ?? [-3, 7];
          if (previous) await page.eval("window.__dhFoes.place(" + JSON.stringify(previous) + ", 400, 400)");
          const placed = await page.eval("window.__dhFoes.place(" + JSON.stringify(foe) + ", " + x + ", " + z + ")");
          previous = foe;
          if (!placed) {
            report.runs.push({ combo, foe, error: "no such foe in the bench crowd" });
            continue;
          }
          const view = cam === "close" ? { zoom: 0.6, targetX: x * 0.5, targetZ: z * 0.5 } : { zoom: 1, targetX: 0, targetZ: 0 };
          await page.eval("window.__dhFoes.view(" + JSON.stringify(view) + ")");
          await step(page, 40);
          const frames = [];
          const points = await page.eval("window.__dhFoes.points(" + JSON.stringify(foe) + ")");
          await grab(page, dir, "pre", frames);
          const windupMs = await page.eval("window.__dhFoes.attack(" + JSON.stringify(foe) + ")");
          const windup = Math.max(3, Math.round(windupMs / (1000 / 60)));
          // A: first, middle and last frame of the wind-up.
          await step(page, 1);
          await grab(page, dir, "a-first", frames);
          await step(page, Math.floor(windup / 2) - 1);
          await grab(page, dir, "a-mid", frames);
          await step(page, windup - Math.floor(windup / 2) - 1);
          await grab(page, dir, "a-last", frames);
          // R: the strike frame and the next three; then T, I, F.
          let prev = -1;
          for (const f of [0, 1, 2, 3, 5, 8, 12, 20, 40]) {
            await step(page, f - prev);
            prev = f;
            await grab(page, dir, "s" + String(f).padStart(2, "0"), frames);
          }
          // Spawn: the foe comes in where it stands.
          await step(page, 30);
          await page.eval("window.__dhFoes.spawn(" + JSON.stringify(foe) + ")");
          prev = -1;
          for (const f of [0, 2, 6, 12, 24]) {
            await step(page, f - prev);
            prev = f;
            await grab(page, dir, "sp" + String(f).padStart(2, "0"), frames);
          }
          const drawCalls = await page.eval("window.__dhFoes.drawCalls()");
          // The sheet: cropped round the foe and the Dragon (16:9), every frame in order.
          const fx = points.foe.visible ? points.foe : points.edge;
          const cx = (fx.x + points.dragon.x) / 2;
          const cy = (fx.y + points.dragon.y) / 2;
          const span = Math.max(Math.abs(fx.x - points.dragon.x) * 1.6, Math.abs(fx.y - points.dragon.y) * 1.6 * (16 / 9), 360 * (h / 1080));
          const cw = Math.min(w, span);
          const ch = Math.min(h, cw * (9 / 16));
          const crop = { x: Math.max(0, Math.min(w - cw, cx - cw / 2)), y: Math.max(0, Math.min(h - ch, cy - ch / 2)), w: cw, h: ch };
          const label = (name) => (name === "pre" ? "pre" : name.startsWith("a-") ? "A " + name.slice(2) : name.startsWith("sp") ? "spawn +" + Number(name.slice(2)) : (Number(name.slice(1)) <= 3 ? "R +" : "T/I/F +") + Number(name.slice(1)));
          const sheet = join(OUT, combo, foe + "-sheet.jpg");
          montage(frames.map((f) => ({ file: f.file, crop, label: foe + " " + label(f.name) })), sheet, { columns: 9, tileW: 300 });
          report.runs.push({ combo, foe, spot: [x, z], windupMs, frames: frames.map((f) => ({ name: f.name, counts: f.counts })), points, crop, drawCalls, sheet });
        }
      }
    }
  }
  writeFileSync(join(OUT, "report.json"), JSON.stringify(report, null, 1));
  return report;
}
