/**
 * Map spike L7 ground paint (parent docs/tools/MAP_FACTORY.md §3 L7): a paint
 * mask over the play area baked once at load from the layout's stamps and the
 * height field's distance masks, the pine-river ground tiles (T1–T8) as brush
 * detail under the painted palette, and the four decal sheets (D1–D4) laid by
 * texture bombing in the ground shader (one decal per hashed cell, density
 * read from the mask at the decal's centre, so no decal is ever cut).
 * Mask channels (potentials: 0.5 is the painted edge, the shader cuts it with
 * noise): R dirt, G footpath, B open-meadow flowers, A canopy shade.
 * Tiles and decals load from /art-src in dev (spike only; the game will ship
 * them through prepare-ground / prepare-decals). Until a texture loads it is
 * a 1 × 1 texel of its own mean colour, so the palette alone shows.
 * Owner: map spike.
 */
import * as THREE from "three";
import type { Quality } from "../app/contracts";
import { LAYOUT_RULES, type MapLayout } from "./layout";
import { fbm, type HeightField } from "./terrain";

/** Mask square half side around the dais and texel size, metres. */
export const PAINT_MASK = { halfM: 52, cellM: 0.25 } as const;

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

const ART_BASE = "/art-src/";

export interface GroundPaint {
  readonly uniforms: Record<string, { value: unknown }>;
  readonly pars: string;
  readonly paint: string;
  /** Resolves once every tile and decal has loaded or failed. */
  readonly ready: Promise<void>;
  /** Mask bake time, ms (spike report). */
  readonly bakeMs: number;
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

/** Bilinear read of one height-field mask channel (0 lane centre distance, 1 lane half, 2 water edge, 3 forest). */
function maskReader(field: HeightField): (x: number, z: number, channel: number) => number {
  const { xs, zs, masks } = field;
  const nx = xs.length;
  const find = (axis: Float64Array, value: number): [number, number] => {
    const last = axis.length - 1;
    if (value <= axis[0]!) return [0, 0];
    if (value >= axis[last]!) return [last - 1, 1];
    let lo = 0;
    let hi = last;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (axis[mid]! <= value) lo = mid;
      else hi = mid;
    }
    return [lo, (value - axis[lo]!) / (axis[lo + 1]! - axis[lo]!)];
  };
  return (x, z, channel) => {
    const [i, tx] = find(xs, x);
    const [j, tz] = find(zs, z);
    const a = masks[(j * nx + i) * 4 + channel]!;
    const b = masks[(j * nx + i + 1) * 4 + channel]!;
    const c = masks[((j + 1) * nx + i) * 4 + channel]!;
    const d = masks[((j + 1) * nx + i + 1) * 4 + channel]!;
    return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
  };
}

