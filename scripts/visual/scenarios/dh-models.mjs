// dh-models (M0b): frame sheets of the owner's models for review, through the
// model studio (view/studio.ts, `?bench=models`: the painted L2-cau stage, the
// real crowd with bones layers, the two Dragons). Per size (SIZES, default
// "1280x720,1920x1080") and per model: close-up frames of every clip at fixed
// times (idle, walk, attack wind-up / hold / strike / recover, hit, death; G01
// also Cắm Cờ and its intro), the same row at the default game camera, and the
// two Dragons side by side. Sheets (one per model and size) are montaged with
// ImageMagick into OUT_DIR (default tmp/mac-2026-10-27/m0b/samples); frames go
// to OUT_DIR/frames/<size>/. SET=samples (default: grunt, wolf, G01, wasp) or
// SET=all (every crowd model, traps and the hut).
// MODE=game: the real game instead (the size given to cdp-run): a bot types
// every word at ?speed=4 up to wave GAME_WAVE (default 5, G01's wave), then
// stops typing at speed 1 and takes frames of the wave walking in (default
// camera, then closer on the north lane), and of kills (death clips) as it
// types the nearest words again; OUT_DIR/game-<W>x<H>/.
//   URL=http://127.0.0.1:4152/ node scripts/visual/cdp-run.mjs scripts/visual/scenarios/dh-models.mjs
// Owner: view (M0b models lane).
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { boot, press, state, waitFor } from "./lib/dh.mjs";

const MAGICK = ["/opt/homebrew/bin/magick", "/usr/local/bin/magick", "/usr/bin/convert"].find((path) => existsSync(path));
const FONT = "/System/Library/Fonts/Supplemental/Arial.ttf";

const SETS = {
  samples: [
    ["grunt", "enemies/moss-grunt", [-6, -8]],
    ["wolf", "enemies/blight-wolf", [0, -8]],
    ["general", "generals/moss-banner", [6, -8.5]],
    ["wasp", "enemies/thorn-wasp", [11, -8]],
  ],
  all: [
    ["archer", "enemies/moss-archer", [-3, -8]],
    ["boar", "enemies/tusk-boar", [1, -8]],
    ["ant", "enemies/thorn-ant", [4.5, -8]],
    ["warden", "units/moss-warden", [8, -8]],
    ["spikes", "traps/spikes", [12, -8]],
    ["bomb", "traps/pine-bomb", [16, -8.5]],
    ["launcher", "traps/net-launcher", [19.5, -8]],
    ["hut", "houses/herb-hut", [23.5, -9]],
  ],
};

/** Clips and times (s) per sheet row; a model without a clip skips its row. */
const ROWS = [
  ["idle", [0, 0.8, 1.6]],
  ["move", [0, 0.25, 0.5, 0.75]],
  ["attack", [0.2, 0.5, 0.58, 0.85]],
  ["hit", [0.08, 0.17]],
  ["death", [0.2, 0.45, 0.8]],
  ["cast", [0.3, 0.6, 1.1]],
  ["intro", [0.4, 0.8]],
  ["block", [0.15]],
  ["down", [0.6]],
  ["ready", [0, 1]],
  ["aim", [0.25, 0.5]],
];

/** Close views of the provisional props and the bridge (PARTS=props in the M0b suite), at the size given. */
export async function props(page, out, [width, height] = [page.width, page.height]) {
  const tag = width + "x" + height;
  const dir = join(out, "props-" + tag);
  mkdirSync(dir, { recursive: true });
  await page.viewport(width, height);
  await page.goto((process.env.URL ?? "http://127.0.0.1:4152/").replace(/\/$/, "") + "/?title=0&bench=models", { settle: 400 });
  await page.eval(
    "(async () => { const m = await import('/src/view/studio.ts'); const host = document.createElement('div'); host.style.cssText = 'position:fixed;inset:0'; document.body.append(host);" +
      " await m.runModelStudio(host, { content: [] }); return true; })()",
  );
  const spots = [
    ["k03-pine-young", 0.4, 13.6, 16, 160],
    ["k04-tree-violet", -7, -28.6, 18, 20],
    ["k07-rock-boulder", -4.5, -9.6, 7, 20],
    ["k12-bridge", 0, -14, 16, 25],
    ["grove-east", 18, -10, 26, 10],
  ];
  const shots = [];
  for (const [name, x, z, distance, yaw] of spots) {
    await page.eval("window.__dhStudio.look(" + [x, z, distance, yaw].join(",") + ")");
    await page.sleep(500);
    shots.push(await page.shot(join(dir, name + ".png")));
  }
  await page.eval("window.__dhStudio.stop()");
  return { shots };
}

