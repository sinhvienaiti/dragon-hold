/**
 * Layers of the layered VFX standard (docs/games/VFX_STANDARD.md §3.2) that the kit pools do not draw, built for
 * Sky Fire (§5.3 part 2) and reusable by the next effects: a ribbon in two looks (L1 fire, L4 dark smoke), mesh
 * shells (L13 a fire cone at the caster, L2 a hemispherical shockwave with a hot eroding rim, after the kit SHIELD
 * shader), velocity-stretched sparks (L8), instanced rocks that can float a moment before they fall and glowing
 * ember shards (L3, L5), a terrain-hugging fissure decal with cooling cracks (L6) and a rune circle (L13).
 * Everything is built once and pooled (no allocation in a wave); the crack mask is a Voronoi texture generated in
 * code (no media). Each pool is one draw call, hidden while empty. Owner: view-crowd-fx (LANES.md).
 */
import * as THREE from "three";
import { FLAME_FRAGMENT, FLAME_VERTEX } from "../kit/three";
import { FX_RIBBON_ORDER } from "./fx-palette";

// ── Shared GLSL ─────────────────────────────────────────────────────────────

/** Value noise, fbm and the fire ramp (our side: deep red → orange → gold → pale gold; never white, §3.5 rule 3). */
export const VFX_NOISE_GLSL = /* glsl */ `
float vxHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vxNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(vxHash(i), vxHash(i + vec2(1.0, 0.0)), u.x), mix(vxHash(i + vec2(0.0, 1.0)), vxHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float vxFbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * vxNoise(p);
    p = p * 2.03 + vec2(1.7, 9.2);
    a *= 0.5;
  }
  return v;
}
vec3 vxFire(float h) {
  vec3 c = mix(vec3(0.42, 0.03, 0.0), vec3(1.0, 0.28, 0.03), smoothstep(0.05, 0.4, h));
  c = mix(c, vec3(1.0, 0.62, 0.18), smoothstep(0.4, 0.78, h));
  return mix(c, vec3(1.0, 0.9, 0.62), smoothstep(0.85, 1.05, h));
}`;

// ── L1 / L4: ribbons ────────────────────────────────────────────────────────

/** A thin dark smoke band (L4, normal blend): noise-eroded wisps, drifting slowly back along the strip. */
const SMOKE_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uSeed;
uniform float uIntensity;
varying float vAlong;
varying float vSide;
varying float vAlpha;
${VFX_NOISE_GLSL}
void main() {
  float across = abs(vSide);
  float n = vxFbm(vec2(vAlong * 5.0 + uSeed - uTime * 0.7, vSide * 1.4 + uTime * 0.35));
  float body = 1.0 - smoothstep(0.25, 1.0, across + (n - 0.5) * 1.1);
  float wisps = smoothstep(0.25, 0.7, n + 0.2);
  vec3 color = mix(vec3(0.09, 0.075, 0.065), vec3(0.22, 0.19, 0.16), n);
  gl_FragColor = vec4(color, body * wisps * vAlpha * uIntensity * 0.75);
}`;

/**
 * A fire ribbon in normal blend (L1; round 4: the additive flame read pale cream on sunlit grass): a noise-torn body,
 * orange-gold along its hot middle near the head, red-orange out to a dark-red edge, gaps opening toward the tail.
 */
const FIRE_RIBBON_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uSeed;
uniform float uIntensity;
varying float vAlong;
varying float vSide;
varying float vAlpha;
${VFX_NOISE_GLSL}
void main() {
  float across = abs(vSide);
  float n = vxFbm(vec2(vAlong * 8.0 - uTime * 5.5 + uSeed, vSide * 2.2 + uTime * 1.3));
  // Round 5: edges eaten harder by the noise and the body narrowing toward the tail.
  float body = 1.0 - smoothstep(0.35, 1.0, across + (n - 0.5) * 1.15 + vAlong * 0.45);
  float heat = (1.0 - across * 0.8) * (1.0 - vAlong * 0.75) * (0.55 + n * 0.65);
  // Red-orange, gold only in a thin hot line near the head (the ramp's orange is pale peach once tone mapped).
  vec3 c = vxFire(min(heat * 0.62, 0.6));
  c = mix(c, vec3(0.16, 0.02, 0.005), smoothstep(0.5, 0.92, across + (n - 0.5) * 0.35) * 0.85);
  float a = clamp(body * 1.3, 0.0, 1.0) * vAlpha * uIntensity * smoothstep(0.12, 0.5, n + 0.5 * (1.0 - vAlong));
  gl_FragColor = vec4(c, clamp(a, 0.0, 1.0));
}`;

export type StreakLook = "flame" | "smoke" | "fire";

/**
 * A ribbon through points the caller lays along a flight (head first, so it bends with the arc however fast the head
 * flies). "flame": the kit's flame shader (FLAME_FRAGMENT: a noise-torn edge, tongues scrolling back), additive,
 * swelling just behind the head then a long taper. "smoke": a dark band (normal blend) that starts a little behind the
 * head and widens toward its tail, drawn just before the fire (dark behind the bright, §3.5 rule 4).
 * Source: kit three/particles.ts LightTrail.
 */
export class Streak {
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  readonly points: THREE.Vector3[];
  private readonly position: Float32Array;
  private readonly alpha: Float32Array;
  private readonly tangent = new THREE.Vector3();
  private readonly toEye = new THREE.Vector3();
  private readonly side = new THREE.Vector3();

