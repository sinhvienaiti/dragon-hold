// dh-crowd (round 2 readability): a crowd held at the Bridge head by a Moss
// Warden (bought with key 4 before wave 1), word tags over foe bodies measured
// three times from wave 3 (the bot then types only foes within 7 m), and
// Thiên Hỏa cast on the first crowd in slow motion (16 frames from cast to
// impact). SIZE=1920 runs 1920×1080 (default 1280×720), SEED (default 5).
// HOLD (25/10, default 40; 0 = off): this measures tags over bodies, not
// survival, yet the bot leaves far foes untyped on purpose, so Héo lan drained
// the Dragon and ended the stage before the third measurement (Dell round 3,
// 1080p: seeds 1–4 and 7 got 1–2 of 3; the Mac at seed 1 too). Below HOLD %
// HP the page sets the Dragon's HP back to full (a scenario-only change of the
// world: replayCheck no longer holds, and `heals` counts them), so every seed
// reaches three crowds.
// Cover (26/10 review): the share of a box's area under the union of the
// shown tag bodies, exact rectangle areas (the layout's share() in
// src/ui/tags.ts measures the same way). Until 26/10 a 6 × 6 grid sampled it:
// it read 33–34 % as 42 % and a 75 % cover as 33 %, and the layout's limit
// was tuned to that error.
// Three kinds of box, each checked every drawn frame from wave 3 to the end of
// wave 2 + WAVES (default 2: waves 3–4), after the game's own frame:
//   far:  drawn foe bodies 10 m and more from the dais (a swarm as its ring);
//   near: foes within 10 m, whose tags sit in the ring of slots round the dais
//         (until 26/10 nothing measured them: ring tags hid them up to 92 %);
//   warn: live enemy wind-ups (view/foe-look drawnWarnings), on the ground.
// For each: frames with a box ≥ 30 % and ≥ 40 % covered, the streaks of the
// latter, the tags over it (ring tags marked). The first 3 frames per kind
// with a box ≥ 40 % covered slow the world to 0.25 for a picture.
// Jumps (26/10 review: tags moved inside their 0.5 s hold, some 216–240 px
// away and back within 100–150 ms): each tag's offset from its foe on screen,
// per frame; a change > 12 px is a jump (a ring flip, a foe crossing 10 m, is
// counted apart), "in hold" when < 480 ms after that tag's last jump, and a
// bounce when it lands within 6 px of where it stood before its last jump,
// < 480 ms after it.
// `ok` holds each part's own verdict: `okShots` three measurements, each with
// mean far cover ≤ 20 % and no far foe ≥ 40 %; `okFar`, `okNear`, `okWarn` no
// streak of a box ≥ 40 % longer than 6 frames (0.1 s at 60 Hz); `okJumps` no
// bounce; and Thiên Hỏa cast, frames measured, no page exception.
// GUARD (round 3, default 0 = off): below GUARD % Dragon HP the bot types every
// word, as dh-scale's does (with GUARD=50 the crowd never formed in 60 s).
// Pictures: tmp/shots/readability/ (OUT_DIR overrides).
// Owner: view lane (round 2 readability).
import { join } from "node:path";
import { boot, MOD, outDir, press, startWave, state } from "./lib/dh.mjs";

const BIG = process.env.SIZE === "1920";
const W = BIG ? 1920 : 1280;
const H = BIG ? 1080 : 720;
const GUARD = Number(process.env.GUARD ?? "0");
const HOLD = Number(process.env.HOLD ?? "40");
const SEED = process.env.SEED ?? "5";
const WAVES = Math.max(1, Number(process.env.WAVES ?? "2"));

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

/**
 * Installs window.__dhCover(): every drawn foe body (far: ≥ 10 m, near: < 10 m;
 * a swarm once, as its ring) and every live enemy wind-up, each with the share
 * of its screen box under the shown tag bodies (exact union area).
 */
