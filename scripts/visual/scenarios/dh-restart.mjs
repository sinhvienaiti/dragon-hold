// dh-restart: "Chơi lại ải" from the pause menu (Esc, ↓, Enter) and the
// results screen's Enter rebuild the run: back in setup with fresh gold,
// one HUD, one strip, no leftover scene objects or overlay nodes, no GPU
// texture or shader program left behind or linked again, no long frame.
// Owner: integrator (LANES.md).
import { badResources, boot, MOD, press, state, waitFor } from "./lib/dh.mjs";

// Live WebGL textures and programs, programs ever linked, and frame gaps.
const GL_HOOK = `(() => {
  const textures = new Set(); const programs = new Set(); let linked = 0;
  const P = WebGL2RenderingContext.prototype;
  const ct = P.createTexture, dt = P.deleteTexture, cp = P.createProgram, dp = P.deleteProgram;
  P.createTexture = function () { const t = ct.call(this); textures.add(t); return t; };
  P.deleteTexture = function (t) { textures.delete(t); return dt.call(this, t); };
  P.createProgram = function () { const p = cp.call(this); programs.add(p); linked += 1; return p; };
  P.deleteProgram = function (p) { programs.delete(p); return dp.call(this, p); };
  window.__gl = () => ({ textures: textures.size, programs: programs.size, linked });
  window.__gaps = []; let last = 0;
  const tick = (t) => { if (last > 0) window.__gaps.push(t - last); last = t; requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
})();`;
const worstGap = "(() => { const g = window.__gaps; window.__gaps = []; return Math.round(Math.max(0, ...g)); })()";

export default async function (page) {
  await page.send("Page.addScriptToEvaluateOnNewDocument", { source: GL_HOOK });
  await boot(page, "prelearn=0", { width: 1280, height: 720 });
  const first = await state(page);
  await press(page, "Digit1");
  await press(page, "Enter");
  await press(page, "Enter");
  await waitFor(page, "s.phase === 'wave'", { timeoutMs: 15000 });
  await page.sleep(3000);
  const inWave = await state(page);
  await press(page, "Escape");
  await page.sleep(100);
  const glBefore = await page.eval("window.__gl()");
  await page.eval(worstGap);
  await press(page, "ArrowDown");
  await press(page, "Enter");
  await page.sleep(1500);
  const firstRestartMaxFrameMs = await page.eval(worstGap);
  const after = await state(page);
  const counts = await page.eval("({ hud: document.querySelectorAll('.dh-hud').length, strip: document.querySelectorAll('.dh-strip').length, results: document.querySelectorAll('.dh-results').length, frames: document.querySelectorAll('.kit-learning-frame').length, canvases: document.querySelectorAll('canvas').length })");
  // Again, three times: nothing piles up.
  for (let k = 0; k < 3; k += 1) {
    await press(page, "Escape");
    await page.sleep(80);
    await press(page, "ArrowDown");
    await press(page, "Enter");
    await page.sleep(900);
  }
  const again = await state(page);
  const againMaxFrameMs = await page.eval(worstGap);
  const glAfter = await page.eval("window.__gl()");
  void MOD;
  return {
    first: { phase: first.phase, gold: first.gold, layers: first.layers },
    inWave: { phase: inWave.phase, gold: inWave.gold, layers: inWave.layers, slots: inWave.slots },
    after: { phase: after.phase, gold: after.gold, wave: after.wave, slots: after.slots, layers: after.layers, menuOpen: after.menuOpen },
    again: { phase: again.phase, layers: again.layers },
    counts,
    gl: { before: glBefore, after4Restarts: glAfter, firstRestartMaxFrameMs, againMaxFrameMs },
    badResources: await badResources(page),
  };
}
