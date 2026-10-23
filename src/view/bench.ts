/**
 * Crowd bench, the first M0 task (DESIGN.md §9): 220 foes of every gait
 * (biped, quadruped, flyer, swarm) walking the L2-cau lanes to the dais, hit
 * all the time (flash, knock-back, squash), dying (dissolve) and coming back,
 * instanced HP bars over the hurt ones, fire bolts and sparks when `fx` is on;
 * frame time measured (High on Mac: mean ≤ 8 ms, p95 ≤ 12 ms; Low ≤ 16 ms;
 * ≤ 150 draw calls). The dh-bench CDP scenario imports this module and reads
 * window.__dhBench. The bench builds its own stage (renderer, flat painted
 * ground, lanes), so it does not wait for view/stage.ts.
 * Source adapted: games/space-typing/scripts/visual/scenarios/defense-bench.mjs (the page side).
 * Owner: view-crowd-fx (LANES.md).
 */
import * as THREE from "three";
import { DRAGON, Reactions } from "../kit/feedback";
import { ENEMIES } from "../content/data/enemies";
import { MAP_L2_CAU } from "../content/data/maps";
import type { EnemyId, Gait, MapDef, PlaceholderDef, Vec2 } from "../content/types";
import type { Projector, Quality, ScreenPoint } from "../app/contracts";
import { createCrowd, TINT, type Crowd, type CrowdInstance } from "./crowd";
import { foeDrawLook } from "./foe-look";
import type { FoeAnchor, FoeLocator } from "./actors";
import { createFx, FxCore, pointScaleOf } from "./fx";
import { createHeroes } from "./heroes";
import { createTelegraphs } from "./telegraphs";
import type { TerrainView } from "./terrain";
import type { SimEvent } from "../content/types";
import type { World } from "../sim/world";
import { HP_BAR, HpBarBatch } from "./hpbars";
import { createMapStage, type Stage } from "./stage";

export interface BenchOptions {
  readonly count: number;
  readonly quality: Quality;
  readonly seconds: number;
  /** Fire bolts, sparks and impacts while measuring (default true). */
  readonly fx?: boolean;
  /** Seconds before measuring (default 1.5). */
  readonly warmup?: number;
  /** "flat": the bench's own plain ground (default); "painted": view-terrain's diorama (createMapStage) with its shadows and post. */
  readonly ground?: "flat" | "painted";
}

export interface BenchResult {
  readonly frames: number;
  /** Frame interval (requestAnimationFrame to requestAnimationFrame), ms. */
  readonly meanMs: number;
  readonly p95Ms: number;
  readonly drawCalls: number;
  readonly triangles: number;
  /** Main-thread time of one frame (update and render submit), ms. */
  readonly cpuMeanMs: number;
  readonly cpuP95Ms: number;
  /**
   * GPU time from EXT_disjoint_timer_query_webgl2 when it can be trusted, else null. On ANGLE over Metal the
   * query reads longer than the frame itself (6.95 ms in a 4.35 ms frame), so it is left out there (gpuNote says why);
   * use the frame interval with vsync off instead.
   */
  readonly gpuMeanMs: number | null;
  readonly gpuNote: string | null;
  readonly maxMs: number;
  readonly fps: number;
  readonly count: number;
  readonly quality: Quality;
  readonly fx: boolean;
  readonly ground: "flat" | "painted";
  readonly width: number;
  readonly height: number;
  readonly dpr: number;
  readonly renderer: string;
  /** Instances drawn and HP bars shown in the last frame. */
  readonly instances: number;
  readonly bars: number;
  readonly gaits: Readonly<Record<Gait, number>>;
}

declare global {
  interface Window {
    /** Set by the crowd bench when it finishes. */
    __dhBench?: BenchResult;
    /** Stops a finished bench (it keeps drawing for screenshots until then). */
    __dhBenchStop?: () => void;
    /** Moves the bench camera: "default" (05 §3), "close" (the bridge lane end). */
    __dhBenchCamera?: (preset: "default" | "close" | "fx") => void;
    /** Effects showcase: plays a named effect (runFxShowcase). */
    __dhFx?: (name: ShowcaseEffect) => void;
    __dhShowcaseStop?: () => void;
  }
}

// ── A stage of the bench's own (the game's comes from view/stage.ts) ───────

/** Default camera of 05 §3: FOV 30°, looking at the dais from the south. */
export function placeCamera(camera: THREE.PerspectiveCamera, map: MapDef, yawDeg = map.camera.yawDeg, pitchDeg = map.camera.pitchDeg, distanceM = map.camera.distanceM, target = new THREE.Vector3(0, 0, 0)): void {
  const yaw = THREE.MathUtils.degToRad(yawDeg);
  const pitch = THREE.MathUtils.degToRad(pitchDeg);
  camera.position.set(target.x + Math.sin(yaw) * Math.cos(pitch) * distanceM, target.y + Math.sin(pitch) * distanceM, target.z + Math.cos(yaw) * Math.cos(pitch) * distanceM);
  camera.lookAt(target);
  camera.updateMatrixWorld();
}

export interface BenchStage extends Stage {
  readonly canvas: HTMLCanvasElement;
}

