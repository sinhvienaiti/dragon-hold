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
 * Skinned crowd (05 §8, DESIGN §9 bench `bones`; M0b): a layer takes a
 * CrowdLayerSource. "procedural" (a primitive or a rigid GLB mesh, gait by
 * shader) and "bones" (the owner's model with a rig and clips baked into a
 * bone texture by view/crowd-rig.ts, skinned in the vertex shader for the
 * body, its outline hull and its ghost) are built; "vat" stays a typed slot.
 * Each instance carries clip A and its time, clip B and its time, and the
 * blend (a short Hit over a walk), read as texture rows with frame lerp.
 * Model layers draw the texture with a family wash (luminance kept) instead
 * of the grey-box ash and cracks, fit uniformly to the placeholder's height
 * or footprint, and push their outline along smoothed normals.
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
  /** Bones layers: clip A (index in the layer's clip table) and seconds into it; default the first clip, running. */
  clip?: number;
  clipTime?: number;
  /** Bones layers: clip B, its time, and how much of it shows (0: none) — a Hit over a walk, a walk cross-fade. */
  clipB?: number;
  clipTimeB?: number;
  blend?: number;
}

/** How an instance reads: a foe (ash-grey shell, withered cracks) or ours. Default: anything with a gait is a foe. */
export interface CrowdLook {
  readonly foe?: boolean;
  /** Drawn scale on the placeholder size; default CHARACTER_SCALE with a gait, 1 still (foe-look.ts sets it per tier). */
  readonly scale?: number;
  /** Dark outline strength 0–1 (inverted hull, about 2 px at 1080p); default 1 with a gait, 0.6 still. */
  readonly outline?: number;
  /** Bright family rim 0–1; default 0.6 for a foe, 0.35 ours. */
  readonly rim?: number;
  /** How far a foe's colour greys toward ash 0–1 (05 §2.2); default 0.14 (0.38 before round 2). */
  readonly ash?: number;
  /** Model layers: family wash 0–1 toward the instance colour, luminance kept (M0b); default 0. */
  readonly wash?: number;
}

/** A ground ring the crowd draws with the shadows (a swarm cluster's outline, view only). */
export interface CrowdRing {
  x: number;
  y: number;
  z: number;
  radius: number;
  /** "#rrggbb" or 0xrrggbb. */
  color: string | number;
  alpha: number;
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
  /**
   * How the geometry meets the placeholder size: "stretch" each axis (primitives, default), or one
   * uniform scale from the placeholder's "height" (characters) or its "footprint" (placed things).
   */
  readonly fit?: "stretch" | "height" | "footprint";
  /** The owner's model: its texture with the family wash, no ash greying and no drawn cracks. */
  readonly model?: boolean;
  /** The geometry carries aHullN (smoothed normals): the outline hull is pushed along them. */
  readonly hullNormals?: boolean;
}

export interface Crowd {
  readonly group: Group;
  /**
   * Reserves an instance of `shape` drawn in layer `key` (default: the shape
   * for a foe, OUR_LAYER + the shape for our side); returns its handle, −1
   * when the layer is full. Anything with a gait is drawn at the character scale.
   */
  add(shape: PlaceholderDef, gait?: CrowdGait, key?: string, look?: CrowdLook): number;
  remove(handle: number): void;
  set(handle: number, instance: CrowdInstance): void;
  /** Ground rings drawn with this frame's shadows (swarm clusters); replaces the last list. */
  setRings(rings: readonly CrowdRing[]): void;
  /** Builds the layer of `shape` now (empty), so a warm-up compile covers its body and outline before the first foe. */
  prepare(shape: PlaceholderDef["shape"], key?: string): void;
  /** Uploads instance buffers once a frame; `timeS` drives the gait. */
  flush(timeS?: number): void;
  /** Swaps a layer's geometry (the owner's GLB; live instances carry over); "vat" throws (not built). */
  defineLayer(key: string, source: CrowdLayerSource): void;
  /** Whether a layer draws a skinned model now (actors run clips only there). */
  isSkinned(key: string): boolean;
  /** Live instances, and draw calls the crowd costs now (layers in use with their outlines and foe ghosts, plus shadows). */
  readonly size: number;
  drawCalls(): number;
  dispose(): void;
}

type Group = THREE.Group;

