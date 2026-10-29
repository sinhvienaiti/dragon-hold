// dh-vfx-crowd (VFX step 3): the foes' blows in a real crowded wave. Plays the stage (seed SEED) with a bot that
// types only foes within NEAR m, so a crowd reaches the dais and strikes the Dragons; runs at SPEED until wave WAVE,
// then at 1× takes SHOTS pictures (each when ≥ MIN live foes stand within 12 m) with the fx counters (foe strikes,
// impacts, wind-ups) and draw calls, and the frame times over the wave's first 20 s at 1×. Below HOLD % HP the page
// sets the Dragon's HP back to full (scenario only, as dh-crowd does).
// Env: SIZE=1920|1280, SEED (5), WAVE (7), SPEED (4), NEAR (8), MIN (12), SHOTS (3), HOLD (40), OUT_DIR (tmp/vfx/crowd).
// Owner: view-crowd-fx (LANES.md).
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { boot, press, startWave } from "./lib/dh.mjs";

const BIG = process.env.SIZE !== "1280";
const W = BIG ? 1920 : 1280;
const H = BIG ? 1080 : 720;
const SEED = process.env.SEED ?? "5";
const WAVE = Number(process.env.WAVE ?? "7");
const SPEED = Number(process.env.SPEED ?? "4");
const NEAR = Number(process.env.NEAR ?? "8");
const MIN = Number(process.env.MIN ?? "12");
const SHOTS = Number(process.env.SHOTS ?? "3");
const HOLD = Number(process.env.HOLD ?? "40");
const OUT = resolve(process.env.OUT_DIR ?? "tmp/vfx/crowd");

const BOT = `(async () => {
  const d = window.__dh; const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  window.__stopBot = false; window.__heals = 0; window.__near = ${NEAR};
  for (let k = 0; k < 400000 && !window.__stopBot; k += 1) {
    const w = d.world();
    if (w.phase === 'victory' || w.phase === 'defeat') break;
    if (${HOLD} > 0 && w.hero.hp > 0 && w.hero.hp * 100 < w.hero.hpMax * ${HOLD}) { w.hero.hp = w.hero.hpMax; window.__heals += 1; }
    if (d.panel()) { d.action && d.action('escape'); }
    if ((w.phase !== 'wave' && w.phase !== 'warning')) { if (w.phase === 'break') d.send({ type: 'call-early' }); await sleep(100); continue; }
    const ws = d.words();
    const distOf = (x) => { if (!x.target) return 0; const e = w.enemies.list[x.target.slot]; if (!e || !e.alive) return 1e9; return Math.hypot(e.x, e.z) / 60000; };
    const lock = w.words.lock;
    let word = lock >= 0 ? ws.find((x) => x.slot === lock) : null;
    if (word && distOf(word) >= window.__near) { d.send({ type: 'release' }); word = null; }
    if (!word) { const c = ws.filter((x) => distOf(x) < window.__near).sort((a, b) => distOf(a) - distOf(b)); word = c[0] ?? null; }
    if (word) { for (const ch of word.text.slice(word.typed)) d.send({ type: 'key', letter: ch.charCodeAt(0) - 97 }); }
    await sleep(90);
  }
})()`;

const LOOK = `(() => {
  const d = window.__dh; const w = d.world(); const m = 60000;
  const live = w.enemies.list.filter((e) => e.alive);
  const near = live.filter((e) => Math.hypot(e.x, e.z) / m < 12).length;
  const fx = d.numberLayer(); const foes = fx && fx.core && fx.core.foes;
  return { wave: w.wave, phase: w.phase, live: live.length, near, hp: w.hero.hp, heals: window.__heals ?? 0,
    foes: foes ? { strikes: foes.strikes, impacts: foes.impacts, spawns: foes.spawns, windups: foes.windupCount, flights: foes.flightCount } : null,
    drawCalls: d.perf().drawCalls };
})()`;

async function until(page, predicate, timeoutMs) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const look = await page.eval(LOOK);
    if (look.phase === "victory" || look.phase === "defeat") return { ...look, ended: true };
    if (predicate(look)) return look;
    await page.sleep(400);
  }
  return null;
}

export default async function (page) {
  mkdirSync(OUT, { recursive: true });
  const res = { size: W + "x" + H, seed: SEED, wave: WAVE, near: NEAR, shots: [] };
  await boot(page, "prelearn=0&seed=" + SEED, { width: W, height: H });
  await press(page, "Enter");
  await page.sleep(250);
  res.started = await startWave(page);
  void page.eval(BOT).catch(() => {});
  await page.eval("window.__dh.setSpeed(" + SPEED + ")");
  res.reached = await until(page, (c) => c.wave >= WAVE && c.phase === "wave", 900000);
  await page.eval("window.__dh.setSpeed(1)");
  const perfStart = await page.eval("window.__dh.perf()");
  for (let shot = 0; shot < SHOTS; shot += 1) {
    const look = await until(page, (c) => c.wave >= WAVE && c.near >= MIN, 90000);
    if (!look || look.ended) break;
    await page.sleep(500);
    const file = join(OUT, "wave" + WAVE + "-" + shot + "-" + W + "x" + H + ".png");
    await page.shot(file);
    res.shots.push({ file, ...(await page.eval(LOOK)) });
    await page.sleep(2500);
  }
  res.perf = { start: perfStart, end: await page.eval("window.__dh.perf()") };
  await page.eval("window.__stopBot = true");
  writeFileSync(join(OUT, "report-" + W + "x" + H + ".json"), JSON.stringify(res, null, 1));
  return res;
}
