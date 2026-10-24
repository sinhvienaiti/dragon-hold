// dh-banner (05 §6 general row, 02 §3.2 Cắm Cờ; round 2 gate): G01 carries its
// banner, and a `banner` plant raises the banner on the ground with a light
// pillar in the aura colour, its 5 m aura ring and "Cắm Cờ" for 1 s; typing the
// flag word fells it. Also pictures the aura ring on grass (it now has a dark
// Hắc Vụ edge) for the colour check.
// The run is fast-forwarded in the page: a word bot types through __dh.send
// (logged commands, so replayCheck still holds) while the scenario steps the
// world itself in small chunks, so a slow software-GL browser (the Dell's
// headless Chrome draws ~1–3 frames a second) still reaches wave 5. In wave 5
// the bot spares G01 and the foes within 6 m of it, and never types the urgent
// word (Long Hống breaks the wind-up), so G01 plants with its escort; the
// camera centres on the banner for the pictures. Then the flag word is typed
// (the banner falls) and G01, spared alone, is pictured carrying it again.
// SIZE=1920 runs at 1920×1080 (default 1280×720). Owner: integrator (LANES.md).
import { join } from "node:path";
import { badResources, boot, outDir, press, state, waitFor } from "./lib/dh.mjs";

const [W, H] = process.env.SIZE === "1920" ? [1920, 1080] : [1280, 720];

/**
 * In-page: types every live word it may (the lock first), then steps the world `ticks` ticks.
 * spare: "none" | "general" (G01) | "group" (G01 and foes within 6 m of it, and no urgent word).
 */
const CHUNK = (ticks, spare, pullFlag, wait = false) => `(async () => {
  const d = window.__dh; const { step } = await import('/src/sim/world.ts');
  const w = d.world();
  if (w.phase === 'victory' || w.phase === 'defeat') return { phase: w.phase, wave: w.wave };
  if (w.phase === 'break' && w.phaseEndsAt > 0) d.send({ type: 'call-early' });
  const spare = ${JSON.stringify(spare)};
  const g = w.enemies.list.find((e) => e.alive && e.foe === 'moss-banner');
  const near = (e) => g && Math.hypot(e.x - g.x, e.z - g.z) <= 6 * 60000;
  const ok = (x) => {
    if (x.kind === 'flag') return ${pullFlag};
    if (x.kind === 'urgent') return spare !== 'group';
    if (!x.target) return true;
    const e = w.enemies.list[x.target.slot];
    if (!e || spare === 'none') return true;
    if (e.foe === 'moss-banner') return false;
    return !(spare === 'group' && near(e));
  };
  const live = d.words().filter(ok);
  const lock = w.words.lock;
  if (lock >= 0 && !live.some((x) => x.slot === lock)) d.send({ type: 'release' });
  const order = lock >= 0 ? [...live.filter((x) => x.slot === lock), ...live.filter((x) => x.slot !== lock)] : live;
  for (const word of order) for (const ch of word.text.slice(word.typed)) d.send({ type: 'key', letter: ch.charCodeAt(0) - 97 });
  for (let k = 0; k < ${ticks} && w.phase !== 'victory' && w.phase !== 'defeat'; k += 1) step(w);
  // Lockstep: the app's next frame drains these ticks' events into the views before the state is read.
  if (${wait}) await new Promise((done) => requestAnimationFrame(() => done()));
  const s = d.state();
  const f = d.foes().find((x) => x.foe === 'moss-banner');
  return { phase: w.phase, wave: w.wave, tick: w.tick, hp: w.hero.hp, banners: s.banners, general: f ? { x: f.x, z: f.z, visible: f.visible } : null };
})()`;

const GENERAL = `(() => {
  const d = window.__dh; const g = d.foes().find((f) => f.foe === 'moss-banner');
  if (!g) return null;
  const p = d.project(g.x, 3, g.z);
  return { x: g.x, z: g.z, sx: p.x, sy: p.y, visible: p.visible };
})()`;

const BANNER = `(() => { const b = window.__dh.world().boss.banners.find((x) => !x.down); if (!b) return null; const x = b.x / 60000; const z = b.z / 60000; const p = window.__dh.project(x, 3, z); return { x, z, sx: p.x, sy: p.y, visible: p.visible }; })()`;

const crop = (sx, sy, half = 230) => {
  const x = Math.max(0, Math.round(sx - half));
  const y = Math.max(0, Math.round(sy - half * 0.9));
  return { x, y, width: Math.min(half * 2, W - x), height: Math.min(Math.round(half * 1.6), H - y) };
};

