/**
 * Map pilot L7 ground paint (parent docs/tools/map-factory/MAP_PLAN.md §2.4,
 * §3.3 A2–A3; from the map spike): paint masks over the play area baked once
 * at load from the layout's stamps and the height field's distance masks, the
 * pine-river ground tiles (T1–T8) as brush detail under the painted palette,
 * and the four decal sheets (D1–D4) laid by texture bombing (one decal per
 * hashed cell, density read from the mask at the decal's centre, so no decal
 * is ever cut). Mask channels (potentials: 0.5 is the painted edge, the shader
 * cuts it with noise): mask 1 R dirt, G branch footpath, B open-meadow
 * flowers, A canopy shade; mask 2 R main footpath, G cliff ground.
 * A3: once the tiles and decals have loaded, `bakeGround` renders the whole
 * paint of the mask square into a 2048² colour target (about 5 cm a texel);
 * the ground shader then reads that one texture inside the square, paints
 * only the cliff stone live (steep faces stretch in a top-down bake), and
 * keeps the live paint outside the square. `?bake=0` keeps the live paint.
 * Tiles and decals load from /art-src in dev only (interim until
 * prepare-ground and prepare-decals, Codex MF-C24); until a texture loads it
 * is a 1 × 1 texel of its own mean colour, so the palette alone shows.
 * Owner: map pilot.
 */
import * as THREE from "three";
import type { Quality } from "../app/contracts";
import { LAYOUT_RULES, type MapLayout, type PaintDisc } from "./layout";
import { DH_GLSL, fbm, GROUND_PARS, PINE_RIVER_GROUND, type HeightField, type PaintLook } from "./terrain";

/** Mask square half side around the dais and texel size, metres. */
export const PAINT_MASK = { halfM: 52, cellM: 0.25 } as const;

/** The baked ground colour target: texels a side (2048 over 104 m is about 5 cm a texel). */
export const GROUND_BAKE_SIZE = 2048;

/** Ground tiles: file, metres per repeat, linear mean colour (measured once with ImageMagick, -colorspace RGB). */
const TILES = {
  uTGrassA: { file: "ground/pine-river/grass-a.png", mean: [0.1346, 0.2216, 0.0679] },
  uTGrassB: { file: "ground/pine-river/grass-b.1024.png", mean: [0.093, 0.1827, 0.078] },
  uTMoss: { file: "ground/pine-river/moss.fix.png", mean: [0.1065, 0.1878, 0.0832] },
  uTPath: { file: "ground/pine-river/path.png", mean: [0.4155, 0.2689, 0.135] },
  uTEarth: { file: "ground/pine-river/earth.png", mean: [0.1101, 0.0646, 0.0318] },
  uTSand: { file: "ground/pine-river/river-sand.png", mean: [0.5685, 0.4972, 0.4149] },
  uTRock: { file: "ground/pine-river/rock.1024.png", mean: [0.1235, 0.1392, 0.1465] },
  uTLitter: { file: "ground/pine-river/pine-litter.png", mean: [0.1205, 0.0649, 0.0331] },
} as const;

/** Decal sheets (2 × 2 each): the accepted files of art request 015 / Codex 017. */
const DECALS = {
  uDDirt: "decals/pine-river/dirt-patches.alpha.png",
  uDFlowers: "decals/pine-river/flower-clusters.015.1024.png",
  uDLitter: "decals/pine-river/forest-litter.alpha.png",
  uDMoss: "decals/pine-river/moss-puddles.v1.alpha.png",
} as const;

/**
 * Map pilot palette over PINE_RIVER_GROUND (MAP_PLAN V2, V13, 2.5): one calm
 * bright meadow green (hue about 95°), a moss forest floor instead of teal,
 * cool blue-grey shade instead of violet, pale warm cliff stone and scree.
 */
export const PILOT_GROUND = {
  uGrassDeep: "#4f7a40",
  uGrassMid: "#69ab50",
  uGrassLight: "#86c05c",
  uForestFloor: "#4d6a3f",
  uVioletShade: "#b4c0d8",
  uDirt: "#c9a77c",
  uDirtLight: "#dcc59c",
  uDirtDark: "#8a6c4e",
  uRimStone: "#7d7a72",
  uStone: "#bdb9b1",
  uScree: "#b3b1aa",
} as const;

const ART_BASE = "/art-src/";

export interface GroundPaint {
  readonly uniforms: Record<string, { value: unknown }>;
  readonly pars: string;
  readonly paint: string;
  /** Resolves once every tile and decal has loaded or failed. */
  readonly ready: Promise<void>;
  /** Mask bake time, ms. */
  readonly bakeMs: number;
  /**
   * Bakes the paint into the colour target (A3). The shader compiles off the main thread first
   * (KHR_parallel_shader_compile where the GPU has it); resolves with the blocking part in ms
   * (field textures, render, mipmaps, one texel read back), or null when the bake is off.
   */
  bake(renderer: THREE.WebGLRenderer, look: PaintLook): Promise<number | null>;
  /** The last bake's parts, ms: field textures (blocking), compile wait (not blocking), render and mipmaps (blocking). */
  readonly bakeSplit: { prepMs: number; compileMs: number; renderMs: number } | null;
  dispose(): void;
}

function meanTexel(mean: readonly number[]): THREE.DataTexture {
  // The mean is linear; the texel is stored as sRGB like the image it stands in for.
  const c = new THREE.Color().setRGB(mean[0]!, mean[1]!, mean[2]!, THREE.LinearSRGBColorSpace);
  const srgb = c.clone().convertLinearToSRGB();
  const texture = new THREE.DataTexture(new Uint8Array([Math.round(srgb.r * 255), Math.round(srgb.g * 255), Math.round(srgb.b * 255), 255]), 1, 1);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}

function emptyDecal(): THREE.DataTexture {
  const texture = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
  texture.needsUpdate = true;
  return texture;
}