/** A plain WebGL stage on `host`: renderer, light rig, layers, projector (enough for the bench and the effects showcase). */
export function createBenchStage(host: HTMLElement, quality: Quality, map: MapDef = MAP_L2_CAU): BenchStage {
  const canvas = document.createElement("canvas");
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block";
  host.append(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: quality === "high" || quality === "ultra", powerPreference: "high-performance" });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor("#a9c2cf");
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog("#a9c2cf", 110, 200);
  const camera = new THREE.PerspectiveCamera(30, 16 / 9, 1, 400);
  placeCamera(camera, map);
  const hemi = new THREE.HemisphereLight("#e4ecff", "#4d5b3c", 1.25);
  const sun = new THREE.DirectionalLight("#fff0d4", 2.3);
  sun.position.set(-30, 60, 25);
  scene.add(hemi, sun);
  const layers = { ground: new THREE.Group(), actors: new THREE.Group(), fx: new THREE.Group() };
  layers.ground.name = "ground";
  layers.actors.name = "actors";
  layers.fx.name = "fx";
  scene.add(layers.ground, layers.actors, layers.fx);
  const v = new THREE.Vector3();
  const project: Projector = (x: number, y: number, z: number, out: ScreenPoint): ScreenPoint => {
    v.set(x, y, z).project(camera);
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    out.x = (v.x * 0.5 + 0.5) * width;
    out.y = (-v.y * 0.5 + 0.5) * height;
    out.visible = v.z < 1 && v.x >= -1 && v.x <= 1 && v.y >= -1 && v.y <= 1;
    return out;
  };
  const resize = (): void => {
    const width = Math.max(1, host.clientWidth);
    const height = Math.max(1, host.clientHeight);
    const cap = quality === "high" || quality === "ultra" ? 2 : 1;
    renderer.setPixelRatio(Math.min(cap, window.devicePixelRatio || 1));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  resize();
  return {
    canvas,
    renderer,
    scene,
    camera,
    layers,
    quality,
    project,
    resize,
    render: () => renderer.render(scene, camera),
    dispose: () => {
      scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.geometry.dispose();
          for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) material.dispose();
        }
      });
      renderer.dispose();
      canvas.remove();
    },
  };
}

// ── Lanes as metres polylines (view side) ──────────────────────────────────

export interface LanePath {
  readonly points: readonly Vec2[];
  readonly cum: readonly number[];
  readonly length: number;
  readonly width: number;
  readonly altitude: number;
}

export function lanePath(points: readonly Vec2[], width: number, altitude = 0): LanePath {
  const cum = [0];
  for (let k = 1; k < points.length; k += 1) cum.push(cum[k - 1]! + Math.hypot(points[k]![0] - points[k - 1]![0], points[k]![1] - points[k - 1]![1]));
  return { points, cum, length: cum[cum.length - 1]!, width, altitude };
}

/** The point `s` metres from the gate, shifted `side` metres to the right; writes [x, z, dirX, dirZ]. */
export function laneAt(path: LanePath, s: number, side: number, out: number[]): number[] {
  const clamped = Math.max(0, Math.min(path.length, s));
  let k = 1;
  while (k < path.points.length - 1 && path.cum[k]! < clamped) k += 1;
  const a = path.points[k - 1]!;
  const b = path.points[k]!;
  const span = path.cum[k]! - path.cum[k - 1]! || 1;
  const t = (clamped - path.cum[k - 1]!) / span;
  const dx = (b[0] - a[0]) / span;
  const dz = (b[1] - a[1]) / span;
  out[0] = a[0] + (b[0] - a[0]) * t - dz * side;
  out[1] = a[1] + (b[1] - a[1]) * t + dx * side;
  out[2] = dx;
  out[3] = dz;
  return out;
}

/** A flat strip along a polyline (dirt paths, the river) at height y. */
function stripMesh(points: readonly Vec2[], widths: readonly number[], y: number, color: string): THREE.Mesh {
  const positions: number[] = [];
  const index: number[] = [];
  for (let k = 0; k < points.length; k += 1) {
    const prev = points[Math.max(0, k - 1)]!;
    const next = points[Math.min(points.length - 1, k + 1)]!;
    let dx = next[0] - prev[0];
    let dz = next[1] - prev[1];
    const length = Math.hypot(dx, dz) || 1;
    dx /= length;
    dz /= length;
    const half = (widths[k] ?? widths[widths.length - 1] ?? 3) / 2;
    const [x, z] = points[k]!;
    positions.push(x - dz * half, y, z + dx * half, x + dz * half, y, z - dx * half);
    if (k > 0) {
      const o = (k - 1) * 2;
      index.push(o, o + 2, o + 1, o + 1, o + 2, o + 3);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
  mesh.renderOrder = 0;
  return mesh;
}

/** Flat painted ground for the bench: grass with soft patches, the dais, dirt lanes, the river. */
export function benchGround(map: MapDef): THREE.Group {
  const group = new THREE.Group();
  group.name = "bench-ground";
  const size = map.terrain.sizeM;
  const geometry = new THREE.PlaneGeometry(size, size, 48, 48);
  geometry.rotateX(-Math.PI / 2);
  const colors = new Float32Array(geometry.getAttribute("position").count * 3);
  const position = geometry.getAttribute("position");
  const a = new THREE.Color("#6f8c4c");
  const b = new THREE.Color("#8a9a58");
  const c = new THREE.Color();
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const z = position.getZ(i);
    const k = 0.5 + 0.25 * Math.sin(x * 0.13 + z * 0.07) + 0.25 * Math.sin(z * 0.19 - x * 0.05);
    c.copy(a).lerp(b, k);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  group.add(new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ vertexColors: true })));
  const dais = new THREE.Mesh(new THREE.CylinderGeometry(map.dais.radiusM, map.dais.radiusM + 0.4, 0.5, 32), new THREE.MeshLambertMaterial({ color: "#b9ad93" }));
  dais.position.y = 0.25;
  group.add(dais);
  if (map.river !== null) group.add(stripMesh(map.river.points, map.river.widthsM, 0.02, "#3f7d84"));
  for (const lane of map.lanes) group.add(stripMesh(lane.points, lane.points.map(() => lane.widthM), 0.04, "#a88a62"));
  return group;
}

