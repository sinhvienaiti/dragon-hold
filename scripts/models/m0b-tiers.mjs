#!/usr/bin/env node
/**
 * Model tiers per quality setting (parent docs/games/MODEL_QUALITY.md §2b,
 * owner 29/10), built from the owner's Tripo originals (art-src/3d, never
 * edited). Replaces the M0b chain (m0b-strip.mjs + the parent packager) for
 * the runtime files: that chain cut every model for every setting and
 * deleted its normal and roughness maps.
 *
 *   node scripts/models/m0b-tiers.mjs [--only <kind>/<id>,…] [--sources <dir>] [--jobs <n>] [--force]
 *
 * 1. Blender static pass (parent repo scripts/models/blender/static_model_tools.py)
 *    with the M0b preset's orientation, size, pivot and sockets, once per
 *    triangle target: 0 (the whole original) and each lower target the tier
 *    preset asks for (UV seams locked, normals from the whole mesh). Output
 *    art-src/models-tiers/<kind>/<id>.<full|target>.glb, cached by input hash.
 * 2. Per tier (presets/dragon-hold-tiers.json): the M0b preset's cuts;
 *    meshopt down to the target when Blender stopped above it; maps per tier:
 *    Ultra and High keep colour, normal and roughness (the original's green
 *    channel as a grey map), Medium colour and normal with the model's mean
 *    roughness; metalness 0 everywhere (Tripo marks painted gold as metal);
 *    WebP per slot at the tier's size; meshopt-compressed and quantized.
 * 3. Writes public/assets/dragon-hold/models/<m0b|kit3>/<kind>/<id>/<id>.<tier>.glb
 *    and both manifests (tiers ultra, high, medium: the kit picks one per
 *    quality; Low loads none and keeps the primitives). A model keeps the
 *    manifest it was in (kit3: the map pilot's round 3 props).
 *
 * --sources: where the originals are (default <root>/art-src/3d, else the main
 * checkout's games/dragon-hold/art-src/3d, read only). Build time only;
 * gltf-transform, meshoptimizer and sharp come from Space Typing's
 * node_modules, as in m0b-strip.mjs. Report: art-src/models-tiers/report.json.
 */
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const M0B_PRESET = join(ROOT, "scripts/models/presets/dragon-hold-m0b.json");
const TIER_PRESET = join(ROOT, "scripts/models/presets/dragon-hold-tiers.json");
const STATIC_HELPER = resolve(ROOT, "../../scripts/models/blender/static_model_tools.py");
const WORK = join(ROOT, "art-src/models-tiers");
const OUT = join(ROOT, "public/assets/dragon-hold/models");
const URL_BASE = "/assets/dragon-hold/models";
const TIERS = ["ultra", "high", "medium"];
/** The far LOD of a scatter prop as geometry only, drawn with the tier's maps: class "far": "m0b" (today's M0b cut) or "medium" (the Medium mesh). */
const FAR = "far";
/** The hull of a crowd model (class "hull": "medium"): the Medium mesh as geometry only, for the outline and ghost passes on High and Ultra. */
const HULL = "hull";
const GEOMETRY_ONLY = new Set([FAR, HULL]);
const UNLOCKED_DECIMATE = join(ROOT, "scripts/models/blender/m0b_decimate.py");
const DEPENDENCY_ROOTS = [ROOT, resolve(ROOT, "../space-typing"), resolve(ROOT, "../../games/space-typing")];

const flag = (name) => {
  const index = process.argv.indexOf("--" + name);
  return index > 0 ? process.argv[index + 1] : undefined;
};
const only = flag("only") ? new Set(flag("only").split(",")) : null;
const force = process.argv.includes("--force");
const jobs = Math.max(1, Number(flag("jobs") ?? 3));
const sourceDirs = [flag("sources"), join(ROOT, "art-src/3d"), resolve(ROOT, "../dragon-hold/art-src/3d")].filter(Boolean);
const blender = [flag("blender"), process.env.BLENDER_BIN, "/Applications/Blender.app/Contents/MacOS/Blender"].find((path) => path && existsSync(path));
if (!blender) throw new Error("Blender not found (--blender <bin> or BLENDER_BIN)");
if (!existsSync(STATIC_HELPER)) throw new Error("static helper not found: " + STATIC_HELPER);

async function dependency(name) {
  for (const base of DEPENDENCY_ROOTS) {
    try {
      return await import(pathToFileURL(createRequire(join(base, "package.json")).resolve(name)).href);
    } catch {
      /* next */
    }
  }
  throw new Error(name + " not found (install Space Typing's node_modules)");
}

const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const m0b = JSON.parse(readFileSync(M0B_PRESET, "utf8"));
const tiersPreset = JSON.parse(readFileSync(TIER_PRESET, "utf8"));
const helperHash = sha(readFileSync(STATIC_HELPER));

