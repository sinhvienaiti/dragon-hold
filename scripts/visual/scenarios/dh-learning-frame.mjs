// dh-learning-frame (05 §10, 01 §6): the frame shows the locked word, IPA and
// meaning; nothing covers it (word tags, panels, damage numbers in a T4–T5
// storm); a new word stays pinned ≥ 2.5 s after it is typed; IPA lines use a
// font with the IPA glyphs (20 samples drawn in the frame's IPA style); Thẻ Ôn
// after the wave answered by keyboard. 1280×720 and 1920×1080.
// Owner: integrator (LANES.md).
import { join } from "node:path";
import { badResources, boot, outDir, press, state, typeWord, waitFor } from "./lib/dh.mjs";

const IPA = ["/ˈwʊmən/", "/pleɪs/", "/ˈsɪti/", "/fud/", "/ˈmʌni/", "/ˈhɪstɚi/", "/θɪŋk/", "/ʃʊd/", "/ˈmeʒɚ/", "/ðɛr/", "/kɑɹ/", "/ˈɔːtəm/", "/ˈɡɑːdn/", "/rɪˈvjuː/", "/ˈbɜːrd/", "/ɪˈnʌf/", "/ˈæŋɡl/", "/ˈjeloʊ/", "/tʃɜːrtʃ/", "/ˈdʒʌŋɡl/"];

const FRAME = `(() => {
  const f = document.querySelector('.kit-learning-frame');
  if (!f) return null;
  const r = f.getBoundingClientRect();
  const q = (c) => f.querySelector('.' + c)?.textContent?.trim() ?? '';
  const tags = [...document.querySelectorAll('.dh-tag')].filter((t) => !t.classList.contains('is-done') && !t.classList.contains('is-fold') && t.getBoundingClientRect().width > 0);
  const hit = (a, b) => a.left < b.right - 1 && a.right - 1 > b.left && a.top < b.bottom - 1 && a.bottom - 1 > b.top;
  const covering = tags.filter((t) => hit(t.getBoundingClientRect(), r)).map((t) => t.dataset.word);
  const ipaEl = f.querySelector('.kit-learning-frame__ipa, [class*="ipa"]');
  return { text: f.innerText.replace(/\\s+/g, ' ').trim().slice(0, 160), rect: { x: r.left, y: r.top, w: r.width, h: r.height }, covering, ipaFont: ipaEl ? getComputedStyle(ipaEl).fontFamily : null };
})()`;

async function run(page, width, height, out) {
  await boot(page, "prelearn=0", { width, height });
  await press(page, "Enter");
  await waitFor(page, "s.phase === 'wave'", { timeoutMs: 15000 });
  await waitFor(page, "window.__dh.words().length >= 2", { timeoutMs: 20000 });
  const samples = [];
  // Lock a word with its first letter: the frame shows it.
  const words = await page.eval("window.__dh.words()");
  const target = words.find((w) => w.visible) ?? words[0];
  await press(page, "Key" + target.text[0].toUpperCase());
  await page.sleep(250);
  const locked = await page.eval(FRAME);
  await page.shot(join(out, `frame-locked-${width}x${height}.png`));
  // Storm while the frame shows: numbers must keep off it.
  await page.eval("window.__storm = setInterval(() => window.__dh.fxStorm(10), 100)");
  let overlaps = 0;
  for (let k = 0; k < 10; k += 1) {
    await page.sleep(150);
    overlaps = Math.max(overlaps, await page.eval("window.__dh.numbersOverlaps()"));
    samples.push(await page.eval(FRAME));
  }
  await page.shot(join(out, `frame-storm-${width}x${height}.png`));
  await page.eval("clearInterval(window.__storm)");
  // Finish it; if it was a new word, the frame keeps it ≥ 2.5 s.
  const deckNew = await page.eval(`(() => { const w = window.__dh.world(); const live = w.words.live[w.words.lock]; return live ? w.words.deck.words[live.index]?.group === 'new' : null; })()`);
  await typeWord(page, target.text.slice(1), 60);
  const doneAt = Date.now();
  const pinned = [];
  for (let k = 0; k < 14; k += 1) {
    const f = await page.eval(FRAME);
    pinned.push({ ms: Date.now() - doneAt, has: f?.text.includes(target.text) ?? false });
    await page.sleep(200);
  }
  const keptMs = Math.max(0, ...pinned.filter((p) => p.has).map((p) => p.ms));
  // IPA: 20 samples in the frame's IPA style; the font must have the glyphs.
  const ipa = await page.eval(`(async () => {
    const box = document.createElement('div');
    box.dataset.ipaSamples = '1';
    box.style.cssText = 'position:fixed;left:24px;top:120px;z-index:99;display:grid;grid-template-columns:repeat(4,auto);gap:6px 18px;padding:12px 16px;border-radius:10px;background:rgba(28,22,17,.94);color:#efe6d2';
    box.innerHTML = ${JSON.stringify(IPA)}.map((t) => '<span class="kit-learning-frame__ipa" style="font-family:var(--kit-font-ipa);font-size:20px">' + t + '</span>').join('');
    document.body.append(box);
    await document.fonts.ready;
    const loaded = document.fonts.check('20px "Noto Sans"', 'ɪʊəʌθʃʒŋɡˈː');
    return { loaded, family: getComputedStyle(box.firstChild).fontFamily };
  })()`);
  await page.sleep(300);
  await page.shot(join(out, `frame-ipa-${width}x${height}.png`));
  await page.eval("document.querySelectorAll('[data-ipa-samples]').forEach((n) => n.remove())");
  return {
    size: width + "x" + height,
    locked,
    tagsOverFrame: samples.reduce((n, s) => n + (s?.covering.length ?? 0), 0),
    numbersOverFrame: overlaps,
    newWord: deckNew,
    keptMs,
    ipa,
  };
}

export default async function (page) {
  const out = outDir("integrator");
  const runs = [];
  for (const [w, h] of [[1280, 720], [1920, 1080]]) runs.push(await run(page, w, h, out));
  // Thẻ Ôn by keyboard after wave 1 (word bot finishes the wave fast).
  await page.eval("window.__dh.setSpeed(6)");
  await page.eval(`(async () => { const d = window.__dh; for (let k = 0; k < 3000; k += 1) { const w = d.world(); if (w.phase !== 'wave' && w.phase !== 'warning') break; const live = d.words(); const lock = w.words.lock; const word = lock >= 0 ? live.find((x) => x.slot === lock) : live[0]; if (word) for (const ch of word.text.slice(word.typed)) d.send({ type: 'key', letter: ch.charCodeAt(0) - 97 }); await new Promise((r) => setTimeout(r, 40)); } })()`);
  await page.eval("window.__dh.setSpeed(1)");
  await waitFor(page, "s.phase === 'break'", { timeoutMs: 20000 });
  await page.sleep(300);
  const review = { opened: (await page.eval("window.__dh.panel()")) === "review", answers: await page.eval("window.__dh.review()") };
  const out2 = outDir("integrator");
  if (review.opened) {
    const t1 = (await state(page)).tick;
    await page.shot(join(out2, "frame-review-1920x1080.png"));
    await page.sleep(1000);
    review.clockStill = (await state(page)).tick === t1;
    const goldBefore = (await state(page)).gold;
    for (const answer of review.answers) {
      await typeWord(page, answer, 40);
      await page.sleep(1100);
    }
    await page.sleep(600);
    review.goldGained = (await state(page)).gold - goldBefore;
    review.closed = (await page.eval("window.__dh.panel()")) !== "review";
  }
  return { runs, review, badResources: await badResources(page) };
}
