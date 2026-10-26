// dh-words (05 §10): start the M0 stage, type the live words with real key
// presses, foes die; every live word with a foe on screen has its tag with the
// same text, tags never overlap, the smallest tag font is ≥ 16 px and the
// meaning line under it ≥ 13 px (05 §4).
// Two sizes (1280×720, 1920×1080) × tag size 100 % and 150 %, world at ?speed=2,
// the typist waits for ≥ 4 live words unless a foe is near (tags pile up).
// WPM=70 plays at k 1.50 (lib/dh.mjs boot); each run reports its kPm.
// Pictures in tmp/shots/integrator/.
// `ok` (26/10 review: with the network voice CDP stalled and runs typed 1–4
// words, which read as a pass): every run started wave 1 and typed ≥ 20
// words, and no check saw overlapping tags, a missing or extra tag, a word
// under 16 px or a meaning line under 13 px.
// Owner: integrator (LANES.md).
import { join } from "node:path";
import { badResources, boot, MOD, outDir, pickWord, press, startWave, state, typeWord } from "./lib/dh.mjs";

/** Words a 60 s run must type for its checks to count (a stalled run typed 1–4). */
const TYPED_MIN = 20;

const TAG_CHECK = `(() => {
  const d = window.__dh; const words = d.words();
  const tags = [...document.querySelectorAll('.dh-tag')].filter((t) => !t.classList.contains('is-done') && !t.classList.contains('is-fold') && t.style.display !== 'none' && !t.hidden && t.getBoundingClientRect().width > 0 && getComputedStyle(t).visibility !== 'hidden' && Number(getComputedStyle(t).opacity) > 0.5);
  const shown = tags.map((t) => t.dataset.word);
  const rects = tags.map((t) => { const b = t.querySelector('.dh-tag__body') ?? t; const r = b.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, word: t.dataset.word }; });
  let overlaps = 0; const pairs = [];
  for (let i = 0; i < rects.length; i += 1) for (let j = i + 1; j < rects.length; j += 1) {
    const a = rects[i], b = rects[j];
    if (a.x < b.x + b.w - 1 && a.x + a.w - 1 > b.x && a.y < b.y + b.h - 1 && a.y + a.h - 1 > b.y) { overlaps += 1; pairs.push(a.word + '/' + b.word); }
  }
  const fonts = tags.map((t) => parseFloat(getComputedStyle(t.querySelector('.dh-tag__word') ?? t).fontSize));
  const means = tags.map((t) => t.querySelector('.dh-tag__mean')).filter((m) => m && m.textContent).map((m) => parseFloat(getComputedStyle(m).fontSize));
  const onScreen = words.filter((w) => w.visible);
  const missing = onScreen.filter((w) => !shown.includes(w.text)).map((w) => w.text);
  const extra = shown.filter((text) => !words.some((w) => w.text === text));
  return { live: words.length, onScreen: onScreen.length, tags: tags.length, missing, extra, overlaps, pairs: pairs.slice(0, 5), minFont: fonts.length ? Math.min(...fonts) : null, minMean: means.length ? Math.min(...means) : null };
})()`;

async function play(page, size, out, tagSize) {
  const [width, height] = size;
  await boot(page, "prelearn=0&speed=" + (process.env.SPEED ?? "2") + "&tagsize=" + tagSize, { width, height });
  const started = await startWave(page);
  const checks = [];
  let typed = 0;
  let shot = 0;
  const startKills = (await state(page)).kills;
  const t0 = Date.now();
  while (Date.now() - t0 < Number(process.env.SECONDS ?? 60) * 1000) {
    const s = await state(page);
    if (s.phase === "victory" || s.phase === "defeat") break;
    // Breaks are not under test: close Thẻ Ôn, call the next wave early.
    if (s.panel === "review") {
      await press(page, "Escape");
      continue;
    }
    if (s.phase === "break") {
      await press(page, "Enter", MOD.shift);
      await page.sleep(200);
      continue;
    }
    const check = await page.eval(TAG_CHECK);
    checks.push(check);
    if (check.tags > shot) {
      // Keep the busiest moment.
      await page.shot(join(out, `words-busy-${width}x${height}-tags${tagSize}.png`));
      shot = check.tags;
    }
    const word = await pickWord(page);
    // Let tags pile up (≥ 4 live) unless a foe is close: the layout is what is under test.
    const near = await page.eval("window.__dh.foes().some((f) => Math.hypot(f.x, f.z) < 14)");
    if (!word || (check.live < 4 && !near)) {
      await page.sleep(150);
      continue;
    }
    // Not every word right away: tags pile up a little, as with a real player.
    await typeWord(page, word.text.slice(word.typed), 45);
    typed += 1;
    await page.sleep(350);
  }
  const end = await state(page);
  await page.shot(join(out, `words-end-${width}x${height}-tags${tagSize}.png`));
  const worst = checks.reduce((acc, c) => ({ overlaps: Math.max(acc.overlaps, c.overlaps), missing: acc.missing + c.missing.length, extra: acc.extra + c.extra.length, minFont: Math.min(acc.minFont, c.minFont ?? 99), minMean: Math.min(acc.minMean, c.minMean ?? 99), maxTags: Math.max(acc.maxTags, c.tags) }), { overlaps: 0, missing: 0, extra: 0, minFont: 99, minMean: 99, maxTags: 0 });
  const lastMissing = checks.filter((c) => c.missing.length > 0).slice(-3);
  const okWhy = [];
  if (!started) okWhy.push("wave 1 never started");
  if (typed < TYPED_MIN) okWhy.push("typed " + typed + " < " + TYPED_MIN);
  if (worst.overlaps > 0) okWhy.push("overlaps " + worst.overlaps);
  if (worst.missing > 0) okWhy.push("missing " + worst.missing);
  if (worst.extra > 0) okWhy.push("extra " + worst.extra);
  if (worst.minFont < 16) okWhy.push("word font " + worst.minFont + " px");
  if (worst.minMean < 13) okWhy.push("meaning font " + worst.minMean + " px");
  return { ok: okWhy.length === 0, okWhy, size: width + "x" + height, tagSize, kPm: end.pace?.kPm ?? null, reachedWave: end.wave, started, typed, kills: end.kills - startKills, words: end.words, grades: end.grades, keys: end.keys, routerLetters: end.routerLetters, checks: checks.length, worst, lastMissing, perf: await page.eval("window.__dh.perf()"), replay: await page.eval("window.__dh.replayCheck()") };
}

export default async function (page) {
  const out = outDir("integrator");
  const runs = [];
  for (const size of [[1280, 720], [1920, 1080]]) for (const tagSize of [100, 150]) runs.push(await play(page, size, out, tagSize));
  const bad = await badResources(page);
  return { ok: runs.every((run) => run.ok) && bad.length === 0 && page.exceptions.length === 0, runs, badResources: bad, spoke: await page.eval("window.__dhSpoke ?? null") };
}
