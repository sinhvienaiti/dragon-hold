/**
 * Flipbook sprites for Hỏa Long's fire (round 8, owner 29/10: the fire's material comes from Adobe Firefly Video clips
 * cut into atlases, docs/games/vfx/FIREFLY_VFX_LIST.md). Code-drawn flames had plateaued; these carry real fire.
 *
 * - Media lives under public/assets/dragon-hold/vfx/firefly/ (never in Git): `manifest.json` (written by
 *   scripts/assets/prepare-firefly.mjs from ~/VFXLab/out/dragon-hold/<id>/) and one atlas per id.
 * - Each id has a fixed role and blend (the list's table), so its pool is built and warmed at load with its final
 *   blend state; an atlas that arrives later only uploads a texture (no pipeline build in a wave).
 * - An id with no atlas draws nothing and the caller keeps its code-drawn layer: dropping a new atlas in and
 *   re-running the prepare script is all it takes.
 *
 * The material: frames blended in time, a pivot (a muzzle flash grows from its left edge), billboards that can turn
 * to follow a world direction on screen (a jet along the shot, a fireball along its flight), analytic soft particles
 * against the ground (VFX_SOFT_GLSL), and two blends: "fire" (premultiplied: the clip's light is added and the ground
 * under it darkens by its luminance × `occlude`, so it reads on the sunlit dais as on dusk grass, never as a pale
 * wash) and "smoke" (normal blend: dark smoke from a clip on white, its darkness is its alpha).
 * Owner: view-crowd-fx (LANES.md).
 */
import * as THREE from "three";
import { VFX_NOISE_GLSL, VFX_SOFT_GLSL } from "./vfx-layers";

/** The Firefly ids (FIREFLY_VFX_LIST §3) and the first quick cut the coordinator made. */
// Fire test A (31/10, DRAGON_FIRE_DIAGNOSIS §3): impact-burst-a and smoke-mask-a are RGBA re-cuts (coverage in alpha),
// halo-a a blurred peak frame of impact-burst, scorch-a the painted scorch of ticket 038 (vfx/fire-a/manifest.json).
// Fire test B (31/10, owner "Làm thử B"): impact-cel-b and smoke-cel-b are the transparent cel clips (straight alpha,
// recoloured offline), halo-b their blurred peak, scorch-b the 038 painting as data (vfx/fire-b/manifest.json).
export const FLIPBOOK_IDS = ["charge-orb", "muzzle-flash", "fireball-head", "flame-trail", "impact-burst", "impact-big", "smoke-roll", "smoke-mask", "smoke-column", "embers", "ground-fire", "fire-burst", "impact-burst-a", "smoke-mask-a", "halo-a", "scorch-a", "impact-cel-b", "smoke-cel-b", "halo-b", "scorch-b"] as const;
export type FlipbookId = (typeof FLIPBOOK_IDS)[number];

/**
 * How each id is drawn: smoke-roll is dark smoke on white (normal blend); the fire clips are fire on black. Test A:
 * "fireA" (coverage + a colour ramp, erosion, normal body plus additive glow), "smokeA" (coverage, lit by the sun),
 * "decal" (a painted mark lying flat on the ground). Test B: "fireB" and "smokeB" (straight-alpha cel clips, stepped
 * frames, normal blend), "decalB" (the scorch: warm brown, ember edge, grows in and shrinks away).
 */
export const FLIPBOOK_MODE: Readonly<Record<FlipbookId, "fire" | "smoke" | "fireA" | "smokeA" | "decal" | "fireB" | "smokeB" | "decalB">> = {
  "charge-orb": "fire",
  "muzzle-flash": "fire",
  "fireball-head": "fire",
  "flame-trail": "fire",
  "impact-burst": "fire",
  "impact-big": "fire",
  "smoke-roll": "smoke",
  // Round 10: white smoke filmed on black, a density mask (luminance) the shader colours.
  "smoke-mask": "smoke",
  // Round 10: the same kind of mask, a column rising from its base (Sky Fire's aftermath).
  "smoke-column": "smoke",
  embers: "fire",
  "ground-fire": "fire",
  "fire-burst": "fire",
  "impact-burst-a": "fireA",
  "smoke-mask-a": "smokeA",
  // Additive (the fire blend with occlude 0): the painted glow behind the body.
  "halo-a": "fire",
  "scorch-a": "decal",
  "impact-cel-b": "fireB",
  "smoke-cel-b": "smokeB",
  // Additive (the fire blend): the orange heat glow under the cel body.
  "halo-b": "fire",
  "scorch-b": "decalB",
};

export const FIREFLY_BASE = "/assets/dragon-hold/vfx/firefly/";
/** Fire test A's media (scripts/assets/prepare-fire-a.mjs). */
export const FIRE_A_BASE = "/assets/dragon-hold/vfx/fire-a/";
/** Fire test B's media (scripts/assets/prepare-fire-b.mjs). */
export const FIRE_B_BASE = "/assets/dragon-hold/vfx/fire-b/";

export interface FlipbookMeta {
  readonly id: FlipbookId;
  readonly url: string;
  /** A half-size copy for High and below (atlases over 2048 px), or null. */
  readonly halfUrl?: string | null;
  readonly cols: number;
  readonly rows: number;
  /** Frames used (≤ cols × rows, row-major from the top-left cell). */
  readonly frames: number;
  readonly fps: number;
  readonly loop: boolean;
  readonly blend: "additive" | "normal";
  /** Cell width ÷ height. */
  readonly aspect: number;
  /** Where the effect's origin sits in a cell: x from the left, y from the top (0–1). */
  readonly pivot: readonly [number, number];
  /** First frame a one-shot plays from (a quick cut may open on black frames; FXV's cuts start at 0). */
  readonly start: number;
  /** Which way the effect travels in its cell (radians, 0 = to the right): a sprite turned along a direction undoes it. */
  readonly heading: number;
  /** The atlas carries its own alpha (smoke-roll: a luma matte from white); else alpha comes from luminance. */
  readonly alpha: boolean;
}

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const count = (value: unknown, max: number): value is number => typeof value === "number" && Number.isInteger(value) && value > 0 && value <= max;

/**
 * Reads manifest.json: `{ version: 1, kind: "firefly", flipbooks: { <id>: { file, md5?, cols, rows, frames?, fps,
 * loop, blend, cell | [w, h], pivot? } } }`. Unknown ids are skipped; a bad entry throws (a broken file must not draw
 * garbage). URLs are built here from the file name, never taken from the JSON.
 */
