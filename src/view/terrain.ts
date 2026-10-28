/**
 * Procedural ground for the grey box (05 §2, §3): painted heightfield from
 * MapDef.terrain (seed, relief), banks carved for the river, lanes flattened,
 * 40 m skirt. Also the shared "painted look" every view-terrain material uses
 * (3-step light ramp, radial mist, brush noise) and the Dragon Dais as a
 * placeholder stone platform (two cylinders; the owner's GLB replaces it).
 * Noise and the height-field idea adapted from games/space-typing
 * src/defense/view/{painter,terrain}.ts.
 * Owner: view-terrain (LANES.md).
 */
import * as THREE from "three";
import type { Quality } from "../app/contracts";
import type { MapDef, Vec2 } from "../content/types";
import { buildLayout, type MapLayout } from "./layout";
import { sceneFor, sunVector } from "./maps/scene";
import { buildGroundPaint, mapSwitch, type GroundPaint } from "./paint";

// ── Noise and seeded random (view only: deterministic per map, not sim) ─────

/** Integer hash to [0, 1). */
export function hash2(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function valueNoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Fractal value noise in [0, 1]. */
export function fbm(x: number, y: number, seed: number, octaves = 4): number {
  let sum = 0;
  let amplitude = 0.5;
  let frequency = 1;
  for (let index = 0; index < octaves; index += 1) {
    sum += valueNoise(x * frequency, y * frequency, seed + index * 17) * amplitude;
    frequency *= 2.03;
    amplitude *= 0.5;
  }
  return sum / (1 - 0.5 ** octaves);
}

/** Seeded random in [0, 1) (mulberry32): the same map always grows the same forest. */
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

const smooth = (edge0: number, edge1: number, value: number): number => {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};
const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

// ── Polylines ────────────────────────────────────────────────────────────────

export interface Nearest {
  /** Distance to the line, metres. */
  dist: number;
  /** Distance from the first point to the nearest point, metres. */
  along: number;
  x: number;
  z: number;
}

/** A polyline in metres with cumulative lengths, nearest-point and point-at queries. */
export class Polyline {
  readonly xs: Float64Array;
  readonly zs: Float64Array;
  readonly cum: Float64Array;
  readonly length: number;
  /** Bounding box, metres. */
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;

  constructor(points: readonly Vec2[]) {
    const count = points.length;
    this.xs = new Float64Array(count);
    this.zs = new Float64Array(count);
    this.cum = new Float64Array(count);
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    points.forEach(([x, z], index) => {
      this.xs[index] = x;
      this.zs[index] = z;
      if (index > 0) this.cum[index] = this.cum[index - 1]! + Math.hypot(x - this.xs[index - 1]!, z - this.zs[index - 1]!);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
    });
    this.length = this.cum[count - 1] ?? 0;
    this.minX = minX;
    this.maxX = maxX;
    this.minZ = minZ;
    this.maxZ = maxZ;
  }

  get count(): number {
    return this.xs.length;
  }

  /** The point `along` metres from the start (clamped), with the unit direction there. */
  pointAt(along: number, out: { x: number; z: number; dx: number; dz: number } = { x: 0, z: 0, dx: 0, dz: 1 }): { x: number; z: number; dx: number; dz: number } {
    const last = this.count - 1;
    const at = Math.min(this.length, Math.max(0, along));
    let k = 0;
    while (k < last - 1 && this.cum[k + 1]! < at) k += 1;
    const span = Math.max(1e-9, this.cum[k + 1]! - this.cum[k]!);
    const t = (at - this.cum[k]!) / span;
    const dx = this.xs[k + 1]! - this.xs[k]!;
    const dz = this.zs[k + 1]! - this.zs[k]!;
    const length = Math.hypot(dx, dz) || 1;
    out.x = this.xs[k]! + dx * t;
    out.z = this.zs[k]! + dz * t;
    out.dx = dx / length;
    out.dz = dz / length;
    return out;
  }

  /** Nearest point on the line to (x, z). `reach` skips the search when the bounding box is farther. */
  nearest(x: number, z: number, out: Nearest = { dist: 0, along: 0, x: 0, z: 0 }, reach = Infinity): Nearest {
    out.dist = Infinity;
    if (x < this.minX - reach || x > this.maxX + reach || z < this.minZ - reach || z > this.maxZ + reach) return out;
    let best = Infinity;
    for (let k = 0; k < this.count - 1; k += 1) {
      const ax = this.xs[k]!;
      const az = this.zs[k]!;
      const dx = this.xs[k + 1]! - ax;
      const dz = this.zs[k + 1]! - az;
      const span = dx * dx + dz * dz;
      const t = span > 0 ? Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / span)) : 0;
      const px = ax + dx * t;
      const pz = az + dz * t;
      const d2 = (x - px) * (x - px) + (z - pz) * (z - pz);
      if (d2 < best) {
        best = d2;
        out.along = this.cum[k]! + t * Math.sqrt(span);
        out.x = px;
        out.z = pz;
      }
    }
    out.dist = Math.sqrt(best);
    return out;
  }
}

