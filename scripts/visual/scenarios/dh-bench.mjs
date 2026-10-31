// Crowd bench scenario (DESIGN.md §9 M0, first task of view-crowd-fx): loads the
// dev page, imports src/view/bench.ts through Vite, runs runCrowdBench on a
// full-screen host, waits for window.__dhBench, writes a JSON report and shots.
// The page needs no app wiring (once the integrator routes /?bench=crowd the
// scenario still works). For true frame times run Chrome uncapped:
//   CHROME_FLAGS="--disable-gpu-vsync --disable-frame-rate-limit" URL=http://127.0.0.1:3005/ \
//     node scripts/visual/cdp-run.mjs scripts/visual/scenarios/dh-bench.mjs --width=1280 --height=720
// Q=low|medium|high|ultra, COUNT=220, SECONDS=6, FX=0 without effects, SHOTS=0 without pictures,
// GROUND=painted on view-terrain's diorama (createMapStage) instead of the flat bench ground,
// SHOWCASE=1 adds the effects close-ups (bench.ts runFxShowcase), BENCH=0 SHOWCASE only.
// MODE=bones (M0b gate): the owner's models with bones and clips, and the GLB props with GROUND=painted.
// Output: tmp/shots/view-crowd-fx/.
// Source adapted: games/space-typing/scripts/visual/scenarios/defense-bench.mjs.
// Owner: view-crowd-fx (LANES.md).
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const OUT = resolve(process.env.OUT_DIR ?? "tmp/shots/view-crowd-fx");

/** Close-ups of every effect through the real presenters (bench.ts runFxShowcase). */
async function showcase(page, base, quality) {
  await page.goto(base + "/?title=0&bench=fx", { settle: 600 });
  const loaded = await page.eval(
    "(async () => { const bench = await import('/src/view/bench.ts');" +
      " const host = document.createElement('div'); host.id = 'dh-showcase'; host.style.cssText = 'position:fixed;inset:0;z-index:50;background:#a9c2cf';" +
      " document.body.append(host); return bench.runFxShowcase(host, " + JSON.stringify(quality) + "); })()",
  );
  await page.sleep(1200);
  const pictures = [];
  const shot = async (name) => pictures.push(await page.shot(join(OUT, "fx-" + name + ".png")));
  const steps = [
    ["bolts", [[380, "bolts-flight"], [700, "bolts-impact"]]],
    ["breath", [[320, "breath"]]],
    ["meteor", [[420, "meteor-fall"], [520, "meteor-impact"]]],
    ["telegraphs", [[550, "telegraphs"]]],
    ["burn", [[700, "burn"]]],
    ["spikes", []],
    ["bomb", []],
    ["net", [[160, "traps"]]],
    ["heal", []],
    ["gold", [[380, "heal-gold"]]],
    ["all", [[900, "all"]]],
  ];
  for (const [effect, frames] of steps) {
    await page.eval("window.__dhFx(" + JSON.stringify(effect) + ")");
    for (const [wait, name] of frames) {
      await page.sleep(wait);
      await shot(name);
    }
    if (frames.length > 0) await page.sleep(1400);
  }
  await page.eval("window.__dhShowcaseStop && window.__dhShowcaseStop()");
  return { loaded, pictures };
}

export default async function (page) {
  const base = (process.env.URL ?? "http://127.0.0.1:3005/").replace(/\/$/, "");
  if (process.env.BENCH === "0") return { showcase: await showcase(page, base, process.env.Q ?? "high") };
  const quality = process.env.Q ?? "high";
  const count = Number(process.env.COUNT ?? "220");
  const seconds = Number(process.env.SECONDS ?? "6");
  const fx = process.env.FX !== "0";
  const ground = process.env.GROUND === "painted" ? "painted" : "flat";
  const shots = process.env.SHOTS !== "0";
  const bones = process.env.MODE === "bones";
  // BLOOM=0|1 (painted ground) and MOUTHLIGHT=0|1 (the effects' mouth light); unset: the tier's defaults.
  const bloom = process.env.BLOOM === undefined ? undefined : process.env.BLOOM === "1";
  const mouthLight = process.env.MOUTHLIGHT === undefined ? undefined : process.env.MOUTHLIGHT === "1";
  // FOEBLOWS=1: the paused foe blows at the ring (VFX step 3); unset: off, as in play.
  const foeBlows = process.env.FOEBLOWS === "1" ? true : undefined;
  // WARMUP=s: seconds before the clock starts (bench default 1.5). Uncapped, the last load hitch (models and
  // shaders coming in) can land after 1.5 s and stand as the run's max.
  const warmup = process.env.WARMUP === undefined ? undefined : Number(process.env.WARMUP);
  const tag = quality + "-" + page.width + "x" + page.height + "@" + page.dpr + (fx ? "" : "-nofx") + (ground === "painted" ? "-painted" : "") + (bones ? "-bones" : "") + (bloom === undefined ? "" : bloom ? "-bloom" : "-nobloom") + (mouthLight === undefined ? "" : mouthLight ? "-light" : "-nolight") + (foeBlows ? "-foeblows" : "");
  mkdirSync(OUT, { recursive: true });
  await page.goto(base + "/?title=0&bench=crowd&q=" + quality + "&count=" + count, { settle: 600 });
  // Start the bench unless the app already did (integrator route).
  const started = await page.eval(
    "(async () => { if (window.__dhBenchStop) return 'app'; const bench = await import('/src/view/bench.ts');" +
      " const host = document.createElement('div'); host.id = 'dh-bench'; host.style.cssText = 'position:fixed;inset:0;z-index:50;background:#a9c2cf';" +
      " document.body.append(host); bench.runCrowdBench(host, " +
      JSON.stringify({ count, quality, seconds, fx, ground, bones, bloom, mouthLight, foeBlows, warmup }) +
      "); return 'scenario'; })()",
  );
  let result = null;
  for (let wait = 0; wait < 240 && !result; wait += 1) {
    await page.sleep(250);
    result = await page.eval("window.__dhBench ?? null");
  }
  if (!result || result.evalError) return { error: "bench did not finish", started, result };
  const pictures = [];
  if (shots) {
    pictures.push(await page.shot(join(OUT, "bench-" + tag + ".png")));
    await page.eval("window.__dhBenchCamera('close')");
    await page.sleep(400);
    pictures.push(await page.shot(join(OUT, "bench-close-" + tag + ".png")));
  }
  // Load errors are not console errors: list failed or 404 resources by hand.
  const resources = await page.eval(
    "performance.getEntriesByType('resource').filter((r) => (r.responseStatus ?? 200) >= 400).map((r) => r.name + ' ' + r.responseStatus)",
  );
  await page.eval("window.__dhBenchStop && window.__dhBenchStop()");
  const report = { result, started, badResources: resources, at: new Date().toISOString() };
  const file = join(OUT, "bench-" + tag + ".json");
  writeFileSync(file, JSON.stringify(report, null, 1));
  const fxShots = process.env.SHOWCASE === "1" ? await showcase(page, base, quality) : null;
  return { file, started, pictures, badResources: resources, result, showcase: fxShots };
}