const smooth = (edge0: number, edge1: number, value: number): number => {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

/** Bakes the RGBA paint mask (see the file header for the channels). */
export function bakePaintMask(field: HeightField, layout: MapLayout): { texture: THREE.DataTexture; size: number; origin: [number, number] } {
  const { halfM, cellM } = PAINT_MASK;
  const [cx, cz] = field.map.dais.center;
  const size = Math.round((halfM * 2) / cellM);
  const ox = cx - halfM;
  const oz = cz - halfM;
  const dirt = new Float32Array(size * size);
  const path = new Float32Array(size * size);
  const shade = new Float32Array(size * size);
  const flowers = new Float32Array(size * size);
  const play = field.map.terrain.playRadiusM;
  const atX = (x: number): number => Math.floor((x - ox) / cellM);
  const atZ = (z: number): number => Math.floor((z - oz) / cellM);

  // R: dirt discs (max of potentials).
  for (const disc of layout.dirt) {
    const reach = disc.r + disc.falloff;
    for (let j = Math.max(0, atZ(disc.z - reach)); j <= Math.min(size - 1, atZ(disc.z + reach)); j += 1) {
      const z = oz + (j + 0.5) * cellM;
      for (let i = Math.max(0, atX(disc.x - reach)); i <= Math.min(size - 1, atX(disc.x + reach)); i += 1) {
        const x = ox + (i + 0.5) * cellM;
        const d = Math.hypot(x - disc.x, z - disc.z);
        if (d > reach) continue;
        // 1 at the centre, 0.5 at r, 0 at r + falloff.
        const p = d <= disc.r ? 1 - 0.5 * (d / disc.r) * (d / disc.r) : 0.5 * (1 - smooth(disc.r, reach, d));
        const index = j * size + i;
        dirt[index] = Math.max(dirt[index]!, p * disc.strength);
      }
    }
  }
  // A: canopy shade under every layout tree (crown radius), soft.
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
  // G: footpaths (1 on the centre line, 0.5 at the edge, 0 at twice the half width).
  for (const fp of layout.footpaths) {
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
          path[index] = Math.max(path[index]!, p);
        }
      }
    }
  }
  // B: open meadow flowers; A: the skirt forest floor joins the canopy shade.
  const read = maskReader(field);
  const P = LAYOUT_RULES.paint;
  const seed = field.map.terrain.seed;
  for (let j = 0; j < size; j += 1) {
    const z = oz + (j + 0.5) * cellM;
    for (let i = 0; i < size; i += 1) {
      const x = ox + (i + 0.5) * cellM;
      const index = j * size + i;
      const r = Math.hypot(x - cx, z - cz);
      const forest = read(x, z, 3);
      shade[index] = Math.max(shade[index]!, forest * smooth(play - 6, play + 2, r));
      const laneGap = read(x, z, 0) - read(x, z, 1);
      const water = read(x, z, 2);
      const open = smooth(0.8, 2.6, laneGap) * smooth(0.8, 2.2, water) * (1 - smooth(0.25, 0.5, dirt[index]!)) * (1 - smooth(0.3, 0.5, path[index]!)) * (1 - smooth(0.25, 0.55, shade[index]!));
      const patch = smooth(0.42, 0.66, fbm(x / P.flowerPatchWaveM + 13.1, z / P.flowerPatchWaveM - 4.7, seed + 31, 3));
      // More flowers round dirt and path rims (the reference's tufts by every trodden edge).
      const rim = Math.max(smooth(0.12, 0.32, dirt[index]!) * (1 - smooth(0.4, 0.5, dirt[index]!)), smooth(0.1, 0.3, path[index]!) * (1 - smooth(0.4, 0.5, path[index]!)));
      flowers[index] = Math.min(1, open * (patch * 0.85 + rim * 0.6) * (1 - smooth(play, play + 6, r)) * smooth(7.5, 10, r));
    }
  }
  const data = new Uint8Array(size * size * 4);
  for (let index = 0; index < size * size; index += 1) {
    data[index * 4] = Math.round(Math.min(1, dirt[index]!) * 255);
    data[index * 4 + 1] = Math.round(Math.min(1, path[index]!) * 255);
    data[index * 4 + 2] = Math.round(Math.min(1, flowers[index]!) * 255);
    data[index * 4 + 3] = Math.round(Math.min(1, shade[index]!) * 255);
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.flipY = false;
  texture.needsUpdate = true;
  return { texture, size, origin: [ox, oz] };
}

