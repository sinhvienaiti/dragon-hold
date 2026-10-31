// Source: adapted from src/view/foe-showcase.ts (round 10, the foe blows showcase).
/**
 * Fire test A bench (`?bench=fire`, driven by scripts/visual/scenarios/dh-fire-bench.mjs; DRAGON_FIRE_DIAGNOSIS §3):
 * the painted L2-cau map at the play camera, the owner's foe model, the Dragons on the dais and the real fx
 * presenter fed made-up events: one foe stands where the caller puts it (the ford, the dais sand, dark ground) and
 * takes a STRONG (Perfect) word shot: word-complete now, the hit 12 ticks later (DAMAGE.strikeDelayTicks), as the
 * sim sends them. With no `fire` it draws test C's (fire-c.ts, the default fire since 01/11); `?fire=r10` round 10's
 * strong hit, `?fire=a` test A's (fire-a.ts), `?fire=b` test B's (fire-b.ts);
 * `grade=shoulder` turns the grade's yellow shoulder on (test bench only). Runs on requestAnimationFrame, so a held
 * clock steps it frame by frame.
 *
 * Measures: `mask(kind)` renders the fire or the smoke flipbooks alone (their coverage, red, depth-tested against the
 * scene) at half size and returns it as a PNG data URL; `mask("heroes")` the Dragons' opaque meshes as they show
 * (test B: units stay over the effects); `track()` gives the screen points the gates need.
 * View only: the World is a stub with the map and the staged foe. Owner: view-crowd-fx (LANES.md).
 */
import * as THREE from "three";
import { MAP_L2_CAU } from "../content/data/maps";
import { DAMAGE } from "../content/rules";
import type { EnemyId, SimEvent } from "../content/types";
import type { Quality, ScreenPoint } from "../app/contracts";
import type { World } from "../sim/world";
import { BenchCrowd, benchRandom } from "./bench";
import type { FlipbookId } from "./flipbook";
import { createFx } from "./fx";
import { FIRE_A } from "./fire-a";
import { FIRE_B } from "./fire-b";
import { FIRE_C } from "./fire-c";
import { createHeroes } from "./heroes";
import { loadCrowdModels } from "./models";
import { createMapStage, type MapStage } from "./stage";

export interface FireBench {
  /** Puts the foe at (x, z) metres; the other foes stand far off. Returns its slot and serial. */
  place(x: number, z: number): { slot: number; serial: number } | null;
  /** Moves the foe off the field (a reference frame without it) or back. */
  hide(hidden: boolean): void;
  /** A Perfect word on the foe: word-complete now, its hit `DAMAGE.strikeDelayTicks` later. Returns the hit's time. */
  shoot(power?: number): number;
  /** Screen points of this frame (CSS px): the struck point, the foe's base and top, live damage numbers, the sun. */
  track(): FireTrack;
  /** The fire ("fire") or smoke ("smoke") flipbooks alone, coverage in red, or the Dragons ("heroes") as they show; half size, as a PNG data URL. */
  mask(kind: "fire" | "smoke" | "heroes"): string;
  ready(): boolean;
  dispose(): void;
}

export interface FireTrack {
  hit: ScreenPoint;
  base: ScreenPoint;
  top: ScreenPoint;
  numbers: [number, number, number, number][];
  /** A metre toward the sun from the struck point, on screen. */
  sun: ScreenPoint;
  live: Record<string, number>;
  hits: number;
  shotAt: number | null;
}

declare global {
  interface Window {
    __dhFire?: FireBench;
  }
}

const FOE: EnemyId = "moss-grunt";
const FIRE_IDS: FlipbookId[] = ["impact-burst", "impact-burst-a", "impact-big", "fire-burst", "impact-cel-b", "impact-burst-c"];
const SMOKE_IDS: FlipbookId[] = ["smoke-mask", "smoke-mask-a", "smoke-roll", "smoke-cel-b", "smoke-c"];
const MASK_LAYER = 7;