const CROWD_VERTEX_HEAD = /* glsl */ `
attribute vec3 aColor;
attribute vec4 aState;
attribute vec4 aAnim;
attribute vec4 aLook;
uniform float uTime;
#ifdef DH_HULLN
attribute vec3 aHullN;
#endif
#ifdef DH_BONES
// Bone texture: row = frame, 3 texels per bone (rows of its 3 × 4 matrix); aClip = (row A, row B, blend of B, -).
attribute vec4 aSkinI;
attribute vec4 aSkinW;
attribute vec4 aClip;
uniform highp sampler2D uBones;
mat4 dhBone(float row, float bone) {
  int b = int(bone + 0.5) * 3;
  int r0 = int(row);
  float f = row - float(r0);
  vec4 x = mix(texelFetch(uBones, ivec2(b, r0), 0), texelFetch(uBones, ivec2(b, r0 + 1), 0), f);
  vec4 y = mix(texelFetch(uBones, ivec2(b + 1, r0), 0), texelFetch(uBones, ivec2(b + 1, r0 + 1), 0), f);
  vec4 z = mix(texelFetch(uBones, ivec2(b + 2, r0), 0), texelFetch(uBones, ivec2(b + 2, r0 + 1), 0), f);
  return mat4(x.x, y.x, z.x, 0.0, x.y, y.y, z.y, 0.0, x.z, y.z, z.z, 0.0, x.w, y.w, z.w, 1.0);
}
mat4 dhSkinAt(float row) {
  mat4 m = aSkinW.x * dhBone(row, aSkinI.x);
  if (aSkinW.y > 0.0) m += aSkinW.y * dhBone(row, aSkinI.y);
  if (aSkinW.z > 0.0) m += aSkinW.z * dhBone(row, aSkinI.z);
  if (aSkinW.w > 0.0) m += aSkinW.w * dhBone(row, aSkinI.w);
  return m;
}
mat4 dhSkin() {
  mat4 m = dhSkinAt(aClip.x);
  if (aClip.z > 0.001) m = m * (1.0 - aClip.z) + dhSkinAt(aClip.y) * aClip.z;
  return m;
}
#endif
varying vec3 vTint;
varying vec4 vState;
varying vec4 vLook;
varying vec3 vLocal;
varying vec3 vViewN;
varying float vFoe;
varying float vPhase;
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

/** Skinning matrix once per vertex, at the top of main (bones layers). */
const SKIN_MAIN = "void main() {\n#ifdef DH_BONES\nmat4 dhSkinM = dhSkin();\n#endif";
/** Bones layers skin the normal before lighting. */
const SKIN_NORMAL = "#include <beginnormal_vertex>\n#ifdef DH_BONES\nobjectNormal = mat3(dhSkinM) * objectNormal;\n#endif";

// Object-space gait (aAnim: x gait id, + 8 for a foe; y phase 0–1, z stride 0–1); bones layers skin instead.
const CROWD_BEGIN = /* glsl */ `
#include <begin_vertex>
vState = aState;
vLook = aLook;
vTint = crowdTint(aState.z);
vLocal = position;
vFoe = step(7.5, aAnim.x);
vPhase = aAnim.y;
float gaitPhase = aAnim.y * 6.2831;
float stride = aAnim.z;
float gait = aAnim.x - vFoe * 8.0;
#ifdef DH_BONES
transformed = (dhSkinM * vec4(position, 1.0)).xyz;
gait = 0.0;
#endif
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
const CROWD_BOB = /* glsl */ `
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
`;

const CROWD_PROJECT = /* glsl */ `
vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_INSTANCING
mvPosition = instanceMatrix * mvPosition;
#endif
#ifndef DH_BONES
${CROWD_BOB}
#endif
mvPosition = modelViewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;
`;

/**
 * Outline hull (round 2 readability): the same body pushed out from its
 * centre by a width that keeps about OUTLINE_PX on screen at any zoom, drawn
 * back faces only in a dark colour, so every foe has a dark edge on grass,
 * dirt and water. aLook.x scales it (0: none); a dissolving body loses it.
 */
const OUTLINE_PROJECT = /* glsl */ `
vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef DH_HULLN
#ifdef DH_BONES
vec3 crowdOut = mat3(dhSkinM) * aHullN;
#else
vec3 crowdOut = aHullN;
#endif
#else
vec3 crowdOut = transformed - uCenter;
#endif
#ifdef USE_INSTANCING
crowdOut = mat3(instanceMatrix) * crowdOut;
mvPosition = instanceMatrix * mvPosition;
#endif
#ifndef DH_BONES
${CROWD_BOB}
#endif
vec4 crowdWorld = modelMatrix * mvPosition;
crowdOut = mat3(modelMatrix) * crowdOut;
float crowdWidth = uOutlineK * length(cameraPosition - crowdWorld.xyz) * aLook.x * (1.0 - aState.y);
crowdWorld.xyz += normalize(crowdOut + vec3(0.0, 1e-5, 0.0)) * crowdWidth;
mvPosition = viewMatrix * crowdWorld;
gl_Position = projectionMatrix * mvPosition;
`;

const OUTLINE_CLIP = /* glsl */ `
#include <clipping_planes_fragment>
if (vState.y > 0.02 || vLook.x < 0.01) discard;
`;

/** Outline colour (near-black umber) and its width in CSS px at 1080p. */
const OUTLINE_COLOR = "#120c08";
const OUTLINE_PX = 2.1;