export function buildGroundPaint(field: HeightField, layout: MapLayout, quality: Quality): GroundPaint {
  const t0 = performance.now();
  const mask = bakePaintMask(field, layout);
  const bakeMs = performance.now() - t0;
  const uniforms: Record<string, { value: unknown }> = {
    uPaintMask: { value: mask.texture },
    uMaskRect: { value: new THREE.Vector4(mask.origin[0], mask.origin[1], PAINT_MASK.halfM * 2, PAINT_MASK.halfM * 2) },
    uDetail: { value: quality === "low" ? 0 : 0.8 },
    uDecalOn: { value: quality === "low" ? 0 : 1 },
  };
  const disposables: THREE.Texture[] = [mask.texture];
  const loader = new THREE.TextureLoader();
  const anisotropy = quality === "ultra" ? 8 : quality === "high" ? 4 : 1;
  const jobs: Promise<void>[] = [];
  for (const [name, tile] of Object.entries(TILES)) {
    const fallback = meanTexel(tile.mean);
    uniforms[name] = { value: fallback };
    uniforms[name.replace("uT", "uM")] = { value: new THREE.Vector3(tile.mean[0], tile.mean[1], tile.mean[2]) };
    disposables.push(fallback);
    if (quality === "low") continue;
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
    if (quality === "low") continue;
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
  return {
    uniforms,
    pars: PAINT_PARS,
    paint: PAINT_GLSL,
    ready: Promise.all(jobs).then(() => undefined),
    bakeMs,
    dispose(): void {
      for (const texture of disposables) texture.dispose();
    },
  };
}

const PAINT_PARS = /* glsl */ `
uniform sampler2D uPaintMask;
uniform vec4 uMaskRect;
uniform float uDetail;
uniform float uDecalOn;
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
// Tile detail: the tile over its own mean, so the palette keeps the colour and the tile adds the brush.
vec3 dhDetail(vec3 t, vec3 meanC) {
  return mix(vec3(1.0), clamp(t / max(meanC, vec3(0.004)), 0.0, 2.6), uDetail);
}
vec4 dhMaskAt(vec2 w) {
  vec2 uv = (w - uMaskRect.xy) / uMaskRect.zw;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return vec4(0.0);
  return textureLod(uPaintMask, uv, 0.0);
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
  vec2 off = vec2(0.0, 0.5);
  if (pick > quads.x) off = vec2(0.5, 0.5);
  if (pick > quads.x + quads.y) off = vec2(0.0, 0.0);
  if (pick > quads.x + quads.y + quads.z) off = vec2(0.5, 0.0);
  vec2 uv = (q + 0.5) * 0.5 + off;
  vec2 gx = rot * dpx / d * 0.5;
  vec2 gy = rot * dpy / d * 0.5;
  return textureGrad(sheet, uv, gx, gy);
}
`;

const PAINT_GLSL = /* glsl */ `
vec2 p = vDhWorld.xz;
vec2 dpx = dFdx(p);
vec2 dpy = dFdy(p);
vec3 nW = normalize(vDhNormal);
float slope = 1.0 - clamp(nW.y, 0.0, 1.0);
float big = dhFbm(p * 0.045);
float mid = dhFbm(p * 0.17 + 3.7);
vec2 q = mat2(0.8, -0.6, 0.6, 0.8) * p;
float stroke = dhNoise(q * vec2(0.85, 0.2)) * 0.6 + dhNoise(q * vec2(2.4, 0.55) + 9.0) * 0.4;
vec4 pm = dhMaskAt(p);
// Tiles, world-space (metres per repeat in the divisor); grass A twice (two scales, turned) against repetition.
vec2 rp = mat2(0.6, 0.8, -0.8, 0.6) * p;
vec3 tGrass = mix(texture2D(uTGrassA, p / 7.0).rgb / max(uMGrassA, vec3(0.004)), texture2D(uTGrassA, rp / 10.5).rgb / max(uMGrassA, vec3(0.004)), 0.45);
tGrass = mix(tGrass, texture2D(uTGrassB, p / 8.5 + 0.37).rgb / max(uMGrassB, vec3(0.004)), smoothstep(0.42, 0.62, big + (mid - 0.5) * 0.3));
vec3 dGrass = mix(vec3(1.0), clamp(tGrass, 0.0, 2.6), uDetail);
vec3 dMoss = dhDetail(texture2D(uTMoss, p / 6.0).rgb, uMMoss);
vec3 dLitter = dhDetail(texture2D(uTLitter, rp / 6.0).rgb, uMLitter);
vec3 dPath = dhDetail(texture2D(uTPath, p / 6.5).rgb, uMPath);
vec3 dEarth = dhDetail(texture2D(uTEarth, rp / 5.5).rgb, uMEarth);
vec3 dSand = dhDetail(texture2D(uTSand, p / 6.0).rgb, uMSand);
vec3 bw = abs(nW);
bw = bw * bw * bw * bw;
bw /= max(bw.x + bw.y + bw.z, 1e-4);
vec3 tRock = texture2D(uTRock, vDhWorld.zy / 4.5).rgb * bw.x + texture2D(uTRock, p / 4.5).rgb * bw.y + texture2D(uTRock, vDhWorld.xy / 4.5).rgb * bw.z;
vec3 dRock = dhDetail(tRock, uMRock);
// Meadow: three painted tones, tile brush on top.
float pat = big * 0.62 + mid * 0.22 + stroke * 0.26 - 0.05;
float band = smoothstep(0.40, 0.45, pat) + smoothstep(0.56, 0.61, pat);
vec3 c = mix(uGrassDeep, uGrassMid, clamp(band, 0.0, 1.0));
c = mix(c, uGrassLight, clamp(band - 1.0, 0.0, 1.0));
c *= dGrass;
float h = vDhWorld.y;
c = mix(c, c * uCoolTint, smoothstep(0.1, -0.9, h) * 0.45);
c = mix(c, uSunCream * dGrass, smoothstep(0.7, 0.9, pat + h * 0.04) * 0.25);
// Light halo round every trodden patch and path (the reference's pale rim).
float trod = max(pm.r, pm.g);
float halo = smoothstep(0.16, 0.42, trod + (stroke - 0.5) * 0.12);
c = mix(c, mix(uGrassLight, uGrassMid, 0.35) * 1.06 * dGrass, halo * 0.5);
// Forest floor: the vertex forest mask outside the paint square, the baked canopy shade inside.
vec2 muv = (p - uMaskRect.xy) / uMaskRect.zw;
float inside = step(0.0, muv.x) * step(muv.x, 1.0) * step(0.0, muv.y) * step(muv.y, 1.0);
float shadeV = mix(vDhMask.w, pm.a, inside);
float woods = smoothstep(0.32, 0.72, shadeV + (mid - 0.5) * 0.35);
vec3 floorC = mix(uForestFloor * dMoss, uForestFloor * 1.15 * dLitter * vec3(1.25, 1.0, 0.8), smoothstep(0.45, 0.6, stroke + big * 0.2) * 0.45);
c = mix(c, floorC * (0.9 + 0.25 * stroke), woods * 0.8);
c = mix(c, c * uVioletShade, woods * smoothstep(0.35, 0.65, stroke + big * 0.3) * 0.5 * (1.0 - smoothstep(0.2, 0.35, slope)));
// Rocky slopes and the cliff face (triplanar slate), not the river banks.
float edge = vDhMask.z;
float rock = smoothstep(0.26, 0.42, slope + (mid - 0.5) * 0.18) * smoothstep(0.6, 2.2, edge);
vec3 slate = vec3(0.47, 0.5, 0.56);
c = mix(c, slate * mix(vec3(1.0), dRock, 1.25) * (0.88 + 0.22 * stroke), rock);
// Banks: patchy sand, a pebbly margin, wet mud at the waterline.
float bankPatch = smoothstep(0.42, 0.62, dhNoise(p * 0.22 + 11.0));
float sand = (1.0 - smoothstep(0.0, 0.9, edge + (mid - 0.5) * 1.3 + (stroke - 0.5) * 0.6)) * bankPatch;
float margin = 1.0 - smoothstep(-0.2, 0.45, edge + (stroke - 0.5) * 0.5);
c = mix(c, mix(c, uRock * dRock, 0.55), margin * 0.7);
c = mix(c, uSand * dSand * (0.9 + 0.15 * mid), sand * 0.85);
c = mix(c, uMud * dEarth, 1.0 - smoothstep(-0.6, 0.0, edge));
// Dirt patches (canopy dirt, junctions, lane scuffs, plaza, cliff scree): crisp painted edge, darker heart.
float r = length(p - uDhCentre);
float dn = (mid - 0.5) * 0.42 + (stroke - 0.5) * 0.22;
float flat = 1.0 - smoothstep(0.22, 0.38, slope);
float dirtA = smoothstep(0.46, 0.54, pm.r + dn) * flat;
vec3 dirtC = mix(uDirt, uDirtLight, smoothstep(0.42, 0.72, stroke + mid * 0.2)) * dPath;
dirtC = mix(dirtC, uDirtDark * dEarth * 1.6, smoothstep(0.7, 0.95, pm.r + dn * 0.5) * 0.35);
float plaza = 1.0 - smoothstep(6.0, 8.5, r);
dirtC = mix(dirtC, mix(uDirt, uSand, 0.5) * dSand * (0.88 + 0.2 * stroke), plaza * 0.8);
c = mix(c, dirtC, dirtA * (1.0 - plaza * smoothstep(0.6, 0.9, dhNoise(p * 1.7 + 4.0)) * smoothstep(4.6, 7.0, r) * 0.45));
// Footpaths: narrower and paler than lanes, grass breaking through the middle.
float pathA = smoothstep(0.47, 0.55, pm.g + (mid - 0.5) * 0.24 + (stroke - 0.5) * 0.16) * flat * 0.9;
float crown = smoothstep(0.7, 0.92, pm.g) * smoothstep(0.45, 0.7, dhNoise(p * vec2(1.1, 2.3) + 5.0)) * 0.7;
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
if (uDecalOn > 0.5 && slope < 0.18) {
  // D2 flowers on the open meadow (all four quarters).
  vec4 dF = dhBomb(uDFlowers, p, dpx, dpy, 2.1, 3.1, vec2(0.7, 1.25), vec4(1.0), vec4(0.0, 0.0, 1.0, 0.0), vec4(0.15, 1.1, 2.0, 3.0));
  c = c * (1.0 - dF.a) + dF.rgb;
  // D4 moss clumps (two moss quarters) at canopy rims and the meadow.
  vec4 dM = dhBomb(uDMoss, p, dpx, dpy, 2.7, 7.9, vec2(1.0, 1.7), vec4(1.0, 0.0, 0.0, 1.0), vec4(0.0, 0.0, 0.35, 0.9), vec4(0.18, 0.5, 0.75, 1.0));
  c = c * (1.0 - dM.a * 0.85) + dM.rgb * 0.85;
  // D1 dirt patches round trodden edges.
  // Recoloured to the kit dirt (the sheet is a little red-orange, art 015 D1), at most every other cell.
  vec4 dD = dhBomb(uDDirt, p, dpx, dpy, 3.2, 12.7, vec2(1.1, 1.9), vec4(1.0), vec4(0.5, 0.0, 0.0, 0.0), vec4(0.1, 0.24, 0.32, 0.45));
  float dDl = dot(dD.rgb, vec3(0.3, 0.59, 0.11)) / max(dD.a, 1e-3);
  c = c * (1.0 - dD.a * 0.6) + mix(uDirt, uDirtLight, 0.5) * dDl * 2.6 * dD.a * 0.6;
  // D3 litter (pebbles, needles and cones, sticks; never the orange leaves) on dirt under trees.
  vec4 dL = dhBomb(uDLitter, p, dpx, dpy, 1.8, 17.3, vec2(0.7, 1.2), vec4(1.0, 0.0, 1.0, 1.0), vec4(0.6, 0.0, 0.0, 0.7), vec4(0.45, 0.85, 2.0, 3.0));
  c = c * (1.0 - dL.a) + dL.rgb;
}
diffuseColor.rgb = c;
`;