/** In-game frames (MODE=game). */
export async function game(page, out, [width, height] = [page.width, page.height]) {
  const tag = width + "x" + height;
  const dir = join(out, "game-" + tag);
  mkdirSync(dir, { recursive: true });
  const target = Number(process.env.GAME_WAVE ?? "5");
  await boot(page, "prelearn=0&q=" + (process.env.Q ?? "high") + "&speed=4&seed=" + (process.env.SEED ?? "5"), { width, height });
  await press(page, "Enter");
  await waitFor(page, "s.phase === 'wave'", { timeoutMs: 20000 });
  void page.eval(`window.__botRun = (async () => {
    const d = window.__dh; window.__stopBot = false;
    for (let k = 0; k < 100000 && !window.__stopBot; k += 1) {
      const w = d.world();
      if (w.phase === 'victory' || w.phase === 'defeat') break;
      if (d.panel() === 'review') d.action('escape');
      if (w.phase === 'break' && w.phaseEndsAt > 0) d.send({ type: 'call-early' });
      if (w.wave >= ${target} && w.phase === 'wave') break;
      const live = d.words(); const lock = w.words.lock;
      const word = lock >= 0 ? live.find((x) => x.slot === lock) : live[0];
      if (word) for (const ch of word.text.slice(word.typed)) d.send({ type: 'key', letter: ch.charCodeAt(0) - 97 });
      await new Promise((r) => setTimeout(r, 150));
    }
  })()`);
  const reached = await waitFor(page, "s.wave >= " + target + " && s.phase === 'wave'", { timeoutMs: 300000, everyMs: 500 });
  await page.eval("window.__stopBot = true; window.__dh.setSpeed(1)");
  // Pictures, not survival: below half HP the page fills the Dragon's HP again (scenario only, as dh-crowd's HOLD).
  await page.eval("window.__dhHold = setInterval(() => { const h = window.__dh.world().hero; if (h.hp * 2 < h.hpMax) h.hp = h.hpMax; }, 250)");
  // Let the wave walk in, then frames at the default camera.
  await waitFor(page, "s.live >= 8", { timeoutMs: 30000 });
  await page.sleep(2500);
  const shots = [];
  for (let k = 0; k < 4; k += 1) {
    shots.push(await page.shot(join(dir, "wave" + target + "-default-" + k + ".png")));
    await page.sleep(350);
  }
  // Closer on where the foes are (their centre), the way a player zooms in.
  await page.eval(`(() => { const f = window.__dh.foes(); const n = Math.max(1, f.length);
    const x = f.reduce((s, e) => s + e.x, 0) / n, z = f.reduce((s, e) => s + e.z, 0) / n;
    window.__dh.setView({ zoom: 0.6, targetX: x, targetZ: z }, true); })()`);
  await page.sleep(600);
  for (let k = 0; k < 5; k += 1) {
    shots.push(await page.shot(join(dir, "wave" + target + "-close-" + k + ".png")));
    await page.sleep(300);
  }
  // Kills: type the words of the nearest foes; frames while they fall.
  for (let kill = 0; kill < 3; kill += 1) {
    await page.eval(`(() => { const d = window.__dh; const w = d.world(); const live = d.words();
      const dist = (x) => { if (!x.target) return 1e9; const e = w.enemies.list[x.target.slot]; return e && e.alive ? Math.hypot(e.x, e.z + 16 * 60000) : 1e9; };
      const word = live.filter((x) => x.target).sort((a, b) => dist(a) - dist(b))[0];
      if (word) for (const ch of word.text.slice(word.typed)) d.send({ type: 'key', letter: ch.charCodeAt(0) - 97 }); })()`);
    for (let k = 0; k < 3; k += 1) {
      await page.sleep(280);
      shots.push(await page.shot(join(dir, "wave" + target + "-kill" + kill + "-" + k + ".png")));
    }
  }
  await page.eval("window.__dh.setView({ zoom: 1 }, true); clearInterval(window.__dhHold)");
  return { reached, state: await state(page), shots };
}