const INSTALL_COVER = `(async () => {
  const look = await import('/src/view/foe-look.ts');
  /** Area of the union of the tags' rects clipped to box b ([x, y, w, h]), as a share of b. */
  const coverOf = (b, tags) => {
    const bx1 = b[0] + b[2]; const by1 = b[1] + b[3];
    const clip = [];
    for (const { r } of tags) {
      const x0 = Math.max(b[0], r.left); const x1 = Math.min(bx1, r.right); const y0 = Math.max(b[1], r.top); const y1 = Math.min(by1, r.bottom);
      if (x1 > x0 && y1 > y0) clip.push([x0, y0, x1, y1]);
    }
    if (clip.length === 0 || b[2] <= 0 || b[3] <= 0) return 0;
    const xs = [...new Set(clip.flatMap((c) => [c[0], c[2]]))].sort((p, q) => p - q);
    let area = 0;
    for (let i = 0; i + 1 < xs.length; i += 1) {
      const xa = xs[i]; const xb = xs[i + 1]; if (xb <= xa) continue;
      const spans = clip.filter((c) => c[0] <= xa && c[2] >= xb).map((c) => [c[1], c[3]]).sort((p, q) => p[0] - q[0]);
      let len = 0; let cur = null;
      for (const s of spans) { if (cur === null || s[0] > cur[1]) { if (cur) len += cur[1] - cur[0]; cur = [s[0], s[1]]; } else cur[1] = Math.max(cur[1], s[1]); }
      if (cur) len += cur[1] - cur[0];
      area += (xb - xa) * len;
    }
    return area / (b[2] * b[3]);
  };
  const boxOf = (d, x, z, low, high, r) => {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const dy of [low, high]) for (const dx of [-r, r]) for (const dz of [-r, r]) {
      const p = d.project(x + dx, dy, z + dz);
      if (!p.visible) return null;
      x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y);
    }
    if (x1 < 0 || y1 < 0 || x0 > innerWidth || y0 > innerHeight) return null;
    return [x0, y0, x1 - x0, y1 - y0];
  };
  const over = (b, tags) => tags.filter((t) => t.r.left < b[0] + b[2] && t.r.right > b[0] && t.r.top < b[1] + b[3] && t.r.bottom > b[1]).map((t) => t.word + (t.ring ? '(ring)' : ''));
  window.__dhCover = () => {
    const d = window.__dh; const w = d.world(); const m = 60000;
    const tags = [...document.querySelectorAll('.dh-tag')].filter((e) => Number(getComputedStyle(e).opacity) > 0.5 && !e.classList.contains('is-chip')).map((e) => ({ word: e.dataset.word, ring: e.classList.contains('is-ring'), r: e.querySelector('.dh-tag__body').getBoundingClientRect() }));
    const far = []; const near = []; const warn = []; const seen = new Set();
    for (const e of w.enemies.list) {
      if (!e.alive || e.freed) continue;
      let x = e.x / m; let z = e.z / m;
      const dist = Math.hypot(x, z);
      const fl = look.foeDrawLook(e.foe); const [sw, sh, sl] = look.foeDrawnSize(e.foe);
      const lift = Math.max(e.y / m, fl.placeholder.hoverM);
      let r = Math.max(sw, sl) / 2;
      const ring = e.cluster >= 0 && fl.gait === 'swarm' ? look.drawnClusters.get(e.cluster) : undefined;
      if (ring) { if (seen.has(e.cluster)) continue; seen.add(e.cluster); x = ring.x; z = ring.z; r = ring.radius; }
      const b = boxOf(d, x, z, lift, lift + sh, r);
      if (!b) continue;
      const cover = Math.round(coverOf(b, tags) * 100);
      (dist < 10 ? near : far).push({ foe: ring ? 'swarm-cluster' : e.foe, dist: Math.round(dist * 10) / 10, word: e.word >= 0, cover, box: b.map(Math.round), tags: cover > 0 ? over(b, tags) : [] });
    }
    for (const wv of look.drawnWarnings) {
      const b = boxOf(d, wv.x, wv.z, wv.y, wv.y + 0.2, wv.radius);
      if (!b) continue;
      const cover = Math.round(coverOf(b, tags) * 100);
      warn.push({ foe: 'warning', dist: Math.round(Math.hypot(wv.x, wv.z) * 10) / 10, word: false, cover, box: b.map(Math.round), tags: cover > 0 ? over(b, tags) : [] });
    }
    const n = far.length;
    return { n, tags: tags.length, over40: far.filter((f) => f.cover >= 40).length, meanCover: n ? Math.round(far.reduce((a, f) => a + f.cover, 0) / n) : 0, foes: far, near, warn };
  };
  return true;
})()`;

/**
 * Every drawn frame of a wave from here on (a requestAnimationFrame loop started
 * from a frame callback, after the game's own): the most covered box of each
 * kind, and each tag's offset from its foe (jumps, bounces).
 */