// ── The bench ───────────────────────────────────────────────────────────────

/** Bench mix: every gait, the M0 species (02 §2.1); shares of `count`. */
const MIX: readonly { readonly id: EnemyId; readonly share: number }[] = [
  { id: "moss-grunt", share: 0.22 },
  { id: "moss-archer", share: 0.12 },
  { id: "blight-wolf", share: 0.15 },
  { id: "tusk-boar", share: 0.08 },
  { id: "thorn-wasp", share: 0.18 },
  { id: "thorn-ant", share: 0.25 },
];

interface BenchFoe {
  id: EnemyId;
  handle: number;
  gait: Gait;
  /** Drawn placeholder and scale (view/foe-look.ts, as in the game). */
  placeholder: PlaceholderDef;
  scale: number;
  lane: LanePath;
  s: number;
  side: number;
  speed: number;
  hp: number;
  /** Seconds since death (−1: alive), seconds at the ring (standing or circling). */
  dying: number;
  standing: number;
  /** Ring spot (ground foes) or circling angle and radius (flyers), set on arrival. */
  ringX: number;
  ringZ: number;
  angle: number;
  radius: number;
  yaw: number;
  serial: number;
  x: number;
  y: number;
  z: number;
}

/** A small deterministic RNG for the bench (view only). */
export function benchRandom(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4_294_967_296;
  };
}

/** The bench's moving crowd: lanes, hits, deaths, bars; reused by the effects showcase. */
export class BenchCrowd implements FoeLocator {
  readonly crowd: Crowd;
  readonly bars = new HpBarBatch(400);
  readonly foes: BenchFoe[] = [];
  readonly reactions = new Reactions(512, DRAGON);
  hitsPerSecond = 26;
  /** Walking speed against the design speed (1.5 keeps the bench busy). */
  speedScale = 1;
  private serial = 1;
  private readonly lanes: { ground: LanePath[]; sky: LanePath[] };
  private readonly at: number[] = [0, 0, 0, 0];
  private readonly sample = new Float32Array(5);
  private readonly instance: CrowdInstance = { x: 0, y: 0, z: 0, yaw: 0, flash: 0, squash: 1 };
  /** Hits this frame, for the effects: [x, y, z, tier]. */
  readonly hits: number[][] = [];
  readonly deaths: number[][] = [];

  constructor(readonly stage: Stage, count: number, readonly random: () => number, map: MapDef = MAP_L2_CAU, readonly heightAt: (x: number, z: number) => number = () => 0) {
    this.crowd = createCrowd(Math.max(64, count + 40));
    stage.layers.actors.add(this.crowd.group);
    stage.layers.fx.add(this.bars.mesh);
    this.lanes = {
      ground: map.lanes.map((lane) => lanePath(lane.points, lane.widthM)),
      sky: map.sky.map((lane) => lanePath(lane.points, 0, lane.altitudeM)),
    };
    let placed = 0;
    MIX.forEach((entry, index) => {
      const n = index === MIX.length - 1 ? count - placed : Math.round(count * entry.share);
      for (let k = 0; k < n; k += 1) this.spawn(entry.id, true);
      placed += n;
    });
  }

  /** FoeLocator: `slot` is the index in `foes`. */
  locate(slot: number, serial: number, at: FoeAnchor, out: THREE.Vector3): boolean {
    const foe = this.foes[slot];
    if (foe === undefined || foe.serial !== serial) return false;
    const lift = foe.gait === "flyer" ? foe.lane.altitude : 0;
    const h = foe.placeholder.sizeM[1] * foe.scale;
    out.set(foe.x, foe.y + (at === "base" ? 0 : lift + (at === "center" ? h * 0.5 : h + 0.15)), foe.z);
    return true;
  }

  get gaits(): Record<Gait, number> {
    const out: Record<Gait, number> = { biped: 0, quadruped: 0, flyer: 0, swarm: 0 };
    for (const foe of this.foes) out[foe.gait] += 1;
    return out;
  }

  private spawn(id: EnemyId, scatter: boolean): void {
    const def = ENEMIES[id];
    const sky = def.gait === "flyer";
    const lanes = sky ? this.lanes.sky : this.lanes.ground;
    const lane = lanes[Math.floor(this.random() * lanes.length)]!;
    const look = foeDrawLook(id);
    const handle = this.crowd.add(look.placeholder, def.gait, look.placeholder.shape, { foe: true, scale: look.scale });
    if (handle < 0) return;
    this.foes.push({
      id,
      handle,
      gait: def.gait,
      placeholder: look.placeholder,
      scale: look.scale,
      lane,
      s: scatter ? this.random() * lane.length * 0.95 : 0,
      side: (this.random() - 0.5) * Math.max(0.6, lane.width - 0.4),
      // 1.5× the design speed so the bench sees a lot of motion.
      speed: (def.speedMmS / 1000) * 1.5 * (0.85 + this.random() * 0.3),
      hp: 1,
      dying: -1,
      standing: scatter && this.random() < 0.25 ? 0.01 + this.random() * 3 : 0,
      ringX: 0,
      ringZ: 0,
      angle: 0,
      radius: 0,
      yaw: 0,
      serial: this.serial++,
      x: 0,
      y: 0,
      z: 0,
    });
  }

