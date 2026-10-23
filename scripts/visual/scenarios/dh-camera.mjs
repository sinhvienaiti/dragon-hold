// dh-camera (05 §10): the L2-cau diorama from 3 tilts × 4 headings on the
// view-only page (?view=terrain&hud=0), no world edge in sight, no load
// errors. Adapted from view-terrain's tmp/view-terrain/dh-terrain-shots.mjs.
// Env: Q (quality), PITCHES, YAWS, ZOOM. Pictures in tmp/shots/integrator/camera/.
// Owner: integrator (LANES.md).
import { join } from "node:path";
import { BASE, badResources, outDir } from "./lib/dh.mjs";

const Q = process.env.Q ?? "high";
const PITCHES = (process.env.PITCHES ?? "40,55,75").split(",").map(Number);
const YAWS = (process.env.YAWS ?? "0,90,180,270").split(",").map(Number);
const ZOOM = Number(process.env.ZOOM ?? "1");

export default async function (page) {
  const out = outDir("integrator/camera");
  await page.goto(BASE + "/?view=terrain&hud=0&q=" + Q, { settle: 300 });
  for (let i = 0; i < 100; i += 1) {
    if ((await page.eval("window.__dhTerrain?.info().ready === true")) === true) break;
    await page.sleep(100);
  }
  await page.sleep(1500);
  const shots = [];
  for (const pitch of PITCHES) {
    for (const yaw of YAWS) {
      await page.eval(`window.__dhTerrain.setView({ yawDeg: ${yaw}, pitchDeg: ${pitch}, zoom: ${ZOOM}, targetX: 0, targetZ: 0 }, true)`);
      await page.sleep(350);
      shots.push(await page.shot(join(out, Q + "-p" + pitch + "-y" + yaw + (ZOOM !== 1 ? "-z" + ZOOM : "") + ".jpg")));
    }
  }
  await page.eval("window.__dhTerrain.setView({ yawDeg: 0, pitchDeg: 55, zoom: 1 }, true)");
  await page.sleep(1200);
  return { shots, info: await page.eval("window.__dhTerrain.info()"), badResources: await badResources(page) };
}
