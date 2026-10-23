/**
 * Instanced crowd of grey-box foes, units and placed items: one InstancedMesh
 * per layer (a primitive shape now, the owner's GLB later), colour per
 * instance, so 220 foes of every gait cost a handful of draw calls (05 §8).
 * The gait runs in the vertex shader (flyer bob and wing beat, biped bounce
 * and waddle, quadruped lope, swarm jitter); hit flash, status tint, death
 * dissolve are per-instance attributes; squash and the fake knock-back go
 * into the instance matrix (05 §5: no extra draw call). Blob shadows under
 * every instance are one more draw call; a flyer's shrinks with its height.
 * Source adapted: games/space-typing/src/defense/view/crowd.ts (V4 crowd).
 * Owner: view-crowd-fx (LANES.md).
 *
 * Skinned crowd later (05 §8, DESIGN §9 bench `bones`, `vat`): a layer takes a
 * CrowdLayerSource. "procedural" (a rigid GLB mesh, gait by shader, like
 * Space's V4 crowd) works today; "vat" (baked vertex animation texture) and
 * "bones" (bone matrices in a texture, skinned in the vertex shader) are the
 * typed slots M0b fills: the instance already carries clip and clip time.
 */
import * as THREE from "three";
import type { Gait, PlaceholderDef } from "../content/types";

/** Gaits plus "still" for traps, houses and anything that does not walk. */
export type CrowdGait = Gait | "still";

const GAIT_ID: Readonly<Record<CrowdGait, number>> = { still: 0, biped: 1, quadruped: 2, flyer: 3, swarm: 4 };

/** Status tints (05 §6.2: hold, slow, push are colour, shake, lean; never a clip change). Never a semantic colour. */
export const TINT = { none: 0, slow: 1, burn: 2, held: 3, aura: 4, stun: 5, wet: 6, bud: 7 } as const;
export type TintId = (typeof TINT)[keyof typeof TINT];
const TINT_COLORS = ["#ffffff", "#8fc8ff", "#ff8a3d", "#7fbf5a", "#c8d24a", "#f4f1e0", "#5f87a8", "#9bd07a"];

export interface CrowdInstance {
  /** Ground point under the instance, metres. */
  x: number;
  y: number;
  z: number;
  /** Heading in radians (view only): local +z faces (sin yaw, cos yaw). */
  yaw: number;
  /** 0–1 hit flash (white-hot). */
  flash: number;
  /** Height scale: 0.91 squash … 1.07 stretch (kit Reactions); width takes 2 − squash. */
  squash: number;
  /** Height above the ground y; default the placeholder's hoverM (flyers). */
  lift?: number;
  /** Fake recoil offset in metres (kit Reactions); the sim position never moves. */
  knockX?: number;
  knockZ?: number;
  /** 0 whole … 1 gone (death dissolve). */
  dissolve?: number;
  /** Status tint (TINT) and its mix 0–1. */
  tint?: number;
  tintMix?: number;
  /** Gait strength: 0 standing … 1 walking at pace; default 1. */
  stride?: number;
  /** Uniform scale on top of the size (a fallen unit's bud, a popping spike). */
  scale?: number;
  /** Reserved for skinned layers (vat, bones): clip index and seconds into it. */
  clip?: number;
  clipTime?: number;
}

/** How an instance reads: a foe (ash-grey shell, withered cracks) or ours. Default: anything with a gait is a foe. */
export interface CrowdLook {
  readonly foe?: boolean;
}

/** A clip baked into a vat or bone texture. */
export interface CrowdClip {
  readonly start: number;
  readonly frames: number;
  readonly fps: number;
  readonly loop: boolean;
}

/** How a layer animates: by shader gait (primitives, rigid GLB), or from baked textures (M0b). */
export type CrowdAnimation =
  | { readonly kind: "procedural" }
  | { readonly kind: "vat"; readonly texture: THREE.DataTexture; readonly frames: number; readonly clips: readonly CrowdClip[] }
  | { readonly kind: "bones"; readonly boneTexture: THREE.DataTexture; readonly bones: number; readonly clips: readonly CrowdClip[] };

