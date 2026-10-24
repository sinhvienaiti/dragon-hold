/**
 * Ground telegraphs from `telegraph` events: enemy warnings red #FF4A4A
 * filling over the wind-up (≥ 0.5 s), ours (Thiên Hỏa) pale orange with a
 * white rim, never red (05 §6); aura rings in withered yellow #C8D24A that
 * follow their general while the `aura` is on. Shapes: circle (dive, blast),
 * line (boar charge, ranged aim), cone and arc (melee sweep). Each telegraph
 * is a small grid laid on the terrain (TerrainView.heightAt), so it hugs the
 * ground; a pool of meshes, only live ones drawn.
 * Round 2 readability: an enemy warning is drawn at least VIEW_MIN wide
 * (the sim's reach is unchanged), with a bold red rim, a dark outer edge so
 * it reads on dirt, grass and water, a brighter fill that pulses as the blow
 * nears, an arrowhead on lines, and a red "!" over the foe winding up.
 * Owner: view-crowd-fx (LANES.md).
 */
import * as THREE from "three";
import type { EnemyRef, SimEvent, TelegraphShape } from "../content/types";
import type { World } from "../sim/world";
import { uToM } from "../sim/fixed";
import type { FrameInfo, Presenter } from "../app/contracts";
import type { FoeLocator } from "./actors";
import { drawnWarnings, foeDrawnSize, type DrawnWarning } from "./foe-look";
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
const SEGMENTS = 16;
const POOL = 32;
/** Drawn minimums for enemy warnings (metres): circle radius, line half-width, cone and arc radius. View only. */
export const VIEW_MIN = { circleM: 2.2, lineHalfM: 1.0, coneM: 3.2, lineLengthM: 3.0 } as const;
/** Rim and dark edge widths on the ground (metres). */
const RIM_M = 0.24;
const EDGE_M = 0.09;
/** The "!" over a foe winding up: world size (metres) and lift over its head. */
const MARK_SIZE_M = 1.7;
const MARK_LIFT_M = 1.05;
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
// uRimPx, uEdgePx: rim and dark edge widths in local units; uLen: a line's length over its half-width (arrowhead).
const FRAGMENT = /* glsl */ `
uniform float uShape;
uniform float uFill;
uniform float uAlpha;
uniform float uHalf;
uniform float uTime;
uniform float uRimPx;
uniform float uEdgePx;
uniform float uLen;
uniform float uEdgeDark;
uniform vec3 uColor;
uniform vec3 uRim;
varying vec2 vLocal;
void main() {
  float inside = 0.0;
  float rim = 0.0;
  float edge = 0.0;
  float filled = 0.0;
  float extra = 0.0;
  if (uShape < 0.5) {
    float r = length(vLocal);
    if (r > 1.0) discard;
    inside = 1.0;
    edge = smoothstep(1.0 - uEdgePx, 1.0 - uEdgePx * 0.5, r);
    rim = smoothstep(1.0 - uEdgePx - uRimPx, 1.0 - uEdgePx - uRimPx * 0.7, r) * (1.0 - edge);
    filled = step(r, uFill);
    rim = max(rim, filled * smoothstep(uFill - uRimPx, uFill - uRimPx * 0.3, r) * (1.0 - edge));
  } else if (uShape < 1.5) {
    float across = abs(vLocal.x);
    float along = vLocal.y;
    // Arrowhead over the last stretch: the sides close in toward the tip.
    float head = clamp(1.0 / max(uLen, 1.0) * 1.6, 0.0, 0.45);
    float tip = clamp((along - (1.0 - head)) / head, 0.0, 1.0);
    float limit = mix(1.0, 0.0, tip);
    if (across > max(limit, 0.0)) discard;
    inside = 1.0;
    float side = limit - across;
    edge = 1.0 - smoothstep(uEdgePx * 0.5, uEdgePx, side);
    rim = (1.0 - smoothstep(uEdgePx + uRimPx * 0.7, uEdgePx + uRimPx, side)) * (1.0 - edge);
    filled = step(along, uFill);
    // Chevrons running toward the end.
    float chevron = step(0.55, fract(along * 6.0 - across * 0.6 - uTime * 1.5)) * 0.28;
    filled = max(filled, chevron * (1.0 - filled));
  } else if (uShape < 2.5) {
    float r = length(vLocal);
    float angle = abs(atan(vLocal.x, vLocal.y));
    if (r > 1.0 || angle > uHalf) discard;
    inside = 1.0;
    float sideM = (uHalf - angle) * r;
    edge = max(smoothstep(1.0 - uEdgePx, 1.0 - uEdgePx * 0.5, r), 1.0 - smoothstep(uEdgePx * 0.5, uEdgePx, sideM));
    rim = max(smoothstep(1.0 - uEdgePx - uRimPx, 1.0 - uEdgePx - uRimPx * 0.7, r), 1.0 - smoothstep(uEdgePx + uRimPx * 0.7, uEdgePx + uRimPx, sideM)) * (1.0 - edge);
    filled = step(r, uFill);
  } else {
    float r = length(vLocal);
    if (r > 1.0) discard;
    // Aura: a withered-yellow ring that breathes, ticks round it. Round 3: a dark violet-grey edge (Hắc Vụ)
    // on both sides and a paler core, so the yellow reads on sunlit grass as on dirt and water.
    float band = smoothstep(0.855, 0.885, r) * (1.0 - smoothstep(0.945, 0.97, r));
    float edge = max(smoothstep(0.80, 0.835, r) * (1.0 - smoothstep(0.855, 0.875, r)), smoothstep(0.95, 0.97, r) * (1.0 - smoothstep(0.99, 1.0, r)));
    float ticks = step(0.7, fract(atan(vLocal.y, vLocal.x) * 3.8197 + uTime * 0.25)) * smoothstep(0.70, 0.74, r) * (1.0 - smoothstep(0.78, 0.80, r));
    float breathe = 0.85 + 0.15 * sin(uTime * 3.0);
    vec3 core = mix(uColor, vec3(0.96, 0.98, 0.70), 0.4 * band);
    vec3 color = mix(core, vec3(0.16, 0.12, 0.21), edge * (1.0 - band));
    float a = max(band * breathe, edge * 0.72) + ticks * 0.7 + 0.06 * smoothstep(0.3, 1.0, r);
    gl_FragColor = vec4(color, min(1.0, a) * uAlpha);
    return;
  }
  // Nearly due: the fill throbs brighter (the last third of the wind-up).
  float due = smoothstep(0.66, 1.0, uFill);
  float throb = 1.0 + due * 0.35 * (0.5 + 0.5 * sin(uTime * 26.0));
  vec3 color = mix(uColor * throb, uRim, rim);
  color = mix(color, vec3(0.16, 0.02, 0.02), edge * uEdgeDark);
  // Ours (no dark edge) fill at half strength: the foes under Thiên Hỏa's target stay visible.
  float a = inside * (0.24 + filled * (0.46 + due * 0.12)) * mix(0.5, 1.0, uEdgeDark) + rim * 0.95;
  a = max(a, edge * 0.85 * uEdgeDark);
#ifdef XRAY
  // Seen through a body (our blocker, the foe itself): the red outline and arrow only, a faint fill.
  color = mix(uRim, vec3(0.16, 0.02, 0.02), edge);
  a = max(rim * 0.9, edge * 0.7) + inside * filled * 0.1;
#endif
  gl_FragColor = vec4(color, min(1.0, a) * uAlpha);
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
  /** The same warning seen through bodies (enemy warnings only): depth test GREATER, outline only. */
  xray: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
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
  /** The "!" over the foe winding up (enemy warnings with a source). */
  mark: THREE.Sprite;
  /** Half the source foe's drawn width (metres), to set the "!" beside its body. */
  markSide: number;
  /** The drawn shape's ground circle (word tags keep off it). */
  bound: DrawnWarning;
}

/** The "!" badge: a red disc with a dark ring and a white mark (one shared texture). */
function markTexture(): THREE.Texture {
  const size = 64;
  const canvas = globalThis.document?.createElement("canvas");
  if (!canvas) return new THREE.Texture();
  canvas.width = canvas.height = size;
  const g = canvas.getContext("2d");
  if (g) {
    g.beginPath();
    g.arc(32, 32, 29, 0, Math.PI * 2);
    g.fillStyle = "#1a0606";
    g.fill();
    g.beginPath();
    g.arc(32, 32, 25, 0, Math.PI * 2);
    g.fillStyle = TELEGRAPH_COLORS.enemy;
    g.fill();
    g.fillStyle = "#ffffff";
    g.fillRect(28, 13, 8, 25);
    g.beginPath();
    g.arc(32, 46, 4.5, 0, Math.PI * 2);
    g.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export interface TelegraphsView extends Presenter {
  /** Shows a telegraph (showcase, tools); returns its id. `follow`: a foe it rides on (auras). */
  show(spec: TelegraphSpec, durationS: number, follow?: EnemyRef | null, source?: EnemyRef | null): number;
  /** Fades telegraph `id` out (a planted banner's ring when the banner goes). */
  end(id: number): void;
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
  const right = new THREE.Vector3();
  const badge = markTexture();
  const markMaterial = new THREE.SpriteMaterial({ map: badge, depthTest: false, depthWrite: false, transparent: true });
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
        uEdgePx: { value: 0.03 },
        uEdgeDark: { value: 1 },
        uLen: { value: 1 },
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
    // Round 2: a warning under our blocker or a crowd still shows its outline through them (shared grid and uniforms).
    const xray = new THREE.Mesh(
      geometry,
      new THREE.ShaderMaterial({
        uniforms: material.uniforms,
        defines: { XRAY: 1 },
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        transparent: true,
        depthWrite: false,
        depthFunc: THREE.GreaterDepth,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -4,
        polygonOffsetUnits: -4,
      }),
    );
    xray.frustumCulled = false;
    xray.visible = false;
    xray.renderOrder = 3;
    group.add(xray);
    const mark = new THREE.Sprite(markMaterial);
    mark.center.set(0, 0.5);
    mark.scale.setScalar(MARK_SIZE_M);
    mark.visible = false;
    mark.renderOrder = 12;
    mark.frustumCulled = false;
    group.add(mark);
    slots.push({ mesh, xray, bound: { x: 0, y: 0, z: 0, radius: 0 }, active: false, id: -1, spec: { owner: "enemy", shape: "circle", x: 0, z: 0, toX: 0, toZ: 0, radiusM: 1, widthM: 1 }, age: 0, duration: 1, fade: -1, follow: null, source: null, mark, markSide: 0.6 });
  }

  // Compile the warning and badge shaders now (both start hidden), not at the first wind-up of a wave.
  if (slots.length > 0) {
    const first = slots[0]!;
    first.mesh.visible = true;
    first.xray.visible = true;
    first.mark.visible = true;
    try {
      stage.renderer.compile(group, stage.camera, stage.scene);
    } catch {
      // A stage without a live GL context (tests): compiled on first use instead.
    }
    first.mesh.visible = false;
    first.xray.visible = false;
    first.mark.visible = false;
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
    const enemy = spec.owner === "enemy";
    const minRadius = !enemy ? 0.3 : spec.shape === "circle" ? VIEW_MIN.circleM : VIEW_MIN.coneM;
    const radius = Math.max(minRadius, spec.radiusM);
    const half = Math.max(enemy ? VIEW_MIN.lineHalfM : 0.2, spec.widthM / 2);
    const lineLength = Math.max(enemy ? VIEW_MIN.lineLengthM : 0.5, length);
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
    // About RIM_M of rim and EDGE_M of dark edge whatever the size (ours: a thinner rim, no dark edge).
    uniforms.uRimPx!.value = Math.min(0.3, (enemy ? RIM_M : 0.12) / Math.max(0.3, size));
    uniforms.uEdgePx!.value = Math.min(0.2, EDGE_M / Math.max(0.3, size));
    uniforms.uEdgeDark!.value = enemy ? 1 : 0;
    uniforms.uLen!.value = line ? lineLength / half : 1;
    // A ground circle round what is drawn: the line's middle, a sweep's near half, a circle itself.
    const bound = slot.bound;
    const wide = spec.shape === "cone" || spec.shape === "arc" ? (uniforms.uHalf!.value as number) > 1.05 : true;
    const reach = line ? lineLength / 2 : spec.shape === "circle" || wide ? 0 : radius * 0.5;
    bound.x = cx + fx * reach;
    bound.z = cz + fz * reach;
    bound.y = terrain.heightAt(bound.x, bound.z);
    bound.radius = line ? Math.max(lineLength / 2, half) : spec.shape === "circle" || wide ? radius : radius * 0.7;
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
    slot.xray.visible = spec.owner === "enemy" && spec.shape !== "aura";
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
    // Screen right in the world, for the "!" beside a body.
    right.setFromMatrixColumn(stage.camera.matrixWorld, 0).setY(0).normalize();
    for (const slot of slots) {
      if (!slot.active) {
        slot.mark.visible = false;
        continue;
      }
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
          slot.xray.visible = false;
        }
      }
      // The "!" beside the foe's chest while it winds up (gone as the blow lands).
      const source = slot.source;
      const marked = slot.active && slot.fade < 0 && slot.spec.owner === "enemy" && source !== null && options.locator?.locate(source.slot, source.serial, "center", at) === true;
      slot.mark.visible = marked;
      if (marked) {
        slot.mark.position.copy(at).addScaledVector(right, slot.markSide + 0.15);
        slot.mark.position.y += MARK_LIFT_M * 0.4;
        const pop = 1 + 0.12 * Math.sin(time * 18);
        slot.mark.scale.setScalar(MARK_SIZE_M * pop);
      }
    }
    // Live enemy warnings this frame, for the word tags to keep off.
    drawnWarnings.length = 0;
    for (const slot of slots) if (slot.active && slot.fade < 0 && slot.spec.owner === "enemy" && slot.spec.shape !== "aura") drawnWarnings.push(slot.bound);
  };

  return {
    show,
    tick,
    end(id: number): void {
      const slot = slots.find((item) => item.active && item.id === id);
      if (slot && slot.fade < 0) slot.fade = FADE_S;
    },
    get live(): number {
      return slots.filter((slot) => slot.active).length;
    },
    clear(): void {
      for (const slot of slots) {
        slot.active = false;
        slot.mesh.visible = false;
        slot.xray.visible = false;
        slot.mark.visible = false;
      }
      drawnWarnings.length = 0;
    },
    onEvents(events: readonly SimEvent[], world: World): void {
      for (const event of events) {
        if (event.type === "telegraph") {
          const source = event.source.kind === "enemy" ? { slot: event.source.slot, serial: event.source.serial } : null;
          const id = show({ owner: event.owner, shape: event.shape, x: event.x, z: event.z, toX: event.toX, toZ: event.toZ, radiusM: event.radiusM, widthM: event.widthM }, event.durationMs / 1000, null, source, event.id);
          const foe = source !== null ? world.enemies.list[source.slot] : undefined;
          const slot = foe !== undefined && foe.serial === source?.serial ? slots.find((item) => item.active && item.id === id) : undefined;
          if (slot !== undefined && foe !== undefined) {
            const [w, , l] = foeDrawnSize(foe.foe);
            slot.markSide = Math.max(w, l) * 0.5;
          }
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
        slot.xray.material.dispose();
      }
      markMaterial.dispose();
      badge.dispose();
      drawnWarnings.length = 0;
      group.removeFromParent();
    },
  };
}
