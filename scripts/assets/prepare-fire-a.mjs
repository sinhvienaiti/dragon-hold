#!/usr/bin/env node
// Fire test A (docs/games/vfx/DRAGON_FIRE_DIAGNOSIS_2026-10-31.md §3, parent repo): the strong word hit's media,
// written under new names into public/assets/dragon-hold/vfx/fire-a/ (never over the round-10 atlases):
//   impact-burst-a.webp  impact-burst v2's cut as RGBA (tools/vfx-flipbook row impact-burst-a: coverage from the luma
//                        matte, widened 2.5 px, max over ±1 frame); the game colours it through a ramp;
//   smoke-mask-a.webp    smoke-mask v1's cut as RGBA (coverage = density, RGB = the clip's own shading);
//   halo-a.webp          a blurred copy of impact-burst's peak frame (the painted glow behind the body: High has
//                        no bloom, VFX_STANDARD §3.5 rule 2);
//   scorch-a.webp        the painted scorch of ticket 038 (art-src/vfx/scorch.png) for the procedural mark;
//   manifest.json        read by src/view/fire-a.ts.
//   node scripts/assets/prepare-fire-a.mjs --from <VFXLAB_HOME>/out/dragon-hold --scorch <scorch.png> [--halo-frame 17]
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : fallback;
};
const magick = (args) => execFileSync(process.env.ART_MAGICK || "magick", args, { maxBuffer: 256 << 20, stdio: ["ignore", "pipe", "pipe"] });
const md5 = (bytes) => createHash("md5").update(bytes).digest("hex");

const from = resolve(arg("--from", ""));
const scorch = resolve(arg("--scorch", join(ROOT, "../dragon-hold/art-src/vfx/scorch.png")));
const out = join(ROOT, "public/assets/dragon-hold/vfx/fire-a");
mkdirSync(out, { recursive: true });
const flipbooks = {};

function webp(src, file, extra = []) {
  const target = join(out, file);
  const temp = target + ".tmp.webp";
  magick([src, ...extra, "-quality", "92", "-define", "webp:alpha-quality=100", "-define", "webp:exact=true", temp]);
  renameSync(temp, target);
  const bytes = readFileSync(target);
  return { md5: md5(bytes), bytes: bytes.length };
}

for (const [id, version] of [["impact-burst-a", "v2"], ["smoke-mask-a", "v1"]]) {
  const json = JSON.parse(readFileSync(join(from, id, id + "__" + version + ".json"), "utf8"));
  if (json.channels !== "rgba") throw new Error(id + ": not an RGBA cut");
  const made = webp(join(from, id, json.image), id + ".webp");
  flipbooks[id] = {
    file: id + ".webp",
    cols: json.cols,
    rows: json.rows,
    frames: json.frames,
    fps: json.fps,
    loop: json.loop === true,
    blend: "normal",
    cell: json.cell,
    pivot: json.pivot,
    start: 0,
    heading: 0,
    version,
    source: "Adobe Firefly Video (tools/vfx-flipbook " + id + ")",
    alpha: true,
    ...made,
    width: json.atlas[0],
    height: json.atlas[1],
  };
  console.log(id + " " + version + ": " + json.atlas.join("×") + ", " + json.frames + " frames, " + Math.round(made.bytes / 1024) + " KB");
}

// The halo: impact-burst's peak frame (energy peaks at cells 19–21; 17 is the strong hit's last bright frame),
// blurred to a soft glow, faded round the cell's edge so no square shows, RGB only (drawn additive).
const burst = JSON.parse(readFileSync(join(from, "impact-burst-a", "impact-burst-a__v2.json"), "utf8"));
const frame = Number(arg("--halo-frame", "17"));
const [cw, ch] = burst.cell;
const cx = (frame % burst.cols) * cw;
const cy = Math.floor(frame / burst.cols) * ch;
const haloSrc = join(out, "halo-a.src.png");
magick([
  join(from, "impact-burst-a", burst.image), "-crop", cw + "x" + ch + "+" + cx + "+" + cy, "+repage", "-alpha", "off",
  "-gravity", "center", "-background", "black", "-extent", Math.round(cw * 1.5) + "x" + Math.round(ch * 1.5),
  "-blur", "0x" + Math.round(cw * 0.09),
  "(", "-size", Math.round(cw * 1.5) + "x" + Math.round(ch * 1.5), "radial-gradient:white-black", "-level", "0%,92%", ")",
  "-compose", "multiply", "-composite", "-resize", "256x256", haloSrc,
]);
flipbooks["halo-a"] = { file: "halo-a.webp", cols: 1, rows: 1, frames: 1, fps: 1, loop: false, blend: "additive", cell: [256, 256], pivot: [0.5, 0.5], start: 0, heading: 0, version: "v2-f" + frame, source: "impact-burst v2 frame " + frame + ", blurred", alpha: false, ...webp(haloSrc, "halo-a.webp"), width: 256, height: 256 };
execFileSync("rm", ["-f", haloSrc]);

flipbooks["scorch-a"] = { file: "scorch-a.webp", cols: 1, rows: 1, frames: 1, fps: 1, loop: false, blend: "normal", cell: [512, 512], pivot: [0.5, 0.5], start: 0, heading: 0, version: "038", source: "art-src/vfx/scorch.png (ticket 038)", alpha: true, ...webp(scorch, "scorch-a.webp"), width: 512, height: 512 };

writeFileSync(join(out, "manifest.json"), JSON.stringify({ version: 1, kind: "firefly", flipbooks }, null, 2) + "\n");
console.log("manifest: " + join(out, "manifest.json") + " (" + Object.keys(flipbooks).join(", ") + ")");