/** What a layer draws: unit-size geometry (feet at y = 0, nose +z) and its animation. */
export interface CrowdLayerSource {
  readonly geometry: THREE.BufferGeometry;
  /** The geometry's own size [w, h, l]; instance scale = placeholder size ÷ this. */
  readonly sizeM: readonly [number, number, number];
  readonly animation: CrowdAnimation;
  /** Base material properties (the crowd patches its own copy). */
  readonly roughness?: number;
  readonly map?: THREE.Texture | null;
}

export interface Crowd {
  readonly group: Group;
  /**
   * Reserves an instance of `shape` drawn in layer `key` (default: the shape);
   * returns its handle, −1 when the layer is full. Anything with a gait is
   * drawn at the character scale.
   */
  add(shape: PlaceholderDef, gait?: CrowdGait, key?: string, look?: CrowdLook): number;
  remove(handle: number): void;
  set(handle: number, instance: CrowdInstance): void;
  /** Uploads instance buffers once a frame; `timeS` drives the gait. */
  flush(timeS?: number): void;
  /** Swaps a layer's geometry (the owner's GLB); "vat" and "bones" throw until M0b. */
  defineLayer(key: string, source: CrowdLayerSource): void;
  /** Live instances, and draw calls the crowd costs now (layers in use plus shadows). */
  readonly size: number;
  drawCalls(): number;
  dispose(): void;
}

type Group = THREE.Group;

const CROWD_VERTEX_HEAD = /* glsl */ `
attribute vec3 aColor;
attribute vec4 aState;
attribute vec4 aAnim;
uniform float uTime;
varying vec3 vTint;
varying vec4 vState;
varying vec3 vLocal;
varying vec3 vViewN;
varying float vFoe;
vec3 crowdTint(float id) {
  if (id < 0.5) return vec3(1.0);
  if (id < 1.5) return vec3(${hexVec("#8fc8ff")});
  if (id < 2.5) return vec3(${hexVec("#ff8a3d")});
  if (id < 3.5) return vec3(${hexVec("#7fbf5a")});
  if (id < 4.5) return vec3(${hexVec("#c8d24a")});
  if (id < 5.5) return vec3(${hexVec("#f4f1e0")});
  if (id < 6.5) return vec3(${hexVec("#5f87a8")});
  return vec3(${hexVec("#9bd07a")});
}
`;

// Object-space gait (aAnim: x gait id, + 8 for a foe; y phase 0–1, z stride 0–1).
const CROWD_BEGIN = /* glsl */ `
#include <begin_vertex>
vState = aState;
vTint = crowdTint(aState.z);
vLocal = position;
vFoe = step(7.5, aAnim.x);
float gaitPhase = aAnim.y * 6.2831;
float stride = aAnim.z;
float gait = aAnim.x - vFoe * 8.0;
if (gait > 0.5 && gait < 1.5) {
  // Biped: waddle side to side, leaning from the feet.
  transformed.x += sin(uTime * 4.6 + gaitPhase) * 0.09 * stride * transformed.y;
} else if (gait > 1.5 && gait < 2.5) {
  // Quadruped lope: the body rocks nose to tail.
  transformed.y += transformed.z * sin(uTime * 11.0 + gaitPhase) * 0.22 * stride;
} else if (gait > 2.5 && gait < 3.5) {
  // Flyer: the sides beat like wings.
  float wing = smoothstep(0.12, 0.5, abs(transformed.x));
  transformed.y += wing * sin(uTime * 17.0 + gaitPhase) * 0.55;
}
`;

