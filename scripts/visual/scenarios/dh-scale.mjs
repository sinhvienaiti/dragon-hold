// dh-scale (05 §2.3, round 2 readability): drawn size of every foe at the
// default camera, 1920×1080, in CSS px, grouped by species, against the
// round 2 targets: small foes ≥ 40 px, medium a step up, generals ≥ 60 px,
// swarm clusters drawn as a cluster (ring diameter); SIZE=1280 measures
// 1280×720 against the same bands × 720/1080. Size = the larger of
// the drawn height (feet to head) and the drawn length
// along the walk (the view's own drawn size, view/foe-look.ts, projected).
// A bot types every word up to wave FROM (default 4), then only foes within
// NEAR m of the dais (calling breaks early), so the others walk the whole
// field and the later waves bring every species (wolves, the general).
// Owner: integrator (LANES.md); sizes and bands: view lane (round 2).
import { join } from "node:path";
import { boot, outDir, press, waitFor } from "./lib/dh.mjs";

// Round 2 bands at 1080p (px). Small ≥ 40 (the target), medium and generals larger, a swarm body ≥ 18 with its cluster ring ≥ 50.
const BANDS = {
  "moss-grunt": [40, 60], "moss-archer": [40, 62], "blight-wolf": [40, 62], "thorn-wasp": [36, 60], "tusk-boar": [46, 76], "moss-banner": [60, 100], "thorn-ant": [18, 40],
};
const RING_MIN_PX = 50;

const SIZES = `(async () => {
  const m = await import('/src/view/foe-look.ts');
  const d = window.__dh;
  const world = d.world();
  const out = [];
  const clusters = new Map();
  for (const f of d.foes()) {
    const look = m.foeDrawLook(f.foe);
    const [, h, l] = m.foeDrawnSize(f.foe);
    const dist = Math.hypot(f.x, f.z) || 1;
    const fx = -f.x / dist, fz = -f.z / dist;
    const y = look.placeholder.hoverM + h / 2;
    const a = d.project(f.x + fx * l / 2, y, f.z + fz * l / 2);
    const b = d.project(f.x - fx * l / 2, y, f.z - fz * l / 2);
    if (!a.visible || !b.visible) continue;
    const longPx = Math.hypot(a.x - b.x, a.y - b.y);
    const base = d.project(f.x, look.placeholder.hoverM + 0.3, f.z);
    const top = d.project(f.x, look.placeholder.hoverM + h + 0.3, f.z);
    const tallPx = Math.abs(base.y - top.y);
    out.push({ foe: f.foe, tier: look.tier, px: Math.max(tallPx, longPx), tallPx, longPx, distM: dist });
    const e = world.enemies.list[f.slot];
    if (e && e.cluster >= 0 && look.gait === 'swarm') {
      const c = clusters.get(e.cluster) ?? { n: 0, x: 0, z: 0, body: Math.max(...m.foeDrawnSize(f.foe)) / 2 };
      c.n += 1; c.x += f.x; c.z += f.z; clusters.set(e.cluster, c);
    }
  }
  const rings = [];
  const off = [0, 0];
  for (const c of clusters.values()) {
    if (c.n < 2) continue;
    let far = 0;
    for (let k = 0; k < c.n; k += 1) { m.swarmOffset(k, off); far = Math.max(far, Math.hypot(off[0], off[1])); }
    const r = far + c.body + 0.35;
    const cx = c.x / c.n, cz = c.z / c.n;
    const p = d.project(cx - r, 0.3, cz), q = d.project(cx + r, 0.3, cz);
    if (p.visible && q.visible) rings.push({ members: c.n, ringPx: Math.abs(q.x - p.x) });
  }
  return { out, rings };
})()`;