  /**
   * One foe's move: along its lane to the end, then ground foes take a spot on
   * the melee ring (6–7.5 m, 01 §2.1) and flyers circle at 6–8 m (01 §4.1).
   * Returns true while it walks.
   */
  private move(foe: BenchFoe, dt: number): boolean {
    const at = this.at;
    if (foe.s < foe.lane.length && foe.standing === 0) {
      foe.s += foe.speed * this.speedScale * dt;
      laneAt(foe.lane, foe.s, foe.side, at);
      foe.x = at[0]!;
      foe.z = at[1]!;
      foe.yaw = Math.atan2(at[2]!, at[3]!);
      return true;
    }
    if (foe.radius === 0) {
      // Arrived (or scattered there): pick the ring spot.
      laneAt(foe.lane, foe.lane.length, foe.side, at);
      const base = Math.atan2(at[0]!, at[1]!);
      foe.angle = base + (this.random() - 0.5) * 1.6;
      foe.radius = foe.gait === "flyer" ? 6 + this.random() * 2 : 6 + this.random() * 1.6;
      foe.ringX = Math.sin(foe.angle) * foe.radius;
      foe.ringZ = Math.cos(foe.angle) * foe.radius;
      if (foe.standing > 0) {
        foe.x = foe.ringX;
        foe.z = foe.ringZ;
      }
    }
    foe.standing += dt;
    if (foe.gait === "flyer") {
      const step = ((foe.speed * this.speedScale) / foe.radius) * dt;
      foe.angle += step;
      const tx = Math.sin(foe.angle) * foe.radius;
      const tz = Math.cos(foe.angle) * foe.radius;
      foe.x += (tx - foe.x) * Math.min(1, dt * 3);
      foe.z += (tz - foe.z) * Math.min(1, dt * 3);
      foe.yaw = foe.angle + Math.PI / 2;
      return true;
    }
    const dx = foe.ringX - foe.x;
    const dz = foe.ringZ - foe.z;
    const distance = Math.hypot(dx, dz);
    if (distance > 0.05) {
      const step = Math.min(distance, foe.speed * this.speedScale * dt);
      foe.x += (dx / distance) * step;
      foe.z += (dz / distance) * step;
      foe.yaw = Math.atan2(dx, dz);
      return true;
    }
    foe.yaw = Math.atan2(-foe.x, -foe.z);
    return false;
  }

  /** Advances by `dt` s at clock `now` s; `alive` foes take hits and die. */
  update(dt: number, now: number): void {
    this.hits.length = 0;
    this.deaths.length = 0;
    const foes = this.foes;
    // Random hits at a steady rate (tiers 1–3), 1 in 4 a kill.
    const hits = Math.floor(this.hitsPerSecond * dt) + (this.random() < (this.hitsPerSecond * dt) % 1 ? 1 : 0);
    for (let k = 0; k < hits; k += 1) {
      const index = Math.floor(this.random() * foes.length);
      const foe = foes[index];
      if (foe === undefined || foe.dying >= 0) continue;
      const tier = 1 + Math.floor(this.random() * 3);
      foe.hp -= 0.12 + this.random() * 0.25;
      this.reactions.hit(index % 512, foe.serial, tier, foe.x, foe.z, now);
      this.hits.push([foe.x, foe.y + foe.placeholder.sizeM[1] * foe.scale * 0.6 + (foe.gait === "flyer" ? foe.lane.altitude : 0), foe.z, tier]);
      if (foe.hp <= 0) {
        foe.dying = 0;
        this.deaths.push([foe.x, foe.y, foe.z, tier]);
      }
    }
    this.bars.begin();
    for (let index = 0; index < foes.length; index += 1) {
      const foe = foes[index]!;
      const inst = this.instance;
      inst.knockX = inst.knockZ = 0;
      inst.dissolve = 0;
      inst.tint = 0;
      inst.tintMix = 0;
      inst.scale = 1;
      if (foe.dying >= 0) {
        foe.dying += dt;
        if (foe.dying >= 0.6) {
          // Back at the gate.
          foe.dying = -1;
          foe.hp = 1;
          foe.s = 0;
          foe.standing = 0;
          foe.radius = 0;
          foe.serial = this.serial++;
          continue;
        }
        inst.dissolve = foe.dying / 0.6;
        inst.flash = Math.max(0, 1 - foe.dying * 8);
        inst.squash = 1;
        inst.stride = 0;
      } else {
        const walking = this.move(foe, dt);
        if (foe.standing > (foe.gait === "flyer" ? 7 : 5)) {
          foe.dying = 0;
          this.deaths.push([foe.x, foe.y, foe.z, 1]);
        }
        this.reactions.sample(index % 512, foe.serial, now, this.sample);
        inst.flash = this.sample[0]!;
        inst.knockX = this.sample[1]!;
        inst.knockZ = this.sample[2]!;
        inst.squash = this.sample[3]!;
        inst.stride = walking ? 1 : 0.1;
        // A few status tints so the shader path is exercised.
        if (foe.serial % 9 === 0) {
          inst.tint = TINT.slow;
          inst.tintMix = 0.85;
        } else if (foe.serial % 13 === 0) {
          inst.tint = TINT.burn;
          inst.tintMix = 0.85;
        }
      }
      inst.x = foe.x;
      inst.y = foe.y = this.heightAt(foe.x, foe.z);
      inst.z = foe.z;
      inst.yaw = foe.yaw;
      inst.lift = foe.gait === "flyer" ? foe.lane.altitude : 0;
      this.crowd.set(foe.handle, inst);
      if (foe.dying < 0 && foe.hp < 1) {
        const top = foe.y + inst.lift + foe.placeholder.sizeM[1] * foe.scale + 0.35;
        this.bars.push(foe.x, top, foe.z, foe.hp, HP_BAR.foe, foe.gait === "swarm" ? 20 : 28);
      }
    }
    this.bars.end();
    this.crowd.flush(now);
  }