const smooth = (edge0: number, edge1: number, value: number): number => {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

/** Potential of a (lobed, stretched) disc at offset (dx, dz): 1 at the centre, 0.5 at the rim, 0 at rim + falloff. */
function discPotential(disc: PaintDisc, dx: number, dz: number): number {
  let r = disc.r;
  let d = Math.hypot(dx, dz);
  if (disc.lobes !== undefined && d > 1e-6) {
    // Stretch along `angle`, then lobe the radius by the direction.
    const ca = Math.cos(disc.angle ?? 0);
    const sa = Math.sin(disc.angle ?? 0);
    const u = (dx * ca + dz * sa) / (disc.stretch ?? 1);
    const v = -dx * sa + dz * ca;
    d = Math.hypot(u, v);
    const a = Math.atan2(v, u);
    const phase = disc.phase ?? 0;
    const wobble = Math.min(0.25, disc.wobble ?? 0);
    r *= 1 + wobble * (0.7 * Math.sin(disc.lobes * a + phase) + 0.3 * Math.sin((disc.lobes + 2) * a + 2.3 * phase));
  }
  return d <= r ? 1 - 0.5 * (d / r) * (d / r) : 0.5 * (1 - smooth(r, r + disc.falloff, d));
}

export interface PaintMasks {
  readonly texture: THREE.DataTexture;
  readonly texture2: THREE.DataTexture;
  readonly size: number;
  readonly origin: [number, number];
}

/** Bakes the two RGBA paint masks (see the file header for the channels). */
export function bakePaintMask(field: HeightField, layout: MapLayout): PaintMasks {
  const { halfM, cellM } = PAINT_MASK;
  const [cx, cz] = field.map.dais.center;
  const size = Math.round((halfM * 2) / cellM);
  const ox = cx - halfM;
  const oz = cz - halfM;
  const dirt = new Float32Array(size * size);
  const path = new Float32Array(size * size);
  const main = new Float32Array(size * size);
  const shade = new Float32Array(size * size);
  const flowers = new Float32Array(size * size);
  const cliffGround = new Float32Array(size * size);
  const play = field.map.terrain.playRadiusM;
  const atX = (x: number): number => Math.floor((x - ox) / cellM);
  const atZ = (z: number): number => Math.floor((z - oz) / cellM);

  // R: dirt patches (max of potentials).
  for (const disc of layout.dirt) {
    const reach = disc.r * (1 + Math.min(0.25, disc.wobble ?? 0)) * (disc.stretch ?? 1) + disc.falloff;
    for (let j = Math.max(0, atZ(disc.z - reach)); j <= Math.min(size - 1, atZ(disc.z + reach)); j += 1) {
      const z = oz + (j + 0.5) * cellM;
      for (let i = Math.max(0, atX(disc.x - reach)); i <= Math.min(size - 1, atX(disc.x + reach)); i += 1) {
        const x = ox + (i + 0.5) * cellM;
        if (Math.abs(x - disc.x) > reach || Math.abs(z - disc.z) > reach) continue;
        const p = discPotential(disc, x - disc.x, z - disc.z);
        const index = j * size + i;
        if (p * disc.strength > dirt[index]!) dirt[index] = p * disc.strength;
      }
    }
  }
  // A: canopy shade under every layout tree (crown radius), soft, pushed to the shade side with the dirt.
  for (const tree of layout.trees) {
    const r = tree.radius * 1.15;
    const reach = r + 1.4;
    for (let j = Math.max(0, atZ(tree.z - reach)); j <= Math.min(size - 1, atZ(tree.z + reach)); j += 1) {
      const z = oz + (j + 0.5) * cellM;
      for (let i = Math.max(0, atX(tree.x - reach)); i <= Math.min(size - 1, atX(tree.x + reach)); i += 1) {
        const x = ox + (i + 0.5) * cellM;
        const d = Math.hypot(x - tree.x, z - tree.z);
        const p = 0.5 * (1 - smooth(0, reach, d)) + 0.5 * (1 - smooth(r * 0.5, r, d));
        const index = j * size + i;
        shade[index] = Math.max(shade[index]!, p * 0.75);
      }
    }
  }
  // G (branch) and mask 2 R (main): footpaths, 1 on the centre line, 0.5 at the edge, 0 at twice the half width.
  for (const fp of layout.footpaths) {
    const target = fp.tier === "main" ? main : path;
    const line = fp.line;
    for (let k = 0; k < line.count - 1; k += 1) {
      const ax = line.xs[k]!;
      const az = line.zs[k]!;
      const bx = line.xs[k + 1]!;
      const bz = line.zs[k + 1]!;
      const half = Math.max(fp.halves[k]!, fp.halves[k + 1]!);
      const reach = half * 2 + 0.3;
      const dx = bx - ax;
      const dz = bz - az;
      const span = dx * dx + dz * dz;
      for (let j = Math.max(0, atZ(Math.min(az, bz) - reach)); j <= Math.min(size - 1, atZ(Math.max(az, bz) + reach)); j += 1) {
        const z = oz + (j + 0.5) * cellM;
        for (let i = Math.max(0, atX(Math.min(ax, bx) - reach)); i <= Math.min(size - 1, atX(Math.max(ax, bx) + reach)); i += 1) {
          const x = ox + (i + 0.5) * cellM;
          const t = span > 0 ? Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / span)) : 0;
          const hw = fp.halves[k]! + (fp.halves[k + 1]! - fp.halves[k]!) * t;
          const d = Math.hypot(x - ax - dx * t, z - az - dz * t);
          const p = Math.max(0, 1 - d / (2 * hw));
          const index = j * size + i;
          target[index] = Math.max(target[index]!, p);
        }
      }
    }
  }
  // B: flowers gathered at edges (V14: the open meadow keeps few); A: the skirt forest floor from the layout's forest edge;
  // mask 2 G: the cliff ground (ledges and tops).
  const P = LAYOUT_RULES.paint;
  const seed = field.map.terrain.seed;
  const rimOf = (v: number): number => smooth(0.12, 0.32, v) * (1 - smooth(0.4, 0.5, v));
  // Cliff ground only near a cliff line (the ledges and the top lip lie within 12 m of it).
  const cliffBoxes = layout.cliffs.map((cl) => ({ cl, minX: cl.line.minX - 12, maxX: cl.line.maxX + 12, minZ: cl.line.minZ - 12, maxZ: cl.line.maxZ + 12 }));
  // Field cell and fraction per mask column and row (bilinear reads without a search per texel).
  const { xs, zs, masks } = field;
  const fnx = xs.length;
  const cellAt = (axis: Float64Array, value: number): [number, number] => {
    let lo = 0;
    let hi = axis.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (axis[mid]! <= value) lo = mid;
      else hi = mid;
    }
    return [lo, Math.min(1, Math.max(0, (value - axis[lo]!) / (axis[lo + 1]! - axis[lo]!)))];
  };
  const colCell = new Int32Array(size);
  const colT = new Float64Array(size);
  const rowCell = new Int32Array(size);
  const rowT = new Float64Array(size);
  for (let k = 0; k < size; k += 1) {
    [colCell[k], colT[k]] = cellAt(xs, ox + (k + 0.5) * cellM);
    [rowCell[k], rowT[k]] = cellAt(zs, oz + (k + 0.5) * cellM);
  }
  const fieldAt = (i: number, j: number, channel: number): number => {
    const ci = colCell[i]!;
    const tx = colT[i]!;
    const base = rowCell[j]! * fnx + ci;
    const tz = rowT[j]!;
    const a = masks[base * 4 + channel]!;
    const b = masks[(base + 1) * 4 + channel]!;
    const c = masks[(base + fnx) * 4 + channel]!;
    const d = masks[(base + fnx + 1) * 4 + channel]!;
    return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
  };
  for (let j = 0; j < size; j += 1) {
    const z = oz + (j + 0.5) * cellM;
    for (let i = 0; i < size; i += 1) {
      const x = ox + (i + 0.5) * cellM;
      const index = j * size + i;
      const r = Math.hypot(x - cx, z - cz);
      const forest = fieldAt(i, j, 3);
      const edge = r > play - 10 ? layout.forestEdge(x, z) : play;
      shade[index] = Math.max(shade[index]!, Math.max(forest, 0.75) * smooth(edge - 3, edge + 2.5, r));
      for (const box of cliffBoxes) {
        if (x < box.minX || x > box.maxX || z < box.minZ || z > box.maxZ) continue;
        const lift = box.cl.lift(x, z);
        // Ledges and the top lip only; the plateau past it is forest.
        if (lift > 0.05) cliffGround[index] = Math.max(cliffGround[index]!, smooth(0.4, 1.6, lift) * (1 - smooth(box.cl.topS + 0.5, box.cl.topS + 2.5, box.cl.offset(x, z).s)));
      }
      if (r < 7.5 || r > edge + 4) continue;
      const laneGap = fieldAt(i, j, 0) - fieldAt(i, j, 1);
      const water = fieldAt(i, j, 2);
      const trod = Math.max(dirt[index]!, main[index]!);
      const open = smooth(0.8, 2.6, laneGap) * smooth(0.8, 2.2, water) * (1 - smooth(0.25, 0.5, trod)) * (1 - smooth(0.3, 0.5, path[index]!)) * (1 - smooth(0.25, 0.55, shade[index]!));
      if (open <= 0) continue;
      // Flowers sit by trodden and path rims (the reference's tufts by every trodden edge) and at canopy skirts.
      const rim = Math.max(rimOf(trod), rimOf(path[index]!), smooth(0.12, 0.3, shade[index]!) * (1 - smooth(0.3, 0.45, shade[index]!)));
      const patch = smooth(0.5, 0.7, fbm(x / P.flowerPatchWaveM + 13.1, z / P.flowerPatchWaveM - 4.7, seed + 31, 3));
      flowers[index] = Math.min(1, open * (patch * 0.28 + rim * 0.85) * (1 - smooth(edge - 1, edge + 4, r)) * smooth(7.5, 10, r));
    }
  }
  const data = new Uint8Array(size * size * 4);
  const data2 = new Uint8Array(size * size * 4);
  for (let index = 0; index < size * size; index += 1) {
    data[index * 4] = Math.round(Math.min(1, dirt[index]!) * 255);
    data[index * 4 + 1] = Math.round(Math.min(1, path[index]!) * 255);
    data[index * 4 + 2] = Math.round(Math.min(1, flowers[index]!) * 255);
    data[index * 4 + 3] = Math.round(Math.min(1, shade[index]!) * 255);
    data2[index * 4] = Math.round(Math.min(1, main[index]!) * 255);
    data2[index * 4 + 1] = Math.round(Math.min(1, cliffGround[index]!) * 255);
    data2[index * 4 + 3] = 255;
  }
  const make = (bytes: Uint8Array<ArrayBuffer>): THREE.DataTexture => {
    const texture = new THREE.DataTexture(bytes, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
    texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.flipY = false;
    texture.needsUpdate = true;
    return texture;
  };
  return { texture: make(data), texture2: make(data2), size, origin: [ox, oz] };
}