export function parseFlipbookManifest(value: unknown, base = FIREFLY_BASE): Map<FlipbookId, FlipbookMeta> {
  if (!record(value) || value.version !== 1 || value.kind !== "firefly" || !record(value.flipbooks)) throw new Error("Invalid firefly manifest");
  const out = new Map<FlipbookId, FlipbookMeta>();
  for (const [key, entry] of Object.entries(value.flipbooks)) {
    if (!(FLIPBOOK_IDS as readonly string[]).includes(key)) continue;
    const id = key as FlipbookId;
    if (!record(entry) || typeof entry.file !== "string" || !/^[a-z0-9][a-z0-9.-]*\.(png|webp)$/.test(entry.file)) throw new Error("Invalid flipbook file: " + key);
    if (!count(entry.cols, 64) || !count(entry.rows, 64)) throw new Error("Invalid flipbook grid: " + key);
    const frames = entry.frames === undefined ? entry.cols * entry.rows : entry.frames;
    if (!count(frames, entry.cols * entry.rows)) throw new Error("Invalid flipbook frames: " + key);
    if (typeof entry.fps !== "number" || !(entry.fps > 0 && entry.fps <= 120)) throw new Error("Invalid flipbook fps: " + key);
    const cell = entry.cell;
    const [cw, ch] = typeof cell === "number" ? [cell, cell] : Array.isArray(cell) && cell.length === 2 ? [cell[0], cell[1]] : [NaN, NaN];
    if (!count(cw, 4096) || !count(ch, 4096)) throw new Error("Invalid flipbook cell: " + key);
    const pivot = Array.isArray(entry.pivot) && entry.pivot.length === 2 && entry.pivot.every((v) => typeof v === "number" && Number.isFinite(v)) ? (entry.pivot as number[]) : [0.5, 0.5];
    // A pivot in pixels (either value over 1) is read in the cell's own pixels.
    const px = pivot[0]! > 1 || pivot[1]! > 1 ? [pivot[0]! / cw, pivot[1]! / ch] : pivot;
    const start = typeof entry.start === "number" && Number.isInteger(entry.start) && entry.start >= 0 && entry.start < frames ? entry.start : 0;
    const md5 = typeof entry.md5 === "string" && /^[0-9a-f]{32}$/.test(entry.md5) ? "?v=" + entry.md5 : "";
    const half = record(entry.half) && typeof entry.half.file === "string" && /^[a-z0-9][a-z0-9.-]*\.(png|webp)$/.test(entry.half.file) ? entry.half : null;
    const halfUrl = half === null ? null : base + (half.file as string) + (typeof half.md5 === "string" && /^[0-9a-f]{32}$/.test(half.md5) ? "?v=" + half.md5 : "");
    out.set(id, {
      id,
      url: base + entry.file + md5,
      halfUrl,
      cols: entry.cols,
      rows: entry.rows,
      frames,
      fps: entry.fps,
      loop: entry.loop === true,
      blend: entry.blend === "normal" ? "normal" : "additive",
      aspect: cw / ch,
      pivot: [Math.min(1, Math.max(0, px[0]!)), Math.min(1, Math.max(0, px[1]!))],
      start,
      heading: typeof entry.heading === "number" && Number.isFinite(entry.heading) ? (entry.heading * Math.PI) / 180 : 0,
      alpha: entry.alpha === true,
    });
  }
  return out;
}

interface Entry {
  meta: FlipbookMeta;
  texture: THREE.Texture;
}

/** The atlases of this page (loaded once; every run's pools attach to them). */
export class FlipbookLibrary {
  private readonly entries = new Map<FlipbookId, Entry>();
  private readonly listeners = new Set<(id: FlipbookId) => void>();
  private loading: Promise<void> | null = null;

  constructor(readonly base = FIREFLY_BASE) {}

  get(id: FlipbookId): Entry | null {
    return this.entries.get(id) ?? null;
  }

  /** Ids with an atlas loaded. */
  ids(): FlipbookId[] {
    return [...this.entries.keys()];
  }

  /** Calls `listener(id)` for each atlas as it arrives (and at once for those already in). Returns the unsubscribe. */
  watch(listener: (id: FlipbookId) => void): () => void {
    this.listeners.add(listener);
    for (const id of this.entries.keys()) listener(id);
    return () => this.listeners.delete(listener);
  }

  /**
   * Fetches the manifest and every atlas in it (once a page). No manifest: no flipbooks, the code-drawn layers stay.
   * `full`: the full-size atlases (Ultra); else an atlas's half-size copy where it has one (VFX_STANDARD §3.7 memory).
   */
  load(base = this.base, anisotropy = 4, full = false): Promise<void> {
    if (this.loading !== null) return this.loading;
    if (typeof fetch !== "function" || typeof location === "undefined" || !/^https?:$/.test(location.protocol)) return (this.loading = Promise.resolve());
    this.loading = (async () => {
      let metas: Map<FlipbookId, FlipbookMeta>;
      try {
        const response = await fetch(base + "manifest.json", { cache: "no-cache" });
        if (!response.ok) return;
        metas = parseFlipbookManifest(await response.json(), base);
      } catch (error) {
        console.warn("flipbook: no Firefly manifest; code-drawn fire only", error);
        return;
      }
      // Round 10: the density masks replace smoke-roll; it is not loaded beside them (8 MB of GPU memory).
      if (metas.has("smoke-mask")) metas.delete("smoke-roll");
      const loader = new THREE.TextureLoader();
      await Promise.all(
        [...metas.values()].map(async (meta) => {
          try {
            const texture = await loader.loadAsync(!full && meta.halfUrl ? meta.halfUrl : meta.url);
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.anisotropy = anisotropy;
            texture.generateMipmaps = true;
            texture.minFilter = THREE.LinearMipmapLinearFilter;
            texture.magFilter = THREE.LinearFilter;
            texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
            this.entries.set(meta.id, { meta, texture });
            for (const listener of this.listeners) listener(meta.id);
          } catch (error) {
            console.warn("flipbook: " + meta.url + " did not load; its layer stays code-drawn", error);
          }
        }),
      );
    })();
    return this.loading;
  }

  /** Tests: forget everything. */
  reset(): void {
    for (const entry of this.entries.values()) entry.texture.dispose();
    this.entries.clear();
    this.loading = null;
  }

  /** Tests and captures: an atlas from memory. */
  add(meta: FlipbookMeta, texture: THREE.Texture): void {
    this.entries.set(meta.id, { meta, texture });
    for (const listener of this.listeners) listener(meta.id);
  }
}

export const flipbooks = new FlipbookLibrary();
/** Fire test A's atlases (a manifest of their own, so the round-10 one stays as it is). */
export const fireAFlipbooks = new FlipbookLibrary(FIRE_A_BASE);
/** Fire test B's atlases (their own manifest). */
export const fireBFlipbooks = new FlipbookLibrary(FIRE_B_BASE);

/** The cell (u0, v0, du, dv) of frame `frame` in an atlas (row 0 at the image top; textures load flipped). */
export function cellRect(meta: FlipbookMeta, frame: number, out: THREE.Vector4): THREE.Vector4 {
  const f = Math.max(0, Math.min(meta.frames - 1, Math.floor(frame)));
  const col = f % meta.cols;
  const row = Math.floor(f / meta.cols);
  return out.set(col / meta.cols, 1 - (row + 1) / meta.rows, 1 / meta.cols, 1 / meta.rows);
}

