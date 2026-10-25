// dh-crowd (round 2 readability): a crowd held at the Bridge head by a Moss
// Warden (bought with key 4 before wave 1), word tags over foe bodies measured
// three times from wave 3 (the bot then types only foes within 7 m), and
// Thiên Hỏa cast on the first crowd in slow motion (16 frames from cast to
// impact). Cover = share of each drawn foe body (outside 10 m; a swarm as its
// ring) under a word tag, on a 6 × 6 grid; the target is ≤ 20 % mean and no
// foe ≥ 40 %. SIZE=1920 runs 1920×1080 (default 1280×720), SEED (default 5).
// HOLD (25/10, default 40; 0 = off): this measures tags over bodies, not
// survival, yet the bot leaves far foes untyped on purpose, so Héo lan drained
// the Dragon and ended the stage before the third measurement (Dell round 3,
// 1080p: seeds 1–4 and 7 got 1–2 of 3; the Mac at seed 1 too). Below HOLD %
// HP the page sets the Dragon's HP back to full (a scenario-only change of the
// world: replayCheck no longer holds, and `heals` counts them), so every seed
// reaches three crowds. `ok`: three measurements, each with mean cover ≤ 20 %
// and no foe ≥ 40 %, Thiên Hỏa cast, no page exception; `worst` lists each
// measurement's most covered foes with their screen boxes.
// Frames (26/10): three pictures catch a short cover only by luck (seed 1
// 720p: 83 % at measurement 2 in one run, 3 % in the next), so from wave 3 a
// monitor also checks every drawn frame after the game's own (`frames`: frames
// with a foe ≥ 30 % and ≥ 40 %, the streaks of the latter, the first frame of
// each with the tags over that foe). `ok` also needs no streak of a foe ≥ 40 %
// longer than 6 frames (0.1 s at 60 Hz): a tag held over a foe that walked in
// under it showed as 8–28 frames.
// GUARD (round 3, default 0 = off): below GUARD % Dragon HP the bot types every
// word, as dh-scale's does (with GUARD=50 the crowd never formed in 60 s).
// Pictures: tmp/shots/readability/ (OUT_DIR overrides).
// Owner: view lane (round 2 readability).
import { join } from "node:path";
import { boot, MOD, outDir, press, state } from "./lib/dh.mjs";

const BIG = process.env.SIZE === "1920";
const W = BIG ? 1920 : 1280;
const H = BIG ? 1080 : 720;
const GUARD = Number(process.env.GUARD ?? "0");
const HOLD = Number(process.env.HOLD ?? "40");
const SEED = process.env.SEED ?? "5";

const BOT = `(async () => {
  const d = window.__dh; const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  window.__mode = 'all'; window.__near = 14; window.__stopBot = false; window.__heals = 0;
  for (let k = 0; k < 400000 && !window.__stopBot; k += 1) {
    const w = d.world();
    if (w.phase === 'victory' || w.phase === 'defeat') break;
    // HOLD: keep the Dragon standing (scenario only, see the header).
    if (${HOLD} > 0 && w.hero.hp > 0 && w.hero.hp * 100 < w.hero.hpMax * ${HOLD}) { w.hero.hp = w.hero.hpMax; window.__heals += 1; }
    if (window.__mode === 'off' || (w.phase !== 'wave' && w.phase !== 'warning') || d.panel()) { await sleep(60); continue; }
    const ws = d.words();
    const distOf = (x) => { if (!x.target) return 0; const e = w.enemies.list[x.target.slot]; if (!e || !e.alive) return 1e9; return Math.hypot(e.x, e.z) / 60000; };
    // Below GUARD % HP every word counts again (off at 0).
    const all = window.__mode === 'all' || w.hero.hp * 100 < w.hero.hpMax * ${GUARD};
    const lock = w.words.lock;
    let word = lock >= 0 ? ws.find((x) => x.slot === lock) : null;
    if (word && !all && distOf(word) >= window.__near) { d.send({ type: 'release' }); word = null; }
    if (!word) { const c = ws.filter((x) => all || distOf(x) < window.__near).sort((a, b) => distOf(a) - distOf(b)); word = c[0] ?? null; }
    if (word) { for (const ch of word.text.slice(word.typed)) d.send({ type: 'key', letter: ch.charCodeAt(0) - 97 }); }
    await sleep(80);
  }
})()`;

