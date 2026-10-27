// dh-mapspike-bench (map spike, docs/tools/MAP_FACTORY.md §4.2): dh-bench with
// extra page-URL switches for the perf split, e.g. EXTRA="paint=m0b" or
// EXTRA="decals=0&tiles=0" (read by view/paint.ts spikeSwitch). Same env as dh-bench.
// Owner: map spike (branch map-spike, never merged).
import bench from "./dh-bench.mjs";

export default async function (page) {
  const extra = process.env.EXTRA ?? "";
  const goto = page.goto.bind(page);
  page.goto = (url, options) => goto(url + (extra && url.includes("?") ? "&" + extra : ""), options);
  return bench(page);
}