/** Catmull-Rom through `points`, one sample every ~`step` metres; `values` (one per point) are interpolated linearly. */
export function catmullRom(points: readonly Vec2[], step: number, values?: readonly number[]): { points: Vec2[]; values: number[] } {
  const outPoints: Vec2[] = [];
  const outValues: number[] = [];
  const at = (index: number): Vec2 => points[Math.min(points.length - 1, Math.max(0, index))]!;
  for (let k = 0; k < points.length - 1; k += 1) {
    const p0 = at(k - 1);
    const p1 = at(k);
    const p2 = at(k + 1);
    const p3 = at(k + 2);
    const steps = Math.max(1, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
    for (let s = 0; s < steps; s += 1) {
      const t = s / steps;
      const t2 = t * t;
      const t3 = t2 * t;
      const cr = (a: number, b: number, c: number, d: number): number => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      outPoints.push([cr(p0[0], p1[0], p2[0], p3[0]), cr(p0[1], p1[1], p2[1], p3[1])]);
      if (values) outValues.push(mix(values[k]!, values[k + 1]!, t));
    }
  }
  outPoints.push(points[points.length - 1]!);
  if (values) outValues.push(values[values.length - 1]!);
  return { points: outPoints, values: outValues };
}

/** The polyline grown straight out of both ends by `before` and `after` metres. */
export function extendLine(points: readonly Vec2[], before: number, after: number): Vec2[] {
  const out = [...points];
  if (points.length < 2) return out;
  const [ax, az] = points[0]!;
  const [bx, bz] = points[1]!;
  const lengthA = Math.hypot(ax - bx, az - bz) || 1;
  if (before > 0) out.unshift([ax + ((ax - bx) / lengthA) * before, az + ((az - bz) / lengthA) * before]);
  const [cx, cz] = points[points.length - 1]!;
  const [dx, dz] = points[points.length - 2]!;
  const lengthC = Math.hypot(cx - dx, cz - dz) || 1;
  if (after > 0) out.push([cx + ((cx - dx) / lengthC) * after, cz + ((cz - dz) / lengthC) * after]);
  return out;
}

// ── The painted look shared by every view-terrain material ─────────────────

/** Uniforms shared by ground, water, scatter, bridge and sky marker (one object per map). */
export interface PaintLook {
  readonly uniforms: {
    readonly uTime: { value: number };
    readonly uDhCentre: { value: THREE.Vector2 };
    readonly uFogNear: { value: number };
    readonly uFogFar: { value: number };
    readonly uFogCool: { value: THREE.Color };
    readonly uFogWarm: { value: THREE.Color };
    readonly uSunDir: { value: THREE.Vector3 };
    readonly uSunColor: { value: THREE.Color };
    readonly uRimColor: { value: THREE.Color };
  };
  /** Lane and sky-lane segments for the occlusion dither of tall props (05 §3). */
  readonly occlusion: {
    readonly uDhLaneSeg: { value: THREE.Vector4[] };
    readonly uDhLaneHalf: { value: number[] };
    readonly uDhLaneCount: { value: number };
    readonly uDhSkySeg: { value: THREE.Vector4[] };
    readonly uDhSkyCount: { value: number };
    readonly uDhSkyY: { value: number };
  };
  /** Mist colour seen at the far edge (scene background, clear colour). */
  readonly mist: THREE.Color;
}

const MAX_LANE_SEGMENTS = 16;
const MAX_SKY_SEGMENTS = 8;

/** Sun from the south-west, ~48° up: shadows fall to the north-east, away from the default camera. */
export const SUN_DIRECTION = new THREE.Vector3(-0.55, 1.05, 0.62).normalize();

/** The map's sun (scene spec lighting), else SUN_DIRECTION. Unit vector toward the sun. */
export function sunDirection(map: MapDef): THREE.Vector3 {
  const scene = sceneFor(map);
  if (!scene) return SUN_DIRECTION.clone();
  const [x, y, z] = sunVector(scene.lighting);
  return new THREE.Vector3(x, y, z).normalize();
}

export function createPaintLook(map: MapDef): PaintLook {
  const play = map.terrain.playRadiusM;
  const cool = new THREE.Color("#a3b6d6");
  const warm = new THREE.Color("#e9dcc4");
  // Ground lanes with their trail past the gate, then sky lanes (ground projection).
  const laneSeg: THREE.Vector4[] = [];
  const laneHalf: number[] = [];
  for (const lane of map.lanes) {
    const points = extendLine(lane.points, TRAIL_M, 0);
    for (let k = 0; k < points.length - 1 && laneSeg.length < MAX_LANE_SEGMENTS; k += 1) {
      laneSeg.push(new THREE.Vector4(points[k]![0], points[k]![1], points[k + 1]![0], points[k + 1]![1]));
      laneHalf.push(lane.widthM / 2);
    }
  }
  const laneCount = laneSeg.length;
  while (laneSeg.length < MAX_LANE_SEGMENTS) {
    laneSeg.push(new THREE.Vector4());
    laneHalf.push(0);
  }
  const skySeg: THREE.Vector4[] = [];
  let altitude = 3;
  for (const lane of map.sky) {
    altitude = lane.altitudeM;
    for (let k = 0; k < lane.points.length - 1 && skySeg.length < MAX_SKY_SEGMENTS; k += 1) {
      skySeg.push(new THREE.Vector4(lane.points[k]![0], lane.points[k]![1], lane.points[k + 1]![0], lane.points[k + 1]![1]));
    }
  }
  const skyCount = skySeg.length;
  while (skySeg.length < MAX_SKY_SEGMENTS) skySeg.push(new THREE.Vector4());
  return {
    occlusion: {
      uDhLaneSeg: { value: laneSeg },
      uDhLaneHalf: { value: laneHalf },
      uDhLaneCount: { value: laneCount },
      uDhSkySeg: { value: skySeg },
      uDhSkyCount: { value: skyCount },
      uDhSkyY: { value: altitude },
    },
    uniforms: {
      uTime: { value: 0 },
      uDhCentre: { value: new THREE.Vector2(map.dais.center[0], map.dais.center[1]) },
      uFogNear: { value: sceneFor(map)?.lighting.fogNearM ?? play + 9 },
      uFogFar: { value: sceneFor(map)?.lighting.fogFarM ?? play + 62 },
      uFogCool: { value: cool },
      uFogWarm: { value: warm },
      uSunDir: { value: sunDirection(map) },
      uSunColor: { value: new THREE.Color("#fff0d2") },
      uRimColor: { value: new THREE.Color("#ffe9c4") },
    },
    mist: cool.clone().lerp(warm, 0.35),
  };
}

/** GLSL: value noise, fbm and the radial mist (prefix dh to stay clear of three's names). */
export const DH_GLSL = /* glsl */ `
uniform float uTime;
uniform vec2 uDhCentre;
uniform float uFogNear;
uniform float uFogFar;
uniform vec3 uFogCool;
uniform vec3 uFogWarm;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uRimColor;
float dhHash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float dhNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(dhHash(i), dhHash(i + vec2(1.0, 0.0)), u.x), mix(dhHash(i + vec2(0.0, 1.0)), dhHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float dhFbm(vec2 p) {
  float sum = 0.0;
  float amp = 0.5;
  for (int k = 0; k < 4; k++) {
    sum += amp * dhNoise(p);
    p = p * 2.03 + 17.1;
    amp *= 0.5;
  }
  return sum / 0.9375;
}
// Radial mist: the play area stays clear, the skirt sinks into blue haze, warmer toward the sun.
vec3 dhMist(vec3 color, vec3 world) {
  vec2 d = world.xz - uDhCentre;
  float r = length(d);
  float f = smoothstep(uFogNear, uFogFar, r + (dhNoise(world.xz * 0.05) - 0.5) * 8.0);
  f = max(f, smoothstep(1.5, -2.5, world.y) * smoothstep(uFogNear - 6.0, uFogFar, r) * 0.6);
  float sunward = clamp(dot(normalize(d + vec2(0.001)), normalize(uSunDir.xz)) * 0.5 + 0.5, 0.0, 1.0);
  vec3 mist = mix(uFogCool, uFogWarm, sunward * 0.7);
  return mix(color, mist, f);
}
`;

export interface PaintOptions {
  /** Program cache key: one per distinct option set. */
  readonly key: string;
  /** GLSL declarations for the fragment shader (uniforms, helpers). */
  readonly fragmentPars?: string;
  /** GLSL that sets diffuseColor.rgb (vDhWorld, vDhNormal, vDhLocal, vDhMask available). */
  readonly paint?: string;
  /** Extra uniforms for the paint code. */
  readonly uniforms?: Record<string, { value: unknown }>;
  /** Fresnel rim strength (0.10–0.15 for foliage, 05 §2.1). */
  readonly rim?: number;
  /** Bends normals toward a sphere around local (0, y, 0) by `mix` (round canopies). */
  readonly sphere?: { readonly y: number; readonly mix: number };
  /** Wind sway amplitude in local units at the top (scatter). */
  readonly wind?: number;
  /** Screen-door to 35 % where the prop hides a lane or the sky lane behind it (05 §3: tall trees). */
  readonly dither?: boolean;
  /** The geometry carries an `aDhMask` vec4 attribute (ground). */
  readonly mask?: boolean;
}

const RAMP_GLSL = /* glsl */ `
// Three soft light bands (art-pipeline 4): shadow, mid, lit, a little smooth light kept.
float dhRamp(float x) {
  float bands = smoothstep(-0.02, 0.1, x) * 0.52 + smoothstep(0.32, 0.44, x) * 0.3 + smoothstep(0.66, 0.78, x) * 0.18;
  return mix(clamp(x, 0.0, 1.0), bands, 0.72);
}
`;

/** Does the view ray, after passing this fragment, land on a lane (near y = 0) or the sky lane (at flight height)? */
const DITHER_GLSL = /* glsl */ `
uniform vec4 uDhLaneSeg[${MAX_LANE_SEGMENTS}];
uniform float uDhLaneHalf[${MAX_LANE_SEGMENTS}];
uniform int uDhLaneCount;
uniform vec4 uDhSkySeg[${MAX_SKY_SEGMENTS}];
uniform int uDhSkyCount;
uniform float uDhSkyY;
float dhSegDist(vec2 p, vec2 a, vec2 b) {
  vec2 ab = b - a;
  float t = clamp(dot(p - a, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);
  return length(p - a - ab * t);
}
float dhBayer(vec2 p) {
  int i = int(mod(p.x, 4.0)) + int(mod(p.y, 4.0)) * 4;
  float m[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
  return (m[i] + 0.5) / 16.0;
}
bool dhHidesLane(vec3 world) {
  vec3 rd = world - cameraPosition;
  float far = length(rd);
  rd /= far;
  if (rd.y > -0.05) return false;
  float t = (0.1 - cameraPosition.y) / rd.y;
  if (t > far + 0.3) {
    vec2 hit = (cameraPosition + rd * t).xz;
    for (int k = 0; k < ${MAX_LANE_SEGMENTS}; k++) {
      if (k >= uDhLaneCount) break;
      vec4 s = uDhLaneSeg[k];
      if (dhSegDist(hit, s.xy, s.zw) < uDhLaneHalf[k] + 0.6) return true;
    }
  }
  float ts = (uDhSkyY - cameraPosition.y) / rd.y;
  if (ts > far + 0.3) {
    vec2 hit = (cameraPosition + rd * ts).xz;
    for (int k = 0; k < ${MAX_SKY_SEGMENTS}; k++) {
      if (k >= uDhSkyCount) break;
      vec4 s = uDhSkySeg[k];
      if (dhSegDist(hit, s.xy, s.zw) < 1.4) return true;
    }
  }
  return false;
}
`;

const LAMBERT_DOT = "float dotNL = saturate( dot( geometryNormal, directLight.direction ) );";

/**
 * Turns a MeshLambertMaterial into the painted look: ramp lighting, radial
 * mist instead of three's fog, optional paint code, rim, round normals, wind.
 */
export function paintMaterial<T extends THREE.MeshLambertMaterial>(material: T, look: PaintLook, options: PaintOptions): T {
  material.fog = false;
  const lambert = THREE.ShaderChunk.lights_lambert_pars_fragment;
  if (!lambert.includes(LAMBERT_DOT)) console.warn("view/terrain: three's lambert chunk changed; ramp lighting is off");
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, look.uniforms, options.uniforms ?? {});
    const sphere = options.sphere;
    let vertex = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\n" + DH_GLSL + "\nvarying vec3 vDhWorld;\nvarying vec3 vDhNormal;\nvarying vec3 vDhLocal;\n" + (options.mask ? "attribute vec4 aDhMask;\nvarying vec4 vDhMask;\n" : ""),
      )
      .replace(
        "#include <worldpos_vertex>",
        "#include <worldpos_vertex>\n{\n  vec4 dhW = vec4(transformed, 1.0);\n#ifdef USE_INSTANCING\n  dhW = instanceMatrix * dhW;\n#endif\n  vDhWorld = (modelMatrix * dhW).xyz;\n}\n",
      )
      .replace(
        "#include <defaultnormal_vertex>",
        "#include <defaultnormal_vertex>\n{\n  vec3 dhN = objectNormal;\n#ifdef USE_INSTANCING\n  dhN = mat3(instanceMatrix) * dhN;\n#endif\n  vDhNormal = normalize(mat3(modelMatrix) * dhN);\n  vDhLocal = position;\n" + (options.mask ? "  vDhMask = aDhMask;\n" : "") + "}\n",
      );
    if (sphere) {
      vertex = vertex.replace(
        "#include <beginnormal_vertex>",
        "#include <beginnormal_vertex>\nobjectNormal = normalize(mix(objectNormal, normalize(position - vec3(0.0, " + sphere.y.toFixed(3) + ", 0.0)), " + sphere.mix.toFixed(3) + "));",
      );
    }
    if (options.wind) {
      vertex = vertex.replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\n{\n  vec3 dhBase = vec3(0.0);\n#ifdef USE_INSTANCING\n  dhBase = instanceMatrix[3].xyz;\n#endif\n  float dhSway = max(position.y, 0.0);\n  dhSway *= dhSway * " +
          options.wind.toFixed(3) +
          ";\n  transformed.x += sin(uTime * 1.3 + dhBase.x * 0.31 + dhBase.z * 0.17) * dhSway;\n  transformed.z += cos(uTime * 1.1 + dhBase.z * 0.29) * dhSway * 0.6;\n}\n",
      );
    }
    shader.vertexShader = vertex;
    let fragment = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\n" + DH_GLSL + RAMP_GLSL + "\nvarying vec3 vDhWorld;\nvarying vec3 vDhNormal;\nvarying vec3 vDhLocal;\n" + (options.mask ? "varying vec4 vDhMask;\n" : "") + (options.fragmentPars ?? ""),
      )
      .replace("#include <lights_lambert_pars_fragment>", lambert.replace(LAMBERT_DOT, "float dotNL = dhRamp( dot( geometryNormal, directLight.direction ) );"));
    if (options.dither) {
      Object.assign(shader.uniforms, look.occlusion);
      fragment = fragment
        .replace("void main() {", DITHER_GLSL + "\nvoid main() {")
        .replace("#include <clipping_planes_fragment>", "#include <clipping_planes_fragment>\nif (dhHidesLane(vDhWorld) && dhBayer(gl_FragCoord.xy) > 0.35) discard;");
    }
    if (options.paint) fragment = fragment.replace("#include <color_fragment>", "#include <color_fragment>\n{\n" + options.paint + "\n}\n");
    const rim = options.rim ?? 0;
    fragment = fragment.replace(
      "#include <opaque_fragment>",
      (rim > 0 ? "outgoingLight += uRimColor * pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 3.0) * " + rim.toFixed(3) + " * diffuseColor.rgb * 2.0;\n" : "") +
        "outgoingLight = dhMist(outgoingLight, vDhWorld);\n#include <opaque_fragment>",
    );
    shader.fragmentShader = fragment;
  };
  material.customProgramCacheKey = () => "dh-paint-" + options.key;
  return material;
}