  dispose(): void {
    this.crowd.dispose();
    this.bars.dispose();
  }
}

/**
 * The bench's effects (view/fx.ts FxCore), heavier than a real wave on
 * purpose: an impact on every hit, debris on every death, a bolt every
 * 0.25 s, Phun Lửa every 3 s, Thiên Hỏa every 4 s, a pine-cone bomb every
 * 2.5 s, burns on some foes.
 */
export class BenchEffects {
  readonly core: FxCore;
  private readonly mouth = new THREE.Vector3(0, 4.6, -0.6);
  private readonly at = new THREE.Vector3();
  private readonly camPos = new THREE.Vector3();
  private readonly size = new THREE.Vector2();
  private boltClock = 0;
  /** Bolts waiting for their simulated strike: serial, seconds left, tier. */
  private readonly strikes: { serial: number; left: number; tier: number; x: number; z: number }[] = [];
  private breathClock = 1;
  private meteorClock = 2;
  private bombClock = 0.5;

  constructor(private readonly stage: Stage, crowd: BenchCrowd, private readonly random: () => number) {
    this.core = new FxCore(stage.quality, { locator: crowd, random, heightAt: crowd.heightAt });
    stage.layers.fx.add(this.core.group);
    this.core.warm(stage.renderer, stage.scene, stage.camera);
  }

  private pick(crowd: BenchCrowd): number {
    for (let tries = 0; tries < 8; tries += 1) {
      const index = Math.floor(this.random() * crowd.foes.length);
      if (crowd.foes[index]?.dying === -1) return index;
    }
    return -1;
  }

  update(dt: number, now: number, crowd: BenchCrowd): void {
    const core = this.core;
    for (const [x, y, z, tier] of crowd.hits) core.impact(this.at.set(x!, y!, z!), tier!, x!, z!, false);
    for (const [x, y, z, tier] of crowd.deaths) {
      const length = Math.hypot(x!, z!) || 1;
      core.death(this.at.set(x!, y!, z!), "leaf", tier!, x! / length, z! / length);
    }
    this.boltClock += dt;
    while (this.boltClock > 0.25) {
      this.boltClock -= 0.25;
      const index = this.pick(crowd);
      const foe = crowd.foes[index];
      if (foe === undefined) continue;
      crowd.locate(index, foe.serial, "center", this.at);
      const bolt = core.launchBolt(this.mouth, { slot: index, serial: foe.serial, x: this.at.x, y: this.at.y, z: this.at.z }, this.random() < 0.3);
      // The sim's strike lands about when the bolt does (18 m/s).
      if (bolt >= 0) this.strikes.push({ serial: foe.serial, left: this.mouth.distanceTo(this.at) / 18, tier: 1 + Math.floor(this.random() * 3), x: foe.x, z: foe.z });
      if (this.random() < 0.3) core.burn({ slot: index, serial: foe.serial, x: this.at.x, y: this.at.y, z: this.at.z }, 3);
    }
    for (let k = this.strikes.length - 1; k >= 0; k -= 1) {
      const strike = this.strikes[k]!;
      strike.left -= dt;
      if (strike.left > 0) continue;
      core.landBolt(strike.serial, strike.tier, this.at.set(strike.x, 1, strike.z), strike.x, strike.z);
      this.strikes.splice(k, 1);
    }
    this.breathClock -= dt;
    if (this.breathClock <= 0) {
      this.breathClock = 3;
      const lane = MAP_L2_CAU.lanes[Math.floor(this.random() * MAP_L2_CAU.lanes.length)]!;
      const end = lane.points[lane.points.length - 2]!;
      core.breath(this.mouth, end[0], end[1]);
    }
    this.meteorClock -= dt;
    if (this.meteorClock <= 0) {
      this.meteorClock = 4;
      const index = this.pick(crowd);
      const foe = crowd.foes[index];
      if (foe !== undefined) core.meteor(foe.x, foe.z);
    }
    this.bombClock -= dt;
    if (this.bombClock <= 0) {
      this.bombClock = 2.5;
      const slot = MAP_L2_CAU.slots[Math.floor(this.random() * 7)]!;
      core.bomb(slot.pos[0], slot.pos[1], 2.5, 5);
    }
    this.stage.camera.getWorldPosition(this.camPos);
    core.update(dt, now, this.camPos, pointScaleOf(this.stage.renderer, this.stage.camera, this.size));
  }

  dispose(): void {
    this.core.dispose();
  }
}

const percentile = (values: readonly number[], p: number): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]!;
};
const mean = (values: readonly number[]): number => (values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length);
const round2 = (value: number): number => Math.round(value * 100) / 100;

/** GPU frame time through the disjoint timer query, when the browser has it. */
class GpuTimer {
  private readonly ext: { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null;
  private readonly pending: WebGLQuery[] = [];
  readonly samples: number[] = [];

  constructor(private readonly gl: WebGL2RenderingContext) {
    this.ext = gl.getExtension("EXT_disjoint_timer_query_webgl2") as { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null;
  }

  get available(): boolean {
    return this.ext !== null;
  }

  begin(): WebGLQuery | null {
    if (this.ext === null || this.pending.length > 6) return null;
    const query = this.gl.createQuery();
    if (query === null) return null;
    this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, query);
    return query;
  }

  end(query: WebGLQuery | null, record: boolean): void {
    if (this.ext === null || query === null) return;
    this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);
    if (record) this.pending.push(query);
    else this.gl.deleteQuery(query);
  }

