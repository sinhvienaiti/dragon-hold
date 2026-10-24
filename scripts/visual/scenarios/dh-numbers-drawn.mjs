// dh-numbers-drawn (review 2 minor 2): the damage-number fix measured on what
// is drawn, not on the box that does the spacing. dh-numbers and
// __dh.numbersTouching() test DrawnNumberField.box(), the same box spawn() and
// settle() push apart with, so a box too small would pass its own test. Here
// every frame is read from the quads NumberSprites uploaded and the ink in the
// glyph atlas (lib/dh.mjs INSTALL_INK_CHECK). Three results:
//   fixed:   storms on a crowd; ink of two numbers never overlaps;
//   cover:   how far each number's ink reaches outside its box() (what the fix rests on);
//   control: the same storms with the kit's box() put back on this field
//            (NumberField.prototype.box): ink must overlap, so the check can see the old bug.
// Storms: BURSTS (default 10) × HITS (12) T4–T5 presentation hits on FOES (12) live
// foes, GAP_MS (200, > the 0.15 s merge window) apart, so numbers also stack.
// `outsideByGlyph` names the glyph whose ink leaves the box; `atlasRows` gives
// each atlas cell's ink rows (a cell whose ink reaches row 64 carries ink that
// is not its glyph's: the label row's accents reach up into the digit row).
// World stepped in the page to the crowd (no typing); works at any frame rate.
// SIZE=1920 runs at 1920×1080 (default 1280×720). Owner: integrator (LANES.md).
import { join } from "node:path";
import { INSTALL_INK_CHECK, badResources, boot, outDir, press, waitFor } from "./lib/dh.mjs";

const [W, H] = process.env.SIZE === "1920" ? [1920, 1080] : [1280, 720];
const BURSTS = Number(process.env.BURSTS ?? "10");
const HITS = Number(process.env.HITS ?? "12");
const FOES = Number(process.env.FOES ?? "12");
const GAP_MS = Number(process.env.GAP_MS ?? "200");

/** Ink rows of every glyph cell in the number atlas (0–64), and of the label row: where each glyph's ink starts and ends. */
const ATLAS_ROWS = `(() => {
  const canvas = window.__dh.numberLayer().sprites.mesh.material.uniforms.uAtlas.value.image;
  const px = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
  const rows = (x0, x1, y0, y1) => { let a = Infinity; let b = -Infinity; for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) if (px[(y * canvas.width + x) * 4 + 3] >= 26) { a = Math.min(a, y); b = Math.max(b, y); } return a === Infinity ? null : (a - y0) + '–' + (b + 1 - y0); };
  const out = {};
  [...'0123456789×'].forEach((g, i) => { out[g] = rows(i * 48, (i + 1) * 48, 0, 64); });
  out.label = rows(0, canvas.width, 64, 128);
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
  // Let every number fade, then put the kit's box() back on this field.
  await waitFor(page, "window.__dh.numberLayer().numbers.live === 0", { timeoutMs: 15000 });
  const patched = await page.eval(`(() => {
    const field = window.__dh.numberLayer().numbers;
    const own = Object.getPrototypeOf(field);
    const kit = Object.getPrototypeOf(own).box;
    if (kit === own.box) return false;
    field.box = function (i, out, x, y) { return kit.call(this, i, out, x, y); };
    return own.constructor.name + ' -> ' + Object.getPrototypeOf(own).constructor.name;
  })()`);
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