// ── Height field ─────────────────────────────────────────────────────────────

/** A straight bridge deck over the river (placeholder; the owner's GLB later). */
export interface BridgeSpan {
  readonly laneId: string;
  /** Deck ends on the lane, metres. */
  readonly ax: number;
  readonly az: number;
  readonly bx: number;
  readonly bz: number;
  readonly halfWidth: number;
  /** Top of the deck, metres. */
  readonly topY: number;
}

export interface LanePath {
  readonly id: string;
  readonly halfWidth: number;
  /** The sim polyline (gate first). */
  readonly line: Polyline;
  /** The trail painted beyond the gate into the forest, tapering. */
  readonly trail: Polyline;
  /** Bridge spans along the lane, metres from the gate. */
  readonly bridges: readonly { readonly fromM: number; readonly toM: number }[];
}

export interface HeightField {
  readonly map: MapDef;
  /** River surface height, metres. */
  readonly waterLevel: number;
  /** Ground height under the dais platform and its top. */
  readonly daisBase: number;
  readonly daisTop: number;
  /** Dais tiers: upper radius (map radius) and the lower step. */
  readonly daisRadius: number;
  readonly daisStepRadius: number;
  readonly lanes: readonly LanePath[];
  /** Smoothed river centreline, run out 150 m past both map ends; widths per point. */
  readonly river: { readonly line: Polyline; readonly widths: Float64Array } | null;
  readonly bridges: readonly BridgeSpan[];
  /** Grid axes (metres; fine inside the map square, coarse in the skirt). */
  readonly xs: Float64Array;
  readonly zs: Float64Array;
  readonly heights: Float32Array;
  /** Per vertex: lane centre distance, lane half width, river edge distance (negative in water), forest density. */
  readonly masks: Float32Array;
  /** Bare ground, bilinear (no dais, no deck). */
  ground(x: number, z: number): number;
  /** What actors stand on: ground, the dais tiers and bridge decks. */
  heightAt(x: number, z: number): number;
  /** Nearest lane (sim polyline or the trail beyond the gate): centre distance and half width there. */
  laneAt(x: number, z: number): { dist: number; half: number };
  /** Signed distance to the water's edge (negative in the water); large with no river. */
  riverEdge(x: number, z: number): number;
  /** Forest density 0–1 (dense in the skirt, clumps inside the play area, none near the dais). */
  forest(x: number, z: number): number;
  /** Map spike: the decorative layout (pond, cliff, footpaths, groves, rock lines, paint stamps). */
  readonly layout: MapLayout;
  /** Pond water level, metres (NaN without a pond). */
  readonly pondLevel: number;
  /** Time the layout took to build, ms. */
  readonly layoutMs: number;
}

