/**
 * Ground telegraphs from `telegraph` events: enemy warnings red #FF4A4A
 * filling over the wind-up (≥ 0.5 s), ours (Thiên Hỏa) pale orange with a
 * white rim, never red (05 §6); aura rings in withered yellow #C8D24A that
 * follow their general while the `aura` is on. Shapes: circle (dive, blast),
 * line (boar charge, ranged aim), cone and arc (melee sweep). Each telegraph
 * is a small grid laid on the terrain (TerrainView.heightAt), so it hugs the
 * ground; a pool of meshes, only live ones drawn.
 * Owner: view-crowd-fx (LANES.md).
 */
import * as THREE from "three";
import type { EnemyRef, SimEvent, TelegraphShape } from "../content/types";
import type { World } from "../sim/world";
import { uToM } from "../sim/fixed";
import type { FrameInfo, Presenter } from "../app/contracts";
import type { FoeLocator } from "./actors";
import type { Stage } from "./stage";
import type { TerrainView } from "./terrain";

/** 05 §2.2: enemy danger red; ours pale orange with a white rim; general auras withered yellow. */
export const TELEGRAPH_COLORS = {
  enemy: "#ff4a4a",
  ally: "#ffc9a0",
  allyRim: "#ffffff",
  aura: "#c8d24a",
} as const;

export type TelegraphOwner = "enemy" | "ally" | "aura";

/** Fill and rim colours of a telegraph: enemy warnings are always red, ours never are. */
export function telegraphColors(owner: TelegraphOwner): { fill: string; rim: string } {
  if (owner === "enemy") return { fill: TELEGRAPH_COLORS.enemy, rim: TELEGRAPH_COLORS.enemy };
  if (owner === "ally") return { fill: TELEGRAPH_COLORS.ally, rim: TELEGRAPH_COLORS.allyRim };
  return { fill: TELEGRAPH_COLORS.aura, rim: TELEGRAPH_COLORS.aura };
}

/** 05 §6.2: a warning takes at least 0.5 s to fill. */
export const MIN_WINDUP_S = 0.5;
const SEGMENTS = 12;
const POOL = 32;
const FADE_S = 0.18;
/** Cone and arc half-angle when the event gives no width (a 90° sweep, 05 §6.2). */
const DEFAULT_HALF = Math.PI / 4;

const VERTEX = /* glsl */ `
attribute vec2 aLocal;
varying vec2 vLocal;
void main() {
  vLocal = aLocal;
  gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
}`;

// uShape: 0 circle, 1 line, 2 cone / arc, 3 aura ring. vLocal: (u, v) in −1 … 1, lines (across, along 0 … 1).
const FRAGMENT = /* glsl */ `
uniform float uShape;
uniform float uFill;
uniform float uAlpha;
uniform float uHalf;
uniform float uTime;
uniform float uRimPx;
uniform vec3 uColor;
uniform vec3 uRim;
varying vec2 vLocal;
void main() {
  float inside = 0.0;
  float rim = 0.0;
  float filled = 0.0;
  if (uShape < 0.5) {
    float r = length(vLocal);
    if (r > 1.0) discard;
    inside = 1.0;
    rim = smoothstep(1.0 - uRimPx * 2.0, 1.0 - uRimPx, r);
    filled = step(r, uFill);
    rim = max(rim, filled * smoothstep(uFill - uRimPx * 1.5, uFill, r));
  } else if (uShape < 1.5) {
    float across = abs(vLocal.x);
    float along = vLocal.y;
    inside = 1.0;
    rim = smoothstep(1.0 - uRimPx * 4.0, 1.0 - uRimPx * 2.0, across);
    filled = step(along, uFill);
    // Chevrons running toward the end.
    float chevron = step(0.55, fract(along * 6.0 - across * 0.6 - uTime * 1.5)) * 0.18;
    filled = max(filled, chevron * (1.0 - filled));
  } else if (uShape < 2.5) {
    float r = length(vLocal);
    float angle = abs(atan(vLocal.x, vLocal.y));
    if (r > 1.0 || angle > uHalf) discard;
    inside = 1.0;
    rim = max(smoothstep(1.0 - uRimPx * 2.0, 1.0 - uRimPx, r), smoothstep(uHalf - 0.05, uHalf - 0.015, angle));
    filled = step(r, uFill);
  } else {
    float r = length(vLocal);
    if (r > 1.0) discard;
    // Aura: a ring that breathes, ticks round it.
    float band = smoothstep(0.86, 0.93, r) * (1.0 - smoothstep(0.97, 1.0, r));
    float ticks = step(0.7, fract(atan(vLocal.y, vLocal.x) * 3.8197 + uTime * 0.25)) * smoothstep(0.78, 0.84, r) * (1.0 - smoothstep(0.86, 0.88, r));
    gl_FragColor = vec4(uColor, (band * (0.75 + 0.25 * sin(uTime * 3.0)) + ticks * 0.6 + 0.07 * smoothstep(0.3, 1.0, r)) * uAlpha);
    return;
  }
  vec3 color = mix(uColor, uRim, rim);
  float a = inside * (0.14 + filled * 0.38) + rim * 0.75;
  gl_FragColor = vec4(color, a * uAlpha);
}`;

