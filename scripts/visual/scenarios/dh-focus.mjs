// dh-focus (06 §2, 05 §10): clicks on the HUD and the carry strip never take
// the keys (the next letter still types); losing focus in a wave or a break
// pauses the sim under a veil ("Bấm hoặc gõ phím bất kỳ để tiếp"), the clock
// stands still while hidden 10 s; the first press after a wave pause starts a
// 3-2-1, after a break pause it goes through. Esc opens the pause menu
// (sim still), Esc closes it. The portal's nav and alt-tab are simulated with
// blur and visibilitychange events on this page.
// Owner: integrator (LANES.md).
import { join } from "node:path";
import { badResources, boot, outDir, press, state, waitFor } from "./lib/dh.mjs";

async function clickAt(page, selector) {
  const p = await page.locate(selector);
  if (!p || p.w === 0) return false;
  await page.mouse(p.x, p.y);
  await page.mouse(p.x, p.y, "mousePressed");
  await page.mouse(p.x, p.y, "mouseReleased");
  await page.sleep(120);
  return true;
}

const keysNow = async (page) => (await state(page)).keys;
const activeTag = (page) => page.eval("document.activeElement ? document.activeElement.tagName : null");

export default async function (page) {
  const out = outDir("integrator");
  const r = {};
  await boot(page, "prelearn=0", { width: 1280, height: 720 });

  // Clicks keep the keys: HUD skill slot, a strip cell, the wave card, the canvas.
  const clicks = [];
  for (const selector of [".dh-skill", ".dh-cell", ".dh-wave-card", "#dh-canvas"]) {
    const before = await keysNow(page);
    const clicked = await clickAt(page, selector);
    // Leave placement mode if the strip cell opened it (a bare Esc would open the pause menu).
    if (!(await state(page)).placement.startsWith("idle")) await press(page, "Escape");
    await page.sleep(80);
    await press(page, "KeyQ");
    await page.sleep(80);
    clicks.push({ selector, clicked, active: await activeTag(page), keyArrived: (await keysNow(page)) === before + 1 });
  }
  r.clicks = clicks;

  // Into the wave.
  await press(page, "Enter");
  await waitFor(page, "s.phase === 'wave'", { timeoutMs: 15000 });
  await page.sleep(800);

  // Blur in a wave: veil up, sim still.
  await page.eval("window.dispatchEvent(new Event('blur'))");
  await page.sleep(200);
  const t1 = (await state(page)).tick;
  await page.sleep(1500);
  const t2 = (await state(page)).tick;
  await page.shot(join(out, "focus-veil-wave.png"));
  r.waveBlur = { veil: (await state(page)).veil, ticksWhileVeiled: t2 - t1 };
  // A key lifts it and starts 3-2-1; the key itself is used up.
  const kBefore = await keysNow(page);
  await press(page, "KeyA");
  await page.sleep(400);
  const during = await state(page);
  await page.shot(join(out, "focus-countdown.png"));
  const tc1 = during.tick;
  await page.sleep(1200);
  const tc2 = (await state(page)).tick;
  await waitFor(page, "!s.countdown", { timeoutMs: 6000 });
  await page.sleep(400);
  const tAfter = (await state(page)).tick;
  r.waveResume = { countdown: during.countdown, keyUsedUp: (await keysNow(page)) === kBefore, ticksDuringCountdown: tc2 - tc1, runningAfter: tAfter > tc2 };

  // Hidden tab for 10 s: the clock stands still.
  await page.eval("Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange'))");
  const h1 = (await state(page)).tick;
  await page.sleep(10000);
  const h2 = (await state(page)).tick;
  await page.eval("delete document.visibilityState; document.dispatchEvent(new Event('visibilitychange'))");
  await page.mouse(640, 360, "mousePressed");
  await page.mouse(640, 360, "mouseReleased");
  await waitFor(page, "!s.countdown && s.veil === 'none'", { timeoutMs: 6000 });
  r.hidden10s = { ticksWhileHidden: h2 - h1 };

  // Esc: release a lock first (if any), then the pause menu; sim still while it is open.
  await press(page, "Escape");
  await page.sleep(100);
  let s = await state(page);
  if (!s.menuOpen) {
    await press(page, "Escape");
    await page.sleep(100);
    s = await state(page);
  }
  const m1 = s.tick;
  await page.sleep(1000);
  const m2 = (await state(page)).tick;
  await page.shot(join(out, "focus-pause-menu.png"));
  await press(page, "Escape");
  await page.sleep(100);
  r.menu = { opened: s.menuOpen, ticksWhileOpen: m2 - m1, closed: !(await state(page)).menuOpen };

  // Break pause: no countdown, the first key goes through.
  await page.eval("window.__dh.setSpeed(6)");
  await page.eval(`(async () => { const d = window.__dh; for (let k = 0; k < 3000; k += 1) { const w = d.world(); if (w.phase !== 'wave' && w.phase !== 'warning') break; const live = d.words(); const lock = w.words.lock; const word = lock >= 0 ? live.find((x) => x.slot === lock) : live[0]; if (word) for (const ch of word.text.slice(word.typed)) d.send({ type: 'key', letter: ch.charCodeAt(0) - 97 }); await new Promise((r) => setTimeout(r, 40)); } })()`);
  await page.eval("window.__dh.setSpeed(1)");
  await waitFor(page, "s.phase === 'break'", { timeoutMs: 20000 });
  for (let k = 0; k < 4 && (await page.eval("window.__dh.panel()")) === "review"; k += 1) await press(page, "Escape");
  await page.eval("window.dispatchEvent(new Event('blur'))");
  await page.sleep(300);
  const b1 = (await state(page)).tick;
  await page.sleep(1000);
  const b2 = (await state(page)).tick;
  const kb = await keysNow(page);
  await press(page, "KeyB");
  await page.sleep(200);
  const afterBreakKey = await state(page);
  r.breakBlur = { ticksWhileVeiled: b2 - b1, countdown: afterBreakKey.countdown, keyWentThrough: afterBreakKey.keys === kb + 1, veil: afterBreakKey.veil };
  r.badResources = await badResources(page);
  return r;
}