const FRAME_MONITOR = `(() => {
  const kind = () => ({ frames: 0, over30: 0, over40: 0, maxCover: 0, streaks: [], last: -10, examples: [], byRing: 0, byOther: 0, shots: 0 });
  const m = { frames: 0, on: true, far: kind(), near: kind(), warn: kind(), jumps: 0, inHold: 0, inHoldBy: {}, bounces: 0, ringFlips: 0, tagsSeen: 0, jumpExamples: [], bounceExamples: [], shotReq: null };
  window.__dhCoverFrames = m;
  const add = (key, list) => {
    const s = m[key]; let worst = null;
    for (const f of list) if (worst === null || f.cover > worst.cover) worst = f;
    if (worst === null) return;
    s.frames += 1;
    s.maxCover = Math.max(s.maxCover, worst.cover);
    if (worst.cover >= 30) s.over30 += 1;
    if (worst.cover < 40) return;
    s.over40 += 1;
    if (worst.tags.some((t) => t.endsWith('(ring)'))) s.byRing += 1; else s.byOther += 1;
    if (m.frames - s.last > 1) {
      s.streaks.push(1);
      if (s.examples.length < 8) {
        // Each covering tag: its last move's reason (tags.ts data-left) and how long ago it moved.
        const now = performance.now();
        const tags = worst.tags.map((t) => { const w = t.replace('(ring)', ''); const el = [...document.querySelectorAll('.dh-tag')].find((e) => e.dataset.word === w); const at = movedAt.get(w); return t + '[' + (el?.dataset.left ?? '-') + ' ' + (at === undefined ? '-' : Math.round(now - at) + 'ms') + (el?.classList.contains('is-locked') ? ' locked' : '') + ']'; });
        s.examples.push({ frame: m.frames, wave: window.__dh.world().wave, foe: worst.foe + ':' + worst.cover + (worst.word ? 'w' : '') + '@' + worst.box.join(','), dist: worst.dist, tags });
      }
      if (s.shots < 3 && m.shotReq === null) { s.shots += 1; m.shotReq = { kind: key, n: s.shots, frame: m.frames, cover: worst.cover }; window.__dh.setSpeed(0.25); }
    } else s.streaks[s.streaks.length - 1] += 1;
    s.last = m.frames;
  };
  const off = new Map(); const ringOf = new Map(); const lastJump = new Map(); const before = new Map(); const movedAt = new Map();
  const tick = () => {
    if (!m.on) return;
    const d = window.__dh;
    if (d.world().phase === 'wave') {
      m.frames += 1;
      const c = window.__dhCover();
      add('far', c.foes); add('near', c.near); add('warn', c.warn);
      const now = performance.now();
      const words = d.words();
      for (const el of document.querySelectorAll('.dh-tag')) {
        if (Number(getComputedStyle(el).opacity) <= 0.5 || el.classList.contains('is-chip')) continue;
        const wd = words.find((x) => x.text === el.dataset.word);
        if (!wd || !wd.visible || !wd.target) continue;
        const r = el.querySelector('.dh-tag__body').getBoundingClientRect();
        const at = [r.left + r.width / 2 - wd.sx, r.bottom - wd.sy];
        const key = wd.target.slot + ':' + wd.target.serial;
        const ring = el.classList.contains('is-ring');
        const prev = off.get(key);
        const wasRing = ringOf.get(key);
        off.set(key, at); ringOf.set(key, ring);
        if (prev === undefined) continue;
        const moved = Math.hypot(at[0] - prev[0], at[1] - prev[1]);
        if (moved <= 12) continue;
        movedAt.set(wd.text, now);
        if (wasRing !== ring) { m.ringFlips += 1; lastJump.delete(key); before.delete(key); continue; }
        m.jumps += 1;
        const lj = lastJump.get(key);
        const b = before.get(key);
        // The layout's reason for this move (tags.ts data-left): body, busy, or "" (a new layout after the hold).
        const why = el.dataset.left === undefined ? 'none' : el.dataset.left === '' ? 'after-hold' : el.dataset.left;
        if (lj !== undefined && now - lj < 480) {
          m.inHold += 1;
          m.inHoldBy[why] = (m.inHoldBy[why] ?? 0) + 1;
          if (m.jumpExamples.length < 10) m.jumpExamples.push({ word: wd.text, ms: Math.round(now - lj), px: Math.round(moved), why });
        }
        if (b !== undefined && now - b.t < 480 && Math.hypot(at[0] - b.at[0], at[1] - b.at[1]) <= 6) {
          m.bounces += 1;
          if (m.bounceExamples.length < 10) m.bounceExamples.push({ word: wd.text, ms: Math.round(now - b.t), px: Math.round(moved), why, locked: el.classList.contains('is-locked') });
        }
        before.set(key, { at: prev, t: now });
        lastJump.set(key, now);
      }
      m.tagsSeen = off.size;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(() => requestAnimationFrame(tick));
  return true;
})()`;

/** Longest streak of frames with a box ≥ 40 % covered that still passes (0.1 s at 60 Hz). */
const STREAK_MAX = 6;

async function tend(page) {
  const panel = await page.eval("window.__dh.panel()");
  if (panel === "review" || panel === "prelearn") { await press(page, "Escape"); await page.sleep(120); }
  const s = await state(page);
  if (s.phase === "break") await page.eval("window.__dh.send({ type: 'call-early' })");
  return s.phase;
}