/** Trail painted past each gate into the forest (metres). */
const TRAIL_M = 16;
/** River run-out past the map's river ends (metres), so it flows into the mist. */
const RIVER_RUNOUT_M = 150;
/** Skirt radius of the ground mesh, far past the mist. */
const OUTER_M = 300;
const OUTER_STEPS = 14;

function gridAxis(half: number, cell: number): Float64Array {
  const inner = Math.round(half / cell);
  const values: number[] = [];
  for (let k = OUTER_STEPS; k >= 1; k -= 1) values.push(-(half + (OUTER_M - half) * (k / OUTER_STEPS) ** 1.7));
  for (let i = -inner; i <= inner; i += 1) values.push((i * half) / inner);
  for (let k = 1; k <= OUTER_STEPS; k += 1) values.push(half + (OUTER_M - half) * (k / OUTER_STEPS) ** 1.7);
  return Float64Array.from(values);
}

/** Index of the cell holding `value` on a sorted axis, and the fraction inside it. */
function cellOf(axis: Float64Array, value: number): [number, number] {
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
}

/** Grid cells whose axis value lies in [from, to]. */
function indexRange(axis: Float64Array, from: number, to: number): [number, number] {
  const [a] = cellOf(axis, from);
  const [b] = cellOf(axis, to);
  return [a, Math.min(axis.length - 1, b + 1)];
}

