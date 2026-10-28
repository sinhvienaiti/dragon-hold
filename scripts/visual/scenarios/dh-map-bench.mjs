// dh-map-bench (map pilot, parent docs/tools/map-factory/MAP_PLAN.md §2.9 Q7, CL-06):
// dh-bench with extra page-URL switches for the perf split, e.g. EXTRA="decor=0&paint=m0b"
// (the bare ground) or EXTRA="bake=0" (read by view/paint.ts mapSwitch). Same env as dh-bench.
// Owner: map pilot (renamed from the spike's dh-mapspike-bench).
import bench from "./dh-bench.mjs";

export default async function (page) {
  const extra = process.env.EXTRA ?? "";
  const goto = page.goto.bind(page);
  page.goto = (url, options) => goto(url + (extra && url.includes("?") ? "&" + extra : ""), options);
  return bench(page);
}