/**
 * Ghost (round 2 readability): a foe hidden behind our blocker, a house, a
 * tree or a dragon shows through as its family colour with a bright rim.
 * Drawn after the world and our side but before any foe body (renderOrder),
 * depth test GREATER and no depth write, so it shows only where something
 * that is not a foe covers it; a foe in front still draws over it.
 */
const GHOST_VERTEX = /* glsl */ `
varying vec3 vGhost;
${SKIN_MAIN}
${CROWD_BEGIN}
${CROWD_PROJECT}
  vec3 ghostN = normal;
#ifdef DH_BONES
  ghostN = mat3(dhSkinM) * ghostN;
#endif
#ifdef USE_INSTANCING
  ghostN = mat3(instanceMatrix) * ghostN;
#endif
  vViewN = normalize(normalMatrix * ghostN);
  vGhost = aColor;
}`;
const GHOST_FRAGMENT = /* glsl */ `
uniform float uGhost;
uniform float uCut;
varying vec4 vState;
varying vec3 vLocal;
varying vec3 vViewN;
varying float vFoe;
varying vec3 vGhost;
void main() {
  // Foes only, whole ones, and never the part sunk in the ground.
  if (vFoe < 0.5 || vState.y > 0.02 || vLocal.y < uCut) discard;
  float rim = pow(1.0 - abs(normalize(vViewN).z), 1.4);
  // Diagonal hatching (about 3 px stripes): reads as "behind", and the cover stays visible between stripes.
  float hatch = step(0.5, fract((gl_FragCoord.x + gl_FragCoord.y) / 7.0));
  vec3 color = mix(vGhost, vec3(1.0, 0.97, 0.88), 0.12 + 0.5 * rim);
  gl_FragColor = vec4(color, min(0.92, 0.28 + 0.4 * hatch + 0.5 * rim) * uGhost);
  #include <colorspace_fragment>
}`;
/** Ghost strength 0–1. */
const GHOST_ALPHA = 1;
/** Draw order inside the opaque pass: the world and our side (0), foe ghosts, then foe bodies and hulls. */
const ORDER_GHOST = 1;
const ORDER_FOE = 2;
/** Layer key prefix of our side (units, traps, houses): drawn before the ghosts, so a foe behind them shows. */
export const OUR_LAYER = "our-";

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
varying vec4 vLook;
varying float vFoe;
varying float vPhase;
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

// Bầy Héo (05 §2.2): the family colour greyed toward ash; our side keeps its colour. The owner's models keep
// their texture (it carries the ash shell and the withered cracks) under a family wash that keeps luminance.
const CROWD_COLOR = /* glsl */ `
#include <color_fragment>
#ifdef DH_MODEL
float dhLum = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
vec3 dhWash = vColorCrowd * (dhLum / max(0.04, dot(vColorCrowd, vec3(0.3, 0.59, 0.11))));
diffuseColor.rgb = mix(diffuseColor.rgb, dhWash, vLook.w);
#else
diffuseColor.rgb *= vColorCrowd;
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11))) * vec3(0.98, 0.95, 0.88), vLook.z * vFoe);
#endif
diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vTint * 1.25, vState.w * 0.75);
`;

const CROWD_EMISSIVE = /* glsl */ `
#include <emissivemap_fragment>
float crowdRim = pow(1.0 - abs(vViewN.z), 2.2);
#ifdef DH_MODEL
// A modelled body turns its normals away from the camera far more often than a primitive: a thinner, softer rim,
// or the whole body washes toward cream (G01 at rim 0.95 read pale in the 27/10 sheets).
crowdRim = pow(1.0 - abs(vViewN.z), 3.4) * 0.55;
#endif
// A bright rim in the body's own colour lifted toward cream (aLook.y), so every body reads against the ground
// even on its shaded side; an aura rim is withered yellow.
vec3 crowdRimColor = mix(vColorCrowd, vec3(1.0, 0.97, 0.88), 0.55) * vLook.y;
totalEmissiveRadiance += mix(crowdRimColor, vTint * 0.35, step(3.5, vState.z) * step(vState.z, 4.5) * vState.w) * crowdRim;
totalEmissiveRadiance += vTint * vState.w * 0.12;
// Withered-yellow cracks on every foe's shell (05 §2.2 "khe nứt vàng úa"): each instance samples its own patch of
// noise (its gait phase), stretched unevenly, so no two shells carry the same mark and none reads as a letter.
#ifndef DH_MODEL
vec3 crackAt = vec3(vLocal.x * 4.1, vLocal.y * 6.3, vLocal.z * 4.7) + vec3(3.7 + vPhase * 41.0, vPhase * 23.0, 1.3 + vPhase * 17.0);
float crowdCrack = 1.0 - smoothstep(0.0, 0.045, abs(crowdNoise(crackAt) - 0.5));
totalEmissiveRadiance += vec3(${hexVec("#c8d24a")}) * crowdCrack * 0.6 * vFoe;
#endif
// Hit flash. Round 10 (VFX judge A: the body filled solid cream for 4–5 frames): a hot rim, orange-white at the
// silhouette with only a faint fill, squared so its tail drops in 2–3 frames.
float crowdHit = vState.x * vState.x;
totalEmissiveRadiance += vec3(1.8, 1.05, 0.5) * crowdHit * (0.18 + 1.7 * pow(1.0 - abs(vViewN.z), 1.4));
if (vState.y > 0.001) {
  float edge = 1.0 - smoothstep(0.0, 0.09, crowdN - vState.y * 1.08);
  totalEmissiveRadiance += vec3(${hexVec("#c8d24a")}) * edge * 2.4;
}
`;

