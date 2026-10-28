/**
 * Model studio (M0b review page, `?bench=models`): the painted L2-cau stage
 * with the owner's models loaded the way the game loads them, a row of
 * actors through the real crowd (bones layers, outline, ghost, family wash),
 * the two Dragons on the dais, and a handle the dh-models scenario drives to
 * take frame sheets: every actor posed in one clip at one time, or running
 * its clips live, at the default camera or close up. View only.
 * Owner: view (M0b models lane).
 */
import * as THREE from "three";
import { MAP_L2_CAU } from "../content/data/maps";
import { HOUSES, TRAPS, UNITS } from "../content/data/our-side";
import type { PlaceholderDef } from "../content/types";
import type { Quality } from "../app/contracts";
import { placeCamera } from "./bench";
import { createCrowd, type CrowdGait, type CrowdInstance, type CrowdLook } from "./crowd";
import type { ClipName } from "./crowd-rig";
import { foeDrawLook, UNIT_DRAW_SCALE } from "./foe-look";
import { createHeroes } from "./heroes";
import { MODEL_SPECS } from "./model-specs";
import { loadCrowdModels } from "./models";
import { createMapStage } from "./stage";

export interface StudioActor {
  readonly content: string;
  readonly x: number;
  readonly z: number;
  /** Drawn height (m) and the screen box of the last frame (CSS px). */
  readonly drawnH: number;
}

export interface StudioHandle {
  readonly ready: boolean;
  readonly loaded: readonly string[];
  readonly missing: readonly string[];
  readonly actors: readonly StudioActor[];
  /** Poses every actor in `clip` at `time` s (frozen), or plays it live from now (time omitted). */
  pose(clip: ClipName, time?: number): void;
  /** Turns every actor (radians; 0 faces the default camera). */
  turn(yaw: number): void;
  /** Camera: "default" (the game's), "row" (the whole row close), "actor" (one actor, index), "dragons". */
  camera(preset: "default" | "row" | "actor" | "dragons", index?: number): void;
  /** Free camera on a point (props, the bridge): distance m, yaw and pitch in degrees; hides the actors' row. */
  look(x: number, z: number, distance: number, yawDeg?: number, pitchDeg?: number): void;
  /** Screen boxes (CSS px) of every actor this frame: feet and head anchors. */
  boxes(): { content: string; x: number; yTop: number; yBase: number; visible: boolean }[];
  stop(): void;
}

declare global {
  interface Window {
    __dhStudio?: StudioHandle;
  }
}

interface Placed {
  content: string;
  handle: number;
  x: number;
  z: number;
  y: number;
  lift: number;
  drawnH: number;
  phase: number;
  layer: string | undefined;
}

/** Placeholder, gait and look of a content key, as the game draws it. */
function actorLook(content: string): { placeholder: PlaceholderDef; gait: CrowdGait; look: CrowdLook; drawnH: number } | null {
  const spec = MODEL_SPECS[content];
  if (spec === undefined) return null;
  if (content.startsWith("enemies/") || content.startsWith("generals/")) {
    const look = foeDrawLook(content.slice(content.indexOf("/") + 1) as never);
    const general = look.tier === "general";
    return {
      placeholder: look.placeholder,
      gait: look.gait,
      look: general ? { foe: true, scale: look.scale, outline: 1.5, rim: 0.95, ash: 0.05, wash: spec.wash } : { foe: true, scale: look.scale, wash: spec.wash },
      drawnH: look.placeholder.sizeM[1] * look.scale,
    };
  }
  const unit = Object.values(UNITS).find((def) => def.show.model === content);
  if (unit) return { placeholder: unit.show.placeholder, gait: "biped", look: { foe: false, scale: UNIT_DRAW_SCALE }, drawnH: unit.show.placeholder.sizeM[1] * UNIT_DRAW_SCALE };
  const thing = [...Object.values(TRAPS), ...Object.values(HOUSES)].find((def) => def.show.model === content);
  if (thing) return { placeholder: thing.show.placeholder, gait: "still", look: { foe: false }, drawnH: thing.show.placeholder.sizeM[1] };
  return null;
}