// World-space bob after the instance transform (metres, whatever the size).
const CROWD_PROJECT = /* glsl */ `
vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_INSTANCING
mvPosition = instanceMatrix * mvPosition;
#endif
if (gait > 0.5 && gait < 1.5) {
  mvPosition.y += abs(sin(uTime * 4.6 + gaitPhase)) * 0.08 * stride;
} else if (gait > 1.5 && gait < 2.5) {
  mvPosition.y += max(0.0, sin(uTime * 11.0 + gaitPhase)) * 0.09 * stride;
} else if (gait > 2.5 && gait < 3.5) {
  mvPosition.y += sin(uTime * 2.4 + gaitPhase) * 0.22;
} else if (gait > 3.5) {
  mvPosition.x += sin(uTime * 23.0 + gaitPhase * 40.0) * 0.05 * stride;
  mvPosition.z += cos(uTime * 19.0 + gaitPhase * 31.0) * 0.05 * stride;
  mvPosition.y += abs(sin(uTime * 14.0 + gaitPhase)) * 0.06 * stride;
}
mvPosition = modelViewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;
`;

const CROWD_NORMAL = /* glsl */ `
#include <defaultnormal_vertex>
vViewN = normalize(transformedNormal);
`;

const CROWD_FRAGMENT_HEAD = /* glsl */ `
uniform float uTime;
varying vec3 vTint;
varying vec4 vState;
varying vec3 vLocal;
varying vec3 vViewN;
varying vec3 vColorCrowd;
varying float vFoe;
float crowdHash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float crowdNoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(crowdHash(i), crowdHash(i + vec3(1, 0, 0)), f.x), mix(crowdHash(i + vec3(0, 1, 0)), crowdHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(crowdHash(i + vec3(0, 0, 1)), crowdHash(i + vec3(1, 0, 1)), f.x), mix(crowdHash(i + vec3(0, 1, 1)), crowdHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
`;

// Death dissolve: noise eats the body from the edges, with a withered-yellow glowing rim.
const CROWD_CLIP = /* glsl */ `
#include <clipping_planes_fragment>
float crowdN = crowdNoise(vLocal * 7.0) * 0.75 + crowdNoise(vLocal * 19.0) * 0.25;
if (vState.y > 0.001 && crowdN < vState.y * 1.08) discard;
`;

// Bầy Héo (05 §2.2): the family colour greyed toward ash; our side keeps its colour.
const CROWD_COLOR = /* glsl */ `
#include <color_fragment>
diffuseColor.rgb *= vColorCrowd;
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11))) * vec3(0.98, 0.95, 0.88), 0.38 * vFoe);
diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vTint * 1.25, vState.w * 0.75);
`;

const CROWD_EMISSIVE = /* glsl */ `
#include <emissivemap_fragment>
float crowdRim = pow(1.0 - abs(vViewN.z), 2.0);
// A soft rim (05 §2.1: 10–15 %) so every body reads against the ground; an aura rim is withered yellow.
totalEmissiveRadiance += mix(vec3(0.13), vTint * 0.35, step(3.5, vState.z) * step(vState.z, 4.5) * vState.w) * crowdRim;
totalEmissiveRadiance += vTint * vState.w * 0.12;
// Withered-yellow cracks on every foe's shell (05 §2.2 "khe nứt vàng úa").
float crowdCrack = 1.0 - smoothstep(0.0, 0.026, abs(crowdNoise(vLocal * 5.0 + 3.7) - 0.5));
totalEmissiveRadiance += vec3(${hexVec("#c8d24a")}) * crowdCrack * 0.6 * vFoe;
totalEmissiveRadiance += vec3(1.6, 1.55, 1.4) * vState.x;
if (vState.y > 0.001) {
  float edge = 1.0 - smoothstep(0.0, 0.09, crowdN - vState.y * 1.08);
  totalEmissiveRadiance += vec3(${hexVec("#c8d24a")}) * edge * 2.4;
}
`;