/** Builds the height field of `map` with `cellM` metre cells inside the map square. */
export function buildHeightField(map: MapDef, cellM = 0.5): HeightField {
  const { seed, sizeM, playRadiusM: play, reliefM } = map.terrain;
  const [cx, cz] = map.dais.center;
  const half = sizeM / 2;
  const xs = gridAxis(half, cellM);
  const zs = gridAxis(half, cellM);
  const nx = xs.length;
  const nz = zs.length;
  const count = nx * nz;
  const layoutStart = performance.now();
  const layout = buildLayout(map);
  const layoutMs = performance.now() - layoutStart;
  const cliff = layout.cliff;
  const pond = layout.pond;

  const low = (x: number, z: number): number => (fbm(x * 0.016 + 3.1, z * 0.016 - 1.7, seed, 3) - 0.5) * 2 * reliefM * 0.8;
  const detail = (x: number, z: number): number => (fbm(x * 0.065, z * 0.065, seed + 5, 3) - 0.5) * 2 * reliefM * 0.28;
  const rimAt = (r: number): number => smooth(play + 3, play + 30, r);
  const hills = (x: number, z: number, rim: number): number => (rim > 0 ? rim * (2.2 + 6.5 * fbm(x * 0.028, z * 0.028, seed + 9, 3)) : 0);
  const forest = (x: number, z: number): number => {
    const r = Math.hypot(x - cx, z - cz);
    const clump = fbm(x * 0.05 + 7, z * 0.05 - 3, seed + 21, 3);
    const inside = 1 - smooth(play - 5, play + 7, r);
    const outer = 0.45 + smooth(0.3, 0.6, clump) * 0.55;
    const inner = smooth(0.56, 0.74, clump) * 0.85;
    return mix(outer, inner, inside) * smooth(9, 14, r);
  };

  // Lanes: the sim polyline (bridge spans left out: the deck covers them) and a tapering trail past the gate.
  const lanes: LanePath[] = map.lanes.map((lane) => {
    const line = new Polyline(lane.points);
    const [gx, gz] = lane.points[0]!;
    const [hx, hz] = lane.points[1]!;
    const length = Math.hypot(gx - hx, gz - hz) || 1;
    const trail = new Polyline([
      [gx + ((gx - hx) / length) * TRAIL_M, gz + ((gz - hz) / length) * TRAIL_M],
      [gx, gz],
    ]);
    const bridges = lane.features.filter((feature) => feature.kind === "bridge").map((feature) => ({ fromM: feature.fromM, toM: feature.toM }));
    return { id: lane.id, halfWidth: lane.widthM / 2, line, trail, bridges };
  });

  const nearest: Nearest = { dist: 0, along: 0, x: 0, z: 0 };
  const laneAt = (x: number, z: number): { dist: number; half: number } => {
    let dist = Infinity;
    let halfWidth = 1;
    for (const lane of lanes) {
      lane.line.nearest(x, z, nearest, 12);
      if (nearest.dist < dist && !lane.bridges.some((span) => nearest.along > span.fromM && nearest.along < span.toM)) {
        dist = nearest.dist;
        halfWidth = lane.halfWidth;
      }
      lane.trail.nearest(x, z, nearest, 12);
      if (nearest.dist < dist) {
        dist = nearest.dist;
        // Narrows to 55 % at the trail's far end.
        halfWidth = lane.halfWidth * mix(0.55, 1, nearest.along / TRAIL_M);
      }
    }
    return { dist, half: halfWidth };
  };

  // River: smoothed centreline with widths, run out into the mist.
  let river: HeightField["river"] = null;
  if (map.river) {
    const points = extendLine(map.river.points, RIVER_RUNOUT_M, RIVER_RUNOUT_M);
    const widths = [map.river.widthsM[0]!, ...map.river.widthsM, map.river.widthsM[map.river.widthsM.length - 1]!];
    const sampled = catmullRom(points, 1.5, widths);
    river = { line: new Polyline(sampled.points), widths: Float64Array.from(sampled.values) };
  }
  const riverWidthAt = (along: number): number => {
    if (!river) return 0;
    const { line, widths } = river;
    let k = 0;
    while (k < line.count - 2 && line.cum[k + 1]! < along) k += 1;
    const t = Math.min(1, Math.max(0, (along - line.cum[k]!) / Math.max(1e-9, line.cum[k + 1]! - line.cum[k]!)));
    return mix(widths[k]!, widths[k + 1]!, t);
  };
  const riverOnly = (x: number, z: number): number => {
    if (!river) return 99;
    river.line.nearest(x, z, nearest, 40);
    if (!Number.isFinite(nearest.dist)) return 99;
    return nearest.dist - riverWidthAt(nearest.along) / 2;
  };
  // The pond counts as water for every reader (banks, scatter clearances).
  const riverEdge = (x: number, z: number): number => Math.min(riverOnly(x, z), pond ? pond.edge(x, z) : 99);

  const waterLevel = -0.55;
  const bankM = map.river?.bankM ?? 0.4;
  const depthM = map.river?.depthM ?? 1.2;
  const bank = waterLevel + bankM;
  const daisBase = low(cx, cz) + 0.2;

  /** Height before the river: rolling ground, skirt hills, flattened lanes, the dais mound. */
  const dryHeight = (x: number, z: number, laneDist: number, laneHalf: number): number => {
    const r = Math.hypot(x - cx, z - cz);
    const rim = rimAt(r);
    const lowH = low(x, z);
    const hillH = hills(x, z, rim);
    let h = lowH + detail(x, z) + hillH + (cliff ? cliff.lift(x, z) : 0);
    if (laneDist < laneHalf + 2.4) h = mix(h, lowH + hillH - 0.07, smooth(laneHalf + 2.4, laneHalf + 0.15, laneDist));
    if (r < 10) h = mix(h, daisBase, smooth(9.5, 4.8, r));
    return h;
  };
  // House pads sit level: their centre height before the river.
  const pads = map.slots
    .filter((slot) => slot.kind === "house")
    .map((slot) => {
      const lane = laneAt(slot.pos[0], slot.pos[1]);
      return { x: slot.pos[0], z: slot.pos[1], h: dryHeight(slot.pos[0], slot.pos[1], lane.dist, lane.half) };
    });

  // Pond water sits a little under the dry ground at its centre.
  const pondLevel = pond ? dryHeight(pond.x, pond.z, 99, 1) - 0.3 : Number.NaN;

  // Distance fields stamped per grid cell (exact segment distances near each line).
  const laneDist = new Float32Array(count).fill(99);
  const laneHalf = new Float32Array(count).fill(1);
  // The nearest lane centre point per cell: the river valley is judged there, so a lane never tilts across.
  const laneNx = new Float32Array(count);
  const laneNz = new Float32Array(count);
  const riverDist = new Float32Array(count).fill(999);
  const riverHalf = new Float32Array(count).fill(2);
  const stamp = (line: Polyline, reach: number, visit: (index: number, dist: number, along: number, px: number, pz: number) => void, skip?: (along: number) => boolean): void => {
    for (let k = 0; k < line.count - 1; k += 1) {
      const ax = line.xs[k]!;
      const az = line.zs[k]!;
      const bx = line.xs[k + 1]!;
      const bz = line.zs[k + 1]!;
      const dx = bx - ax;
      const dz = bz - az;
      const span = dx * dx + dz * dz;
      const [i0, i1] = indexRange(xs, Math.min(ax, bx) - reach, Math.max(ax, bx) + reach);
      const [j0, j1] = indexRange(zs, Math.min(az, bz) - reach, Math.max(az, bz) + reach);
      for (let j = j0; j <= j1; j += 1) {
        const z = zs[j]!;
        for (let i = i0; i <= i1; i += 1) {
          const x = xs[i]!;
          const t = span > 0 ? Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / span)) : 0;
          const along = line.cum[k]! + t * Math.sqrt(span);
          if (skip?.(along)) continue;
          const px = ax + dx * t;
          const pz = az + dz * t;
          const d = Math.hypot(x - px, z - pz);
          if (d <= reach) visit(j * nx + i, d, along, px, pz);
        }
      }
    }
  };
  for (const lane of lanes) {
    const inBridge = (along: number): boolean => lane.bridges.some((span) => along > span.fromM && along < span.toM);
    stamp(
      lane.line,
      lane.halfWidth + 6,
      (index, d, _along, px, pz) => {
        if (d < laneDist[index]!) {
          laneDist[index] = d;
          laneHalf[index] = lane.halfWidth;
          laneNx[index] = px;
          laneNz[index] = pz;
        }
      },
      inBridge,
    );
    stamp(lane.trail, lane.halfWidth + 6, (index, d, along, px, pz) => {
      if (d < laneDist[index]!) {
        laneDist[index] = d;
        laneHalf[index] = lane.halfWidth * mix(0.55, 1, along / TRAIL_M);
        laneNx[index] = px;
        laneNz[index] = pz;
      }
    });
  }
  if (river) {
    const maxHalf = Math.max(...river.widths) / 2;
    stamp(river.line, maxHalf + 3.5 + 17, (index, d, along) => {
      if (d < riverDist[index]!) {
        riverDist[index] = d;
        riverHalf[index] = riverWidthAt(along) / 2;
      }
    });
  }

  const shallows = map.river?.shallows ?? [];
  const heights = new Float32Array(count);
  const masks = new Float32Array(count * 4);
  for (let j = 0; j < nz; j += 1) {
    const z = zs[j]!;
    for (let i = 0; i < nx; i += 1) {
      const x = xs[i]!;
      const index = j * nx + i;
      let h = dryHeight(x, z, laneDist[index]!, laneHalf[index]!);
      for (const pad of pads) {
        const d = Math.hypot(x - pad.x, z - pad.z);
        if (d < 3.6) h = mix(h, pad.h, smooth(3.6, 2.3, d));
      }
      const dRiver = riverDist[index]!;
      const halfR = riverHalf[index]!;
      if (dRiver < 900) {
        const valley = (vx: number, vz: number, d: number, halfAt: number): number => smooth(halfAt + 3.5 + 16 * rimAt(Math.hypot(vx - cx, vz - cz)), halfAt + 0.4, d);
        let tv = valley(x, z, dRiver, halfR);
        const onLane = smooth(laneHalf[index]! + 2.4, laneHalf[index]!, laneDist[index]!);
        if (onLane > 0 && river) {
          const lx = laneNx[index]!;
          const lz = laneNz[index]!;
          river.line.nearest(lx, lz, nearest, 40);
          if (Number.isFinite(nearest.dist)) tv = mix(tv, valley(lx, lz, nearest.dist, riverWidthAt(nearest.along) / 2), onLane);
        }
        h = mix(h, bank, tv);
        const channel = smooth(halfR + 0.25, halfR - 1.0, dRiver);
        if (channel > 0) {
          const across = Math.min(1, dRiver / Math.max(0.5, halfR));
          let bed = waterLevel - (0.22 + depthM * (1 - across * across));
          for (const shallow of shallows) {
            const ds = Math.hypot(x - shallow.center[0], z - shallow.center[1]);
            bed = mix(bed, Math.max(bed, waterLevel - 0.14), smooth(shallow.radiusM + 1.4, shallow.radiusM - 0.6, ds));
          }
          h = mix(h, bed, channel);
        }
      }
      let waterEdge = dRiver < 900 ? Math.min(60, dRiver - halfR) : 60;
      if (pond) {
        const e = pond.edge(x, z);
        if (e < 4) {
          // Level bank, then a bowl under the water.
          h = mix(h, pondLevel + bankM * 0.8, smooth(3.5, 0.4, e));
          const bed = pondLevel - (0.2 + pond.depthM * smooth(0, pond.radiusM * 0.75, -e));
          h = mix(h, bed, smooth(0.35, -0.9, e));
          waterEdge = Math.min(waterEdge, e);
        }
      }
      heights[index] = h;
      masks[index * 4] = Math.min(laneDist[index]!, 60);
      masks[index * 4 + 1] = laneHalf[index]!;
      masks[index * 4 + 2] = waterEdge;
      masks[index * 4 + 3] = forest(x, z);
    }
  }

  const ground = (x: number, z: number): number => {
    const [i, tx] = cellOf(xs, x);
    const [j, tz] = cellOf(zs, z);
    const a = heights[j * nx + i]!;
    const b = heights[j * nx + i + 1]!;
    const c = heights[(j + 1) * nx + i]!;
    const d = heights[(j + 1) * nx + i + 1]!;
    return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
  };

  // Bridge decks: a straight chord between the span's ends, a little above the banks.
  const point = { x: 0, z: 0, dx: 0, dz: 1 };
  const bridges: BridgeSpan[] = [];
  map.lanes.forEach((lane, index) => {
    for (const feature of lane.features) {
      if (feature.kind !== "bridge") continue;
      const path = lanes[index]!;
      path.line.pointAt(feature.fromM, point);
      const ax = point.x;
      const az = point.z;
      path.line.pointAt(feature.toM, point);
      const bx = point.x;
      const bz = point.z;
      const topY = Math.max(ground(ax, az), ground(bx, bz), bank) + 0.14;
      bridges.push({ laneId: lane.id, ax, az, bx, bz, halfWidth: feature.widthM / 2, topY });
    }
  });

  const daisRadius = map.dais.radiusM;
  const daisStepRadius = daisRadius + 0.8;
  const daisTop = daisBase + 0.6;
  const heightAt = (x: number, z: number): number => {
    const r = Math.hypot(x - cx, z - cz);
    if (r <= daisRadius) return daisTop;
    if (r <= daisStepRadius) return daisBase + 0.25;
    let h = ground(x, z);
    for (const bridge of bridges) {
      const dx = bridge.bx - bridge.ax;
      const dz = bridge.bz - bridge.az;
      const length = Math.hypot(dx, dz) || 1;
      const s = ((x - bridge.ax) * dx + (z - bridge.az) * dz) / length;
      const lateral = Math.abs((x - bridge.ax) * dz - (z - bridge.az) * dx) / length;
      if (s >= -0.2 && s <= length + 0.2 && lateral <= bridge.halfWidth) h = Math.max(h, bridge.topY);
    }
    return h;
  };

  return {
    map,
    waterLevel,
    daisBase,
    daisTop,
    daisRadius,
    daisStepRadius,
    lanes,
    river,
    bridges,
    xs,
    zs,
    heights,
    masks,
    ground,
    heightAt,
    laneAt,
    riverEdge,
    forest,
    layout,
    pondLevel,
    layoutMs,
  };
}

