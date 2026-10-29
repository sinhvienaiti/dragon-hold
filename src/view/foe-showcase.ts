/**
 * Foe blows showcase (VFX step 3 sheets, `?bench=foes`, driven by scripts/visual/scenarios/dh-vfx-foes.mjs): the
 * painted L2-cau map, the owner's foe models through the bench crowd, the two Dragons on the dais, and the real
 * presenters (fx, telegraphs, heroes) fed with made-up SimEvents: one foe of a kind stands where the caller puts it
 * and winds up, strikes the Dragon, or comes in. Runs on requestAnimationFrame, so a held clock steps it frame by
 * frame. View only: the World is a stub with the map and the staged foes.
 * Owner: view-crowd-fx (LANES.md).
 */
import * as THREE from "three";
import { MAP_L2_CAU } from "../content/data/maps";
import { ENEMIES } from "../content/data/enemies";
import type { EnemyId, SimEvent } from "../content/types";
import type { Quality, ScreenPoint } from "../app/contracts";
import type { World } from "../sim/world";
import { BenchCrowd, benchRandom } from "./bench";
import type { CameraView } from "./camera";
import { createFx } from "./fx";
import { createHeroes } from "./heroes";
import { loadCrowdModels } from "./models";
import { createMapStage, type MapStage } from "./stage";
import { createTelegraphs } from "./telegraphs";

export interface FoeShowcase {
  /** Staged foe slots by kind (index in the bench crowd). */
  readonly staged: Readonly<Record<string, number>>;
  /** Puts the foe of `foe` at (x, z) metres, facing the dais; the other foes stand far off. */
  place(foe: EnemyId, x: number, z: number): { slot: number; serial: number } | null;
  /** Its wind-up now (with its red telegraph), its strike on Hỏa Long after the wind-up. */
  attack(foe: EnemyId): number;
  /** It comes in where it stands (sim `spawn`). */
  spawn(foe: EnemyId): void;
  view(view: Partial<CameraView>): void;
  project(x: number, y: number, z: number): ScreenPoint;
  /** Screen points of the staged foe's middle, Hỏa Long's body and the dais edge it strikes. */
  points(foe: EnemyId): { foe: ScreenPoint; dragon: ScreenPoint; edge: ScreenPoint };
  /** fx core counters (strikes, impacts, spawns). */
  counts(): { strikes: number; impacts: number; spawns: number; windups: number; flights: number };
  dispose(): void;
}

declare global {
  interface Window {
    __dhFoes?: FoeShowcase;
  }
}

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