  poll(): void {
    if (this.ext === null) return;
    const gl = this.gl;
    while (this.pending.length > 0) {
      const query = this.pending[0]!;
      if (!gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) break;
      const disjoint = gl.getParameter(this.ext.GPU_DISJOINT_EXT) as boolean;
      if (!disjoint) this.samples.push((gl.getQueryParameter(query, gl.QUERY_RESULT) as number) / 1e6);
      gl.deleteQuery(query);
      this.pending.shift();
    }
  }
}

/** The GPU timer's mean, or null with the reason it is not trusted (no extension, ANGLE/Metal, longer than the frame). */
function gpuReading(gpu: GpuTimer, frameMs: number, renderer: string): { gpuMeanMs: number | null; gpuNote: string | null } {
  if (!gpu.available || gpu.samples.length === 0) return { gpuMeanMs: null, gpuNote: "không có bộ đếm GPU" };
  const value = mean(gpu.samples);
  if (/angle/i.test(renderer) && /metal/i.test(renderer)) return { gpuMeanMs: null, gpuNote: "không tin cậy trên ANGLE/Metal (đo được " + round2(value) + " ms)" };
  if (value > frameMs * 1.05) return { gpuMeanMs: null, gpuNote: "không tin cậy: dài hơn cả khung (" + round2(value) + " ms)" };
  return { gpuMeanMs: round2(value), gpuNote: null };
}

function rendererName(renderer: THREE.WebGLRenderer): string {
  const gl = renderer.getContext();
  const info = gl.getExtension("WEBGL_debug_renderer_info");
  return info === null ? String(gl.getParameter(gl.RENDERER)) : String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL));
}

/** Runs the bench on `host`; resolves with the numbers and keeps drawing until window.__dhBenchStop(). */
export async function runCrowdBench(host: HTMLElement, options: BenchOptions): Promise<BenchResult> {
  const painted = options.ground === "painted" ? createMapStage(host, MAP_L2_CAU, options.quality) : null;
  const stage: Stage = painted?.stage ?? createBenchStage(host, options.quality);
  if (painted === null) stage.layers.ground.add(benchGround(MAP_L2_CAU));
  const random = benchRandom(20_261_023);
  const crowd = new BenchCrowd(stage, options.count, random, MAP_L2_CAU, painted?.heightAt ?? (() => 0));
  const fxOn = options.fx !== false;
  const fx = fxOn ? new BenchEffects(stage, crowd, benchRandom(77)) : null;
  const gpu = new GpuTimer(stage.renderer.getContext() as WebGL2RenderingContext);
  // Every material compiled before the clock starts.
  stage.renderer.compile(stage.scene, stage.camera);
  const onResize = (): void => stage.resize();
  window.addEventListener("resize", onResize);
  // The painted stage's camera rig drives the camera unless a preset took it.
  let manualCamera = false;
  window.__dhBenchCamera = (preset) => {
    manualCamera = preset !== "default";
    if (preset === "close") placeCamera(stage.camera, MAP_L2_CAU, 20, 32, 30, new THREE.Vector3(2, 0, -14));
    else if (preset === "fx") placeCamera(stage.camera, MAP_L2_CAU, -10, 30, 26, new THREE.Vector3(1, 1, -9));
    else if (painted === null) placeCamera(stage.camera, MAP_L2_CAU);
  };
  const warmup = options.warmup ?? 1.5;
  const intervals: number[] = [];
  const cpu: number[] = [];
  let calls = 0;
  let triangles = 0;
  let last = performance.now();
  const start = last;
  let running = true;
  let resolveDone: (result: BenchResult) => void = () => {};
  const done = new Promise<BenchResult>((resolve) => (resolveDone = resolve));
  let finished = false;
  const frame = (): void => {
    if (!running) return;
    requestAnimationFrame(frame);
    const now = performance.now();
    const interval = now - last;
    last = now;
    const t0 = performance.now();
    const dt = Math.min(0.05, interval / 1000);
    if (painted !== null && manualCamera) {
      painted.terrain.update(dt);
      painted.water.update(dt);
      painted.paths.update(dt);
    } else painted?.update(dt);
    crowd.update(dt, now / 1000);
    fx?.update(dt, now / 1000, crowd);
    const elapsed = (now - start) / 1000;
    const measuring = !finished && elapsed > warmup;
    const query = gpu.begin();
    stage.render();
    gpu.end(query, measuring);
    gpu.poll();
    const spent = performance.now() - t0;
    if (!measuring) return;
    intervals.push(interval);
    cpu.push(spent);
    const stats = painted?.stage.stats();
    calls = stats?.drawCalls ?? stage.renderer.info.render.calls;
    triangles = stats?.triangles ?? stage.renderer.info.render.triangles;
    if (elapsed > warmup + options.seconds) {
      finished = true;
      const size = new THREE.Vector2();
      stage.renderer.getSize(size);
      const result: BenchResult = {
        frames: intervals.length,
        meanMs: round2(mean(intervals)),
        p95Ms: round2(percentile(intervals, 0.95)),
        drawCalls: calls,
        triangles,
        cpuMeanMs: round2(mean(cpu)),
        cpuP95Ms: round2(percentile(cpu, 0.95)),
        ...gpuReading(gpu, mean(intervals), rendererName(stage.renderer)),
        maxMs: round2(Math.max(...intervals)),
        fps: round2(1000 / Math.max(0.001, mean(intervals))),
        count: options.count,
        quality: options.quality,
        fx: fx !== null,
        ground: painted === null ? "flat" : "painted",
        width: size.x,
        height: size.y,
        dpr: stage.renderer.getPixelRatio(),
        renderer: rendererName(stage.renderer),
        instances: crowd.crowd.size,
        bars: crowd.bars.size,
        gaits: crowd.gaits,
      };
      window.__dhBench = result;
      resolveDone(result);
    }
  };
  requestAnimationFrame(frame);
  window.__dhBenchStop = () => {
    running = false;
    window.removeEventListener("resize", onResize);
    fx?.dispose();
    crowd.dispose();
    if (painted !== null) painted.dispose();
    else stage.dispose();
  };
  return done;
}