export default async function (page) {
  const base = (process.env.URL ?? "http://127.0.0.1:4152/").replace(/\/$/, "");
  if (process.env.MODE === "game") return game(page, resolve(process.env.OUT_DIR ?? "tmp/mac-2026-10-27/m0b/samples"));
  const out = resolve(process.env.OUT_DIR ?? "tmp/mac-2026-10-27/m0b/samples");
  const set = SETS[process.env.SET ?? "samples"] ?? SETS.samples;
  const sizes = (process.env.SIZES ?? "1280x720,1920x1080").split(",").map((size) => size.split("x").map(Number));
  const quality = process.env.Q ?? "high";
  await page.goto(base + "/?title=0&bench=models", { settle: 400 });
  const info = await page.eval(
    "(async () => { const m = await import('/src/view/studio.ts'); const host = document.createElement('div'); host.style.cssText = 'position:fixed;inset:0'; document.body.append(host);" +
      " const h = await m.runModelStudio(host, " +
      JSON.stringify({ quality, content: set.map((entry) => entry[1]), positions: set.map((entry) => entry[2]) }) +
      "); return { loaded: h.loaded, missing: h.missing }; })()",
  );
  if (!info || info.evalError) return { error: "studio did not start", info };
  // Which clips each model has (studio poses a missing clip as idle; the sheet leaves those rows out).
  const clips = await page.eval(
    "(async () => { const s = await import('/src/view/model-specs.ts'); const r = await import('/src/view/crowd-rig.ts'); return " +
      JSON.stringify(set.map((entry) => entry[1])) +
      ".map((key) => { const spec = s.MODEL_SPECS[key]; const rig = r.rigOf(spec.rig, spec.marks, spec.ours, spec.manifest); return rig ? rig.clips.map((c) => c.name) : []; }); })()",
  );
  const sheets = [];
  const report = { info, clips, sizes: [] };
  for (const [width, height] of sizes) {
    await page.viewport(width, height);
    await page.sleep(500);
    const tag = width + "x" + height;
    const frames = join(out, "frames", tag);
    mkdirSync(frames, { recursive: true });
    // The row at the game's default camera, live (walking in place), then posed in Attack at its hold.
    await page.eval("window.__dhStudio.camera('default')");
    await page.eval("window.__dhStudio.pose('move')");
    await page.sleep(900);
    const rowShots = [await page.shot(join(frames, "row-default-move.png"))];
    await page.eval("window.__dhStudio.pose('attack', 0.5)");
    await page.sleep(300);
    rowShots.push(await page.shot(join(frames, "row-default-attack.png")));
    const boxes = await page.eval("window.__dhStudio.boxes()");
    // The Dragons side by side (Hỏa Long warm, Bạch Long pearl), then close.
    const dragons = [await page.shot(join(frames, "dragons-default.png"))];
    await page.eval("window.__dhStudio.camera('dragons')");
    await page.sleep(500);
    dragons.push(await page.shot(join(frames, "dragons-close.png")));
    const sizeReport = { size: tag, boxes, rowShots, dragons, models: [] };
    for (let index = 0; index < set.length; index += 1) {
      const [name] = set[index];
      const has = new Set(clips[index] ?? []);
      // Three-quarter front view: the body turned about 70° toward the camera's side, so a walk shows its legs.
      await page.eval("window.__dhStudio.turn(1.2)");
      await page.eval("window.__dhStudio.camera('actor', " + index + ")");
      await page.sleep(350);
      const side = Math.round(Math.min(width, height) * 0.62);
      const clip = { x: Math.round((width - side) / 2), y: Math.round((height - side) / 2), width: side, height: side };
      const rows = [];
      for (const [clipName, times] of ROWS) {
        if (!has.has(clipName) && !(clipName === "idle" && has.has("move"))) continue;
        const cells = [];
        for (const t of times) {
          await page.eval("window.__dhStudio.pose(" + JSON.stringify(has.has(clipName) ? clipName : "move") + ", " + t + ")");
          await page.sleep(140);
          const file = join(frames, name + "-" + clipName + "@" + t + ".png");
          await page.shot(file, { clip });
          cells.push([file, clipName + " " + t + " s"]);
        }
        rows.push(cells);
      }
      if (rows.length === 0) {
        // A rigid model (bomb, hut): one still frame from two sides.
        const cells = [];
        for (const yaw of [-1.05, 0.6]) {
          await page.eval("window.__dhStudio.turn(" + yaw + ")");
          await page.sleep(160);
          const file = join(frames, name + "-still@" + yaw + ".png");
          await page.shot(file, { clip });
          cells.push([file, "still · " + Math.round((yaw * 180) / Math.PI) + "°"]);
        }
        rows.push(cells);
      }
      await page.eval("window.__dhStudio.turn(0)");
      sizeReport.models.push({ name, rows: rows.length });
      if (MAGICK) {
        const tile = Math.round(side * 0.5);
        const rowFiles = rows.map((cells, r) => {
          const labelled = cells.map(([file, label], c) => {
            const target = join(frames, "tile-" + name + "-" + r + "-" + c + ".png");
            execFileSync(MAGICK, [file, "-resize", tile + "x" + tile, "-font", FONT, "-pointsize", "15", "-fill", "#ffffff", "-undercolor", "#00000099", "-gravity", "northwest", "-annotate", "+4+4", label, target]);
            return target;
          });
          const target = join(frames, "row-" + name + "-" + r + ".png");
          execFileSync(MAGICK, [...labelled, "-background", "#202020", "+append", target]);
          return target;
        });
        const sheet = join(out, name + "-" + tag + ".png");
        execFileSync(MAGICK, [...rowFiles, "-background", "#202020", "-append", "-font", FONT, "-pointsize", "18", "-fill", "#ffffff", "-gravity", "northeast", "-annotate", "+6+4", name + " · " + tag + " · " + quality, sheet]);
        sheets.push(sheet);
      }
    }
    if (MAGICK) {
      // The default-camera row and the Dragons, as one overview per size.
      const overview = join(out, "overview-" + (process.env.SET ?? "samples") + "-" + tag + ".png");
      execFileSync(MAGICK, [rowShots[0], "-resize", "1280x", rowShots[1], "-resize", "1280x", dragons[1], "-resize", "1280x", "-append", overview]);
      sheets.push(overview);
    }
    report.sizes.push(sizeReport);
  }
  await page.eval("window.__dhStudio.stop()");
  return { ok: (info.missing ?? []).length === 0, sheets, report };
}
