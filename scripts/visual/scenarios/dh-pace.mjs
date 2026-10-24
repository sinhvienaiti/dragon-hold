// dh-pace: the typing speed is asked, never assumed (app/typing-pace.ts, review 2).
// 1. A page without ?wpm shows the speed card and starts nothing; 35 is preselected.
// 2. Key 3 picks 25 WPM: the world is built at 25 (k < 1, longer word zone).
// 3. Pause menu → Tốc độ gõ shows the card with "đang dùng"; Esc goes back unchanged.
// 4. Pause menu → Tốc độ gõ → 35: the stage restarts at 35.
// 5. A stored measured profile (27 WPM, 93 %, CV 0.30) comes first and preselected; Enter builds the world with E, a and CV.
// 6. ?wpm=25 skips the card. Every world replays to its hash; 0 console errors.
// 7. A finished stage updates the measured profile (25 WPM wall times → E ≈ 25).
// Run at 1280×720 and 1920×1080. Owner: integrator (LANES.md).
import { join } from "node:path";
import { BASE, badResources, outDir, press } from "./lib/dh.mjs";

const OUT = outDir("pace");

const cardState = (page) =>
  page.eval(`(() => {
    const card = document.querySelector('.dh-pacecard');
    if (!card || card.hidden) return null;
    const rows = [...card.querySelectorAll('.dh-pacecard__row')];
    const box = card.getBoundingClientRect();
    return {
      rows: rows.map((row) => ({ wpm: Number(row.dataset.wpm), source: row.dataset.source, text: row.innerText.replace(/\\s+/g, ' ').trim(), on: row.classList.contains('is-on') })),
      inView: box.left >= 0 && box.top >= 0 && box.right <= innerWidth && box.bottom <= innerHeight,
      size: [Math.round(box.width), Math.round(box.height)],
    };
  })()`);

async function waitFor(page, expression, timeoutMs = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if ((await page.eval("(() => { try { return !!(" + expression + "); } catch { return false; } })()")) === true) return true;
    await page.sleep(150);
  }
  return false;
}

const pace = (page) => page.eval("window.__dh.state().pace");

/** In-page: types 12 words with a 25 WPM typist's wall times (key `ms`), stepping the world; then lets the stage run out. */
const MEASURE = `(async () => {
  const d = window.__dh; const { step } = await import('/src/sim/world.ts'); const w = d.world();
  const D = { known: 1000, learning: 850, due: 850, new: 700 };
  let typed = 0; let t = performance.now();
  for (let k = 0; k < 4000 && typed < 12 && w.phase !== 'defeat' && w.phase !== 'victory'; k += 1) {
    const live = d.words().filter((x) => x.target);
    const word = w.words.lock >= 0 ? live.find((x) => x.slot === w.words.lock) : live[0];
    if (word) {
      const lw = w.words.live[word.slot];
      const per = (12000 * 1000) / (25 * (D[lw ? lw.group : 'known'] ?? 1000));
      for (const ch of word.text.slice(word.typed)) { t += per; d.send({ type: 'key', letter: ch.charCodeAt(0) - 97, ms: Math.round(t) }); }
      t += 600;
      typed += 1;
    }
    for (let j = 0; j < 30; j += 1) step(w);
  }
  for (let k = 0; k < 60 * 60 * 30 && w.phase !== 'defeat' && w.phase !== 'victory'; k += 1) {
    if (w.phase === 'break' && w.phaseEndsAt > 0 && k % 60 === 0) d.send({ type: 'call-early' });
    step(w);
  }
  return { typed, phase: w.phase, wave: w.wave, words: w.stats.words };
})()`;