  constructor(readonly count: number, seed: number, readonly look: StreakLook = "flame") {
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
    const flame = look === "flame";
    const material = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uSeed: { value: seed }, uIntensity: { value: 1 } },
      vertexShader: FLAME_VERTEX,
      fragmentShader: flame ? FLAME_FRAGMENT : look === "fire" ? FIRE_RIBBON_FRAGMENT : SMOKE_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: flame ? THREE.AdditiveBlending : THREE.NormalBlending,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.frustumCulled = false;
    // After the river (view/water.ts, transparent at order 2): at the same order the sort could draw the water
    // over the fire wherever the bolt crossed it on screen (28/10 capture: the ribbon went out over the river).
    // The smoke goes just before the fire.
    this.mesh.renderOrder = look === "smoke" ? FX_RIBBON_ORDER - 0.1 : FX_RIBBON_ORDER;
    this.mesh.visible = false;
  }

  /** Draws the strip through `points` (head first): `width` near the head, shaped by the look. */
  update(eye: THREE.Vector3, width: number, intensity: number, time: number): void {
    this.mesh.visible = intensity > 0.001;
    if (!this.mesh.visible) return;
    const n = this.count;
    // Fire and flame share the shape: a swell just behind the head, then a long taper.
    const flame = this.look !== "smoke";
    for (let i = 0; i < n; i += 1) {
      const point = this.points[i]!;
      this.tangent.subVectors(this.points[Math.max(0, i - 1)]!, this.points[Math.min(n - 1, i + 1)]!);
      if (this.tangent.lengthSq() < 1e-8) this.tangent.set(0, 0, 1);
      this.toEye.subVectors(eye, point);
      this.side.crossVectors(this.tangent, this.toEye);
      if (this.side.lengthSq() < 1e-10) this.side.set(1, 0, 0);
      const k = i / (n - 1);
      // Fire swells just behind the head, then a long taper (the flame shader tears the edge); smoke widens back.
      const w = flame ? width * Math.min(1, 0.45 + k * 5) * (1 - k) ** 0.75 : width * (0.3 + 0.9 * k);
      this.side.normalize().multiplyScalar(w);
      const o = i * 6;
      this.position[o] = point.x - this.side.x;
      this.position[o + 1] = point.y - this.side.y;
      this.position[o + 2] = point.z - this.side.z;
      this.position[o + 3] = point.x + this.side.x;
      this.position[o + 4] = point.y + this.side.y;
      this.position[o + 5] = point.z + this.side.z;
      // Fire holds its alpha further back (a trail seen over most of the flight); smoke comes in behind the head.
      const alpha = this.look === "fire" ? (1 - k) ** 0.7 : flame ? (1 - k) ** 1.1 : Math.min(1, k / 0.18) * (1 - k) ** 0.9;
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

// ── L13 / L2: shells ─────────────────────────────────────────────────────────

const SHELL_VERTEX = /* glsl */ `
varying vec2 vUv;
varying vec3 vLocal;
varying vec3 vN;
varying vec3 vE;
void main() {
  vUv = uv;
  vLocal = position;
  vec4 view = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vE = normalize(-view.xyz);
  gl_Position = projectionMatrix * view;
}`;

/**
 * A short cone of fire at the caster (L13, normal blend so it reads as fire on the sunlit dais): noise streams out
 * along it, hottest at the mouth, eaten from the open end inward as it ages (uAge 0 → 1).
 */
const CONE_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uAge;
uniform float uSeed;
uniform float uAlpha;
varying vec2 vUv;
varying vec3 vLocal;
varying vec3 vN;
varying vec3 vE;
${VFX_NOISE_GLSL}
void main() {
  float along = vUv.y;
  float facing = abs(dot(normalize(vN), normalize(vE)));
  float n = vxFbm(vec2(vUv.x * 7.0 + uSeed, along * 2.6 - uTime * 9.0));
  float tongues = vxFbm(vec2(vUv.x * 13.0 - uSeed, along * 5.0 - uTime * 14.0));
  // Round 3 (capture: a smooth pale wedge): torn harder into tongues, and cooler, so it is orange and red with gold
  // only at the mouth.
  float erode = n * 1.05 + tongues * 0.5 - along * 1.0 - uAge * 1.1 + 0.3;
  float body = smoothstep(0.0, 0.16, erode) * (0.35 + 0.65 * pow(facing, 0.7));
  // Round 5 (judge 4: a flat orange plate): gold at the root, orange, red toward the tip (vxFire's whole ramp).
  float heat = clamp((1.0 - along * 0.95) * (0.5 + n * 0.7) * 0.85 - uAge * 0.35, 0.0, 1.0);
  gl_FragColor = vec4(vxFire(heat) * (1.0 + heat * 0.5), body * uAlpha);
}`;

/**
 * A hemispherical shockwave (L2; after the kit SHIELD shader's fresnel rim): bright at its silhouette and its foot,
 * a faint fill; holes open from the top down as it ages (uAge 0 → 1) with a hot rim at their edge. Additive.
 */
const DOME_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uAge;
uniform float uSeed;
uniform float uAlpha;
uniform vec3 uHot;
uniform vec3 uBody;
varying vec2 vUv;
varying vec3 vLocal;
varying vec3 vN;
varying vec3 vE;
${VFX_NOISE_GLSL}
void main() {
  float facing = abs(dot(normalize(vN), normalize(vE)));
  // Round 3: a thicker, brighter rim (the play camera looks down on it: its silhouette is the ring that reads).
  float rim = pow(1.0 - facing, 1.6);
  vec3 d = normalize(vLocal);
  float n = vxFbm(vec2(atan(d.z, d.x) * 2.2 + uSeed, d.y * 3.5 - uTime * 1.8));
  float front = n + (1.0 - d.y) * 0.45 - uAge * 1.15 + 0.05;
  if (front < 0.0) discard;
  float hotEdge = 1.0 - smoothstep(0.0, 0.1, front);
  float foot = 1.0 - smoothstep(0.0, 0.3, d.y);
  vec3 color = uBody * (0.06 + rim * 1.5 + foot * 0.45) + uHot * (hotEdge * 1.8 + rim * foot * 0.7);
  gl_FragColor = vec4(color, uAlpha);
}`;

export type ShellKind = "cone" | "dome";

interface ShellSlot {
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  /** Seconds of age as drawn (read before it advances, VFX_STANDARD §3.1 rule 5); < 0: born later. */
  age: number;
  life: number;
  hold: number;
  /** Cone: length and radius at full size (m). Dome: radius at full size (m) and how long it takes to get there. */
  a: number;
  b: number;
  grow: number;
  alpha: number;
  active: boolean;
}

/**
 * Mesh shells, a few of each kind (§3.7 High: ≤ 8 at once). A cone sits with its apex at a point and opens along a
 * direction; a dome stands on the ground and grows from 0 to its radius (ease-out), then dissolves.
 */
export class ShellPool {
  readonly group = new THREE.Group();
  private readonly slots: ShellSlot[] = [];
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly dir = new THREE.Vector3();
  private time = 0;

  constructor(readonly kind: ShellKind, capacity: number) {
    const geometry =
      kind === "cone"
        ? // Apex (radius 0.08) at y 0, open end (radius 1) at y 1: uv.y runs 0 at the apex to 1 at the open end.
          new THREE.CylinderGeometry(1, 0.08, 1, 20, 6, true).translate(0, 0.5, 0)
        : new THREE.SphereGeometry(1, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    for (let i = 0; i < capacity; i += 1) {
      const material = new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uAge: { value: 0 },
          uSeed: { value: i * 3.7 + 1.3 },
          uAlpha: { value: 0 },
          uHot: { value: new THREE.Color("#ffd27a").multiplyScalar(1.6) },
          uBody: { value: new THREE.Color("#ff7a32").multiplyScalar(1.1) },
        },
        vertexShader: SHELL_VERTEX,
        fragmentShader: kind === "cone" ? CONE_FRAGMENT : DOME_FRAGMENT,
        transparent: true,
        depthWrite: false,
        blending: kind === "cone" ? THREE.NormalBlending : THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.frustumCulled = false;
      mesh.visible = false;
      mesh.renderOrder = kind === "cone" ? 5.5 : 4.5;
      this.group.add(mesh);
      this.slots.push({ mesh, age: 0, life: 0, hold: 0, a: 1, b: 1, grow: 1, alpha: 1, active: false });
    }
  }

  get live(): number {
    let n = 0;
    for (const slot of this.slots) if (slot.active) n += 1;
    return n;
  }

  private take(): ShellSlot {
    let best = this.slots[0]!;
    for (const slot of this.slots) {
      if (!slot.active) return slot;
      if (slot.age > best.age) best = slot;
    }
    return best;
  }

  /**
   * A cone with its apex at `at`, opening along `dir`: `length` and end `radius` (m), full for `hold` s from the frame
   * it is born, eaten away by `life` s; it stretches 35 % over its life.
   */
  cone(at: THREE.Vector3, dir: THREE.Vector3, length: number, radius: number, life: number, hold: number, alpha = 1): void {
    const slot = this.take();
    slot.active = true;
    slot.age = 0;
    slot.life = life;
    slot.hold = hold;
    slot.a = length;
    slot.b = radius;
    slot.alpha = alpha;
    slot.mesh.position.copy(at);
    slot.mesh.quaternion.setFromUnitVectors(this.up, this.dir.copy(dir).normalize());
  }

  /** A dome on the ground at `at`: 0 → `radius` m over `grow` s (ease-out), gone by `life` s; born `delay` s later. */
  dome(at: THREE.Vector3, radius: number, grow: number, life: number, alpha = 1, delay = 0): void {
    const slot = this.take();
    slot.active = true;
    slot.age = -delay;
    slot.life = life;
    slot.grow = grow;
    slot.a = radius;
    slot.alpha = alpha;
    slot.mesh.position.copy(at);
    slot.mesh.quaternion.identity();
  }

  /** The widest dome as drawn this frame (m; captures: the hit radius against the rule). */
  domeRadius = 0;

  /** Draws each shell at its age, then ages it. */
  update(dt: number): void {
    this.time += dt;
    this.domeRadius = 0;
    for (const slot of this.slots) {
      if (!slot.active) continue;
      const age = slot.age;
      slot.age += dt;
      if (age >= slot.life) {
        slot.active = false;
        slot.mesh.visible = false;
        continue;
      }
      if (age < 0) {
        slot.mesh.visible = false;
        continue;
      }
      const u = slot.mesh.material.uniforms;
      u.uTime!.value = this.time;
      slot.mesh.visible = true;
      if (this.kind === "cone") {
        const k = Math.max(0, (age - slot.hold) / Math.max(1e-3, slot.life - slot.hold));
        u.uAge!.value = k;
        u.uAlpha!.value = slot.alpha * (1 - k * k);
        const stretch = 1 + 0.35 * k;
        slot.mesh.scale.set(slot.b * (1 + 0.2 * k), slot.a * stretch, slot.b * (1 + 0.2 * k));
      } else {
        const g = Math.min(1, age / Math.max(1e-3, slot.grow));
        const r = slot.a * (1 - (1 - g) ** 2.4);
        const k = age / slot.life;
        u.uAge!.value = k;
        u.uAlpha!.value = slot.alpha * (1 - Math.max(0, (k - 0.55) / 0.45)) ** 1.5;
        // A little lower than a half sphere: at the play camera's 55° a full one hides the blast under its cap.
        slot.mesh.scale.set(Math.max(0.01, r), Math.max(0.01, r * 0.82), Math.max(0.01, r));
        this.domeRadius = Math.max(this.domeRadius, r);
      }
    }
  }

  clear(): void {
    for (const slot of this.slots) {
      slot.active = false;
      slot.mesh.visible = false;
    }
  }

  dispose(): void {
    this.group.removeFromParent();
    this.slots[0]?.mesh.geometry.dispose();
    for (const slot of this.slots) slot.mesh.material.dispose();
  }
}

// ── L8: velocity-stretched sparks ───────────────────────────────────────────

const STREAK_VERTEX = /* glsl */ `
attribute vec3 iPos;
attribute vec3 iVel;
attribute vec4 iColor;
attribute vec2 iSize;
varying vec2 vUv;
varying vec4 vColor;
void main() {
  vUv = uv;
  vColor = iColor;
  vec4 head = viewMatrix * vec4(iPos, 1.0);
  vec4 tail = viewMatrix * vec4(iPos - iVel * iSize.y, 1.0);
  vec2 d = head.xy - tail.xy;
  float len = length(d);
  vec2 dir = len > 1e-4 ? d / len : vec2(0.0, 1.0);
  vec2 side = vec2(-dir.y, dir.x);
  float t = position.y + 0.5;
  vec4 p = mix(tail, head, t);
  // Round the ends a little past head and tail.
  p.xy += dir * (t - 0.5) * iSize.x;
  p.xy += side * position.x * iSize.x;
  gl_Position = projectionMatrix * p;
}`;

const STREAK_FRAGMENT = /* glsl */ `
varying vec2 vUv;
varying vec4 vColor;
void main() {
  if (vColor.a <= 0.0) discard;
  float across = abs(vUv.x - 0.5) * 2.0;
  float body = (1.0 - across * across) * smoothstep(0.0, 0.45, vUv.y);
  float hot = smoothstep(0.55, 1.0, vUv.y) * (1.0 - across);
  gl_FragColor = vec4(vColor.rgb * (body + hot * 1.4) * vColor.a, 1.0);
}`;

/**
 * Sparks drawn as streaks along their velocity (L8, additive, HDR colour): a hot round head and a tail as long as
 * `stretch` seconds of travel. One draw call; CPU-simulated with drag and gravity.
 */
export class StreakSparks {
  readonly mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  private readonly iPos: Float32Array;
  private readonly iVel: Float32Array;
  private readonly iColor: Float32Array;
  private readonly iSize: Float32Array;
  private readonly pos: Float32Array;
  private readonly vel: Float32Array;
  private readonly col: Float32Array;
  private readonly width: Float32Array;
  private readonly stretch: Float32Array;
  private readonly life: Float32Array;
  private readonly total: Float32Array;
  private readonly drag: Float32Array;
  private readonly gravity: Float32Array;
  private cursor = 0;
  live = 0;

  constructor(readonly capacity: number) {
    const f = (n: number): Float32Array => new Float32Array(capacity * n);
    this.iPos = f(3);
    this.iVel = f(3);
    this.iColor = f(4);
    this.iSize = f(2);
    this.pos = f(3);
    this.vel = f(3);
    this.col = f(3);
    this.width = f(1);
    this.stretch = f(1);
    this.life = f(1);
    this.total = f(1);
    this.drag = f(1);
    this.gravity = f(1);
    const base = new THREE.PlaneGeometry(1, 1);
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.index = base.index;
    geometry.setAttribute("position", base.getAttribute("position"));
    geometry.setAttribute("uv", base.getAttribute("uv"));
    geometry.setAttribute("iPos", new THREE.InstancedBufferAttribute(this.iPos, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute("iVel", new THREE.InstancedBufferAttribute(this.iVel, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute("iColor", new THREE.InstancedBufferAttribute(this.iColor, 4).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute("iSize", new THREE.InstancedBufferAttribute(this.iSize, 2).setUsage(THREE.DynamicDrawUsage));
    geometry.instanceCount = 0;
    // Double-sided: the quad is laid along (side, dir) with side = dir turned +90°, which mirrors the plane's winding
    // (det −1), so front-face culling dropped every streak (round 3 capture: none drawn).
    const material = new THREE.ShaderMaterial({ vertexShader: STREAK_VERTEX, fragmentShader: STREAK_FRAGMENT, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    this.mesh.visible = false;
  }

  /** One streak at `at` with velocity `v` (m/s): `color` × `intensity` (HDR), `width` m, a tail `stretch` s long. */
  spawn(at: THREE.Vector3, v: THREE.Vector3, color: THREE.Color, intensity: number, width: number, stretch: number, life: number, drag = 2.5, gravity = 9): void {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.capacity;
    this.pos.set([at.x, at.y, at.z], i * 3);
    this.vel.set([v.x, v.y, v.z], i * 3);
    this.col.set([color.r * intensity, color.g * intensity, color.b * intensity], i * 3);
    this.width[i] = width;
    this.stretch[i] = stretch;
    this.life[i] = life;
    this.total[i] = life;
    this.drag[i] = drag;
    this.gravity[i] = gravity;
  }

  /** Draws each streak at its age (a new one at full brightness on its first frame), then moves it by `dt`. */
  update(dt: number): void {
    let n = 0;
    for (let i = 0; i < this.capacity; i += 1) {
      const life = this.life[i]!;
      if (life <= 0) continue;
      const k = 1 - life / this.total[i]!;
      const o = i * 3;
      this.iPos.set([this.pos[o]!, this.pos[o + 1]!, this.pos[o + 2]!], n * 3);
      this.iVel.set([this.vel[o]!, this.vel[o + 1]!, this.vel[o + 2]!], n * 3);
      const fade = (1 - k) ** 1.4;
      this.iColor.set([this.col[o]!, this.col[o + 1]!, this.col[o + 2]!, fade], n * 4);
      this.iSize[n * 2] = this.width[i]! * (1 - 0.4 * k);
      this.iSize[n * 2 + 1] = this.stretch[i]!;
      n += 1;
      // Then advance.
      const keep = Math.exp(-this.drag[i]! * dt);
      this.vel[o] = this.vel[o]! * keep;
      this.vel[o + 1] = this.vel[o + 1]! * keep - this.gravity[i]! * dt;
      this.vel[o + 2] = this.vel[o + 2]! * keep;
      this.pos[o] = this.pos[o]! + this.vel[o]! * dt;
      this.pos[o + 1] = this.pos[o + 1]! + this.vel[o + 1]! * dt;
      this.pos[o + 2] = this.pos[o + 2]! + this.vel[o + 2]! * dt;
      this.life[i] = life - dt;
    }
    this.live = n;
    const geometry = this.mesh.geometry;
    geometry.instanceCount = n;
    this.mesh.visible = n > 0;
    if (n === 0) return;
    geometry.getAttribute("iPos").needsUpdate = true;
    geometry.getAttribute("iVel").needsUpdate = true;
    geometry.getAttribute("iColor").needsUpdate = true;
    geometry.getAttribute("iSize").needsUpdate = true;
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

// ── L3 / L5: rocks and ember shards ─────────────────────────────────────────

/** A rock: an icosahedron with its corners pushed in and out by a seeded draw (flat faces). Built once. */
export function rockGeometry(seed = 9): THREE.BufferGeometry {
  const geometry = new THREE.IcosahedronGeometry(0.5, 0);
  const position = geometry.getAttribute("position") as THREE.BufferAttribute;
  let state = seed;
  const random = (): number => (state = (state * 16807) % 2147483647) / 2147483647;
  const offsets = new Map<string, number>();
  for (let i = 0; i < position.count; i += 1) {
    const key = position.getX(i).toFixed(3) + "," + position.getY(i).toFixed(3) + "," + position.getZ(i).toFixed(3);
    let k = offsets.get(key);
    if (k === undefined) {
      k = 0.72 + random() * 0.5;
      offsets.set(key, k);
    }
    position.setXYZ(i, position.getX(i) * k, position.getY(i) * k * 0.8, position.getZ(i) * k);
  }
  geometry.computeVertexNormals();
  return geometry;
}

/** A long ember shard (bipyramid). */
export function shardGeometry(): THREE.BufferGeometry {
  return new THREE.OctahedronGeometry(0.5, 0).scale(0.36, 1, 0.36);
}

const SHARD_VERTEX = /* glsl */ `
varying vec3 vHeat;
varying vec3 vN;
varying vec3 vE;
void main() {
  mat4 m = modelMatrix;
  #ifdef USE_INSTANCING
  m = modelMatrix * instanceMatrix;
  #endif
  vec4 world = m * vec4(position, 1.0);
  vec4 view = viewMatrix * world;
  vN = normalize(mat3(viewMatrix) * mat3(m) * normal);
  vE = normalize(-view.xyz);
  vHeat = vec3(1.0);
  #ifdef USE_INSTANCING_COLOR
  vHeat = instanceColor;
  #endif
  gl_Position = projectionMatrix * view;
}`;

// Charred faces with the heat glowing at the edges (L5 "cạnh phát sáng"); the heat colour cools to black on the CPU.
const SHARD_FRAGMENT = /* glsl */ `
varying vec3 vHeat;
varying vec3 vN;
varying vec3 vE;
void main() {
  float facing = abs(dot(normalize(vN), normalize(vE)));
  float rim = pow(1.0 - facing, 1.4);
  vec3 charred = vec3(0.075, 0.055, 0.045) * (0.7 + 0.5 * abs(normalize(vN).y));
  gl_FragColor = vec4(charred + vHeat * (0.3 + 1.5 * rim), 1.0);
}`;

/** An ember shard's heat ramp (linear, HDR). */
const HEAT_GOLD = [2.2, 1.25, 0.45] as const;
const HEAT_ORANGE = [1.8, 0.55, 0.08] as const;
const HEAT_RED = [0.55, 0.06, 0.01] as const;
const HEAT_BLACK = [0, 0, 0] as const;

export interface ShardOptions {
  /** Hover this long (s) after a short rise before falling (L3 "floating earth debris"); 0: thrown at once. */
  hover?: number;
  /** An ember shard: glows `heat` (0–1) and cools over `coolS`; rocks keep their colour. */
  heat?: number;
  coolS?: number;
}

/**
 * Instanced shards thrown from a blast: they fly an arc, bounce once or twice, lie for `restS`, then shrink away
 * over `fadeS`. A floating one rises a little, hangs for its hover time turning slowly, then falls. Ember shards
 * cool from a hot orange to black. One draw call; the ring pool's oldest shard makes room.
 */
export class ShardPool {
  readonly mesh: THREE.InstancedMesh;
  private readonly p: Float32Array;
  private readonly v: Float32Array;
  private readonly rot: Float32Array;
  private readonly spin: Float32Array;
  private readonly scale: Float32Array;
  private readonly age: Float32Array;
  private readonly hover: Float32Array;
  private readonly heat: Float32Array;
  private readonly cool: Float32Array;
  private readonly floor: Float32Array;
  private readonly state: Uint8Array;
  private readonly base: Float32Array;
  private cursor = 0;
  private readonly matrix = new THREE.Matrix4();
  private readonly quat = new THREE.Quaternion();
  private readonly euler = new THREE.Euler();
  private readonly at = new THREE.Vector3();
  private readonly size = new THREE.Vector3();
  private readonly color = new THREE.Color();
  live = 0;

  constructor(
    readonly capacity: number,
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    private readonly heightAt: (x: number, z: number) => number,
    private readonly restS = 6,
    private readonly fadeS = 0.7,
    readonly glowing = false,
  ) {
    this.mesh = new THREE.InstancedMesh(geometry, material, capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    const f = (n = 1): Float32Array => new Float32Array(capacity * n);
    this.p = f(3);
    this.v = f(3);
    this.rot = f(3);
    this.spin = f(3);
    this.scale = f(3);
    this.age = f();
    this.hover = f();
    this.heat = f();
    this.cool = f();
    this.floor = f();
    this.base = f(3);
    // 0 dead, 1 rising (floaters), 2 hanging, 3 flying, 4 lying.
    this.state = new Uint8Array(capacity);
  }

  /** One shard at `at`, velocity `v` (m/s), `size` m (× a seeded aspect `aspect`), base colour `color`. */
  throw(at: THREE.Vector3, v: THREE.Vector3, size: number, aspect: THREE.Vector3, spin: THREE.Vector3, color: THREE.Color, options: ShardOptions = {}): void {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.capacity;
    if (this.state[i] === 0) this.live += 1;
    const o = i * 3;
    this.p.set([at.x, at.y, at.z], o);
    this.v.set([v.x, v.y, v.z], o);
    this.rot.set([spin.x * 0.1, spin.y * 0.1, spin.z * 0.1], o);
    this.spin.set([spin.x, spin.y, spin.z], o);
    this.scale.set([size * aspect.x, size * aspect.y, size * aspect.z], o);
    this.base.set([color.r, color.g, color.b], o);
    this.age[i] = 0;
    this.hover[i] = options.hover ?? 0;
    this.heat[i] = options.heat ?? 0;
    this.cool[i] = options.coolS ?? 1;
    this.state[i] = (options.hover ?? 0) > 0 ? 1 : 3;
    this.floor[i] = this.heightAt(at.x, at.z);
  }

  /** Ember heat (0–1) → glow colour (linear, HDR): pale gold, orange, deep red, black. */
  private heatColor(h: number, out: THREE.Color): THREE.Color {
    const mix = (a: readonly number[], b: readonly number[], t: number): THREE.Color => out.setRGB(a[0]! + (b[0]! - a[0]!) * t, a[1]! + (b[1]! - a[1]!) * t, a[2]! + (b[2]! - a[2]!) * t);
    if (h > 0.66) return mix(HEAT_GOLD, HEAT_ORANGE, (1 - h) / 0.34);
    if (h > 0.33) return mix(HEAT_ORANGE, HEAT_RED, (0.66 - h) / 0.33);
    return mix(HEAT_BLACK, HEAT_RED, h / 0.33);
  }

  update(dt: number): void {
    let top = 0;
    let colors = false;
    const gravity = 22;
    for (let i = 0; i < this.capacity; i += 1) {
      const s = this.state[i]!;
      if (s === 0) continue;
      const o = i * 3;
      const age = this.age[i]!;
      this.age[i] = age + dt;
      if (s === 4 && age >= this.restS + this.fadeS) {
        this.state[i] = 0;
        this.live -= 1;
        this.matrix.makeScale(0, 0, 0);
        this.mesh.setMatrixAt(i, this.matrix);
        continue;
      }
      top = i + 1;
      if (s === 1) {
        // Rising: slows to a stop in ~0.2 s, then hangs.
        const keep = Math.exp(-7 * dt);
        this.v[o] = this.v[o]! * keep;
        this.v[o + 1] = this.v[o + 1]! * keep;
        this.v[o + 2] = this.v[o + 2]! * keep;
        if (Math.abs(this.v[o + 1]!) < 0.35) {
          this.state[i] = 2;
          this.v[o + 1] = 0;
        }
      } else if (s === 2) {
        this.hover[i] = this.hover[i]! - dt;
        this.v[o + 1] = Math.sin(age * 11) * 0.12;
        if (this.hover[i]! <= 0) {
          this.state[i] = 3;
          this.v[o + 1] = 0.6;
        }
      } else if (s === 3) {
        this.v[o + 1] = this.v[o + 1]! - gravity * dt;
      }
      if (s !== 4) {
        this.p[o] = this.p[o]! + this.v[o]! * dt;
        this.p[o + 1] = this.p[o + 1]! + this.v[o + 1]! * dt;
        this.p[o + 2] = this.p[o + 2]! + this.v[o + 2]! * dt;
        const spinK = s === 2 ? 0.25 : 1;
        this.rot[o] = this.rot[o]! + this.spin[o]! * dt * spinK;
        this.rot[o + 1] = this.rot[o + 1]! + this.spin[o + 1]! * dt * spinK;
        this.rot[o + 2] = this.rot[o + 2]! + this.spin[o + 2]! * dt * spinK;
        if (s === 3) {
          const floor = this.heightAt(this.p[o]!, this.p[o + 2]!) + this.scale[o + 1]! * 0.25;
          if (this.p[o + 1]! < floor) {
            this.p[o + 1] = floor;
            if (Math.abs(this.v[o + 1]!) > 2.5) {
              this.v[o + 1] = -this.v[o + 1]! * 0.3;
              this.v[o] = this.v[o]! * 0.5;
              this.v[o + 2] = this.v[o + 2]! * 0.5;
              this.spin[o] = this.spin[o]! * 0.4;
              this.spin[o + 2] = this.spin[o + 2]! * 0.4;
            } else {
              this.state[i] = 4;
              // Lie on a side: drop the tilt toward a flat rest.
              this.rot[o] = Math.round(this.rot[o]! / Math.PI) * Math.PI + 0.25;
              this.rot[o + 2] = Math.round(this.rot[o + 2]! / Math.PI) * Math.PI;
            }
          }
        }
      }
      const fade = this.state[i] === 4 && age > this.restS ? Math.max(0, 1 - (age - this.restS) / this.fadeS) : 1;
      this.euler.set(this.rot[o]!, this.rot[o + 1]!, this.rot[o + 2]!);
      this.quat.setFromEuler(this.euler);
      this.size.set(this.scale[o]! * fade, this.scale[o + 1]! * fade, this.scale[o + 2]! * fade);
      this.matrix.compose(this.at.set(this.p[o]!, this.p[o + 1]!, this.p[o + 2]!), this.quat, this.size);
      this.mesh.setMatrixAt(i, this.matrix);
      if (this.glowing) {
        const h = this.heat[i]! * Math.exp(-age / Math.max(0.05, this.cool[i]!));
        this.heatColor(h, this.color);
        this.mesh.setColorAt(i, this.color);
        colors = true;
      } else if (age === 0) {
        this.mesh.setColorAt(i, this.color.setRGB(this.base[o]!, this.base[o + 1]!, this.base[o + 2]!));
        colors = true;
      }
    }
    this.mesh.count = top;
    this.mesh.visible = top > 0;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (colors && this.mesh.instanceColor !== null) this.mesh.instanceColor.needsUpdate = true;
  }

  clear(): void {
    this.state.fill(0);
    this.live = 0;
    this.mesh.count = 0;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.dispose();
  }
}

/** Material of the ember shards (charred faces, glowing edges). */
export function shardMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({ vertexShader: SHARD_VERTEX, fragmentShader: SHARD_FRAGMENT });
}

// ── L6: the fissure decal and its crack mask ────────────────────────────────

let crackTexture: THREE.DataTexture | null = null;

/**
 * The crack mask (Voronoi, generated in code; a stand-in until an approved image, VFX_STANDARD §4.4), 256²: R the
 * cracks (the edges of Voronoi cells laid in rings round the centre, small cells in the middle, plus six wobbly radial
 * cracks), G a soft halo round them (the glow of a hot crack), B value noise (ragged scorch edge, colour variation).
 */
export function crackMask(size = 256): THREE.DataTexture {
  if (crackTexture !== null) return crackTexture;
  let state = 20261028;
  const random = (): number => (state = (state * 16807) % 2147483647) / 2147483647;
  const seeds: number[] = [];
  const rings: readonly (readonly [number, number])[] = [[0.0, 1], [0.13, 5], [0.28, 7], [0.45, 9], [0.64, 11], [0.86, 13]];
  for (const [radius, count] of rings) {
    const turn = random() * Math.PI * 2;
    for (let i = 0; i < count; i += 1) {
      const a = turn + (i / count) * Math.PI * 2 + (random() - 0.5) * 0.5;
      const r = radius * (0.85 + random() * 0.3);
      seeds.push(Math.cos(a) * r, Math.sin(a) * r);
    }
  }
  const radials = Array.from({ length: 6 }, (_, i) => (i / 6) * Math.PI * 2 + (random() - 0.5) * 0.6);
  // Value noise on a 16² lattice (for B).
  const lattice = Array.from({ length: 17 * 17 }, () => random());
  const valueNoise = (x: number, y: number): number => {
    const gx = Math.min(15.999, x * 16);
    const gy = Math.min(15.999, y * 16);
    const ix = Math.floor(gx);
    const iy = Math.floor(gy);
    const fx = gx - ix;
    const fy = gy - iy;
    const ux = fx * fx * (3 - 2 * fx);
    const uy = fy * fy * (3 - 2 * fy);
    const at = (a: number, b: number): number => lattice[b * 17 + a]!;
    return (at(ix, iy) * (1 - ux) + at(ix + 1, iy) * ux) * (1 - uy) + (at(ix, iy + 1) * (1 - ux) + at(ix + 1, iy + 1) * ux) * uy;
  };
  const smooth = (a: number, b: number, x: number): number => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const px = (x + 0.5) / size * 2 - 1;
      const py = (y + 0.5) / size * 2 - 1;
      const r = Math.hypot(px, py);
      let f1 = 9;
      let f2 = 9;
      for (let s = 0; s < seeds.length; s += 2) {
        const d = Math.hypot(px - seeds[s]!, py - seeds[s + 1]!);
        if (d < f1) {
          f2 = f1;
          f1 = d;
        } else if (d < f2) f2 = d;
      }
      const edge = f2 - f1;
      const n = 0.6 * valueNoise((px + 1) / 2, (py + 1) / 2) + 0.4 * valueNoise(((px + 1) / 2 * 2.7) % 1, ((py + 1) / 2 * 2.7) % 1);
      // Thin cracks, a little wider near the middle; broken here and there by the noise.
      const width = 0.022 * (1.25 - 0.6 * r);
      let crack = 1 - smooth(0, width, edge);
      crack *= smooth(0.25, 0.45, n + 0.15);
      // Radial cracks from the centre out, wobbling.
      const angle = Math.atan2(py, px);
      for (const base of radials) {
        const wobble = base + 0.22 * Math.sin(r * 9 + base * 3);
        let da = Math.abs(angle - wobble);
        if (da > Math.PI) da = Math.PI * 2 - da;
        const dist = da * r;
        crack = Math.max(crack, (1 - smooth(0, 0.016 + 0.018 * (1 - r), dist)) * (1 - smooth(0.7, 1.0, r + (n - 0.5) * 0.3)));
      }
      crack *= 1 - smooth(0.82, 0.98, r);
      const halo = (1 - smooth(0, 0.08, edge)) * (1 - smooth(0.55, 0.95, r));
      const o = (y * size + x) * 4;
      data[o] = Math.round(crack * 255);
      data[o + 1] = Math.round(Math.max(halo, crack) * 255);
      data[o + 2] = Math.round(n * 255);
      data[o + 3] = 255;
    }
  }
  crackTexture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  crackTexture.magFilter = THREE.LinearFilter;
  crackTexture.minFilter = THREE.LinearMipmapLinearFilter;
  crackTexture.generateMipmaps = true;
  crackTexture.needsUpdate = true;
  return crackTexture;
}

const DECAL_VERTEX = /* glsl */ `
attribute float aDry;
varying vec2 vUv;
varying float vDry;
void main() {
  vUv = uv;
  vDry = aDry;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

/**
 * The fissure (L6): a dark scorch with a ragged edge and cracks that glow hot, cool to red over `uCool` seconds and
 * end as dark lines; the whole decal fades over its last seconds (uFade). Normal blend; the hot cracks are HDR.
 */
const FISSURE_FRAGMENT = /* glsl */ `
uniform sampler2D uMask;
uniform float uAge;
uniform float uCool;
uniform float uFade;
uniform float uRot;
varying vec2 vUv;
varying float vDry;
void main() {
  vec2 p = vUv - 0.5;
  float r = length(p) * 2.0;
  // Never on the river: the decal fades out over wet ground (aDry per vertex, from the host's water test).
  float dry = smoothstep(0.35, 0.85, vDry);
  if (r > 1.0 || uFade <= 0.0 || dry <= 0.0) discard;
  float c = cos(uRot);
  float s = sin(uRot);
  vec4 m = texture2D(uMask, vec2(c * p.x - s * p.y, s * p.x + c * p.y) + 0.5);
  float crack = m.r;
  float halo = m.g;
  float n = m.b;
  float edge = 0.74 + (n - 0.5) * 0.4;
  float scorch = 1.0 - smoothstep(edge * 0.5, edge, r);
  float cool = clamp(uAge / uCool, 0.0, 1.0);
  // Hot gold-orange, then red, then dark lines (cracks cool from their thin ends: the halo goes first).
  vec3 hot = mix(vec3(2.6, 1.15, 0.28), vec3(1.1, 0.16, 0.03), smoothstep(0.0, 0.55, cool));
  hot = mix(hot, vec3(0.05, 0.03, 0.02), smoothstep(0.55, 1.0, cool));
  float glow = halo * (1.0 - smoothstep(0.0, 0.6, cool)) * 0.55;
  vec3 base = vec3(0.105, 0.08, 0.062) * (0.75 + 0.5 * n);
  vec3 color = mix(base, hot, max(crack, glow));
  float alpha = max(scorch * (0.8 + 0.15 * n), max(crack, glow)) * uFade * dry;
  gl_FragColor = vec4(color, alpha);
}`;

interface DecalSlot {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  age: number;
  life: number;
  fadeS: number;
  active: boolean;
}

/**
 * Fissure decals that hug the ground: a grid laid on the terrain where it lands (heightAt per vertex), so a blast at
 * a ford or on a bank is not cut by the higher side. A few slots, the oldest makes room.
 */
export class FissurePool {
  readonly group = new THREE.Group();
  private readonly slots: DecalSlot[] = [];
  private readonly segments: number;

  constructor(capacity: number, private readonly heightAt: (x: number, z: number) => number, segments = 18, private readonly wetAt: (x: number, z: number) => boolean = () => false) {
    this.segments = segments;
    const mask = crackMask();
    for (let i = 0; i < capacity; i += 1) {
      const geometry = new THREE.PlaneGeometry(1, 1, segments, segments);
      (geometry.getAttribute("position") as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage);
      geometry.setAttribute("aDry", new THREE.BufferAttribute(new Float32Array((segments + 1) * (segments + 1)).fill(1), 1).setUsage(THREE.DynamicDrawUsage));
      const material = new THREE.ShaderMaterial({
        uniforms: { uMask: { value: mask }, uAge: { value: 0 }, uCool: { value: 1.5 }, uFade: { value: 0 }, uRot: { value: 0 } },
        vertexShader: DECAL_VERTEX,
        fragmentShader: FISSURE_FRAGMENT,
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -4,
        polygonOffsetUnits: -4,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.frustumCulled = false;
      mesh.visible = false;
      mesh.renderOrder = 2;
      this.group.add(mesh);
      this.slots.push({ mesh, age: 0, life: 0, fadeS: 0, active: false });
    }
  }

  get live(): number {
    let n = 0;
    for (const slot of this.slots) if (slot.active) n += 1;
    return n;
  }

  /** A fissure `radius` m round (x, z), turned `rot`: cracks cool over `coolS`, the decal fades out over its last `fadeS` of `life`. */
  spawn(x: number, z: number, radius: number, rot: number, life = 7, coolS = 1.5, fadeS = 2.2): void {
    let slot = this.slots.find((item) => !item.active);
    if (slot === undefined) slot = this.slots.reduce((a, b) => (b.age > a.age ? b : a));
    slot.active = true;
    slot.age = 0;
    slot.life = life;
    slot.fadeS = fadeS;
    const position = slot.mesh.geometry.getAttribute("position") as THREE.BufferAttribute;
    const dry = slot.mesh.geometry.getAttribute("aDry") as THREE.BufferAttribute;
    const n = this.segments + 1;
    const span = radius * 2;
    for (let j = 0; j < n; j += 1) {
      for (let i = 0; i < n; i += 1) {
        // PlaneGeometry rows run from +y (v = 1) down; u along x. Laid flat: x east, z south (v = 1 is north).
        const u = i / this.segments;
        const v = 1 - j / this.segments;
        const wx = x + (u - 0.5) * span;
        const wz = z - (v - 0.5) * span;
        position.setXYZ(j * n + i, wx, this.heightAt(wx, wz) + 0.07, wz);
        dry.setX(j * n + i, this.wetAt(wx, wz) ? 0 : 1);
      }
    }
    position.needsUpdate = true;
    dry.needsUpdate = true;
    const u = slot.mesh.material.uniforms;
    u.uRot!.value = rot;
    u.uCool!.value = coolS;
  }

  update(dt: number): void {
    for (const slot of this.slots) {
      if (!slot.active) continue;
      const age = slot.age;
      slot.age += dt;
      if (age >= slot.life) {
        slot.active = false;
        slot.mesh.visible = false;
        continue;
      }
      slot.mesh.visible = true;
      const u = slot.mesh.material.uniforms;
      u.uAge!.value = age;
      u.uFade!.value = Math.min(1, (slot.life - age) / slot.fadeS);
    }
  }

  clear(): void {
    for (const slot of this.slots) {
      slot.active = false;
      slot.mesh.visible = false;
    }
  }

  dispose(): void {
    this.group.removeFromParent();
    for (const slot of this.slots) {
      slot.mesh.geometry.dispose();
      slot.mesh.material.dispose();
    }
  }
}

// ── L13: the rune circle under the caster ───────────────────────────────────

const RUNE_FRAGMENT = /* glsl */ `
uniform sampler2D uMap;
uniform float uTime;
uniform float uAlpha;
uniform float uHot;
varying vec2 vUv;
mat2 vxRot(float a) { float c = cos(a); float s = sin(a); return mat2(c, -s, s, c); }
void main() {
  vec2 p = vUv - 0.5;
  float r = length(p) * 2.0;
  if (r > 1.0 || uAlpha <= 0.0) discard;
  // The outer band turns one way; a smaller copy of the circle turns the other way inside it.
  float outer = texture2D(uMap, vxRot(uTime * 0.9) * p + 0.5).a * step(0.56, r);
  float inner = texture2D(uMap, vxRot(-uTime * 1.6) * p * 1.7 + 0.5).a * (1.0 - step(0.56, r));
  float m = max(outer, inner * 0.9);
  float fill = 0.22 * (1.0 - smoothstep(0.1, 1.0, r));
  // Round 4 capture: the circle was faint on the dais; stronger strokes, a brighter orange.
  vec3 color = mix(vec3(1.0, 0.36, 0.04), vec3(1.0, 0.86, 0.52), uHot) * (1.35 + 0.9 * uHot);
  gl_FragColor = vec4(color, clamp(m * 1.4 + fill * (0.5 + uHot), 0.0, 1.0) * uAlpha);
}`;

/** A rune circle laid on the ground (kit textures().runes), normal blend: saturated orange strokes that read on light and dark ground. */
export class RuneCircle {
  readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;

  constructor(map: THREE.Texture) {
    const geometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const material = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: map }, uTime: { value: 0 }, uAlpha: { value: 0 }, uHot: { value: 0 } },
      vertexShader: DECAL_VERTEX,
      fragmentShader: RUNE_FRAGMENT,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.mesh.renderOrder = 2;
  }

  /** Draws it this frame at (x, y, z), `size` m across, `alpha`, `hot` (0–1: gold-white flare), turned by `time`. */
  set(x: number, y: number, z: number, size: number, alpha: number, hot: number, time: number): void {
    this.mesh.visible = alpha > 0.002;
    if (!this.mesh.visible) return;
    this.mesh.position.set(x, y, z);
    this.mesh.scale.set(size, 1, size);
    const u = this.mesh.material.uniforms;
    u.uAlpha!.value = alpha;
    u.uHot!.value = hot;
    u.uTime!.value = time;
  }

  hide(): void {
    this.mesh.visible = false;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
