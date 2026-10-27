// dh-keyboard-only (05 §10, 00 §6): the whole M0 stage with real key presses
// only, no mouse: Học trước, buying and placing with 1…8 + arrows + Enter,
// edit mode (` = -), Shift + Enter, Alt + 1/2/5/7, Tab, Alt + 0, arrows,
// typing every word, Thẻ Ôn, results. The dev flag ?speed=N (default 4)
// runs world time N× faster; rules and hashes do not change. The command log
// replays to the same hash at the end. Mac layout by default; LAYOUT=linux
// uses Shift + digit for the Alt + digit keys (00 §6).
// Owner: integrator (LANES.md).
import { join } from "node:path";
import { badResources, boot, MOD, outDir, pickWord, press, state, typeWord } from "./lib/dh.mjs";

const SPEED = Number(process.env.SPEED ?? "4");
const LIMIT_S = Number(process.env.LIMIT_S ?? "420");
const ALT = process.env.LAYOUT === "linux" ? MOD.shift : MOD.alt;

const panelWord = (page) => page.eval("document.querySelector('.dh-lpanel:not([hidden]) .dh-lpanel__word')?.textContent ?? ''");

async function placeByKeys(page, digit, moves = 0) {
  await press(page, "Digit" + digit);
  await page.sleep(120);
  for (let k = 0; k < moves; k += 1) {
    await press(page, "ArrowRight");
    await page.sleep(60);
  }
  await press(page, "Enter");
  await page.sleep(200);
  const s = await state(page);
  if (!s.placement.startsWith("idle")) {
    await press(page, "Escape");
    await page.sleep(80);
  }
}