/** Densest 4 m group of live foes 10–22 m from the dais. */
const CROWD = `(() => {
  const d = window.__dh; const w = d.world(); const m = 60000;
  const list = w.enemies.list.filter((e) => e.alive);
  let best = 0; let at = null;
  for (const e of list) {
    const r = Math.hypot(e.x, e.z) / m;
    if (r < 10 || r > 22) continue;
    const n = list.filter((o) => Math.hypot(o.x - e.x, o.z - e.z) / m < 4).length;
    if (n > best) { best = n; at = [Math.round(e.x / m), Math.round(e.z / m)]; }
  }
  return { wave: w.wave, phase: w.phase, best, at, live: list.length, hp: d.state().heroHp, heals: window.__heals ?? 0 };
})()`;

/** Installs window.__dhCover(): how much of each drawn foe body (outside the 10 m ring) the word tags cover, sampled on a 6 × 6 grid. */
const INSTALL_COVER = `(async () => {
  const look = await import('/src/view/foe-look.ts');
  window.__dhCover = () => {
    const d = window.__dh; const w = d.world(); const m = 60000;
    const tags = [...document.querySelectorAll('.dh-tag')].filter((e) => Number(getComputedStyle(e).opacity) > 0.5 && !e.classList.contains('is-chip')).map((e) => ({ word: e.dataset.word, r: e.querySelector('.dh-tag__body').getBoundingClientRect() }));
    const foes = [];
    const seenCluster = new Set();
    for (const e of w.enemies.list) {
      if (!e.alive) continue;
      let x = e.x / m; let z = e.z / m;
      if (Math.hypot(x, z) < 10) continue;
      const fl = look.foeDrawLook(e.foe);
      const [sw, sh, sl] = look.foeDrawnSize(e.foe);
      const lift = Math.max(e.y / m, fl.placeholder.hoverM);
      let r = Math.max(sw, sl) / 2;
      // A swarm counts once, as its drawn ring (the bodies are spread round it in the view).
      const ring = e.cluster >= 0 && fl.gait === 'swarm' ? look.drawnClusters.get(e.cluster) : undefined;
      if (ring) { if (seenCluster.has(e.cluster)) continue; seenCluster.add(e.cluster); x = ring.x; z = ring.z; r = ring.radius; }
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; let ok = true;
      for (const dy of [lift, lift + sh]) for (const dx of [-r, r]) for (const dz of [-r, r]) {
        const p = d.project(x + dx, dy, z + dz);
        if (!p.visible) ok = false;
        x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y);
      }
      if (!ok || x1 < 0 || y1 < 0 || x0 > innerWidth || y0 > innerHeight) continue;
      let hit = 0;
      for (let i = 0; i < 6; i += 1) for (let j = 0; j < 6; j += 1) {
        const px = x0 + ((i + 0.5) / 6) * (x1 - x0); const py = y0 + ((j + 0.5) / 6) * (y1 - y0);
        if (tags.some((t) => px >= t.r.left && px <= t.r.right && py >= t.r.top && py <= t.r.bottom)) hit += 1;
      }
      foes.push({ foe: ring ? 'swarm-cluster' : e.foe, word: e.word >= 0, cover: Math.round((hit / 36) * 100), box: [Math.round(x0), Math.round(y0), Math.round(x1 - x0), Math.round(y1 - y0)] });
    }
    const n = foes.length;
    const over = (f) => tags.filter((t) => t.r.left < f.box[0] + f.box[2] && t.r.right > f.box[0] && t.r.top < f.box[1] + f.box[3] && t.r.bottom > f.box[1]).map((t) => t.word);
    return { n, tags: tags.length, over40: foes.filter((f) => f.cover >= 40).length, meanCover: n ? Math.round(foes.reduce((a, f) => a + f.cover, 0) / n) : 0, foes, over };
  };
  return true;
})()`;

/** Every drawn frame of a wave from here on (a requestAnimationFrame loop started from a frame callback, after the game's own): the most covered foe. */
const FRAME_MONITOR = `(() => {
  const m = { frames: 0, over30: 0, over40: 0, maxCover: 0, streaks: [], last: -10, examples: [], on: true };
  window.__dhCoverFrames = m;
  const tick = () => {
    if (!m.on) return;
    if (window.__dh.world().phase === 'wave') {
      m.frames += 1;
      const c = window.__dhCover();
      let worst = null;
      for (const f of c.foes) if (worst === null || f.cover > worst.cover) worst = f;
      if (worst !== null) {
        m.maxCover = Math.max(m.maxCover, worst.cover);
        if (worst.cover >= 30) m.over30 += 1;
        if (worst.cover >= 40) {
          m.over40 += 1;
          if (m.frames - m.last > 1) {
            m.streaks.push(1);
            if (m.examples.length < 8) m.examples.push({ frame: m.frames, foe: worst.foe + ':' + worst.cover + (worst.word ? 'w' : '') + '@' + worst.box.join(','), tags: c.over(worst) });
          } else m.streaks[m.streaks.length - 1] += 1;
          m.last = m.frames;
        }
      }
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(() => requestAnimationFrame(tick));
  return true;
})()`;

