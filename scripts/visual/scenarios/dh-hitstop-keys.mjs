// dh-hitstop-keys (05 §10, §5): type at 120 WPM (one key every 100 ms) for
// 12 s while a T4–T5 storm runs (presentation-only hits through __dh.fxStorm:
// hit-stops, shake, numbers). Every letter must reach the sim (router letters
// = key commands = the sim's key count), the world must have been slowed by
// hit-stop meanwhile, and the key → drawn frame time must stay ≤ 70 ms.
// Round 3: the storm's numbers must not touch each other (drawn boxes with the
// "HOÀN HẢO" label, view/number-field.ts): sampled after every word, three pictures.
// Review 2 minor 1: each sample also records how many numbers were live and
// checks them as drawn (lib/dh.mjs INSTALL_INK_CHECK), so a run where no word
// finished and no number spawned cannot read as evidence.
// SIZE=1920 runs at 1920×1080 (default 1280×720).
// Owner: integrator (LANES.md).
import { join } from "node:path";
import { INSTALL_INK_CHECK, badResources, boot, outDir, pickWord, press, state, waitFor } from "./lib/dh.mjs";

const [W, H] = process.env.SIZE === "1920" ? [1920, 1080] : [1280, 720];

export default async function (page) {
  const out = outDir("integrator");
  await boot(page, "prelearn=0", { width: W, height: H });
  await press(page, "Enter");
  await waitFor(page, "s.phase === 'wave'", { timeoutMs: 15000 });
  await waitFor(page, "window.__dh.words().length >= 2", { timeoutMs: 20000 });
  const before = await state(page);
  const eventsBefore = await page.eval("window.__dh.events()");
  await page.eval(INSTALL_INK_CHECK);
  // The storm: 8 tier 4–5 hits every 120 ms.
  await page.eval("window.__storm = setInterval(() => window.__dh.fxStorm(8), 120)");
  const t0 = Date.now();
  let sent = 0;
  let overlapsMax = 0;
  let touchingMax = 0;
  let touchingSamples = 0;
  const drawn = { samplesWithNumbers: 0, numbersMax: 0, perfectMax: 0, pairsTouching: 0, minGapPx: null };
  let shots = 0;
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
    // Sampled in a frame callback after the game's own (the field as just drawn): the storm's
    // setInterval spawns between frames, and a merge only settles in the next update.
    const s = await page.eval("new Promise((done) => requestAnimationFrame(() => done({ overlaps: window.__dh.numbersOverlaps(), touching: window.__dh.numbersTouching(), ink: window.__dhInk() })))");
    overlapsMax = Math.max(overlapsMax, s.overlaps);
    touchingMax = Math.max(touchingMax, s.touching);
    touchingSamples += 1;
    const ink = s.ink;
    if (ink.numbers > 0) drawn.samplesWithNumbers += 1;
    drawn.numbersMax = Math.max(drawn.numbersMax, ink.numbers);
    drawn.perfectMax = Math.max(drawn.perfectMax, ink.perfect);
    drawn.pairsTouching += ink.pairsTouching;
    if (ink.minGapPx !== null) drawn.minGapPx = drawn.minGapPx === null ? ink.minGapPx : Math.min(drawn.minGapPx, ink.minGapPx);
    if (shots < 3 && Date.now() - t0 > 3000 + shots * 3000) {
      await page.shot(join(out, `hitstop-storm${shots === 0 ? "" : "-" + (shots + 1)}-${W}x${H}.png`));
      shots += 1;
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
    numbersTouching: { max: touchingMax, samples: touchingSamples },
    numbersDrawn: drawn,
    words: after.words - before.words,
    kills: after.kills - before.kills,
    frame: { meanMs: perf.meanMs, p95Ms: perf.p95Ms, maxMs: perf.maxMs },
    replay: await page.eval("window.__dh.replayCheck()"),
    badResources: await badResources(page),
  };
}