/** Page-URL switches for captures and the perf split (paint=m0b, decals=0, tiles=0, decor=0, bake=0, warm=0); null outside a page. */
export function mapSwitch(name: string): string | null {
  try {
    return new URLSearchParams(globalThis.location?.search ?? "").get(name);
  } catch {
    return null;
  }
}

/** The height field over the mask square (one texel a field cell, plus a margin): height and normal, and the four distance masks. */
function fieldTextures(field: HeightField): { geo: THREE.DataTexture; masks: THREE.DataTexture; rect: THREE.Vector4 } {
  const { halfM } = PAINT_MASK;
  const [cx, cz] = field.map.dais.center;
  const { xs, zs, heights, masks } = field;
  const nx = xs.length;
  // The fine part of the axes is uniform; take the cells covering the square plus one.
  const first = (axis: Float64Array, value: number): number => {
    let k = 0;
    while (k < axis.length - 1 && axis[k + 1]! <= value) k += 1;
    return Math.max(0, k - 1);
  };
  const i0 = first(xs, cx - halfM);
  const j0 = first(zs, cz - halfM);
  let i1 = i0;
  while (i1 < xs.length - 1 && xs[i1]! < cx + halfM) i1 += 1;
  let j1 = j0;
  while (j1 < zs.length - 1 && zs[j1]! < cz + halfM) j1 += 1;
  i1 = Math.min(xs.length - 1, i1 + 1);
  j1 = Math.min(zs.length - 1, j1 + 1);
  const w = i1 - i0 + 1;
  const h = j1 - j0 + 1;
  const geo = new Float32Array(w * h * 4);
  const mk = new Float32Array(w * h * 4);
  const at = (i: number, j: number): number => heights[Math.min(zs.length - 1, Math.max(0, j)) * nx + Math.min(nx - 1, Math.max(0, i))]!;
  for (let j = 0; j < h; j += 1) {
    for (let i = 0; i < w; i += 1) {
      const gi = i0 + i;
      const gj = j0 + j;
      const o = (j * w + i) * 4;
      const dx = xs[Math.min(nx - 1, gi + 1)]! - xs[Math.max(0, gi - 1)]!;
      const dz = zs[Math.min(zs.length - 1, gj + 1)]! - zs[Math.max(0, gj - 1)]!;
      const sx = (at(gi + 1, gj) - at(gi - 1, gj)) / dx;
      const sz = (at(gi, gj + 1) - at(gi, gj - 1)) / dz;
      const length = Math.hypot(sx, 1, sz);
      geo[o] = at(gi, gj);
      geo[o + 1] = -sx / length;
      geo[o + 2] = 1 / length;
      geo[o + 3] = -sz / length;
      for (let c = 0; c < 4; c += 1) mk[o + c] = masks[(gj * nx + gi) * 4 + c]!;
    }
  }
  const make = (data: Float32Array<ArrayBuffer>): THREE.DataTexture => {
    const texture = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.FloatType);
    texture.magFilter = texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    texture.flipY = false;
    texture.needsUpdate = true;
    return texture;
  };
  // rect: world x, z of texel (0, 0) and the cell size (uniform in the fine part).
  return { geo: make(geo), masks: make(mk), rect: new THREE.Vector4(xs[i0]!, zs[j0]!, xs[i0 + 1]! - xs[i0]!, zs[j0 + 1]! - zs[j0]!) };
}