/**
 * Ground marks, one instanced quad each (one draw call): kind 0 the dark
 * contact shadow under a body; 1 a flyer's spot and ring on the ground, the
 * point under it; 2 the thin dashed tether from that point up to the flyer
 * (a vertical quad turned to the camera); 3 a swarm cluster's ring in its
 * family colour. iData: x size (m), y alpha, z kind, w tether height (m).
 */
const SHADOW_VERTEX = /* glsl */ `
attribute vec3 iPos;
attribute vec4 iData;
attribute vec3 iColor;
varying vec2 vUv;
varying float vAlpha;
varying float vKind;
varying vec3 vColor;
void main() {
  vUv = uv;
  vAlpha = iData.y;
  vKind = iData.z;
  vColor = iColor;
  vec3 world;
  if (iData.z > 1.5 && iData.z < 2.5) {
    vec3 toCam = cameraPosition - iPos;
    vec3 right = normalize(vec3(toCam.z, 0.0, -toCam.x) + vec3(1e-4, 0.0, 0.0));
    world = iPos + right * position.x * iData.x + vec3(0.0, (position.y + 0.5) * iData.w, 0.0);
  } else {
    world = iPos + vec3(position.x * iData.x, 0.0, -position.y * iData.x);
  }
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}`;
const SHADOW_FRAGMENT = /* glsl */ `
varying vec2 vUv;
varying float vAlpha;
varying float vKind;
varying vec3 vColor;
void main() {
  float d = length(vUv - 0.5) * 2.0;
  vec4 c;
  if (vKind < 0.5) {
    // Contact shadow: a dark core under the feet, a soft edge.
    float a = (1.0 - smoothstep(0.25, 1.0, d)) * 0.8 + (1.0 - smoothstep(0.0, 0.5, d)) * 0.2;
    c = vec4(0.035, 0.04, 0.025, min(1.0, a) * vAlpha * 0.78);
  } else if (vKind < 1.5) {
    // Flyer: a dark spot with a ring round it on the ground under the body.
    float spot = 1.0 - smoothstep(0.12, 0.5, d);
    float ring = smoothstep(0.7, 0.78, d) * (1.0 - smoothstep(0.88, 0.97, d));
    c = vec4(0.035, 0.04, 0.025, max(spot * 0.7, ring * 0.75) * vAlpha);
  } else if (vKind < 2.5) {
    // Tether: a thin dashed line from the ground spot up to the flyer, fading upward.
    float across = 1.0 - smoothstep(0.2, 0.5, abs(vUv.x - 0.5));
    float dash = step(0.4, fract(vUv.y * 6.0));
    c = vec4(0.05, 0.05, 0.04, across * dash * (1.0 - vUv.y * 0.55) * vAlpha);
  } else {
    // Swarm cluster: a bold ring in the family colour lifted toward cream, dark edges both sides, a faint fill.
    float band = smoothstep(0.74, 0.79, d) * (1.0 - smoothstep(0.9, 0.94, d));
    float edge = max(smoothstep(0.68, 0.72, d) * (1.0 - smoothstep(0.74, 0.78, d)), smoothstep(0.9, 0.94, d) * (1.0 - smoothstep(0.98, 1.0, d)));
    float fill = (1.0 - smoothstep(0.5, 0.75, d)) * 0.16;
    vec3 col = mix(mix(vColor, vec3(1.0, 0.95, 0.85), 0.35), vec3(0.04, 0.035, 0.03), edge);
    c = vec4(col, max(max(band, edge * 0.8), fill) * vAlpha);
  }
  if (c.a < 0.004) discard;
  gl_FragColor = c;
}`;

/** Ground rings a crowd can hold per frame (swarm clusters). */
const RING_CAPACITY = 48;

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
  /** Dark outline hull sharing the body's geometry and instance matrices. */
  outline: THREE.InstancedMesh;
  /** Foe layers: the ghost seen through our side and the world (null for our layers). */
  ghost: THREE.InstancedMesh | null;
  readonly color: THREE.InstancedBufferAttribute;
  readonly state: THREE.InstancedBufferAttribute;
  readonly anim: THREE.InstancedBufferAttribute;
  readonly look: THREE.InstancedBufferAttribute;
  /** Bones layers: texture rows of clip A and B and the blend (aClip). */
  readonly clip: THREE.InstancedBufferAttribute;
  readonly owner: Int32Array;
  readonly sizeM: [number, number, number];
  readonly fit: "stretch" | "height" | "footprint";
  /** The clip table of a bones layer (null: no clips). */
  readonly clips: readonly CrowdClip[] | null;
  count: number;
  dirty: boolean;
}