const SHADOW_VERTEX = /* glsl */ `
attribute vec3 iPos;
attribute vec2 iData;
varying vec2 vUv;
varying float vAlpha;
void main() {
  vUv = uv;
  vAlpha = iData.y;
  vec3 world = iPos + vec3(position.x * iData.x, 0.0, -position.y * iData.x);
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}`;
const SHADOW_FRAGMENT = /* glsl */ `
varying vec2 vUv;
varying float vAlpha;
void main() {
  float d = length(vUv - 0.5) * 2.0;
  float a = (1.0 - smoothstep(0.35, 1.0, d)) * vAlpha;
  gl_FragColor = vec4(0.06, 0.07, 0.05, a * 0.55);
}`;

/** "#rrggbb" as a GLSL vec3 literal body. */
function hexVec(hex: string): string {
  const color = new THREE.Color(hex);
  return color.r.toFixed(4) + ", " + color.g.toFixed(4) + ", " + color.b.toFixed(4);
}

/** Unit primitives, feet at y = 0, nose +z, size 1 × 1 × 1. */
function primitive(shape: PlaceholderDef["shape"]): THREE.BufferGeometry {
  let geometry: THREE.BufferGeometry;
  switch (shape) {
    case "capsule":
      geometry = new THREE.CapsuleGeometry(0.5, 0.6, 4, 10);
      geometry.scale(1, 1 / 1.6, 1);
      break;
    case "sphere":
      geometry = new THREE.SphereGeometry(0.5, 14, 10);
      break;
    case "cone":
      geometry = new THREE.ConeGeometry(0.5, 1, 10);
      break;
    case "box":
    default:
      geometry = new THREE.BoxGeometry(1, 1, 1, 1, 1, 1);
      break;
  }
  geometry.translate(0, 0.5, 0);
  return geometry;
}

interface Layer {
  readonly key: string;
  mesh: THREE.InstancedMesh;
  readonly color: THREE.InstancedBufferAttribute;
  readonly state: THREE.InstancedBufferAttribute;
  readonly anim: THREE.InstancedBufferAttribute;
  readonly owner: Int32Array;
  readonly sizeM: [number, number, number];
  count: number;
  dirty: boolean;
}

interface HandleRec {
  layer: Layer;
  index: number;
  /** Placeholder size and hover. */
  w: number;
  h: number;
  l: number;
  hover: number;
  /** Last written ground point, lift and footprint for the shadow. */
  gx: number;
  gy: number;
  gz: number;
  lift: number;
  dissolve: number;
}

/** 05 §2.3: characters are drawn 1.4 × the scene's scale (placeholder sizes are real sizes). */
export const CHARACTER_SCALE = 1.4;

export interface CrowdOptions {
  /** Draw blob shadows (default true). */
  shadows?: boolean;
  /** Scale of everything with a gait (foes, units); "still" items (traps, houses) keep 1. Default CHARACTER_SCALE. */
  characterScale?: number;
  /** Seed for gait phases (view only). */
  seed?: number;
}

export function createCrowd(capacity: number, options: CrowdOptions = {}): Crowd {
  return new InstancedCrowd(capacity, options);
}

class InstancedCrowd implements Crowd {
  readonly group = new THREE.Group();
  private readonly layers = new Map<string, Layer>();
  private readonly handles: (HandleRec | null)[] = [];
  private readonly freeHandles: number[] = [];
  private readonly time = { value: 0 };
  private readonly matrix = new THREE.Matrix4();
  private readonly quat = new THREE.Quaternion();
  private readonly pos = new THREE.Vector3();
  private readonly scaleV = new THREE.Vector3();
  private readonly axisY = new THREE.Vector3(0, 1, 0);
  private readonly colorScratch = new THREE.Color();
  private readonly shadows: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial> | null;
  private readonly shadowPos: Float32Array;
  private readonly shadowData: Float32Array;
  private phaseSeed: number;
  private live = 0;
  private readonly characterScale: number;