// ── Meshes ───────────────────────────────────────────────────────────────────

export interface TerrainView {
  readonly group: THREE.Group;
  /** Ground height in metres at (x, z) metres, bridge decks included; actors stand on it. */
  heightAt(xM: number, zM: number): number;
  dispose(): void;
}

/** The built terrain (buildTerrain): the TerrainView contract plus what water, paths and scatter read. */
export interface PaintedTerrain extends TerrainView {
  /** The height field and lane/river/forest queries (scatter, paths, water). */
  readonly field: HeightField;
  /** Shared look uniforms (time, mist, sun) for every view-terrain material. */
  readonly look: PaintLook;
  /** Advances the shared clock (water flow, wind). */
  update(dt: number): void;
  /** Map spike: the ground paint (mask bake time, tiles and decals loading). */
  readonly paint: GroundPaint;
}

/** Ground cell size by quality, metres. */
export const GROUND_CELL: Readonly<Record<Quality, number>> = { low: 1, medium: 0.75, high: 0.5, ultra: 0.5 };

/** The M0b procedural-only ground paint (kept for comparison; the spike paints with view/paint.ts). */
export const GROUND_PAINT_M0B = /* glsl */ `
vec2 p = vDhWorld.xz;
vec3 nW = normalize(vDhNormal);
float slope = 1.0 - clamp(nW.y, 0.0, 1.0);
float big = dhFbm(p * 0.045);
float mid = dhFbm(p * 0.17 + 3.7);
vec2 q = mat2(0.8, -0.6, 0.6, 0.8) * p;
float stroke = dhNoise(q * vec2(0.85, 0.2)) * 0.6 + dhNoise(q * vec2(2.4, 0.55) + 9.0) * 0.4;
float pat = big * 0.62 + mid * 0.22 + stroke * 0.26 - 0.05;
// Meadow in three painted tones.
float band = smoothstep(0.40, 0.45, pat) + smoothstep(0.56, 0.61, pat);
vec3 c = mix(uGrassDeep, uGrassMid, clamp(band, 0.0, 1.0));
c = mix(c, uGrassLight, clamp(band - 1.0, 0.0, 1.0));
float h = vDhWorld.y;
c = mix(c, c * uCoolTint, smoothstep(0.1, -0.9, h) * 0.45);
c = mix(c, uSunCream, smoothstep(0.7, 0.9, pat + h * 0.04) * 0.3);
// Forest floor under the trees, violet in the deep shade.
float woods = smoothstep(0.32, 0.72, vDhMask.w + (mid - 0.5) * 0.35);
c = mix(c, uForestFloor * (0.9 + 0.25 * stroke), woods * 0.8);
c = mix(c, c * uVioletShade, woods * smoothstep(0.35, 0.65, stroke + big * 0.3) * 0.55);
// Rocky slopes (not the river banks: those get pebbles and mud below).
float edge = vDhMask.z;
float rock = smoothstep(0.3, 0.48, slope + (mid - 0.5) * 0.18) * smoothstep(0.6, 2.2, edge);
c = mix(c, uRock * (0.82 + 0.32 * stroke), rock);
// River banks: patchy sand on some stretches, a thin pebbly margin, wet mud at the waterline.
float bankPatch = smoothstep(0.42, 0.62, dhNoise(p * 0.22 + 11.0));
float sand = (1.0 - smoothstep(0.0, 0.9, edge + (mid - 0.5) * 1.3 + (stroke - 0.5) * 0.6)) * bankPatch;
float margin = 1.0 - smoothstep(-0.2, 0.45, edge + (stroke - 0.5) * 0.5);
c = mix(c, mix(c, uRock, 0.55), margin * 0.7);
c = mix(c, uSand * (0.88 + 0.22 * mid), sand * 0.85);
c = mix(c, uMud, 1.0 - smoothstep(-0.6, 0.0, edge));
// Dirt lanes: worn edge, two ruts, the path one step brighter than the ground.
float lane = vDhMask.x / max(vDhMask.y, 0.1);
float wob = (mid - 0.5) * 0.32 + (stroke - 0.5) * 0.22;
float dirt = 1.0 - smoothstep(0.9, 1.06, lane + wob);
float worn = smoothstep(0.66, 0.96, lane + wob) * dirt;
float rut = (1.0 - smoothstep(0.06, 0.17, abs(lane - 0.46 + wob * 0.25))) * dirt;
vec3 dirtC = mix(uDirt, uDirtLight, smoothstep(0.42, 0.72, stroke + mid * 0.2));
dirtC = mix(dirtC, uDirtDark, worn * 0.5 + rut * 0.32);
float shoulder = (1.0 - smoothstep(1.0, 1.9, lane + wob)) * (1.0 - dirt);
c = mix(c, mix(c, uGrassLight, 0.45), shoulder * 0.7);
c = mix(c, dirtC, dirt);
// Trodden ring round the Dragon Dais.
float r = length(p - uDhCentre);
float plaza = 1.0 - smoothstep(5.6, 7.4, r + (mid - 0.5) * 2.2 + (stroke - 0.5) * 1.2);
float tuft = step(0.6, dhNoise(p * 1.7 + 4.0)) * smoothstep(4.6, 7.0, r);
c = mix(c, mix(uDirt, uSand, 0.5) * (0.88 + 0.2 * stroke), plaza * (0.8 - tuft * 0.45));
// Speckles: tiny flowers on the open meadow.
vec2 cell = floor(p * 1.3);
vec2 jitter = vec2(dhHash(cell), dhHash(cell + 7.1));
float dot1 = 1.0 - smoothstep(0.08, 0.13, length(fract(p * 1.3) - jitter * 0.7 - 0.15));
float meadow = (1.0 - woods) * (1.0 - dirt) * (1.0 - sand) * (1.0 - rock) * (1.0 - plaza) * step(0.62, dhHash(cell + 3.3)) * smoothstep(0.45, 0.65, big);
vec3 petal = mix(uSunCream, uPetal, step(0.5, dhHash(cell + 5.7)));
c = mix(c, petal, dot1 * meadow * 0.8);
diffuseColor.rgb = c;
`;