/** Starts the studio on `host` with `content` model keys in a row; resolves once the models settle. */
export async function runModelStudio(
  host: HTMLElement,
  options: { quality?: Quality; content: readonly string[]; rowZ?: number; spacing?: number; positions?: readonly (readonly [number, number])[] },
): Promise<StudioHandle> {
  const quality = options.quality ?? "high";
  const map = createMapStage(host, MAP_L2_CAU, quality);
  const models = loadCrowdModels(quality);
  map.useModels(models);
  const heroes = createHeroes(map.stage, MAP_L2_CAU, { terrain: map.terrain });
  const crowd = createCrowd(64);
  map.stage.layers.actors.add(crowd.group);
  models.attach(crowd);
  await Promise.all([models.ready, heroes.ready]);

  // Between the dais and the river, across the north path (dry ground; the bridge lane is at x ≈ 0).
  const rowZ = options.rowZ ?? -8;
  const spacing = options.spacing ?? 5.5;
  const placed: Placed[] = [];
  options.content.forEach((content, k) => {
    const look = actorLook(content);
    if (look === null) return;
    const layer = models.layerKey(content);
    const handle = crowd.add(look.placeholder, look.gait, layer, look.look);
    const at = options.positions?.[k];
    const x = at?.[0] ?? (k - (options.content.length - 1) / 2) * spacing;
    const z = at?.[1] ?? rowZ;
    placed.push({ content, handle, x, z, y: map.heightAt(x, z), lift: look.placeholder.hoverM, drawnH: look.drawnH, phase: k * 0.37, layer });
  });

  let clip: ClipName = "idle";
  let frozenAt: number | null = null;
  let started = performance.now() / 1000;
  let yaw = 0;
  let manual = false;
  let running = true;
  const instance: CrowdInstance = { x: 0, y: 0, z: 0, yaw: 0, flash: 0, squash: 1 };
  const v = new THREE.Vector3();

  const draw = (now: number): void => {
    for (const actor of placed) {
      const baked = models.layer(actor.content)?.baked;
      instance.x = actor.x;
      instance.y = actor.y;
      instance.z = actor.z;
      instance.yaw = yaw;
      instance.lift = actor.lift;
      instance.flash = 0;
      instance.squash = 1;
      instance.blend = 0;
      instance.clipB = undefined;
      instance.dissolve = 0;
      if (baked && actor.layer !== undefined && crowd.isSkinned(actor.layer)) {
        const index = baked.index[clip] ?? baked.index.idle ?? baked.index.move ?? 0;
        instance.clip = index;
        instance.clipTime = frozenAt ?? now - started + actor.phase;
      } else {
        instance.clip = undefined;
        instance.clipTime = undefined;
      }
      crowd.set(actor.handle, instance);
    }
    crowd.flush(now);
  };

  let last = performance.now();
  const frame = (): void => {
    if (!running) return;
    requestAnimationFrame(frame);
    const t = performance.now();
    const dt = Math.min(0.05, (t - last) / 1000);
    last = t;
    if (manual) {
      map.terrain.update(dt);
      map.water.update(dt);
      map.paths.update(dt);
    } else map.update(dt);
    heroes.tick(dt, t / 1000);
    draw(t / 1000);
    map.render();
  };
  requestAnimationFrame(frame);

  const handle: StudioHandle = {
    ready: true,
    loaded: models.loaded,
    missing: models.missing,
    actors: placed.map((actor) => ({ content: actor.content, x: actor.x, z: actor.z, drawnH: actor.drawnH })),
    pose(name: ClipName, time?: number): void {
      clip = name;
      frozenAt = time ?? null;
      started = performance.now() / 1000;
    },
    turn(next: number): void {
      yaw = next;
    },
    camera(preset, index = 0): void {
      manual = preset !== "default";
      // Close-ups of one actor hide the Dragons (they stand between the default camera and the row).
      const dragons = map.stage.layers.actors.getObjectByName("heroes");
      if (dragons) dragons.visible = preset !== "actor";
      // ...and the scatter, whose trees can stand between the camera and the actor.
      map.scatter.group.visible = preset !== "actor";
      const camera = map.stage.camera;
      if (preset === "default") {
        map.rig.reset();
        return;
      }
      if (preset === "row") {
        const xs = placed.map((actor) => actor.x);
        const zs = placed.map((actor) => actor.z);
        const span = Math.max(8, Math.max(...xs) - Math.min(...xs));
        placeCamera(camera, MAP_L2_CAU, 0, 26, span * 1.9 + 8, new THREE.Vector3((Math.max(...xs) + Math.min(...xs)) / 2, 2, zs.reduce((a, b) => a + b, 0) / zs.length));
      }
      else if (preset === "actor") {
        const actor = placed[index] ?? placed[0]!;
        placeCamera(camera, MAP_L2_CAU, 18, 22, actor.drawnH * 4.2 + 6, new THREE.Vector3(actor.x, actor.y + actor.lift + actor.drawnH * 0.5, actor.z));
      } else placeCamera(camera, MAP_L2_CAU, 0, 24, 30, new THREE.Vector3(-1, 2.6, 0.5));
    },
    look(x: number, z: number, distance: number, yawDeg = 20, pitchDeg = 28): void {
      manual = true;
      const dragons = map.stage.layers.actors.getObjectByName("heroes");
      if (dragons) dragons.visible = true;
      map.scatter.group.visible = true;
      placeCamera(map.stage.camera, MAP_L2_CAU, yawDeg, pitchDeg, distance, new THREE.Vector3(x, map.heightAt(x, z) + distance * 0.06, z));
    },
    boxes() {
      return placed.map((actor) => {
        const base = map.stage.project(actor.x, actor.y + actor.lift, actor.z, { x: 0, y: 0, visible: false });
        const top = map.stage.project(actor.x, actor.y + actor.lift + actor.drawnH, actor.z, { x: 0, y: 0, visible: false });
        v.set(0, 0, 0);
        return { content: actor.content, x: base.x, yTop: top.y, yBase: base.y, visible: base.visible && top.visible };
      });
    },
    stop(): void {
      running = false;
      heroes.dispose();
      crowd.dispose();
      models.dispose();
      map.dispose();
    },
  };
  window.__dhStudio = handle;
  return handle;
}
