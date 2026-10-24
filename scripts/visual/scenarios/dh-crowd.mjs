// dh-crowd (round 2 readability): a crowd held at the Bridge head by a Moss
// Warden (bought with key 4 before wave 1), word tags over foe bodies measured
// three times from wave 3 (the bot then types only foes within 7 m), and
// Thiên Hỏa cast on the first crowd in slow motion (16 frames from cast to
// impact). Cover = share of each drawn foe body (outside 10 m; a swarm as its
// ring) under a word tag, on a 6 × 6 grid; the target is ≤ 20 % mean and no
// foe ≥ 40 %. SIZE=1920 runs 1920×1080 (default 1280×720), SEED (default 1).
// GUARD (round 3, default 0 = off): below GUARD % Dragon HP the bot types every
// word, as dh-scale's does, so a run where Héo lan would end the stage before
// the third measurement (1080p, seeds 1–3) still gets there.
// Pictures: tmp/shots/readability/ (OUT_DIR overrides).
// Owner: view lane (round 2 readability).
import { join } from "node:path";
import { boot, MOD, outDir, press, state } from "./lib/dh.mjs";

const BIG = process.env.SIZE === "1920";
const W = BIG ? 1920 : 1280;
const H = BIG ? 1080 : 720;
const GUARD = Number(process.env.GUARD ?? "0");

const BOT = `(async () => {
  const d = window.__dh; const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  window.__mode = 'all'; window.__near = 14; window.__stopBot = false;
  for (let k = 0; k < 400000 && !window.__stopBot; k += 1) {
    const w = d.world();
    if (w.phase === 'victory' || w.phase === 'defeat') break;
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
  return { wave: w.wave, phase: w.phase, best, at, live: list.length, hp: d.state().heroHp };
})()`;

/** How much of each drawn foe body (outside the 10 m ring) the word tags cover, sampled on a 6 × 6 grid. */
const COVER = `(async () => {
  const look = await import('/src/view/foe-look.ts');
  const d = window.__dh; const w = d.world(); const m = 60000;
  const tags = [...document.querySelectorAll('.dh-tag')].filter((e) => Number(getComputedStyle(e).opacity) > 0.5 && !e.classList.contains('is-chip')).map((e) => e.querySelector('.dh-tag__body').getBoundingClientRect());
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
      if (tags.some((t) => px >= t.left && px <= t.right && py >= t.top && py <= t.bottom)) hit += 1;
    }
    foes.push({ foe: ring ? 'swarm-cluster' : e.foe, word: e.word >= 0, cover: Math.round((hit / 36) * 100), box: [Math.round(x0), Math.round(y0), Math.round(x1 - x0), Math.round(y1 - y0)] });
  }
  const n = foes.length;
  return { n, tags: tags.length, over40: foes.filter((f) => f.cover >= 40).length, meanCover: n ? Math.round(foes.reduce((a, f) => a + f.cover, 0) / n) : 0, foes };
})()`;

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
  const res = { size: `${W}x${H}`, covers: [] };
  await boot(page, "prelearn=0&seed=" + (process.env.SEED ?? "1"), { width: W, height: H });
  await press(page, "Digit4"); await page.sleep(150); await press(page, "Enter"); await page.sleep(250);
  await press(page, "Enter");
  for (let k = 0; k < 60; k += 1) { if ((await state(page)).phase === "wave") break; await page.sleep(250); }
  void page.eval(BOT).catch(() => {});
  await page.eval("window.__dh.setSpeed(3)");

  // From wave 3 type only foes within 7 m: a crowd builds at the bridge head.
  await until(page, (c) => c.wave >= 3 && c.phase === "wave", 300000);
  await page.eval("window.__mode = 'near'; window.__near = 7; window.__dh.setSpeed(1)");
  for (let shot = 0; shot < 3; shot += 1) {
    const crowd = await until(page, (c) => c.best >= 4, 60000);
    if (!crowd) break;
    await page.sleep(700);
    const cover = await page.eval(COVER);
    res.covers.push({ crowd, cover: { n: cover.n, tags: cover.tags, over40: cover.over40, meanCover: cover.meanCover, foes: cover.foes.map((f) => f.foe + ":" + f.cover + (f.word ? "w" : "")) } });
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
  res.perf = await page.eval("(() => { const p = window.__dh.perf(); return { meanMs: +p.meanMs.toFixed(2), p95Ms: +p.p95Ms.toFixed(2), maxMs: +p.maxMs.toFixed(1), drawCalls: p.drawCalls }; })()");
  await page.eval("window.__stopBot = true");
  return res;
}
