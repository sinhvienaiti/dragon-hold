// dh-foe-contrast (map pilot A3, FB-17 / AFTER A1): do foes still read against the ground
// under the low sun, the mist and the olive meadow? Plays from wave 1 (speed 2, nobody
// types: foes walk to the dais), and every 1.5 s takes a picture and, for each live foe on
// screen 6 m or more from the dais, compares its body box (centred 0.8 m up, a share of
// its drawn size) with the ring of ground round it: luma difference |ΔL| and RGB distance
// (both 0–1, sRGB). Prints per-species medians, the 10th percentile and the share of weak
// foes (|ΔL| < 0.06 and RGB distance < 0.1). Needs ImageMagick (`magick`).
// Env: URL, SIZE=1920 (default 1280×720), SECONDS (default 90), OUT_DIR.
// Owner: map pilot.
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { boot, outDir, press, waitFor } from "./lib/dh.mjs";

const W = process.env.SIZE === "1920" ? 1920 : 1280;
const H = W === 1920 ? 1080 : 720;

const median = (list) => (list.length ? [...list].sort((a, b) => a - b)[Math.floor(list.length / 2)] : null);
const p10 = (list) => (list.length ? [...list].sort((a, b) => a - b)[Math.floor(list.length / 10)] : null);

function means(file, boxes) {
  const args = [file, "-write", "mpr:g", "+delete"];
  for (const [x, y, w, h] of boxes) args.push("(", "mpr:g", "-crop", `${w}x${h}+${x}+${y}`, "+repage", ")");
  args.push("-format", "%[fx:mean.r] %[fx:mean.g] %[fx:mean.b]\n", "info:");
  return execFileSync("magick", args, { encoding: "utf8" }).trim().split("\n").map((line) => line.split(" ").map(Number));
}

export default async function (page) {
  const out = outDir("map-pilot-r2/contrast");
  await boot(page, "prelearn=0&speed=2", { width: W, height: H });
  await press(page, "Enter");
  await waitFor(page, "s.phase === 'wave'", { timeoutMs: 20000 });
  const samples = [];
  const t0 = Date.now();
  let index = 0;
  while (Date.now() - t0 < Number(process.env.SECONDS ?? "90") * 1000) {
    await page.sleep(1500);
    const s = await page.eval("window.__dh.state()");
    if (s.panel === "review") await press(page, "Escape");
    if (s.phase === "victory" || s.phase === "defeat") break;
    const foes = (await page.eval("window.__dh.foes()")).filter((f) => f.visible && Math.hypot(f.x, f.z) >= 6);
    const sizes = await page.eval("window.__dh.foeSizes()");
    if (foes.length === 0 || sizes.length === 0) continue;
    const px = median(sizes.map((x) => x.px));
    const wpx = median(sizes.map((x) => x.widthPx));
    const file = join(out, `${W}x${H}-${String(index++).padStart(2, "0")}.png`);
    await page.shot(file);
    const hb = Math.max(4, Math.min(30, Math.round(px * 0.3)));
    const wb = Math.max(4, Math.min(30, Math.round(wpx * 0.3)));
    const boxes = [];
    const kept = [];
    for (const f of foes) {
      const x = Math.round(f.sx);
      const y = Math.round(f.sy);
      const R = 2.4;
      const bx = [x - wb, y - hb, 2 * wb, 2 * hb];
      const big = [Math.round(x - wb * R), Math.round(y - hb * R), Math.round(2 * wb * R), Math.round(2 * hb * R)];
      if (big[0] < 0 || big[1] < 0 || big[0] + big[2] > W || big[1] + big[3] > H) continue;
      boxes.push(bx, big);
      kept.push({ f, area: [bx[2] * bx[3], big[2] * big[3]] });
    }
    if (boxes.length === 0) continue;
    const m = means(file, boxes);
    kept.forEach(({ f, area }, k) => {
      const body = m[2 * k];
      const all = m[2 * k + 1];
      const ring = all.map((v, c) => (v * area[1] - body[c] * area[0]) / (area[1] - area[0]));
      const luma = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
      const dL = Math.abs(luma(body) - luma(ring));
      const dRgb = Math.hypot(body[0] - ring[0], body[1] - ring[1], body[2] - ring[2]);
      samples.push({ foe: f.foe, distM: Math.hypot(f.x, f.z), dL, dRgb });
    });
  }
  const bySpecies = {};
  for (const sample of samples) (bySpecies[sample.foe] ??= []).push(sample);
  const summary = (list) => ({
    n: list.length,
    dLMedian: +median(list.map((x) => x.dL)).toFixed(3),
    dLP10: +p10(list.map((x) => x.dL)).toFixed(3),
    dRgbMedian: +median(list.map((x) => x.dRgb)).toFixed(3),
    weakShare: +(list.filter((x) => x.dL < 0.06 && x.dRgb < 0.1).length / list.length).toFixed(3),
  });
  return {
    size: W + "x" + H,
    shots: index,
    all: samples.length ? summary(samples) : null,
    species: Object.fromEntries(Object.entries(bySpecies).map(([foe, list]) => [foe, summary(list)])),
  };
}
