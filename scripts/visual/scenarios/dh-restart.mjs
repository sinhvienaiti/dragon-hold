// dh-restart: "Chơi lại ải" from the pause menu (Esc, ↓, Enter) and the
// results screen's Enter rebuild the run: back in setup with fresh gold,
// one HUD, one strip, no leftover scene objects or overlay nodes.
// Owner: integrator (LANES.md).
import { badResources, boot, MOD, press, state, waitFor } from "./lib/dh.mjs";

export default async function (page) {
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
  await press(page, "ArrowDown");
  await press(page, "Enter");
  await page.sleep(1500);
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
  void MOD;
  return {
    first: { phase: first.phase, gold: first.gold, layers: first.layers },
    inWave: { phase: inWave.phase, gold: inWave.gold, layers: inWave.layers, slots: inWave.slots },
    after: { phase: after.phase, gold: after.gold, wave: after.wave, slots: after.slots, layers: after.layers, menuOpen: after.menuOpen },
    again: { phase: again.phase, layers: again.layers },
    counts,
    badResources: await badResources(page),
  };
}