/** Longest streak of frames with a foe ≥ 40 % that still passes (0.1 s at 60 Hz). */
const STREAK_MAX = 6;

async function tend(page) {
  const panel = await page.eval("window.__dh.panel()");
  if (panel === "review" || panel === "prelearn") { await press(page, "Escape"); await page.sleep(120); }
  const s = await state(page);
  if (s.phase === "break") await page.eval("window.__dh.send({ type: 'call-early' })");
  return s.phase;
}

async function until(page, predicate, timeoutMs) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const phase = await tend(page);
    if (phase === "victory" || phase === "defeat") return null;
    const c = await page.eval(CROWD);
    if (predicate(c)) return c;
    await page.sleep(120);
  }
  return null;
}

export default async function (page) {
  const out = outDir("readability");
  const res = { size: `${W}x${H}`, seed: SEED, hold: HOLD, covers: [] };
  await boot(page, "prelearn=0&seed=" + SEED, { width: W, height: H });
  await press(page, "Digit4"); await page.sleep(150); await press(page, "Enter"); await page.sleep(250);
  await press(page, "Enter");
  for (let k = 0; k < 60; k += 1) { if ((await state(page)).phase === "wave") break; await page.sleep(250); }
  void page.eval(BOT).catch(() => {});
  await page.eval("window.__dh.setSpeed(3)");

  // From wave 3 type only foes within 7 m: a crowd builds at the bridge head.
  await until(page, (c) => c.wave >= 3 && c.phase === "wave", 300000);
  await page.eval("window.__mode = 'near'; window.__near = 7; window.__dh.setSpeed(1)");
  await page.eval(INSTALL_COVER);
  await page.eval(FRAME_MONITOR);
  for (let shot = 0; shot < 3; shot += 1) {
    const crowd = await until(page, (c) => c.best >= 4, 60000);
    if (!crowd) break;
    await page.sleep(700);
    const cover = await page.eval("(() => { const c = window.__dhCover(); delete c.over; return c; })()");
    const worst = [...cover.foes].sort((a, b) => b.cover - a.cover).slice(0, 3).map((f) => f.foe + ":" + f.cover + (f.word ? "w" : "") + "@" + f.box.join(","));
    res.covers.push({ crowd, cover: { n: cover.n, tags: cover.tags, over40: cover.over40, meanCover: cover.meanCover, worst, foes: cover.foes.map((f) => f.foe + ":" + f.cover + (f.word ? "w" : "")) } });
    await page.shot(join(out, `crowd-${shot}-${W}x${H}.png`));
    if (shot === 0) {
      // Thiên Hỏa on the crowd, slow motion.
      await page.eval("window.__dh.setSpeed(0.25)");
      await press(page, "Digit2", MOD.alt);
      for (let k = 0; k < 16; k += 1) {
        await page.shot(join(out, `tf-${String(k).padStart(2, "0")}-${W}x${H}.png`));
        await page.sleep(90);
      }
      res.tally = await page.eval("(() => { const t = window.__dh.events().tally; return { skill: t.skill, telegraphAlly: t['telegraph:ally'] }; })()");
      await page.eval("window.__dh.setSpeed(1)");
    }
    await page.eval("window.__near = 10");
    await page.sleep(2500);
  }
  const frames = await page.eval("(() => { const m = window.__dhCoverFrames; m.on = false; return m; })()");
  res.frames = { frames: frames.frames, over30: frames.over30, over40: frames.over40, maxCover: frames.maxCover, streaks: frames.streaks, longest: Math.max(0, ...frames.streaks), examples: frames.examples };
  res.perf = await page.eval("(() => { const p = window.__dh.perf(); return { meanMs: +p.meanMs.toFixed(2), p95Ms: +p.p95Ms.toFixed(2), maxMs: +p.maxMs.toFixed(1), drawCalls: p.drawCalls }; })()");
  await page.eval("window.__stopBot = true");
  const end = await page.eval("(() => { const w = window.__dh.world(); return { wave: w.wave, phase: w.phase, hp: window.__dh.state().heroHp, heals: window.__heals ?? 0 }; })()");
  res.end = end;
  res.heals = end.heals;
  res.measured = res.covers.length;
  res.ok =
    res.covers.length === 3 &&
    res.covers.every((c) => c.cover.n > 0 && c.cover.meanCover <= 20 && c.cover.over40 === 0) &&
    (res.tally?.skill ?? 0) >= 1 &&
    res.frames.frames > 0 &&
    res.frames.longest <= STREAK_MAX &&
    page.exceptions.length === 0;
  return res;
}
