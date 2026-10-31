#!/usr/bin/env node
// Fire test A's sheets (DRAGON_FIRE_DIAGNOSIS_2026-10-31 §3, parent repo), from a dh-fire-bench capture
// (<bench dir>/<size>-<ground>-<variant>/): per size × ground,
//   strip-<size>-<ground>-<variant>.jpg   every frame f-5 … f+90 round the hit, labelled with its index and ms;
//   compare-<size>-<ground>.jpg           round 10, test A and test A with the yellow shoulder, row by row, same frames;
//   clip-<size>-<ground>.mp4              the three side by side at 60 fps, real time (f-5 … f+90).
// f0 is each run's own (the frame the impact clip is first drawn).
//   node scripts/visual/fire-sheets.mjs <bench dir> <out dir>
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const FONT = "/System/Library/Fonts/Supplemental/Arial.ttf";
const VARIANTS = ["r10", "a", "shoulder"];
const NAMES = { r10: "round 10", a: "test A", shoulder: "test A + yellow shoulder" };
const COMPARE = [-1, 0, 2, 4, 7, 10, 13, 16, 19, 22, 26, 32, 40, 50, 62, 76, 90];

const [bench, out] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const name = (i) => "s" + String(i).padStart(3, "0") + ".png";
const runs = new Map();
for (const d of readdirSync(bench)) {
  const file = join(bench, d, "run.json");
  if (!existsSync(file)) continue;
  const run = JSON.parse(readFileSync(file, "utf8"));
  runs.set(d, { dir: join(bench, d), ...run });
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
  for (let rel = -5; rel <= 90; rel += 1) {
    const f = run.f0 + rel;
    if (!existsSync(join(run.dir, name(f)))) continue;
    items.push({ file: join(run.dir, name(f)), crop, label: "f" + (rel >= 0 ? "+" : "") + rel + " · " + Math.round((rel * 1000) / 60) + " ms" });
  }
  const file = join(out, "strip-" + key + ".jpg");
  montage(items, file, 12, 200, NAMES[run.variant] + " · " + run.size.join("×") + " · " + run.ground + " · every frame at 60 fps (f0 = impact)");
  made.push(file);
}

for (const [g, set] of groups) {
  const rows = VARIANTS.filter((v) => set[v]);
  const items = [];
  for (const v of rows) {
    const run = set[v];
    const crop = cropOf(run);
    for (const rel of COMPARE) {
      const f = run.f0 + rel;
      if (!existsSync(join(run.dir, name(f)))) continue;
      items.push({ file: join(run.dir, name(f)), crop, label: NAMES[v] + " · f" + (rel >= 0 ? "+" : "") + rel + " · " + Math.round((rel * 1000) / 60) + " ms" });
    }
  }
  const file = join(out, "compare-" + g + ".jpg");
  montage(items, file, COMPARE.length, 220, g + ": rows round 10 · test A · test A + yellow shoulder");
  made.push(file);
  // Real-time clip: the three side by side, f-5 … f+90.
  const inputs = [];
  const filters = [];
  rows.forEach((v, i) => {
    const run = set[v];
    const c = cropOf(run);
    inputs.push("-framerate", "60", "-start_number", String(run.f0 - 5), "-i", join(run.dir, "s%03d.png"));
    filters.push("[" + i + ":v]trim=end_frame=96,crop=" + c.w + ":" + c.h + ":" + c.x + ":" + c.y + ",scale=-2:480[c" + i + "]");
  });
  // Labels as images (this ffmpeg has no drawtext).
  rows.forEach((v, i) => {
    const label = join(out, ".label-" + v + ".png");
    spawnSync("magick", ["-background", "#000000b0", "-fill", "white", "-font", FONT, "-pointsize", "20", "label: " + NAMES[v] + " ", label]);
    inputs.push("-i", label);
    filters.push("[c" + i + "][" + (rows.length + i) + ":v]overlay=6:6[v" + i + "]");
  });
  const clipFile = join(out, "clip-" + g + ".mp4");
  const graph = filters.join(";") + ";" + (rows.length > 1 ? rows.map((_, i) => "[v" + i + "]").join("") + "hstack=inputs=" + rows.length : "[v0]null") + "[o]";
  const r = spawnSync("ffmpeg", ["-y", "-loglevel", "error", ...inputs, "-filter_complex", graph, "-map", "[o]", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", clipFile], { encoding: "utf8" });
  for (const v of rows) spawnSync("rm", ["-f", join(out, ".label-" + v + ".png")]);
  if (r.status === 0) made.push(clipFile);
  else console.error("clip " + g + ": " + r.stderr.slice(0, 300));
}
console.log(JSON.stringify(made, null, 1));
