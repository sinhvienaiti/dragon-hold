#!/usr/bin/env node
// Fire test A's sheets (DRAGON_FIRE_DIAGNOSIS_2026-10-31 §3, parent repo), from a dh-fire-bench capture
// (<bench dir>/<size>-<ground>-<variant>/): per size × ground,
//   strip-<size>-<ground>-<variant>.jpg   every frame f-5 … f+90 round the hit, labelled with its index and ms;
//   compare-<size>-<ground>.jpg           round 10, test A and test A with the yellow shoulder, row by row, same frames;
//   clip-<size>-<ground>.mp4              the three side by side at 60 fps, real time (f-5 … f+90).
// f0 is each run's own (the frame the impact clip is first drawn).
//   node scripts/visual/fire-sheets.mjs <bench dir> <out dir>
// Blind (test B, for judges): every variant gets a neutral code, kept in a key file apart from the sheets. Strips run
// f-5 … f+90 every frame then every 6th to f+150 (the scorch's 2.5 s), clips f-5 … f+150 at 60 fps, side by side in
// code order and one per code.
//   node scripts/visual/fire-sheets.mjs <bench dir> <out dir> --blind <key.json> [--codes X,Y,Z] [--seed n] [--per-ground]
// --per-ground (test C): a new shuffle for each ground (both sizes of a ground share it), so a code names a different
// version on each ground; the key lists the mapping per ground. Temporary label files carry the code only.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";

const FONT = "/System/Library/Fonts/Supplemental/Arial.ttf";
const args = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback;
};
const [bench, out] = args;
const keyFile = flag("--blind");
let VARIANTS = ["r10", "a", "shoulder", "b", "c", "ccel"];
let NAMES = { r10: "round 10", a: "test A", shoulder: "test A + yellow shoulder", b: "test B", c: "test C", ccel: "test C, cel smoke" };
const LAST = keyFile ? 150 : 90;
const COMPARE = keyFile ? [-1, 0, 2, 4, 7, 10, 13, 16, 19, 22, 26, 29, 32, 36, 40, 50, 62, 76, 90, 110, 130, 150] : [-1, 0, 2, 4, 7, 10, 13, 16, 19, 22, 26, 32, 40, 50, 62, 76, 90];
const tail = keyFile ? [96, 102, 108, 114, 120, 126, 132, 138, 144, 150] : [];
mkdirSync(out, { recursive: true });
const name = (i) => "s" + String(i).padStart(3, "0") + ".png";
const runs = new Map();
for (const d of readdirSync(bench)) {
  const file = join(bench, d, "run.json");
  if (!existsSync(file)) continue;
  const run = JSON.parse(readFileSync(file, "utf8"));
  runs.set(d, { dir: join(bench, d), ...run });
}
// Blind codes: a seeded shuffle of the variants found, one mapping for every size and ground (or one per ground).
let codeOf = (v, ground) => v;
let nameOf = (v, ground) => NAMES[v];
let orderOf = (ground) => VARIANTS;
if (keyFile) {
  if (resolve(dirname(keyFile)).startsWith(resolve(out))) throw new Error("the key file must live outside the sheets folder");
  const found = [...new Set([...runs.values()].map((r) => r.variant))].sort();
  const grounds = [...new Set([...runs.values()].map((r) => r.ground))].sort();
  const codes = (flag("--codes", "X,Y,Z")).split(",").slice(0, found.length);
  let seed = Number(flag("--seed", String(Date.now() % 100000)));
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const shuffle = () => {
    const shuffled = [...found];
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rand() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return Object.fromEntries(shuffled.map((v, i) => [v, codes[i]]));
  };
  const perGround = args.includes("--per-ground");
  const one = shuffle();
  const maps = Object.fromEntries(grounds.map((g) => [g, perGround ? shuffle() : one]));
  codeOf = (v, ground) => maps[ground][v];
  nameOf = codeOf;
  orderOf = (ground) => [...found].sort((a, b) => maps[ground][a].localeCompare(maps[ground][b]));
  mkdirSync(dirname(keyFile), { recursive: true });
  const invert = (map) => Object.fromEntries(Object.entries(map).map(([v, c]) => [c, v]));
  const key = { made: new Date().toISOString(), sheets: resolve(out), names: { c: "test C (round 10 peak + burn-out, CC0 Kenney support layers)", b: "test B (cel clips)", a: "test A", r10: "round 10" } };
  if (perGround) key.codesByGround = Object.fromEntries(grounds.map((g) => [g, invert(maps[g])]));
  else key.codes = invert(one);
  writeFileSync(keyFile, JSON.stringify(key, null, 1) + "\n");
}

/** The crop round the hit (the burst, its smoke and the number above it). */
function cropOf(run) {
  const [W, H] = run.size;
  const at = run.track[run.f0].hit;
  const w = Math.round(0.46 * H);
  const h = Math.round(0.4 * H);
  const x = Math.max(0, Math.min(W - w, Math.round(at.x - w / 2)));
  const y = Math.max(0, Math.min(H - h, Math.round(at.y - 0.62 * h)));
  return { x, y, w: w - (w % 2), h: h - (h % 2) };
}

