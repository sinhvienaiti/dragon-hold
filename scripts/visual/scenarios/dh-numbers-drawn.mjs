// dh-numbers-drawn (review 2 minor 2): the damage-number fix measured on what
// is drawn, not on the box that does the spacing. dh-numbers and
// __dh.numbersTouching() test the kit's NumberField.box(), the same box spawn()
// and settle() push apart with, so a box too small would pass its own test. Here
// every frame is read from the quads NumberSprites uploaded and the ink in the
// glyph atlas (lib/dh.mjs INSTALL_INK_CHECK). Three results:
//   fixed:   storms on a crowd; ink of two numbers never overlaps;
//   cover:   how far each number's ink reaches outside its box() (what the fix rests on);
//   control: the same storms with the box from before the fix put back on this
//            field (OLD_BOX: digits' advances, one font size tall; round 3 kit
//            drift, fixed in shared/game-kit on 25/10): ink must overlap, so the
//            check can see the old bug.
// Storms: BURSTS (default 10) × HITS (12) T4–T5 presentation hits on FOES (12) live
// foes, GAP_MS (200, > the 0.15 s merge window) apart, so numbers also stack.
// `outsideByGlyph` names the glyph whose ink leaves the box; `atlasRows` gives
// each atlas cell's ink rows and its blank columns left|right (round 3: the
// kit's cells are as wide as the widest glyph's ink, so a cell with ink in its
// edge column carries a neighbour's ink; before, 48 px cells did, and the
// label row's accents reached row 61–63 of the digit row, cell "3"), the
// label row's ink rows, and any ink between the two rows (`gap`, must be null).
// World stepped in the page to the crowd (no typing); works at any frame rate.
// SIZE=1920 runs at 1920×1080 (default 1280×720). Owner: integrator (LANES.md).
import { join } from "node:path";
import { INSTALL_INK_CHECK, badResources, boot, outDir, press, waitFor } from "./lib/dh.mjs";

const [W, H] = process.env.SIZE === "1920" ? [1920, 1080] : [1280, 720];
const BURSTS = Number(process.env.BURSTS ?? "10");
const HITS = Number(process.env.HITS ?? "12");
const FOES = Number(process.env.FOES ?? "12");
const GAP_MS = Number(process.env.GAP_MS ?? "200");

/** Ink of every glyph cell in the number atlas (rows; blank columns left|right), of the label row, and between the rows. */
const ATLAS_ROWS = `(async () => {
  const { NUMBER_ATLAS: A } = await import('/src/kit/feedback/index.ts');
  const sprites = window.__dh.numberLayer().sprites;
  const canvas = sprites.mesh.material.uniforms.uAtlas.value.image;
  const px = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
  const ink = (x0, x1, y0, y1) => { let a = Infinity; let b = -Infinity; let c = Infinity; let e = -Infinity; for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) if (px[(y * canvas.width + x) * 4 + 3] >= 26) { a = Math.min(a, y); b = Math.max(b, y); c = Math.min(c, x); e = Math.max(e, x); } return a === Infinity ? null : { rows: (a - y0) + '–' + (b + 1 - y0), left: c - x0, right: x1 - (e + 1) }; };
  const cell = sprites.cellWidth;
  const out = { cell };
  [...A.glyphs].forEach((g, i) => { const k = ink(i * cell, (i + 1) * cell, 0, A.cellH); out[g] = k ? k.rows + ' (' + k.left + '|' + k.right + ')' : null; });
  const label = ink(0, canvas.width, A.labelTop, A.labelTop + A.labelRowH);
  out.label = label ? label.rows : null;
  const gap = ink(0, canvas.width, A.cellH, A.labelTop);
  out.gap = gap ? gap.rows : null;
  out.edgeInk = [...A.glyphs].filter((g, i) => { const k = ink(i * cell, (i + 1) * cell, 0, A.cellH); return k !== null && (k.left === 0 || k.right === 0); });
  return out;
})()`;

const WALK_IN = (n) => `(async () => {
  const d = window.__dh; const { step } = await import('/src/sim/world.ts');
  const w = d.world();
  for (let k = 0; k < 60 * 60; k += 1) {
    if (d.foes().filter((f) => f.visible).length >= ${n}) break;
    step(w);
  }
  return d.foes().filter((f) => f.visible).length;
})()`;

/**
 * The kit's box() before 25/10 (digits' advances, one font size tall, a
 * perfect number 1.42 with the label above), set on the field instance so
 * spawn(), settle() and update() space numbers with it.
 */
const OLD_BOX = `(async () => {
  const { popScale } = await import('/src/kit/feedback/index.ts');
  const field = window.__dh.numberLayer().numbers;
  field.box = function (i, out, x = this.x[i], y = this.y[i]) {
    const px = this.fontPx * this.size[i] * popScale(this.tier[i], this.pop[i], this.profile.tiers);
    const perfect = this.style[i] === 2;
    out.w = this.text(i).length * 0.58 * px;
    out.h = px * (perfect ? 1.42 : 1);
    out.x = x - out.w / 2;
    out.y = y - px / 2 - (perfect ? 0.42 * px : 0);
    return out;
  };
  return 'old digits-only box on ' + field.constructor.name;
})()`;