export interface TelegraphSpec {
  readonly owner: TelegraphOwner;
  readonly shape: TelegraphShape | "aura";
  /** Origin and the point it aims at (metres). */
  readonly x: number;
  readonly z: number;
  readonly toX: number;
  readonly toZ: number;
  /** Circle, cone, arc and aura radius; line width (metres). */
  readonly radiusM: number;
  readonly widthM: number;
}

interface Slot {
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  active: boolean;
  id: number;
  spec: TelegraphSpec;
  /** World seconds since it began, how long it fills; −1: holds (auras). */
  age: number;
  duration: number;
  /** Fading out: seconds left (−1: not fading). */
  fade: number;
  follow: EnemyRef | null;
  source: EnemyRef | null;
}

export interface TelegraphsView extends Presenter {
  /** Shows a telegraph (showcase, tools); returns its id. `follow`: a foe it rides on (auras). */
  show(spec: TelegraphSpec, durationS: number, follow?: EnemyRef | null, source?: EnemyRef | null): number;
  /** Advances without a World (bench, showcase). */
  tick(worldDt: number, time: number): void;
  readonly live: number;
  clear(): void;
}

export interface TelegraphsOptions {
  locator?: FoeLocator;
}

export function createTelegraphs(stage: Stage, terrain: TerrainView, options: TelegraphsOptions = {}): TelegraphsView {
  const group = new THREE.Group();
  group.name = "telegraphs";
  stage.layers.fx.add(group);
  const slots: Slot[] = [];
  const at = new THREE.Vector3();
  let nextId = 1_000_000;
  let time = 0;
  for (let k = 0; k < POOL; k += 1) {
    const geometry = new THREE.PlaneGeometry(1, 1, SEGMENTS, SEGMENTS);
    geometry.deleteAttribute("normal");
    geometry.setAttribute("aLocal", new THREE.BufferAttribute(new Float32Array((SEGMENTS + 1) * (SEGMENTS + 1) * 2), 2));
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uShape: { value: 0 },
        uFill: { value: 0 },
        uAlpha: { value: 1 },
        uHalf: { value: DEFAULT_HALF },
        uTime: { value: 0 },
        uRimPx: { value: 0.04 },
        uColor: { value: new THREE.Color() },
        uRim: { value: new THREE.Color() },
      },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    mesh.visible = false;
    mesh.renderOrder = 3;
    group.add(mesh);
    slots.push({ mesh, active: false, id: -1, spec: { owner: "enemy", shape: "circle", x: 0, z: 0, toX: 0, toZ: 0, radiusM: 1, widthM: 1 }, age: 0, duration: 1, fade: -1, follow: null, source: null });
  }

  /** Lays the slot's grid on the ground for its spec at origin (cx, cz). */
  const layout = (slot: Slot, cx: number, cz: number): void => {
    const spec = slot.spec;
    let fx = spec.toX - spec.x;
    let fz = spec.toZ - spec.z;
    const length = Math.hypot(fx, fz);
    if (length < 1e-4) {
      fx = 0;
      fz = 1;
    } else {
      fx /= length;
      fz /= length;
    }
    const rx = fz;
    const rz = -fx;
    const position = slot.mesh.geometry.getAttribute("position") as THREE.BufferAttribute;
    const local = slot.mesh.geometry.getAttribute("aLocal") as THREE.BufferAttribute;
    const line = spec.shape === "line";
    const radius = Math.max(0.3, spec.radiusM);
    const half = Math.max(0.2, spec.widthM / 2);
    const lineLength = Math.max(0.5, length);
    for (let i = 0; i < position.count; i += 1) {
      const col = i % (SEGMENTS + 1);
      const row = Math.floor(i / (SEGMENTS + 1));
      const u = (col / SEGMENTS) * 2 - 1;
      const v = 1 - (row / SEGMENTS) * 2;
      let x: number;
      let z: number;
      if (line) {
        const along = (v + 1) / 2;
        x = cx + fx * along * lineLength + rx * u * half;
        z = cz + fz * along * lineLength + rz * u * half;
        local.setXY(i, u, along);
      } else {
        x = cx + (rx * u + fx * v) * radius;
        z = cz + (rz * u + fz * v) * radius;
        local.setXY(i, u, v);
      }
      position.setXYZ(i, x, terrain.heightAt(x, z) + 0.09, z);
    }
    position.needsUpdate = true;
    local.needsUpdate = true;
    const uniforms = slot.mesh.material.uniforms;
    const size = line ? half : radius;
    // About 0.12 m of rim whatever the size.
    uniforms.uRimPx!.value = Math.min(0.2, 0.12 / Math.max(0.3, size));
  };

  const show = (spec: TelegraphSpec, durationS: number, follow: EnemyRef | null = null, source: EnemyRef | null = null, id = nextId++): number => {
    let slot = slots.find((item) => item.active && item.id === id) ?? slots.find((item) => !item.active);
    // Full: the oldest aura gives way to a warning (warnings matter more).
    slot ??= slots.find((item) => item.spec.shape === "aura");
    if (slot === undefined) return -1;
    slot.active = true;
    slot.id = id;
    slot.spec = spec;
    slot.age = 0;
    slot.duration = spec.shape === "aura" ? -1 : Math.max(MIN_WINDUP_S, durationS);
    slot.fade = -1;
    slot.follow = follow;
    slot.source = source;
    const { fill, rim } = telegraphColors(spec.owner);
    const uniforms = slot.mesh.material.uniforms;
    uniforms.uShape!.value = spec.shape === "circle" ? 0 : spec.shape === "line" ? 1 : spec.shape === "aura" ? 3 : 2;
    (uniforms.uColor!.value as THREE.Color).set(fill);
    (uniforms.uRim!.value as THREE.Color).set(rim);
    uniforms.uHalf!.value = spec.shape === "cone" || spec.shape === "arc" ? (spec.widthM > 0 ? Math.atan2(spec.widthM / 2, Math.max(0.3, spec.radiusM)) : DEFAULT_HALF) : DEFAULT_HALF;
    uniforms.uFill!.value = 0;
    uniforms.uAlpha!.value = 1;
    layout(slot, spec.x, spec.z);
    slot.mesh.visible = true;
    return id;
  };

  const endFor = (enemy: EnemyRef): void => {
    for (const slot of slots) {
      if (!slot.active || slot.fade >= 0) continue;
      const match = (ref: EnemyRef | null) => ref !== null && ref.serial === enemy.serial;
      if (match(slot.follow) || match(slot.source)) slot.fade = FADE_S;
    }
  };

  const tick = (worldDt: number, now: number): void => {
    time = now;
    for (const slot of slots) {
      if (!slot.active) continue;
      const uniforms = slot.mesh.material.uniforms;
      uniforms.uTime!.value = time;
      slot.age += worldDt;
      if (slot.follow !== null && options.locator?.locate(slot.follow.slot, slot.follow.serial, "base", at)) layout(slot, at.x, at.z);
      if (slot.duration > 0) {
        uniforms.uFill!.value = Math.min(1, slot.age / slot.duration);
        // Full: a brief flash, then gone (the strike lands now).
        if (slot.age >= slot.duration && slot.fade < 0) slot.fade = FADE_S;
      }
      if (slot.fade >= 0) {
        slot.fade -= worldDt;
        uniforms.uAlpha!.value = Math.max(0, slot.fade / FADE_S) * 1.2;
        if (slot.fade <= 0) {
          slot.active = false;
          slot.mesh.visible = false;
        }
      }
    }
  };

  return {
    show,
    tick,
    get live(): number {
      return slots.filter((slot) => slot.active).length;
    },
    clear(): void {
      for (const slot of slots) {
        slot.active = false;
        slot.mesh.visible = false;
      }
    },
    onEvents(events: readonly SimEvent[], world: World): void {
      for (const event of events) {
        if (event.type === "telegraph") {
          const source = event.source.kind === "enemy" ? { slot: event.source.slot, serial: event.source.serial } : null;
          show({ owner: event.owner, shape: event.shape, x: event.x, z: event.z, toX: event.toX, toZ: event.toZ, radiusM: event.radiusM, widthM: event.widthM }, event.durationMs / 1000, null, source, event.id);
        } else if (event.type === "aura") {
          const key = -1 - event.enemy.serial;
          if (event.on) {
            const foe = world.enemies.list[event.enemy.slot];
            const x = foe ? uToM(foe.x) : 0;
            const z = foe ? uToM(foe.z) : 0;
            show({ owner: "aura", shape: "aura", x, z, toX: x, toZ: z + 1, radiusM: event.radiusM, widthM: 0 }, 0, event.enemy, null, key);
          } else {
            const slot = slots.find((item) => item.active && item.id === key);
            if (slot) slot.fade = FADE_S;
          }
        } else if (event.type === "death") {
          endFor(event.enemy);
        } else if (event.type === "phase" && (event.phase === "break" || event.phase === "victory" || event.phase === "defeat")) {
          for (const slot of slots) if (slot.active) slot.fade = FADE_S;
        }
      }
    },
    frame(_world: World, info: FrameInfo): void {
      tick(info.worldDt, info.now / 1000);
    },
    dispose(): void {
      for (const slot of slots) {
        slot.mesh.geometry.dispose();
        slot.mesh.material.dispose();
      }
      group.removeFromParent();
    },
  };
}
