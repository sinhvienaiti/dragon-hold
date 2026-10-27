// M0b: G01's carried banner is the model's own once the model draws (no placeholder over it); the planted one stays.
import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";
import { MAP_L2_CAU } from "../../src/content/data/maps";
import type { SimEvent } from "../../src/content/types";
import type { World } from "../../src/sim/world";
import type { FrameInfo, ScreenPoint } from "../../src/app/contracts";
import type { FoeLocator } from "../../src/view/actors";
import { createBanners } from "../../src/view/banners";
import type { Stage } from "../../src/view/stage";
import type { TerrainView } from "../../src/view/terrain";

beforeAll(() => {
  const g = globalThis as unknown as { document?: unknown };
  g.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => null }) };
});

const FLAT: TerrainView = { group: new THREE.Group(), heightAt: () => 0, dispose: () => {} };

function fakeStage(): Stage {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 16 / 9, 1, 400);
  camera.position.set(0, 60, 60);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const layers = { ground: new THREE.Group(), actors: new THREE.Group(), fx: new THREE.Group() };
  scene.add(layers.ground, layers.actors, layers.fx);
  const renderer = { compile: () => {}, domElement: { style: { transform: "" } } } as unknown as THREE.WebGLRenderer;
  const project = (_x: number, _y: number, _z: number, out: ScreenPoint): ScreenPoint => ((out.visible = true), out);
  return { renderer, scene, camera, layers, quality: "high", project, resize: () => {}, render: () => {}, dispose: () => {} };
}

const GENERAL = { slot: 0, serial: 4, foe: "moss-banner", alive: true, freed: false, x: 0, z: -600000 };
const world = (alive = true): World =>
  ({ tick: 0, map: MAP_L2_CAU, enemies: { list: alive ? [GENERAL] : [] }, traps: { list: [] }, houses: { list: [] }, units: { list: [] } }) as unknown as World;
const info = (now: number): FrameInfo => ({ dt: 1 / 60, worldDt: 1 / 60, alpha: 1, now });
const ev = (body: Record<string, unknown>): SimEvent => ({ tick: 0, ...body }) as unknown as SimEvent;
const locator = (model: boolean): FoeLocator => ({
  locate: (_slot, _serial, _at, out) => (out.set(0, 0, -10), true),
  drawsModel: () => model,
});
/** Banner groups drawn now (pole and cloth), the fallen ones included. */
const drawnBanners = (stage: Stage): number => {
  let n = 0;
  stage.layers.actors.traverseVisible((object) => {
    if (object.name === "cloth") n += 1;
  });
  return n;
};

describe("M0b banners over the G01 model", () => {
  it("draws the carried placeholder while a primitive stands in, and drops it on death", () => {
    const stage = fakeStage();
    const banners = createBanners(stage, FLAT, { locator: locator(false) });
    banners.frame(world(), info(0));
    expect(banners.carried).toBe(1);
    expect(banners.carriedPlaceholders).toBe(1);
    expect(drawnBanners(stage)).toBe(1);
    banners.onEvents([ev({ type: "death", foe: "moss-banner", enemy: { slot: 0, serial: 4 }, x: 0, z: -10 })], world(false));
    banners.frame(world(false), info(16));
    // The placeholder falls and lies a while.
    expect(drawnBanners(stage)).toBe(1);
    banners.dispose();
  });

  it("draws no placeholder over the model: no carried cloth, no wind-up lift, no fallen copy", () => {
    const stage = fakeStage();
    const banners = createBanners(stage, FLAT, { locator: locator(true) });
    banners.frame(world(), info(0));
    expect(banners.carried).toBe(1);
    expect(banners.carriedPlaceholders).toBe(0);
    expect(drawnBanners(stage)).toBe(0);
    banners.onEvents([ev({ type: "banner", banner: -1, owner: { slot: 0, serial: 4 }, stage: "windup", x: 0, z: -10, radiusM: 5, durationMs: 1000 })], world());
    banners.frame(world(), info(100));
    expect(drawnBanners(stage)).toBe(0);
    banners.onEvents([ev({ type: "death", foe: "moss-banner", enemy: { slot: 0, serial: 4 }, x: 0, z: -10 })], world(false));
    banners.frame(world(false), info(116));
    expect(drawnBanners(stage)).toBe(0);
    expect(banners.carried).toBe(0);
    banners.dispose();
  });

  it("keeps the planted banner (flag word, pillar, ring) with the model", () => {
    const stage = fakeStage();
    const banners = createBanners(stage, FLAT, { locator: locator(true) });
    banners.frame(world(), info(0));
    banners.onEvents([ev({ type: "banner", banner: 0, owner: { slot: 0, serial: 4 }, stage: "plant", x: 0, z: -10, radiusM: 5, durationMs: 8000 })], world());
    banners.frame(world(), info(16));
    expect(banners.planted).toBe(1);
    expect(banners.carried).toBe(0);
    expect(drawnBanners(stage)).toBe(1);
    banners.dispose();
  });
});