/** Lets the page draw `n` frames (≈0.3–1 s each in software GL). */
const frames = (page, n = 2) => page.eval(`new Promise((done) => { let k = 0; const f = () => (++k >= ${n} ? done(k) : requestAnimationFrame(f)); requestAnimationFrame(f); })`);

export default async function (page) {
  const out = outDir("banner");
  const shots = [];
  const shot = async (name, clip) => {
    const file = join(out, name + "-" + W + "x" + H + ".png");
    await page.shot(file, clip ? { clip } : {});
    shots.push(file);
  };
  await boot(page, "prelearn=0", { width: W, height: H });
  await press(page, "Enter");
  await waitFor(page, "s.phase === 'wave'", { timeoutMs: 60000 });
  // Waves 1–4: every word typed, 1 s of world a chunk; Thẻ Ôn is closed when it opens.
  let s = null;
  for (let k = 0; k < 4000; k += 1) {
    s = await page.eval(CHUNK(60, "none", false));
    if (s.phase === "victory" || s.phase === "defeat" || s.wave >= 5) break;
    if ((await page.eval("window.__dh.panel()")) === "review") await press(page, "Escape");
  }
  const result = { reached: { wave: s?.wave, phase: s?.phase, hp: s?.hp }, planted: null, pulled: null, carried: null };
  // Wave 5, until a banner stands: G01 and its escort spared.
  for (let k = 0; k < 4000 && s && s.wave === 5 && s.phase === "wave" && !(s.banners?.planted >= 1); k += 1) s = await page.eval(CHUNK(20, "group", false, true));
  if (s?.banners?.planted >= 1) {
    await page.eval("window.__dh.setSpeed(0.25)");
    const b = await page.eval(BANNER);
    if (b) await page.eval(`window.__dh.setView({ targetX: ${b.x}, targetZ: ${b.z} }, true)`);
    await frames(page, 2);
    const at = await page.eval(BANNER);
    await shot("01-planted-full");
    if (at?.visible) await shot("01-planted", crop(at.sx, at.sy, 260));
    const ev = await page.eval("window.__dh.events()");
    result.planted = { banners: (await state(page)).banners, at: b ? [b.x.toFixed(1), b.z.toFixed(1)] : null, bannerEvents: ev.tally.banner ?? 0, telegraphsLive: ev.telegraphsLive, flagWord: await page.eval("window.__dh.words().filter((x) => x.kind === 'flag').map((x) => x.text)") };
    // The flag word typed: the banner falls.
    for (let j = 0; j < 40 && s.banners?.planted >= 1 && s.phase === "wave"; j += 1) s = await page.eval(CHUNK(3, "group", true, true));
    await frames(page, 2);
    if (at?.visible) await shot("02-pulled", crop(at.sx, at.sy, 260));
    result.pulled = { banners: (await state(page)).banners, bannerEvents: (await page.eval("window.__dh.events()")).tally.banner ?? 0 };
    // Back to the default view; G01 alone spared until it shows with its banner again.
    await page.eval("window.__dh.setView({ targetX: 0, targetZ: -4 }, true); window.__dh.setSpeed(1)");
    for (let k = 0; k < 600 && s.phase === "wave"; k += 1) {
      s = await page.eval(CHUNK(20, "general", false, true));
      if (s.general?.visible && s.banners?.carried >= 1 && s.banners?.planted === 0) {
        await page.eval("window.__dh.setSpeed(0.25)");
        await frames(page, 2);
        const g = await page.eval(GENERAL);
        if (g?.visible) {
          await shot("03-carried", crop(g.sx, g.sy));
          await shot("03-carried-full");
          result.carried = { banners: (await state(page)).banners, at: [g.x.toFixed(1), g.z.toFixed(1)] };
          break;
        }
      }
    }
  }
  await page.eval("window.__dh.setSpeed(1)");
  const end = await state(page);
  return {
    ok: result.planted !== null && result.planted.banners.planted >= 1 && result.pulled !== null && result.pulled.banners.planted === 0 && result.carried !== null && page.exceptions.length === 0,
    ...result,
    end: { phase: end.phase, wave: end.wave, tick: end.tick, heroHp: end.heroHp },
    replay: await page.eval("window.__dh.replayCheck()"),
    shots,
    badResources: await badResources(page),
  };
}