interface HandleRec {
  layer: Layer;
  index: number;
  /** Placeholder size (drawn) and hover. */
  w: number;
  h: number;
  l: number;
  hover: number;
  /** A flyer: its ground mark is a spot and ring with a tether up to it. */
  flyer: boolean;
  /** Last written ground point, lift and footprint for the shadow. */
  gx: number;
  gy: number;
  gz: number;
  lift: number;
  dissolve: number;
}

/** 05 §2.3: characters are drawn 1.4 × the scene's scale (placeholder sizes are real sizes); foes take foe-look.ts's tier scale. */
export const CHARACTER_SCALE = 1.4;

export interface CrowdOptions {
  /** Draw blob shadows (default true). */
  shadows?: boolean;
  /** Scale of everything with a gait (foes, units); "still" items (traps, houses) keep 1. Default CHARACTER_SCALE. */
  characterScale?: number;
  /** Seed for gait phases (view only). */
  seed?: number;
  /** Dark outline hulls (default true): one more draw call per layer in use. */
  outlines?: boolean;
  /** Foe ghosts through our side and the world (default true): one more draw call per foe layer in use. */
  ghosts?: boolean;
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
  /** Outline width per metre of camera distance (set before each outline draw from the view height). */
  private readonly outlineK = { value: 0.0011 };
  private readonly outlines: boolean;
  private readonly ghosts: boolean;
  private readonly sizeScratch = new THREE.Vector2();
  private readonly matrix = new THREE.Matrix4();
  private readonly quat = new THREE.Quaternion();
  private readonly pos = new THREE.Vector3();
  private readonly scaleV = new THREE.Vector3();
  private readonly axisY = new THREE.Vector3(0, 1, 0);
  private readonly colorScratch = new THREE.Color();
  private readonly shadows: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial> | null;
  private readonly shadowPos: Float32Array;
  private readonly shadowData: Float32Array;
  private readonly shadowColor: Float32Array;
  private readonly shadowCapacity: number;
  private rings: readonly CrowdRing[] = [];
  private phaseSeed: number;
  private live = 0;
  private readonly characterScale: number;

