/**
 * M0b rig check without a browser: reads a processed model
 * (art-src/models/<kind>/<id>.glb), normalises it the way view/models.ts
 * does, builds its rig and weights (view/crowd-rig.ts), skins it on the CPU
 * at a few clip times and writes coloured PLY meshes (vertex colour = the
 * bone with the most weight) for Blender to render:
 *
 *   npx tsx scripts/models/m0b-rig-preview.ts <out dir> <content key>[:clip@t,clip@t…] …
 *   e.g. enemies/moss-grunt:idle@0,move@0.25,attack@0.5,death@0.6
 *
 * Build-time only (gltf-transform from Space Typing's node_modules); never shipped.
 */
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { bakeRig, clipRow, rigOf, skinOnCpu, skinWeights, type ClipName } from "../../src/view/crowd-rig";
import { MODEL_SPECS } from "../../src/view/model-specs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

async function dependency(name: string): Promise<any> {
  for (const base of [ROOT, resolve(ROOT, "../space-typing")]) {
    try {
      return await import(pathToFileURL(createRequire(join(base, "package.json")).resolve(name)).href);
    } catch {
      /* next */
    }
  }
  throw new Error(name + " not found");
}

const PALETTE = [
  [0.5, 0.5, 0.5], [0.95, 0.3, 0.3], [0.3, 0.8, 0.3], [0.95, 0.85, 0.2], [0.3, 0.5, 0.95], [0.6, 0.3, 0.9], [0.2, 0.85, 0.85], [0.95, 0.55, 0.15],
  [0.85, 0.4, 0.7], [0.55, 0.75, 0.25], [0.25, 0.35, 0.6], [0.7, 0.55, 0.35], [0.95, 0.95, 0.95], [0.35, 0.2, 0.15], [0.1, 0.6, 0.45], [0.9, 0.7, 0.8],
];

async function main(): Promise<void> {
  const [out, ...targets] = process.argv.slice(2);
  if (!out || targets.length === 0) throw new Error("usage: m0b-rig-preview.ts <out dir> <content>[:clip@t,…] …");
  mkdirSync(out, { recursive: true });
  const { NodeIO } = await dependency("@gltf-transform/core");
  const { ALL_EXTENSIONS } = await dependency("@gltf-transform/extensions");
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  for (const target of targets) {
    const [content, list] = target.split(":") as [string, string | undefined];
    const spec = MODEL_SPECS[content];
    if (!spec) throw new Error("no spec " + content);
    const [kind, id] = spec.manifest.split("/");
    const document = await io.read(join(ROOT, "art-src/models", kind!, id + ".glb"));
    const positions: number[] = [];
    const faces: number[] = [];
    for (const node of document.getRoot().listNodes()) {
      const mesh = node.getMesh();
      if (!mesh) continue;
      const m = node.getWorldMatrix();
      for (const primitive of mesh.listPrimitives()) {
        const position = primitive.getAttribute("POSITION");
        const base = positions.length / 3;
        const el: number[] = [];
        for (let i = 0; i < position.getCount(); i += 1) {
          position.getElement(i, el);
          const [x, y, z] = el as [number, number, number];
          positions.push(m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]);
        }
        const index = primitive.getIndices();
        for (let i = 0; i < index.getCount(); i += 1) faces.push(base + index.getScalar(i));
      }
    }
    // Normalise like view/models.ts: nose +z (turn π), feet at y = 0, height 1.
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < positions.length; i += 3) {
      positions[i] = -positions[i]!;
      positions[i + 2] = -positions[i + 2]!;
      minY = Math.min(minY, positions[i + 1]!);
      maxY = Math.max(maxY, positions[i + 1]!);
    }
    const h = maxY - minY;
    for (let i = 0; i < positions.length; i += 3) {
      positions[i] = positions[i]! / h;
      positions[i + 1] = (positions[i + 1]! - minY) / h;
      positions[i + 2] = positions[i + 2]! / h;
    }
    const rig = rigOf(spec.rig, spec.marks, spec.ours, spec.manifest);
    if (!rig) throw new Error("no rig for " + content);
    const weights = skinWeights(positions, rig.bones);
    const baked = bakeRig(rig);
    const colors: number[] = [];
    for (let v = 0; v < positions.length / 3; v += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let k = 0; k < 4; k += 1) {
        const w = weights.weight[v * 4 + k]!;
        const c = PALETTE[weights.index[v * 4 + k]! % PALETTE.length]!;
        r += c[0]! * w;
        g += c[1]! * w;
        b += c[2]! * w;
      }
      colors.push(r, g, b);
    }
    const poses = (list ?? "idle@0").split(",").map((item) => item.split("@") as [ClipName, string]);
    for (const [clip, time] of poses) {
      const at = baked.index[clip];
      if (at === undefined) continue;
      const row = clipRow(baked.clips[at]!, Number(time));
      const skinned = skinOnCpu(baked, positions, weights.index, weights.weight, row);
      const lines = ["ply", "format ascii 1.0", "element vertex " + skinned.length / 3, "property float x", "property float y", "property float z", "property uchar red", "property uchar green", "property uchar blue", "element face " + faces.length / 3, "property list uchar int vertex_indices", "end_header"];
      for (let v = 0; v < skinned.length / 3; v += 1) {
        // PLY in Blender's frame: (x, -z, y) of the glTF-like frame.
        lines.push([skinned[v * 3]!, -skinned[v * 3 + 2]!, skinned[v * 3 + 1]!].map((n) => n.toFixed(5)).join(" ") + " " + [0, 1, 2].map((c) => Math.round(colors[v * 3 + c]! * 255)).join(" "));
      }
      for (let f = 0; f < faces.length; f += 3) lines.push("3 " + faces[f] + " " + faces[f + 1] + " " + faces[f + 2]);
      writeFileSync(join(out, id + "__" + clip + "@" + time + ".ply"), lines.join("\n") + "\n");
    }
    console.log(content, positions.length / 3, "vertices,", rig.bones.length, "bones,", baked.rows, "rows; poses", poses.map((p) => p.join("@")).join(" "));
  }
}

await main();