// ── Effects showcase (close-up pictures of every effect) ───────────────────

export type ShowcaseEffect = "bolts" | "breath" | "meteor" | "roar" | "telegraphs" | "burn" | "spikes" | "bomb" | "net" | "heal" | "gold" | "hit" | "all";

/** A flat ground for the showcase (the bench ground is flat). */
const FLAT: TerrainView = { group: new THREE.Group(), heightAt: () => 0, dispose: () => {} };

/**
 * Close-up of the effects through the real presenters (fx, telegraphs,
 * heroes with the owner's GLB) fed with made-up SimEvents, around a slow
 * bench crowd. window.__dhFx(name) plays one; the dh-bench scenario takes
 * the pictures (SHOWCASE=1). Bench only: the World is a stub with the map.
 */
export async function runFxShowcase(host: HTMLElement, quality: Quality = "high"): Promise<{ heroLoaded: boolean; guideLoaded: boolean }> {
  const stage = createBenchStage(host, quality);
  stage.layers.ground.add(benchGround(MAP_L2_CAU));
  const random = benchRandom(4242);
  const crowd = new BenchCrowd(stage, 48, random);
  crowd.speedScale = 0.2;
  crowd.hitsPerSecond = 0;
  const heroes = createHeroes(stage, MAP_L2_CAU, { locator: crowd, terrain: { ...FLAT, heightAt: (x, z) => (Math.hypot(x, z) < MAP_L2_CAU.dais.radiusM ? 0.5 : 0) } });
  const telegraphs = createTelegraphs(stage, FLAT, { locator: crowd });
  const fx = createFx(stage, { locator: crowd, terrain: FLAT, heroes });
  await heroes.ready;
  const world = { tick: 0, map: MAP_L2_CAU, enemies: { list: [] }, units: { list: [] }, houses: { list: [] }, traps: { list: [] } } as unknown as World;
  const queue: { at: number; events: SimEvent[] }[] = [];
  let now = performance.now() / 1000;
  let word = 1;
  let telegraphId = 1;
  const ev = (body: Record<string, unknown>): SimEvent => ({ tick: 0, ...body }) as unknown as SimEvent;
  const later = (seconds: number, events: SimEvent[]): void => {
    queue.push({ at: now + seconds, events });
  };
  /** Live foes in view north of the dais, nearest `fromM` metres out first. */
  const foes = (n: number, gait?: Gait, fromM = 6): { index: number; serial: number; x: number; z: number }[] =>
    crowd.foes
      .map((foe, index) => ({ index, serial: foe.serial, x: foe.x, z: foe.z, gait: foe.gait, dying: foe.dying }))
      .filter((foe) => foe.dying === -1 && (gait === undefined || foe.gait === gait) && foe.z < -4 && foe.z > -20 && Math.abs(foe.x) < 12)
      .sort((a, b) => Math.abs(Math.hypot(a.x, a.z) - fromM) - Math.abs(Math.hypot(b.x, b.z) - fromM))
      .slice(0, n);
  const ref = (foe: { index: number; serial: number }) => ({ kind: "enemy", slot: foe.index, serial: foe.serial });
  const play = (name: ShowcaseEffect): void => {
    switch (name) {
      case "bolts":
      case "hit": {
        foes(4, undefined, 13).forEach((foe, k) => {
          const grade = k % 2 === 0 ? "perfect" : "good";
          const id = word++;
          const events = [
            ev({ type: "word-assigned", word: id, text: "fire", kind: "enemy", group: "new", target: ref(foe), firstTier: 1 }),
            ev({ type: "word-progress", word: id, typed: 1, key: "lock", letter: 5 }),
            ev({ type: "word-complete", word: id, text: "fire", kind: "enemy", grade, errors: 0, keyTicks: 40, responseMs: 700, target: ref(foe), activity: "typing-enemy", scored: true, hintUsed: false }),
          ];
          later(k * 0.18, events);
          const flight = Math.hypot(foe.x, foe.z) / 18;
          later(k * 0.18 + flight, [ev({ type: "hit", target: ref(foe), source: { kind: "hero" }, amount: 40 + k * 12, damageType: "word", tier: grade === "perfect" ? 3 : 1, grade, x: foe.x, z: foe.z, hpLeft: 10 })]);
        });
        break;
      }
      case "breath": {
        const lane = MAP_L2_CAU.lanes[0]!;
        const end = lane.points[2]!;
        later(0, [ev({ type: "skill", skill: "breath", stage: "cast", x: end[0], z: end[1] })]);
        break;
      }
      case "meteor": {
        const target = foes(1)[0] ?? { x: 2, z: -12 };
        later(0, [
          ev({ type: "telegraph", id: telegraphId++, owner: "ally", shape: "circle", x: target.x, z: target.z, toX: target.x, toZ: target.z, radiusM: 4, widthM: 0, durationMs: 800, source: { kind: "hero" } }),
          ev({ type: "skill", skill: "skyfire", stage: "cast", x: target.x, z: target.z }),
        ]);
        break;
      }
      case "roar":
        later(0, [ev({ type: "skill", skill: "roar", stage: "cast", x: 0, z: 0 })]);
        break;
      case "telegraphs": {
        const [a, b, c, d] = foes(4, undefined);
        const tg = (body: Record<string, unknown>) => ev({ type: "telegraph", id: telegraphId++, owner: "enemy", source: { kind: "enemy", slot: -1, serial: -1 }, ...body });
        const events: SimEvent[] = [];
        if (a) events.push(tg({ shape: "line", x: a.x, z: a.z, toX: a.x * 0.35, toZ: a.z * 0.35, radiusM: 0, widthM: 1.6, durationMs: 1200 }));
        if (b) events.push(tg({ shape: "line", x: b.x, z: b.z, toX: 0, toZ: 0, radiusM: 0, widthM: 0.35, durationMs: 1000 }));
        if (c) events.push(tg({ shape: "circle", x: c.x, z: c.z, toX: c.x, toZ: c.z, radiusM: 1.4, widthM: 0, durationMs: 900 }));
        if (d) events.push(tg({ shape: "arc", x: d.x, z: d.z, toX: 0, toZ: 0, radiusM: 2.2, widthM: 0, durationMs: 900 }));
        const general = foes(1, "biped")[0];
        if (general) events.push(ev({ type: "aura", enemy: { slot: general.index, serial: general.serial }, aura: "speed", on: true, radiusM: 5 }));
        later(0, events);
        break;
      }
      case "burn":
        later(0, foes(5).map((foe) => ev({ type: "status", target: ref(foe), status: "burn", on: true, durationMs: 3000, x: foe.x, z: foe.z })));
        break;
      case "spikes": {
        const slot = MAP_L2_CAU.slots[2]!;
        later(0, [ev({ type: "trap-trigger", slot: 2, trap: "spikes", x: slot.pos[0], z: slot.pos[1], count: 3 })]);
        break;
      }
      case "bomb": {
        const slot = MAP_L2_CAU.slots[3]!;
        later(0, [ev({ type: "trap-trigger", slot: 3, trap: "pine-bomb", x: slot.pos[0], z: slot.pos[1], count: 6 })]);
        break;
      }
      case "net": {
        const target = foes(1)[0];
        if (target) later(0, [ev({ type: "trap-trigger", slot: 1, trap: "net-launcher", x: target.x, z: target.z, count: 1 }), ev({ type: "status", target: ref(target), status: "grounded", on: true, durationMs: 3000, x: target.x, z: target.z })]);
        break;
      }
      case "heal": {
        const pad = MAP_L2_CAU.slots.find((slot) => slot.id === "h-ne")!;
        later(0, [ev({ type: "house-pulse", slot: 0, house: "herb-hut", x: pad.pos[0], z: pad.pos[1] }), ev({ type: "consumable", item: "small-potion", x: 0, z: 0 })]);
        break;
      }
      case "gold":
        foes(3).forEach((foe, k) => {
          later(k * 0.1, [
            ev({ type: "death", enemy: { slot: foe.index, serial: foe.serial }, foe: "moss-grunt", by: "word", x: foe.x, z: foe.z, material: k === 0 ? "leaf" : k === 1 ? "fur" : "chitin", tier: 2 }),
            ev({ type: "gold", delta: 6, total: 100, reason: "kill" }),
          ]);
          crowd.foes[foe.index]!.dying = 0;
        });
        break;
      case "all":
        (["telegraphs", "bolts", "breath", "meteor", "burn", "spikes", "bomb", "net", "heal", "gold"] as const).forEach((effect, k) => window.setTimeout(() => play(effect), k * 120));
        break;
    }
  };
  window.__dhFx = play;
  window.__dhBenchCamera = (preset) => {
    if (preset === "close") placeCamera(stage.camera, MAP_L2_CAU, 20, 32, 30, new THREE.Vector3(2, 0, -14));
    else if (preset === "fx") placeCamera(stage.camera, MAP_L2_CAU, 18, 30, 34, new THREE.Vector3(0, 1.2, -8));
    else placeCamera(stage.camera, MAP_L2_CAU);
  };
  window.__dhBenchCamera("fx");
  let running = true;
  let last = performance.now();
  const frame = (): void => {
    if (!running) return;
    requestAnimationFrame(frame);
    const t = performance.now();
    const dt = Math.min(0.05, (t - last) / 1000);
    last = t;
    now = t / 1000;
    const due: SimEvent[] = [];
    for (let k = queue.length - 1; k >= 0; k -= 1) {
      if (queue[k]!.at > now) continue;
      due.unshift(...queue[k]!.events);
      queue.splice(k, 1);
    }
    crowd.update(dt, now);
    if (due.length > 0) {
      heroes.onEvents(due, world);
      telegraphs.onEvents(due, world);
      fx.onEvents(due, world);
    }
    const scale = fx.timeScale(t);
    const info = { dt, worldDt: dt * scale, alpha: 1, now: t };
    heroes.frame(world, info);
    telegraphs.frame(world, info);
    fx.frame(world, info);
    stage.render();
    fx.renderOverlay();
  };
  requestAnimationFrame(frame);
  window.__dhShowcaseStop = () => {
    running = false;
    fx.dispose();
    telegraphs.dispose();
    heroes.dispose();
    crowd.dispose();
    stage.dispose();
  };
  return { heroLoaded: heroes.fire !== null, guideLoaded: heroes.guideLoaded };
}
