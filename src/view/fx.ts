/**
 * Combat VFX by feedback tier T0–T5 through kit/feedback's dragon profile
 * (05 §5–6): fire bolts from Hỏa Long's mouth that land on the strike's `hit`
 * event, Phun Lửa cone, Thiên Hỏa meteor, Long Hống shock ring, burn on foes,
 * spike burst, pine-cone bomb, net capture, heal aura, gold pop, hit sparks
 * and material debris, damage numbers, hit stop and trauma shake.
 *
 * Hit stop never eats keys: the presenter only answers timeScale(now) for
 * the world clock (0.05 inside a stop, kit HitStop); keys go straight to the
 * typing session in app/input-router and never pass through here.
 *
 * FxCore draws without a World (the bench and the showcase drive it
 * directly); createFx maps SimEvents onto it. Everything is pooled: nothing
 * is created during a wave. Grey box: procedural textures only (kit
 * textures()), no images.
 * Source adapted: games/space-typing/src/defense/view/vfx.ts (billboards, ground rings, pooled effects).
 * Owner: view-crowd-fx (LANES.md).
 */
import * as THREE from "three";
import { Debris, DRAGON, HitStop, NumberField, NumberSprites, STYLE, Trauma, tier as tierRow } from "../kit/feedback";
import { FLAME_FRAGMENT, FLAME_VERTEX, LightTrail, ParticlePool, textures } from "../kit/three";
import { HOUSES, TRAPS } from "../content/data/our-side";
import { GENERALS } from "../content/data/generals";
import { DAMAGE, HERO_SKILLS, RINGS } from "../content/rules";
import type { FeedbackTier, Grade, Material, SimEvent } from "../content/types";
import type { World } from "../sim/world";
import { pointAt } from "../sim/lanes";
import { uToM } from "../sim/fixed";
import type { FrameInfo, Presenter, Quality, ScreenPoint } from "../app/contracts";
import type { FoeLocator } from "./actors";
import type { Stage } from "./stage";
import type { TerrainView } from "./terrain";

// ── Colours (05 §2.2: semantic colours only for their meaning) ──────────────

/** Hỏa Long's fire: peach orange; strong (Chớp, Hoàn hảo) heads are typing teal (05 §6). */
export const FX_COLORS = {
  fire: new THREE.Color("#ff9e6b"),
  fireHot: new THREE.Color("#ffd9a0"),
  fireDeep: new THREE.Color("#e8552a"),
  /** The darkest of the fire ramp: the body under the release flash, so the white-hot core has a dark edge on the sunlit dais. */
  fireDark: new THREE.Color("#a8321a"),
  teal: new THREE.Color("#7ff5e0"),
  ember: new THREE.Color("#ff7a32"),
  smoke: new THREE.Color("#5a5650"),
  /** Soot: the dark puffs of a word bolt's impact (§3.5 rule 4, dark behind the bright). */
  soot: new THREE.Color("#2e2723"),
  dust: new THREE.Color("#a89272"),
  scorch: new THREE.Color("#2a2018"),
  wood: new THREE.Color("#8a6a45"),
  vine: new THREE.Color("#7fbf5a"),
  heal: new THREE.Color("#a6f0c0"),
  gold: new THREE.Color("#ffc83a"),
  white: new THREE.Color("#ffffff"),
  stun: new THREE.Color("#fff3b0"),
  mote: new THREE.Color("#e8f4d8"),
  /** HDR orange (above the 1.6 bloom threshold once stacked): the hot heart of Thiên Hỏa's mass and blast. */
  blastHot: new THREE.Color("#ffa040").multiplyScalar(1.8),
} as const;

/** Death shards by material (05 §6.3): two colours each. */
export const MATERIAL_COLORS: Readonly<Record<Material, readonly [string, string]>> = {
  leaf: ["#b9a24a", "#8c9a3c"],
  rotwood: ["#6b4f33", "#8a6a45"],
  stone: ["#7d7f86", "#5d6b4f"],
  fur: ["#8a6b52", "#c9b8a0"],
  chitin: ["#5b6078", "#9aa3c8"],
  mist: ["#a8b4d0", "#dfe6f2"],
  mud: ["#5a4a35", "#7a6448"],
  crystal: ["#c8d24a", "#e8f0a0"],
};

/** Budgets per quality (05 §8): combat particles, numbers, debris. */
export const FX_BUDGET: Readonly<Record<Quality, { particles: number; numbers: number; debris: number }>> = {
  low: { particles: 600, numbers: 50, debris: 150 },
  medium: { particles: 1500, numbers: 100, debris: 400 },
  high: { particles: 3000, numbers: 160, debris: 600 },
  ultra: { particles: 4500, numbers: 200, debris: 900 },
};

const TAU = Math.PI * 2;

/** A small seeded stream (mulberry32) for view-side randomness: a VFX capture repeats exactly (VFX_STANDARD §3.1 rule 4). */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 05 §6.1: fireball speed. */
const BOLT_SPEED = 18;
/**
 * A word's hit lands 0.2 s after its last key (00 §4.2, rules DAMAGE): a far
 * bolt flies faster so it arrives with its hit. At 18 m/s a 15 m shot took
 * 0.8 s, so the number and flash came while it was mid-bridge and it then
 * jumped the rest (test pass 26/10).
 */
const BOLT_MAX_S = DAMAGE.strikeDelayTicks / 60;
/** Viêm Đế's beam (01 §2.4: 2 × 22 m down the lane), how long it burns (s). */
const BEAM_S = 0.45;
/** Héo lan's stream from a waiting foe to the Dragon (s). */
const SEEP_S = 0.7;
/** Hắc Vụ's grey violet (00 D02), darker for a normal-blended body that reads on light ground. */
const SEEP_COLOR = new THREE.Color("#5a4a7e");
const SEEP_GLOW = new THREE.Color("#b58cff");
/** A bolt whose hit came early lands within this (s). */
const BOLT_CATCH_UP = 0.06;
/** A bolt that arrived first waits this long for its hit (s), then fizzles. */
const BOLT_WAIT = 0.35;
/** The fire ribbon behind a bolt reaches this far back along its curve (m), and its tail runs into the impact in 8 frames. */
const BOLT_RIBBON_M = 5;
const BOLT_TAIL_S = 8 / 60;
const MAX_BOLTS = 16;
const MAX_METEORS = 4;
const MAX_EMITTERS = 48;

// ── Quads: soft billboards and flat ground marks ────────────────────────────

const PUFF_VERTEX = /* glsl */ `
attribute vec3 iPos;
attribute vec4 iData;
attribute vec4 iColor;
varying vec2 vUv;
varying vec4 vColor;
varying float vSeed;
void main() {
  vUv = uv;
  vColor = iColor;
  vSeed = iData.w;
  float s = sin(iData.y);
  float c = cos(iData.y);
  if (iData.z > 0.5) {
    // Flat on the ground (rings, scorch, nets): x and −z.
    vec3 world = iPos + vec3(position.x * iData.x, 0.0, -position.y * iData.x);
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  } else {
    vec4 view = modelViewMatrix * vec4(iPos, 1.0);
    vec2 corner = position.xy * iData.x;
    view.xy += vec2(corner.x * c - corner.y * s, corner.x * s + corner.y * c);
    gl_Position = projectionMatrix * view;
  }
}`;

// Kinds by iData.z: 0 soft puff (billboard), 1 ring, 2 disc, 3 net, 4 rimmed area. iData.w: thickness for rings.
const PUFF_FRAGMENT = /* glsl */ `
varying vec2 vUv;
varying vec4 vColor;
varying float vSeed;
void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  if (vColor.a <= 0.0) discard;
  // A soft puff with a wobbly edge.
  float wobble = 0.85 + 0.15 * sin(atan(p.y, p.x) * 5.0 + vSeed * 30.0);
  float a = 1.0 - smoothstep(0.15, 1.0, length(p) / wobble);
  gl_FragColor = vec4(vColor.rgb, a * vColor.a);
}`;

const MARK_FRAGMENT = /* glsl */ `
varying vec2 vUv;
varying vec4 vColor;
varying float vSeed;
void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  float r = length(p);
  if (r > 1.0 || vColor.a <= 0.0) discard;
  float kind = floor(vSeed);
  float thick = fract(vSeed) * 2.0 + 0.04;
  float a = 0.0;
  vec3 rgb = vColor.rgb;
  if (kind < 1.5) {
    // Ring: a bright band at the edge.
    a = smoothstep(1.0 - thick, 1.0 - thick * 0.4, r) * (1.0 - smoothstep(0.96, 1.0, r));
  } else if (kind < 2.5) {
    // Disc: scorch or glow, a soft uneven edge.
    float angle = atan(p.y, p.x);
    float edge = 0.88 + 0.07 * sin(angle * 5.0 + vSeed * 13.0) + 0.05 * sin(angle * 11.0 - vSeed * 7.0);
    a = (1.0 - smoothstep(0.2 * edge, edge, r)) * (0.8 + 0.2 * sin(r * 14.0 + angle * 3.0));
  } else if (kind < 3.5) {
    // Net: two sets of cords inside a rim.
    vec2 q = vec2(p.x + p.y, p.x - p.y) * 3.2;
    float cord = max(smoothstep(0.36, 0.45, abs(fract(q.x) - 0.5)), smoothstep(0.36, 0.45, abs(fract(q.y) - 0.5)));
    float rim = smoothstep(0.86, 0.92, r);
    a = max(cord * (1.0 - smoothstep(0.88, 0.95, r)), rim);
  } else if (kind < 4.5) {
    // Area: a rim and a faint fill.
    a = smoothstep(1.0 - thick, 1.0 - thick * 0.5, r) * (1.0 - smoothstep(0.96, 1.0, r)) + 0.16 * (1.0 - smoothstep(0.6, 1.0, r));
  } else {
    // Blast scorch: a burnt core, solid to ~45 % of the radius, under a short falloff to a ragged rim with a few
    // spikes thrown out (a burn, not a soft disc); darker toward the middle.
    float angle = atan(p.y, p.x);
    float spikes = 0.2 * pow(abs(sin(angle * 3.0 + 0.7)), 8.0) + 0.14 * pow(abs(sin(angle * 5.0 - 1.9)), 10.0);
    float edge = 0.7 + spikes + 0.05 * sin(angle * 13.0 + 2.1);
    a = 1.0 - smoothstep(edge * 0.62, edge, r);
    rgb *= 0.5 + 0.5 * smoothstep(0.0, edge, r);
  }
  gl_FragColor = vec4(rgb, a * vColor.a);
}`;

/** Pooled quads updated on the CPU, one draw call: billboards (puffs) or flat marks. */
class QuadPool {
  readonly mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  private readonly iPos: Float32Array;
  private readonly iData: Float32Array;
  private readonly iColor: Float32Array;
  private readonly x: Float32Array;
  private readonly y: Float32Array;
  private readonly z: Float32Array;
  private readonly vx: Float32Array;
  private readonly vy: Float32Array;
  private readonly vz: Float32Array;
  private readonly size: Float32Array;
  private readonly grow: Float32Array;
  private readonly rot: Float32Array;
  private readonly spin: Float32Array;
  private readonly alpha: Float32Array;
  private readonly life: Float32Array;
  private readonly total: Float32Array;
  private readonly fadeIn: Float32Array;
  /** Seconds a quad stays at full alpha before it starts to fade (0: fades over its whole life). */
  private readonly hold: Float32Array;
  private readonly drag: Float32Array;
  private readonly seed: Float32Array;
  private readonly color: Float32Array;
  private cursor = 0;
  live = 0;