const VERTEX = /* glsl */ `
attribute vec3 iPos;
attribute vec4 iData;
attribute vec4 iColor;
attribute vec4 iDir;
attribute vec3 iAge;
attribute float iLift;
uniform vec2 uPivot;
uniform float uAspect;
uniform float uHeading;
uniform float uFlat;
uniform float uExactLift;
uniform vec3 uSun;
varying vec2 vUv;
varying float vAngle;
varying vec3 vSun;
varying float vFrame;
varying float vAlpha;
varying vec3 vTint;
varying vec3 vWorld;
varying float vGround;
varying float vOcclude;
varying vec3 vAge;
void main() {
  vUv = uv;
  vAge = iAge;
  vFrame = iData.z;
  vAlpha = iData.w;
  vTint = iColor.rgb;
  vGround = iColor.a;
  vOcclude = iDir.w;
  vAngle = iData.y;
  // Toward the sun in view space (test A smoke: lit by the sun, VFX_STANDARD §3.5 rule 4).
  vSun = normalize(mat3(viewMatrix) * uSun);
  if (uFlat > 0.5) {
    // Test A decal: the quad lies flat on the ground (x and -z), turned by its angle.
    vec2 q = vec2((uv.x - uPivot.x) * uAspect, uv.y - uPivot.y) * iData.x;
    float fc = cos(iData.y);
    float fs = sin(iData.y);
    vec3 w = iPos + vec3(q.x * fc - q.y * fs, 0.0, -(q.x * fs + q.y * fc));
    vWorld = (modelMatrix * vec4(w, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(w, 1.0);
    return;
  }
  vec4 view = modelViewMatrix * vec4(iPos, 1.0);
  // Drawn nearer the eye by iLift (depth only): a meteor that must land on a foe, not behind it. Test B: the exact
  // form (below): the sprite projects where it stands and only its depth moves.
  if (uExactLift < 0.5) view.z += iLift;
  float angle = iData.y;
  // Turned to follow a world direction on screen (a jet along the shot, a fireball along its flight).
  if (dot(iDir.xyz, iDir.xyz) > 1e-8) {
    vec3 d = mat3(viewMatrix) * iDir.xyz;
    if (dot(d.xy, d.xy) > 1e-10) angle += atan(d.y, d.x) - uHeading;
  }
  float c = cos(angle);
  float s = sin(angle);
  vec2 local = vec2((uv.x - uPivot.x) * uAspect, uv.y - uPivot.y) * iData.x;
  vec2 corner = vec2(local.x * c - local.y * s, local.x * s + local.y * c);
  view.xy += corner;
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vWorld = (modelMatrix * vec4(iPos, 1.0)).xyz + right * corner.x + up * corner.y;
  gl_Position = projectionMatrix * view;
  if (uExactLift > 0.5 && iLift != 0.0) {
    vec4 moved = projectionMatrix * vec4(view.xy, view.z + iLift, 1.0);
    gl_Position.z = moved.z / moved.w * gl_Position.w;
  }
}`;

