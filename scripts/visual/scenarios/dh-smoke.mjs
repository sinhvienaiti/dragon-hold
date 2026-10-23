// Boot smoke: the game opens, the deck loads, the setup shows; one picture per size.
// Owner: integrator (LANES.md).
import { join } from "node:path";
import { badResources, boot, outDir, skipPrelearn, state } from "./lib/dh.mjs";

export default async function (page) {
  const out = outDir("integrator");
  const sizes = [[1280, 720], [1920, 1080]];
  const report = [];
  for (const [width, height] of sizes) {
    const first = await boot(page, "", { width, height });
    await page.shot(join(out, `smoke-prelearn-${width}x${height}.png`));
    await skipPrelearn(page);
    await page.sleep(500);
    await page.shot(join(out, `smoke-prep-${width}x${height}.png`));
    report.push({ width, height, first, after: await state(page), perf: await page.eval("window.__dh.perf()") });
  }
  return { report, badResources: await badResources(page) };
}