  constructor(private readonly capacity: number, options: CrowdOptions) {
    this.group.name = "crowd";
    this.phaseSeed = (options.seed ?? 7) >>> 0 || 7;
    this.characterScale = options.characterScale ?? CHARACTER_SCALE;
    this.outlines = options.outlines !== false;
    this.ghosts = options.ghosts !== false;
    // A flyer takes two marks (spot, tether); rings come on top.
    this.shadowCapacity = capacity * 2 + RING_CAPACITY;
    this.shadowPos = new Float32Array(this.shadowCapacity * 3);
    this.shadowData = new Float32Array(this.shadowCapacity * 4);
    this.shadowColor = new Float32Array(this.shadowCapacity * 3);
    if (options.shadows === false) {
      this.shadows = null;
    } else {
      const base = new THREE.PlaneGeometry(1, 1);
      const geometry = new THREE.InstancedBufferGeometry();
      geometry.index = base.index;
      geometry.setAttribute("position", base.getAttribute("position"));
      geometry.setAttribute("uv", base.getAttribute("uv"));
      geometry.setAttribute("iPos", new THREE.InstancedBufferAttribute(this.shadowPos, 3).setUsage(THREE.DynamicDrawUsage));
      geometry.setAttribute("iData", new THREE.InstancedBufferAttribute(this.shadowData, 4).setUsage(THREE.DynamicDrawUsage));
      geometry.setAttribute("iColor", new THREE.InstancedBufferAttribute(this.shadowColor, 3).setUsage(THREE.DynamicDrawUsage));
      geometry.instanceCount = 0;
      const material = new THREE.ShaderMaterial({
        vertexShader: SHADOW_VERTEX,
        fragmentShader: SHADOW_FRAGMENT,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
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
    for (const layer of this.layers.values()) if (layer.count > 0) calls += (this.outlines ? 2 : 1) + (layer.ghost !== null ? 1 : 0);
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
    const look = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4).setUsage(THREE.DynamicDrawUsage);
    const clip = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4).setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute("aColor", color);
    geometry.setAttribute("aState", state);
    geometry.setAttribute("aAnim", anim);
    geometry.setAttribute("aLook", look);
    geometry.setAttribute("aClip", clip);
    // Our side (units, traps, houses) draws with the world; foes after their ghosts.
    const foe = !key.startsWith(OUR_LAYER);
    const bones = source.animation.kind === "bones" ? source.animation : null;
    const defines: Record<string, string> = {};
    if (bones !== null) defines.DH_BONES = "";
    if (source.model) defines.DH_MODEL = "";
    if (source.hullNormals) defines.DH_HULLN = "";
    const variant = Object.keys(defines).join("-") || "plain";
    const boneUniform = { value: bones?.boneTexture ?? null };
    const material = new THREE.MeshStandardMaterial({ roughness: source.roughness ?? 0.85, metalness: 0, map: source.map ?? null, emissive: "#000000" });
    material.defines = { ...defines };
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.time;
      shader.uniforms.uBones = boneUniform;
      shader.vertexShader =
        CROWD_VERTEX_HEAD +
        "varying vec3 vColorCrowd;\n" +
        shader.vertexShader
          .replace("void main() {", SKIN_MAIN)
          .replace("#include <beginnormal_vertex>", SKIN_NORMAL)
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
    material.customProgramCacheKey = () => "dh-crowd-v3-" + variant;
    const mesh = new THREE.InstancedMesh(geometry, material, capacity);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.name = "crowd-" + key;
    mesh.renderOrder = foe ? ORDER_FOE : 0;
    this.group.add(mesh);

    // The hull: same geometry and instance matrices, back faces, pushed out in the vertex shader.
    const center = { value: new THREE.Vector3(0, source.sizeM[1] / 2, 0) };
    const outlineMaterial = new THREE.MeshBasicMaterial({ color: OUTLINE_COLOR, side: THREE.BackSide });
    outlineMaterial.defines = { ...defines };
    outlineMaterial.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.time;
      shader.uniforms.uOutlineK = this.outlineK;
      shader.uniforms.uCenter = center;
      shader.uniforms.uBones = boneUniform;
      shader.vertexShader =
        CROWD_VERTEX_HEAD +
        "uniform float uOutlineK;\nuniform vec3 uCenter;\n" +
        shader.vertexShader.replace("void main() {", SKIN_MAIN).replace("#include <begin_vertex>", CROWD_BEGIN).replace("#include <project_vertex>", OUTLINE_PROJECT);
      shader.fragmentShader = "varying vec4 vState;\nvarying vec4 vLook;\n" + shader.fragmentShader.replace("#include <clipping_planes_fragment>", OUTLINE_CLIP);
    };
    outlineMaterial.customProgramCacheKey = () => "dh-crowd-outline-v2-" + variant;
    const outline = new THREE.InstancedMesh(geometry, outlineMaterial, capacity);
    outline.instanceMatrix = mesh.instanceMatrix;
    outline.count = 0;
    outline.frustumCulled = false;
    outline.visible = this.outlines;
    outline.name = "crowd-outline-" + key;
    outline.renderOrder = foe ? ORDER_FOE : 0;
    outline.onBeforeRender = (renderer, _scene, camera) => {
      // About OUTLINE_PX at 1080p whatever the zoom: width = k × distance.
      renderer.getSize(this.sizeScratch);
      const height = Math.max(1, this.sizeScratch.y);
      const fov = (camera as THREE.PerspectiveCamera).isPerspectiveCamera ? (camera as THREE.PerspectiveCamera).fov : 30;
      const px = Math.max(1.5, (OUTLINE_PX * height) / 1080);
      this.outlineK.value = (px * 2 * Math.tan((fov * Math.PI) / 360)) / height;
    };
    this.group.add(outline);

    // The ghost: same geometry and instance matrices, opaque pass (blended), after the world and before foe bodies.
    let ghost: THREE.InstancedMesh | null = null;
    if (foe && this.ghosts) {
      const ghostMaterial = new THREE.ShaderMaterial({
        defines: { ...defines },
        uniforms: { uTime: this.time, uGhost: { value: GHOST_ALPHA }, uCut: { value: source.sizeM[1] * 0.1 }, uBones: boneUniform },
        vertexShader: CROWD_VERTEX_HEAD + GHOST_VERTEX,
        fragmentShader: GHOST_FRAGMENT,
        depthTest: true,
        depthWrite: false,
        depthFunc: THREE.GreaterDepth,
        blending: THREE.CustomBlending,
        blendEquation: THREE.AddEquation,
        blendSrc: THREE.SrcAlphaFactor,
        blendDst: THREE.OneMinusSrcAlphaFactor,
        transparent: false,
      });
      ghost = new THREE.InstancedMesh(geometry, ghostMaterial, capacity);
      ghost.instanceMatrix = mesh.instanceMatrix;
      ghost.count = 0;
      ghost.frustumCulled = false;
      ghost.renderOrder = ORDER_GHOST;
      ghost.name = "crowd-ghost-" + key;
      this.group.add(ghost);
    }
    return {
      key,
      mesh,
      outline,
      ghost,
      color,
      state,
      anim,
      look,
      clip,
      owner: new Int32Array(capacity).fill(-1),
      sizeM: [source.sizeM[0], source.sizeM[1], source.sizeM[2]],
      fit: source.fit ?? "stretch",
      clips: bones?.clips ?? null,
      count: 0,
      dirty: true,
    };
  }