const { Logger, NodeIO } = await dependency("@gltf-transform/core");
const { ALL_EXTENSIONS } = await dependency("@gltf-transform/extensions");
const { dedup, getBounds, meshopt, prune, simplify, textureCompress, weld } = await dependency("@gltf-transform/functions");
const { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } = await dependency("meshoptimizer");
const sharp = (await dependency("sharp")).default;
await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready, MeshoptSimplifier.ready]);
const io = new NodeIO()
  .setLogger(new Logger(Logger.Verbosity.WARN))
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ "meshopt.decoder": MeshoptDecoder, "meshopt.encoder": MeshoptEncoder });

const triangles = (document) =>
  document
    .getRoot()
    .listMeshes()
    .flatMap((mesh) => mesh.listPrimitives())
    .reduce((sum, primitive) => sum + Math.floor((primitive.getIndices()?.getCount() ?? primitive.getAttribute("POSITION").getCount()) / 3), 0);

/** Triangle target per tier: Ultra the original; High the class floor, at most the original; Medium half of High; never under the floor. */
function targets(source, klass, floor) {
  const high = klass.high === "source" ? source : Math.min(source, Math.max(floor, klass.high));
  const medium = Math.min(high, Math.max(floor, Math.round(high * klass.medium)));
  return { ultra: source, high, medium };
}

function findSource(rel) {
  for (const dir of sourceDirs) {
    const path = join(dir, rel);
    if (existsSync(path)) return path;
  }
  return null;
}

function run(command, args) {
  return new Promise((done, fail) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let log = "";
    child.stdout.on("data", (chunk) => (log += chunk));
    child.stderr.on("data", (chunk) => (log += chunk));
    child.on("close", (code) => (code === 0 ? done(log) : fail(new Error(command + " exited " + code + "\n" + log.slice(-2000)))));
  });
}

async function pool(items, size, work) {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(size, queue.length) }, async () => {
    while (queue.length > 0) await work(queue.shift());
  });
  await Promise.all(workers);
}

/** Drops triangles wholly inside each cut box (processed frame, metres), as m0b-strip.mjs did. */
function applyCuts(document, boxes) {
  let cut = 0;
  for (const box of boxes ?? []) {
    for (const mesh of document.getRoot().listMeshes()) {
      for (const primitive of mesh.listPrimitives()) {
        const indices = primitive.getIndices();
        const position = primitive.getAttribute("POSITION");
        const inside = (v) => {
          const p = position.getElement(v, []);
          return p[0] >= box[0] && p[1] >= box[1] && p[2] >= box[2] && p[0] <= box[3] && p[1] <= box[4] && p[2] <= box[5];
        };
        const kept = [];
        const all = indices.getArray();
        for (let k = 0; k < all.length; k += 3) {
          if (inside(all[k]) && inside(all[k + 1]) && inside(all[k + 2])) cut += 1;
          else kept.push(all[k], all[k + 1], all[k + 2]);
        }
        indices.setArray(all instanceof Uint32Array ? new Uint32Array(kept) : new Uint16Array(kept));
      }
    }
  }
  return cut;
}

/** The roughness channel (green) of a metal-roughness image as a grey PNG, and its mean 0–1. */
async function roughnessOf(image) {
  const png = await sharp(Buffer.from(image)).extractChannel(1).png().toBuffer();
  // stats() reads the input, not the pipeline's output: measure the grey PNG itself.
  const { channels } = await sharp(png).stats();
  return { png, mean: channels[0].mean / 255, min: channels[0].min / 255, max: channels[0].max / 255, stdev: channels[0].stdev / 255 };
}

const keys = Object.keys(tiersPreset.models).filter((key) => only === null || only.has(key));
const cachePath = join(WORK, ".cache.json");
const cache = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, "utf8")) : {};
mkdirSync(WORK, { recursive: true });

