// dh-fire-bench (fire test A, DRAGON_FIRE_DIAGNOSIS_2026-10-31 §3 in the parent repo): the STRONG word hit on the
// same foe on three grounds, at the play camera, every frame at a held 60 fps clock, through view/fire-bench.ts
// (?bench=fire: the painted map, the owner's models, the real fx presenter fed a Perfect word-complete and its hit
// 12 ticks later). Per size × ground × variant it writes, into <OUT_DIR>/<size>-<ground>-<variant>/:
//   ref.png, nofoe.png      the frame before the shot, and the same with the foe moved off (its pixel mask);
//   s###.png                every frame from the shot (word-complete) to S_END;
//   fire-s###.png, smoke-s###.png   the fire and the smoke flipbooks alone (coverage, half size, depth-tested);
//   run.json                per frame: the struck point, the foe's base and top, live numbers, the sun on screen.
// Variants: a (test A, current grade), shoulder (test A, the grade's yellow shoulder), r10 (?fire=r10: round 10).
//   URL=http://127.0.0.1:3251 OUT_DIR=tmp/vfx/test-a node scripts/visual/cdp-run.mjs scripts/visual/scenarios/dh-fire-bench.mjs
// Env: SIZES (1280x720,1920x1080), GROUNDS (ford,sand,dark), VARIANTS (a,shoulder,r10), S_END (110), PROBE=1 (only
// place the foe on each ground and shoot one frame: spot checks).
// Owner: view-crowd-fx (LANES.md).
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { SHIM, step } from "./dh-vfx-word.mjs";

const OUT = resolve(process.env.OUT_DIR ?? "tmp/vfx/test-a");
const BASE = (process.env.URL ?? "http://127.0.0.1:3251/").replace(/\/$/, "");
const SIZES = (process.env.SIZES ?? "1280x720,1920x1080").split(",").map((s) => s.split("x").map(Number));
const GROUNDS = (process.env.GROUNDS ?? "ford,sand,dark").split(",");
const VARIANTS = (process.env.VARIANTS ?? "a,shoulder,r10").split(",");
const S_END = Number(process.env.S_END ?? "110");
/** Where the foe stands (m) on each ground; the ford spot is round 10's capture (moss-grunt at the Brook Lane ford). */
export const SPOTS = {
  ford: { at: [-24.65, 3.6], dark: false },
  sand: { at: JSON.parse(process.env.SAND ?? "[-3.4, 5.6]"), dark: false },
  dark: { at: JSON.parse(process.env.DARK ?? "[-9.5, 7.5]"), dark: true },
};

async function open(page, w, h, ground, variant) {
  await page.viewport(w, h, 1);
  await page.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  const query = ["bench=fire", "heldclock=1", variant === "r10" ? "fire=r10" : ""].filter(Boolean).join("&");
  await page.goto(BASE + "/?" + query, { settle: 300 });
  const dark = SPOTS[ground].dark;
  const shoulder = variant === "shoulder";
  await page.eval(
    "(() => { window.__fireReady = false; import('/src/view/fire-bench.ts').then((m) => { const host = document.createElement('div');" +
      " host.style.cssText = 'position:fixed;inset:0;z-index:50;background:#a9c2cf'; document.body.append(host);" +
      " return m.runFireBench(host, 'high', " + dark + ", " + shoulder + "); }).then(() => { window.__fireReady = true; }, (e) => { window.__fireError = String(e && e.stack || e); }); return true; })()",
  );
  for (let i = 0; i < 300; i += 1) {
    const state = await page.eval("({ ready: window.__fireReady && window.__dhFire.ready(), error: window.__fireError ?? null })");
    if (state.error) throw new Error(state.error);
    if (state.ready) break;
    await step(page, 2);
    await page.sleep(150);
  }
  const [x, z] = SPOTS[ground].at;
  await page.eval("window.__dhFire.place(" + x + ", " + z + ")");
  // Ground bake, water and models settle; the foe stands in its idle.
  await step(page, 60);
  return query;
}

