// dh-mapspike (map spike, docs/tools/MAP_FACTORY.md §6.2): the L2-cau diorama with
// the kit props on the view-only page, 3 tilts × 4 headings plus the map's
// default view, every picture at the window size given to cdp-run.
// Env: TAG (sub-folder), Q (quality), PITCHES, YAWS, ZOOM, DEFAULT=0 skips the
// default view, ONLY=default takes the default view only. Pictures in tmp/shots/mapspike/<TAG>/.
// Owner: map spike (branch map-spike, never merged).
import { join } from "node:path";
import { BASE, badResources, outDir } from "./lib/dh.mjs";

const Q = process.env.Q ?? "high";
const TAG = process.env.TAG ?? "now";
const PITCHES = (process.env.PITCHES ?? "40,55,75").split(",").map(Number);
const YAWS = (process.env.YAWS ?? "0,90,180,270").split(",").map(Number);
const ZOOM = Number(process.env.ZOOM ?? "1");
const ONLY_DEFAULT = process.env.ONLY === "default";

export default async function (page) {
  const out = outDir("mapspike/" + TAG);
  const size = page.width + "x" + page.height;
  await page.goto(BASE + "/?view=terrain&hud=0&q=" + Q, { settle: 300 });
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
    // The game's home view (map.camera: yaw 0, 55°, look 4 m north of the dais).
    await page.eval("window.__dhTerrain.action('camera-reset')");
    await page.sleep(1600);
    shots.push(await page.shot(join(out, size + "-default.png")));
  }
  return { ready, shots, info: await page.eval("window.__dhTerrain.info()"), badResources: await badResources(page) };
}
