// Crowd bench scenario (DESIGN.md §9 M0, first task of view-crowd-fx): opens
// /?bench=crowd, waits for window.__dhBench (src/view/bench.ts) and prints it.
//   URL=http://127.0.0.1:3005/ node scripts/visual/cdp-run.mjs scripts/visual/scenarios/dh-bench.mjs
// Q=low|medium|high|ultra, COUNT=220. Shots go to tmp/shots/view-crowd-fx/.
// Owner: view-crowd-fx (LANES.md). Stub: the bench page is TODO.
export default async function (page) {
  const base = (process.env.URL ?? "http://127.0.0.1:3005/").replace(/\/$/, "");
  const quality = process.env.Q ?? "high";
  const count = Number(process.env.COUNT ?? "220");
  await page.goto(base + "/?bench=crowd&q=" + quality + "&count=" + count, { settle: 1000 });
  // TODO(view-crowd-fx): poll window.__dhBench, take shots, write the JSON report.
  return { todo: "dh-bench: bench page not built yet", quality, count };
}