/** Dev only, as app.ts dimToDusk: the dark-ground test (VFX_STANDARD §4.5). */
function dusk(map: MapStage): void {
  const { sky, key, fill } = map.stage.lights;
  sky.intensity *= 0.3;
  key.intensity *= 0.28;
  fill.intensity *= 0.5;
  const look = map.terrain.look.uniforms;
  look.uFogCool.value.multiplyScalar(0.3);
  look.uFogWarm.value.multiplyScalar(0.3);
  look.uSunColor.value.multiplyScalar(0.4);
  const mist = map.terrain.look.mist.clone().multiplyScalar(0.3);
  map.scene.background = mist;
  map.renderer.setClearColor(mist, 1);
}

export async function runFireBench(host: HTMLElement, quality: Quality = "high", dark = false, shoulder = false): Promise<FireBench> {
  const painted = createMapStage(host, MAP_L2_CAU, quality);
  const stage = painted.stage;
  if (dark) dusk(painted);
  stage.setGradeShoulder(shoulder);
  const models = loadCrowdModels(quality);
  painted.useModels(models);
  await models.ready;
  await painted.groundBaked;
  const random = benchRandom(31_10);
  const crowd = new BenchCrowd(stage, 12, random, MAP_L2_CAU, painted.heightAt, models);
  crowd.speedScale = 0;
  crowd.hitsPerSecond = 0;
  const terrain = { group: new THREE.Group(), heightAt: painted.heightAt, dispose: () => {} };
  const heroes = createHeroes(stage, MAP_L2_CAU, { locator: crowd, terrain });
  const fx = createFx(stage, { locator: crowd, terrain, heroes, shake: (px) => painted.rig.shake(px) });
  await heroes.ready;
  const list: ({ serial: number; foe: EnemyId; x: number; z: number; alive: boolean } | undefined)[] = [];
  const world = { tick: 0, map: MAP_L2_CAU, enemies: { list }, units: { list: [] }, houses: { list: [] }, traps: { list: [] }, lanes: [], words: { live: [] } } as unknown as World;
  const slot = crowd.foes.findIndex((foe) => foe.id === FOE);
  const pinned = new Map<number, { x: number; z: number }>();
  crowd.foes.forEach((_, index) => pinned.set(index, { x: 400 + index * 3, z: 400 }));
  const queue: { at: number; events: SimEvent[] }[] = [];
  let now = performance.now();
  let spot = { x: 0, z: 0 };
  let hits = 0;
  let shotAt: number | null = null;
  const ev = (body: Record<string, unknown>): SimEvent => ({ tick: 0, ...body }) as unknown as SimEvent;
  const v = new THREE.Vector3();
  const project = (x: number, y: number, z: number): ScreenPoint => {
    const out = { x: 0, y: 0, visible: false };
    stage.project(x, y, z, out);
    return out;
  };

  const place = (x: number, z: number): { slot: number; serial: number } | null => {
    if (slot < 0) return null;
    const f = crowd.foes[slot]!;
    spot = { x, z };
    pinned.set(slot, { x, z });
    f.dying = -1;
    f.hp = 1;
    list[slot] = { serial: f.serial, foe: FOE, x, z, alive: true };
    return { slot, serial: f.serial };
  };

  const shoot = (power = 128): number => {
    const f = crowd.foes[slot]!;
    const target = { kind: "enemy", slot, serial: f.serial };
    shotAt = now;
    queue.push({ at: now, events: [ev({ type: "word-complete", word: 0, target, grade: "perfect", errors: 0 })] });
    const hitAt = now + (DAMAGE.strikeDelayTicks * 1000) / 60 - 1;
    queue.push({ at: hitAt, events: [ev({ type: "hit", target, source: { kind: "hero" }, amount: power, damageType: "word", tier: 3, grade: "perfect", x: spot.x, z: spot.z, hpLeft: 40, by: "word", power })] });
    return hitAt;
  };

  // The struck point (fx.ts foePoint: the locator's centre).
  const hitPoint = (out: THREE.Vector3): THREE.Vector3 => {
    const f = crowd.foes[slot]!;
    if (!crowd.locate(slot, f.serial, "center", out)) out.set(spot.x, painted.heightAt(spot.x, spot.z) + 1, spot.z);
    return out;
  };

  const sunDir = stage.lights.key.position.clone().sub(stage.lights.key.target.position).normalize();

  let running = true;
  let last = performance.now();
  const frame = (): void => {
    if (!running) return;
    requestAnimationFrame(frame);
    const t = performance.now();
    const dt = Math.min(0.05, (t - last) / 1000);
    last = t;
    now = t;
    for (const [index, at] of pinned) {
      const f = crowd.foes[index]!;
      f.x = f.ringX = at.x;
      f.z = f.ringZ = at.z;
      f.radius = Math.max(1, Math.hypot(at.x, at.z));
      f.standing = 0.01;
      f.attackIn = 1e9;
    }
    const due: SimEvent[] = [];
    for (let k = 0; k < queue.length; ) {
      const item = queue[k]!;
      if (item.at > now) {
        k += 1;
        continue;
      }
      due.push(...item.events);
      queue.splice(k, 1);
    }
    crowd.update(dt, t / 1000);
    painted.update(dt);
    if (due.length > 0) {
      hits += due.filter((e) => e.type === "hit").length;
      heroes.onEvents(due, world);
      fx.onEvents(due, world);
    }
    const scale = fx.timeScale(t);
    const info = { dt, worldDt: dt * scale, alpha: 1, now: t };
    heroes.frame(world, info);
    fx.frame(world, info);
    painted.render();
    fx.renderOverlay();
  };
  requestAnimationFrame(frame);

  const target = new THREE.WebGLRenderTarget(4, 4, { depthBuffer: true });
  const size = new THREE.Vector2();
  const clear = new THREE.Color();

  const heroMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
  const heroMeshes = (): THREE.Object3D[] => {
    const out: THREE.Object3D[] = [];
    stage.scene.getObjectByName("heroes")?.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh || !object.visible) return;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      if (materials.some((m) => m.transparent)) return;
      out.push(object);
    });
    return out;
  };

  const mask = (kind: "fire" | "smoke" | "heroes"): string => {
    const r = stage.renderer;
    const scene = stage.scene;
    const camera = stage.camera;
    r.getDrawingBufferSize(size);
    const w = Math.max(2, Math.round(size.x / 2));
    const h = Math.max(2, Math.round(size.y / 2));
    target.setSize(w, h);
    const pools = kind === "heroes" ? [] : (kind === "fire" ? FIRE_IDS : SMOKE_IDS).map((id) => fx.core.flip.pools[id]);
    const heroes = kind === "heroes" ? heroMeshes() : [];
    const background = scene.background;
    const autoClear = r.autoClear;
    r.getClearColor(clear);
    const clearAlpha = r.getClearAlpha();
    const shadows = r.shadowMap.autoUpdate;
    // The scene first (its depth), then only the pools over a cleared colour: what the foe hides stays hidden.
    r.shadowMap.autoUpdate = false;
    r.setRenderTarget(target);
    r.setClearColor(0x000000, 0);
    r.clear(true, true, true);
    r.render(scene, camera);
    // The scene's background left its colour as the GL clear value (WebGLBackground): set black again first.
    r.setClearColor(0x000000, 0);
    r.clearColor();
    r.autoClear = false;
    scene.background = null;
    const saved = camera.layers.mask;
    camera.layers.set(MASK_LAYER);
    for (const pool of pools) {
      pool.mesh.layers.enable(MASK_LAYER);
      pool.mesh.material.uniforms.uMaskOut!.value = 1;
    }
    // The Dragons: their own meshes again over their depth (equal depth passes), in plain red.
    for (const mesh of heroes) mesh.layers.enable(MASK_LAYER);
    const override = scene.overrideMaterial;
    if (heroes.length > 0) scene.overrideMaterial = heroMaterial;
    r.render(scene, camera);
    scene.overrideMaterial = override;
    for (const mesh of heroes) mesh.layers.disable(MASK_LAYER);
    for (const pool of pools) {
      pool.mesh.layers.disable(MASK_LAYER);
      pool.mesh.material.uniforms.uMaskOut!.value = 0;
    }
    camera.layers.mask = saved;
    scene.background = background;
    r.autoClear = autoClear;
    r.shadowMap.autoUpdate = shadows;
    r.setClearColor(clear, clearAlpha);
    const pixels = new Uint8Array(w * h * 4);
    r.readRenderTargetPixels(target, 0, 0, w, h, pixels);
    r.setRenderTarget(null);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    const image = ctx.createImageData(w, h);
    for (let y = 0; y < h; y += 1) {
      const row = (h - 1 - y) * w * 4;
      for (let x = 0; x < w; x += 1) {
        const value = pixels[row + x * 4]!;
        const o = (y * w + x) * 4;
        image.data[o] = image.data[o + 1] = image.data[o + 2] = value;
        image.data[o + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
    return canvas.toDataURL("image/png");
  };

  const handle: FireBench = {
    place,
    hide(hidden) {
      if (slot < 0) return;
      pinned.set(slot, hidden ? { x: 420, z: 420 } : spot);
    },
    shoot,
    track() {
      hitPoint(v);
      const hit = project(v.x, v.y, v.z);
      const f = crowd.foes[slot]!;
      const base = crowd.locate(slot, f.serial, "base", v) ? project(v.x, v.y, v.z) : hit;
      const top = crowd.locate(slot, f.serial, "top", v) ? project(v.x, v.y, v.z) : hit;
      hitPoint(v);
      const sun = project(v.x + sunDir.x, v.y + sunDir.y, v.z + sunDir.z);
      const numbers: [number, number, number, number][] = [];
      const field = fx.numbers;
      const box = { x: 0, y: 0, w: 0, h: 0 };
      for (let i = 0; i < field.alive.length; i += 1) {
        if (field.alive[i] !== 1) continue;
        field.box(i, box);
        numbers.push([box.x, box.y, box.w, box.h]);
      }
      const live: Record<string, number> = {};
      for (const id of [...FIRE_IDS, ...SMOKE_IDS, "halo-a", "scorch-a", "halo-b", "scorch-b", "sparks-c", "scorch-c"] as FlipbookId[]) live[id] = fx.core.flip.pools[id].live;
      return { hit, base, top, numbers, sun, live, hits, shotAt };
    },
    mask,
    // Only the fire on the bench waits for its atlases (fx.ts fetches A's for `fire=a` and `fire=b`, B's for `fire=b`
    // and C's `smoke=cel`, C's for the default).
    ready: () =>
      fx.core.flip.pools["impact-burst"].ready &&
      (!(FIRE_A.on || FIRE_B.on) || (fx.core.flip.pools["impact-burst-a"].ready && fx.core.flip.pools["smoke-mask-a"].ready && fx.core.flip.pools["scorch-a"].ready)) &&
      (!FIRE_B.on || (fx.core.flip.pools["impact-cel-b"].ready && fx.core.flip.pools["smoke-cel-b"].ready && fx.core.flip.pools["halo-b"].ready && fx.core.flip.pools["scorch-b"].ready)) &&
      (!FIRE_C.on || (fx.core.flip.pools["impact-burst-c"].ready && (!FIRE_C.celSmoke || fx.core.flip.pools["smoke-cel-b"].ready) && fx.core.flip.pools["smoke-c"].ready && fx.core.flip.pools["sparks-c"].ready && fx.core.flip.pools["scorch-c"].ready)),
    dispose: () => {
      running = false;
      target.dispose();
      heroMaterial.dispose();
      fx.dispose();
      heroes.dispose();
      crowd.dispose();
    },
  };
  window.__dhFire = handle;
  return handle;
}