// ── 1. Blender passes ────────────────────────────────────────────────────────
const plan = [];
const jobsList = [];
for (const key of keys) {
  const entry = m0b.models[key];
  if (!entry) throw new Error(key + " is in the tier preset but not in " + M0B_PRESET);
  const klass = tiersPreset.classes[tiersPreset.models[key]];
  if (!klass) throw new Error(key + ": unknown class " + tiersPreset.models[key]);
  const source = findSource(entry.source);
  if (!source) throw new Error(key + ": original " + entry.source + " not found in " + sourceDirs.join(", "));
  const doc = await io.read(source);
  const sourceTriangles = triangles(doc);
  const tierTargets = targets(sourceTriangles, klass, tiersPreset.floor);
  const [kind, id] = key.split("/");
  const passes = new Map();
  if (klass.far === "m0b") tierTargets[FAR] = Math.min(sourceTriangles, entry.triangles);
  if (klass.far === "medium") tierTargets[FAR] = tierTargets.medium;
  // Only models the crowd draws (not the bridge or the jetty, which the map draws once each).
  if (klass.hull === "medium" && !key.startsWith("props/pine-river-")) tierTargets[HULL] = tierTargets.medium;
  for (const tier of Object.keys(tierTargets)) {
    const target = tierTargets[tier];
    const name = target >= sourceTriangles ? "full" : String(target);
    passes.set(tier, name);
    if (jobsList.some((job) => job.key === key && job.name === name)) continue;
    const output = join(WORK, kind, id + "." + name + ".glb");
    const spec = { ...entry.static, triangles: name === "full" ? 0 : target };
    const hash = sha(JSON.stringify({ source: sha(readFileSync(source)), spec, helperHash }));
    jobsList.push({ key, name, source, output, spec, hash });
  }
  plan.push({ key, kind, id, entry, klass, source, sourceTriangles, tierTargets, passes });
}

let ran = 0;
await pool(jobsList, jobs, async (job) => {
  const cacheKey = job.key + "|" + job.name;
  if (!force && cache[cacheKey] === job.hash && existsSync(job.output)) return;
  mkdirSync(dirname(job.output), { recursive: true });
  const report = job.output.replace(/\.glb$/, ".report.json");
  const started = Date.now();
  await run(blender, [
    "--background", "--factory-startup", "--python-exit-code", "1", "--python", STATIC_HELPER, "--",
    "--input", job.source, "--output", job.output, "--id", job.key, "--spec", JSON.stringify(job.spec), "--report", report,
  ]);
  cache[job.key + "|" + job.name] = job.hash;
  ran += 1;
  console.log("blender " + job.key.padEnd(36) + " " + job.name.padStart(5) + "  " + ((Date.now() - started) / 1000).toFixed(1) + " s");
  writeFileSync(cachePath, JSON.stringify(cache, null, 1));
});
console.log("blender passes: " + ran + " run, " + (jobsList.length - ran) + " cached");

// ── 2–3. Tiers ───────────────────────────────────────────────────────────────
const manifests = {};
const manifestOf = (folder) => {
  if (!manifests[folder]) {
    const path = join(OUT, folder, "manifest.json");
    manifests[folder] = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : { version: 1, generatedAt: "", models: {} };
  }
  return manifests[folder];
};
const kit3 = manifestOf("kit3");
const reportPath = join(WORK, "report.json");
const report = existsSync(reportPath) ? JSON.parse(readFileSync(reportPath, "utf8")) : { models: {} };