const BOT = (near, from) => `(async () => {
  const d = window.__dh; window.__stopBot = false;
  for (let k = 0; k < 100000 && !window.__stopBot; k += 1) {
    const w = d.world();
    if (w.phase === 'victory' || w.phase === 'defeat') break;
    if (w.phase === 'break' && w.phaseEndsAt > 0 && !d.panel()) d.send({ type: 'call-early' });
    if (d.panel() === 'review') d.action('escape');
    const ws = d.words();
    const dist = (x) => { if (!x.target) return 0; const e = w.enemies.list[x.target.slot]; return e && e.alive ? Math.hypot(e.x, e.z) / 60000 : 1e9; };
    const lock = w.words.lock;
    let word = lock >= 0 ? ws.find((x) => x.slot === lock) : null;
    const reach = w.wave < ${from} ? 1e8 : ${near};
    if (!word) word = ws.filter((x) => dist(x) < reach).sort((a, b) => dist(a) - dist(b))[0] ?? null;
    if (lock >= 0 && !word) d.send({ type: 'release' });
    else if (word) for (const ch of word.text.slice(word.typed)) d.send({ type: 'key', letter: ch.charCodeAt(0) - 97 });
    await new Promise((r) => setTimeout(r, 120));
  }
})()`;

const [W, H] = process.env.SIZE === "1280" ? [1280, 720] : [1920, 1080];
const K = H / 1080;

export default async function (page) {
  const out = outDir("integrator");
  await boot(page, "prelearn=0&speed=" + (process.env.SPEED ?? "3"), { width: W, height: H });
  await press(page, "Enter");
  await waitFor(page, "s.phase === 'wave'", { timeoutMs: 20000 });
  page.eval(BOT(Number(process.env.NEAR ?? "13"), Number(process.env.FROM ?? "4"))).catch(() => {});
  const samples = [];
  const rings = [];
  const shot = new Set();
  const t0 = Date.now();
  while (Date.now() - t0 < Number(process.env.SECONDS ?? "300") * 1000) {
    await page.sleep(900);
    const s = await page.eval("window.__dh.state()");
    if (s.panel === "review") await press(page, "Escape");
    if (s.phase === "victory" || s.phase === "defeat") break;
    const got = await page.eval(SIZES);
    samples.push(...got.out);
    rings.push(...got.rings);
    // One picture per species the first time it walks the field (8–22 m out).
    const fresh = got.out.find((x) => !shot.has(x.foe) && x.distM >= 8 && x.distM <= 22);
    if (fresh) {
      shot.add(fresh.foe);
      await page.shot(join(out, "scale-" + fresh.foe + `-${W}x${H}.png`));
    }
    if (Object.keys(BANDS).every((foe) => shot.has(foe))) break;
  }
  await page.eval("window.__stopBot = true");
  const by = {};
  for (const s of samples) (by[s.foe] ??= []).push(s);
  const median = (arr) => (arr.length ? arr[Math.floor(arr.length / 2)] : null);
  const report = {};
  for (const [foe, list] of Object.entries(by)) {
    const near = list.filter((s) => s.distM >= 8 && s.distM <= 22).map((s) => s.px).sort((a, b) => a - b);
    const all = list.map((s) => s.px).sort((a, b) => a - b);
    const m = median(near) ?? median(all);
    const band = BANDS[foe]?.map((px) => Math.round(px * K));
    report[foe] = {
      samples: list.length,
      medianPx: m && Math.round(m),
      min: Math.round(all[0]),
      max: Math.round(all[all.length - 1]),
      tallPx: Math.round(median(list.map((s) => s.tallPx).sort((a, b) => a - b)) ?? 0),
      longPx: Math.round(median(list.map((s) => s.longPx).sort((a, b) => a - b)) ?? 0),
      band,
      ok: band && m ? m >= band[0] && m <= band[1] * 1.2 : null,
    };
  }
  const ringPx = rings.map((r) => r.ringPx).sort((a, b) => a - b);
  return {
    report,
    size: W + "x" + H,
    clusters: { samples: rings.length, medianRingPx: Math.round(median(ringPx) ?? 0), minRingPx: Math.round(ringPx[0] ?? 0), ok: rings.length === 0 ? null : (median(ringPx) ?? 0) >= RING_MIN_PX * K },
    unseen: Object.keys(BANDS).filter((foe) => !by[foe]),
  };
}