function montage(items, file, columns, tileW, title) {
  const args = ["montage", "-font", FONT, "-pointsize", "14", "-background", "#1e1e1e", "-fill", "#f0f0f0"];
  for (const it of items) args.push("-label", it.label, it.file + "[" + it.crop.w + "x" + it.crop.h + "+" + it.crop.x + "+" + it.crop.y + "]");
  args.push("-tile", columns + "x", "-geometry", tileW + "x+2+2", "-title", title, "-quality", "88", file);
  const r = spawnSync("magick", args, { encoding: "utf8", maxBuffer: 64 << 20 });
  if (r.status !== 0) throw new Error(r.stderr);
}

const made = [];
const groups = new Map();
for (const [key, run] of runs) {
  const g = run.size.join("x") + "-" + run.ground;
  if (!groups.has(g)) groups.set(g, {});
  groups.get(g)[run.variant] = run;
  const crop = cropOf(run);
  const items = [];
  for (const rel of [...Array.from({ length: 96 }, (_, i) => i - 5), ...tail]) {
    const f = run.f0 + rel;
    if (!existsSync(join(run.dir, name(f)))) continue;
    items.push({ file: join(run.dir, name(f)), crop, label: "f" + (rel >= 0 ? "+" : "") + rel + " · " + Math.round((rel * 1000) / 60) + " ms" });
  }
  const file = join(out, "strip-" + run.size.join("x") + "-" + run.ground + "-" + codeOf(run.variant, run.ground) + ".jpg");
  montage(items, file, 12, 200, nameOf(run.variant, run.ground) + " · " + run.size.join("×") + " · " + run.ground + " · every frame at 60 fps (f0 = impact)" + (tail.length ? ", then every 6th to f+150" : ""));
  made.push(file);
}

for (const [g, set] of groups) {
  const ground = Object.values(set)[0].ground;
  const rows = orderOf(ground).filter((v) => set[v]);
  const items = [];
  for (const v of rows) {
    const run = set[v];
    const crop = cropOf(run);
    for (const rel of COMPARE) {
      const f = run.f0 + rel;
      if (!existsSync(join(run.dir, name(f)))) continue;
      items.push({ file: join(run.dir, name(f)), crop, label: nameOf(v, ground) + " · f" + (rel >= 0 ? "+" : "") + rel + " · " + Math.round((rel * 1000) / 60) + " ms" });
    }
  }
  const file = join(out, "compare-" + g + ".jpg");
  montage(items, file, COMPARE.length, 220, g + ": rows " + rows.map((v) => nameOf(v, ground)).join(" · "));
  made.push(file);
  // Real-time clip: the three side by side, f-5 … f+90.
  const inputs = [];
  const filters = [];
  rows.forEach((v, i) => {
    const run = set[v];
    const c = cropOf(run);
    inputs.push("-framerate", "60", "-start_number", String(run.f0 - 5), "-i", join(run.dir, "s%03d.png"));
    filters.push("[" + i + ":v]trim=end_frame=" + (LAST + 6) + ",crop=" + c.w + ":" + c.h + ":" + c.x + ":" + c.y + ",scale=-2:480[c" + i + "]");
  });
  // Labels as images (this ffmpeg has no drawtext).
  rows.forEach((v, i) => {
    const label = join(out, ".label-" + nameOf(v, ground) + ".png");
    spawnSync("magick", ["-background", "#000000b0", "-fill", "white", "-font", FONT, "-pointsize", "20", "label: " + nameOf(v, ground) + " ", label]);
    inputs.push("-i", label);
    filters.push("[c" + i + "][" + (rows.length + i) + ":v]overlay=6:6[v" + i + "]");
  });
  const clipFile = join(out, "clip-" + g + ".mp4");
  const graph = filters.join(";") + ";" + (rows.length > 1 ? rows.map((_, i) => "[v" + i + "]").join("") + "hstack=inputs=" + rows.length : "[v0]null") + "[o]";
  const r = spawnSync("ffmpeg", ["-y", "-loglevel", "error", ...inputs, "-filter_complex", graph, "-map", "[o]", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", clipFile], { encoding: "utf8" });
  for (const v of rows) spawnSync("rm", ["-f", join(out, ".label-" + nameOf(v, ground) + ".png")]);
  if (r.status === 0) made.push(clipFile);
  else console.error("clip " + g + ": " + r.stderr.slice(0, 300));
  // Blind: one clip per code as well (the judge can watch each alone at real speed).
  if (keyFile) {
    for (const v of rows) {
      const run = set[v];
      const c = cropOf(run);
      const one = join(out, "clip-" + g + "-" + codeOf(v, ground) + ".mp4");
      const label = join(out, ".label-" + codeOf(v, ground) + ".png");
      spawnSync("magick", ["-background", "#000000b0", "-fill", "white", "-font", FONT, "-pointsize", "20", "label: " + nameOf(v, ground) + " ", label]);
      const r1 = spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", "60", "-start_number", String(run.f0 - 5), "-i", join(run.dir, "s%03d.png"), "-i", label, "-filter_complex", "[0:v]trim=end_frame=" + (LAST + 6) + ",crop=" + c.w + ":" + c.h + ":" + c.x + ":" + c.y + ",scale=-2:720[c];[c][1:v]overlay=8:8[o]", "-map", "[o]", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "16", one], { encoding: "utf8" });
      spawnSync("rm", ["-f", label]);
      if (r1.status === 0) made.push(one);
      else console.error("clip " + one + ": " + r1.stderr.slice(0, 300));
    }
  }
}
console.log(JSON.stringify(made, null, 1));