/** Takes the picture the frame monitor asked for (world slowed to 0.25 meanwhile). */
async function shotIfAsked(page, out) {
  const req = await page.eval("window.__dhCoverFrames?.shotReq ?? null");
  if (!req) return;
  await page.shot(join(out, `cover-${req.kind}-${req.n}-${W}x${H}.png`));
  await page.eval("window.__dhCoverFrames.shotReq = null; window.__dh.setSpeed(1)");
}

async function until(page, predicate, timeoutMs, out) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const phase = await tend(page);
    if (phase === "victory" || phase === "defeat") return null;
    if (out) await shotIfAsked(page, out);
    const c = await page.eval(CROWD);
    if (predicate(c)) return c;
    await page.sleep(120);
  }
  return null;
}

const kindResult = (s) => ({ frames: s.frames, over30: s.over30, over40: s.over40, maxCover: s.maxCover, longest: Math.max(0, ...s.streaks), streaks: s.streaks.slice(0, 24), byRing: s.byRing, byOther: s.byOther, examples: s.examples });

export default async function (page) {
  const out = outDir("readability");
  const res = { size: `${W}x${H}`, seed: SEED, hold: HOLD, wpm: process.env.WPM ?? "35", waves: [3, 2 + WAVES], covers: [] };
  await boot(page, "prelearn=0&seed=" + SEED, { width: W, height: H });
  await press(page, "Digit4"); await page.sleep(150); await press(page, "Enter"); await page.sleep(250);
  res.started = await startWave(page);
  void page.eval(BOT).catch(() => {});
  await page.eval("window.__dh.setSpeed(3)");

  // From wave 3 type only foes within 7 m: a crowd builds at the bridge head.
  await until(page, (c) => c.wave >= 3 && c.phase === "wave", 300000);
  await page.eval("window.__mode = 'near'; window.__near = 7; window.__dh.setSpeed(1)");
  await page.eval(INSTALL_COVER);
  await page.eval(FRAME_MONITOR);
  for (let shot = 0; shot < 3; shot += 1) {
    const crowd = await until(page, (c) => c.best >= 4, 60000, out);
    if (!crowd) break;
    await page.sleep(700);
    await shotIfAsked(page, out);
    const cover = await page.eval("window.__dhCover()");
    const worst = [...cover.foes].sort((a, b) => b.cover - a.cover).slice(0, 3).map((f) => f.foe + ":" + f.cover + (f.word ? "w" : "") + "@" + f.box.join(","));
    const nearWorst = [...cover.near, ...cover.warn].sort((a, b) => b.cover - a.cover).slice(0, 3).map((f) => f.foe + ":" + f.cover + "@" + f.dist + "m");
    res.covers.push({ crowd, cover: { n: cover.n, tags: cover.tags, over40: cover.over40, meanCover: cover.meanCover, worst, nearWorst, foes: cover.foes.map((f) => f.foe + ":" + f.cover + (f.word ? "w" : "")) } });
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
  // Keep measuring to the end of wave 2 + WAVES (breaks called early).
  await until(page, (c) => c.wave > 2 + WAVES, 240000, out);
  const f = await page.eval("(() => { const m = window.__dhCoverFrames; m.on = false; return m; })()");
  res.frames = { frames: f.frames, far: kindResult(f.far), near: kindResult(f.near), warn: kindResult(f.warn) };
  res.jumps = { jumps: f.jumps, inHold: f.inHold, inHoldBy: f.inHoldBy, bounces: f.bounces, ringFlips: f.ringFlips, tagsSeen: f.tagsSeen, inHoldExamples: f.jumpExamples, bounceExamples: f.bounceExamples };
  res.perf = await page.eval("(() => { const p = window.__dh.perf(); return { meanMs: +p.meanMs.toFixed(2), p95Ms: +p.p95Ms.toFixed(2), maxMs: +p.maxMs.toFixed(1), drawCalls: p.drawCalls }; })()");
  await page.eval("window.__stopBot = true");
  const end = await page.eval("(() => { const w = window.__dh.world(); return { wave: w.wave, phase: w.phase, hp: window.__dh.state().heroHp, heals: window.__heals ?? 0 }; })()");
  res.end = end;
  res.heals = end.heals;
  res.measured = res.covers.length;
  res.spoke = await page.eval("window.__dhSpoke ?? null");
  res.okShots = res.covers.length === 3 && res.covers.every((c) => c.cover.n > 0 && c.cover.meanCover <= 20 && c.cover.over40 === 0);
  res.okFar = res.frames.far.frames > 0 && res.frames.far.longest <= STREAK_MAX;
  res.okNear = res.frames.near.longest <= STREAK_MAX;
  res.okWarn = res.frames.warn.longest <= STREAK_MAX;
  res.okJumps = res.jumps.bounces === 0;
  res.ok = res.started && res.okShots && res.okFar && res.okNear && res.okWarn && res.okJumps && (res.tally?.skill ?? 0) >= 1 && page.exceptions.length === 0;
  return res;
}