const frames = (page, n = 1) => page.eval(`new Promise((done) => { let k = 0; const f = () => (++k >= ${n} ? done(k) : requestAnimationFrame(f)); requestAnimationFrame(f); })`);

async function storms(page, out, label) {
  const agg = { frames: 0, numbersMax: 0, perfectMax: 0, framesTouching: 0, pairsTouching: 0, inkPairsOverlap: 0, minGapPx: null, boxTouchingMax: 0, outsideBoxMax: 0, outsidePx: { left: 0, right: 0, top: 0, bottom: 0 }, outsideByGlyph: {}, inconsistent: 0, dropped: 0, examples: [], shots: [] };
  const dropped0 = await page.eval("window.__dh.numberLayer().numbers.dropped");
  for (let burst = 0; burst < BURSTS; burst += 1) {
    await page.eval(`window.__dh.fxStorm(${HITS})`);
    for (let f = 0; f < 3; f += 1) {
      await frames(page, 1);
      const r = await page.eval("window.__dhInk()");
      const boxTouching = await page.eval("window.__dh.numbersTouching()");
      agg.frames += 1;
      agg.numbersMax = Math.max(agg.numbersMax, r.numbers);
      agg.perfectMax = Math.max(agg.perfectMax, r.perfect);
      agg.boxTouchingMax = Math.max(agg.boxTouchingMax, boxTouching);
      if (!r.consistent) agg.inconsistent += 1;
      if (r.pairsTouching > 0) agg.framesTouching += 1;
      agg.pairsTouching += r.pairsTouching;
      agg.inkPairsOverlap += r.inkPairsOverlap;
      if (r.minGapPx !== null) agg.minGapPx = agg.minGapPx === null ? r.minGapPx : Math.min(agg.minGapPx, r.minGapPx);
      agg.outsideBoxMax = Math.max(agg.outsideBoxMax, r.outsideBox);
      for (const side of ["left", "right", "top", "bottom"]) agg.outsidePx[side] = Math.max(agg.outsidePx[side], r.outsidePx[side]);
      for (const [glyph, px] of Object.entries(r.outsideByGlyph)) agg.outsideByGlyph[glyph] = Math.max(agg.outsideByGlyph[glyph] ?? 0, px);
      for (const e of r.examples) if (agg.examples.length < 6) agg.examples.push(e);
      // Pictures of the densest frames: full view and the numbers' area at 2×.
      if (f === 0 && (burst === 4 || burst === BURSTS - 1) && r.bounds) {
        const full = join(out, `drawn-${label}-${burst}-${W}x${H}.png`);
        await page.shot(full);
        const pad = 24;
        const x = Math.max(0, r.bounds.x - pad);
        const y = Math.max(0, r.bounds.y - pad);
        const clip = { x, y, width: Math.min(W - x, r.bounds.w + pad * 2), height: Math.min(H - y, r.bounds.h + pad * 2), scale: 2 };
        const crop = join(out, `drawn-${label}-${burst}-crop-${W}x${H}.png`);
        await page.shot(crop, { clip });
        agg.shots.push(full, crop);
      }
    }
    await page.sleep(GAP_MS);
  }
  agg.dropped = (await page.eval("window.__dh.numberLayer().numbers.dropped")) - dropped0;
  return agg;
}

export default async function (page) {
  const out = outDir("numbers");
  await boot(page, "prelearn=0", { width: W, height: H });
  await press(page, "Enter");
  await waitFor(page, "s.phase === 'wave'", { timeoutMs: 60000 });
  const foes = await page.eval(WALK_IN(FOES));
  // The world nearly still (presentation runs on): numbers anchor where the foes stand.
  await page.eval("window.__dh.setSpeed(0.25)");
  await page.eval(INSTALL_INK_CHECK);

  const fixed = await storms(page, out, "fixed");
  // Let every number fade, then put the old box on this field.
  await waitFor(page, "window.__dh.numberLayer().numbers.live === 0", { timeoutMs: 15000 });
  const patched = await page.eval(OLD_BOX);
  const control = await storms(page, out, "control");
  await page.eval("delete window.__dh.numberLayer().numbers.box");
  await waitFor(page, "window.__dh.numberLayer().numbers.live === 0", { timeoutMs: 15000 });

  const atlasRows = await page.eval(ATLAS_ROWS);
  const ok =
    fixed.frames > 0 &&
    fixed.numbersMax >= 6 &&
    fixed.perfectMax >= 2 &&
    fixed.inconsistent === 0 &&
    fixed.pairsTouching === 0 &&
    fixed.boxTouchingMax === 0 &&
    typeof patched === "string" &&
    control.pairsTouching > 0 &&
    page.exceptions.length === 0;
  return {
    ok,
    size: W + "x" + H,
    foesOnScreen: foes,
    storms: { bursts: BURSTS, hits: HITS, gapMs: GAP_MS },
    atlasRows,
    fixed,
    control: { patched, ...control },
    replay: await page.eval("window.__dh.replayCheck()"),
    badResources: await badResources(page),
  };
}