export const GROUND_PARS = /* glsl */ `
uniform vec3 uGrassDeep;
uniform vec3 uGrassMid;
uniform vec3 uGrassLight;
uniform vec3 uSunCream;
uniform vec3 uCoolTint;
uniform vec3 uForestFloor;
uniform vec3 uVioletShade;
uniform vec3 uRock;
uniform vec3 uSand;
uniform vec3 uMud;
uniform vec3 uDirt;
uniform vec3 uDirtLight;
uniform vec3 uDirtDark;
uniform vec3 uPetal;
`;

/** Pine-river ground palette (05 §2.2: moss green, pine blue, violet canopy shade, warm cream sun). */
export const PINE_RIVER_GROUND = {
  uGrassDeep: "#4a7444",
  uGrassMid: "#6e964d",
  uGrassLight: "#9cb862",
  uSunCream: "#efe2b6",
  uCoolTint: "#a2b9d8",
  uForestFloor: "#3b5f56",
  uVioletShade: "#b0a2dc",
  uRock: "#8f89a0",
  uSand: "#c9c2a6",
  uMud: "#5f5546",
  uDirt: "#c2a47e",
  uDirtLight: "#d8c29a",
  uDirtDark: "#8e7356",
  uPetal: "#c9b8ef",
} as const;

function colorUniforms(palette: Readonly<Record<string, string>>): Record<string, { value: THREE.Color }> {
  const out: Record<string, { value: THREE.Color }> = {};
  for (const [name, hex] of Object.entries(palette)) out[name] = { value: new THREE.Color(hex) };
  return out;
}

