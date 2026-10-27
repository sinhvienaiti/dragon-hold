#!/usr/bin/env node
/**
 * M0b step between the Blender static pass and the packager (parent repo
 * scripts/models/prepare-models.mjs): each processed model in
 * art-src/models/<kind>/<id>.glb keeps only its base-colour map (the game
 * draws crowd and props matte with its own painted shading: no normal or
 * metal-roughness map), metalness 0, roughness 0.9, and is simplified with
 * meshopt down to the preset's triangle target when the Blender decimation
 * stopped above it (UV seams are locked there).
 *
 *   node scripts/models/m0b-strip.mjs [--only <kind>/<id>,…]
 *
 * Build time only; gltf-transform and meshoptimizer come from Space Typing's
 * node_modules (the parent repo's model tools resolve them the same way).
 * Writes in place: art-src/models is this game's own processed copy, never
 * the owner's originals in art-src/3d.
 */
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const PRESET = join(ROOT, "scripts/models/presets/dragon-hold-m0b.json");
const DEPENDENCY_ROOTS = [ROOT, resolve(ROOT, "../space-typing"), resolve(ROOT, "../../games/space-typing")];

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

const only = (() => {
  const index = process.argv.indexOf("--only");
  return index > 0 ? new Set(process.argv[index + 1].split(",")) : null;
})();

const preset = JSON.parse(readFileSync(PRESET, "utf8"));
const { NodeIO } = await dependency("@gltf-transform/core");
const { ALL_EXTENSIONS } = await dependency("@gltf-transform/extensions");
const { prune, simplify, weld } = await dependency("@gltf-transform/functions");
const { MeshoptSimplifier } = await dependency("meshoptimizer");
await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

const triangles = (document) => document.getRoot().listMeshes().flatMap((mesh) => mesh.listPrimitives()).reduce((sum, primitive) => sum + Math.floor((primitive.getIndices()?.getCount() ?? 0) / 3), 0);

for (const [key, entry] of Object.entries(preset.models)) {
  if (only !== null && !only.has(key)) continue;
  const [kind, id] = key.split("/");
  const file = join(ROOT, "art-src/models", kind, id + ".glb");
  if (!existsSync(file)) {
    console.log("MISSING " + key + " (" + file + ")");
    continue;
  }
  const document = await io.read(file);
  for (const material of document.getRoot().listMaterials()) {
    material.setNormalTexture(null);
    material.setMetallicRoughnessTexture(null);
    material.setOcclusionTexture(null);
    material.setEmissiveTexture(null);
    material.setMetallicFactor(0);
    material.setRoughnessFactor(0.9);
  }
  // "cut": boxes [x0, y0, z0, x1, y1, z1] in the processed frame (metres); triangles wholly inside are dropped
  // (a Multiview seam such as the warden's doubled club). The owner's original is never touched.
  let cut = 0;
  for (const box of entry.cut ?? []) {
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
  if (cut > 0) console.log(key + ": cut " + cut + " triangles");
  const before = triangles(document);
  const target = entry.triangles;
  const steps = [weld()];
  // Scatter props are seen from 60 m and more: a looser error bound reaches their hard budget.
  const scatter = key.startsWith("props/pine-river-");
  if (before > target * 1.05) steps.push(simplify({ simplifier: MeshoptSimplifier, ratio: target / before, error: scatter ? 0.03 : 0.004, lockBorder: false }));
  steps.push(prune({ keepLeaves: true, keepExtras: true }));
  await document.transform(...steps);
  let after = triangles(document);
  await io.write(file, document);
  if (scatter && after > target * 1.15) {
    // UV seams stop the simplifier on Tripo atlases: Blender's collapse without the seam lock reaches the budget
    // (UVs stay per corner, so the texture holds; a topology-free pass smeared whole islands and was dropped).
    const blender = ["/Applications/Blender.app/Contents/MacOS/Blender", process.env.BLENDER_BIN].find((path) => path && existsSync(path));
    if (blender) {
      execFileSync(blender, ["-b", "--factory-startup", "--python-exit-code", "1", "-P", join(ROOT, "scripts/models/blender/m0b_decimate.py"), "--", file, file, String(target)], { stdio: "ignore" });
      const again = await io.read(file);
      await again.transform(prune({ keepLeaves: true, keepExtras: true }));
      for (const material of again.getRoot().listMaterials()) {
        material.setNormalTexture(null);
        material.setMetallicRoughnessTexture(null);
        material.setMetallicFactor(0);
        material.setRoughnessFactor(0.9);
      }
      await again.transform(prune({ keepLeaves: true, keepExtras: true }));
      after = triangles(again);
      await io.write(file, again);
    }
  }
  console.log(key.padEnd(34) + " " + before + " → " + after + " triangles (target " + target + "), base colour only");
}
