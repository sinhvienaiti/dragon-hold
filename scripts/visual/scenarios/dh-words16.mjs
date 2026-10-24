// dh-words16 (round 3, decision 8; 05 §10 dh-words: "16 chữ sống"): the M0 stage
// never holds that many words at once (bot report: at most 7 live words, 12 foes
// for the standard bot; the 00 §4.4 load caps bound the density), so the target
// is checked on a staged crowd. Foes are put straight into the word zone of both
// ground lanes and the sky lane through the sim (spawnFoe, up to the live cap),
// the world runs slowly until the letter budget is full (00 §5: N_max = min(16,
// A − 3) words), and the tags are measured as dh-words does: every live word on
// screen has its tag, tags never overlap, smallest word ≥ 16 px and meaning
// ≥ 13 px (05 §4), plus the tags' share of the screen (05 §10: ≤ 6 %).
// Sizes 1280×720 and 1920×1080 × tag size 100 % and 150 % (TAGS=100 or 150 for one).
// Not a replay check: the foes come from outside the command log.
// Pictures in tmp/shots/integrator/. Owner: integrator (LANES.md).
import { join } from "node:path";
import { badResources, boot, outDir, press, waitFor } from "./lib/dh.mjs";

const TAG_CHECK = `(() => {
  const d = window.__dh; const words = d.words();
  const tags = [...document.querySelectorAll('.dh-tag')].filter((t) => !t.classList.contains('is-done') && !t.classList.contains('is-fold') && t.style.display !== 'none' && !t.hidden && t.getBoundingClientRect().width > 0 && getComputedStyle(t).visibility !== 'hidden' && Number(getComputedStyle(t).opacity) > 0.5);
  const shown = tags.map((t) => t.dataset.word);
  const rects = tags.map((t) => { const b = t.querySelector('.dh-tag__body') ?? t; const r = b.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, word: t.dataset.word }; });
  let overlaps = 0; const pairs = [];
  for (let i = 0; i < rects.length; i += 1) for (let j = i + 1; j < rects.length; j += 1) {
    const a = rects[i], b = rects[j];
    if (a.x < b.x + b.w - 1 && a.x + a.w - 1 > b.x && a.y < b.y + b.h - 1 && a.y + a.h - 1 > b.y) { overlaps += 1; pairs.push(a.word + '/' + b.word); }
  }
  const fonts = tags.map((t) => parseFloat(getComputedStyle(t.querySelector('.dh-tag__word') ?? t).fontSize));
  const means = tags.map((t) => t.querySelector('.dh-tag__mean')).filter((m) => m && m.textContent).map((m) => parseFloat(getComputedStyle(m).fontSize));
  const onScreen = words.filter((w) => w.visible);
  const missing = onScreen.filter((w) => !shown.includes(w.text)).map((w) => w.text);
  const extra = shown.filter((text) => !words.some((w) => w.text === text));
  const area = rects.reduce((sum, r) => sum + r.w * r.h, 0) / (innerWidth * innerHeight);
  const w = d.world();
  return { live: words.length, foeWords: words.filter((x) => x.target).length, budget: w.words.ledger.budget.total, foes: w.enemies.live, onScreen: onScreen.length, tags: tags.length, missing, extra, overlaps, pairs: pairs.slice(0, 5), minFont: fonts.length ? Math.min(...fonts) : null, minMean: means.length ? Math.min(...means) : null, areaPct: Math.round(area * 1000) / 10 };
})()`;

/** Foes into the word zone: ground lanes 0, 1 at 55–90 % of their length, the sky lane at 70–90 %, spread across the path. */
const CROWD = `(async () => {
  const { spawnFoe } = await import('/src/sim/spawn.ts');
  const d = window.__dh; const w = d.world();
  const plan = [
    ['moss-grunt', 0, 0.90, -0.6], ['moss-archer', 0, 0.62, 0.5], ['moss-grunt', 0, 0.80, 0.4], ['blight-wolf', 0, 0.70, -0.3], ['moss-grunt', 0, 0.58, -0.5], ['tusk-boar', 0, 0.66, 0.2], ['moss-grunt', 0, 0.85, 0.0],
    ['moss-grunt', 1, 0.90, 0.5], ['moss-archer', 1, 0.60, -0.4], ['moss-grunt', 1, 0.78, -0.2], ['blight-wolf', 1, 0.70, 0.4], ['moss-grunt', 1, 0.56, 0.3], ['moss-grunt', 1, 0.84, -0.5],
    ['thorn-wasp', 2, 0.72, 0], ['thorn-wasp', 2, 0.84, 0.6], ['thorn-wasp', 2, 0.90, -0.6], ['thorn-wasp', 2, 0.78, 0.3],
  ];
  let made = 0;
  for (const [foe, lane, f, side] of plan) {
    const runtime = w.lanes[lane]; if (!runtime) continue;
    const enemy = spawnFoe(w, foe, lane, w.wave, { along: Math.round(runtime.length * f), lateral: Math.round(side * (runtime.halfWidth || 60000)) });
    if (enemy) made += 1;
  }
  return made;
})()`;

async function play(page, size, out, tagSize) {
  const [width, height] = size;
  await boot(page, "prelearn=0&tagsize=" + tagSize, { width, height });
  await press(page, "Enter");
  await waitFor(page, "s.phase === 'wave'", { timeoutMs: 20000 });
  await page.eval("window.__dh.setSpeed(0.25)");
  const spawned = await page.eval(CROWD);
  const checks = [];
  let best = null;
  const t0 = Date.now();
  while (Date.now() - t0 < 25_000) {
    const check = await page.eval(TAG_CHECK);
    checks.push(check);
    if (best === null || check.live > best.live) {
      best = check;
      await page.shot(join(out, `words16-${width}x${height}-tags${tagSize}.png`));
    }
    if (check.live >= check.budget) break;
    await page.sleep(400);
  }
  // A few more looks at the full scene.
  for (let k = 0; k < 4; k += 1) {
    await page.sleep(300);
    checks.push(await page.eval(TAG_CHECK));
  }
  const worst = checks.reduce((acc, c) => ({ overlaps: Math.max(acc.overlaps, c.overlaps), missing: acc.missing + c.missing.length, extra: acc.extra + c.extra.length, minFont: Math.min(acc.minFont, c.minFont ?? 99), minMean: Math.min(acc.minMean, c.minMean ?? 99), maxTags: Math.max(acc.maxTags, c.tags), maxLive: Math.max(acc.maxLive, c.live), maxArea: Math.max(acc.maxArea, c.areaPct) }), { overlaps: 0, missing: 0, extra: 0, minFont: 99, minMean: 99, maxTags: 0, maxLive: 0, maxArea: 0 });
  return { size: width + "x" + height, tagSize, spawned, budget: best?.budget ?? null, best: best && { live: best.live, foeWords: best.foeWords, foes: best.foes, tags: best.tags, overlaps: best.overlaps, missing: best.missing, minFont: best.minFont, minMean: best.minMean, areaPct: best.areaPct }, checks: checks.length, worst, lastPairs: checks.filter((c) => c.overlaps > 0).slice(-2).map((c) => c.pairs) };
}

export default async function (page) {
  const out = outDir("integrator");
  const runs = [];
  const tags = process.env.TAGS ? [Number(process.env.TAGS)] : [100, 150];
  for (const size of [[1280, 720], [1920, 1080]]) for (const tagSize of tags) runs.push(await play(page, size, out, tagSize));
  return { runs, badResources: await badResources(page) };
}
