// dh-load-hitch (model tiers lane, 29/10): long frames from the first page frame
// through model loading (scatter props swap in, crowd layers made) and the first
// foes of wave 1, at quality Q (default high). The VFX lane found a 240-250 ms
// frame on an effect's first draw (ANGLE over Metal builds a pipeline then); this
// says whether the heavier model tiers move such a cost into play. Logs every
// requestAnimationFrame interval from just after navigation; reports frames over
// LONG ms (default 50) in three phases: "load" (until window.__dh.ready), "title"
// (ready until the wave starts) and "wave" (the first WAVE_S seconds, default 20).
//   URL=http://127.0.0.1:4163/ Q=ultra node scripts/visual/cdp-run.mjs scripts/visual/scenarios/dh-load-hitch.mjs --width=1920 --height=1080
// Owner: view (model tiers lane).
import { press, startWave } from "./lib/dh.mjs";

export default async function (page) {
  const base = (process.env.URL ?? "http://127.0.0.1:4163/").replace(/\/$/, "");
  const quality = process.env.Q ?? "high";
  const long = Number(process.env.LONG ?? "50");
  const waveS = Number(process.env.WAVE_S ?? "20");
  await page.goto(base + "/?prelearn=0&seed=5&wpm=35&q=" + quality, { settle: 0 });
  await page.eval(
    "(() => { window.__hitch = { frames: [], marks: {} }; let last = performance.now();" +
      " const tick = (t) => { window.__hitch.frames.push([Math.round(t), +(t - last).toFixed(1)]); last = t; requestAnimationFrame(tick); };" +
      " requestAnimationFrame(tick); })()",
  );
  for (let wait = 0; wait < 240; wait += 1) {
    if ((await page.eval("window.__dh?.ready === true")) === true) break;
    await page.sleep(250);
  }
  await page.eval("window.__hitch.marks.ready = performance.now()");
  // Title and shop time: models settle, props swap in, the far ring bakes.
  await page.sleep(6000);
  await page.eval("window.__hitch.marks.wave = performance.now()");
  await press(page, "Enter");
  const started = await startWave(page);
  await page.sleep(waveS * 1000);
  await page.eval("window.__hitch.marks.end = performance.now()");
  const data = await page.eval("window.__hitch");
  const phase = (t) => (t < data.marks.ready ? "load" : t < data.marks.wave ? "title" : "wave");
  const summary = { load: { frames: 0, long: [] }, title: { frames: 0, long: [] }, wave: { frames: 0, long: [] } };
  for (const [t, ms] of data.frames) {
    if (t > data.marks.end) break;
    const bucket = summary[phase(t)];
    bucket.frames += 1;
    if (ms > long) bucket.long.push([Math.round(t - (phase(t) === "wave" ? data.marks.wave : 0)), ms]);
  }
  for (const bucket of Object.values(summary)) {
    bucket.maxMs = Math.max(0, ...bucket.long.map(([, ms]) => ms));
    bucket.long = bucket.long.slice(0, 20);
  }
  const perf = await page.eval("window.__dh.perf ? window.__dh.perf() : null");
  return { quality, started, readyAtMs: Math.round(data.marks.ready), summary, perf };
}