for (const item of plan) {
  const { key, kind, id, entry, klass, sourceTriangles, tierTargets, passes } = item;
  const folder = kit3.models[key] ? "kit3" : "m0b";
  const manifest = manifestOf(folder);
  const files = {};
  const row = { class: tiersPreset.models[key], folder, source: sourceTriangles, tiers: {} };
  let sockets = [];
  let size = [1, 1, 1];
  for (const tier of Object.keys(tierTargets)) {
    let document = await io.read(join(WORK, kind, id + "." + passes.get(tier) + ".glb"));
    const cut = applyCuts(document, entry.cut);
    const target = tierTargets[tier];
    // The far LOD keeps its uv with no texture on it (the game draws it with the tier's maps).
    const pruning = { keepLeaves: true, keepExtras: true, keepAttributes: GEOMETRY_ONLY.has(tier) };
    const keep = prune(pruning);
    await document.transform(dedup(), keep, weld());
    const blended = triangles(document);
    // Blender stops above the target where locked UV seams leave nothing to collapse: meshopt goes on, its error
    // bound loosened step by step (a scatter prop is seen from 30 m and more), never under the target.
    for (const error of [0.01, 0.02, 0.04]) {
      const now = triangles(document);
      if (now <= target * 1.05) break;
      await document.transform(simplify({ simplifier: MeshoptSimplifier, ratio: target / now, error, lockBorder: false }), weld());
    }
    if (tier === FAR && triangles(document) > target * 1.15) {
      // As m0b-strip.mjs: Blender's collapse without the seam lock reaches a far prop's budget (UVs stay per corner).
      const temporary = join(WORK, kind, id + ".far-tmp.glb");
      await io.write(temporary, document);
      await run(blender, ["-b", "--factory-startup", "--python-exit-code", "1", "-P", UNLOCKED_DECIMATE, "--", temporary, temporary, String(target)]);
      document = await io.read(temporary);
      rmSync(temporary);
      await document.transform(prune(pruning));
    }
    // The far LOD carries no maps: the game draws it with the tier's (same UV atlas).
    const texture = GEOMETRY_ONLY.has(tier) ? { color: 0 } : klass.textures[tier];
    const roughness = [];
    for (const material of document.getRoot().listMaterials()) {
      const mr = material.getMetallicRoughnessTexture();
      const grey = mr ? await roughnessOf(mr.getImage()) : null;
      material.setMetallicFactor(0);
      material.setOcclusionTexture(null);
      material.setEmissiveTexture(null);
      if (grey && texture.roughness) {
        const map = document.createTexture((material.getName() || id) + "-roughness").setImage(new Uint8Array(grey.png)).setMimeType("image/png");
        material.setMetallicRoughnessTexture(map);
        material.setRoughnessFactor(1);
      } else {
        material.setMetallicRoughnessTexture(null);
        material.setRoughnessFactor(grey ? Number(grey.mean.toFixed(3)) : 0.85);
      }
      if (grey) roughness.push({ mean: Number(grey.mean.toFixed(3)), min: Number(grey.min.toFixed(3)), max: Number(grey.max.toFixed(3)), stdev: Number(grey.stdev.toFixed(3)) });
      if (!texture.normal) material.setNormalTexture(null);
      if (!texture.color) material.setBaseColorTexture(null);
    }
    const quality = tier === "medium" ? 86 : 90;
    const webp = (slots, edge) => textureCompress({ encoder: sharp, targetFormat: "webp", resize: [edge, edge], quality, slots });
    const steps = [keep];
    if (texture.color) steps.push(webp(/^baseColorTexture$/, texture.color));
    if (texture.normal) steps.push(webp(/^normalTexture$/, texture.normal));
    if (texture.roughness) steps.push(webp(/^metallicRoughnessTexture$/, texture.roughness));
    steps.push(meshopt({ encoder: MeshoptEncoder, level: "medium", cleanup: false }), prune(pruning));
    await document.transform(...steps);
    const kept = triangles(document);
    if (tier === "ultra") {
      sockets = document.getRoot().listNodes().map((node) => node.getName()).filter((name) => name.startsWith("FX_"));
      const bounds = getBounds(document.getRoot().listScenes()[0]);
      size = [0, 1, 2].map((axis) => Number((bounds.max[axis] - bounds.min[axis]).toFixed(4)));
    }
    const maps = document
      .getRoot()
      .listMaterials()
      .flatMap((material) =>
        [
          ["color", material.getBaseColorTexture()],
          ["normal", material.getNormalTexture()],
          ["roughness", material.getMetallicRoughnessTexture()],
        ]
          .filter(([, map]) => map)
          .map(([slot, map]) => slot + " " + (map.getSize()?.[0] ?? "?")),
      );
    const bytes = await io.writeBinary(document);
    const rel = kind + "/" + id + "/" + id + "." + tier + ".glb";
    files[tier] = { path: join(OUT, folder, rel), bytes, triangles: kept };
    row.tiers[tier] = { target, blender: blended, triangles: kept, cut, maps, roughness, bytes: bytes.byteLength };
    console.log(key.padEnd(36) + " " + tier.padEnd(6) + " " + String(kept).padStart(6) + " tris (target " + target + ", blender " + blended + ")  " + maps.join(", ") + "  " + (bytes.byteLength / 1024).toFixed(0) + " KB");
  }
  const tiers = {};
  for (const tier of Object.keys(files)) {
    const { path, bytes, triangles: count } = files[tier];
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path + ".tmp", bytes);
    renameSync(path + ".tmp", path);
    tiers[tier] = { url: URL_BASE + "/" + folder + "/" + kind + "/" + id + "/" + id + "." + tier + ".glb?v=" + sha(bytes).slice(0, 10), bytes: bytes.byteLength, triangles: count };
  }
  const far = tiers[FAR];
  const hull = tiers[HULL];
  delete tiers[FAR];
  delete tiers[HULL];
  manifest.models[key] = {
    kind,
    id,
    tiers,
    triangles: row.tiers.ultra.triangles,
    tierTriangles: Object.fromEntries(TIERS.map((tier) => [tier, row.tiers[tier].triangles])),
    // Far LOD (scatter props): geometry only, today's M0b cut; view/models.ts reads it from the manifest itself.
    ...(far ? { far } : {}),
    // Hull (crowd models): the Medium mesh, geometry only, for the outline and the ghost on High and Ultra.
    ...(hull ? { hull } : {}),
    sockets,
    clips: [],
    size,
  };
  report.models[key] = row;
}

for (const [folder, manifest] of Object.entries(manifests)) {
  // Keep only the tiers this script writes (the old .high/.medium files are overwritten in place).
  manifest.generatedAt = new Date().toISOString();
  manifest.models = Object.fromEntries(Object.entries(manifest.models).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(join(OUT, folder, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
}
report.generatedAt = new Date().toISOString();
writeFileSync(reportPath, JSON.stringify(report, null, 1));
console.log("report: " + reportPath);