export default async function (page) {
  const out = outDir("integrator");
  const log = [];
  const shots = [];
  const shot = async (name) => shots.push(await page.shot(join(out, "kb-" + name + ".png")));
  await boot(page, "speed=" + SPEED);

  // Học trước: type each new word shown.
  let prelearned = 0;
  for (let k = 0; k < 12; k += 1) {
    if ((await page.eval("window.__dh.panel()")) !== "prelearn") break;
    const word = await panelWord(page);
    if (k === 0) await shot("01-prelearn");
    if (word) {
      await typeWord(page, word, 30);
      prelearned += 1;
    }
    await page.sleep(900);
  }
  const afterPrelearn = await state(page);
  log.push("prelearn " + prelearned + " words, gold " + afterPrelearn.gold);

  // Setup: spikes on the bridge lane, a moss warden, then edit mode round trip.
  await press(page, "Digit1");
  await page.sleep(250);
  await shot("02-placing");
  await press(page, "Enter");
  await page.sleep(200);
  await placeByKeys(page, 4);
  await press(page, "Backquote");
  await page.sleep(150);
  await press(page, "ArrowRight");
  await page.sleep(100);
  await shot("03-edit");
  await press(page, "Escape");
  await page.sleep(100);
  // Camera keys: turn, tilt, zoom, back home.
  for (const [code, mods] of [["ArrowLeft", 0], ["ArrowLeft", 0], ["ArrowUp", 0], ["ArrowUp", ALT === MOD.alt ? MOD.alt : 0], ["Digit0", ALT]]) {
    await press(page, code, mods);
    await page.sleep(120);
  }
  await page.sleep(500);
  const prep = await state(page);
  log.push("prep slots " + prep.slots.join(",") + " gold " + prep.gold);
  await press(page, "Enter"); // start

  const t0 = Date.now();
  let lastSkill = 0;
  let lastSky = 0;
  let wavesSeen = new Set();
  let breaks = 0;
  let reviews = 0;
  let typedWords = 0;
  let tabs = 0;
  let lastWave = 0;
  while (Date.now() - t0 < LIMIT_S * 1000) {
    const s = await state(page);
    if (s.phase === "victory" || s.phase === "defeat") break;
    if (s.wave !== lastWave) {
      lastWave = s.wave;
      if ([1, 5, 10].includes(s.wave)) await shot("04-wave-" + s.wave);
    }
    if (s.panel === "review") {
      const answers = await page.eval("window.__dh.review()");
      if (reviews === 0) await shot("05-review");
      for (const answer of answers) {
        if ((await page.eval("window.__dh.panel()")) !== "review") break;
        await typeWord(page, answer, 25);
        await page.sleep(1000);
      }
      reviews += 1;
      await page.sleep(300);
      continue;
    }
    if (s.panel === "prelearn") {
      await press(page, "Escape");
      continue;
    }
    if (s.phase === "break") {
      if (!wavesSeen.has("b" + s.wave)) {
        wavesSeen.add("b" + s.wave);
        breaks += 1;
        // Shop by keys: a bomb, a net, a hut, a potion, armour; an upgrade in edit mode.
        const plan = [[2, 90], [3, 80], [5, 120], [4, 70], [1, 50]];
        for (const [digit, cost] of plan) {
          const now = await state(page);
          if (now.gold >= cost + 20) await placeByKeys(page, digit);
        }
        // A buy by key takes the same key twice (the first press only picks it).
        let now = await state(page);
        if (now.gold >= 60) { await press(page, "Digit6"); await page.sleep(100); await press(page, "Digit6"); await page.sleep(150); }
        now = await state(page);
        if (now.gold >= 90 && s.wave % 3 === 0) { await press(page, "Digit8"); await page.sleep(100); await press(page, "Digit8"); await page.sleep(150); }
        now = await state(page);
        if (now.gold >= 100) {
          await press(page, "Backquote");
          await page.sleep(120);
          await press(page, "Equal");
          await page.sleep(80);
          await press(page, "Equal");
          await page.sleep(150);
          await press(page, "Escape");
          await page.sleep(80);
        }
        if (s.wave === 2) await shot("06-break-shop");
        now = await state(page);
        log.push("break " + s.wave + " gold " + now.gold + " slots " + now.slots.length + " held " + JSON.stringify(now.held));
        await press(page, "Enter", MOD.shift); // call early
        await page.sleep(200);
      } else await page.sleep(150);
      continue;
    }
    if (s.phase === "wave") {
      const nowMs = Date.now();
      if (nowMs - lastSkill > 7000) {
        await press(page, "Digit1", ALT);
        lastSkill = nowMs;
      }
      if (nowMs - lastSky > 9000) {
        await press(page, "Digit2", ALT);
        lastSky = nowMs;
      }
      if (s.rage >= 1000) await press(page, "Digit5", ALT);
      if (s.heroHp < s.heroHpMax * 0.5) await press(page, "Digit7", ALT);
    }
    const word = await pickWord(page);
    if (!word) {
      await page.sleep(80);
      continue;
    }
    await typeWord(page, word.text.slice(word.typed), 12);
    typedWords += 1;
    if (typedWords % 25 === 0) {
      await press(page, "Tab");
      tabs += 1;
    }
  }
  // A won stage holds 2.6 s before its panel (ui/results.ts VICTORY_HOLD_MS); a lost one shows it at once.
  for (let k = 0; k < 30 && !(await page.eval("(() => { const r = document.querySelector('.dh-results'); return !!r && !r.hidden; })()")); k += 1) await page.sleep(200);
  await page.sleep(300);
  const end = await state(page);
  await shot("07-results");
  // Results by keys: ↓ to a word, Tab to hear it.
  await press(page, "ArrowDown");
  await press(page, "Tab");
  const replay = await page.eval("window.__dh.replayCheck()");
  // The finished stage went into the measured profile (app/typing-pace.ts): the next visit's speed card offers it first.
  const measured = await page.eval("(() => { try { const p = JSON.parse(localStorage.getItem('dragon-hold.skill') ?? 'null'); return p ? { e: Math.round(p.measures.e.value * 10) / 10, words: p.measures.e.n, a: Math.round(p.measures.a.value * 1000) / 1000, cv: Math.round(p.measures.cv.value * 1000) / 1000, stages: p.trend.stages } : null; } catch { return 'unreadable'; } })()");
  return {
    speed: SPEED,
    measured,
    layout: process.env.LAYOUT ?? "mac",
    seconds: Math.round((Date.now() - t0) / 1000),
    end: { phase: end.phase, wave: end.wave, heroHp: end.heroHp, heroHpMax: end.heroHpMax, gold: end.gold, kills: end.kills, words: end.words, grades: end.grades, keys: end.keys, routerLetters: end.routerLetters, slots: end.slots, held: end.held, heroBuys: end.heroBuys, commands: end.commands },
    typedWords, breaks, reviews, tabs, prelearned,
    results: await page.eval("(() => { const r = document.querySelector('.dh-results'); return r ? { shown: !r.hidden && r.getBoundingClientRect().width > 0, text: r.innerText.slice(0, 400) } : null; })()"),
    replay,
    perf: await page.eval("window.__dh.perf()"),
    log,
    shots,
    badResources: await badResources(page),
  };
}
