// dh-pace: the typing speed is asked, never assumed (app/typing-pace.ts, review 2).
// 1. A page without ?wpm shows the speed card and starts nothing; 35 is preselected.
// 2. Key 3 picks 25 WPM: the world is built at 25 (k < 1, longer word zone).
// 3. Pause menu → Tốc độ gõ shows the card with "đang dùng"; Esc goes back unchanged.
// 4. Pause menu → Tốc độ gõ → 35: the stage restarts at 35, with the toast "Chơi lại ải với tốc độ 35 WPM".
// 5. A stored measured profile (27 WPM, 93 %, CV 0.30) comes first on key 0 and preselected; Enter builds the
//    world with E, a and CV. The presets keep keys 1–8: from the menu, key 5 is still 35 and key 0 the measured row.
// 6. ?wpm=25 skips the card. Every world replays to its hash; 0 console errors.
// 7. A finished stage updates the measured profile (25 WPM wall times → E ≈ 25).
// Toasts (review 2 minor 3): a MutationObserver records every toast as it turns
// on (a poll after the screenshot missed the 1.8 s toast), then its box is
// measured against the carry strip (head, key hint), the HUD and learning
// panels, the wave card, word tags, lanes and build slots (ui/screen-zones.ts).
// Two toasts: after the speed change (prep, full strip) and Alt + 7 on an
// empty consumable slot in a wave (folded strip).
// Run at 1280×720 and 1920×1080. Owner: integrator (LANES.md).
import { join } from "node:path";
import { BASE, MOD, badResources, outDir, press } from "./lib/dh.mjs";

const OUT = outDir("pace");

const cardState = (page) =>
  page.eval(`(() => {
    const card = document.querySelector('.dh-pacecard');
    if (!card || card.hidden) return null;
    const rows = [...card.querySelectorAll('.dh-pacecard__row')];
    const box = card.getBoundingClientRect();
    return {
      rows: rows.map((row) => ({ key: row.querySelector('.dh-key')?.textContent ?? '', wpm: Number(row.dataset.wpm), source: row.dataset.source, text: row.innerText.replace(/\\s+/g, ' ').trim(), on: row.classList.contains('is-on') })),
      keys: card.querySelector('.dh-pacecard__keys')?.textContent ?? '',
      inView: box.left >= 0 && box.top >= 0 && box.right <= innerWidth && box.bottom <= innerHeight,
      size: [Math.round(box.width), Math.round(box.height)],
    };
  })()`);

/** Records every toast text the moment it turns on (window.__toasts). */
const TOAST_WATCH = `(() => {
  window.__toasts = [];
  if (window.__toastWatch) window.__toastWatch.disconnect();
  const seen = new Set();
  window.__toastWatch = new MutationObserver((list) => {
    for (const m of list) {
      const t = m.target;
      if (!(t instanceof HTMLElement) || !t.classList.contains('dh-toast') || !t.classList.contains('is-on')) continue;
      const text = (t.textContent ?? '').trim();
      if (seen.has(text)) continue;
      seen.add(text);
      window.__toasts.push(text);
    }
  });
  window.__toastWatch.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] });
  return true;
})()`;

/** The shown toast's box and what it covers (px², lane px); call once its 0.18 s slide-in is over. */
const TOAST_PLACE = `(async () => {
  await new Promise((done) => requestAnimationFrame(done));
  const t = document.querySelector('.dh-toast.is-on');
  if (!t) return null;
  const rect = (n) => { const r = n.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; };
  const area = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const box = rect(t);
  const overlay = t.closest('.dh-hud').parentElement;
  const shown = (n) => n.closest('[hidden]') === null && n.getBoundingClientRect().width > 0;
  const name = (n) => n.dataset.ui || String(n.className).split(' ').filter((c) => c.startsWith('dh-') || c.startsWith('kit-')).slice(0, 2).join(' ');
  const covered = [...overlay.querySelectorAll('[data-keepout], [data-dh-avoid], .kit-learning-frame, .dh-place-help, .dh-wave-card, .dh-strip__head, .dh-strip__info, .dh-tag')]
    .filter((n) => n !== t && !n.contains(t) && shown(n))
    .map((n) => ({ what: name(n), px2: Math.round(area(box, rect(n))) }))
    .filter((c) => c.px2 > 0);
  const strip = overlay.querySelector('[data-ui="shop-strip"]');
  const zones = await import('/src/ui/screen-zones.ts');
  const cost = zones.spotCost(box, zones.zonesFor(overlay), [], { w: innerWidth, h: innerHeight });
  return {
    text: t.textContent,
    box: { x: Math.round(box.x), y: Math.round(box.y), w: Math.round(box.w), h: Math.round(box.h) },
    inView: box.x >= 0 && box.y >= 0 && box.x + box.w <= innerWidth && box.y + box.h <= innerHeight,
    gapToStripPx: strip && shown(strip) ? Math.round(strip.getBoundingClientRect().top - (box.y + box.h)) : null,
    stripFolded: strip ? strip.classList.contains('is-compact') : null,
    covered,
    lanesPx: Math.round(cost.lanes),
    slotsPx2: Math.round(cost.slots),
  };
})()`;

