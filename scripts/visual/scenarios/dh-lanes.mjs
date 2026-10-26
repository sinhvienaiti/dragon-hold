// dh-lanes (26/10 review): the wave card's "Quái sắp vào từ các đường sáng"
// must be true. Pictures of the same view in prep (lanes dark), 1 s and 4 s
// into wave 1's warning (Đường Cầu, Đường Suối lit; the sky lane quiet: wave 1
// has no flyer, "Đường Trời: Yên"), in wave 1, and 1 s into wave 2's warning
// (both dirt lanes lit, the sky lane's chevrons running). The card's text and
// its lane rows are read at each picture; the lit lanes themselves are WebGL,
// so the pictures are the evidence (look at them). `ok`: wave 1 started, the
// card says the warning line in both warnings, the sky row reads "Yên" in
// wave 1's warning and not in wave 2's, no page exception.
// SIZE=1920 runs at 1920×1080 (default 1280×720). Pictures: tmp/shots/integrator/.
// Owner: integrator (LANES.md).
import { join } from "node:path";
import { badResources, boot, outDir, press, state, waitFor } from "./lib/dh.mjs";

const [W, H] = process.env.SIZE === "1920" ? [1920, 1080] : [1280, 720];

/** The wave card as the player reads it: hint line and each lane row's text. */
const CARD = `(() => {
  const card = document.querySelector('.dh-wave-card');
  const text = (sel) => [...(card?.querySelectorAll(sel) ?? [])].map((e) => e.textContent.trim()).filter(Boolean);
  return { shown: !!card && getComputedStyle(card).display !== 'none' && !card.hidden, hint: text('.dh-wave-card__foot .dh-wave-card__hint'), lanes: text('.dh-lanes > .dh-lane') };
})()`;

/** Types every live word (the bot of this scenario), so wave 1 ends quickly. */
const CLEAR = `(() => {
  const d = window.__dh; const w = d.world();
  for (const word of d.words()) for (const ch of word.text.slice(word.typed)) d.send({ type: 'key', letter: ch.charCodeAt(0) - 97 });
  return { phase: w.phase, wave: w.wave };
})()`;

export default async function (page) {
  const out = outDir("integrator");
  const res = { size: `${W}x${H}`, pictures: [] };
  await boot(page, "prelearn=0", { width: W, height: H });
  const snap = async (name) => {
    const s = await state(page);
    const card = await page.eval(CARD);
    await page.shot(join(out, `lanes-${name}-${W}x${H}.png`));
    res.pictures.push({ name, phase: s.phase, wave: s.wave, card });
    return card;
  };
  await snap("prep");
  await press(page, "Enter");
  res.warning1 = await waitFor(page, "s.phase === 'warning'", { timeoutMs: 5000 });
  await page.sleep(1000);
  const w1 = await snap("warning1-1s");
  await page.sleep(3000);
  await snap("warning1-4s");
  res.started = await waitFor(page, "s.phase === 'wave'", { timeoutMs: 8000 });
  await page.sleep(1500);
  await snap("wave1");
  // Clear wave 1 at speed 3, then call wave 2 early from the break.
  await page.eval("window.__dh.setSpeed(3)");
  const t0 = Date.now();
  while (Date.now() - t0 < 120000) {
    const s = await page.eval(CLEAR);
    if (s.phase === "break" || s.wave >= 2 || s.phase === "victory" || s.phase === "defeat") break;
    if ((await page.eval("window.__dh.panel()")) === "review") await press(page, "Escape");
    await page.sleep(150);
  }
  await page.eval("window.__dh.setSpeed(1)");
  for (let k = 0; k < 10 && (await page.eval("window.__dh.panel()")) === "review"; k += 1) {
    await press(page, "Escape");
    await page.sleep(150);
  }
  if ((await state(page)).phase === "break") await page.eval("window.__dh.send({ type: 'call-early' })");
  res.warning2 = await waitFor(page, "s.phase === 'warning' && s.wave === 1", { timeoutMs: 10000 });
  await page.sleep(1000);
  const w2 = await snap("warning2-1s");
  const sky = (card) => card.lanes.find((line) => line.startsWith("Đường Trời")) ?? "";
  res.ok =
    res.started === true && res.warning1 === true && res.warning2 === true &&
    w1.hint.some((t) => t.includes("đường sáng")) && w2.hint.some((t) => t.includes("đường sáng")) &&
    sky(w1).includes("Yên") && !sky(w2).includes("Yên") &&
    page.exceptions.length === 0;
  res.badResources = await badResources(page);
  return res;
}