  private disposeLayer(layer: Layer): void {
    layer.mesh.removeFromParent();
    layer.outline.removeFromParent();
    layer.ghost?.removeFromParent();
    layer.mesh.geometry.dispose();
    (layer.mesh.material as THREE.Material).dispose();
    (layer.outline.material as THREE.Material).dispose();
    (layer.ghost?.material as THREE.Material | undefined)?.dispose();
    layer.mesh.dispose();
  }

  isSkinned(key: string): boolean {
    return this.layers.get(key)?.clips != null;
  }

  defineLayer(key: string, source: CrowdLayerSource): void {
    if (source.animation.kind === "vat") {
      // Bones layers cover M0b; a vertex-animation texture stays a typed slot.
      throw new Error("crowd: vat layers are not built (M0b uses bones)");
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
      (layer.look.array as Float32Array).set(old.look.array as Float32Array);
      (layer.clip.array as Float32Array).set(old.clip.array as Float32Array);
      layer.owner.set(old.owner);
      layer.count = old.count;
      for (const rec of this.handles) if (rec !== null && rec.layer === old) rec.layer = layer;
      this.disposeLayer(old);
    }
    this.layers.set(key, layer);
  }

  add(shape: PlaceholderDef, gait: CrowdGait = "still", key?: string, look: CrowdLook = {}): number {
    const foe = look.foe ?? gait !== "still";
    // Default layer: the shape, ours apart from the foes (they draw before the foe ghosts).
    const layer = this.layerFor(key ?? (foe ? shape.shape : OUR_LAYER + shape.shape), shape.shape);
    if (layer.count >= this.capacity) return -1;
    const handle = this.freeHandles.length > 0 ? this.freeHandles.pop()! : this.handles.length;
    const index = layer.count;
    layer.count += 1;
    layer.owner[index] = handle;
    const k = look.scale ?? (gait === "still" ? 1 : this.characterScale);
    const [w, h, l] = shape.sizeM;
    const rec: HandleRec = { layer, index, w: w * k, h: h * k, l: l * k, hover: shape.hoverM, flyer: gait === "flyer", gx: 0, gy: 0, gz: 0, lift: shape.hoverM, dissolve: 0 };
    this.handles[handle] = rec;
    const color = this.colorScratch.set(shape.color);
    const c = layer.color.array as Float32Array;
    c[index * 3] = color.r;
    c[index * 3 + 1] = color.g;
    c[index * 3 + 2] = color.b;
    const s = layer.state.array as Float32Array;
    s.fill(0, index * 4, index * 4 + 4);
    const a = layer.anim.array as Float32Array;
    a[index * 4] = GAIT_ID[gait] + (foe ? 8 : 0);
    a[index * 4 + 1] = this.nextPhase();
    a[index * 4 + 2] = 1;
    a[index * 4 + 3] = 0;
    const o = layer.look.array as Float32Array;
    o[index * 4] = look.outline ?? (gait === "still" ? 0.6 : 1);
    o[index * 4 + 1] = look.rim ?? (foe ? 0.6 : 0.35);
    o[index * 4 + 2] = look.ash ?? 0.14;
    o[index * 4 + 3] = look.wash ?? 0;
    (layer.clip.array as Float32Array).fill(0, index * 4, index * 4 + 4);
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
      copyItem(layer.look.array as Float32Array, 4, last, index);
      copyItem(layer.clip.array as Float32Array, 4, last, index);
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
    if (layer.fit === "stretch") this.scaleV.set((rec.w / sw) * widen * extra, (rec.h / sh) * squash * extra, (rec.l / sl) * widen * extra);
    else {
      // The owner's model keeps its proportions: one scale from the placeholder's height or footprint.
      const k = layer.fit === "height" ? rec.h / sh : Math.max(rec.w, rec.l) / Math.max(sw, sl);
      this.scaleV.set(k * widen * extra, k * squash * extra, k * widen * extra);
    }
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
    const clips = layer.clips;
    if (clips !== null && clips.length > 0) {
      const c = layer.clip.array as Float32Array;
      // No clip given: the first clip runs on its own, each instance at its own phase (never a frozen statue).
      const first = clips[Math.min(clips.length - 1, Math.max(0, instance.clip ?? 0))]!;
      c[index * 4] = clipRow(first, instance.clip === undefined ? this.time.value + a[index * 4 + 1]! * 7 : (instance.clipTime ?? 0));
      const blend = instance.blend ?? 0;
      const second = clips[Math.min(clips.length - 1, Math.max(0, instance.clipB ?? 0))]!;
      c[index * 4 + 1] = blend > 0 ? clipRow(second, instance.clipTimeB ?? 0) : c[index * 4]!;
      c[index * 4 + 2] = blend;
    }
    rec.gx = instance.x + (instance.knockX ?? 0);
    rec.gy = instance.y;
    rec.gz = instance.z + (instance.knockZ ?? 0);
    rec.lift = lift;
    rec.dissolve = dissolve;
    layer.dirty = true;
  }