/** Presses `code`, waits for a toast and its slide-in (0.18 s), takes the picture, then measures it while it shows (1.8 s). */
async function toastAfter(page, code, mods, shotName, shot) {
  await page.eval(TOAST_WATCH);
  await press(page, code, mods);
  const seen = await waitFor(page, "window.__toasts.length > 0", 3000);
  await page.sleep(250);
  await shot(shotName);
  const place = seen ? await page.eval(TOAST_PLACE) : null;
  return { seen: await page.eval("window.__toasts"), place };
}

/** The toast stands clear: shown, in view, above the strip, over no panel, strip head or hint, tag, lane or slot. */
const toastClear = (t) =>
  t.place !== null && t.place.inView === true && t.place.gapToStripPx !== null && t.place.gapToStripPx >= 0 &&
  t.place.covered.length === 0 && t.place.lanesPx === 0 && t.place.slotsPx2 === 0;

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
  out.steps.first = { ready: await page.eval("window.__dh.ready"), rows: first?.rows.map((r) => r.wpm + (r.on ? "*" : "")).join(" "), keys: first?.rows.map((r) => r.key).join(""), hint: first?.keys, inView: first?.inView, size: first?.size };
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
  // The toast "Chơi lại ải với tốc độ …" shows 1.8 s: recorded as it turns on, measured, then the picture.
  const changeToast = await toastAfter(page, "Digit5", 0, "03-after-change", shot);
  out.steps.changed = { toast: changeToast, pace: await pace(page), commands: await page.eval("window.__dh.state().commands"), replay: await page.eval("window.__dh.replayCheck()") };

  // 5. A measured profile in storage: offered first, preselected, built with a and CV.
  await page.eval(`localStorage.setItem('dragon-hold.skill', JSON.stringify({ version: 1, audience: 'adult', mode: 'balanced', measures: { e: { value: 27.3, n: 160 }, a: { value: 0.93, n: 800 }, cv: { value: 0.3, n: 160 } }, vocabLevel: 1, sessionWpm: 27.3, trend: { stages: 2, streak: 1, easyWins: 0, quits: 0, safety: { value: 0.6, n: 2 }, nearMisses: { value: 0, n: 2 } }, input: { ime: false, weakKeys: [] } }))`);
  await page.goto(BASE + "/?prelearn=0", { settle: 300 });
  await waitFor(page, "window.__dh && window.__dh.state().paceCard === true");
  await page.sleep(500);
  const measuredCard = await cardState(page);
  out.steps.measuredCard = {
    rows: measuredCard?.rows.slice(0, 2).map((r) => r.text + (r.on ? " *" : "")),
    keys: measuredCard?.rows.map((r) => r.key + ":" + r.wpm + (r.source === "measured" ? "m" : "")).join(" "),
    hint: measuredCard?.keys,
    inView: measuredCard?.inView,
  };
  await shot("04-card-measured");
  await press(page, "Enter");
  await waitFor(page, "window.__dh.ready === true");
  await page.sleep(400);
  out.steps.measured = { pace: await pace(page), replay: await page.eval("window.__dh.replayCheck()") };

  // 5b. Stable keys with a measured row on the card: key 5 is 35 WPM, key 0 the measured speed.
  const fromMenu = async (code) => {
    await press(page, "Escape");
    await page.sleep(250);
    if (await page.eval("window.__dh.state().menuOpen")) {
      await press(page, "ArrowDown");
      await press(page, "ArrowDown");
      await press(page, "Enter");
    }
    await page.sleep(300);
    await press(page, code);
    await page.sleep(400);
    return { pace: await pace(page), replay: (await page.eval("window.__dh.replayCheck()"))?.same };
  };
  out.steps.key5 = await fromMenu("Digit5");
  out.steps.key0 = await fromMenu("Digit0");

  // 6. ?wpm=25 skips the card.
  await page.eval("localStorage.removeItem('dragon-hold.skill')");
  await page.goto(BASE + "/?prelearn=0&wpm=25", { settle: 300 });
  await waitFor(page, "window.__dh && window.__dh.ready === true");
  await page.sleep(400);
  out.steps.url = { card: await page.eval("window.__dh.state().paceCard"), pace: await pace(page) };
  // 6b. With ?wpm=25, the menu's card preselects 25 ("đang dùng") and Enter goes back to the game, no replay (test pass 27/10).
  const tickBefore = await page.eval("window.__dh.state().tick");
  await press(page, "Escape");
  await page.sleep(250);
  if (await page.eval("window.__dh.state().menuOpen")) {
    await press(page, "ArrowDown");
    await press(page, "ArrowDown");
    await press(page, "Enter");
  }
  await page.sleep(300);
  const urlCard = await cardState(page);
  await press(page, "Enter");
  await page.sleep(400);
  out.steps.urlKeep = { selected: urlCard?.rows.find((r) => r.on)?.text ?? null, pace: await pace(page), tickBefore, tickAfter: await page.eval("window.__dh.state().tick"), card: await page.eval("window.__dh.state().paceCard") };

  // 7. A finished stage is measured: 12 words with wall times of a 25 WPM typist (12000 / (25 d) ms a key),
  // then nobody types and the stage runs out; the profile now holds E ≈ 25 (world stepped in the page).
  await press(page, "Enter");
  await waitFor(page, "window.__dh.state().phase === 'wave'", 60000);
  // A toast in a wave (the strip folded): Alt + 7 on an empty consumable slot.
  out.steps.waveToast = await toastAfter(page, "Digit7", MOD.alt, "05-toast-wave", shot);
  out.steps.measure = await page.eval(MEASURE);
  await waitFor(page, "window.__dh.state().phase === 'defeat' || window.__dh.state().phase === 'victory'", 20000);
  await page.sleep(1500);
  out.steps.profile = await page.eval("(() => { const p = JSON.parse(localStorage.getItem('dragon-hold.skill') ?? 'null'); return p ? { e: Math.round(p.measures.e.value * 10) / 10, n: p.measures.e.n, a: Math.round(p.measures.a.value * 1000) / 1000, stages: p.trend.stages } : null; })()");
  out.badResources = await badResources(page);

  const ok =
    out.steps.cardShown === true &&
    out.steps.first.ready === false &&
    /35\*/.test(out.steps.first.rows ?? "") &&
    out.steps.first.keys === "12345678" &&
    out.steps.first.inView === true &&
    out.steps.picked?.typistWpm === 25 &&
    out.steps.picked?.source === "pick" &&
    out.steps.picked?.kPm < 1000 &&
    out.steps.afterBack.card === false &&
    out.steps.afterBack.menu === false &&
    out.steps.afterBack.pace?.typistWpm === 25 &&
    out.steps.changed.pace?.typistWpm === 35 &&
    out.steps.changed.replay?.same === true &&
    out.steps.changed.toast.seen.some((text) => /Chơi lại ải với tốc độ 35 WPM/.test(text)) &&
    toastClear(out.steps.changed.toast) &&
    out.steps.measured.pace?.source === "measured" &&
    out.steps.measured.pace?.typistWpm === 27 &&
    out.steps.measured.pace?.accuracyPm === 930 &&
    out.steps.measured.pace?.cvPm === 300 &&
    out.steps.measured.replay?.same === true &&
    /^0:27m 1:15 2:20 3:25 4:30 5:35 6:45 7:60 8:75$/.test(out.steps.measuredCard.keys ?? "") &&
    out.steps.key5.pace?.typistWpm === 35 &&
    out.steps.key5.pace?.source === "pick" &&
    out.steps.key5.replay === true &&
    out.steps.key0.pace?.source === "measured" &&
    out.steps.key0.pace?.typistWpm === 27 &&
    out.steps.key0.replay === true &&
    out.steps.waveToast.seen.some((text) => /Ô đồ tiêu hao trống/.test(text)) &&
    out.steps.waveToast.place?.stripFolded === true &&
    toastClear(out.steps.waveToast) &&
    out.steps.url.card === false &&
    out.steps.url.pace?.typistWpm === 25 &&
    out.steps.url.pace?.source === "url" &&
    /25 WPM/.test(out.steps.urlKeep.selected ?? "") &&
    out.steps.urlKeep.pace?.source === "url" &&
    out.steps.urlKeep.card === false &&
    out.steps.urlKeep.tickAfter >= out.steps.urlKeep.tickBefore &&
    out.steps.profile !== null &&
    out.steps.profile.n >= 8 &&
    Math.abs(out.steps.profile.e - 25) <= 3 &&
    out.badResources.length === 0 &&
    page.exceptions.length === 0;
  return { ok, ...out };
}