export async function runFoeShowcase(host: HTMLElement, quality: Quality = "high", dark = false): Promise<FoeShowcase> {
  const painted = createMapStage(host, MAP_L2_CAU, quality);
  const stage = painted.stage;
  if (dark) dusk(painted);
  const models = loadCrowdModels(quality);
  painted.useModels(models);
  await models.ready;
  await painted.groundBaked;
  const random = benchRandom(29_10);
  // 12 foes: the bench mix gives every kind at least one.
  const crowd = new BenchCrowd(stage, 12, random, MAP_L2_CAU, painted.heightAt, models);
  crowd.speedScale = 0;
  crowd.hitsPerSecond = 0;
  const terrain = { group: new THREE.Group(), heightAt: painted.heightAt, dispose: () => {} };
  const heroes = createHeroes(stage, MAP_L2_CAU, { locator: crowd, terrain });
  const telegraphs = createTelegraphs(stage, terrain, { locator: crowd });
  const fx = createFx(stage, { locator: crowd, terrain, heroes, shake: (px) => painted.rig.shake(px) });
  await heroes.ready;
  const list: ({ serial: number; foe: EnemyId; x: number; z: number } | undefined)[] = [];
  const world = { tick: 0, map: MAP_L2_CAU, enemies: { list }, units: { list: [] }, houses: { list: [] }, traps: { list: [] } } as unknown as World;
  const staged: Record<string, number> = {};
  crowd.foes.forEach((foe, index) => {
    if (staged[foe.id] === undefined) staged[foe.id] = index;
  });
  const pinned = new Map<number, { x: number; z: number }>();
  // Everyone not placed stands far off the play area.
  crowd.foes.forEach((foe, index) => pinned.set(index, { x: 400 + index * 3, z: 400 }));
  const queue: { at: number; events: SimEvent[]; strike?: number }[] = [];
  let now = performance.now();
  let telegraphId = 1;
  const ev = (body: Record<string, unknown>): SimEvent => ({ tick: 0, ...body }) as unknown as SimEvent;
  const out: ScreenPoint = { x: 0, y: 0, visible: false };
  const v = new THREE.Vector3();
  const mouth = new THREE.Vector3();

  const place = (foe: EnemyId, x: number, z: number): { slot: number; serial: number } | null => {
    const slot = staged[foe];
    if (slot === undefined) return null;
    const f = crowd.foes[slot]!;
    pinned.set(slot, { x, z });
    f.dying = -1;
    f.hp = 1;
    list[slot] = { serial: f.serial, foe, x, z };
    return { slot, serial: f.serial };
  };

  const attack = (foe: EnemyId): number => {
    const slot = staged[foe];
    if (slot === undefined) return 0;
    const f = crowd.foes[slot]!;
    const def = ENEMIES[foe];
    const windupMs = def.attack.windupMs;
    const source = { kind: "enemy", slot, serial: f.serial };
    const target = { kind: "hero" };
    const flyer = def.gait === "flyer";
    const ranged = def.attack.kind === "ranged";
    queue.push({
      at: now,
      strike: 0,
      events: [
        ev({ type: "attack", source, target, stage: "windup", x: f.x, z: f.z, tx: 0, tz: 0 }),
        ev({ type: "telegraph", id: telegraphId++, owner: "enemy", shape: flyer ? "circle" : ranged ? "line" : "arc", x: f.x, z: f.z, toX: 0, toZ: 0, radiusM: flyer ? 1.2 : ranged ? 0 : 1.5, widthM: ranged && !flyer ? 0.4 : 0, durationMs: windupMs, source }),
      ],
    });
    queue.push({
      at: now + windupMs,
      strike: 1,
      events: [
        ev({ type: "attack", source, target, stage: "strike", x: f.x, z: f.z, tx: 0, tz: 0 }),
        ev({ type: "hit", target, source, amount: def.attack.damage, damageType: def.attack.damageType, tier: 1, grade: null, x: 0, z: 0, hpLeft: 900 }),
      ],
    });
    return windupMs;
  };

  const spawn = (foe: EnemyId): void => {
    const slot = staged[foe];
    if (slot === undefined) return;
    const f = crowd.foes[slot]!;
    queue.push({ at: now, events: [ev({ type: "spawn", enemy: { slot, serial: f.serial }, foe, lane: "a", x: f.x, z: f.z, elite: false, cluster: 0 })] });
  };

  let running = true;
  let last = performance.now();
  const frame = (): void => {
    if (!running) return;
    requestAnimationFrame(frame);
    const t = performance.now();
    const dt = Math.min(0.05, (t - last) / 1000);
    last = t;
    now = t;
    // Pinned foes stand still, facing the dais, and never time out of the bench's ring.
    for (const [slot, at] of pinned) {
      const f = crowd.foes[slot]!;
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
      if (item.strike !== undefined) {
        const source = item.events[0] as unknown as { source: { slot: number } };
        crowd.foes[source.source.slot]?.motion?.attack(item.strike === 0 ? "windup" : "strike");
      }
      queue.splice(k, 1);
    }
    crowd.update(dt, t / 1000);
    painted.update(dt);
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
    painted.render();
    fx.renderOverlay();
  };
  requestAnimationFrame(frame);

  const handle: FoeShowcase = {
    staged,
    place,
    attack,
    spawn,
    view: (view) => painted.rig.setView(view, true),
    project: (x, y, z) => {
      stage.project(x, y, z, out);
      return { ...out };
    },
    points: (foe) => {
      const slot = staged[foe] ?? -1;
      const f = crowd.foes[slot];
      const fp = { x: 0, y: 0, visible: false };
      if (f !== undefined && crowd.locate(slot, f.serial, "center", v)) {
        stage.project(v.x, v.y, v.z, out);
        Object.assign(fp, out);
      }
      heroes.mouth(mouth);
      stage.project(mouth.x, mouth.y - 0.9, mouth.z, out);
      const dragon = { ...out };
      const d = f === undefined ? 1 : Math.hypot(f.x, f.z) || 1;
      const ex = f === undefined ? 0 : (f.x / d) * MAP_L2_CAU.dais.radiusM * 0.94;
      const ez = f === undefined ? 0 : (f.z / d) * MAP_L2_CAU.dais.radiusM * 0.94;
      stage.project(ex, painted.heightAt(ex, ez), ez, out);
      return { foe: fp, dragon, edge: { ...out } };
    },
    counts: () => {
      const core = fx.core.foes;
      return { strikes: core.strikes, impacts: core.impacts, spawns: core.spawns, windups: core.windupCount, flights: core.flightCount };
    },
    dispose: () => {
      running = false;
      fx.dispose();
      telegraphs.dispose();
      heroes.dispose();
      crowd.dispose();
    },
  };
  window.__dhFoes = handle;
  return handle;
}