export default async function (page) {
  const W = page.width;
  const H = page.height;
  const shot = (name) => page.shot(join(OUT, name + "-" + W + "x" + H + ".png"));
  const out = { size: W + "x" + H, steps: {} };

  // 1. No ?wpm: the card, nothing running.
  await page.goto(BASE + "/?prelearn=0", { settle: 300 });
  out.steps.cardShown = await waitFor(page, "window.__dh && window.__dh.state().paceCard === true");
  await page.sleep(500);
  const first = await cardState(page);
  out.steps.first = { ready: await page.eval("window.__dh.ready"), rows: first?.rows.map((r) => r.wpm + (r.on ? "*" : "")).join(" "), inView: first?.inView, size: first?.size };
  await shot("01-card-first");

  // 2. Key 3 → 25 WPM.
  await press(page, "Digit3");
  out.steps.started = await waitFor(page, "window.__dh.ready === true");
  await page.sleep(400);
  out.steps.picked = await pace(page);

  // 3. Pause menu → Tốc độ gõ → Esc.
  await press(page, "Escape");
  await page.sleep(250);
  out.steps.menuLabel = await page.eval("document.querySelectorAll('.dh-pausemenu__item')[2]?.textContent ?? null");
  await press(page, "ArrowDown");
  await press(page, "ArrowDown");
  await press(page, "Enter");
  await page.sleep(300);
  const reopened = await cardState(page);
  out.steps.reopened = { rows: reopened?.rows.filter((r) => r.on || /đang dùng/.test(r.text)).map((r) => r.text) };
  await shot("02-card-from-menu");
  await press(page, "Escape");
  await page.sleep(250);
  out.steps.afterBack = { card: await page.eval("window.__dh.state().paceCard"), menu: await page.eval("window.__dh.state().menuOpen"), pace: await pace(page), paused: await page.eval("window.__dh.state().paused") };

  // 4. Pause menu → Tốc độ gõ → 35 (row 5): a restart at 35.
  await press(page, "Escape");
  await page.sleep(250);
  if (await page.eval("window.__dh.state().menuOpen")) {
    await press(page, "ArrowDown");
    await press(page, "ArrowDown");
    await press(page, "Enter");
  }
  await page.sleep(300);
  await press(page, "Digit5");
  await page.sleep(350);
  // The toast "Chơi lại ải với tốc độ …" shows 1.8 s: picture first.
  await shot("03-after-change");
  out.steps.changed = { toast: await page.eval("document.querySelector('.dh-toast.is-on')?.textContent ?? null"), pace: await pace(page), commands: await page.eval("window.__dh.state().commands"), replay: await page.eval("window.__dh.replayCheck()") };

  // 5. A measured profile in storage: offered first, preselected, built with a and CV.
  await page.eval(`localStorage.setItem('dragon-hold.skill', JSON.stringify({ version: 1, audience: 'adult', mode: 'balanced', measures: { e: { value: 27.3, n: 160 }, a: { value: 0.93, n: 800 }, cv: { value: 0.3, n: 160 } }, vocabLevel: 1, sessionWpm: 27.3, trend: { stages: 2, streak: 1, easyWins: 0, quits: 0, safety: { value: 0.6, n: 2 }, nearMisses: { value: 0, n: 2 } }, input: { ime: false, weakKeys: [] } }))`);
  await page.goto(BASE + "/?prelearn=0", { settle: 300 });
  await waitFor(page, "window.__dh && window.__dh.state().paceCard === true");
  await page.sleep(500);
  const measuredCard = await cardState(page);
  out.steps.measuredCard = { rows: measuredCard?.rows.slice(0, 2).map((r) => r.text + (r.on ? " *" : "")), inView: measuredCard?.inView };
  await shot("04-card-measured");
  await press(page, "Enter");
  await waitFor(page, "window.__dh.ready === true");
  await page.sleep(400);
  out.steps.measured = { pace: await pace(page), replay: await page.eval("window.__dh.replayCheck()") };

  // 6. ?wpm=25 skips the card.
  await page.eval("localStorage.removeItem('dragon-hold.skill')");
  await page.goto(BASE + "/?prelearn=0&wpm=25", { settle: 300 });
  await waitFor(page, "window.__dh && window.__dh.ready === true");
  await page.sleep(400);
  out.steps.url = { card: await page.eval("window.__dh.state().paceCard"), pace: await pace(page) };

  // 7. A finished stage is measured: 12 words with wall times of a 25 WPM typist (12000 / (25 d) ms a key),
  // then nobody types and the stage runs out; the profile now holds E ≈ 25 (world stepped in the page).
  await press(page, "Enter");
  await waitFor(page, "window.__dh.state().phase === 'wave'", 60000);
  out.steps.measure = await page.eval(MEASURE);
  await waitFor(page, "window.__dh.state().phase === 'defeat' || window.__dh.state().phase === 'victory'", 20000);
  await page.sleep(1500);
  out.steps.profile = await page.eval("(() => { const p = JSON.parse(localStorage.getItem('dragon-hold.skill') ?? 'null'); return p ? { e: Math.round(p.measures.e.value * 10) / 10, n: p.measures.e.n, a: Math.round(p.measures.a.value * 1000) / 1000, stages: p.trend.stages } : null; })()");
  out.badResources = await badResources(page);

  const ok =
    out.steps.cardShown === true &&
    out.steps.first.ready === false &&
    /35\*/.test(out.steps.first.rows ?? "") &&
    out.steps.first.inView === true &&
    out.steps.picked?.typistWpm === 25 &&
    out.steps.picked?.source === "pick" &&
    out.steps.picked?.kPm < 1000 &&
    out.steps.afterBack.card === false &&
    out.steps.afterBack.menu === false &&
    out.steps.afterBack.pace?.typistWpm === 25 &&
    out.steps.changed.pace?.typistWpm === 35 &&
    out.steps.changed.replay?.same === true &&
    out.steps.measured.pace?.source === "measured" &&
    out.steps.measured.pace?.typistWpm === 27 &&
    out.steps.measured.pace?.accuracyPm === 930 &&
    out.steps.measured.pace?.cvPm === 300 &&
    out.steps.measured.replay?.same === true &&
    out.steps.url.card === false &&
    out.steps.url.pace?.typistWpm === 25 &&
    out.steps.url.pace?.source === "url" &&
    out.steps.profile !== null &&
    out.steps.profile.n >= 8 &&
    Math.abs(out.steps.profile.e - 25) <= 3 &&
    out.badResources.length === 0 &&
    page.exceptions.length === 0;
  return { ok, ...out };
}
