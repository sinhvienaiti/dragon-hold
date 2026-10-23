// dh-scale (05 §2.3): drawn height of every foe at the default camera,
// 1920×1080, base to top in CSS px, grouped by species; flags species whose
// median is more than 20 % off its band. No typing: foes walk in for a while.
// Owner: integrator (LANES.md).
import { join } from "node:path";
import { boot, outDir, press, waitFor } from "./lib/dh.mjs";

// 05 §2.3 bands at 1080p (px): swarm ≥ 26, normal 32–44, big 46–60, general ≥ 60.
const BANDS = {
  "thorn-ant": [26, 40], "moss-grunt": [32, 44], "moss-archer": [32, 44], "blight-wolf": [32, 44], "thorn-wasp": [32, 44], "tusk-boar": [46, 60], "moss-banner": [60, 90],
};

const CRAWLERS = new Set(["thorn-ant"]);

export default async function (page) {
  const out = outDir("integrator");
  await boot(page, "prelearn=0&speed=" + (process.env.SPEED ?? "3"), { width: 1920, height: 1080 });
  await press(page, "Enter");
  await waitFor(page, "s.phase === 'wave'", { timeoutMs: 20000 });
  const samples = [];
  for (let k = 0; k < Number(process.env.SAMPLES ?? 14); k += 1) {
    await page.sleep(1000);
    samples.push(...(await page.eval("window.__dh.foeSizes()")));
    if (k === 6) await page.shot(join(out, "scale-1920x1080.png"));
  }
  const by = {};
  for (const s of samples) (by[s.foe] ??= []).push(s);
  const report = {};
  for (const [foe, list] of Object.entries(by)) {
    const near = list.filter((s) => s.distM >= 8 && s.distM <= 22).map((s) => s.px).sort((a, b) => a - b);
    const all = list.map((s) => s.px).sort((a, b) => a - b);
    const median = (arr) => (arr.length ? arr[Math.floor(arr.length / 2)] : null);
    const m = median(near) ?? median(all);
    const band = BANDS[foe];
    const widthPx = median(list.map((s) => s.widthPx).sort((a, b) => a - b));
    // A crawling swarm lies flat: its drawn size is its length, not its height.
    const size = CRAWLERS.has(foe) ? Math.max(m ?? 0, widthPx ?? 0) : m;
    report[foe] = { samples: list.length, medianPx: m && Math.round(m), min: Math.round(all[0]), max: Math.round(all[all.length - 1]), widthPx: Math.round(widthPx), band, ok: band && size ? size >= band[0] * 0.8 && size <= band[1] * 1.2 : null };
  }
  return report;
}