const FRAGMENT = /* glsl */ `
uniform sampler2D uMap;
uniform vec2 uGrid;
uniform float uFrames;
uniform float uLoop;
uniform float uSmoke;
uniform float uHasAlpha;
uniform float uLumaMask;
uniform float uSoftM;
uniform float uVignette;
uniform float uMode;
uniform float uMaskOut;
uniform vec2 uTexel;
uniform vec3 uEmber;
uniform vec3 uCrimson;
varying vec2 vUv;
varying float vAngle;
varying vec3 vSun;
varying float vFrame;
varying float vAlpha;
varying vec3 vTint;
varying vec3 vWorld;
varying float vGround;
varying float vOcclude;
varying vec3 vAge;
${VFX_NOISE_GLSL}
${VFX_SOFT_GLSL}
vec2 vxCell(float f, vec2 uv) {
  float col = mod(f, uGrid.x);
  float row = floor(f / uGrid.x);
  return (vec2(col, uGrid.y - 1.0 - row) + uv) / uGrid;
}
// Test A: the fire's colour by heat (char, dark red, orange, yellow, near-white), linear HDR-ready values.
vec3 fireRamp(float h) {
  vec3 c = mix(vec3(0.030, 0.024, 0.021), vec3(0.30, 0.045, 0.014), smoothstep(0.02, 0.12, h));
  c = mix(c, vec3(0.95, 0.30, 0.04), smoothstep(0.12, 0.4, h));
  c = mix(c, vec3(1.0, 0.66, 0.13), smoothstep(0.4, 0.68, h));
  return mix(c, vec3(1.0, 0.88, 0.60), smoothstep(0.75, 0.97, h));
}
void main() {
  if (vAlpha <= 0.0) discard;
  // Frames blend in time; a loop wraps to its first frame.
  float f = uLoop > 0.5 ? mod(vFrame, uFrames) : clamp(vFrame, 0.0, uFrames - 1.0);
  float f0 = floor(f);
  float f1 = uLoop > 0.5 ? mod(f0 + 1.0, uFrames) : min(f0 + 1.0, uFrames - 1.0);
  // A cell's last texel row and column never bleed into the next (mip levels): fade a thin border.
  vec2 uv = clamp(vUv, 0.004, 0.996);
  vec4 t = mix(texture2D(uMap, vxCell(f0, uv)), texture2D(uMap, vxCell(f1, uv)), f - f0);
  float border = smoothstep(0.0, 0.025, min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y)));
  // A burst whose smoke reaches the cell's edge would show the square: round it off. Ground fire (2): its flames run
  // off the cell's sides, which showed as straight quad edges (round 9, close-light f085–f145): fade the sides.
  if (uVignette > 1.5) border *= smoothstep(0.0, 0.22, vUv.x) * smoothstep(0.0, 0.22, 1.0 - vUv.x) * smoothstep(0.0, 0.12, 1.0 - vUv.y);
  else border *= 1.0 - uVignette * smoothstep(0.6, 0.98, length(vUv - 0.5) * 2.0);
  float soft = vxSoftGround(vWorld, vGround, uSoftM) * border * vAlpha;
  float lum = max(t.r, max(t.g, t.b));
  // Round 9 (both judges: the fire faded through see-through mustard and olive over grass, c079–c081): from vAge.y of
  // its life (vAge.x) a sprite cools, through deep red to charcoal, and the noise eats it from its thin parts in;
  // it never thins as a gold veil. Smoke erodes the same way as it rises.
  float cool = vAge.y > 0.0 ? clamp((vAge.x - vAge.y) / max(0.05, 1.0 - vAge.y), 0.0, 1.0) : 0.0;
  float n = vxNoise(vUv * 6.0 + vec2(vAge.z * 13.1, vAge.z * 7.3)) * 0.65 + vxNoise(vUv * 15.0 - vec2(vAge.z * 5.7, 0.0)) * 0.35;
  if (uMode > 5.5) {
    // Test B scorch: A = a soft round coverage, R = the painting's detail, G = a wide falloff (1 at the heart). It grows
    // in from the heart while the fire covers it, holds, then shrinks back toward the heart (a soft front, never a
    // see-through veil: darkened grass reads olive). Warm dark brown, never black; a glowing ember edge that cools
    // toward the brown (a dark red read as a brown silhouette). vAge.x is its life (0–1), vTint its brown.
    vec4 ts = texture2D(uMap, vxCell(0.0, uv));
    float k = vAge.x;
    float field = ts.g + (ts.r - 0.5) * 0.12 + (n - 0.5) * 0.1;
    float thr = max(1.0 - smoothstep(0.0, 0.07, k) * 1.0, mix(0.0, 1.1, smoothstep(0.42, 0.93, k)));
    float vis = smoothstep(thr, thr + 0.07, field);
    // A smooth outline but a short edge (2–3 px): a long see-through brown or ember fringe over grass reads olive.
    float a = smoothstep(0.22, 0.5, ts.a) * vis * clamp(vAlpha, 0.0, 1.0);
    if (uMaskOut > 0.5) { gl_FragColor = vec4(a, 0.0, 0.0, a); return; }
    vec3 base = vTint * mix(0.74, 1.16, ts.r) * mix(0.86, 1.0, smoothstep(0.6, 0.2, ts.g));
    // The ember edge: the coverage's soft rim and the moving front, hot for ~0.4 s, cooling over ~1.2 s.
    float heat = exp(-k * 2.2);
    float rim = (1.0 - smoothstep(0.35, 0.7, ts.a)) + (1.0 - smoothstep(0.0, 0.6, vis));
    float specks = smoothstep(0.62, 0.8, ts.r) * smoothstep(0.35, 0.9, ts.g);
    float glow = clamp(rim * 0.8 + specks * 0.7, 0.0, 1.0) * heat;
    // Red at the cool end (an orange third over grass reads mustard), orange only while hot.
    vec3 hot = mix(vec3(0.36, 0.03, 0.012), uEmber, smoothstep(0.45, 0.9, heat));
    vec3 c = mix(base, hot * (1.0 + 1.6 * heat), clamp(glow * 1.15, 0.0, 1.0));
    gl_FragColor = vec4(c, a);
    return;
  }
  if (uMode > 4.5) {
    // Test B smoke (smoke-cel v2, warm grey, no outline, straight alpha): stepped cel frames; lit as drawn (top) plus
    // a little more on the sun's side on screen; it shrinks away (a threshold over its blurred coverage) before the
    // clip's flat-top cells, never fading through see-through grey (olive over grass). Premultiplied.
    vec4 tc = texture2D(uMap, vxCell(f0, uv));
    float covB = texture2D(uMap, vxCell(f0, uv), 3.0).a;
    // Shrinks from half its life over ~48 frames, its thin parts first and toward its heart, with an ease so no frame
    // drops more than a quarter of what is left.
    float late = smoothstep(0.5, 1.0, vAge.x);
    vec2 pc = (vUv - vec2(0.5, 0.36)) * vec2(1.6, 2.2);
    float field = covB * 0.5 + tc.a * 0.15 + 0.35 * (1.0 - min(length(pc), 1.0)) + (n - 0.5) * 0.08;
    float thr = late * 1.02;
    float a = tc.a * smoothstep(thr, thr + 0.12, field) * soft;
    if (uMaskOut > 0.5) { gl_FragColor = vec4(a, 0.0, 0.0, a); return; }
    float ca = cos(vAngle);
    float sa = sin(vAngle);
    vec2 p = (vUv - vec2(0.5, 0.42)) * 2.0;
    vec2 pv = vec2(p.x * ca - p.y * sa, p.x * sa + p.y * ca);
    vec2 sun2 = normalize(vSun.xy + vec2(1e-4, 0.0));
    float side = clamp(dot(pv, sun2), -1.0, 1.0);
    vec3 c = tc.rgb * vTint * (1.0 + 0.22 * side);
    gl_FragColor = vec4(c * a, a);
    return;
  }
  if (uMode > 3.5) {
    // Test B fire (impact-cel v2, recoloured offline, straight alpha): stepped cel frames (a crossfade ghosts the
    // drawing), blended normally, its colour as drawn; it ends by the clip's own break-up and a toon fade in steps of a
    // third (no erosion: the paper-burn of test A). The fade into the ground is broken by the noise.
    // A boil (the drawn line wobbles a little each cel, so the rays never run dead straight), stepped with the frame.
    vec2 bw = vec2(vxNoise(vUv * 3.5 + vec2(f0 * 0.37 + vAge.z * 9.0, 1.3)), vxNoise(vUv * 3.5 + vec2(5.1, f0 * 0.41 + vAge.z * 7.0))) - 0.5;
    vec2 buv = clamp(uv + bw * 0.022, 0.004, 0.996);
    vec4 tc = texture2D(uMap, vxCell(f0, buv));
    float steps = ceil(clamp(vAlpha, 0.0, 1.0) * 3.0 - 0.001) / 3.0;
    float sb = vxSoftGround(vWorld + vec3(0.0, (n - 0.5) * uSoftM, 0.0), vGround, uSoftM) * border;
    // Crisp cel edges: the mip-softened fringe (a third of orange over grass reads olive, over sand peach) is cut to
    // about a pixel.
    float a = smoothstep(0.22, 0.62, tc.a) * steps * sb;
    if (uMaskOut > 0.5) { gl_FragColor = vec4(a, 0.0, 0.0, a); return; }
    // While it fades its colour goes to crimson (a yellow third over grass reads olive; crimson stays hot).
    vec3 c = mix(uCrimson, tc.rgb, steps * steps);
    gl_FragColor = vec4(c * vTint * a, a);
    return;
  }
  if (uMode > 2.5) {
    // Test A decal (the painted 038 scorch): the char tint lit by the painting (its own colour read green over grass).
    // It comes and goes by erosion of the spatter (its densest parts first), never see-through (darkened grass reads
    // olive): vAlpha raises the threshold.
    float lift = (1.0 - clamp(vAlpha, 0.0, 1.0)) * 0.65;
    float a = smoothstep(0.36 + lift, 0.46 + lift, t.a) * border;
    if (uMaskOut > 0.5) { gl_FragColor = vec4(a, 0.0, 0.0, a); return; }
    gl_FragColor = vec4(vTint * (0.75 + 1.5 * dot(t.rgb, vec3(0.2126, 0.7152, 0.0722))), a);
    return;
  }
  if (uMode > 1.5) {
    // Test A smoke: the clip is coverage (alpha) and its own shading (light ÷ coverage). Lit by the sun (half-Lambert)
    // on a puff's round normal (its offset from the centre, turned to the view) plus the clip's slope for detail;
    // warm grey from the tint, a fire-lit underside while young. Dense inside (a see-through grey over grass reads
    // olive), it dies by erosion from its thin parts in, not by fading. Premultiplied.
    float cov = t.a;
    float shade = clamp(sqrt(lum) / max(cov, 0.12), 0.0, 1.0);
    vec2 cuv = vxCell(floor(f), uv);
    // The slope of the clip's density (its light, which keeps varying inside the opaque part), 3 texels apart.
    vec3 lw = vec3(0.2126, 0.7152, 0.0722);
    vec2 o = uTexel * 3.0;
    float gx = sqrt(dot(texture2D(uMap, cuv + vec2(o.x, 0.0)).rgb, lw)) - sqrt(dot(texture2D(uMap, cuv - vec2(o.x, 0.0)).rgb, lw));
    float gy = sqrt(dot(texture2D(uMap, cuv + vec2(0.0, o.y)).rgb, lw)) - sqrt(dot(texture2D(uMap, cuv - vec2(0.0, o.y)).rgb, lw));
    float ca = cos(vAngle);
    float sa = sin(vAngle);
    vec2 g = vec2(gx * ca - gy * sa, gx * sa + gy * ca);
    vec2 p = (vUv - 0.5) * 2.0;
    vec2 pv = vec2(p.x * ca - p.y * sa, p.x * sa + p.y * ca);
    vec3 nrm = normalize(vec3(pv * 1.1 - g * 3.0, 0.45));
    // The play camera looks down, so the sun is mostly behind it: light the puffs from the sun's side on screen.
    vec3 sunV = normalize(vec3(normalize(vSun.xy + vec2(1e-4, 0.0)) * 0.8, 0.6));
    float lambert = clamp(dot(nrm, sunV) * 0.5 + 0.5, 0.0, 1.0);
    vec3 c = vTint * (0.2 + 1.7 * lambert * lambert) * mix(0.55, 1.35, shade);
    float young = 1.0 - smoothstep(0.0, 0.25, vAge.x);
    c += vec3(0.85, 0.32, 0.07) * young * (1.0 - smoothstep(0.1, 0.55, vUv.y)) * smoothstep(0.3, 0.8, cov) * 0.6;
    // Erosion over its life (eased, a few % of its area a frame): the threshold rises through the density.
    // The field spreads from the rim to the heart (a blurred density and a round falloff), so the front moves in
    // steadily instead of a flat dense middle going all at once.
    float covB = mix(texture2D(uMap, vxCell(f0, uv), 3.5).a, texture2D(uMap, vxCell(f1, uv), 3.5).a, f - f0);
    float field = cov * (0.25 + 0.3 * covB) + 0.55 * (1.0 - min(length(p), 1.0)) + (n - 0.5) * 0.2;
    float late = clamp((vAge.x - 0.3) / 0.68, 0.0, 1.0);
    float thr = late * 1.25;
    float a = smoothstep(thr, thr + 0.09, field) * smoothstep(0.1, 0.26, cov) * soft;
    if (uMaskOut > 0.5) { gl_FragColor = vec4(a, 0.0, 0.0, a); return; }
    gl_FragColor = vec4(c * a, a);
    return;
  }
  if (uMode > 0.5) {
    // Test A fire (DRAGON_FIRE_DIAGNOSIS §2 A1): the clip gives coverage (alpha, the widened luma matte) and heat (its
    // light); the colour is a ramp of the heat. It dies by erosion: a threshold rising over its life eats the burst
    // from its rim in (a blurred heat, so no lace of holes), with a thin burnt dark-red edge; the glow goes faster
    // than the body, and what cools turns char, not rust. A dark body blended normally plus an additive glow,
    // premultiplied in one pass: never a see-through veil, never a flat cut-out.
    vec3 lw = vec3(0.2126, 0.7152, 0.0722);
    float cov = t.a;
    // Heat: the clip's light as display luma (an orange flame is mid heat, only its white heart is hot).
    float heat = pow(max(dot(t.rgb, lw), 0.0), 0.4545);
    // The burst's hot heart, low frequency (2 mip levels down): the order the erosion follows, rim first.
    vec4 tb = mix(texture2D(uMap, vxCell(f0, uv), 2.0), texture2D(uMap, vxCell(f1, uv), 2.0), f - f0);
    float heart = pow(max(dot(tb.rgb, lw), 0.0), 0.4545);
    float e = vAge.y > 0.0 ? clamp((vAge.x - vAge.y) / max(0.05, 1.0 - vAge.y), 0.0, 1.0) : 0.0;
    float h = pow(heat, 1.25);
    float nf = vxNoise(vUv * 4.0 + vec2(vAge.z * 13.1, vAge.z * 7.3)) * 0.7 + vxNoise(vUv * 11.0 - vec2(vAge.z * 5.7, 0.0)) * 0.3;
    // A fine noise breaks the front so it never runs straight along the blurred field.
    float field = cov * (0.55 * heart + 0.25 * heat + 0.2) + (nf - 0.5) * 0.16 + (vxNoise(vUv * 27.0 + vAge.z * 3.1) - 0.5) * 0.08;
    // The fade into the ground, broken by the noise (a clean fade over flat ground drew a straight horizontal edge).
    soft = vxSoftGround(vWorld + vec3(0.0, (nf - 0.5) * uSoftM * 1.2, 0.0), vGround, uSoftM) * border * vAlpha;
    float thr = e * 1.1 - 0.04;
    float keep = smoothstep(thr, thr + 0.05, field);
    // The glow goes first: its threshold runs ahead of the body's. Between the two fronts the body is char (a smoky
    // dark edge, never a rust or brown silhouette); the glow's front burns as a thin dark-red line.
    float gthr = thr + 0.1 * smoothstep(0.0, 0.12, e);
    float glowKeep = smoothstep(gthr, gthr + 0.06, field);
    float burnt = smoothstep(gthr - 0.015, gthr + 0.015, field) * (1.0 - smoothstep(gthr + 0.02, gthr + 0.07, field)) * smoothstep(0.0, 0.06, e);
    // The body: char where the clip is dim or the glow has gone, a deep red under the live flame.
    vec3 body = mix(vec3(0.036, 0.034, 0.034), vec3(0.20, 0.035, 0.012), smoothstep(0.12, 0.42, h) * glowKeep);
    // The dim rim is a smoky char border (the dark layer under the bright, VFX_STANDARD §3.5 rule 4), broken by the
    // noise so it never reads as a drawn outline; the widened matte's fringe is softer still.
    // The edge is short (a see-through fringe of orange over grass read olive in the first frames).
    float covE = smoothstep(0.08, 0.55, cov);
    float aBody = covE * keep * mix(0.45, 1.0, smoothstep(0.0, 0.14, heat)) * mix(0.75, 1.0, nf) * soft;
    // The glow: orange flame from low heat, yellow to near-white only in the heart (HDR there, never on the orange).
    float g = smoothstep(0.07, 0.42, h) * (1.0 - 0.3 * e) + 1.1 * smoothstep(0.8, 0.98, h);
    // The burnt line glows a deep red-orange (never a dark brown: value stays well over 0.35).
    // What is left cools as it is eaten: the white heart goes yellow, then orange (never a cream chunk at the end).
    vec3 glow = (fireRamp(h * (1.0 - 0.45 * e)) * g * glowKeep + vec3(0.7, 0.14, 0.025) * burnt) * covE * smoothstep(0.25, 0.8, cov) * soft;
    if (uMaskOut > 0.5) { gl_FragColor = vec4(aBody, 0.0, 0.0, aBody); return; }
    gl_FragColor = vec4(body * vTint * aBody + glow * vTint * vOcclude * keep, aBody);
    return;
  }
  if (uSmoke > 0.5) {
    // Round 10 (both judges: a flat olive or khaki patch over grass, a straight-edged band): the clip is only a DENSITY
    // mask (its alpha, its luminance for white smoke on black, or its darkness for dark smoke on white); the colour is
    // made here. A dense warm charcoal core, a lighter warm grey top, a fire-lit underside while young; dense enough
    // that the grass never tints it, its thin edges eaten by the noise instead of fading as a veil.
    // A luminance mask is read in its display values (sqrt ≈ sRGB): read linear, the cloud's shaded half fell to a
    // fifth and the smoke broke into grey blotches.
    float d = uHasAlpha > 0.5 ? t.a : uLumaMask > 0.5 ? sqrt(lum) : clamp((1.0 - lum) * 1.25, 0.0, 1.0);
    float core = smoothstep(0.35, 0.85, d);
    float a = smoothstep(0.05, 0.5, d + (n - 0.5) * 0.25) * smoothstep(cool * 1.1 - 0.14, cool * 1.1 + 0.1, n * 0.6 + d * 0.55);
    // Lighter warm grey toward the top and the thin parts, a warm charcoal only in the dense core.
    vec3 c = mix(vTint * 0.95, vTint * 1.55, smoothstep(0.25, 0.95, vUv.y));
    c = mix(c, vTint * 0.7, core * 0.45);
    float lit = (1.0 - smoothstep(0.0, 0.3, vAge.x)) * (1.0 - smoothstep(0.05, 0.55, vUv.y)) * core;
    c += vec3(0.95, 0.38, 0.08) * lit;
    if (uMaskOut > 0.5) { float m = a * (0.78 + 0.17 * core) * soft; gl_FragColor = vec4(m, 0.0, 0.0, m); return; }
    gl_FragColor = vec4(c, a * (0.78 + 0.17 * core) * soft);
    return;
  }
  vec3 rgb = t.rgb * vTint;
  float body = smoothstep(0.02, 0.45, lum);
  if (cool > 0.0) {
    // Round 10 (both judges: the fire died as flat hard-edged red cut-outs and rust lace): it darkens through deep red,
    // hot embers outlive it in its densest parts, and it fades softly into the smoke behind it (never an opaque rim).
    // Final check (a flat orange then olive veil at f030–f036; flat red cut-outs while the saturated red channel
    // kept every flame "dense"; a dark cut-out when the body outlived the light): it reddens, its thin parts (by
    // luma) go first, and its light and its body go together by 0.75, inside the density smoke drawn over it.
    float luma = dot(t.rgb, vec3(0.3, 0.59, 0.11));
    rgb *= mix(vec3(1.0), vec3(0.85, 0.3, 0.12), smoothstep(0.0, 0.3, cool));
    float keep = cool * 0.45;
    float left = smoothstep(keep, keep + 0.12, luma + (n - 0.5) * 0.16) * (1.0 - smoothstep(0.2, 0.75, cool));
    float ember = smoothstep(0.7, 0.88, n) * smoothstep(0.25, 0.6, luma) * (1.0 - smoothstep(0.5, 0.85, cool));
    rgb = (rgb + vec3(1.5, 0.5, 0.08) * ember) * left;
    body *= left;
  }
  // Fire on black, premultiplied: the light is added, the ground under it darkens by its luminance × occlude. The
  // curve is steep (final check on light ground: the burst's dim flames stayed see-through and pale): a dim red flame
  // already hides most of the stone under it, so it reads deep red, the dark under-layer of the bright core.
  if (uMaskOut > 0.5) { gl_FragColor = vec4(body * soft, 0.0, 0.0, body * soft); return; }
  gl_FragColor = vec4(rgb * soft, body * vOcclude * soft);
}`;

