// dh-map-shots (map pilot, parent docs/tools/map-factory/MAP_PLAN.md §3, CL-06): the
// L2-cau diorama with the kit props on the view-only page, 3 tilts × 4 headings plus
// the map's default view, every picture at the window size given to cdp-run.
// Env: TAG (sub-folder), Q (quality), PITCHES, YAWS, ZOOM, DEFAULT=0 skips the
// default view, ONLY=default takes the default view only, EXTRA="warm=0" adds page-URL
// switches (view/paint.ts mapSwitch). Pictures in tmp/map-pilot/<TAG>/ (OUT_DIR overrides).
// Owner: map pilot (renamed from the spike's dh-mapspike).
import { join } from "node:path";
import { BASE, badResources, outDir } from "./lib/dh.mjs";

const Q = process.env.Q ?? "high";
const TAG = process.env.TAG ?? "now";
const PITCHES = (process.env.PITCHES ?? "40,55,75").split(",").map(Number);
const YAWS = (process.env.YAWS ?? "0,90,180,270").split(",").map(Number);
const ZOOM = Number(process.env.ZOOM ?? "1");
const ONLY_DEFAULT = process.env.ONLY === "default";
const EXTRA = process.env.EXTRA ? "&" + process.env.EXTRA : "";

export default async function (page) {
  if (!process.env.OUT_DIR) process.env.OUT_DIR = join("tmp/map-pilot", TAG);
  const out = outDir("map-pilot/" + TAG);
  const size = page.width + "x" + page.height;
  await page.goto(BASE + "/?view=terrain&hud=0&q=" + Q + EXTRA, { settle: 300 });
  let ready = false;
  for (let i = 0; i < 300 && !ready; i += 1) {
    ready = (await page.eval("window.__dhTerrain?.info().ready === true")) === true;
    if (!ready) await page.sleep(100);
  }
  await page.sleep(1500);
  const shots = [];
  if (!ONLY_DEFAULT) {
    for (const pitch of PITCHES) {
      for (const yaw of YAWS) {
        await page.eval(`window.__dhTerrain.setView({ yawDeg: ${yaw}, pitchDeg: ${pitch}, zoom: ${ZOOM}, targetX: 0, targetZ: 0 }, true)`);
        await page.sleep(400);
        shots.push(await page.shot(join(out, size + "-p" + pitch + "-y" + yaw + ".png")));
      }
    }
  }
  if (process.env.DEFAULT !== "0") {
    // The game's home view (map.camera: yaw 0, 55°, look 4 m north of the dais). Reset from
    // another view: pressed at the home view, the reset toggles to the 75° overview.
    await page.eval("window.__dhTerrain.setView({ yawDeg: 30, pitchDeg: 50, zoom: 1, targetX: 0, targetZ: 0 }, true)");
    await page.sleep(200);
    await page.eval("window.__dhTerrain.action('camera-reset')");
    await page.sleep(1600);
    shots.push(await page.shot(join(out, size + "-default.png")));
  }
  return { ready, shots, info: await page.eval("window.__dhTerrain.info()"), badResources: await badResources(page) };
}
