// dh-telegraphs (05 §10, §6): foe warnings show before the blow and last
// ≥ 0.5 s (E09 swing and E01 sting 0.5 s, E11 aim 0.6 s, E18 pounce 0.5 s,
// E19 charge 1 s, G01 banner), in red; Thiên Hỏa's own ring is pale orange. A
// word bot plays waves 1–2 at speed, then leaves grunts, wasps, archers,
// boars, wolves and G01 alone until each has wound up once; pictures are taken
// while warnings are live, one per species (the debug tally of telegraph
// events by source species). Two passes: wolves (wave 7, Đường Cầu) need a
// blocker to pounce over, G01 needs none to plant its banner.
// SIZE=1920 runs at 1920×1080 (default 1280×720).
// Owner: integrator (LANES.md).
import { join } from "node:path";
import { badResources, boot, MOD, outDir, press, state, waitFor } from "./lib/dh.mjs";

const [W, H] = process.env.SIZE === "1920" ? [1920, 1080] : [1280, 720];

const BOT = (skip) => `(async () => {
  const d = window.__dh; window.__skip = new Set(${JSON.stringify(skip)}); let n = 0;
  for (let k = 0; k < 20000; k += 1) {
    const w = d.world();
    if (w.phase === 'victory' || w.phase === 'defeat' || window.__stopBot) break;
    if (w.phase === 'break' && w.phaseEndsAt > 0 && !d.panel()) d.send({ type: 'call-early' });
    if (d.panel() === 'review') { await new Promise((r) => setTimeout(r, 50)); continue; }
    const live = d.words().filter((x) => { if (!x.target) return true; const e = w.enemies.list[x.target.slot]; return !(e && window.__skip.has(e.foe)); });
    const lock = w.words.lock;
    const word = lock >= 0 ? live.find((x) => x.slot === lock) : live[0];
    if (lock >= 0 && !word) d.send({ type: 'release' });
    else if (word) { for (const ch of word.text.slice(word.typed)) d.send({ type: 'key', letter: ch.charCodeAt(0) - 97 }); n += 1; }
    await new Promise((r) => setTimeout(r, 60));
  }
  return n;
})()`;

/**
 * One pass: a fresh run, the bot types everything up to wave 3, then leaves `want`
 * alone until each has wound up once and its picture is taken, by wave `last`.
 * `warden` puts a moss warden on Đường Cầu first (wolves only pounce, and warn,
 * over a blocker; a held G01 never plants its banner, so the two need separate passes).
 */
async function pass(page, out, want, warden, last) {
  await boot(page, "prelearn=0&speed=" + (warden ? 6 : 4), { width: W, height: H });
  if (warden) await page.eval("window.__dh.send({ type: 'place', item: 'moss-warden', slot: 'cau-b2' })");
  await press(page, "Enter");
  await waitFor(page, "s.phase === 'wave'", { timeoutMs: 15000 });
  // Waves 1–2: type everything. Close Thẻ Ôn when it opens.
  page.eval("window.__stopBot = false; window.__botRun = " + BOT([])).catch(() => {});
  for (let k = 0; k < 400; k += 1) {
    const s = await state(page);
    if (s.panel === "review") await press(page, "Escape");
    if (s.wave >= 3 && s.phase === "wave") break;
    await page.sleep(250);
  }
  await page.eval("window.__stopBot = true");
  await page.sleep(200);
  // Wave 3 on (grunts, wasps, archers wave 3, a boar wave 4, G01 wave 5, wolves wave 7): one picture per species.
  page.eval("window.__stopBot = false; window.__botRun = " + BOT(want)).catch(() => {});
  const seen = [];
  const pictured = new Set();
  let lastBanner = (await page.eval("window.__dh.events()")).tally.banner ?? 0;
  const counts = {};
  const t0 = Date.now();
  while (Date.now() - t0 < Number(process.env.LIMIT_S ?? 240) * 1000 && pictured.size < want.length) {
    const s = await state(page);
    if (s.panel === "review") await press(page, "Escape");
    if (s.phase === "victory" || s.phase === "defeat" || s.wave > last) break;
    const ev = await page.eval("window.__dh.events()");
    let fresh = null;
    for (const [foe, info] of Object.entries(ev.byFoe)) {
      if ((counts[foe] ?? 0) < info.n && !pictured.has(foe) && want.includes(foe)) fresh = foe;
      counts[foe] = info.n;
    }
    const banner = ev.tally.banner ?? 0;
    if (!fresh && banner > lastBanner && want.includes("moss-banner") && !pictured.has("moss-banner")) fresh = "moss-banner";
    lastBanner = banner;
    if (fresh) {
      // Slow the world while the picture is taken: a 0.5 s wind-up is still live.
      await page.eval("window.__dh.setSpeed(0.25)");
      await page.sleep(150);
      const after = await page.eval("window.__dh.events()");
      seen.push({ foe: fresh, live: after.telegraphsLive, wave: s.wave });
      await page.shot(join(out, `telegraph-${fresh}-${W}x${H}.png`));
      pictured.add(fresh);
      // Seen once: the bot types this species again, so the wave can end.
      await page.eval("window.__skip.delete(" + JSON.stringify(fresh) + "); window.__dh.setSpeed(2)");
    } else await page.sleep(40);
  }
  const ev = await page.eval("window.__dh.events()");
  return { ev, seen };
}

export default async function (page) {
  const out = outDir("integrator");
  const wolves = await pass(page, out, ["blight-wolf"], true, 7);
  // The bot loop ends before the page goes (a pending evaluate would fail on navigation).
  await page.eval("(async () => { window.__stopBot = true; await window.__botRun; })()").catch(() => {});
  const rest = await pass(page, out, ["moss-grunt", "thorn-wasp", "moss-archer", "tusk-boar", "moss-banner"], false, 5);
  // Thiên Hỏa: our own ring, pale orange, on the densest group in the word zone.
  await page.eval("window.__stopBot = true; window.__dh.setSpeed(1)");
  await waitFor(page, "s.phase === 'wave' && window.__dh.words().length >= 2", { timeoutMs: 40000 });
  if ((await state(page)).phase === "wave") {
    await press(page, "Digit2", MOD.alt);
    await page.sleep(250);
    await page.shot(join(out, `telegraph-skyfire-${W}x${H}.png`));
  }
  const ev = await page.eval("window.__dh.events()");
  const end = await state(page);
  const byFoe = { ...rest.ev.byFoe, "blight-wolf": wolves.ev.byFoe["blight-wolf"] ?? null };
  const mins = Object.values(byFoe).filter(Boolean).map((x) => x.minMs);
  return {
    enemyTelegraphs: (wolves.ev.tally["telegraph:enemy"] ?? 0) + (ev.tally["telegraph:enemy"] ?? 0),
    allyTelegraphs: ev.tally["telegraph:ally"] ?? 0,
    banners: ev.tally.banner ?? 0,
    shortestEnemyTelegraphMs: mins.length ? Math.min(...mins) : null,
    byFoe,
    seen: [...wolves.seen, ...rest.seen],
    end: { phase: end.phase, wave: end.wave, heroHp: end.heroHp },
    badResources: await badResources(page),
  };
}