export interface FlipOptions {
  /** Seconds it lives (default: one pass of the clip at `rate`; a loop: one second). ONE_FRAME: drawn this frame only. */
  life?: number;
  /** Playback speed × the clip's fps (default 1); 0 holds `frame`. */
  rate?: number;
  /** First frame (fractional; a loop: any phase). */
  frame?: number;
  rot?: number;
  spin?: number;
  /** Size multiplier reached at the end of its life (ease-out); 0: no growth. */
  grow?: number;
  alpha?: number;
  /** Colour × intensity (HDR) the clip is multiplied by (fire); the smoke's own colour (smoke). */
  tint?: THREE.Color;
  intensity?: number;
  /** How much the ground under the fire darkens by its luminance (fire only, 0–1); test A fire: the glow's gain. */
  occlude?: number;
  vx?: number;
  vy?: number;
  vz?: number;
  drag?: number;
  /** Up is positive: smoke rises with a negative gravity. */
  gravity?: number;
  /** A world direction the sprite's +x follows on screen (null: free, turned by `rot`). */
  dir?: THREE.Vector3 | null;
  /** Ground height under it for the soft fade (undefined: none). */
  ground?: number;
  /** Seconds to come in (0: full on its first frame, VFX_STANDARD §3.1 rule 5) and seconds to go out at the end. */
  fadeIn?: number;
  fadeOut?: number;
  /** Seconds before it is drawn at all (then at its first frame). */
  delay?: number;
  /** From this share of its life (0–1) it cools to deep red and charcoal and erodes (round 9); 0: never. */
  cool?: number;
  /** Last frame a one-shot plays to (it stops there, even if the clip goes on; e.g. before an artefact). */
  until?: number;
  /** Drawn this much nearer the eye (m, depth only). */
  lift?: number;
}

