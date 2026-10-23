/**
 * CDP scenario for the audio harness (05 §10 dh-audio-duck and the M0a sound
 * checks). Run with the dev server up:
 *   URL=http://127.0.0.1:3217 OUT_DIR=tmp/shots/audio node scripts/visual/cdp-run.mjs src/audio/dev/audio-check.mjs
 * Returns the harness results, failed loads (status ≥ 400) and a screenshot.
 * Owner: audio (LANES.md); the integrator may move it to scripts/visual/scenarios/dh-audio-duck.mjs.
 */
export default async function audioCheck(page) {
  const base = process.env.URL ?? "http://127.0.0.1:3217";
  const out = process.env.OUT_DIR ?? "tmp/shots/audio";
  await page.viewport(1640, 1300);
  await page.goto(base + "/src/audio/dev/harness.html", { settle: 300 });
  let done = false;
  for (let i = 0; i < 240 && !done; i += 1) {
    done = (await page.eval("window.__audioHarness?.done === true")) === true;
    if (!done) await page.sleep(500);
  }
  const results = await page.eval("window.__audioHarness ?? null");
  const failedLoads = await page.eval(
    "performance.getEntriesByType('resource').filter((r) => (r.responseStatus ?? 0) >= 400).map((r) => r.name + ' ' + r.responseStatus)",
  );
  const shot = await page.shot(out + "/harness.png", { fullPage: true });
  const ducks = Object.fromEntries((results?.ducks ?? []).map((d) => [d.bus, d.dipDb]));
  // 05 §7.2: music −4, world −6, heroes −3 dB; learning never ducked.
  const duckOk =
    Math.abs((ducks.music ?? 0) + 4) < 0.6 &&
    Math.abs((ducks.enemies ?? 0) + 6) < 0.6 &&
    Math.abs((ducks.traps ?? 0) + 6) < 0.6 &&
    Math.abs((ducks.dragon ?? 0) + 3) < 0.6 &&
    Math.abs(ducks.learning ?? 1) < 0.2;
  return {
    done,
    pass: done && results.failures.length === 0 && results.flood.ok && results.music.ok && results.live.ok && duckOk && failedLoads.length === 0,
    duckOk,
    failures: results?.failures,
    flood: results?.flood,
    ducks: results?.ducks,
    music: results?.music,
    live: results?.live,
    failedLoads,
    // Peak per sound in dBFS (mix balance at default volumes).
    peaksDb: Object.fromEntries((results?.soundDetails ?? []).map((s) => [s.id, Math.round(20 * Math.log10(Math.max(1e-6, s.peak)))])),
    shot,
  };
}