  setRings(rings: readonly CrowdRing[]): void {
    this.rings = rings;
  }

  prepare(shape: PlaceholderDef["shape"], key: string = shape): void {
    this.layerFor(key, shape);
  }

  /** Writes ground mark `n`; false when the batch is full. */
  private mark(n: number, x: number, y: number, z: number, size: number, alpha: number, kind: number, height = 0, color?: THREE.Color): boolean {
    if (n >= this.shadowCapacity) return false;
    this.shadowPos[n * 3] = x;
    this.shadowPos[n * 3 + 1] = y;
    this.shadowPos[n * 3 + 2] = z;
    this.shadowData[n * 4] = size;
    this.shadowData[n * 4 + 1] = alpha;
    this.shadowData[n * 4 + 2] = kind;
    this.shadowData[n * 4 + 3] = height;
    this.shadowColor[n * 3] = color?.r ?? 0;
    this.shadowColor[n * 3 + 1] = color?.g ?? 0;
    this.shadowColor[n * 3 + 2] = color?.b ?? 0;
    return true;
  }

  flush(timeS?: number): void {
    if (timeS !== undefined) this.time.value = timeS;
    for (const layer of this.layers.values()) {
      layer.mesh.count = layer.count;
      layer.outline.count = layer.count;
      if (layer.ghost !== null) layer.ghost.count = layer.count;
      if (!layer.dirty) continue;
      layer.dirty = false;
      layer.mesh.instanceMatrix.needsUpdate = true;
      layer.color.needsUpdate = true;
      layer.state.needsUpdate = true;
      layer.anim.needsUpdate = true;
      layer.look.needsUpdate = true;
      layer.clip.needsUpdate = true;
    }
    if (this.shadows === null) return;
    let n = 0;
    for (const rec of this.handles) {
      if (rec === null || rec === undefined) continue;
      const footprint = Math.max(rec.w, rec.l) * 1.1;
      const fade = 1 - rec.dissolve;
      if (rec.flyer && rec.lift > 0.6) {
        // A flyer: the spot and ring right under it, and a dashed tether up to its belly (05 §6.2 flyers read as up).
        if (this.mark(n, rec.gx, rec.gy + 0.05, rec.gz, footprint * 0.95, fade, 1)) n += 1;
        if (this.mark(n, rec.gx, rec.gy + 0.05, rec.gz, 0.12, 0.55 * fade, 2, rec.lift)) n += 1;
      } else if (this.mark(n, rec.gx, rec.gy + 0.04, rec.gz, footprint * (1 / (1 + rec.lift * 0.35) * 0.45 + 0.55), fade, 0)) {
        n += 1;
      }
    }
    const color = this.colorScratch;
    for (let k = 0; k < this.rings.length && k < RING_CAPACITY; k += 1) {
      const ring = this.rings[k]!;
      color.set(ring.color);
      if (this.mark(n, ring.x, ring.y + 0.05, ring.z, ring.radius * 2, ring.alpha, 3, 0, color)) n += 1;
    }
    const geometry = this.shadows.geometry;
    geometry.instanceCount = n;
    geometry.getAttribute("iPos").needsUpdate = true;
    geometry.getAttribute("iData").needsUpdate = true;
    geometry.getAttribute("iColor").needsUpdate = true;
  }

  /** Layer instance count (tests, bench). */
  layerCount(key: string): number {
    return this.layers.get(key)?.count ?? 0;
  }

  dispose(): void {
    for (const layer of this.layers.values()) this.disposeLayer(layer);
    this.layers.clear();
    if (this.shadows !== null) {
      this.shadows.geometry.dispose();
      this.shadows.material.dispose();
    }
    this.group.removeFromParent();
  }
}

/** Texture row (frame blend in the fraction) of a clip `seconds` in: a loop wraps, a one-shot holds its end. */
export function clipRow(info: CrowdClip, seconds: number): number {
  let f = seconds * info.fps;
  if (info.loop) {
    f %= info.frames;
    if (f < 0) f += info.frames;
  } else f = Math.min(Math.max(0, f), info.frames - 1e-4);
  return info.start + f;
}

function copyItem(array: Float32Array, size: number, from: number, to: number): void {
  for (let k = 0; k < size; k += 1) array[to * size + k] = array[from * size + k]!;
}

/** TINT_COLORS for tests and the legend. */
export const TINT_HEX: readonly string[] = TINT_COLORS;