  constructor(private readonly capacity: number, options: CrowdOptions) {
    this.group.name = "crowd";
    this.phaseSeed = (options.seed ?? 7) >>> 0 || 7;
    this.characterScale = options.characterScale ?? CHARACTER_SCALE;
    this.shadowPos = new Float32Array(capacity * 3);
    this.shadowData = new Float32Array(capacity * 2);
    if (options.shadows === false) {
      this.shadows = null;
    } else {
      const base = new THREE.PlaneGeometry(1, 1);
      const geometry = new THREE.InstancedBufferGeometry();
      geometry.index = base.index;
      geometry.setAttribute("position", base.getAttribute("position"));
      geometry.setAttribute("uv", base.getAttribute("uv"));
      geometry.setAttribute("iPos", new THREE.InstancedBufferAttribute(this.shadowPos, 3).setUsage(THREE.DynamicDrawUsage));
      geometry.setAttribute("iData", new THREE.InstancedBufferAttribute(this.shadowData, 2).setUsage(THREE.DynamicDrawUsage));
      geometry.instanceCount = 0;
      const material = new THREE.ShaderMaterial({
        vertexShader: SHADOW_VERTEX,
        fragmentShader: SHADOW_FRAGMENT,
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      });
      this.shadows = new THREE.Mesh(geometry, material);
      this.shadows.frustumCulled = false;
      this.shadows.renderOrder = 1;
      this.shadows.name = "crowd-shadows";
      this.group.add(this.shadows);
    }
  }

  get size(): number {
    return this.live;
  }

  drawCalls(): number {
    let calls = this.shadows !== null && this.live > 0 ? 1 : 0;
    for (const layer of this.layers.values()) if (layer.count > 0) calls += 1;
    return calls;
  }

  private nextPhase(): number {
    // xorshift32: gait phases only (view).
    let s = this.phaseSeed;
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    this.phaseSeed = s >>> 0;
    return (this.phaseSeed % 10_007) / 10_007;
  }

  private layerFor(key: string, shape: PlaceholderDef["shape"]): Layer {
    const existing = this.layers.get(key);
    if (existing !== undefined) return existing;
    const layer = this.makeLayer(key, { geometry: primitive(shape), sizeM: [1, 1, 1], animation: { kind: "procedural" } });
    this.layers.set(key, layer);
    return layer;
  }

