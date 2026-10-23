// dh-hitstop-keys (05 §10, §5): type at 120 WPM (one key every 100 ms) for
// 12 s while a T4–T5 storm runs (presentation-only hits through __dh.fxStorm:
// hit-stops, shake, numbers). Every letter must reach the sim (router letters
// = key commands = the sim's key count), the world must have been slowed by
// hit-stop meanwhile, and the key → drawn frame time must stay ≤ 70 ms.
// Owner: integrator (LANES.md).
import { join } from "node:path";
import { badResources, boot, outDir, pickWord, press, state, waitFor } from "./lib/dh.mjs";

export default async function (page) {
  const out = outDir("integrator");
  await boot(page, "prelearn=0", { width: 1280, height: 720 });
  await press(page, "Enter");
  await waitFor(page, "s.phase === 'wave'", { timeoutMs: 15000 });
  await waitFor(page, "window.__dh.words().length >= 2", { timeoutMs: 20000 });
  const before = await state(page);
  const eventsBefore = await page.eval("window.__dh.events()");
  // The storm: 8 tier 4–5 hits every 120 ms.
  await page.eval("window.__storm = setInterval(() => window.__dh.fxStorm(8), 120)");
  const t0 = Date.now();
  let sent = 0;
  let overlapsMax = 0;
  let shot = false;
  while (Date.now() - t0 < 12000) {
    const word = await pickWord(page);
    const text = word ? word.text.slice(word.typed) : "q";
    for (const ch of text) {
      const k0 = Date.now();
      await press(page, "Key" + ch.toUpperCase());
      sent += 1;
      const wait = 100 - (Date.now() - k0);
      if (wait > 0) await page.sleep(wait);
    }
    overlapsMax = Math.max(overlapsMax, await page.eval("window.__dh.numbersOverlaps()"));
    if (!shot && Date.now() - t0 > 3000) {
      await page.shot(join(out, "hitstop-storm-1280x720.png"));
      shot = true;
    }
  }
  await page.eval("clearInterval(window.__storm)");
  await page.sleep(300);
  const after = await state(page);
  const eventsAfter = await page.eval("window.__dh.events()");
  const perf = await page.eval("window.__dh.perf()");
  const letters = after.routerLetters - before.routerLetters;
  const toSim = after.keysToSim - before.keysToSim;
  const simKeys = after.keys - before.keys;
  return {
    sent,
    letters,
    toSim,
    simKeys,
    lost: sent - simKeys,
    hitStopFrames: eventsAfter.slowFrames - eventsBefore.slowFrames,
    keyLatencyMaxMs: Math.round(perf.keyLatencyMaxMs * 10) / 10,
    keyLatencyMeanMs: Math.round(perf.keyLatencyMeanMs * 10) / 10,
    numbersOverProtected: overlapsMax,
    words: after.words - before.words,
    kills: after.kills - before.kills,
    frame: { meanMs: perf.meanMs, p95Ms: perf.p95Ms, maxMs: perf.maxMs },
    replay: await page.eval("window.__dh.replayCheck()"),
    badResources: await badResources(page),
  };
}
