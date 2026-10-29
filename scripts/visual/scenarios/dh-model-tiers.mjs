// dh-model-tiers (model tiers lane, 29/10): close crops for the plastic-look check of
// parent docs/games/MODEL_QUALITY.md §2b, through the model studio (view/studio.ts,
// `?bench=models`): Moss Grunt, Blight Wolf and Thorn Ant (idle, turned 3/4), a tall
// pine, a round pine and a bush pair where the map's layout stands them, and the
// studio row at the game's default camera, all at quality Q (default high).
// Frames OUT_DIR/<TAG>-<Q>-<name>.png (TAG default "after"; run the old build with
// TAG=before), so a sheet can put the same frame side by side. Needs the studio's
// lookAt (added with the tiers; patch it into an old checkout for the "before" run).
//   URL=http://127.0.0.1:4163/ Q=ultra node scripts/visual/cdp-run.mjs scripts/visual/scenarios/dh-model-tiers.mjs --width=1920 --height=1080
// Owner: view (model tiers lane).
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

const ACTORS = [
  ["grunt", "enemies/moss-grunt", [-6, -8]],
  ["wolf", "enemies/blight-wolf", [0, -8]],
  ["ant", "enemies/thorn-ant", [4.5, -8]],
];
/** Layout props of L2-cau (view/layout.ts, seed of the map): x, z, target height, distance, yaw, pitch. */
const PROPS = [
  ["pine-tall", -19.86, 14.96, 4.2, 15, 200, 10],
  ["pine-round", -6.45, -19.32, 3.6, 13, 20, 12],
  ["bush", 16.6, -11.4, 0.6, 5.5, 20, 22],
];

export default async function (page) {
  const base = (process.env.URL ?? "http://127.0.0.1:4163/").replace(/\/$/, "");
  const out = resolve(process.env.OUT_DIR ?? "tmp/model-tiers/frames");
  const tag = process.env.TAG ?? "after";
  const quality = process.env.Q ?? "high";
  mkdirSync(out, { recursive: true });
  await page.goto(base + "/?bench=models", { settle: 400 });
  const info = await page.eval(
    "(async () => { const m = await import('/src/view/studio.ts'); const host = document.createElement('div'); host.style.cssText = 'position:fixed;inset:0'; document.body.append(host);" +
      " const h = await m.runModelStudio(host, " +
      JSON.stringify({ quality, content: ACTORS.map((entry) => entry[1]), positions: ACTORS.map((entry) => entry[2]) }) +
      "); return { loaded: h.loaded.length, missing: h.missing, actors: h.actors, lookAt: typeof h.lookAt === 'function' }; })()",
  );
  if (!info || info.evalError || !info.lookAt) return { error: "studio did not start, or has no lookAt", info };
  // Props swap in after the models settle (scatter.useProps); give the far ring's bake a moment.
  await page.sleep(1500);
  const side = Math.round(page.height * 0.8);
  const clip = { x: Math.round((page.width - side) / 2), y: Math.round((page.height - side) / 2), width: side, height: side };
  const shots = [];
  const name = (subject) => join(out, tag + "-" + quality + "-" + subject + ".png");

  await page.eval("window.__dhStudio.camera('default'); window.__dhStudio.pose('move')");
  await page.sleep(900);
  shots.push(await page.shot(name("default")));

  await page.eval("window.__dhStudio.turn(1.2); window.__dhStudio.pose('idle', 0.8)");
  for (const [index, [subject]] of ACTORS.entries()) {
    const actor = info.actors[index];
    const h = actor.drawnH;
    await page.eval("window.__dhStudio.lookAt(" + [actor.x, actor.z, h * 0.5, h * 2.4 + 1.2, 18, 14, true].join(",") + ")");
    await page.sleep(400);
    shots.push(await page.shot(name(subject), { clip }));
  }
  for (const [subject, x, z, height, distance, yaw, pitch] of PROPS) {
    await page.eval("window.__dhStudio.lookAt(" + [x, z, height, distance, yaw, pitch, false].join(",") + ")");
    await page.sleep(500);
    shots.push(await page.shot(name(subject), { clip }));
  }
  const renderer = await page.eval("(() => { const c = document.querySelector('canvas'); return c ? c.width + 'x' + c.height : null; })()");
  await page.eval("window.__dhStudio.stop()");
  return { quality, tag, info: { loaded: info.loaded, missing: info.missing }, renderer, shots };
}