  private makeLayer(key: string, source: CrowdLayerSource): Layer {
    const capacity = this.capacity;
    const geometry = source.geometry;
    const color = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3).setUsage(THREE.DynamicDrawUsage);
    const state = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4).setUsage(THREE.DynamicDrawUsage);
    const anim = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4).setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute("aColor", color);
    geometry.setAttribute("aState", state);
    geometry.setAttribute("aAnim", anim);
    const material = new THREE.MeshStandardMaterial({ roughness: source.roughness ?? 0.85, metalness: 0, map: source.map ?? null, emissive: "#000000" });
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.time;
      shader.vertexShader =
        CROWD_VERTEX_HEAD +
        "varying vec3 vColorCrowd;\n" +
        shader.vertexShader
          .replace("#include <begin_vertex>", CROWD_BEGIN + "\nvColorCrowd = aColor;")
          .replace("#include <defaultnormal_vertex>", CROWD_NORMAL)
          .replace("#include <project_vertex>", CROWD_PROJECT);
      shader.fragmentShader =
        CROWD_FRAGMENT_HEAD +
        shader.fragmentShader
          .replace("#include <clipping_planes_fragment>", CROWD_CLIP)
          .replace("#include <color_fragment>", CROWD_COLOR)
          .replace("#include <emissivemap_fragment>", CROWD_EMISSIVE);
    };
    material.customProgramCacheKey = () => "dh-crowd-v1";
    const mesh = new THREE.InstancedMesh(geometry, material, capacity);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.name = "crowd-" + key;
    this.group.add(mesh);
    return { key, mesh, color, state, anim, owner: new Int32Array(capacity).fill(-1), sizeM: [source.sizeM[0], source.sizeM[1], source.sizeM[2]], count: 0, dirty: true };
  }

  defineLayer(key: string, source: CrowdLayerSource): void {
    if (source.animation.kind !== "procedural") {
      // M0b: bake the owner's skinned GLB into a vat or bone texture and sample it in CROWD_BEGIN by aAnim / clip.
      throw new Error("crowd: " + source.animation.kind + " layers are not built yet (M0b, skinned crowd)");
    }
    const old = this.layers.get(key);
    const layer = this.makeLayer(key, source);
    if (old !== undefined) {
      // Carry live instances over to the new mesh.
      for (let index = 0; index < old.count; index += 1) {
        old.mesh.getMatrixAt(index, this.matrix);
        layer.mesh.setMatrixAt(index, this.matrix);
      }
      (layer.color.array as Float32Array).set(old.color.array as Float32Array);
      (layer.state.array as Float32Array).set(old.state.array as Float32Array);
      (layer.anim.array as Float32Array).set(old.anim.array as Float32Array);
      layer.owner.set(old.owner);
      layer.count = old.count;
      for (const rec of this.handles) if (rec !== null && rec.layer === old) rec.layer = layer;
      old.mesh.removeFromParent();
      old.mesh.geometry.dispose();
      (old.mesh.material as THREE.Material).dispose();
    }
    this.layers.set(key, layer);
  }

  add(shape: PlaceholderDef, gait: CrowdGait = "still", key: string = shape.shape, look: CrowdLook = {}): number {
    const layer = this.layerFor(key, shape.shape);
    if (layer.count >= this.capacity) return -1;
    const handle = this.freeHandles.length > 0 ? this.freeHandles.pop()! : this.handles.length;
    const index = layer.count;
    layer.count += 1;
    layer.owner[index] = handle;
    const k = gait === "still" ? 1 : this.characterScale;
    const [w, h, l] = shape.sizeM;
    const rec: HandleRec = { layer, index, w: w * k, h: h * k, l: l * k, hover: shape.hoverM, gx: 0, gy: 0, gz: 0, lift: shape.hoverM, dissolve: 0 };
    this.handles[handle] = rec;
    const color = this.colorScratch.set(shape.color);
    const c = layer.color.array as Float32Array;
    c[index * 3] = color.r;
    c[index * 3 + 1] = color.g;
    c[index * 3 + 2] = color.b;
    const s = layer.state.array as Float32Array;
    s.fill(0, index * 4, index * 4 + 4);
    const a = layer.anim.array as Float32Array;
    a[index * 4] = GAIT_ID[gait] + ((look.foe ?? gait !== "still") ? 8 : 0);
    a[index * 4 + 1] = this.nextPhase();
    a[index * 4 + 2] = 1;
    a[index * 4 + 3] = 0;
    // Hidden until the first set().
    this.matrix.makeScale(0, 0, 0);
    layer.mesh.setMatrixAt(index, this.matrix);
    layer.dirty = true;
    this.live += 1;
    return handle;
  }

  remove(handle: number): void {
    const rec = handle >= 0 ? this.handles[handle] : undefined;
    if (rec === undefined || rec === null) return;
    const layer = rec.layer;
    const last = layer.count - 1;
    const index = rec.index;
    if (index !== last) {
      // Swap the last instance into the hole.
      layer.mesh.getMatrixAt(last, this.matrix);
      layer.mesh.setMatrixAt(index, this.matrix);
      copyItem(layer.color.array as Float32Array, 3, last, index);
      copyItem(layer.state.array as Float32Array, 4, last, index);
      copyItem(layer.anim.array as Float32Array, 4, last, index);
      const moved = layer.owner[last]!;
      layer.owner[index] = moved;
      const movedRec = this.handles[moved];
      if (movedRec) movedRec.index = index;
    }
    layer.owner[last] = -1;
    layer.count = last;
    layer.dirty = true;
    this.handles[handle] = null;
    this.freeHandles.push(handle);
    this.live -= 1;
  }

  set(handle: number, instance: CrowdInstance): void {
    const rec = handle >= 0 ? this.handles[handle] : undefined;
    if (rec === undefined || rec === null) return;
    const layer = rec.layer;
    const index = rec.index;
    const lift = instance.lift ?? rec.hover;
    const dissolve = instance.dissolve ?? 0;
    const squash = instance.squash > 0 ? instance.squash : 1;
    const widen = 2 - squash;
    const extra = (instance.scale ?? 1) * (1 - dissolve * 0.25);
    const [sw, sh, sl] = layer.sizeM;
    this.pos.set(instance.x + (instance.knockX ?? 0), instance.y + lift - dissolve * 0.25, instance.z + (instance.knockZ ?? 0));
    this.quat.setFromAxisAngle(this.axisY, instance.yaw);
    this.scaleV.set((rec.w / sw) * widen * extra, (rec.h / sh) * squash * extra, (rec.l / sl) * widen * extra);
    this.matrix.compose(this.pos, this.quat, this.scaleV);
    layer.mesh.setMatrixAt(index, this.matrix);
    const s = layer.state.array as Float32Array;
    s[index * 4] = instance.flash;
    s[index * 4 + 1] = dissolve;
    s[index * 4 + 2] = instance.tint ?? 0;
    s[index * 4 + 3] = instance.tint ? (instance.tintMix ?? 1) : 0;
    const a = layer.anim.array as Float32Array;
    a[index * 4 + 2] = instance.stride ?? 1;
    a[index * 4 + 3] = instance.clipTime ?? 0;
    rec.gx = instance.x + (instance.knockX ?? 0);
    rec.gy = instance.y;
    rec.gz = instance.z + (instance.knockZ ?? 0);
    rec.lift = lift;
    rec.dissolve = dissolve;
    layer.dirty = true;
  }

  flush(timeS?: number): void {
    if (timeS !== undefined) this.time.value = timeS;
    for (const layer of this.layers.values()) {
      layer.mesh.count = layer.count;
      if (!layer.dirty) continue;
      layer.dirty = false;
      layer.mesh.instanceMatrix.needsUpdate = true;
      layer.color.needsUpdate = true;
      layer.state.needsUpdate = true;
      layer.anim.needsUpdate = true;
    }
    if (this.shadows === null) return;
    let n = 0;
    for (const rec of this.handles) {
      if (rec === null || rec === undefined) continue;
      const footprint = Math.max(rec.w, rec.l) * 1.15;
      // Higher up: a smaller, fainter spot (05 §6.2 flyers).
      const k = 1 / (1 + rec.lift * 0.35);
      this.shadowPos[n * 3] = rec.gx;
      this.shadowPos[n * 3 + 1] = rec.gy + 0.04;
      this.shadowPos[n * 3 + 2] = rec.gz;
      this.shadowData[n * 2] = footprint * (0.55 + 0.45 * k);
      this.shadowData[n * 2 + 1] = (0.45 + 0.55 * k) * (1 - rec.dissolve);
      n += 1;
    }
    const geometry = this.shadows.geometry;
    geometry.instanceCount = n;
    geometry.getAttribute("iPos").needsUpdate = true;
    geometry.getAttribute("iData").needsUpdate = true;
  }

  /** Layer instance count (tests, bench). */
  layerCount(key: string): number {
    return this.layers.get(key)?.count ?? 0;
  }

  dispose(): void {
    for (const layer of this.layers.values()) {
      layer.mesh.removeFromParent();
      layer.mesh.geometry.dispose();
      (layer.mesh.material as THREE.Material).dispose();
      layer.mesh.dispose();
    }
    this.layers.clear();
    if (this.shadows !== null) {
      this.shadows.geometry.dispose();
      this.shadows.material.dispose();
    }
    this.group.removeFromParent();
  }
}

function copyItem(array: Float32Array, size: number, from: number, to: number): void {
  for (let k = 0; k < size; k += 1) array[to * size + k] = array[from * size + k]!;
}

/** TINT_COLORS for tests and the legend. */
export const TINT_HEX: readonly string[] = TINT_COLORS;