function groundGeometry(field: HeightField): THREE.BufferGeometry {
  const nx = field.xs.length;
  const nz = field.zs.length;
  const positions = new Float32Array(nx * nz * 3);
  for (let j = 0; j < nz; j += 1) {
    for (let i = 0; i < nx; i += 1) {
      const index = j * nx + i;
      positions[index * 3] = field.xs[i]!;
      positions[index * 3 + 1] = field.heights[index]!;
      positions[index * 3 + 2] = field.zs[j]!;
    }
  }
  const indices = new Uint32Array((nx - 1) * (nz - 1) * 6);
  let k = 0;
  for (let j = 0; j < nz - 1; j += 1) {
    for (let i = 0; i < nx - 1; i += 1) {
      const a = j * nx + i;
      const b = a + 1;
      const c = a + nx;
      const d = c + 1;
      indices[k++] = a;
      indices[k++] = c;
      indices[k++] = b;
      indices[k++] = b;
      indices[k++] = c;
      indices[k++] = d;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aDhMask", new THREE.BufferAttribute(field.masks, 4));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

const STONE_PARS = /* glsl */ `
uniform vec3 uStoneA;
uniform vec3 uStoneB;
uniform vec3 uMoss;
uniform float uDaisR;
`;

/** Flagstones in rings on top, block courses on the sides, moss in the cracks. */
const STONE_PAINT = /* glsl */ `
vec2 d = vDhWorld.xz - uDhCentre;
float rr = length(d);
float ang = atan(d.y, d.x) + 3.14159;
float ringW = 1.05;
float ring = floor(rr / ringW);
float pieces = 5.0 + ring * 5.0;
float seg = floor(ang / (6.28318 / pieces));
float tile = dhHash(vec2(ring, seg) + 0.37);
vec3 c = mix(uStoneA, uStoneB, tile * 0.8);
float fr = fract(rr / ringW);
float fa = fract(ang / (6.28318 / pieces));
float groove = max(1.0 - smoothstep(0.0, 0.07, min(fr, 1.0 - fr)), 1.0 - smoothstep(0.0, 0.05 / max(ring, 1.0), min(fa, 1.0 - fa)));
float top = step(0.7, normalize(vDhNormal).y);
if (top < 0.5) {
  float course = floor(vDhWorld.y / 0.22);
  float brick = floor((ang * uDaisR) / 0.9 + course * 0.5);
  c = mix(uStoneA, uStoneB, dhHash(vec2(course, brick)) * 0.8) * 0.9;
  float fy = fract(vDhWorld.y / 0.22);
  float fb = fract((ang * uDaisR) / 0.9 + course * 0.5);
  groove = max(1.0 - smoothstep(0.0, 0.1, min(fy, 1.0 - fy)), 1.0 - smoothstep(0.0, 0.04, min(fb, 1.0 - fb)));
}
c *= 0.92 + 0.16 * dhNoise(vDhWorld.xz * 3.0);
c = mix(c, c * 0.55, groove * 0.75);
float moss = smoothstep(0.62, 0.8, dhFbm(vDhWorld.xz * 0.9 + vDhWorld.y)) * (0.4 + 0.6 * groove);
c = mix(c, uMoss, moss * 0.6);
diffuseColor.rgb = c;
`;

/** The Dragon Dais placeholder: a two-step round stone platform (cylinders). */
function buildDais(field: HeightField, look: PaintLook): THREE.Mesh {
  const [cx, cz] = field.map.dais.center;
  const lowerH = 0.25 + 0.6;
  const lower = new THREE.CylinderGeometry(field.daisStepRadius, field.daisStepRadius + 0.15, lowerH, 64, 1);
  lower.translate(0, field.daisBase + 0.25 - lowerH / 2, 0);
  const upperH = 0.35 + 0.05;
  const upper = new THREE.CylinderGeometry(field.daisRadius, field.daisRadius + 0.05, upperH, 64, 1);
  upper.translate(0, field.daisTop - upperH / 2, 0);
  const geometry = mergeSimple([lower, upper]);
  const material = paintMaterial(new THREE.MeshLambertMaterial({ color: "#ffffff" }), look, {
    key: "stone",
    fragmentPars: STONE_PARS,
    paint: STONE_PAINT,
    uniforms: { ...colorUniforms({ uStoneA: "#c9c0ad", uStoneB: "#a69d92", uMoss: "#6f8f4f" }), uDaisR: { value: field.daisRadius } },
    rim: 0.08,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(cx, 0, cz);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = "dh-dais";
  return mesh;
}

/** Merges non-indexed copies of simple geometries (position and normal only). */
export function mergeSimple(parts: readonly THREE.BufferGeometry[], colors?: readonly THREE.Color[]): THREE.BufferGeometry {
  const flat = parts.map((part) => (part.index ? part.toNonIndexed() : part));
  const total = flat.reduce((sum, part) => sum + part.getAttribute("position").count, 0);
  const positions = new Float32Array(total * 3);
  const normals = new Float32Array(total * 3);
  const vertexColors = colors ? new Float32Array(total * 3) : null;
  let offset = 0;
  flat.forEach((part, index) => {
    const position = part.getAttribute("position");
    const normal = part.getAttribute("normal");
    for (let v = 0; v < position.count; v += 1) {
      positions.set([position.getX(v), position.getY(v), position.getZ(v)], (offset + v) * 3);
      normals.set([normal.getX(v), normal.getY(v), normal.getZ(v)], (offset + v) * 3);
      const color = colors?.[index];
      if (vertexColors && color) vertexColors.set([color.r, color.g, color.b], (offset + v) * 3);
    }
    offset += position.count;
  });
  for (const part of parts) part.dispose();
  for (const part of flat) part.dispose();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  if (vertexColors) geometry.setAttribute("color", new THREE.BufferAttribute(vertexColors, 3));
  geometry.computeBoundingSphere();
  return geometry;
}

export function buildTerrain(map: MapDef, quality: Quality): PaintedTerrain {
  const field = buildHeightField(map, GROUND_CELL[quality]);
  const look = createPaintLook(map);
  const group = new THREE.Group();
  group.name = "dh-terrain";
  // Map spike: the L7 paint (mask, tiles, decals) replaces the procedural-only ground paint.
  const groundPaint: GroundPaint = buildGroundPaint(field, field.layout, quality);
  // Spike perf split: ?paint=m0b draws the M0b procedural ground paint instead.
  const m0bPaint = mapSwitch("paint") === "m0b";
  const material = paintMaterial(new THREE.MeshLambertMaterial({ color: "#ffffff" }), look, {
    key: m0bPaint ? "ground" : "ground-spike",
    fragmentPars: m0bPaint ? GROUND_PARS : GROUND_PARS + groundPaint.pars,
    paint: m0bPaint ? GROUND_PAINT_M0B : groundPaint.paint,
    uniforms: m0bPaint ? colorUniforms(PINE_RIVER_GROUND) : { ...colorUniforms(PINE_RIVER_GROUND), ...groundPaint.uniforms },
    mask: true,
  });
  const ground = new THREE.Mesh(groundGeometry(field), material);
  ground.name = "dh-ground";
  ground.receiveShadow = quality !== "low";
  ground.frustumCulled = false;
  const dais = buildDais(field, look);
  dais.castShadow = dais.receiveShadow = quality !== "low";
  group.add(ground, dais);
  return {
    group,
    field,
    look,
    paint: groundPaint,
    heightAt: field.heightAt,
    update(dt: number): void {
      look.uniforms.uTime.value += dt;
    },
    dispose(): void {
      group.removeFromParent();
      for (const mesh of [ground, dais]) {
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      }
      groundPaint.dispose();
    },
  };
}