const WHITE = new THREE.Color(1, 1, 1);

/** `life` for a sprite drawn on this frame only (a head or an orb the caller redraws every frame). */
export const ONE_FRAME = 1e-4;

/**
 * One atlas's sprites in one draw call (hidden while empty). Built at load with a blank texture and its id's blend,
 * so FxCore.warmDraw builds its pipeline; `attach` gives it the atlas when it arrives.
 */
export class FlipbookPool {
  readonly mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  meta: FlipbookMeta | null = null;
  private readonly iPos: Float32Array;
  private readonly iData: Float32Array;
  private readonly iColor: Float32Array;
  private readonly iDir: Float32Array;
  private readonly iAge: Float32Array;
  private readonly iLift: Float32Array;
  /** x y z, vx vy vz, size, grow, rot, spin, age, life, frame, fps, alpha, drag, gravity, fadeIn, fadeOut, ground, occlude, r g b, dx dy dz, delay, cool, seed */
  private readonly state: Float32Array;
  private static readonly STRIDE = 31;
  private cursor = 0;
  live = 0;

  constructor(readonly id: FlipbookId, readonly capacity: number, renderOrder: number, blank: THREE.Texture) {
    const mode = FLIPBOOK_MODE[id];
    const smoke = mode === "smoke" || mode === "decal" || mode === "decalB";
    this.iPos = new Float32Array(capacity * 3);
    this.iData = new Float32Array(capacity * 4);
    this.iColor = new Float32Array(capacity * 4);
    this.iDir = new Float32Array(capacity * 4);
    this.iAge = new Float32Array(capacity * 3);
    this.iLift = new Float32Array(capacity);
    this.state = new Float32Array(capacity * FlipbookPool.STRIDE);
    const base = new THREE.PlaneGeometry(1, 1);
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.index = base.index;
    geometry.setAttribute("position", base.getAttribute("position"));
    geometry.setAttribute("uv", base.getAttribute("uv"));
    geometry.setAttribute("iPos", new THREE.InstancedBufferAttribute(this.iPos, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute("iData", new THREE.InstancedBufferAttribute(this.iData, 4).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute("iColor", new THREE.InstancedBufferAttribute(this.iColor, 4).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute("iDir", new THREE.InstancedBufferAttribute(this.iDir, 4).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute("iAge", new THREE.InstancedBufferAttribute(this.iAge, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute("iLift", new THREE.InstancedBufferAttribute(this.iLift, 1).setUsage(THREE.DynamicDrawUsage));
    geometry.instanceCount = 0;
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: blank },
        uGrid: { value: new THREE.Vector2(1, 1) },
        uFrames: { value: 1 },
        uLoop: { value: 0 },
        uSmoke: { value: smoke ? 1 : 0 },
        uHasAlpha: { value: 0 },
        uLumaMask: { value: id === "smoke-mask" || id === "smoke-column" ? 1 : 0 },
        uSoftM: { value: 0.8 },
        uVignette: { value: id === "ground-fire" ? 2 : id === "impact-burst" || id === "impact-big" || id === "fire-burst" || id === "smoke-roll" || id === "smoke-mask" || id === "smoke-column" || id === "embers" ? 1 : 0 },
        uPivot: { value: new THREE.Vector2(0.5, 0.5) },
        uAspect: { value: 1 },
        uHeading: { value: 0 },
        uMode: { value: mode === "fireA" ? 1 : mode === "smokeA" ? 2 : mode === "decal" ? 3 : mode === "fireB" ? 4 : mode === "smokeB" ? 5 : mode === "decalB" ? 6 : 0 },
        uMaskOut: { value: 0 },
        uTexel: { value: new THREE.Vector2(1 / 2048, 1 / 1024) },
        uFlat: { value: mode === "decal" || mode === "decalB" ? 1 : 0 },
        uExactLift: { value: mode === "fireB" || mode === "smokeB" ? 1 : 0 },
        uEmber: { value: new THREE.Color("#ff6a1a") },
        uCrimson: { value: new THREE.Color("#a5181a") },
        uSun: { value: new THREE.Vector3(-0.55, 1.05, 0.62).normalize() },
      },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: smoke ? THREE.NormalBlending : THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.ZeroFactor,
      blendDstAlpha: THREE.OneFactor,
      // A flat decal sits a few cm over the ground: keep it off the terrain's depth.
      polygonOffset: mode === "decal" || mode === "decalB",
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    if (mode === "smokeA" || mode === "fireA") material.uniforms.uVignette!.value = 1;
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;
    this.mesh.visible = false;
    this.mesh.name = "flipbook-" + id;
  }

  get ready(): boolean {
    return this.meta !== null;
  }

  /** Gives the pool its atlas (FlipbookLibrary.watch). */
  attach(meta: FlipbookMeta, texture: THREE.Texture): void {
    this.meta = meta;
    const u = this.mesh.material.uniforms;
    u.uMap!.value = texture;
    (u.uGrid!.value as THREE.Vector2).set(meta.cols, meta.rows);
    u.uFrames!.value = meta.frames;
    u.uLoop!.value = meta.loop ? 1 : 0;
    (u.uPivot!.value as THREE.Vector2).set(meta.pivot[0], 1 - meta.pivot[1]);
    u.uAspect!.value = meta.aspect;
    u.uHeading!.value = meta.heading;
    u.uHasAlpha!.value = meta.alpha ? 1 : 0;
    const image = texture.image as { width?: number; height?: number } | undefined;
    (u.uTexel!.value as THREE.Vector2).set(1 / (image?.width || meta.cols * 256), 1 / (image?.height || meta.rows * 256));
  }

  /** Test A: the sun the smoke is lit by (world direction toward the sun). */
  set sun(dir: THREE.Vector3) {
    (this.mesh.material.uniforms.uSun!.value as THREE.Vector3).copy(dir).normalize();
  }

  /** Soft fade distance against the ground (m). */
  set softM(value: number) {
    this.mesh.material.uniforms.uSoftM!.value = value;
  }

  /** Seconds one pass of the clip lasts at `rate`. */
  clipS(rate = 1): number {
    return this.meta === null ? 0.5 : (this.meta.frames - this.meta.start) / (this.meta.fps * Math.max(0.05, rate));
  }

  /** One sprite at `at`, `size` m tall (its width by the cell's aspect). Draws nothing until an atlas is attached. */
  spawn(at: THREE.Vector3, size: number, options: FlipOptions = {}): void {
    const meta = this.meta;
    if (meta === null) return;
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.capacity;
    const rate = options.rate ?? 1;
    const fps = meta.fps * rate;
    const first = options.frame ?? (meta.loop ? 0 : meta.start);
    const last = Math.min(meta.frames, options.until !== undefined ? options.until + 1 : meta.frames);
    const life = options.life ?? (meta.loop || rate <= 0 ? 1 : Math.max(1 / 60, (last - first) / Math.max(1e-3, fps)));
    const tint = options.tint ?? WHITE;
    const k = options.intensity ?? 1;
    const dir = options.dir ?? null;
    this.state.set(
      [
        at.x, at.y, at.z,
        options.vx ?? 0, options.vy ?? 0, options.vz ?? 0,
        size, options.grow ?? 0, options.rot ?? 0, options.spin ?? 0,
        0, Math.max(1e-4, life), first, fps,
        options.alpha ?? 1, options.drag ?? 0, options.gravity ?? 0, options.fadeIn ?? 0, options.fadeOut ?? Math.min(0.12, life * 0.3),
        options.ground ?? -1e5, options.occlude ?? 0.5,
        tint.r * k, tint.g * k, tint.b * k,
        dir?.x ?? 0, dir?.y ?? 0, dir?.z ?? 0,
        Math.max(0, options.delay ?? 0),
        options.cool ?? 0, (i * 0.618034) % 1,
        options.lift ?? 0,
      ],
      i * FlipbookPool.STRIDE,
    );
  }

  /** Draws each sprite at its age (frame 0 at age 0, full alpha unless it fades in), then ages it by `dt`. */
  update(dt: number): void {
    let n = 0;
    const S = FlipbookPool.STRIDE;
    const st = this.state;
    for (let i = 0; i < this.capacity; i += 1) {
      const o = i * S;
      const life = st[o + 11]!;
      const age = st[o + 10]!;
      if (life <= 0 || age >= life) {
        st[o + 11] = 0;
        continue;
      }
      if (st[o + 27]! > 0) {
        st[o + 27] = st[o + 27]! - dt;
        if (st[o + 27]! > 1e-6) continue;
        st[o + 27] = 0;
      }
      const k = age / life;
      const fadeIn = st[o + 17]! > 0 ? Math.min(1, (age + 1 / 60) / st[o + 17]!) : 1;
      const fadeOut = st[o + 18]! > 0 ? Math.min(1, (life - age) / st[o + 18]!) : 1;
      const grow = 1 + st[o + 7]! * (1 - (1 - k) * (1 - k));
      this.iPos[n * 3] = st[o]!;
      this.iPos[n * 3 + 1] = st[o + 1]!;
      this.iPos[n * 3 + 2] = st[o + 2]!;
      this.iData[n * 4] = st[o + 6]! * grow;
      this.iData[n * 4 + 1] = st[o + 8]!;
      this.iData[n * 4 + 2] = st[o + 12]! + age * st[o + 13]!;
      this.iData[n * 4 + 3] = st[o + 14]! * fadeIn * fadeOut;
      this.iColor[n * 4] = st[o + 21]!;
      this.iColor[n * 4 + 1] = st[o + 22]!;
      this.iColor[n * 4 + 2] = st[o + 23]!;
      this.iColor[n * 4 + 3] = st[o + 19]!;
      this.iDir[n * 4] = st[o + 24]!;
      this.iDir[n * 4 + 1] = st[o + 25]!;
      this.iDir[n * 4 + 2] = st[o + 26]!;
      this.iDir[n * 4 + 3] = st[o + 20]!;
      this.iAge[n * 3] = k;
      this.iAge[n * 3 + 1] = st[o + 28]!;
      this.iAge[n * 3 + 2] = st[o + 29]!;
      this.iLift[n] = st[o + 30]!;
      n += 1;
      // Then advance.
      const keep = Math.exp(-st[o + 15]! * dt);
      st[o + 3] = st[o + 3]! * keep;
      st[o + 4] = st[o + 4]! * keep + st[o + 16]! * dt;
      st[o + 5] = st[o + 5]! * keep;
      st[o] = st[o]! + st[o + 3]! * dt;
      st[o + 1] = st[o + 1]! + st[o + 4]! * dt;
      st[o + 2] = st[o + 2]! + st[o + 5]! * dt;
      st[o + 8] = st[o + 8]! + st[o + 9]! * dt;
      st[o + 10] = age + dt;
    }
    this.live = n;
    const geometry = this.mesh.geometry;
    geometry.instanceCount = n;
    this.mesh.visible = n > 0;
    if (n === 0) return;
    geometry.getAttribute("iPos").needsUpdate = true;
    geometry.getAttribute("iData").needsUpdate = true;
    geometry.getAttribute("iColor").needsUpdate = true;
    geometry.getAttribute("iDir").needsUpdate = true;
    geometry.getAttribute("iAge").needsUpdate = true;
    geometry.getAttribute("iLift").needsUpdate = true;
  }

  /** Warm-up: one sprite of the blank atlas for the load-time frame (cleared after). */
  warm(at: THREE.Vector3): void {
    this.iPos.set([at.x, at.y, at.z], 0);
    this.iData.set([1, 0, 0, 1], 0);
    this.iColor.set([1, 1, 1, -1e5], 0);
    this.iDir.set([0, 0, 0, 0.5], 0);
    const geometry = this.mesh.geometry;
    geometry.instanceCount = 1;
    this.mesh.visible = true;
    this.iAge.set([0, 0, 0], 0);
    this.iLift[0] = 0;
    for (const name of ["iPos", "iData", "iColor", "iDir", "iAge", "iLift"]) geometry.getAttribute(name).needsUpdate = true;
  }

  clear(): void {
    for (let i = 0; i < this.capacity; i += 1) this.state[i * FlipbookPool.STRIDE + 11] = 0;
    this.live = 0;
    this.mesh.geometry.instanceCount = 0;
    this.mesh.visible = false;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

/** Every id's pool, attached as atlases arrive; FxCore and Sky Fire draw through it. */
export class FlipbookSet {
  readonly group = new THREE.Group();
  readonly pools: Readonly<Record<FlipbookId, FlipbookPool>>;
  private readonly unwatch: () => void;
  /** Uploads an atlas as it arrives (set by FxCore.warm: no texture upload on the first frame it is drawn). */
  upload: ((texture: THREE.Texture) => void) | null = null;

  constructor(blank: THREE.Texture, capacity: Partial<Record<FlipbookId, number>> = {}) {
    // Draw order: smoke behind fire (5.2), the bodies with the puffs (5), heads and flashes over them (5.8).
    const order: Record<FlipbookId, number> = {
      "smoke-roll": 4.9,
      // Round 10 final check: the density smoke over the impact clips (5.3), so a dying fire goes into the smoke
      // instead of showing as a dim red veil under it.
      "smoke-mask": 5.35,
      "smoke-column": 5.35,
      "ground-fire": 4.95,
      "impact-burst": 5.3,
      "impact-big": 5.3,
      "fire-burst": 5.3,
      embers: 5.9,
      "charge-orb": 5.8,
      // Under the puffs (5): the release star and its white core are the frame-0 element (§5.6) and must not be
      // darkened by a clip's blend (final check: the flash cell's first frame fell to 0.61–0.94 of its peak).
      "muzzle-flash": 4.96,
      "fireball-head": 4.97,
      "flame-trail": 5.1,
      // Test A: the smoke under the fire, the painted halo behind the body, the scorch with the ground marks.
      "smoke-mask-a": 5.25,
      "halo-a": 5.27,
      "impact-burst-a": 5.3,
      "scorch-a": 2.05,
      // Test B: the smoke behind the fire, the heat glow under the cel body, the scorch with the ground marks.
      "smoke-cel-b": 5.25,
      "halo-b": 5.27,
      "impact-cel-b": 5.3,
      "scorch-b": 2.05,
    };
    const pools = {} as Record<FlipbookId, FlipbookPool>;
    for (const id of FLIPBOOK_IDS) {
      pools[id] = new FlipbookPool(id, capacity[id] ?? 24, order[id], blank);
      this.group.add(pools[id].mesh);
    }
    this.pools = pools;
    this.group.name = "fx-flipbooks";
    const unwatch = [flipbooks, fireAFlipbooks, fireBFlipbooks].map((library) =>
      library.watch((id) => {
        const entry = library.get(id);
        if (entry === null) return;
        this.upload?.(entry.texture);
        pools[id].attach(entry.meta, entry.texture);
      }),
    );
    this.unwatch = () => unwatch.forEach((stop) => stop());
  }

  /** The pool for `id` if its atlas is in, else the first of `fallbacks` that is (null: none; keep the code layer). */
  pick(id: FlipbookId, ...fallbacks: FlipbookId[]): FlipbookPool | null {
    if (this.pools[id].ready) return this.pools[id];
    for (const other of fallbacks) if (this.pools[other].ready) return this.pools[other];
    return null;
  }

  update(dt: number): void {
    for (const id of FLIPBOOK_IDS) this.pools[id].update(dt);
  }

  set softM(value: number) {
    // Ground fire stands on the ground: a short fade, or its flames' base would be eaten.
    for (const id of FLIPBOOK_IDS) this.pools[id].softM = id === "ground-fire" ? value * 0.2 : value;
  }

  warm(at: THREE.Vector3): void {
    for (const id of FLIPBOOK_IDS) this.pools[id].warm(at);
  }

  clear(): void {
    for (const id of FLIPBOOK_IDS) this.pools[id].clear();
  }

  /** Live sprites (stats). */
  get live(): number {
    let n = 0;
    for (const id of FLIPBOOK_IDS) n += this.pools[id].live;
    return n;
  }

  dispose(): void {
    this.unwatch();
    for (const id of FLIPBOOK_IDS) this.pools[id].dispose();
    this.group.removeFromParent();
  }
}