async function saveMask(page, file, kind) {
  const url = await page.eval("window.__dhFire.mask('" + kind + "')");
  writeFileSync(file, Buffer.from(url.slice(url.indexOf(",") + 1), "base64"));
}

async function capture(page, [w, h], ground, variant) {
  const dir = join(OUT, w + "x" + h + "-" + ground + "-" + variant);
  mkdirSync(dir, { recursive: true });
  const query = await open(page, w, h, ground, variant);
  await page.eval("window.__dhFire.hide(true)");
  await step(page, 2);
  await page.shot(join(dir, "nofoe.png"), { format: "png" });
  await page.eval("window.__dhFire.hide(false)");
  await step(page, 2);
  await page.shot(join(dir, "ref.png"), { format: "png" });
  const track = [];
  await page.eval("window.__dhFire.shoot(128)");
  for (let f = 0; f <= S_END; f += 1) {
    await step(page, 1);
    const name = "s" + String(f).padStart(3, "0");
    await page.shot(join(dir, name + ".png"), { format: "png" });
    await saveMask(page, join(dir, "fire-" + name + ".png"), "fire");
    await saveMask(page, join(dir, "smoke-" + name + ".png"), "smoke");
    track.push(await page.eval("window.__dhFire.track()"));
  }
  // f0: the first frame with the impact clip drawn after the hit (the frame the bolt lands).
  const fireIds = ["impact-burst-a", "impact-burst", "impact-big", "fire-burst"];
  const hitIndex = track.findIndex((t) => t.hits > 0);
  let f0 = track.findIndex((t, i) => i >= hitIndex && fireIds.some((id) => (t.live[id] ?? 0) > 0) && i > 4);
  if (f0 < 0) f0 = hitIndex;
  const info = { size: [w, h], ground, variant, query, spot: SPOTS[ground].at, hitEventIndex: hitIndex, f0, frames: track.length, track };
  writeFileSync(join(dir, "run.json"), JSON.stringify(info, null, 1));
  return { dir, f0, hitEventIndex: hitIndex };
}

async function probe(page, [w, h]) {
  const out = [];
  for (const ground of GROUNDS) {
    const dir = join(OUT, "probe" + (process.env.PROBE_TAG ?? ""));
    mkdirSync(dir, { recursive: true });
    await open(page, w, h, ground, VARIANTS[0]);
    const file = join(dir, w + "x" + h + "-" + ground + ".jpg");
    await page.shot(file);
    await page.eval("window.__dhFire.shoot(128)");
    const at = (process.env.PROBE_FRAMES ?? "15").split(",").map(Number);
    const shots = [];
    let done = 0;
    for (const n of at) {
      await step(page, n - done);
      done = n;
      const hit = join(dir, w + "x" + h + "-" + ground + "-s" + String(n).padStart(3, "0") + ".jpg");
      await page.shot(hit);
      shots.push(hit);
    }
    out.push({ ground, file, shots, track: await page.eval("window.__dhFire.track()") });
  }
  return out;
}

export default async function (page) {
  mkdirSync(OUT, { recursive: true });
  await page.send("Page.addScriptToEvaluateOnNewDocument", { source: SHIM });
  const report = { at: new Date().toISOString(), spots: SPOTS, runs: [] };
  for (const size of SIZES) {
    if (process.env.PROBE === "1") {
      report.runs.push(...(await probe(page, size)));
      continue;
    }
    for (const ground of GROUNDS) {
      for (const variant of VARIANTS) {
        try {
          report.runs.push(await capture(page, size, ground, variant));
        } catch (error) {
          report.runs.push({ size: size.join("x"), ground, variant, error: String(error).slice(0, 400) });
        }
      }
    }
  }
  writeFileSync(join(OUT, "report-" + (process.env.PROBE === "1" ? "probe" : "bench") + ".json"), JSON.stringify(report, null, 1));
  return report;
}
