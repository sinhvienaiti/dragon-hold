// dh-perf: frame times of the real game (not the bench) while a word bot
// plays at ?speed=SPEED (default 2) up to wave WAVES (default 5), at the
// window size given to cdp-run. Run Chrome uncapped for true frame times:
//   CHROME_FLAGS="--disable-gpu-vsync --disable-frame-rate-limit" node scripts/visual/cdp-run.mjs scripts/visual/scenarios/dh-perf.mjs --width=1920 --height=1080
// Owner: integrator (LANES.md).
import { join } from "node:path";
import { badResources, boot, outDir, press, state, waitFor } from "./lib/dh.mjs";

const SPEED = process.env.SPEED ?? "2";
const WAVES = Number(process.env.WAVES ?? "5");
const Q = process.env.Q ?? "high";

export default async function (page) {
  const out = outDir("integrator");
  await boot(page, `prelearn=0&q=${Q}&speed=${SPEED}`);
  await press(page, "Enter");
  await waitFor(page, "s.phase === 'wave'", { timeoutMs: 15000 });
  void page.eval(`window.__botRun = (async () => {
    const d = window.__dh;
    for (let k = 0; k < 60000; k += 1) {
      const w = d.world();
      if (w.phase === 'victory' || w.phase === 'defeat' || window.__stopBot) break;
      if (d.panel() === 'review') { d.action('escape'); }
      if (w.phase === 'break' && w.phaseEndsAt > 0) d.send({ type: 'call-early' });
      const live = d.words(); const lock = w.words.lock;
      const word = lock >= 0 ? live.find((x) => x.slot === lock) : live[0];
      if (word) for (const ch of word.text.slice(word.typed)) d.send({ type: 'key', letter: ch.charCodeAt(0) - 97 });
      await new Promise((r) => setTimeout(r, 180));
    }
  })()`);
  const rows = [];
  let lastWave = 1;
  let maxLive = 0;
  const t0 = Date.now();
  await page.eval("window.__dh.perf()");
  while (Date.now() - t0 < 600000) {
    const s = await state(page);
    maxLive = Math.max(maxLive, s.live);
    if (s.wave !== lastWave || s.phase === "victory" || s.phase === "defeat") {
      const p = await page.eval("window.__dh.perf()");
      rows.push({ wave: lastWave, meanMs: +p.meanMs.toFixed(2), p95Ms: +p.p95Ms.toFixed(2), maxMs: +p.maxMs.toFixed(1), drawCalls: p.drawCalls, triangles: p.triangles, maxLive });
      if (lastWave === 5) await page.shot(join(out, `perf-wave5-${page.width}x${page.height}.png`));
      lastWave = s.wave;
      maxLive = 0;
      if (s.wave > WAVES || s.phase === "victory" || s.phase === "defeat") break;
    }
    await page.sleep(500);
  }
  await page.eval("window.__stopBot = true");
  return { quality: Q, size: page.width + "x" + page.height, rows, end: await state(page), badResources: await badResources(page) };
}