export function buildGroundPaint(field: HeightField, layout: MapLayout, quality: Quality): GroundPaint {
  const t0 = performance.now();
  const mask = bakePaintMask(field, layout);
  const bakeMs = performance.now() - t0;
  // Interim (MF-C24 not done): the tiles and decals come from /art-src in dev only; a build shows the palette.
  const artOn = import.meta.env.DEV;
  const tilesOn = artOn && quality !== "low" && mapSwitch("tiles") !== "0";
  const decalsOn = artOn && quality !== "low";
  const uniforms: Record<string, { value: unknown }> = {
    uPaintMask: { value: mask.texture },
    uPaintMask2: { value: mask.texture2 },
    uMaskRect: { value: new THREE.Vector4(mask.origin[0], mask.origin[1], PAINT_MASK.halfM * 2, PAINT_MASK.halfM * 2) },
    uDetail: { value: tilesOn ? 0.8 : 0 },
    uDecalOn: { value: quality === "low" || mapSwitch("decals") === "0" ? 0 : 1 },
    uBaked: { value: emptyDecal() },
    uBakeOn: { value: 0 },
  };
  for (const [name, hex] of Object.entries(PILOT_GROUND)) uniforms[name] = { value: new THREE.Color(hex) };
  const disposables: { dispose(): void }[] = [mask.texture, mask.texture2, uniforms.uBaked!.value as THREE.Texture];
  const loader = new THREE.TextureLoader();
  const anisotropy = quality === "ultra" ? 8 : quality === "high" ? 4 : 1;
  const jobs: Promise<void>[] = [];
  for (const [name, tile] of Object.entries(TILES)) {
    const fallback = meanTexel(tile.mean);
    uniforms[name] = { value: fallback };
    uniforms[name.replace("uT", "uM")] = { value: new THREE.Vector3(tile.mean[0], tile.mean[1], tile.mean[2]) };
    disposables.push(fallback);
    if (!tilesOn) continue;
    jobs.push(
      loader
        .loadAsync(ART_BASE + tile.file)
        .then((texture) => {
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
          texture.anisotropy = anisotropy;
          uniforms[name]!.value = texture;
          disposables.push(texture);
        })
        .catch(() => console.warn("paint: " + tile.file + " did not load; the palette stays")),
    );
  }
  for (const [name, file] of Object.entries(DECALS)) {
    const fallback = emptyDecal();
    uniforms[name] = { value: fallback };
    disposables.push(fallback);
    if (!decalsOn) continue;
    jobs.push(
      loader
        .loadAsync(ART_BASE + file)
        .then((texture) => {
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.premultiplyAlpha = true;
          texture.anisotropy = anisotropy;
          texture.needsUpdate = true;
          uniforms[name]!.value = texture;
          disposables.push(texture);
        })
        .catch(() => console.warn("paint: " + file + " did not load; no decals of it")),
    );
  }

  let target: THREE.WebGLRenderTarget | null = null;
  let lastSplit: { prepMs: number; compileMs: number; renderMs: number } | null = null;
  const bake = async (renderer: THREE.WebGLRenderer, look: PaintLook): Promise<number | null> => {
    if (mapSwitch("bake") === "0" || quality === "low") return null;
    const t = performance.now();
    const geo = fieldTextures(field);
    const size = GROUND_BAKE_SIZE;
    target?.dispose();
    target = new THREE.WebGLRenderTarget(size, size, {
      type: THREE.UnsignedByteType,
      format: THREE.RGBAFormat,
      generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      colorSpace: THREE.SRGBColorSpace,
      anisotropy: Math.max(anisotropy, 4),
    });
    const palette: Record<string, { value: THREE.Color }> = {};
    for (const [name, hex] of Object.entries(PINE_RIVER_GROUND)) palette[name] = { value: new THREE.Color(hex) };
    const material = new THREE.ShaderMaterial({
      uniforms: {
        ...look.uniforms,
        ...palette,
        ...uniforms,
        uGeo: { value: geo.geo },
        uFieldMasks: { value: geo.masks },
        uFieldRect: { value: geo.rect },
      },
      vertexShader: BAKE_VERTEX,
      fragmentShader: DH_GLSL + GROUND_PARS + PAINT_PARS + BAKE_FIELD + "void main() {\n" + BAKE_INPUTS + "\n{\n" + PAINT_LIVE + "\n}\ngl_FragColor = vec4(diffuseColor.rgb, 1.0);\n}\n",
      depthTest: false,
      depthWrite: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    quad.frustumCulled = false;
    const scene = new THREE.Scene();
    scene.add(quad);
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const tPrep = performance.now();
    await renderer.compileAsync(scene, camera);
    const tCompiled = performance.now();
    const previous = renderer.getRenderTarget();
    const toneMapping = renderer.toneMapping;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.setRenderTarget(target);
    renderer.render(scene, camera);
    renderer.setRenderTarget(previous);
    renderer.toneMapping = toneMapping;
    // Wait for the GPU so the load time is honest (one texel read back).
    const probe = new Uint8Array(4);
    renderer.readRenderTargetPixels(target, size >> 1, size >> 1, 1, 1, probe);
    const tDone = performance.now();
    lastSplit = { prepMs: tPrep - t, compileMs: tCompiled - tPrep, renderMs: tDone - tCompiled };
    material.dispose();
    quad.geometry.dispose();
    geo.geo.dispose();
    geo.masks.dispose();
    uniforms.uBaked!.value = target.texture;
    uniforms.uBakeOn!.value = 1;
    return lastSplit.prepMs + lastSplit.renderMs;
  };

  return {
    uniforms,
    pars: PAINT_PARS,
    paint: PAINT_GLSL,
    ready: Promise.all(jobs).then(() => undefined),
    bakeMs,
    bake,
    get bakeSplit() {
      return lastSplit;
    },
    dispose(): void {
      for (const item of disposables) item.dispose();
      target?.dispose();
    },
  };
}

const BAKE_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

/** Bake pass: the height field read back per texel (manual bilinear on the float textures). */
const BAKE_FIELD = /* glsl */ `
uniform sampler2D uGeo;
uniform sampler2D uFieldMasks;
uniform vec4 uFieldRect;
varying vec2 vUv;
vec4 dhFieldFetch(sampler2D tex, vec2 w) {
  vec2 g = (w - uFieldRect.xy) / uFieldRect.zw;
  ivec2 size = textureSize(tex, 0);
  vec2 f = fract(g);
  ivec2 i = clamp(ivec2(floor(g)), ivec2(0), size - 2);
  vec4 a = texelFetch(tex, i, 0);
  vec4 b = texelFetch(tex, i + ivec2(1, 0), 0);
  vec4 c = texelFetch(tex, i + ivec2(0, 1), 0);
  vec4 d = texelFetch(tex, i + ivec2(1, 1), 0);
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
`;

/** Bake pass: the names the paint code reads (vDhWorld, vDhNormal, vDhMask, diffuseColor). */
const BAKE_INPUTS = /* glsl */ `
vec2 dhBakeP = uMaskRect.xy + vUv * uMaskRect.zw;
vec4 dhGeo = dhFieldFetch(uGeo, dhBakeP);
vec3 vDhWorld = vec3(dhBakeP.x, dhGeo.x, dhBakeP.y);
vec3 vDhNormal = normalize(dhGeo.yzw);
vec4 vDhMask = dhFieldFetch(uFieldMasks, dhBakeP);
vec4 diffuseColor = vec4(1.0);
`;

const PAINT_PARS = /* glsl */ `
uniform sampler2D uPaintMask;
uniform sampler2D uPaintMask2;
uniform vec4 uMaskRect;
uniform float uDetail;
uniform float uDecalOn;
uniform sampler2D uBaked;
uniform float uBakeOn;
uniform sampler2D uTGrassA;
uniform sampler2D uTGrassB;
uniform sampler2D uTMoss;
uniform sampler2D uTPath;
uniform sampler2D uTEarth;
uniform sampler2D uTSand;
uniform sampler2D uTRock;
uniform sampler2D uTLitter;
uniform vec3 uMGrassA;
uniform vec3 uMGrassB;
uniform vec3 uMMoss;
uniform vec3 uMPath;
uniform vec3 uMEarth;
uniform vec3 uMSand;
uniform vec3 uMRock;
uniform vec3 uMLitter;
uniform sampler2D uDDirt;
uniform sampler2D uDFlowers;
uniform sampler2D uDLitter;
uniform sampler2D uDMoss;
uniform vec3 uRimStone;
uniform vec3 uStone;
uniform vec3 uScree;
// Tile detail: the tile over its own mean, so the palette keeps the colour and the tile adds the brush.
vec3 dhDetail(vec3 t, vec3 meanC) {
  return mix(vec3(1.0), clamp(t / max(meanC, vec3(0.004)), 0.0, 2.6), uDetail);
}
vec4 dhMaskAt(vec2 w) {
  vec2 uv = (w - uMaskRect.xy) / uMaskRect.zw;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return vec4(0.0);
  return textureLod(uPaintMask, uv, 0.0);
}
vec4 dhMask2At(vec2 w) {
  vec2 uv = (w - uMaskRect.xy) / uMaskRect.zw;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return vec4(0.0);
  return textureLod(uPaintMask2, uv, 0.0);
}
// Texture bombing: one decal per cell (diameter in sizeR metres, kept inside its cell), rotated,
// one of the 2 × 2 sheet quarters by weight; density read at the decal centre by the caller's channel weights.
vec4 dhBomb(sampler2D sheet, vec2 p, vec2 dpx, vec2 dpy, float cell, float seed, vec2 sizeR, vec4 quads, vec4 chan, vec4 band) {
  vec2 c = floor(p / cell);
  float h0 = dhHash(c + seed);
  float h1 = dhHash(c + seed + 11.31);
  float h2 = dhHash(c + seed + 23.77);
  float h3 = dhHash(c + seed + 37.13);
  float h4 = dhHash(c + seed + 51.97);
  float h5 = dhHash(c + seed + 63.41);
  float d = mix(sizeR.x, sizeR.y, h1);
  vec2 centre = (c + 0.5) * cell + (vec2(h2, h3) - 0.5) * max(cell - d, 0.0);
  vec4 m = dhMaskAt(centre);
  float v = dot(m, chan);
  float density = smoothstep(band.x, band.y, v) * (1.0 - smoothstep(band.z, band.w, v));
  if (h0 > density) return vec4(0.0);
  float a = h4 * 6.2831853;
  mat2 rot = mat2(cos(a), sin(a), -sin(a), cos(a));
  vec2 q = rot * (p - centre) / d;
  if (abs(q.x) > 0.5 || abs(q.y) > 0.5) return vec4(0.0);
  float total = quads.x + quads.y + quads.z + quads.w;
  float pick = h5 * total;
  // Quarter offsets (uv, image flipped): x top-left, y top-right, z bottom-left, w bottom-right.
  vec2 off = vec2(0.0, 0.5);
  if (pick > quads.x) off = vec2(0.5, 0.5);
  if (pick > quads.x + quads.y) off = vec2(0.0, 0.0);
  if (pick > quads.x + quads.y + quads.z) off = vec2(0.5, 0.0);
  vec2 uv = (q + 0.5) * 0.5 + off;
  vec2 gx = rot * dpx / d * 0.5;
  vec2 gy = rot * dpy / d * 0.5;
  return textureGrad(sheet, uv, gx, gy);
}
// V10 cliff stone: pale warm stone, vertical weathering streaks (no horizontal stripes), sun-facing tops lighter.
// Returns the stone colour; *weight gets how much of it shows (steep, away from the water).
vec3 dhStone(vec3 world, vec3 nW, vec2 p, vec2 dpx, vec2 dpy, float edge, float mid, float stroke, out float weight) {
  float slope = 1.0 - clamp(nW.y, 0.0, 1.0);
  weight = smoothstep(0.3, 0.46, slope + (mid - 0.5) * 0.16) * smoothstep(0.6, 2.2, edge);
  if (weight <= 0.0) return vec3(0.0);
  vec3 wdx = dFdx(world);
  vec3 wdy = dFdy(world);
  vec3 bw = abs(nW);
  bw = bw * bw * bw * bw;
  bw /= max(bw.x + bw.y + bw.z, 1e-4);
  vec3 tRock = textureGrad(uTRock, world.zy / 4.5, wdx.zy / 4.5, wdy.zy / 4.5).rgb * bw.x + textureGrad(uTRock, p / 4.5, dpx / 4.5, dpy / 4.5).rgb * bw.y + textureGrad(uTRock, world.xy / 4.5, wdx.xy / 4.5, wdy.xy / 4.5).rgb * bw.z;
  vec3 dRock = dhDetail(tRock, uMRock);
  float streak = dhNoise(vec2((world.x - world.z) * 1.6, world.y * 0.28)) * 0.6 + dhNoise(vec2((world.x + world.z) * 3.1, world.y * 0.5) + 7.0) * 0.4;
  // Faces a step darker than the ledges above them, so the three tiers read.
  return uStone * mix(vec3(1.0), dRock, 0.9) * (0.8 + 0.3 * streak) * mix(0.62, 1.08, smoothstep(0.25, 0.85, nW.y));
}
`;

/**
 * The live paint of one ground fragment: reads vDhWorld, vDhNormal, vDhMask; sets diffuseColor.rgb.
 * The bake pass runs the same code per texel; the cliff stone is left to the ground shader there.
 */
const PAINT_LIVE = /* glsl */ `
vec2 p = vDhWorld.xz;
vec2 dpx = dFdx(p);
vec2 dpy = dFdy(p);
vec3 nW = normalize(vDhNormal);
float slope = 1.0 - clamp(nW.y, 0.0, 1.0);
float big = dhFbm(p * 0.045);
float mid = dhFbm(p * 0.17 + 3.7);
float broad = dhFbm(p * 0.038 + 21.0);
vec2 q = mat2(0.8, -0.6, 0.6, 0.8) * p;
float stroke = dhNoise(q * vec2(0.85, 0.2)) * 0.6 + dhNoise(q * vec2(2.4, 0.55) + 9.0) * 0.4;
vec4 pm = dhMaskAt(p);
vec4 pm2 = dhMask2At(p);
// Perf: each tile is sampled only where its layer can show (coherent branches); explicit gradients
// (taken before any branch) keep the sampling defined inside them.
float edge0 = vDhMask.z;
float laneR = vDhMask.x / max(vDhMask.y, 0.1);
float rr = length(p - uDhCentre);
float shadeGuess = max(vDhMask.w, pm.a);
mat2 turn = mat2(0.6, 0.8, -0.8, 0.6);
vec2 rp = turn * p;
vec2 rdx = turn * dpx;
vec2 rdy = turn * dpy;
// Tiles, world-space (metres per repeat in the divisor); grass A twice (two scales, turned) against repetition.
vec3 tGrass = mix(textureGrad(uTGrassA, p / 7.0, dpx / 7.0, dpy / 7.0).rgb, textureGrad(uTGrassA, rp / 10.5, rdx / 10.5, rdy / 10.5).rgb, 0.45) / max(uMGrassA, vec3(0.004));
float grassB = smoothstep(0.42, 0.62, big + (mid - 0.5) * 0.3);
if (grassB > 0.0) tGrass = mix(tGrass, textureGrad(uTGrassB, p / 8.5 + 0.37, dpx / 8.5, dpy / 8.5).rgb / max(uMGrassB, vec3(0.004)), grassB);
// V2: the meadow brush stays soft (half the tile's contrast) so the field reads calm.
vec3 dGrass = mix(vec3(1.0), clamp(mix(vec3(1.0), tGrass, 0.55), 0.0, 2.0), uDetail);
vec3 dMoss = vec3(1.0);
vec3 dLitter = vec3(1.0);
if (shadeGuess > 0.2) {
  dMoss = dhDetail(textureGrad(uTMoss, p / 6.0, dpx / 6.0, dpy / 6.0).rgb, uMMoss);
  dLitter = dhDetail(textureGrad(uTLitter, rp / 6.0, rdx / 6.0, rdy / 6.0).rgb, uMLitter);
}
vec3 dPath = vec3(1.0);
if (pm.r > 0.3 || pm.g > 0.3 || pm2.r > 0.3 || pm2.g > 0.2 || laneR < 1.3 || rr < 9.0) dPath = dhDetail(textureGrad(uTPath, p / 6.5, dpx / 6.5, dpy / 6.5).rgb, uMPath);
vec3 dEarth = vec3(1.0);
if (pm.r > 0.6 || edge0 < 0.2) dEarth = dhDetail(textureGrad(uTEarth, rp / 5.5, rdx / 5.5, rdy / 5.5).rgb, uMEarth);
vec3 dSand = vec3(1.0);
if (edge0 < 1.8 || rr < 9.0) dSand = dhDetail(textureGrad(uTSand, p / 6.0, dpx / 6.0, dpy / 6.0).rgb, uMSand);
vec3 dRock = vec3(1.0);
if (edge0 < 0.6 || pm2.g > 0.05) dRock = dhDetail(textureGrad(uTRock, p / 4.5, dpx / 4.5, dpy / 4.5).rgb, uMRock);
// V2 meadow: one calm field, a broad 20–30 m patch moves it about ±5 % luma; the brush stroke weighs ≤ 0.08.
float calm = broad * 0.75 + mid * 0.17 + stroke * 0.08;
vec3 c = mix(uGrassMid, uGrassLight, clamp(0.4 + (calm - 0.5) * 1.1, 0.0, 1.0));
c *= dGrass;
// Meadow tufts (the reference's speckle): sparse small dabs a step darker, lit on the sun side; baked, so free per frame.
{
  vec2 tc = floor(p / 0.85);
  float th = dhHash(tc + 7.3);
  vec2 to = (tc + 0.25 + 0.5 * vec2(dhHash(tc + 1.7), dhHash(tc + 3.1))) * 0.85;
  vec2 td = (p - to) * vec2(1.0, 1.6);
  float tr = 0.1 + 0.12 * dhHash(tc + 5.9);
  float tuft = (1.0 - smoothstep(tr * 0.7, tr, length(td))) * step(th, 0.3);
  float lit = smoothstep(-0.2, 0.6, dot(normalize(td + 1e-4), vec2(0.99, 0.09)));
  c *= 1.0 - tuft * mix(0.16, 0.02, lit);
}
float h = vDhWorld.y;
c = mix(c, c * uCoolTint, smoothstep(0.1, -0.9, h) * 0.3);
// Forest floor: the vertex forest mask outside the paint square, the baked canopy shade inside. The deep tone lives only here.
vec2 muv = (p - uMaskRect.xy) / uMaskRect.zw;
float inside = step(0.0, muv.x) * step(muv.x, 1.0) * step(0.0, muv.y) * step(muv.y, 1.0);
float shadeV = mix(vDhMask.w, pm.a, inside);
float woods = smoothstep(0.32, 0.72, shadeV + (mid - 0.5) * 0.35);
c = mix(c, uGrassDeep * dGrass, smoothstep(0.12, 0.4, shadeV) * 0.45);
vec3 floorC = mix(uForestFloor * dMoss, uForestFloor * 1.15 * dLitter * vec3(1.2, 1.0, 0.8), smoothstep(0.45, 0.6, stroke + big * 0.2) * 0.4);
c = mix(c, floorC * (0.92 + 0.2 * stroke), woods * 0.8);
c = mix(c, c * uVioletShade, woods * smoothstep(0.35, 0.65, stroke + big * 0.3) * 0.35 * (1.0 - smoothstep(0.2, 0.35, slope)));
// Cliff ground (ledges and tops): pale grey rock, darker cracks, grass only in a few pockets (V10).
float level = 1.0 - smoothstep(0.22, 0.38, slope);
float cliffG = smoothstep(0.25, 0.6, pm2.g + (mid - 0.5) * 0.3);
if (cliffG > 0.0) {
  float crack = smoothstep(0.58, 0.72, dhNoise(p * vec2(0.7, 1.3) + 2.0) * 0.6 + dhNoise(p * 2.1 + 5.0) * 0.4);
  vec3 rockTop = uScree * dRock * (0.9 + 0.18 * stroke + 0.12 * (big - 0.5));
  rockTop = mix(rockTop, rockTop * vec3(0.66, 0.68, 0.72), crack * 0.7);
  float pocket = smoothstep(0.6, 0.74, mid + (big - 0.5) * 0.35);
  c = mix(c, mix(rockTop, c, pocket * 0.85), cliffG);
}
// Banks: patchy sand, a pebbly margin, wet mud at the waterline.
float edge = vDhMask.z;
float bankPatch = smoothstep(0.42, 0.62, dhNoise(p * 0.22 + 11.0));
float sand = (1.0 - smoothstep(0.0, 0.9, edge + (mid - 0.5) * 1.3 + (stroke - 0.5) * 0.6)) * bankPatch;
float margin = 1.0 - smoothstep(-0.2, 0.45, edge + (stroke - 0.5) * 0.5);
c = mix(c, mix(c, uRock * dRock, 0.55), margin * 0.7);
c = mix(c, uSand * dSand * (0.9 + 0.15 * mid), sand * 0.85);
c = mix(c, uMud * dEarth, 1.0 - smoothstep(-0.6, 0.0, edge));
// V3 trodden ground: worn dirt, a dark rim 0.15–0.25 m, a pale grass halo about 1 m out, then the meadow.
float r = rr;
float dn = (mid - 0.5) * 0.42 + (stroke - 0.5) * 0.22;
float trodV = max(pm.r, pm2.r) + dn;
float halo = smoothstep(0.1, 0.28, trodV) * (1.0 - smoothstep(0.34, 0.42, trodV));
c = mix(c, uGrassLight * 1.07 * dGrass, halo * 0.5 * (1.0 - woods * 0.7));
float dirtA = smoothstep(0.46, 0.54, pm.r + dn) * level;
float rimA = smoothstep(0.37, 0.45, trodV) * (1.0 - smoothstep(0.46, 0.54, trodV)) * level;
c *= 1.0 - rimA * 0.3;
vec3 dirtC = mix(uDirt, uDirtLight, smoothstep(0.42, 0.72, stroke + mid * 0.2)) * dPath;
dirtC = mix(dirtC, uDirtDark * dEarth * 1.6, smoothstep(0.75, 0.97, pm.r + dn * 0.5) * 0.3);
float plaza = 1.0 - smoothstep(6.0, 8.5, r);
dirtC = mix(dirtC, mix(uDirt, uSand, 0.5) * dSand * (0.88 + 0.2 * stroke), plaza * 0.8);
c = mix(c, dirtC, dirtA * (1.0 - plaza * smoothstep(0.6, 0.9, dhNoise(p * 1.7 + 4.0)) * smoothstep(4.6, 7.0, r) * 0.45));
// V12 dais rim: a darker cobble ring at the foot of the dais step.
float ring = smoothstep(4.75, 4.95, r) * (1.0 - smoothstep(5.55, 5.8, r + (stroke - 0.5) * 0.25));
c = mix(c, uRimStone * dPath * (0.85 + 0.3 * dhNoise(p * 6.0)), ring * 0.85);
// V8 main footpaths: wide, about 95 % trodden, no grass crown.
float mainA = smoothstep(0.47, 0.55, pm2.r + (mid - 0.5) * 0.16 + (stroke - 0.5) * 0.1) * level * 0.95;
vec3 mainC = mix(uDirtLight, uDirt, 0.3) * dPath * (0.97 + 0.08 * stroke);
c = mix(c, mainC, mainA);
// V8 branch footpaths: narrower, weaker (0.78 cover), a grass crown down the middle.
float pathA = smoothstep(0.47, 0.55, pm.g + (mid - 0.5) * 0.24 + (stroke - 0.5) * 0.16) * level * 0.78;
float crown = smoothstep(0.66, 0.9, pm.g) * smoothstep(0.4, 0.65, dhNoise(p * vec2(1.1, 2.3) + 5.0)) * 0.8;
vec3 pathC = mix(mix(uDirtLight, uDirt, 0.25), uGrassLight, 0.22) * dPath * (0.96 + 0.1 * stroke);
c = mix(c, mix(pathC, c, crown), pathA);
// Dirt lanes: worn edge, two ruts, one step brighter than the ground.
float lane = vDhMask.x / max(vDhMask.y, 0.1);
float wob = (mid - 0.5) * 0.36 + (stroke - 0.5) * 0.26;
float dirt = 1.0 - smoothstep(0.9, 1.06, lane + wob);
float worn = smoothstep(0.62, 0.96, lane + wob) * dirt;
float rut = (1.0 - smoothstep(0.06, 0.17, abs(lane - 0.46 + wob * 0.25))) * dirt;
vec3 laneC = mix(uDirt, uDirtLight, smoothstep(0.42, 0.72, stroke + mid * 0.2)) * dPath;
laneC = mix(laneC, uDirtDark * dPath, worn * 0.45 + rut * 0.3);
float shoulder = (1.0 - smoothstep(1.0, 1.9, lane + wob)) * (1.0 - dirt);
c = mix(c, mix(c, uGrassLight * dGrass, 0.45), shoulder * 0.7);
c = mix(c, laneC, dirt);
// Decals (D1–D4), bombed; their density lives in the mask, so lanes and water never get one.
// Decals lie flat: none on slopes (they would stretch down a face).
// Perf: a bomb layer runs only where the mask blurred to about 2 m (mip 3) can hold one of its decals.
vec4 pmBlur = inside > 0.5 ? textureLod(uPaintMask, muv, 3.0) : vec4(0.0);
if (uDecalOn > 0.5 && slope < 0.18 && dot(pmBlur, vec4(1.0)) > 0.01) {
  // D2 flowers at trodden rims and canopy skirts (V14), a few on the open meadow.
  if (pmBlur.b > 0.05) {
    vec4 dF = dhBomb(uDFlowers, p, dpx, dpy, 2.1, 3.1, vec2(0.6, 1.1), vec4(1.0), vec4(0.0, 0.0, 1.0, 0.0), vec4(0.15, 1.1, 2.0, 3.0));
    c = c * (1.0 - dF.a) + dF.rgb;
  }
  // D4 moss clumps (the two moss quarters, never the puddles) at canopy rims.
  if (pmBlur.b * 0.15 + pmBlur.a * 0.9 > 0.08) {
    vec4 dM = dhBomb(uDMoss, p, dpx, dpy, 2.7, 7.9, vec2(1.0, 1.7), vec4(1.0, 0.0, 1.0, 0.0), vec4(0.0, 0.0, 0.15, 0.9), vec4(0.18, 0.5, 0.75, 1.0));
    c = c * (1.0 - dM.a * 0.85) + dM.rgb * 0.85;
  }
  // D1 dirt patches round trodden edges, recoloured to the kit dirt (the sheet is a little red-orange, art 015 D1).
  if (pmBlur.r > 0.03) {
    vec4 dD = dhBomb(uDDirt, p, dpx, dpy, 3.2, 12.7, vec2(1.1, 1.9), vec4(1.0), vec4(0.5, 0.0, 0.0, 0.0), vec4(0.1, 0.24, 0.32, 0.45));
    float dDl = dot(dD.rgb, vec3(0.3, 0.59, 0.11)) / max(dD.a, 1e-3);
    c = c * (1.0 - dD.a * 0.6) + mix(uDirt, uDirtLight, 0.5) * dDl * 2.6 * dD.a * 0.6;
  }
  // D3 litter (pebbles and sticks; never the orange leaves, nor the red-brown cones that read as specks of blood, V3) on dirt under trees.
  if (pmBlur.r * 0.6 + pmBlur.a * 0.7 > 0.3) {
    vec4 dL = dhBomb(uDLitter, p, dpx, dpy, 1.8, 17.3, vec2(0.7, 1.2), vec4(1.0, 0.0, 0.0, 1.0), vec4(0.6, 0.0, 0.0, 0.7), vec4(0.45, 0.85, 2.0, 3.0));
    c = c * (1.0 - dL.a) + dL.rgb;
  }
}
diffuseColor.rgb = c;
`;

/**
 * The ground shader: inside the mask square, once baked, one read of the baked colour plus the live
 * cliff stone on steep faces; elsewhere (and before the bake) the live paint.
 */
const PAINT_GLSL = /* glsl */ `
vec2 dhP = vDhWorld.xz;
vec2 dhBakeUv = (dhP - uMaskRect.xy) / uMaskRect.zw;
bool dhBaked = uBakeOn > 0.5 && dhBakeUv.x > 0.001 && dhBakeUv.y > 0.001 && dhBakeUv.x < 0.999 && dhBakeUv.y < 0.999;
vec2 dhDpx = dFdx(dhP);
vec2 dhDpy = dFdy(dhP);
vec3 dhWorldDx = dFdx(vDhWorld);
vec3 dhWorldDy = dFdy(vDhWorld);
if (dhBaked) {
  diffuseColor.rgb = textureGrad(uBaked, dhBakeUv, dhDpx / uMaskRect.zw, dhDpy / uMaskRect.zw).rgb;
} else {
${PAINT_LIVE}
}
{
  // V10 cliff stone, live (a top-down bake would stretch it down the faces).
  vec3 dhN = normalize(vDhNormal);
  if (1.0 - dhN.y > 0.28) {
    float dhMid = dhFbm(dhP * 0.17 + 3.7);
    vec2 dhQ = mat2(0.8, -0.6, 0.6, 0.8) * dhP;
    float dhStroke = dhNoise(dhQ * vec2(0.85, 0.2)) * 0.6 + dhNoise(dhQ * vec2(2.4, 0.55) + 9.0) * 0.4;
    float dhW;
    vec3 dhS = dhStone(vDhWorld, dhN, dhP, dhDpx, dhDpy, vDhMask.z, dhMid, dhStroke, dhW);
    diffuseColor.rgb = mix(diffuseColor.rgb, dhS, dhW);
  }
}
`;
