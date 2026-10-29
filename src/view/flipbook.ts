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
import { VFX_SOFT_GLSL } from "./vfx-layers";

/** The Firefly ids (FIREFLY_VFX_LIST §3) and the first quick cut the coordinator made. */
export const FLIPBOOK_IDS = ["charge-orb", "muzzle-flash", "fireball-head", "flame-trail", "impact-burst", "impact-big", "smoke-roll", "embers", "ground-fire", "fire-burst"] as const;
export type FlipbookId = (typeof FLIPBOOK_IDS)[number];

/** How each id is drawn: smoke-roll is dark smoke on white (normal blend); every other is fire on black. */
export const FLIPBOOK_MODE: Readonly<Record<FlipbookId, "fire" | "smoke">> = {
  "charge-orb": "fire",
  "muzzle-flash": "fire",
  "fireball-head": "fire",
  "flame-trail": "fire",
  "impact-burst": "fire",
  "impact-big": "fire",
  "smoke-roll": "smoke",
  embers: "fire",
  "ground-fire": "fire",
  "fire-burst": "fire",
};

export const FIREFLY_BASE = "/assets/dragon-hold/vfx/firefly/";

export interface FlipbookMeta {
  readonly id: FlipbookId;
  readonly url: string;
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
    out.set(id, {
      id,
      url: base + entry.file + md5,
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
    });
  }
  return out;
}

interface Entry {
  meta: FlipbookMeta;
  texture: THREE.Texture;
}

/** The atlases of this page (loaded once; every run's pools attach to them). */
class FlipbookLibrary {
  private readonly entries = new Map<FlipbookId, Entry>();
  private readonly listeners = new Set<(id: FlipbookId) => void>();
  private loading: Promise<void> | null = null;

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

  /** Fetches the manifest and every atlas in it (once a page). No manifest: no flipbooks, the code-drawn layers stay. */
  load(base = FIREFLY_BASE, anisotropy = 4): Promise<void> {
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
      const loader = new THREE.TextureLoader();
      await Promise.all(
        [...metas.values()].map(async (meta) => {
          try {
            const texture = await loader.loadAsync(meta.url);
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
uniform vec2 uPivot;
uniform float uAspect;
uniform float uHeading;
varying vec2 vUv;
varying float vFrame;
varying float vAlpha;
varying vec3 vTint;
varying vec3 vWorld;
varying float vGround;
varying float vOcclude;
void main() {
  vUv = uv;
  vFrame = iData.z;
  vAlpha = iData.w;
  vTint = iColor.rgb;
  vGround = iColor.a;
  vOcclude = iDir.w;
  vec4 view = modelViewMatrix * vec4(iPos, 1.0);
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
}`;

const FRAGMENT = /* glsl */ `
uniform sampler2D uMap;
uniform vec2 uGrid;
uniform float uFrames;
uniform float uLoop;
uniform float uSmoke;
uniform float uSoftM;
uniform float uVignette;
varying vec2 vUv;
varying float vFrame;
varying float vAlpha;
varying vec3 vTint;
varying vec3 vWorld;
varying float vGround;
varying float vOcclude;
${VFX_SOFT_GLSL}
vec2 vxCell(float f, vec2 uv) {
  float col = mod(f, uGrid.x);
  float row = floor(f / uGrid.x);
  return (vec2(col, uGrid.y - 1.0 - row) + uv) / uGrid;
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
  // A burst whose smoke reaches the cell's edge would show the square: round it off.
  border *= 1.0 - uVignette * smoothstep(0.72, 1.0, length(vUv - 0.5) * 2.0);
  float soft = vxSoftGround(vWorld, vGround, uSoftM) * border * vAlpha;
  float lum = max(t.r, max(t.g, t.b));
  if (uSmoke > 0.5) {
    // Dark smoke filmed on white: its darkness is its alpha; the tint is the smoke's colour, the clip's grain on it.
    float a = t.a < 0.99 ? t.a : clamp((1.0 - lum) * 1.25, 0.0, 1.0);
    gl_FragColor = vec4(vTint * (0.7 + 0.6 * lum), a * soft);
    return;
  }
  // Fire on black, premultiplied: the light is added, the ground under it darkens by its luminance × occlude.
  gl_FragColor = vec4(t.rgb * vTint * soft, clamp(lum * 1.4, 0.0, 1.0) * vOcclude * soft);
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
  /** How much the ground under the fire darkens by its luminance (fire only, 0–1). */
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
  /** x y z, vx vy vz, size, grow, rot, spin, age, life, frame, fps, alpha, drag, gravity, fadeIn, fadeOut, ground, occlude, r g b, dx dy dz, delay */
  private readonly state: Float32Array;
  private static readonly STRIDE = 28;
  private cursor = 0;
  live = 0;

  constructor(readonly id: FlipbookId, readonly capacity: number, renderOrder: number, blank: THREE.Texture) {
    const smoke = FLIPBOOK_MODE[id] === "smoke";
    this.iPos = new Float32Array(capacity * 3);
    this.iData = new Float32Array(capacity * 4);
    this.iColor = new Float32Array(capacity * 4);
    this.iDir = new Float32Array(capacity * 4);
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
    geometry.instanceCount = 0;
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: blank },
        uGrid: { value: new THREE.Vector2(1, 1) },
        uFrames: { value: 1 },
        uLoop: { value: 0 },
        uSmoke: { value: smoke ? 1 : 0 },
        uSoftM: { value: 0.8 },
        uVignette: { value: id === "impact-burst" || id === "impact-big" || id === "fire-burst" || id === "smoke-roll" || id === "embers" ? 1 : 0 },
        uPivot: { value: new THREE.Vector2(0.5, 0.5) },
        uAspect: { value: 1 },
        uHeading: { value: 0 },
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
    });
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
    const life = options.life ?? (meta.loop || rate <= 0 ? 1 : (meta.frames - first) / Math.max(1e-3, fps));
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
    for (const name of ["iPos", "iData", "iColor", "iDir"]) geometry.getAttribute(name).needsUpdate = true;
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
      "ground-fire": 4.95,
      "impact-burst": 5.3,
      "impact-big": 5.3,
      "fire-burst": 5.3,
      embers: 5.9,
      "charge-orb": 5.8,
      "muzzle-flash": 5.75,
      "fireball-head": 5.8,
      "flame-trail": 5.1,
    };
    const pools = {} as Record<FlipbookId, FlipbookPool>;
    for (const id of FLIPBOOK_IDS) {
      pools[id] = new FlipbookPool(id, capacity[id] ?? 24, order[id], blank);
      this.group.add(pools[id].mesh);
    }
    this.pools = pools;
    this.group.name = "fx-flipbooks";
    this.unwatch = flipbooks.watch((id) => {
      const entry = flipbooks.get(id);
      if (entry === null) return;
      this.upload?.(entry.texture);
      pools[id].attach(entry.meta, entry.texture);
    });
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
    for (const id of FLIPBOOK_IDS) this.pools[id].softM = value;
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