  constructor(readonly capacity: number, flat: boolean, blending: THREE.Blending, renderOrder: number, private readonly random: () => number = Math.random) {
    const f = (n = 1): Float32Array => new Float32Array(capacity * n);
    this.iPos = f(3);
    this.iData = f(4);
    this.iColor = f(4);
    [this.x, this.y, this.z, this.vx, this.vy, this.vz, this.size, this.grow, this.rot, this.spin, this.alpha, this.life, this.total, this.fadeIn, this.drag, this.seed] = [
      f(), f(), f(), f(), f(), f(), f(), f(), f(), f(), f(), f(), f(), f(), f(), f(),
    ];
    this.color = f(3);
    this.hold = f();
    const base = new THREE.PlaneGeometry(1, 1);
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.index = base.index;
    geometry.setAttribute("position", base.getAttribute("position"));
    geometry.setAttribute("uv", base.getAttribute("uv"));
    geometry.setAttribute("iPos", new THREE.InstancedBufferAttribute(this.iPos, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute("iData", new THREE.InstancedBufferAttribute(this.iData, 4).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute("iColor", new THREE.InstancedBufferAttribute(this.iColor, 4).setUsage(THREE.DynamicDrawUsage));
    geometry.instanceCount = 0;
    const material = new THREE.ShaderMaterial({
      vertexShader: PUFF_VERTEX,
      fragmentShader: flat ? MARK_FRAGMENT : PUFF_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending,
      polygonOffset: flat,
      polygonOffsetFactor: flat ? -3 : 0,
      polygonOffsetUnits: flat ? -3 : 0,
    });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;
    this.flat = flat;
  }

  private readonly flat: boolean;

  /**
   * One quad at (x, y, z): `size` metres across, growing by `grow` × over its
   * life; `kind` + thickness for flat marks (1 ring, 2 disc, 3 net, 4 area, 5 blast scorch); `hold` s at full alpha
   * before the fade.
   */
  spawn(x: number, y: number, z: number, size: number, life: number, color: THREE.Color, alpha: number, options: { vx?: number; vy?: number; vz?: number; grow?: number; rot?: number; spin?: number; fadeIn?: number; hold?: number; drag?: number; kind?: number; thickness?: number; seed?: number } = {}): number {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.capacity;
    if (this.life[i]! <= 0) this.live += 1;
    this.x[i] = x;
    this.y[i] = y;
    this.z[i] = z;
    this.vx[i] = options.vx ?? 0;
    this.vy[i] = options.vy ?? 0;
    this.vz[i] = options.vz ?? 0;
    this.size[i] = size;
    this.grow[i] = options.grow ?? 0;
    this.rot[i] = options.rot ?? 0;
    this.spin[i] = options.spin ?? 0;
    this.alpha[i] = alpha;
    this.life[i] = life;
    this.total[i] = life;
    this.fadeIn[i] = options.fadeIn ?? 0.06;
    this.hold[i] = Math.min(life * 0.9, Math.max(0, options.hold ?? 0));
    this.drag[i] = options.drag ?? 1.2;
    // Flat marks: integer kind + thickness / 2 in the fraction; puffs: a random seed.
    this.seed[i] = this.flat ? (options.kind ?? 1) + Math.min(0.49, (options.thickness ?? 0.25) / 2) : (options.seed ?? this.random());
    this.color[i * 3] = color.r;
    this.color[i * 3 + 1] = color.g;
    this.color[i * 3 + 2] = color.b;
    return i;
  }

  /** Moves quad `i` (marks that follow a foe). */
  moveTo(i: number, x: number, y: number, z: number): void {
    this.x[i] = x;
    this.y[i] = y;
    this.z[i] = z;
  }

  update(dt: number): void {
    let n = 0;
    let live = 0;
    for (let i = 0; i < this.capacity; i += 1) {
      if (this.life[i]! <= 0) continue;
      const left = this.life[i]! - dt;
      this.life[i] = left;
      if (left <= 0) continue;
      live += 1;
      const keep = Math.exp(-this.drag[i]! * dt);
      this.vx[i] = this.vx[i]! * keep;
      this.vy[i] = this.vy[i]! * keep;
      this.vz[i] = this.vz[i]! * keep;
      this.x[i] = this.x[i]! + this.vx[i]! * dt;
      this.y[i] = this.y[i]! + this.vy[i]! * dt;
      this.z[i] = this.z[i]! + this.vz[i]! * dt;
      this.rot[i] = this.rot[i]! + this.spin[i]! * dt;
      const k = 1 - left / this.total[i]!;
      const fadeIn = Math.min(1, (k * this.total[i]!) / Math.max(0.001, this.fadeIn[i]!));
      const hold = this.hold[i]!;
      const out = hold > 0 ? Math.max(0, (this.total[i]! - left - hold) / (this.total[i]! - hold)) : k;
      const fade = (1 - out) ** 1.2 * fadeIn;
      this.iPos[n * 3] = this.x[i]!;
      this.iPos[n * 3 + 1] = this.y[i]!;
      this.iPos[n * 3 + 2] = this.z[i]!;
      this.iData[n * 4] = this.size[i]! * (1 + this.grow[i]! * (1 - (1 - k) * (1 - k)));
      this.iData[n * 4 + 1] = this.rot[i]!;
      this.iData[n * 4 + 2] = this.flat ? 1 : 0;
      this.iData[n * 4 + 3] = this.seed[i]!;
      this.iColor[n * 4] = this.color[i * 3]!;
      this.iColor[n * 4 + 1] = this.color[i * 3 + 1]!;
      this.iColor[n * 4 + 2] = this.color[i * 3 + 2]!;
      this.iColor[n * 4 + 3] = this.alpha[i]! * fade;
      n += 1;
    }
    this.live = live;
    const geometry = this.mesh.geometry;
    geometry.instanceCount = n;
    geometry.getAttribute("iPos").needsUpdate = true;
    geometry.getAttribute("iData").needsUpdate = true;
    geometry.getAttribute("iColor").needsUpdate = true;
  }

  clear(): void {
    this.life.fill(0);
    this.live = 0;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

// ── Flares: HDR billboards with an exact envelope (VFX_STANDARD §3.4) ─────────

/**
 * Render order of the fire ribbons (bolts, Hỏa Long's wings): above the river surface (view/water.ts, 2), which
 * is transparent and writes no depth, so at an equal order it could be sorted after the fire and cover it.
 */
export const FX_RIBBON_ORDER = 4;

/**
 * 1 for the frames younger than `hold`, then falling a frame at a time to 0 at `life` (seconds of age, read
 * before it advances): hold 2/60, life 3/60 draws 1, 1, ½, 0.
 */
export function flareEnvelope(age: number, hold: number, life: number): number {
  if (age < hold - 1e-6) return 1;
  return Math.max(0, Math.min(1, (life - age) / (life - hold + 1 / 60)));
}

const FLARE_VERTEX = /* glsl */ `
attribute vec3 iPos;
attribute vec4 iColor;
attribute float iSize;
varying vec2 vUv;
varying vec4 vColor;
void main() {
  vUv = uv;
  vColor = iColor;
  vec4 view = modelViewMatrix * vec4(iPos, 1.0);
  view.xy += position.xy * iSize;
  gl_Position = projectionMatrix * view;
}`;

// A small hot centre (≤ 30 % of the radius) over a soft coloured body; the colour is HDR, so only the centre
// reaches the bloom threshold (05 §2.1: 1.6) and the rim keeps the fire's hue.
const FLARE_FRAGMENT = /* glsl */ `
varying vec2 vUv;
varying vec4 vColor;
void main() {
  float r = length((vUv - 0.5) * 2.0);
  if (r >= 1.0 || vColor.a <= 0.0) discard;
  float body = pow(1.0 - r, 2.0);
  float core = 1.0 - smoothstep(0.0, 0.3, r);
  // Additive with alpha 1: the frame gains colour × shape × alpha.
  gl_FragColor = vec4(vColor.rgb * (body * 0.7 + core * 0.8) * vColor.a, 1.0);
}`;

/**
 * Additive billboards in one draw call, two kinds: timed flares that are full bright on the frame they are born
 * (the envelope reads the age before it advances: a 3-frame flash shows 100 %, 100 %, then falls, never 44 %
 * as in Tuyến Cuối's Glows, VFX_STANDARD §1.2), and one-frame sprites the caller sets each frame (the charge at
 * the mouth, bolt heads).
 */
class FlarePool {
  readonly mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  private readonly iPos: Float32Array;
  private readonly iColor: Float32Array;
  private readonly iSize: Float32Array;
  /** Timed flares: x y z, size, grow, r g b, alpha, age, life, hold. */
  private readonly timed: Float32Array;
  private readonly timedCount: number;
  private cursor = 0;
  private drawn = 0;
  private now = 0;
  live = 0;

  constructor(readonly capacity: number) {
    this.timedCount = Math.floor(capacity / 2);
    this.timed = new Float32Array(this.timedCount * 12);
    this.iPos = new Float32Array(capacity * 3);
    this.iColor = new Float32Array(capacity * 4);
    this.iSize = new Float32Array(capacity);
    const base = new THREE.PlaneGeometry(1, 1);
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.index = base.index;
    geometry.setAttribute("position", base.getAttribute("position"));
    geometry.setAttribute("uv", base.getAttribute("uv"));
    geometry.setAttribute("iPos", new THREE.InstancedBufferAttribute(this.iPos, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute("iColor", new THREE.InstancedBufferAttribute(this.iColor, 4).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute("iSize", new THREE.InstancedBufferAttribute(this.iSize, 1).setUsage(THREE.DynamicDrawUsage));
    geometry.instanceCount = 0;
    const material = new THREE.ShaderMaterial({ vertexShader: FLARE_VERTEX, fragmentShader: FLARE_FRAGMENT, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    for (let i = 0; i < this.timedCount; i += 1) this.timed[i * 12 + 10] = 0;
  }

  /**
   * A flare at `at`, `size` metres across (growing by `grow` × over its life), `color` × `intensity` (HDR),
   * full bright for `hold` seconds from the frame it is born, then falling to nothing at `life`.
   */
  flare(at: THREE.Vector3, size: number, color: THREE.Color, intensity: number, life: number, hold: number, grow = 0, alpha = 1): void {
    const o = this.cursor * 12;
    this.cursor = (this.cursor + 1) % this.timedCount;
    this.timed.set([at.x, at.y, at.z, size, grow, color.r * intensity, color.g * intensity, color.b * intensity, alpha, 0, Math.max(0.001, life), Math.max(0, hold)], o);
  }

  /** A sprite for this frame only (call before update). */
  draw(at: THREE.Vector3, size: number, color: THREE.Color, intensity: number, alpha = 1): void {
    if (this.drawn >= this.capacity - this.timedCount) return;
    const n = this.timedCount + this.drawn;
    this.drawn += 1;
    this.write(n, at.x, at.y, at.z, size, color.r * intensity, color.g * intensity, color.b * intensity, alpha);
  }

  private write(slot: number, x: number, y: number, z: number, size: number, r: number, g: number, b: number, a: number): void {
    this.iPos[slot * 3] = x;
    this.iPos[slot * 3 + 1] = y;
    this.iPos[slot * 3 + 2] = z;
    this.iSize[slot] = size;
    this.iColor[slot * 4] = r;
    this.iColor[slot * 4 + 1] = g;
    this.iColor[slot * 4 + 2] = b;
    this.iColor[slot * 4 + 3] = a;
  }

  /** Draws the timed flares at their current age, then ages them by `dt`; the one-frame sprites are dropped after. */
  update(dt: number): void {
    this.now += dt;
    let live = 0;
    for (let i = 0; i < this.timedCount; i += 1) {
      const o = i * 12;
      const life = this.timed[o + 10]!;
      const age = this.timed[o + 9]!;
      if (life <= 0 || age >= life) {
        this.iColor[i * 4 + 3] = 0;
        this.iSize[i] = 0;
        continue;
      }
      live += 1;
      const hold = this.timed[o + 11]!;
      const k = flareEnvelope(age, hold, life) ** 1.6;
      // It grows only once its hold is over: frame 0 is the peak in size as in brightness (28/10 capture: grown
      // from frame 0, frame 1 drew 2–6 % brighter round the centre).
      const size = this.timed[o + 3]! * (1 + this.timed[o + 4]! * Math.max(0, (age - hold) / Math.max(1e-6, life - hold)));
      this.write(i, this.timed[o]!, this.timed[o + 1]!, this.timed[o + 2]!, size, this.timed[o + 5]!, this.timed[o + 6]!, this.timed[o + 7]!, this.timed[o + 8]! * k);
      this.timed[o + 9] = age + dt;
    }
    this.live = live + this.drawn;
    const geometry = this.mesh.geometry;
    geometry.instanceCount = this.timedCount + this.drawn;
    geometry.getAttribute("iPos").needsUpdate = true;
    geometry.getAttribute("iColor").needsUpdate = true;
    geometry.getAttribute("iSize").needsUpdate = true;
    this.drawn = 0;
  }

  clear(): void {
    for (let i = 0; i < this.timedCount; i += 1) this.timed[i * 12 + 10] = 0;
    this.drawn = 0;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

/**
 * A tapered fire ribbon behind a bolt (VFX_STANDARD §3.2 L1): LightTrail's strip through points the caller lays
 * along the flight (head first, so it bends with the arc however fast the bolt flies), drawn with the kit's flame
 * shader (FLAME_FRAGMENT: a noise-torn edge, tongues scrolling back, white-gold only in a few licks). Its width
 * is set each frame (the play camera scales the fire). Source: kit three/particles.ts LightTrail.
 */
class FlameStreak {
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  readonly points: THREE.Vector3[];
  private readonly position: Float32Array;
  private readonly alpha: Float32Array;
  private readonly tangent = new THREE.Vector3();
  private readonly toEye = new THREE.Vector3();
  private readonly side = new THREE.Vector3();

  constructor(readonly count: number, seed: number) {
    this.points = Array.from({ length: count }, () => new THREE.Vector3());
    this.position = new Float32Array(count * 6);
    this.alpha = new Float32Array(count * 2);
    const side = new Float32Array(count * 2);
    const along = new Float32Array(count * 2);
    const index: number[] = [];
    for (let i = 0; i < count; i += 1) {
      side[i * 2] = -1;
      side[i * 2 + 1] = 1;
      along[i * 2] = along[i * 2 + 1] = i / (count - 1);
      if (i < count - 1) index.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(this.position, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute("aAlpha", new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute("aSide", new THREE.BufferAttribute(side, 1));
    geometry.setAttribute("aAlong", new THREE.BufferAttribute(along, 1));
    geometry.setIndex(index);
    const material = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uSeed: { value: seed }, uIntensity: { value: 1 } },
      vertexShader: FLAME_VERTEX,
      fragmentShader: FLAME_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.frustumCulled = false;
    // After the river (view/water.ts, transparent at order 2): at the same order the sort could draw the water
    // over the fire wherever the bolt crossed it on screen (28/10 capture: the ribbon went out over the river).
    this.mesh.renderOrder = FX_RIBBON_ORDER;
    this.mesh.visible = false;
  }

  /** Draws the strip through `points` (head first): `width` just behind the head, tapering to a point. */
  update(eye: THREE.Vector3, width: number, intensity: number, time: number): void {
    this.mesh.visible = intensity > 0.001;
    if (!this.mesh.visible) return;
    const n = this.count;
    for (let i = 0; i < n; i += 1) {
      const point = this.points[i]!;
      this.tangent.subVectors(this.points[Math.max(0, i - 1)]!, this.points[Math.min(n - 1, i + 1)]!);
      if (this.tangent.lengthSq() < 1e-8) this.tangent.set(0, 0, 1);
      this.toEye.subVectors(eye, point);
      this.side.crossVectors(this.tangent, this.toEye);
      if (this.side.lengthSq() < 1e-10) this.side.set(1, 0, 0);
      const k = i / (n - 1);
      // Swells just behind the head, then a long taper (the flame shader tears the edge).
      this.side.normalize().multiplyScalar(width * Math.min(1, 0.45 + k * 5) * (1 - k) ** 0.75);
      const o = i * 6;
      this.position[o] = point.x - this.side.x;
      this.position[o + 1] = point.y - this.side.y;
      this.position[o + 2] = point.z - this.side.z;
      this.position[o + 3] = point.x + this.side.x;
      this.position[o + 4] = point.y + this.side.y;
      this.position[o + 5] = point.z + this.side.z;
      const alpha = (1 - k) ** 1.1;
      this.alpha[i * 2] = alpha;
      this.alpha[i * 2 + 1] = alpha;
    }
    const uniforms = this.mesh.material.uniforms;
    uniforms.uTime!.value = time;
    uniforms.uIntensity!.value = intensity;
    this.mesh.geometry.getAttribute("position").needsUpdate = true;
    this.mesh.geometry.getAttribute("aAlpha").needsUpdate = true;
  }

  hide(): void {
    this.mesh.visible = false;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

// ── Effects that live over several frames ──────────────────────────────────

/** What a bolt or an emitter follows: a drawn foe, or a fixed point. */
export interface FxTarget {
  slot: number;
  serial: number;
  /** Fallback point when the foe is no longer drawn (metres). */
  x: number;
  y: number;
  z: number;
}

interface Bolt {
  active: boolean;
  trail: FlameStreak;
  /** Seconds since it landed (−1: still flying): the ribbon's tail runs into the impact and fades (§3.4: 6–12 frames). */
  landed: number;
  from: THREE.Vector3;
  to: THREE.Vector3;
  target: FxTarget;
  t: number;
  duration: number;
  /** Straight length at launch (m): the trail spans a fixed 2.5 m of it. */
  length: number;
  arc: number;
  strong: boolean;
  /** Tier from the `hit` event (−1: not yet) and the wait after arrival. */
  hitTier: number;
  waited: number;
  dirX: number;
  dirZ: number;
}

interface Meteor {
  active: boolean;
  trail: LightTrail;
  from: THREE.Vector3;
  to: THREE.Vector3;
  t: number;
  duration: number;
  radius: number;
}

type EmitterKind = "breath" | "burn" | "heal" | "net" | "stun" | "inferno";

interface Emitter {
  active: boolean;
  kind: EmitterKind;
  /** Seconds left, and its whole length. */
  left: number;
  total: number;
  target: FxTarget | null;
  x: number;
  y: number;
  z: number;
  dx: number;
  dy: number;
  dz: number;
  radius: number;
  /** Net mark index in the marks pool (−1: none). */
  mark: number;
}

export interface FxCoreOptions {
  /** Ground height for marks and debris (default flat 0). */
  heightAt?: (x: number, z: number) => number;
  /** Drawn foe positions (view/actors). */
  locator?: FoeLocator;
  /** View-side randomness (default Math.random). */
  random?: () => number;
  /** Hỏa Long's mouth light (VFX_STANDARD §3.2 L14): built once here, so the light count never changes in a wave. Default per tier (FX_MOUTH_LIGHT). */
  mouthLight?: boolean;
  /** Reduced motion (VFX_STANDARD §3.8): flashes softer and smaller, fewer embers. */
  reduced?: boolean;
}

/**
 * Hỏa Long's mouth light per tier (VFX_STANDARD §3.7: Rồng Giữ Ải High has 1 light "once measured", Ultra 2):
 * one pre-built PointLight (no shader rebuild in a wave). High: see docs/changelog/2026-10-28-vfx-word-attack.md.
 */
export const FX_MOUTH_LIGHT: Readonly<Record<Quality, boolean>> = { low: false, medium: false, high: true, ultra: true };

/** The word attack's timing in 60 Hz frames (VFX_STANDARD §3.4, §5.3 part 1). */
const WORD_FX = {
  /** Mouth flash: full on frames 0–1, gone by frame 3. */
  flashHoldS: 2 / 60,
  flashS: 3 / 60,
  /** Its body: full on frames 0–1, out by frame 7. */
  flashBodyS: 7 / 60,
  /** Mouth light: full on frames 0–1, out by frame 5 (4–6 frames). */
  lightHoldS: 2 / 60,
  lightS: 5 / 60,
  /**
   * Light peak (candela, decay 2, reach 14 m) on a release and the share of it the charge holds while typing (kept
   * low so the release frame jumps against the frame before it: judge 1a, +0.12 luma at the flash over the charge).
   */
  lightPeak: 70,
  lightCharge: 0.06,
  /** An abandoned charge holds this long after the last letter, then fades (s). */
  chargeHoldS: 1.4,
  /** Scorch of a bolt's impact (I, F, §3.4 decal 2–3 s): its life and how long it stays at full alpha first (s). */
  scorchS: 2.6,
  scorchHoldS: 1.5,
} as const;

/** The effects themselves, without a World: the bench, the showcase and createFx drive it. */
export class FxCore {
  readonly group = new THREE.Group();
  readonly sparks: ParticlePool;
  readonly glows: ParticlePool;
  readonly debris: Debris;
  /** HDR flashes and one-frame sprites (mouth charge, release flash, bolt heads). */
  private readonly flares: FlarePool;
  /** Hỏa Long's mouth light, or null on tiers without it. */
  readonly light: THREE.PointLight | null;
  readonly reduced: boolean;
  private readonly puffs: QuadPool;
  private readonly rings: QuadPool;
  private readonly marks: QuadPool;
  /** Where Hỏa Long's mouth is this frame (setMouth) and the flat way it faces (from the dais out). */
  private readonly mouthAt = new THREE.Vector3(0, 4.2, -0.8);
  private readonly facing = new THREE.Vector3(0, 0, -1);
  /** The word being typed (0–1 of its letters, step by step), as drawn (eases to `chargeTarget`), and its letter pulse. */
  private chargeTarget = 0;
  private chargeLevel = 0;
  private chargePulse = 0;
  private chargeIdle = 0;
  /** The release light's age (s; Infinity: none) and strength. */
  private lightAge = Number.POSITIVE_INFINITY;
  private lightGain = 1;
  /** Releases drawn since the last frame (the presenter's key → release clock). */
  released = 0;
  /** Where the last release flash was born (captures: the first frame against the peak, VFX_STANDARD §5.6). */
  readonly releasePoint = new THREE.Vector3();
  /** Where the last word bolt's scorch lies (captures: how long it reads, F). */
  readonly scorchPoint = new THREE.Vector3();
  private time = 0;
  private readonly bolts: Bolt[] = [];
  private readonly meteors: Meteor[] = [];
  private readonly emitters: Emitter[] = [];
  private readonly random: () => number;
  private readonly heightAt: (x: number, z: number) => number;
  locator: FoeLocator | null;
  /**
   * World-size multiplier of the fire effects (bolts, impacts, Phun Lửa, Thiên Hỏa), set each frame from the camera
   * distance so a strike still reads at the play camera (bolt head ≳ 28 px, blast ≳ 60 px at 1080p); 1 up close.
   */
  k = 1;
  private readonly v = new THREE.Vector3();
  private readonly w = new THREE.Vector3();
  private readonly u = new THREE.Vector3();
  private readonly c = new THREE.Color();
  private readonly c2 = new THREE.Color();

  constructor(readonly quality: Quality, options: FxCoreOptions = {}) {
    this.random = options.random ?? Math.random;
    this.heightAt = options.heightAt ?? (() => 0);
    this.locator = options.locator ?? null;
    this.group.name = "fx";
    const budget = FX_BUDGET[quality];
    const tex = textures();
    this.sparks = new ParticlePool(Math.round(budget.particles * 0.6), tex.spark, false, this.random);
    this.glows = new ParticlePool(Math.round(budget.particles * 0.4), tex.soft, false, this.random);
    this.puffs = new QuadPool(quality === "low" ? 120 : 260, false, THREE.NormalBlending, 5, this.random);
    this.rings = new QuadPool(64, true, THREE.AdditiveBlending, 4, this.random);
    this.marks = new QuadPool(96, true, THREE.NormalBlending, 2, this.random);
    this.debris = new Debris(budget.debris, { profile: DRAGON, floorY: this.heightAt(0, 0) + 0.04, random: this.random });
    this.flares = new FlarePool(96);
    this.reduced = options.reduced ?? false;
    this.group.add(this.marks.mesh, this.rings.mesh, this.puffs.mesh, this.debris.mesh, this.glows.points, this.sparks.points, this.flares.mesh);
    this.light = (options.mouthLight ?? FX_MOUTH_LIGHT[quality]) ? new THREE.PointLight("#ff9a4a", 0, 14, 2) : null;
    if (this.light !== null) {
      this.light.name = "fx-mouth-light";
      this.light.castShadow = false;
      this.light.position.copy(this.mouthAt);
      this.group.add(this.light);
    }
    for (let k = 0; k < MAX_BOLTS; k += 1) {
      const trail = new FlameStreak(16, k * 1.7);
      this.group.add(trail.mesh);
      this.bolts.push({ active: false, trail, landed: -1, from: new THREE.Vector3(), to: new THREE.Vector3(), target: { slot: -1, serial: -1, x: 0, y: 0, z: 0 }, t: 0, duration: 1, length: 1, arc: 1, strong: false, hitTier: -1, waited: 0, dirX: 0, dirZ: 1 });
    }
    for (let k = 0; k < MAX_METEORS; k += 1) {
      const trail = new LightTrail(18, 40 + k);
      this.group.add(trail.mesh);
      this.meteors.push({ active: false, trail, from: new THREE.Vector3(), to: new THREE.Vector3(), t: 0, duration: 0.8, radius: 4 });
    }
    for (let k = 0; k < MAX_EMITTERS; k += 1) {
      this.emitters.push({ active: false, kind: "burn", left: 0, total: 0, target: null, x: 0, y: 0, z: 0, dx: 0, dy: 0, dz: 0, radius: 0, mark: -1 });
    }
  }

  /**
   * Compiles every effect's shader up front (trails start hidden, pools
   * empty), so the first meteor or bolt of a wave does not stall a frame.
   */
  warm(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): void {
    const hidden: THREE.Object3D[] = [];
    this.group.traverse((object) => {
      if (!object.visible) {
        hidden.push(object);
        object.visible = true;
      }
    });
    renderer.compile(scene, camera);
    for (const object of hidden) object.visible = false;
  }

  /** Live counts (bench, tests, captures). */
  stats(): { sparks: number; glows: number; puffs: number; bolts: number; emitters: number; debris: number; flares: number; marks: number; charge: number; light: number } {
    return {
      sparks: this.sparks.count,
      glows: this.glows.count,
      puffs: this.puffs.live,
      // In flight; a landed bolt's ribbon tail (8 frames) is not counted.
      bolts: this.bolts.filter((bolt) => bolt.active && bolt.landed < 0).length,
      emitters: this.emitters.filter((emitter) => emitter.active).length,
      debris: this.debris.live,
      flares: this.flares.live,
      marks: this.marks.live,
      charge: +this.chargeLevel.toFixed(3),
      light: +this.mouthLightLevel.toFixed(3),
    };
  }

  /** Where the bolts in flight are drawn now (captures only: the head size at the play camera, VFX_STANDARD §5.6). */
  boltHeads(): THREE.Vector3[] {
    return this.bolts.filter((bolt) => bolt.active && bolt.landed < 0 && bolt.t < 1).map((bolt) => this.bezier(bolt, bolt.arc, bolt.t, new THREE.Vector3()));
  }

  /** The mouth light as drawn this frame, 0–1 of its release peak (captures: first frame against peak). */
  get mouthLightLevel(): number {
    return this.light === null ? 0 : this.light.intensity / WORD_FX.lightPeak;
  }

  /** Hỏa Long's mouth this frame and the flat way it faces (view/heroes FX_MOUTH): the charge and the light follow it. */
  setMouth(at: THREE.Vector3): void {
    this.mouthAt.copy(at);
    const length = Math.hypot(at.x, at.z);
    if (length > 0.3) this.facing.set(at.x / length, 0, at.z / length);
  }

  /**
   * A (VFX_STANDARD §5.3 part 1): one more right letter of the word being typed. The glow at the mouth grows a
   * step to `frac` (0–1 of the word) and flares for a moment; 2–3 embers are pulled into the mouth from round
   * the head. `frac` lower than before (Backspace, another word) only sets the level.
   */
  charge(frac: number, letter = true): void {
    const next = Math.max(0, Math.min(1, frac));
    this.chargeIdle = 0;
    if (!letter || next <= this.chargeTarget) {
      this.chargeTarget = next;
      return;
    }
    this.chargeTarget = next;
    this.chargePulse = 1;
    const s = this.k;
    const n = this.reduced ? 1 : 2 + (this.random() < 0.5 ? 1 : 0);
    for (let i = 0; i < n; i += 1) {
      // From behind and beside the head, toward the camera's side less often (they read against the body).
      const angle = this.rand(-2.6, 2.6);
      const cs = Math.cos(angle);
      const sn = Math.sin(angle);
      const dx = -this.facing.x * cs - this.facing.z * sn;
      const dz = -this.facing.z * cs + this.facing.x * sn;
      const r = this.rand(1.3, 2) * s;
      const start = this.v.set(this.mouthAt.x + dx * r, this.mouthAt.y + this.rand(-0.4, 1.1) * s, this.mouthAt.z + dz * r);
      const life = this.rand(0.2, 0.28);
      const velocity = this.u.set((this.mouthAt.x - start.x) / life, (this.mouthAt.y - start.y) / life, (this.mouthAt.z - start.z) / life);
      this.sparks.spawn(start, velocity, i === 0 ? FX_COLORS.fireHot : FX_COLORS.ember, 0.34 * s, life, { drag: 0, gravity: 0 });
    }
  }

  /**
   * R (VFX_STANDARD §5.3 part 1) at the mouth, on the frame the word completes: a white-hot flash full bright on
   * frame 0 (2–3 frames), well over 1.5× the bolt head (§3.5 rule 6), over a dark-red fire body that gives it an edge
   * on the sunlit dais (rule 4); a short streak of flares thrown along the shot (2–3 frames); a burst of fire bodies
   * (normal blend) stepping out along it (4–8 frames); sparks; grey smoke behind from frame 3; the mouth light
   * (4–6 frames). The charge is spent: the gathered bead is gone on the frame the flash is born.
   */
  private release(from: THREE.Vector3, toX: number, toZ: number, strong: boolean): void {
    const s = this.k;
    const soft = this.reduced ? 0.6 : 1;
    const big = this.reduced ? 0.8 : 1;
    const dx = toX - from.x;
    const dz = toZ - from.z;
    const flat = Math.hypot(dx, dz) || 1;
    const ux = dx / flat;
    const uz = dz / flat;
    // Just in front of the snout, so the head does not hide the flash.
    const at = this.v.set(from.x + ux * 0.35 * s, from.y + 0.05, from.z + uz * 0.35 * s);
    const hot = strong ? FX_COLORS.teal : FX_COLORS.fireHot;
    this.releasePoint.copy(at);
    // The dark body first (puffs draw before the additive flares): deep red, full on frame 0, out by frame 7.
    this.puffs.spawn(at.x, at.y - 0.05, at.z, 2.1 * s * big, WORD_FX.flashBodyS, FX_COLORS.fireDark, 0.9, { fadeIn: 0.001, grow: 0.25, rot: this.random() * TAU });
    // The flash: a white-hot core (the flare's centre, ≤ 30 % of its radius) in an ember-orange body.
    this.flares.flare(at, 2.2 * s * big, hot, 3.4 * soft, WORD_FX.flashS, WORD_FX.flashHoldS, 0.25);
    this.flares.flare(at, 3.2 * s * big, FX_COLORS.ember, 1.1 * soft, WORD_FX.flashBodyS, WORD_FX.flashHoldS, 0.4);
    // The streak: flares stepping out along the shot, smaller and redder the further out (a muzzle cone, 2–3 frames).
    for (let k = 0; k < 3; k += 1) {
      const d = (0.95 + k * 0.7) * s;
      this.u.set(at.x + ux * d, at.y + 0.08 * k, at.z + uz * d);
      this.flares.flare(this.u, (1.55 - k * 0.32) * s * big, k === 0 ? hot : FX_COLORS.ember, (2.6 - k * 0.45) * soft, WORD_FX.flashS + k / 60, WORD_FX.flashHoldS, 0.2);
    }
    // The burst: fire bodies (normal blend) stepping out along the shot, full on frame 0, born near full size (grow
    // 0.25), so the release is at its biggest on frame 0; deep orange and red, they read on the beige dais.
    for (let k = 0; k < 3; k += 1) {
      const d = (0.55 + k * 0.6) * s;
      this.puffs.spawn(from.x + ux * d, from.y - k * 0.05, from.z + uz * d, (1.45 - k * 0.22) * s * big, 0.11 + k * 0.03, k === 0 ? FX_COLORS.ember : FX_COLORS.fireDeep, 0.95, { vx: ux * 4, vz: uz * 4, fadeIn: 0.001, grow: 0.25, rot: this.random() * TAU });
    }
    for (let k = 0; k < (this.reduced ? 5 : 10); k += 1) {
      const yaw = this.rand(-0.45, 0.45);
      const cs = Math.cos(yaw);
      const sn = Math.sin(yaw);
      const speed = this.rand(8, 13) * Math.sqrt(s);
      this.sparks.spawn(at, this.u.set((ux * cs - uz * sn) * speed, this.rand(-1, 2.5), (uz * cs + ux * sn) * speed), k % 2 === 0 ? FX_COLORS.fireHot : FX_COLORS.fire, 0.36 * s, this.rand(0.14, 0.24), { drag: 4, gravity: 4 });
    }
    // Dark behind the bright (§3.5 rule 4): grey smoke from the mouth, in from frame 3.
    for (let k = 0; k < 2; k += 1) {
      this.puffs.spawn(from.x + this.rand(-0.2, 0.2) * s, from.y + 0.2 * s, from.z + this.rand(-0.2, 0.2) * s, 0.75 * s, this.rand(0.55, 0.7), FX_COLORS.smoke, 0.42 * soft, { vy: 0.9, vx: -ux * 0.6, vz: -uz * 0.6, grow: 1.3, fadeIn: 0.06, spin: this.rand(-1, 1), rot: this.random() * TAU });
    }
    this.lightAge = 0;
    this.lightGain = (strong ? 1.25 : 1) * soft;
    this.chargeTarget = 0;
    this.chargeLevel = 0;
    this.chargePulse = 0;
    this.released += 1;
  }

  private rand(low: number, high: number): number {
    return low + this.random() * (high - low);
  }

  /** Where a target is now: the drawn foe's centre, else its fallback point. */
  private where(target: FxTarget, out: THREE.Vector3, at: "center" | "top" | "base" = "center"): THREE.Vector3 {
    if (target.serial >= 0 && this.locator !== null && this.locator.locate(target.slot, target.serial, at, out)) {
      target.x = out.x;
      target.y = out.y;
      target.z = out.z;
      return out;
    }
    return out.set(target.x, target.y, target.z);
  }

  private spark(at: THREE.Vector3, color: THREE.Color, size: number, life: number, speed: number, up = 0.4, gravity = 6, biasX = 0, biasZ = 0): void {
    const dir = this.u.set(this.rand(-1, 1) + biasX, this.rand(-0.2, 1) + up, this.rand(-1, 1) + biasZ).normalize().multiplyScalar(speed * this.rand(0.5, 1));
    this.sparks.spawn(at, dir, color, size, life * this.rand(0.7, 1.2), { drag: 2.2, gravity });
  }

  private glow(at: THREE.Vector3, color: THREE.Color, size: number, life: number, velocity = this.u.set(0, 0, 0), grow = 0.6): void {
    this.glows.spawn(at, velocity, color, size, life, { drag: 1.5, grow });
  }

  // ── Bolts (05 §6.1 đòn gõ) ────────────────────────────────────────────

  /** A fire bolt from `from` to the target; `strong` (Chớp, Hoàn hảo) has a teal head. Returns its index or −1. */
  launchBolt(from: THREE.Vector3, target: FxTarget, strong: boolean): number {
    const index = this.bolts.findIndex((bolt) => !bolt.active);
    if (index < 0) return -1;
    const bolt = this.bolts[index]!;
    bolt.active = true;
    bolt.from.copy(from);
    copyTarget(bolt.target, target);
    this.where(bolt.target, bolt.to);
    const length = bolt.from.distanceTo(bolt.to);
    bolt.length = Math.max(1, length);
    bolt.duration = Math.min(BOLT_MAX_S, Math.max(0.12, length / BOLT_SPEED));
    bolt.arc = Math.min(2.2, length * 0.12);
    bolt.t = 0;
    bolt.strong = strong;
    bolt.hitTier = -1;
    bolt.waited = 0;
    bolt.landed = -1;
    bolt.dirX = bolt.to.x - from.x;
    bolt.dirZ = bolt.to.z - from.z;
    for (const point of bolt.trail.points) point.copy(from);
    // R at the mouth (05 §6 "phát", VFX_STANDARD §5.3 part 1).
    this.release(from, bolt.to.x, bolt.to.z, strong);
    return index;
  }

  /** The strike landed (sim `hit`): the bolt on that foe lands now, or the impact plays at once when none flies. */
  landBolt(serial: number, tier: number, fallback: THREE.Vector3, dirX = 0, dirZ = 1): void {
    let found = false;
    for (const bolt of this.bolts) {
      if (!bolt.active || bolt.target.serial !== serial || bolt.hitTier >= 0) continue;
      bolt.hitTier = tier;
      // Catch up: what is left of the flight takes at most BOLT_CATCH_UP.
      if ((1 - bolt.t) * bolt.duration > BOLT_CATCH_UP) bolt.duration = BOLT_CATCH_UP / Math.max(0.001, 1 - bolt.t);
      found = true;
      break;
    }
    if (!found) this.impact(fallback, tier, dirX, dirZ, false);
  }

  private bezier(bolt: { from: THREE.Vector3; to: THREE.Vector3 }, arc: number, t: number, out: THREE.Vector3): THREE.Vector3 {
    const k = Math.max(0, Math.min(1, t));
    out.lerpVectors(bolt.from, bolt.to, k);
    out.y += Math.sin(k * Math.PI) * arc;
    return out;
  }

  // ── Impacts and deaths ───────────────────────────────────────────────

  /**
   * A blow lands at `at`: flash, sparks and rays by tier, a ring from T3 (05 §5, §6 "trúng"). `word`: Hỏa Long's
   * word bolt, whose flash takes the fire ramp (an ember body round a small hot core, teal on a strong word).
   */
  impact(at: THREE.Vector3, tierId: number, dirX = 0, dirZ = 1, strong = false, word = false): void {
    const row = tierRow(tierId, DRAGON.tiers);
    // Sparks lean along the blow (away from the dais).
    const length = Math.hypot(dirX, dirZ) || 1;
    const bx = (dirX / length) * 0.8;
    const bz = (dirZ / length) * 0.8;
    const s = this.k;
    // The flash is full bright on the frame the blow lands (a flare, not an aged glow: VFX_STANDARD §3.1 rule 5).
    if (word) {
      const soft = this.reduced ? 0.6 : 1;
      const big = this.reduced ? 0.8 : 1;
      this.flares.flare(at, (2 + tierId * 0.5) * s * big, FX_COLORS.ember, 1.9 * soft, 7 / 60, 2 / 60, 0.4);
      this.flares.flare(at, (0.9 + tierId * 0.25) * s * big, strong ? FX_COLORS.teal : FX_COLORS.fireHot, 2.8 * soft, 3 / 60, 2 / 60, 0.2);
    } else {
      this.flares.flare(at, (1.4 + tierId * 0.5) * s * (this.reduced ? 0.8 : 1), strong ? FX_COLORS.teal : FX_COLORS.fireHot, 2.2 * (this.reduced ? 0.6 : 1), 0.1, 2 / 60, 0.4);
    }
    this.glow(at, FX_COLORS.fire, (1.6 + tierId * 0.5) * s, 0.42, this.u.set(0, 0.6, 0), 0.9);
    for (let k = 0; k < row.sparks; k += 1) this.spark(at, k % 3 === 0 ? FX_COLORS.fireHot : FX_COLORS.ember, 0.28 * s, 0.45, (5 + tierId * 1.5) * Math.sqrt(s), 0.4, 6, bx, bz);
    // A star of rays: fast, short sparks in a flat fan.
    for (let k = 0; k < row.rays; k += 1) {
      const angle = (k / row.rays) * TAU + this.random() * 0.2;
      this.sparks.spawn(at, this.u.set(Math.cos(angle) * 14, this.rand(-1, 3), Math.sin(angle) * 14), strong ? FX_COLORS.teal : FX_COLORS.fireHot, 0.32, 0.16, { drag: 7 });
    }
    // The ground ring grows by √k only: a storm of rings must not paint the whole field.
    const rs = Math.sqrt(s);
    if (row.ring) this.rings.spawn(at.x, this.heightAt(at.x, at.z) + 0.12, at.z, 1.2 * rs, 0.35, strong ? FX_COLORS.teal : FX_COLORS.fire, 0.9, { grow: (2.2 + tierId * 0.4) * rs, kind: 1, thickness: 0.18, drag: 0 });
    if (tierId >= 4) this.rings.spawn(at.x, this.heightAt(at.x, at.z) + 0.13, at.z, 1.6, 0.5, FX_COLORS.fireHot, 0.7, { grow: 4, kind: 1, thickness: 0.1, drag: 0 });
    // F: a small grey smoke, in from frame 4 (§3.4).
    this.puffs.spawn(at.x, at.y, at.z, 0.9, 0.7, FX_COLORS.smoke, 0.35, { vy: 1.2, grow: 1.4, spin: this.rand(-1, 1), fadeIn: 0.07 });
  }

  /**
   * A bolt landed (I, F of the word attack): the impact by tier in the fire ramp, a burst of fire bodies on the side
   * the shot came from (f0, normal blend, so it reads on sunlit grass), soot puffs in from frames 2–4, and a blast
   * scorch that holds its full dark for 1.5 s, then fades out by 2.6 s (§3.4 decal 2–3 s).
   */
  private boltLanded(at: THREE.Vector3, tierId: number, dirX: number, dirZ: number, strong: boolean): void {
    this.impact(at, tierId, dirX, dirZ, strong, true);
    const s = this.k;
    const rk = Math.sqrt(s);
    const big = this.reduced ? 0.8 : 1;
    const length = Math.hypot(dirX, dirZ) || 1;
    const ux = dirX / length;
    const uz = dirZ / length;
    // In front of the body (toward the shot's source), so the struck foe does not hide its own burst.
    const fx = at.x - ux * 0.45 * rk;
    const fz = at.z - uz * 0.45 * rk;
    for (let k = 0; k < 3; k += 1) {
      const angle = this.rand(-1.2, 1.2);
      const cs = Math.cos(angle);
      const sn = Math.sin(angle);
      const vx = (ux * cs - uz * sn) * 2.2;
      const vz = (uz * cs + ux * sn) * 2.2;
      this.puffs.spawn(fx + this.rand(-0.2, 0.2) * s, at.y + this.rand(-0.1, 0.35) * s, fz + this.rand(-0.2, 0.2) * s, (1.2 - k * 0.15 + tierId * 0.12) * s * big, 0.13 + k * 0.03, k === 0 ? FX_COLORS.ember : FX_COLORS.fireDeep, 0.95, { vx, vy: 1.4, vz, fadeIn: 0.001, grow: 0.35, rot: this.random() * TAU });
    }
    // Soot: dark puffs behind the bright, rising, in over frames 2–4.
    for (let k = 0; k < 3; k += 1) {
      this.puffs.spawn(at.x + this.rand(-0.35, 0.35) * s, at.y + (0.25 + k * 0.15) * s, at.z + this.rand(-0.35, 0.35) * s, (0.85 + k * 0.12) * s * big, this.rand(0.7, 0.95), FX_COLORS.soot, 0.55 * (this.reduced ? 0.7 : 1), { vy: 1.1, vx: ux * 0.5, vz: uz * 0.5, grow: 1.3, fadeIn: (2 + k) / 60, spin: this.rand(-1, 1), rot: this.random() * TAU });
    }
    // The disc mark is dark only in its middle third, and a killed foe falls right on the spot it was struck (28/10
    // capture: a scorch under the target was never seen). So the scorch lies where the fire met the ground, just in
    // front of the foe on the shot's line, and the body falls back off it; a blast mark (kind 5), solid in its middle.
    const size = (1.55 + tierId * 0.3) * rk;
    const x = at.x - ux * 0.75 * rk;
    const z = at.z - uz * 0.75 * rk;
    this.scorchPoint.set(x, this.markY(x, z, size) + 0.06, z);
    this.marks.spawn(x, this.scorchPoint.y, z, size, WORD_FX.scorchS, FX_COLORS.scorch, 0.92, { kind: 5, fadeIn: 0.06, hold: WORD_FX.scorchHoldS, drag: 0, rot: this.random() * TAU });
  }

  /**
   * Height for a flat mark `size` metres across at (x, z): the highest ground under its middle, so on a bank or a
   * slope the flat disc is not cut by the higher side (foes are often struck at the fords).
   */
  private markY(x: number, z: number, size: number): number {
    const r = Math.max(0.6, size * 0.3);
    return Math.max(this.heightAt(x, z), this.heightAt(x + r, z), this.heightAt(x - r, z), this.heightAt(x, z + r), this.heightAt(x, z - r));
  }

  /** A foe dies: shards of its material along the blow, a puff, a small light flying back to the forest (05 §6.3). */
  death(at: THREE.Vector3, material: Material, tierId: number, dirX: number, dirZ: number): void {
    const row = tierRow(tierId, DRAGON.tiers);
    const [a, b] = MATERIAL_COLORS[material];
    this.c.set(a);
    this.c2.set(b);
    this.debris.burst(at.x, at.y + 0.2, at.z, dirX, dirZ, Math.max(3, row.debris), 3 + tierId, this.c, this.c2);
    for (let k = 0; k < 6 + tierId * 2; k += 1) this.spark(at, k % 2 === 0 ? this.c : this.c2, 0.3, 0.6, 3.5, 0.6, 5);
    this.puffs.spawn(at.x, at.y + 0.3, at.z, 1.2, 0.9, material === "mist" ? FX_COLORS.mote : FX_COLORS.dust, 0.4, { vy: 0.8, grow: 1.2 });
    // The mote: drifts up and away from the dais.
    const length = Math.hypot(at.x, at.z) || 1;
    this.glow(this.v.set(at.x, at.y + 1, at.z), FX_COLORS.mote, 0.5, 1.6, this.u.set((at.x / length) * 2.5, 2.2, (at.z / length) * 2.5), 0.2);
  }

  // ── Skills (05 §6.1) ────────────────────────────────────────────────

  /** Phun Lửa: a 60° cone of fire `lengthM` long from `from` toward (toX, toZ) for 0.7 s, then scorch. */
  breath(from: THREE.Vector3, toX: number, toZ: number, lengthM = HERO_SKILLS.breath.lengthMm / 1000): void {
    const dx = toX - from.x;
    const dz = toZ - from.z;
    const flat = Math.hypot(dx, dz) || 1;
    const groundY = this.heightAt(from.x + (dx / flat) * lengthM * 0.6, from.z + (dz / flat) * lengthM * 0.6);
    const dir = this.v.set(dx / flat, (groundY + 0.4 - from.y) / (lengthM * 0.75), dz / flat).normalize();
    this.emit("breath", null, from.x, from.y, from.z, 0.7, lengthM, dir.x, dir.y, dir.z);
    // Scorch along the cone (05 §6.1 "đất cháy decal").
    for (let k = 1; k <= 4; k += 1) {
      const s = (k / 4.2) * lengthM;
      const x = from.x + (dx / flat) * s;
      const z = from.z + (dz / flat) * s;
      this.marks.spawn(x, this.heightAt(x, z) + 0.06, z, 1.2 + s * 0.45, 6, FX_COLORS.scorch, 0.55, { kind: 2, fadeIn: 0.5, drag: 0, rot: this.random() * TAU });
    }
  }

  /** Thiên Hỏa: a burning mass falls on (x, z) over `delayS`, a ring of `radiusM`, stun stars. */
  meteor(x: number, z: number, delayS = HERO_SKILLS.skyfire.delayMs / 1000, radiusM = HERO_SKILLS.skyfire.radiusMm / 1000): void {
    const meteor = this.meteors.find((item) => !item.active);
    if (meteor === undefined) return;
    const ground = this.heightAt(x, z);
    meteor.active = true;
    meteor.to.set(x, ground + 0.3, z);
    // From high on the camera's side, so the fall reads in the default view.
    meteor.from.set(x + 4, ground + 16, z + 5);
    meteor.t = 0;
    meteor.duration = Math.max(0.25, delayS);
    meteor.radius = radiusM;
    for (const point of meteor.trail.points) point.copy(meteor.from);
  }

  /** Lands any meteor on (x, z) now (the sim's impact came first). */
  landMeteor(x: number, z: number): void {
    for (const meteor of this.meteors) {
      if (!meteor.active || Math.hypot(meteor.to.x - x, meteor.to.z - z) > 1.5) continue;
      meteor.t = Math.max(meteor.t, meteor.duration - 0.03);
    }
  }

  /**
   * Thiên Hỏa lands (05 §6.1: a 4 m ring, stun stars). Round 2 readability: the
   * light additive glows washed out on the sunlit path and the pale target disc,
   * so the blast now has body in normal-blended colour (a deep-orange fireball,
   * dark smoke, a dust wave), a ring that really reaches the radius, a darker
   * scorch and flying stones. View only.
   */
  private meteorImpact(meteor: Meteor): void {
    const at = meteor.to;
    const r = meteor.radius;
    const s = Math.sqrt(this.k);
    const ground = this.heightAt(at.x, at.z);
    this.glow(at, FX_COLORS.white, 5 * this.k, 0.16);
    this.glow(at, FX_COLORS.fireHot, r * 1.6 * s, 0.5, this.u.set(0, 1, 0), 0.8);
    // The fireball: saturated puffs that rise and swell, then dark smoke rolls up from them.
    for (let k = 0; k < 10; k += 1) {
      const angle = (k / 10) * TAU + this.random() * 0.5;
      const d = r * this.rand(0.05, 0.4);
      const color = k < 4 ? FX_COLORS.blastHot : k % 2 === 0 ? FX_COLORS.fireDeep : FX_COLORS.ember;
      this.puffs.spawn(at.x + Math.cos(angle) * d, ground + this.rand(0.4, 1.4), at.z + Math.sin(angle) * d, r * this.rand(0.45, 0.65) * s, this.rand(0.45, 0.7), color, 0.95, { vx: Math.cos(angle) * 1.5, vz: Math.sin(angle) * 1.5, vy: this.rand(2, 4), grow: 1.1, spin: this.rand(-1, 1), fadeIn: 0.02 });
    }
    for (let k = 0; k < 7; k += 1) {
      this.puffs.spawn(at.x + this.rand(-r, r) * 0.45, ground + this.rand(1, 2), at.z + this.rand(-r, r) * 0.45, r * 0.55 * s, this.rand(1.4, 1.9), FX_COLORS.smoke, 0.6, { vy: this.rand(1.2, 2), grow: 1.7, spin: this.rand(-0.6, 0.6), fadeIn: 0.35 });
    }
    // Flames licking up round the edge.
    for (let k = 0; k < 14; k += 1) {
      const angle = (k / 14) * TAU;
      this.glow(this.v.set(at.x + Math.cos(angle) * r * 0.5, at.y + 0.4, at.z + Math.sin(angle) * r * 0.5), FX_COLORS.fire, 1.8 * s, 0.7, this.u.set(Math.cos(angle) * 3, 1.5, Math.sin(angle) * 3), 1.2);
      if (k % 2 === 0) this.puffs.spawn(at.x + Math.cos(angle) * r * 0.7, ground + 0.5, at.z + Math.sin(angle) * r * 0.7, 1.1 * s, this.rand(0.5, 0.8), FX_COLORS.fireDeep, 0.85, { vy: this.rand(2, 3.2), grow: 0.6, fadeIn: 0.05 });
    }
    for (let k = 0; k < 70; k += 1) this.spark(at, k % 3 === 0 ? FX_COLORS.fireHot : FX_COLORS.ember, 0.45 * this.k, 0.9, 11, 0.8, 9);
    // The ring runs out to the blast radius (size is a diameter); a dust wave rolls with it.
    this.rings.spawn(at.x, ground + 0.14, at.z, r * 0.5, 0.45, FX_COLORS.fireHot, 1, { grow: 3.4, kind: 1, thickness: 0.2, drag: 0 });
    this.rings.spawn(at.x, ground + 0.15, at.z, r * 0.4, 0.6, FX_COLORS.fire, 0.8, { grow: 4.2, kind: 1, thickness: 0.32, drag: 0 });
    for (let k = 0; k < 16; k += 1) {
      const angle = (k / 16) * TAU + this.random() * 0.2;
      this.puffs.spawn(at.x + Math.cos(angle) * r * 0.35, ground + 0.35, at.z + Math.sin(angle) * r * 0.35, 1.3 * s, 0.9, FX_COLORS.dust, 0.55, { vx: Math.cos(angle) * 7.5, vz: Math.sin(angle) * 7.5, vy: 0.5, grow: 1.3, drag: 2.6 });
    }
    this.marks.spawn(at.x, ground + 0.07, at.z, r * 2, 7, FX_COLORS.scorch, 0.72, { kind: 2, fadeIn: 0.12, drag: 0, rot: this.random() * TAU });
    this.c.set(MATERIAL_COLORS.stone[0]);
    this.c2.set(MATERIAL_COLORS.mud[1]);
    this.debris.burst(at.x, ground + 0.4, at.z, 0, 1, 10, 7, this.c, this.c2);
    this.emit("stun", null, at.x, at.y + 1.6, at.z, HERO_SKILLS.skyfire.stunMs / 1000, r * 0.6, 0, 0, 0);
  }

  /** Long Hống: a shock ring out to `radiusM` from the dais, dust at its edge (T4). */
  roar(x: number, z: number, radiusM = HERO_SKILLS.roar.radiusMm / 1000): void {
    const y = this.heightAt(x, z) + 0.15;
    this.rings.spawn(x, y, z, 2, 0.55, FX_COLORS.fireHot, 1, { grow: radiusM - 1, kind: 1, thickness: 0.12, drag: 0 });
    this.rings.spawn(x, y + 0.01, z, 1.6, 0.75, FX_COLORS.fire, 0.7, { grow: radiusM * 0.9, kind: 1, thickness: 0.3, drag: 0 });
    for (let k = 0; k < 24; k += 1) {
      const angle = (k / 24) * TAU;
      const r = radiusM * 0.45;
      this.puffs.spawn(x + Math.cos(angle) * r, y + 0.4, z + Math.sin(angle) * r, 1.4, 1.1, FX_COLORS.dust, 0.45, { vx: Math.cos(angle) * 9, vz: Math.sin(angle) * 9, vy: 0.6, grow: 1.4, drag: 2.4 });
    }
  }

  /** Viêm Đế (inferno) cast: a crown of fire round the Dragon for its length (placeholder until the v3 model swap). */
  inferno(from: THREE.Vector3, seconds = HERO_SKILLS.inferno.durationMs / 1000): void {
    this.glow(from, FX_COLORS.white, 5, 0.15);
    this.emit("inferno", null, from.x, from.y, from.z, seconds, 2.2, 0, 0, 0);
  }

  // ── Statuses ─────────────────────────────────────────────────────────

  /** Burn on a foe: small flames on its back while it lasts (05 §6.1 Lửa Chữ). */
  burn(target: FxTarget, seconds: number): void {
    const existing = this.emitters.find((emitter) => emitter.active && emitter.kind === "burn" && emitter.target?.serial === target.serial);
    if (existing !== undefined) {
      existing.left = Math.max(existing.left, seconds);
      return;
    }
    this.emit("burn", target, target.x, target.y, target.z, seconds, 0.4, 0, 0, 0);
  }

  /** Ends a status emitter on a foe (status off, death). */
  stop(serial: number, kind?: EmitterKind): void {
    for (const emitter of this.emitters) {
      if (emitter.active && emitter.target?.serial === serial && (kind === undefined || emitter.kind === kind)) emitter.left = Math.min(emitter.left, 0.15);
    }
  }

  // ── Traps, houses, items (05 §6.5–6.6) ────────────────────────────────

  /** Gai Chông: stakes jab up, splinters and dust along the strip. */
  spikes(x: number, z: number, count = 1, lengthM = 3.6): void {
    const y = this.heightAt(x, z);
    for (let k = 0; k < 10 + count * 2; k += 1) {
      const at = this.v.set(x + this.rand(-0.8, 0.8), y + 0.2, z + this.rand(-lengthM / 2, lengthM / 2));
      this.sparks.spawn(at, this.u.set(this.rand(-1, 1), this.rand(5, 9), this.rand(-1, 1)), FX_COLORS.wood, 0.35, 0.45, { drag: 1.5, gravity: 18 });
    }
    for (let k = 0; k < 4; k += 1) this.puffs.spawn(x + this.rand(-0.8, 0.8), y + 0.3, z + this.rand(-1.5, 1.5), 1.1, 0.8, FX_COLORS.dust, 0.4, { vy: 0.7, grow: 1.1 });
  }

  /** Bom Hạt Thông: flash, a column of fire and resin, a ring of the blast radius, smoke and shells (T3–T4). */
  bomb(x: number, z: number, radiusM: number, count = 1): void {
    const y = this.heightAt(x, z);
    const at = this.v.set(x, y + 0.6, z);
    this.glow(at, FX_COLORS.white, 3, 0.1);
    this.glow(at, FX_COLORS.fireHot, radiusM * 1.5, 0.4, this.u.set(0, 2, 0), 0.8);
    for (let k = 0; k < 40 + count * 4; k += 1) this.spark(at, k % 2 === 0 ? FX_COLORS.fireHot : FX_COLORS.fireDeep, 0.42, 0.8, 10, 1.2, 10);
    for (let k = 0; k < 8; k += 1) this.glow(this.w.set(x + this.rand(-0.6, 0.6), y + 0.5, z + this.rand(-0.6, 0.6)), FX_COLORS.fire, 1.6, 0.6, this.u.set(this.rand(-1, 1), this.rand(5, 9), this.rand(-1, 1)), 1.1);
    this.rings.spawn(x, y + 0.14, z, radiusM * 0.4, 0.45, FX_COLORS.fireHot, 1, { grow: 1.5, kind: 1, thickness: 0.14, drag: 0 });
    this.marks.spawn(x, y + 0.07, z, radiusM * 1.6, 7, FX_COLORS.scorch, 0.6, { kind: 2, fadeIn: 0.3, drag: 0, rot: this.random() * TAU });
    for (let k = 0; k < 5; k += 1) this.puffs.spawn(x + this.rand(-1, 1), y + 1, z + this.rand(-1, 1), 1.8, 1.8, FX_COLORS.smoke, 0.5, { vy: 1.8, grow: 1.5, spin: this.rand(-0.5, 0.5) });
    this.c.set(MATERIAL_COLORS.rotwood[0]);
    this.c2.set(MATERIAL_COLORS.rotwood[1]);
    this.debris.burst(x, y + 0.4, z, 0, 1, 6, 6, this.c, this.c2);
  }

  /** Lưới Phóng: a net flies up from the post and drops over (x, z), cords pulling in (03 §7: grounds low flyers). */
  net(x: number, z: number, radiusM = 1.6, fromX = x, fromZ = z, target: FxTarget | null = null): void {
    const y = this.heightAt(x, z);
    for (let k = 0; k < 14; k += 1) {
      const at = this.v.set(fromX, y + 1.8, fromZ);
      this.sparks.spawn(at, this.u.set((x - fromX) * 2.5 + this.rand(-1.5, 1.5), this.rand(3, 6), (z - fromZ) * 2.5 + this.rand(-1.5, 1.5)), FX_COLORS.vine, 0.3, 0.5, { drag: 1.8, gravity: 9 });
    }
    const mark = this.marks.spawn(x, y + 0.08, z, radiusM * 2.4, 2.5, FX_COLORS.vine, 0.95, { kind: 3, fadeIn: 0.15, grow: -0.35, drag: 0, rot: this.random() * TAU });
    const emitter = this.emit("net", target, x, y, z, 2.5, radiusM, 0, 0, 0);
    if (emitter !== null) emitter.mark = mark;
  }

  /** Heal: a pale ring and motes rising over (x, z) (Lều Thuốc Nam pulse, Bình Máu Nhỏ). */
  heal(x: number, z: number, radiusM: number, seconds = 1.2): void {
    const y = this.heightAt(x, z);
    this.rings.spawn(x, y + 0.12, z, radiusM * 2, 1.1, FX_COLORS.heal, 0.5, { kind: 4, thickness: 0.1, fadeIn: 0.15, drag: 0 });
    this.rings.spawn(x, y + 0.13, z, radiusM * 0.6, 0.7, FX_COLORS.heal, 0.7, { grow: 2.3, kind: 1, thickness: 0.16, drag: 0 });
    this.emit("heal", null, x, y, z, seconds, radiusM, 0, 0, 0);
  }

  /** Héo lan: a grey-violet wisp drifts from a foe standing near toward the dais (BALANCE.md §5; Hắc Vụ's colour, D02). */
  blightWisp(fromX: number, fromZ: number): void {
    const y = this.heightAt(fromX, fromZ) + 1.2;
    const life = 1.1;
    const s = this.k;
    this.c.set("#8a7fa8");
    this.glows.spawn(this.v.set(fromX, y, fromZ), this.u.set(-fromX / life * 0.55, 1.2, -fromZ / life * 0.55), this.c, 0.9 * s, life, { drag: 0.2, gravity: -0.6, grow: 0.8, alpha: 0.45 });
  }

  /** One heal beat (Lều Thuốc Nam): a light drop floats from the house to the ally, a small ring where it lands (05 §6.6). */
  healDrop(fromX: number, fromZ: number, toX: number, toZ: number, toY = 1): void {
    const y0 = this.heightAt(fromX, fromZ) + 2.2;
    const y1 = this.heightAt(toX, toZ) + toY;
    const life = 0.8;
    const s = this.k;
    this.glows.spawn(this.v.set(fromX, y0, fromZ), this.u.set((toX - fromX) / life, (y1 - y0) / life + 1.2, (toZ - fromZ) / life), FX_COLORS.heal, 0.7 * s, life, { drag: 0, gravity: 2.4, grow: -0.2 });
    this.rings.spawn(toX, this.heightAt(toX, toZ) + 0.12, toZ, 0.6 * s, 0.6, FX_COLORS.heal, 0.6, { grow: 1.2 * s, kind: 1, thickness: 0.18, drag: 0 });
  }

  /** Gold: coins glint up from a kill and fade (gold is money, so only here, 05 §2.2). */
  gold(at: THREE.Vector3, amount: number): void {
    const n = Math.min(10, 3 + Math.round(amount / 3));
    for (let k = 0; k < n; k += 1) this.sparks.spawn(this.v.copy(at).setY(at.y + 0.6), this.u.set(this.rand(-1.2, 1.2), this.rand(4, 6.5), this.rand(-1.2, 1.2)), FX_COLORS.gold, 0.36, 0.75, { drag: 1.2, gravity: 9 });
    this.glow(this.v.copy(at).setY(at.y + 1.2), FX_COLORS.gold, 0.9, 0.35, this.u.set(0, 1.5, 0), 0.4);
  }

  /**
   * T0: a right key (05 §4.3 "một đốm lửa chạy từ mõm Hỏa Long tới quái", §5 T0): a few motes at the mouth, a
   * fire mote that runs to the target, and a glow at the mouth that grows with the share of the word typed
   * (`frac` 0–1). Test passes 26–27/10: three 0.22 m sparks at the mouth were not seen at the play camera.
   */
  keySpark(from: THREE.Vector3, to: THREE.Vector3 | null = null, frac = 0, charge = true): void {
    const s = this.k;
    // A (28/10, VFX_STANDARD §5.3 part 1): the glow held at the mouth grows a step and embers are pulled in (charge());
    // it replaces the three sparks and the 0.24 s glow that went out from the mouth.
    if (charge) this.charge(frac);
    if (to === null) return;
    const life = 0.16;
    const velocity = this.u.set((to.x - from.x) / life, (to.y - from.y) / life, (to.z - from.z) / life);
    // A body (normal blend, reads on light ground) under the light.
    this.puffs.spawn(from.x, from.y, from.z, 0.5 * s, life, FX_COLORS.fireDeep, 0.95, { vx: velocity.x, vy: velocity.y, vz: velocity.z, drag: 0, fadeIn: 0.001 });
    this.glows.spawn(from, velocity, FX_COLORS.fireHot, 1.05 * s, life, { drag: 0, grow: -0.2 });
    this.sparks.spawn(from, velocity, FX_COLORS.fire, 0.5 * s, life, { drag: 0 });
  }

  /**
   * Viêm Đế's beam (01 §2.4, 05 §6.1: "mỗi từ một tia xuyên 2 × 22 m dọc
   * đường"): fire runs from the dais end of the lane outward along `points`
   * (metres, nearest the dais first), a white-hot core, flames licking up, a
   * burnt strip left behind. Test pass 27/10: foes lost HP with nothing drawn.
   */
  beam(points: readonly THREE.Vector3[], widthM = HERO_SKILLS.inferno.beamWidthMm / 1000): void {
    const s = Math.sqrt(this.k);
    points.forEach((at, index) => {
      const delay = index / Math.max(1, points.length);
      this.glow(at, FX_COLORS.white, 1.6 * s, 0.12 + delay * 0.12);
      this.puffs.spawn(at.x, at.y + 0.2, at.z, widthM * 0.95 * s, BEAM_S + delay * 0.15, index % 2 === 0 ? FX_COLORS.fireDeep : FX_COLORS.blastHot, 0.9, { vy: this.rand(1.5, 3), grow: 0.8, spin: this.rand(-2, 2), fadeIn: 0.01 + delay * 0.12, rot: this.random() * TAU });
      this.glow(at, FX_COLORS.fire, widthM * 1.4 * s, BEAM_S, this.u.set(0, this.rand(1, 2.5), 0), 0.8);
      for (let k = 0; k < 3; k += 1) this.spark(at, k === 0 ? FX_COLORS.fireHot : FX_COLORS.ember, 0.35 * this.k, 0.5, 5, 1.4, 6);
      if (index % 2 === 0) this.marks.spawn(at.x, this.heightAt(at.x, at.z) + 0.06, at.z, widthM * 1.3, 4, FX_COLORS.scorch, 0.5, { kind: 2, fadeIn: 0.2, drag: 0, rot: this.random() * TAU });
    });
  }

  /**
   * Héo lan's beat (BALANCE.md §5): a dark violet stream runs from each
   * waiting foe at (x, z) to the Dragon at `to`, where a violet flash shows
   * the seep land. Test pass 27/10: one faint 0.9 m mote, and the HP bar was
   * the only sign of the main HP loss of the last waves.
   */
  seep(fromX: number, fromZ: number, to: THREE.Vector3): void {
    const y = this.heightAt(fromX, fromZ) + 1.2;
    const s = this.k;
    for (let k = 0; k < 7; k += 1) {
      const f = k / 7;
      const life = SEEP_S * (1 - f * 0.5);
      const x = fromX + (to.x - fromX) * f * 0.25;
      const z = fromZ + (to.z - fromZ) * f * 0.25;
      const yy = y + (to.y - y) * f * 0.25;
      this.puffs.spawn(x, yy, z, (0.55 + 0.25 * (1 - f)) * s, life, SEEP_COLOR, 0.8, { vx: (to.x - x) / life, vy: (to.y - yy) / life, vz: (to.z - z) / life, drag: 0, grow: -0.3, spin: this.rand(-2, 2), fadeIn: 0.03 + f * 0.12 });
    }
    this.glows.spawn(this.v.set(fromX, y, fromZ), this.u.set((to.x - fromX) / SEEP_S, (to.y - y) / SEEP_S, (to.z - fromZ) / SEEP_S), SEEP_GLOW, 0.9 * s, SEEP_S, { drag: 0, grow: -0.2, alpha: 0.7 });
  }

  /** Where the seep lands: a violet flash and falling motes round the Dragon. */
  seepHit(at: THREE.Vector3, strong: boolean): void {
    const s = this.k;
    this.glow(at, SEEP_GLOW, (strong ? 3.2 : 2.2) * s, 0.3);
    for (let k = 0; k < (strong ? 14 : 8); k += 1) this.spark(at, k % 2 === 0 ? SEEP_GLOW : SEEP_COLOR, 0.35 * s, 0.6, 3, 0.2, 4);
  }

  /**
   * A general falls (02 §3.4 G01: "cờ gãy đổ, thân tan thành rêu"; 02 §3.2
   * "quân gần chùn 1 s"): the body breaks into moss that spreads on the
   * ground, a withered-yellow ring runs out over the allies that flinch.
   */
  generalDeath(at: THREE.Vector3, flinchRadiusM: number): void {
    const ground = this.heightAt(at.x, at.z);
    const s = Math.sqrt(this.k);
    // Dark moss and withered-yellow tufts (00 D02): the grass is green, so the moss is darker than it.
    this.c.set("#c8d24a");
    this.c2.set("#34482a");
    for (let k = 0; k < 24; k += 1) {
      const angle = (k / 24) * TAU + this.random() * 0.3;
      const color = k % 3 === 0 ? this.c : this.c2;
      this.puffs.spawn(at.x + Math.cos(angle) * 0.4, ground + this.rand(0.5, 2.2), at.z + Math.sin(angle) * 0.4, this.rand(0.9, 1.5) * s, this.rand(1.1, 1.8), color, 1, { vx: Math.cos(angle) * 2.6, vz: Math.sin(angle) * 2.6, vy: this.rand(-0.8, 0.3), grow: 1, drag: 1.5, spin: this.rand(-1, 1) });
    }
    for (let k = 0; k < 8; k += 1) this.glow(this.v.set(at.x + this.rand(-1, 1), ground + this.rand(0.5, 2), at.z + this.rand(-1, 1)), this.c, 1.4 * s, 0.9, this.u.set(0, this.rand(1, 2.5), 0), 0.4);
    this.marks.spawn(at.x, ground + 0.07, at.z, 4.8, 6, this.c2, 0.85, { kind: 2, fadeIn: 0.4, drag: 0, rot: this.random() * TAU });
    this.debris.burst(at.x, ground + 0.8, at.z, 0, 1, 14, 5, this.c, this.c2);
    this.c.set("#c8d24a");
    this.rings.spawn(at.x, ground + 0.14, at.z, 1.2, 0.9, this.c, 1, { grow: Math.max(1, flinchRadiusM * 2 / 1.2 - 1), kind: 1, thickness: 0.28, drag: 0 });
    this.glow(this.v.set(at.x, ground + 1.6, at.z), this.c, 3.2, 0.5, this.u.set(0, 1.5, 0), 0.6);
  }

  private emit(kind: EmitterKind, target: FxTarget | null, x: number, y: number, z: number, seconds: number, radius: number, dx: number, dy: number, dz: number): Emitter | null {
    let emitter = this.emitters.find((item) => !item.active);
    if (emitter === undefined) {
      // Full: the oldest low-priority one makes room (burns first).
      emitter = this.emitters.find((item) => item.kind === "burn");
      if (emitter === undefined) return null;
    }
    emitter.active = true;
    emitter.kind = kind;
    if (target === null) emitter.target = null;
    else emitter.target = copyTarget(emitter.target ?? { slot: -1, serial: -1, x: 0, y: 0, z: 0 }, target);
    emitter.left = seconds;
    emitter.total = seconds;
    emitter.x = x;
    emitter.y = y;
    emitter.z = z;
    emitter.dx = dx;
    emitter.dy = dy;
    emitter.dz = dz;
    emitter.radius = radius;
    emitter.mark = -1;
    return emitter;
  }

  private runEmitter(emitter: Emitter, dt: number): void {
    const at = this.v;
    if (emitter.target !== null) this.where(emitter.target, at, emitter.kind === "burn" ? "top" : "base");
    else at.set(emitter.x, emitter.y, emitter.z);
    const k = emitter.left / Math.max(0.001, emitter.total);
    switch (emitter.kind) {
      case "breath": {
        const n = Math.round(520 * dt);
        const half = Math.acos(HERO_SKILLS.breath.halfAngleCosPm / 1000);
        for (let i = 0; i < n; i += 1) {
          // A direction inside the 60° cone, flatter than tall.
          const yaw = this.rand(-half, half);
          const pitch = this.rand(-half * 0.35, half * 0.35);
          const cs = Math.cos(yaw);
          const sn = Math.sin(yaw);
          const vx = emitter.dx * cs - emitter.dz * sn;
          const vz = emitter.dx * sn + emitter.dz * cs;
          const speed = this.rand(15, 21);
          const vel = this.u.set(vx * speed, (emitter.dy + pitch) * speed, vz * speed);
          const hot = this.random();
          const color = hot < 0.25 ? FX_COLORS.fireHot : hot < 0.75 ? FX_COLORS.fire : FX_COLORS.fireDeep;
          // Low alpha: hundreds overlap, and additive light would burn to white; denser and larger at the play camera.
          if (i % 3 === 0) this.glows.spawn(at, vel, color, this.rand(0.9, 1.4) * this.k, this.rand(0.6, 0.85), { drag: 0.5, gravity: -2, grow: 2.4, alpha: 0.32 });
          else this.sparks.spawn(at, vel, color, this.rand(0.35, 0.6) * this.k, this.rand(0.55, 0.8), { drag: 0.5, gravity: -1.5, grow: 1.5, alpha: 0.7 });
        }
        break;
      }
      case "burn": {
        const n = Math.floor(26 * dt) + (this.random() < (26 * dt) % 1 ? 1 : 0);
        for (let i = 0; i < n; i += 1) {
          const flame = this.random() < 0.35;
          (flame ? this.glows : this.sparks).spawn(
            this.w.set(at.x + this.rand(-0.3, 0.3), at.y - 0.35, at.z + this.rand(-0.3, 0.3)),
            this.u.set(this.rand(-0.3, 0.3), this.rand(1.6, 2.8), this.rand(-0.3, 0.3)),
            this.random() < 0.5 ? FX_COLORS.fire : FX_COLORS.fireDeep,
            flame ? this.rand(0.6, 0.9) : this.rand(0.35, 0.55),
            flame ? 0.4 : 0.5,
            { drag: 1, gravity: -1, grow: flame ? -0.3 : -0.4, alpha: flame ? 0.7 : 1 },
          );
        }
        break;
      }
      case "heal": {
        if (this.random() < 40 * dt) {
          const angle = this.random() * TAU;
          const r = Math.sqrt(this.random()) * emitter.radius;
          this.glows.spawn(this.w.set(at.x + Math.cos(angle) * r, at.y + 0.2, at.z + Math.sin(angle) * r), this.u.set(0, this.rand(1.2, 2.2), 0), FX_COLORS.heal, this.rand(0.35, 0.6), 1.1, { drag: 0.5, grow: -0.3 });
        }
        break;
      }
      case "net": {
        if (emitter.target !== null && emitter.mark >= 0) this.marks.moveTo(emitter.mark, at.x, this.heightAt(at.x, at.z) + 0.08, at.z);
        if (this.random() < 6 * dt) this.sparks.spawn(this.w.set(at.x + this.rand(-0.6, 0.6), at.y + 0.3, at.z + this.rand(-0.6, 0.6)), this.u.set(0, 0.6, 0), FX_COLORS.vine, 0.25, 0.4, { drag: 2 });
        break;
      }
      case "stun": {
        // Stars circling over the struck area (05 §6.1 Thiên Hỏa "sao choáng").
        const spin = (1 - k) * 9;
        for (let i = 0; i < 5; i += 1) {
          const angle = spin + (i / 5) * TAU;
          this.sparks.spawn(this.w.set(at.x + Math.cos(angle) * emitter.radius, at.y, at.z + Math.sin(angle) * emitter.radius), this.u.set(0, 0, 0), FX_COLORS.stun, 0.4 * k + 0.1, 0.06, { drag: 0 });
        }
        break;
      }
      case "inferno": {
        if (this.random() < 60 * dt) {
          const angle = this.random() * TAU;
          this.glows.spawn(this.w.set(at.x + Math.cos(angle) * emitter.radius, at.y - 1, at.z + Math.sin(angle) * emitter.radius), this.u.set(0, this.rand(2, 4), 0), this.random() < 0.5 ? FX_COLORS.fire : FX_COLORS.fireDeep, this.rand(0.8, 1.3), 0.6, { drag: 0.8, grow: 0.6 });
        }
        break;
      }
    }
  }

  /**
   * Advances the effects: `worldDt` (slowed in a hit stop) moves the world's
   * effects; `cameraPos` faces the trails; `pointScale` sizes the sprites
   * (drawing-buffer height ÷ 2 tan(fov / 2)).
   */
  update(worldDt: number, time: number, cameraPos: THREE.Vector3, pointScale: number): void {
    const dt = worldDt;
    this.time = time;
    this.updateCharge(dt);
    for (const bolt of this.bolts) {
      if (!bolt.active) continue;
      const width = (bolt.strong ? 0.68 : 0.6) * this.k;
      const n = bolt.trail.count;
      if (bolt.landed >= 0) {
        // Landed: the ribbon's tail runs into the impact and fades (§3.4: 6–12 frames after the hit).
        bolt.landed += dt;
        const left = 1 - bolt.landed / BOLT_TAIL_S;
        if (left <= 0) {
          bolt.active = false;
          bolt.trail.hide();
          continue;
        }
        const span = Math.min(1, BOLT_RIBBON_M / bolt.length) * left;
        for (let i = 0; i < n; i += 1) this.bezier(bolt, bolt.arc, 1 - (span * i) / (n - 1), bolt.trail.points[i]!);
        bolt.trail.update(cameraPos, width * (0.6 + 0.4 * left), left, time);
        continue;
      }
      this.where(bolt.target, bolt.to);
      bolt.t = Math.min(1, bolt.t + dt / bolt.duration);
      const head = this.bezier(bolt, bolt.arc, bolt.t, this.v);
      // T: the fire ribbon through points sampled back along the bolt's own curve (up to BOLT_RIBBON_M).
      const span = Math.min(bolt.t, BOLT_RIBBON_M / bolt.length);
      for (let i = 0; i < n; i += 1) this.bezier(bolt, bolt.arc, bolt.t - (span * i) / (n - 1), bolt.trail.points[i]!);
      bolt.trail.update(cameraPos, width, bolt.t < 1 ? 1 : Math.max(0, 1 - bolt.waited * 6), time);
      if (bolt.t < 1) {
        // A fireball with a body (test passes 26–27/10: a pale see-through spot): a deep-orange core and a hot heart in
        // normal blending, so it reads on the light path at 720p; over them an HDR head (2–4) that reaches the bloom
        // threshold, teal for a strong word (05 §6).
        this.puffs.spawn(head.x, head.y, head.z, 0.95 * this.k, 0.06, FX_COLORS.fireDeep, 0.95, { fadeIn: 0.001, spin: 5, rot: this.random() * TAU });
        this.puffs.spawn(head.x, head.y, head.z, 0.55 * this.k, 0.05, FX_COLORS.blastHot, 0.95, { fadeIn: 0.001, spin: -4, rot: this.random() * TAU });
        this.flares.draw(head, 1.7 * this.k, bolt.strong ? FX_COLORS.teal : FX_COLORS.fire, bolt.strong ? 1.1 : 1.3);
        this.flares.draw(head, 0.62 * this.k, bolt.strong ? FX_COLORS.teal : FX_COLORS.fireHot, bolt.strong ? 2.6 : 3);
        if (this.random() < 70 * dt) this.sparks.spawn(head, this.u.set(this.rand(-1.5, 1.5), this.rand(0, 2), this.rand(-1.5, 1.5)), this.random() < 0.5 ? FX_COLORS.ember : FX_COLORS.fireHot, 0.32 * this.k, 0.32, { drag: 2, gravity: 3 });
        // A thin dark wake behind the fire (§3.5 rule 4).
        if (this.random() < 30 * dt) this.puffs.spawn(head.x, head.y + 0.1, head.z, 0.5 * this.k, 0.4, FX_COLORS.smoke, 0.38, { vy: 0.6, grow: 1.2, spin: this.rand(-1, 1), fadeIn: 0.04 });
        continue;
      }
      if (bolt.hitTier >= 0) {
        this.boltLanded(this.v.copy(bolt.to), bolt.hitTier, bolt.dirX, bolt.dirZ, bolt.strong);
        bolt.landed = 0;
        continue;
      }
      bolt.waited += dt;
      if (bolt.waited > BOLT_WAIT) {
        // No hit came (the foe died first): a small fizzle.
        this.glow(this.v.copy(bolt.to), FX_COLORS.fire, 0.8, 0.2);
        bolt.active = false;
        bolt.trail.hide();
      }
    }
    for (const meteor of this.meteors) {
      if (!meteor.active) continue;
      meteor.t = Math.min(meteor.duration, meteor.t + dt);
      // Falls faster as it comes down.
      const k = meteor.t / meteor.duration;
      const head = this.v.lerpVectors(meteor.from, meteor.to, k ** 1.5);
      for (let i = 0; i < meteor.trail.count; i += 1) {
        const kk = Math.max(0, k - i * 0.035);
        meteor.trail.points[i]!.lerpVectors(meteor.from, meteor.to, kk ** 1.5);
      }
      meteor.trail.update(cameraPos, 1.5 * this.k, 1, time);
      // The burning mass: a deep-orange body under the glow (reads on light ground), a smoke wake behind it.
      this.puffs.spawn(head.x, head.y, head.z, 1.8 * this.k, 0.07, FX_COLORS.fireDeep, 0.95, { fadeIn: 0.001, spin: 4, rot: this.random() * TAU });
      this.puffs.spawn(head.x, head.y, head.z, 1.0 * this.k, 0.06, FX_COLORS.blastHot, 0.95, { fadeIn: 0.001, spin: -3, rot: this.random() * TAU });
      this.glows.spawn(head, this.u.set(0, 0, 0), FX_COLORS.fireHot, 3 * this.k, 0.05, { drag: 0 });
      if (this.random() < 45 * dt) this.puffs.spawn(head.x, head.y + 0.3, head.z, 1.1 * this.k, 0.6, FX_COLORS.smoke, 0.5, { vy: 0.6, grow: 1.4, spin: this.rand(-1, 1) });
      if (this.random() < 60 * dt) this.sparks.spawn(head, this.u.set(this.rand(-2, 2), this.rand(0, 3), this.rand(-2, 2)), FX_COLORS.ember, 0.5, 0.5, { drag: 1.5, gravity: 4 });
      // Its shadow on the target darkens and widens as it comes down (05 §6.1 "bóng báo").
      this.marks.spawn(meteor.to.x, meteor.to.y - 0.22, meteor.to.z, meteor.radius * (0.35 + 0.65 * k), 0.05, FX_COLORS.scorch, 0.3 + 0.45 * k, { kind: 2, fadeIn: 0.001, drag: 0 });
      if (meteor.t >= meteor.duration) {
        meteor.active = false;
        meteor.trail.hide();
        this.meteorImpact(meteor);
      }
    }
    for (const emitter of this.emitters) {
      if (!emitter.active) continue;
      this.runEmitter(emitter, dt);
      emitter.left -= dt;
      if (emitter.left <= 0) emitter.active = false;
    }
    this.sparks.setScale(pointScale);
    this.glows.setScale(pointScale);
    this.sparks.update(dt);
    this.glows.update(dt);
    this.puffs.update(dt);
    this.rings.update(dt);
    this.marks.update(dt);
    this.debris.update(dt);
    this.flares.update(dt);
  }

  /**
   * A, each frame: the charge eases to its step (a letter lands in ~2 frames), flares on a letter, follows the
   * mouth, and an abandoned word's charge fades. Then the mouth light: the release peak on the frame it is born
   * (its age is read before it advances, VFX_STANDARD §3.1 rule 5), a faint glow while a word is being typed.
   */
  private updateCharge(dt: number): void {
    this.chargeIdle += dt;
    if (this.chargeIdle > WORD_FX.chargeHoldS) this.chargeTarget = Math.max(0, this.chargeTarget - dt * 2.5);
    this.chargeLevel += (this.chargeTarget - this.chargeLevel) * (1 - Math.exp(-dt * 30));
    this.chargePulse = Math.max(0, this.chargePulse - dt * 7);
    const level = this.chargeLevel;
    const s = this.k;
    if (level > 0.01) {
      // Held in front of the snout, so the head does not hide it from a camera behind the Dragon.
      const at = this.w.set(this.mouthAt.x + this.facing.x * 0.45 * s, this.mouthAt.y + 0.05, this.mouthAt.z + this.facing.z * 0.45 * s);
      const flicker = 0.92 + 0.08 * Math.sin(this.time * 41) * Math.sin(this.time * 17 + 1.3);
      const pulse = this.chargePulse;
      const soft = this.reduced ? 0.7 : 1;
      // A compact bead of fire: an ember body (normal blend) that reads as fire on the sunlit dais (§3.5 rule 4), a
      // tight ember halo and a small hot heart. It stays saturated orange, never white: the release is the first
      // white-hot frame, so frame 0 jumps against the frame before it (judge 1a: the old wide pink halo held the
      // flash spot near white, +0.12 luma on release). It lives two frames and is laid again each frame.
      // Sizes: a whole word gathers a bead well under the release flash (2.2 m core, 3.2 m body).
      this.puffs.spawn(at.x, at.y, at.z, (0.4 + 0.85 * level + 0.15 * pulse) * s, 1 / 30, FX_COLORS.fireDeep, 0.8 + 0.2 * level, { fadeIn: 0.001, spin: 4, rot: this.random() * TAU });
      this.flares.draw(at, (0.5 + 0.95 * level + 0.3 * pulse) * s, FX_COLORS.ember, (0.45 + 0.45 * level + 0.5 * pulse) * flicker * soft);
      this.flares.draw(at, (0.22 + 0.36 * level + 0.1 * pulse) * s, FX_COLORS.fireHot, (1.0 + 0.9 * level + 0.8 * pulse) * flicker * soft);
    }
    if (this.light !== null) {
      const age = this.lightAge;
      const hold = WORD_FX.lightHoldS;
      const release = flareEnvelope(age, hold, WORD_FX.lightS) ** 1.5;
      this.lightAge = age + dt;
      this.light.intensity = WORD_FX.lightPeak * Math.max(release * this.lightGain, level * WORD_FX.lightCharge);
      this.light.position.set(this.mouthAt.x + this.facing.x * 0.6, this.mouthAt.y, this.mouthAt.z + this.facing.z * 0.6);
    }
  }

  dispose(): void {
    this.flares.dispose();
    this.light?.removeFromParent();
    this.light?.dispose();
    for (const bolt of this.bolts) bolt.trail.dispose();
    for (const meteor of this.meteors) meteor.trail.dispose();
    this.sparks.dispose();
    this.glows.dispose();
    this.puffs.dispose();
    this.rings.dispose();
    this.marks.dispose();
    this.debris.dispose();
    this.group.removeFromParent();
  }
}

function copyTarget(out: FxTarget, from: FxTarget): FxTarget {
  out.slot = from.slot;
  out.serial = from.serial;
  out.x = from.x;
  out.y = from.y;
  out.z = from.z;
  return out;
}

/** Point sprite scale for world-size particles. */
export function pointScaleOf(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera, out = new THREE.Vector2()): number {
  renderer.getDrawingBufferSize(out);
  return out.y / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
}

// ── The presenter: SimEvents → effects, hit stop, shake, numbers ───────────

/** Where the mouth is (view/heroes); the default is over the dais. */
export interface MouthSource {
  mouth(out: THREE.Vector3): THREE.Vector3;
}

export interface FxOptions {
  locator?: FoeLocator;
  terrain?: TerrainView;
  heroes?: MouthSource;
  /**
   * Where blows shake the view. Best: the camera rig's `shake(pixels)` (view/camera.ts; it shifts the projection, so
   * DOM tags stay still): each blow sends its peak in px (trauma² × 12). Without it, `onShake` gets this module's
   * own Trauma offsets each frame; with neither, a CSS transform moves the canvas only (05 §3).
   */
  shake?: (pixels: number) => void;
  onShake?: (x: number, y: number, roll: number) => void;
  /** A directional camera kick of `px` along the screen direction (dx, dy) (view/camera.ts kick): strong words only. */
  kick?: (dx: number, dy: number, px: number) => void;
  random?: () => number;
  /** Hỏa Long's mouth light; unset: the tier's default (FX_MOUTH_LIGHT). */
  mouthLight?: boolean;
  /** Reduced motion; unset: the system setting (prefers-reduced-motion). */
  reduced?: boolean;
}

/** The camera kick of a strong word's release (VFX_STANDARD §5.3 part 1: 1–2 px, T3 only). */
const STRONG_KICK_PX = 1.6;

export interface FxPresenter extends Presenter {
  /** World time scale the loop should run at this frame (hit-stop 0.05, else 1). Keys never wait on it. */
  timeScale(now: number): number;
  /** Draws the damage numbers over the frame; call right after stage.render(). */
  renderOverlay(): void;
  readonly core: FxCore;
  readonly hitStop: HitStop;
  readonly trauma: Trauma;
  /** The UI publishes rectangles numbers must not cover (learning frame, tags, boss bar). */
  readonly numbers: NumberField;
  /** The quads the numbers were last drawn with (null before the first number): scenarios read them, never box(). */
  readonly sprites: NumberSprites | null;
  /** When the last word bolt was drawn leaving the mouth (performance.now() of that frame): key → release (dh-vfx-word LIVE). */
  readonly lastRelease: { readonly at: number } | null;
}

/** Grade → strong bolt (teal head, Attack_Both): Chớp and Hoàn hảo (05 §6). */
export const strongGrade = (grade: Grade | null): boolean => grade === "flash" || grade === "perfect";

export function createFx(stage: Stage, options: FxOptions = {}): FxPresenter {
  const heightAt = options.terrain ? (x: number, z: number) => options.terrain!.heightAt(x, z) : () => 0;
  const reduced = options.reduced ?? (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches);
  const core = new FxCore(stage.quality, { heightAt, locator: options.locator, random: options.random, mouthLight: options.mouthLight, reduced });
  const kickFrom: ScreenPoint = { x: 0, y: 0, visible: false };
  const kickTo: ScreenPoint = { x: 0, y: 0, visible: false };
  let lastRelease: { at: number } | null = null;
  stage.layers.fx.add(core.group);
  core.warm(stage.renderer, stage.scene, stage.camera);
  const hitStop = new HitStop(DRAGON);
  const trauma = new Trauma(DRAGON, options.random);
  // The kit field: its box is the drawn digits and label, settle() runs until none touch (round 3 kit drift, fixed in the kit).
  const numbers = new NumberField(DRAGON);
  numbers.limit = FX_BUDGET[stage.quality].numbers;
  let sprites: NumberSprites | null = null;
  const screen: ScreenPoint = { x: 0, y: 0, visible: false };
  const at = new THREE.Vector3();
  const mouth = new THREE.Vector3();
  const size = new THREE.Vector2();
  const camPos = new THREE.Vector3();
  let lastDeath: THREE.Vector3 | null = null;
  /** Viêm Đế beams drawn this tick, by lane (a cluster word hits several foes at once). */
  const beamsDrawn = new Set<string>();
  const beamPoints: THREE.Vector3[] = Array.from({ length: 23 }, () => new THREE.Vector3());
  const lanePoint = { x: 0, z: 0 };
  const hero = new THREE.Vector3();
  const lastDeathAt = new THREE.Vector3();
  let nowMs = 0;
  let worldTime = 0;
  const canvas = stage.renderer.domElement;

  const mouthOf = (out: THREE.Vector3): THREE.Vector3 => (options.heroes ? options.heroes.mouth(out) : out.set(0, heightAt(0, 0) + 4.2, -0.8));
  const foePoint = (slot: number, serial: number, x: number, z: number, out: THREE.Vector3, anchor: "center" | "top" | "base" = "center"): THREE.Vector3 => {
    if (options.locator?.locate(slot, serial, anchor, out)) return out;
    return out.set(x, heightAt(x, z) + (anchor === "base" ? 0 : 0.8), z);
  };
  const number = (key: number, point: THREE.Vector3, amount: number, tierId: number, style: number): void => {
    const row = tierRow(tierId, DRAGON.tiers);
    if (row.number === null || amount <= 0) return;
    stage.project(point.x, point.y + 0.4, point.z, screen);
    if (!screen.visible) return;
    numbers.spawn(key, screen.x, screen.y, amount, style, tierId, row.number.size, row.number.life, 0, -1, nowMs / 1000);
  };
  const addTrauma = (amount: number): void => {
    if (amount <= 0) return;
    if (options.shake) options.shake(amount * amount * DRAGON.trauma.maxPx);
    else trauma.add(amount);
  };
  const blow = (tierId: number, now: number): void => {
    addTrauma(tierRow(tierId, DRAGON.tiers).trauma);
    hitStop.request(tierId, now);
  };

  const presenter: FxPresenter = {
    core,
    hitStop,
    trauma,
    numbers,
    get sprites() {
      return sprites;
    },
    get lastRelease() {
      return lastRelease;
    },

    timeScale(now: number): number {
      return hitStop.scale(now);
    },

    onEvents(events: readonly SimEvent[], world: World): void {
      const now = nowMs;
      lastDeath = null;
      beamsDrawn.clear();
      for (const event of events) {
        switch (event.type) {
          case "word-progress": {
            // The bench and tests drive this with partial worlds.
            const word = world.words?.live[event.word];
            const frac = word ? event.typed / Math.max(1, word.text.length) : 0;
            if (event.key === "advance" || event.key === "lock" || event.key === "done") {
              const target = word?.target;
              const to = target && target.kind === "enemy" ? foePoint(target.slot, target.serial, 0, 0, at) : null;
              // The last letter's charge is spent by the release in the same batch: no embers for it.
              core.keySpark(mouthOf(mouth), to, frac, event.key !== "done");
            } else if (event.key === "back" || event.key === "switch") core.charge(frac, false);
            break;
          }
          case "word-complete": {
            const target = event.target;
            if (target?.kind === "enemy") {
              const point = foePoint(target.slot, target.serial, 0, 0, at);
              const from = mouthOf(mouth);
              const strong = strongGrade(event.grade);
              core.launchBolt(from, { slot: target.slot, serial: target.serial, x: point.x, y: point.y, z: point.z }, strong);
              // R: a 1–2 px kick along the shot on a strong word only (T3); never under reduced motion (§3.8).
              if (strong && options.kick && !core.reduced) {
                stage.project(from.x, from.y, from.z, kickFrom);
                stage.project(point.x, point.y, point.z, kickTo);
                options.kick(kickTo.x - kickFrom.x, kickTo.y - kickFrom.y, STRONG_KICK_PX);
              }
            }
            break;
          }
          case "hit": {
            const target = event.target;
            const dirX = event.x;
            const dirZ = event.z;
            if (target.kind === "enemy") {
              // Viêm Đế: the word's strike also fires a beam down its foe's lane (01 §2.4); draw it once a lane a tick.
              if (event.source.kind === "hero" && event.damageType === "word" && (event.by === "inferno" || (event.by === "word" && (world.combat?.infernoUntil ?? -1) >= event.tick))) {
                const foe = world.enemies?.list[target.slot];
                const lane = foe && foe.serial === target.serial ? world.lanes[foe.lane] : undefined;
                const key = event.tick + ":" + (lane?.index ?? -1);
                if (lane && !beamsDrawn.has(key)) {
                  beamsDrawn.add(key);
                  const step = 60_000;
                  const reach = Math.min(beamPoints.length, Math.floor(HERO_SKILLS.inferno.beamLengthMm / 1000) + 1);
                  const points: THREE.Vector3[] = [];
                  for (let k = 0; k < reach; k += 1) {
                    pointAt(lane, lane.length - k * step, 0, lanePoint);
                    const x = uToM(lanePoint.x);
                    const z = uToM(lanePoint.z);
                    points.push(beamPoints[k]!.set(x, heightAt(x, z) + 0.7 + (lane.sky ? 3 : 0), z));
                  }
                  core.beam(points);
                }
              }
              const point = foePoint(target.slot, target.serial, event.x, event.z, at);
              if (event.source.kind === "hero" && event.damageType === "word") core.landBolt(target.serial, event.tier, point, dirX, dirZ);
              else if (event.tier >= 1) core.impact(point, Math.min(event.tier, 2), dirX, dirZ, false);
              const style = strongGrade(event.grade) ? STYLE.perfect : event.source.kind === "trap" || event.source.kind === "unit" ? STYLE.tick : event.tier >= 3 ? STYLE.crit : STYLE.normal;
              // A finishing word shows its strength: lock protection or a trap may have left the foe at 1 HP (test pass 27/10: "HOÀN HẢO 1").
              number(target.serial, point, event.damageType === "word" && event.source.kind === "hero" && event.power !== undefined ? event.power : event.amount, event.tier, style);
            } else if (target.kind === "hero" || target.kind === "guide") {
              addTrauma(0.12);
              if (!options.shake) trauma.kick(0, 1, 4);
            } else {
              at.set(event.x, heightAt(event.x, event.z) + 1, event.z);
              core.impact(at, 1, 0, 1, false);
            }
            blow(event.tier, now);
            break;
          }
          case "death": {
            const point = foePoint(event.enemy.slot, event.enemy.serial, event.x, event.z, at, "base");
            const length = Math.hypot(event.x, event.z) || 1;
            core.death(point, event.material, event.tier, event.x / length, event.z / length);
            if (event.foe in GENERALS) core.generalDeath(point, GENERALS[event.foe as keyof typeof GENERALS].onDeath.radiusMm / 1000);
            core.stop(event.enemy.serial);
            hitStop.kill(1, now);
            blow(event.tier, now);
            lastDeathAt.copy(point);
            lastDeath = lastDeathAt;
            break;
          }
          case "gold":
            if (event.reason === "kill" && event.delta > 0) core.gold(lastDeath ?? at.set(0, heightAt(0, 0) + 1, 0), event.delta);
            break;
          case "skill": {
            const from = mouthOf(mouth);
            if (event.skill === "breath" && event.stage === "cast") core.breath(from, event.x, event.z);
            else if (event.skill === "skyfire" && event.stage === "cast") core.meteor(event.x, event.z);
            else if (event.skill === "skyfire" && event.stage === "impact") core.landMeteor(event.x, event.z);
            else if (event.skill === "roar" && (event.stage === "cast" || event.stage === "impact")) core.roar(0, 0);
            else if (event.skill === "inferno" && event.stage === "cast") core.inferno(from);
            else if (event.skill === "inferno" && event.stage === "end") core.bomb(event.x, event.z, HERO_SKILLS.inferno.finaleRadiusMm / 1000, 8);
            if (event.stage === "cast" || event.stage === "impact") blow(event.skill === "roar" ? 4 : event.skill === "inferno" ? 5 : 3, now);
            break;
          }
          case "trap-trigger": {
            const def = TRAPS[event.trap];
            const slot = world.map.slots[event.slot];
            if (event.trap === "spikes") core.spikes(event.x, event.z, event.count, (def?.area.lengthMm ?? 3600) / 1000);
            else if (event.trap === "pine-bomb") {
              core.bomb(event.x, event.z, (def?.area.radiusMm ?? 2500) / 1000, event.count);
              blow(event.count >= 8 ? 4 : event.count <= 4 ? 2 : 3, now);
            } else if (event.trap === "net-launcher") core.net(event.x, event.z, 1.6, slot?.pos[0] ?? event.x, slot?.pos[1] ?? event.z);
            break;
          }
          case "status": {
            const target = event.target;
            if (target.kind !== "enemy") break;
            if (event.status === "burn") {
              if (event.on) {
                const point = foePoint(target.slot, target.serial, event.x, event.z, at, "top");
                core.burn({ slot: target.slot, serial: target.serial, x: point.x, y: point.y, z: point.z }, Math.max(0.3, event.durationMs / 1000));
              } else core.stop(target.serial, "burn");
            } else if (event.status === "grounded" && event.on) {
              const point = foePoint(target.slot, target.serial, event.x, event.z, at, "base");
              core.net(point.x, point.z, 0.9, point.x, point.z, { slot: target.slot, serial: target.serial, x: point.x, y: point.y, z: point.z });
            }
            break;
          }
          case "house-pulse": {
            const def = HOUSES[event.house];
            core.heal(event.x, event.z, (def?.radiusMm ?? 6000) / 1000);
            blow(1, now);
            break;
          }
          case "blight": {
            // Each waiting foe's seep runs to the Dragon; a flash and a small number land there (test pass 27/10).
            mouthOf(hero);
            hero.y -= 0.8;
            for (const [x, z] of event.from) core.seep(x, z, hero);
            const strong = event.amount * 20 >= (world.hero?.hpMax ?? Infinity);
            core.seepHit(hero, strong);
            number(-1, hero, event.amount, strong ? 2 : 1, STYLE.tick);
            break;
          }
          case "heal": {
            // The Dragon hovers 2.5 m up; a unit's chest is about 1 m.
            core.healDrop(event.x, event.z, event.tx, event.tz, event.target.kind === "hero" ? 3 : 1);
            break;
          }
          case "consumable":
            core.heal(0, 0, RINGS.daisMm / 1000, 2);
            break;
          default:
            break;
        }
      }
    },

    frame(_world: World, info: FrameInfo): void {
      nowMs = info.now;
      const worldDt = hitStop.worldDt(info.dt, info.now);
      worldTime += worldDt;
      stage.camera.getWorldPosition(camPos);
      // Far from the dais the fire grows (×1 within 40 m, ×2.4 at most), so a strike reads at the play camera (05 §5).
      core.k = Math.min(2.4, Math.max(1, camPos.length() / 40));
      // The heroes ran first this frame: the mouth is where the coiled or striking head holds it now.
      core.setMouth(mouthOf(mouth));
      core.update(worldDt, worldTime, camPos, pointScaleOf(stage.renderer, stage.camera, size));
      if (core.released > 0) {
        core.released = 0;
        lastRelease = { at: performance.now() };
      }
      stage.renderer.getSize(size);
      trauma.update(info.dt, size.y);
      if (options.shake) {
        // The camera rig shakes.
      } else if (options.onShake) options.onShake(trauma.offsetX, trauma.offsetY, trauma.roll);
      else if (trauma.offsetX !== 0 || trauma.offsetY !== 0) canvas.style.transform = "translate(" + trauma.offsetX.toFixed(2) + "px," + trauma.offsetY.toFixed(2) + "px) rotate(" + trauma.roll.toFixed(4) + "rad) scale(1.02)";
      else if (canvas.style.transform !== "") canvas.style.transform = "";
      const ui = Math.max(0.8, Math.min(1.2, Math.min(size.x / 1600, size.y / 900)));
      numbers.fontPx = 20 * ui;
      numbers.update(info.dt);
    },

    renderOverlay(): void {
      if (numbers.live === 0) return;
      sprites ??= new NumberSprites(DRAGON);
      stage.renderer.getSize(size);
      sprites.write(numbers, size.x, size.y);
      sprites.render(stage.renderer);
    },

    dispose(): void {
      core.dispose();
      sprites?.dispose();
      canvas.style.transform = "";
    },
  };
  return presenter;
}

/** Feedback tier for a grade's bolt (05 §5: Tốt, Vừa T1; Chớp, Hoàn hảo T3; Ẩu T1). */
export function tierForGrade(grade: Grade): FeedbackTier {
  return grade === "flash" || grade === "perfect" ? 3 : 1;
}
