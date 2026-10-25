// dh-numbers (round 2 gate: "two HOÀN HẢO numbers touch"): T4–T5 presentation
// hits (__dh.fxStorm) on live foes, many at once, then the drawn number boxes
// (digits with their overhang, the "HOÀN HẢO" label; kit feedback/numbers.ts) are
// checked pairwise after every frame (__dh.numbersTouching must stay 0) and
// against the protected UI (__dh.numbersOverlaps). Works at any frame rate: the
// world is stepped in the page to wave 1's crowd (logged keys only).
// SIZE=1920 runs at 1920×1080 (default 1280×720). Owner: integrator (LANES.md).
import { join } from "node:path";
import { badResources, boot, outDir, press, waitFor } from "./lib/dh.mjs";

const [W, H] = process.env.SIZE === "1920" ? [1920, 1080] : [1280, 720];

/** Steps the world in the page until `n` foes are on screen (no typing: they walk in). */
const WALK_IN = (n) => `(async () => {
  const d = window.__dh; const { step } = await import('/src/sim/world.ts');
  const w = d.world();
  for (let k = 0; k < 60 * 40; k += 1) {
    if (d.foes().filter((f) => f.visible).length >= ${n}) break;
    step(w);
  }
  return d.foes().filter((f) => f.visible).length;
})()`;

const frames = (page, n = 1) => page.eval(`new Promise((done) => { let k = 0; const f = () => (++k >= ${n} ? done(k) : requestAnimationFrame(f)); requestAnimationFrame(f); })`);

export default async function (page) {
  const out = outDir("numbers");
  await boot(page, "prelearn=0", { width: W, height: H });
  await press(page, "Enter");
  await waitFor(page, "s.phase === 'wave'", { timeoutMs: 60000 });
  const foes = await page.eval(WALK_IN(5));
  // Freeze the world (presentation keeps running), then storms: 6 bursts of 10 hits, a frame apart.
  await page.eval("window.__dh.setSpeed(0.25)");
  let touchingMax = 0;
  let overlapsMax = 0;
  let samples = 0;
  const shots = [];
  for (let burst = 0; burst < 6; burst += 1) {
    await page.eval("window.__dh.fxStorm(10)");
    for (let f = 0; f < 2; f += 1) {
      await frames(page, 1);
      touchingMax = Math.max(touchingMax, await page.eval("window.__dh.numbersTouching()"));
      overlapsMax = Math.max(overlapsMax, await page.eval("window.__dh.numbersOverlaps()"));
      samples += 1;
    }
    if (burst === 1 || burst === 4) {
      const file = join(out, `numbers-storm-${burst}-${W}x${H}.png`);
      await page.shot(file);
      shots.push(file);
    }
  }
  const live = await page.eval("window.__dh.world().enemies.live");
  return {
    ok: touchingMax === 0 && overlapsMax === 0 && page.exceptions.length === 0,
    size: W + "x" + H,
    foesOnScreen: foes,
    foesAlive: live,
    numbersTouchingMax: touchingMax,
    numbersOverProtectedMax: overlapsMax,
    samples,
    shots,
    replay: await page.eval("window.__dh.replayCheck()"),
    badResources: await badResources(page),
  };
}
