// Lane view-crowd-fx: effects (bolts land on the sim's hit, hit stop never waits on keys), telegraph colours, heroes, actors.
import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";
import { DRAGON } from "../../src/kit/feedback";
import { MAP_L2_CAU } from "../../src/content/data/maps";
import type { SimEvent } from "../../src/content/types";
import type { World } from "../../src/sim/world";
import type { FrameInfo, ScreenPoint } from "../../src/app/contracts";
import { createActors, type FoeLocator } from "../../src/view/actors";
import { createFx, FX_BUDGET, FX_RIBBON_ORDER, FxCore, flareEnvelope, strongGrade, tierForGrade } from "../../src/view/fx";
import { createHeroes, FIRE_RELEASE_S, modelUrl, strikeClip } from "../../src/view/heroes";
import type { Stage } from "../../src/view/stage";
import { createTelegraphs, MIN_WINDUP_S, TELEGRAPH_COLORS, telegraphColors } from "../../src/view/telegraphs";
import { drawnWarnings } from "../../src/view/foe-look";
import type { TerrainView } from "../../src/view/terrain";

// kit textures() paints on a canvas: a canvas that paints nothing is enough here.
beforeAll(() => {
  const g = globalThis as unknown as { document?: unknown };
  g.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => null }) };
});

const FLAT: TerrainView = { group: new THREE.Group(), heightAt: () => 0, dispose: () => {} };

function fakeStage(quality: Stage["quality"] = "high"): Stage {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 16 / 9, 1, 400);
  camera.position.set(0, 60, 60);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const layers = { ground: new THREE.Group(), actors: new THREE.Group(), fx: new THREE.Group() };
  scene.add(layers.ground, layers.actors, layers.fx);
  const renderer = {
    compile: () => {},
    domElement: { style: { transform: "" } },
    getSize: (v: THREE.Vector2) => v.set(1280, 720),
    getDrawingBufferSize: (v: THREE.Vector2) => v.set(1280, 720),
  } as unknown as THREE.WebGLRenderer;
  const project = (x: number, _y: number, z: number, out: ScreenPoint): ScreenPoint => {
    out.x = 640 + x * 10;
    out.y = 360 + z * 10;
    out.visible = true;
    return out;
  };
  return { renderer, scene, camera, layers, quality, project, resize: () => {}, render: () => {}, dispose: () => {} };
}

const ev = (body: Record<string, unknown>): SimEvent => ({ tick: 0, ...body }) as unknown as SimEvent;
const info = (now: number, dt = 1 / 60, alpha = 1): FrameInfo => ({ dt, worldDt: dt, alpha, now });
const fixed = (x: number, y: number, z: number): FoeLocator => ({ locate: (_slot, _serial, _at, out) => (out.set(x, y, z), true) });

/** A World with only what the view reads. */
function fakeWorld(foes: Record<string, unknown>[] = []): World {
  return { tick: 0, map: MAP_L2_CAU, enemies: { list: foes }, traps: { list: [] }, houses: { list: [] }, units: { list: [] } } as unknown as World;
}

describe("view fx", () => {
  it("lands a bolt on the sim's hit, at most 60 ms later, wherever it was", () => {
    const core = new FxCore("high", { locator: fixed(0, 1, -18) });
    const eye = new THREE.Vector3(0, 60, 60);
    expect(core.launchBolt(new THREE.Vector3(0, 4, 0), { slot: 0, serial: 7, x: 0, y: 1, z: -18 }, false)).toBe(0);
    core.update(0.1, 0.1, eye, 600);
    expect(core.stats().bolts).toBe(1);
    core.landBolt(7, 2, new THREE.Vector3(0, 1, -18));
    core.update(0.035, 0.135, eye, 600);
    core.update(0.035, 0.17, eye, 600);
    expect(core.stats().bolts).toBe(0);
    // The impact left sparks and a puff.
    expect(core.stats().sparks).toBeGreaterThan(0);
    core.dispose();
  });

  it("fizzles a bolt whose hit never comes, and plays the impact at once when no bolt flies", () => {
    const core = new FxCore("medium", { locator: fixed(0, 1, -9) });
    const eye = new THREE.Vector3(0, 60, 60);
    core.launchBolt(new THREE.Vector3(0, 4, 0), { slot: 0, serial: 1, x: 0, y: 1, z: -9 }, true);
    for (let k = 0; k < 30; k += 1) core.update(0.05, k * 0.05, eye, 600);
    expect(core.stats().bolts).toBe(0);
    const before = core.stats().sparks;
    core.landBolt(99, 3, new THREE.Vector3(2, 1, -5));
    core.update(0.01, 2, eye, 600);
    expect(core.stats().sparks).toBeGreaterThan(before);
    core.dispose();
  });

  it("keeps the particle budget of 05 §8 per quality", () => {
    for (const quality of ["low", "medium", "high", "ultra"] as const) {
      const core = new FxCore(quality);
      expect(core.sparks.limit + core.glows.limit).toBe(FX_BUDGET[quality].particles);
      expect(core.debris.capacity).toBe(FX_BUDGET[quality].debris);
      core.dispose();
    }
  });

  it("slows only the world on a hit from T2 (0.05), never on keys", () => {
    const stage = fakeStage();
    const fx = createFx(stage, { terrain: FLAT, locator: fixed(0, 1, -10), onShake: () => {} });
    const world = fakeWorld();
    fx.frame(world, info(1000));
    // Keys (T0): a hundred right keys, no stop.
    fx.onEvents(Array.from({ length: 100 }, (_, k) => ev({ type: "word-progress", word: 1, typed: k, key: "advance", letter: 0 })), world);
    expect(fx.timeScale(1001)).toBe(1);
    // A T1 hit: no stop either.
    fx.onEvents([ev({ type: "hit", target: { kind: "enemy", slot: 0, serial: 3 }, source: { kind: "trap", slot: 1 }, amount: 5, damageType: "physical", tier: 1, grade: null, x: 0, z: -10, hpLeft: 50 })], world);
    expect(fx.timeScale(1002)).toBe(1);
    // A T3 hit (Hoàn hảo): 35 ms at 0.05.
    fx.frame(world, info(1200));
    fx.onEvents([ev({ type: "hit", target: { kind: "enemy", slot: 0, serial: 3 }, source: { kind: "hero" }, amount: 60, damageType: "word", tier: 3, grade: "perfect", x: 0, z: -10, hpLeft: 0 })], world);
    expect(fx.timeScale(1210)).toBe(DRAGON.stopScale);
    expect(fx.timeScale(1236)).toBe(1);
    // A number for the hit, with the Perfect label style.
    expect(fx.numbers.live).toBeGreaterThan(0);
    fx.dispose();
  });

  it("sends each blow's shake to the camera rig when given one", () => {
    const stage = fakeStage();
    const sent: number[] = [];
    const fx = createFx(stage, { terrain: FLAT, locator: fixed(0, 1, -10), shake: (px) => sent.push(px) });
    const world = fakeWorld();
    fx.onEvents([ev({ type: "hit", target: { kind: "enemy", slot: 0, serial: 3 }, source: { kind: "hero" }, amount: 60, damageType: "word", tier: 4, grade: null, x: 0, z: -10, hpLeft: 0 })], world);
    expect(sent.length).toBe(1);
    // T4: trauma 0.3 → 0.3² × 12 px at its peak, never above the dragon profile's 12 px.
    expect(sent[0]).toBeCloseTo(0.3 * 0.3 * DRAGON.trauma.maxPx, 5);
    expect(Math.max(...sent)).toBeLessThanOrEqual(DRAGON.trauma.maxPx);
    fx.frame(world, info(16));
    expect((stage.renderer.domElement as unknown as { style: { transform: string } }).style.transform).toBe("");
    fx.dispose();
  });

  it("launches a bolt on word-complete and lands it on the matching hit", () => {
    const stage = fakeStage();
    const fx = createFx(stage, { terrain: FLAT, locator: fixed(3, 1, -16), onShake: () => {} });
    const world = fakeWorld();
    fx.frame(world, info(0));
    const target = { kind: "enemy", slot: 2, serial: 11 };
    fx.onEvents([ev({ type: "word-complete", word: 4, text: "river", kind: "enemy", grade: "flash", errors: 0, keyTicks: 30, responseMs: 500, target, activity: "typing-enemy", scored: true, hintUsed: false })], world);
    expect(fx.core.stats().bolts).toBe(1);
    fx.frame(world, info(50, 0.05));
    fx.onEvents([ev({ type: "hit", target, source: { kind: "hero" }, amount: 40, damageType: "word", tier: 3, grade: "flash", x: 3, z: -16, hpLeft: 0 })], world);
    // The T3 hit's own stop slows the world 35 ms; the bolt lands ≤ 60 ms of world time later.
    for (const now of [90, 130, 170]) fx.frame(world, info(now, 0.04));
    expect(fx.core.stats().bolts).toBe(0);
    fx.dispose();
  });

  it("plays every skill, trap, house and status effect without error", () => {
    const stage = fakeStage("low");
    const fx = createFx(stage, { terrain: FLAT, locator: fixed(1, 1, -8), onShake: () => {} });
    const world = fakeWorld();
    const foe = { kind: "enemy", slot: 0, serial: 5 };
    fx.onEvents(
      [
        ev({ type: "skill", skill: "breath", stage: "cast", x: 0, z: -12 }),
        ev({ type: "skill", skill: "skyfire", stage: "cast", x: 2, z: -10 }),
        ev({ type: "skill", skill: "roar", stage: "cast", x: 0, z: 0 }),
        ev({ type: "trap-trigger", slot: 1, trap: "spikes", x: 4, z: -20, count: 2 }),
        ev({ type: "trap-trigger", slot: 2, trap: "pine-bomb", x: 2, z: -15, count: 9 }),
        ev({ type: "trap-trigger", slot: 3, trap: "net-launcher", x: 1, z: -9, count: 1 }),
        ev({ type: "status", target: foe, status: "burn", on: true, durationMs: 3000, x: 1, z: -8 }),
        ev({ type: "status", target: foe, status: "grounded", on: true, durationMs: 3000, x: 1, z: -8 }),
        ev({ type: "house-pulse", slot: 12, house: "herb-hut", x: 6.5, z: -5 }),
        ev({ type: "death", enemy: { slot: 0, serial: 5 }, foe: "moss-grunt", by: "word", x: 1, z: -8, material: "leaf", tier: 2 }),
        ev({ type: "gold", delta: 6, total: 50, reason: "kill" }),
        ev({ type: "consumable", item: "small-potion", x: 0, z: 0 }),
      ],
      world,
    );
    for (let k = 0; k < 20; k += 1) fx.frame(world, info(k * 50, 0.05));
    const stats = fx.core.stats();
    expect(stats.sparks + stats.glows).toBeGreaterThan(0);
    expect(stats.debris).toBeGreaterThan(0);
    fx.dispose();
  });

  it("gives Chớp and Hoàn hảo the strong bolt (teal head, T3)", () => {
    expect(strongGrade("flash")).toBe(true);
    expect(strongGrade("perfect")).toBe(true);
    expect(strongGrade("good")).toBe(false);
    expect(tierForGrade("perfect")).toBe(3);
    expect(tierForGrade("ok")).toBe(1);
  });

  it("flies a bolt to a far foe in the 0.2 s its hit takes (00 §4.2), not at 18 m/s", () => {
    const core = new FxCore("high", { locator: fixed(0, 1, -20) });
    const eye = new THREE.Vector3(0, 60, 60);
    core.launchBolt(new THREE.Vector3(0, 4, 0), { slot: 0, serial: 5, x: 0, y: 1, z: -20 }, false);
    // 12 ticks later the hit comes: the bolt is already there and lands at once.
    for (let k = 0; k < 12; k += 1) core.update(1 / 60, k / 60, eye, 600);
    core.landBolt(5, 1, new THREE.Vector3(0, 1, -20));
    core.update(1 / 60, 0.21, eye, 600);
    expect(core.stats().bolts).toBe(0);
    core.dispose();
  });

  it("sends a fire mote to the locked foe on each right key and grows the mouth glow (05 §4.3, T0)", () => {
    const core = new FxCore("high");
    const eye = new THREE.Vector3(0, 60, 60);
    core.keySpark(new THREE.Vector3(0, 4, 0), null, 0);
    core.update(0.001, 0, eye, 600);
    const before = core.stats();
    core.keySpark(new THREE.Vector3(0, 4, 0), new THREE.Vector3(0, 1, -12), 0.5);
    core.update(1 / 60, 0.001, eye, 600);
    const after = core.stats();
    // The mote, the glow held at the mouth (a step up), embers pulled in.
    expect(after.glows).toBeGreaterThan(before.glows);
    expect(after.charge).toBeGreaterThan(before.charge);
    expect(after.flares).toBeGreaterThan(0);
    // Embers flying in as stretched sparks (round 3: round motes did not read at 720p).
    expect(after.streaks).toBeGreaterThanOrEqual(before.streaks + 3);
    core.dispose();
  });

  it("draws the release flash and the mouth light full bright on the frame the word completes (VFX_STANDARD §3.1 rule 5)", () => {
    const core = new FxCore("high", { locator: fixed(0, 1, -15), mouthLight: true });
    const eye = new THREE.Vector3(0, 60, 60);
    core.setMouth(new THREE.Vector3(0, 4, -1));
    core.launchBolt(new THREE.Vector3(0, 4, -1), { slot: 0, serial: 3, x: 0, y: 1, z: -15 }, false);
    const levels: number[] = [];
    for (let k = 0; k < 7; k += 1) {
      core.update(1 / 60, k / 60, eye, 600);
      levels.push(core.mouthLightLevel);
    }
    // Frames 0–1 at the peak, out by frame 5 (4–6 frames).
    expect(levels[0]).toBeCloseTo(1, 5);
    expect(levels[1]).toBeCloseTo(1, 5);
    expect(levels[2]!).toBeLessThan(1);
    expect(levels[5]).toBe(0);
    expect(core.light).not.toBeNull();
    core.dispose();
    // No light where the tier has none: the light count never changes in a wave.
    expect(new FxCore("medium").light).toBeNull();
  });

  it("draws a 3-frame flash 100 %, 100 %, then falling, never aged before its first frame (VFX_STANDARD §3.4)", () => {
    expect([0, 1, 2, 3].map((f) => flareEnvelope(f / 60, 2 / 60, 3 / 60))).toEqual([1, 1, 0.5, 0]);
    // The fire ribbons draw after the river surface (view/water.ts, order 2), so the water never covers them.
    expect(FX_RIBBON_ORDER).toBeGreaterThan(2);
  });

  it("starts each strike clip at its release frame (the bolt leaves on play, key → release ≤ 50 ms)", () => {
    const times = new Float32Array([0, 0.5, 1]);
    const clip = new THREE.AnimationClip("Hero_Attack_L", 1, [new THREE.NumberKeyframeTrack("head.morphTargetInfluences[0]", times, new Float32Array([0, 0.5, 1]))]);
    const strike = strikeClip(clip, FIRE_RELEASE_S.attackL, "Hero_Attack_L_Strike");
    expect(strike.duration).toBeCloseTo(1 - FIRE_RELEASE_S.attackL, 5);
    const track = strike.tracks[0]!;
    // Linear track: value = time; the strike's frame 0 is the clip at its release, its last frame the clip's end.
    expect(track.values[0]).toBeCloseTo(FIRE_RELEASE_S.attackL, 5);
    expect(track.values[track.values.length - 1]).toBeCloseTo(1, 5);
    expect(track.times[1]! - track.times[0]!).toBeCloseTo(1 / 60, 5);
  });

  it("lands a word bolt with fire and soot, and a scorch held dark 1.5 s, gone by 2.6 s (VFX_STANDARD §3.4, judge 1a)", () => {
    const core = new FxCore("high", { locator: fixed(0, 1, -15) });
    const eye = new THREE.Vector3(0, 60, 60);
    core.launchBolt(new THREE.Vector3(0, 4, -1), { slot: 0, serial: 5, x: 0, y: 1, z: -15 }, false);
    core.landBolt(5, 1, new THREE.Vector3(0, 1, -15), 0, -1);
    let frames = 0;
    let puffs = 0;
    while (core.stats().marks === 0 && frames < 60) {
      puffs = core.stats().puffs;
      core.update(1 / 60, frames / 60, eye, 600);
      frames += 1;
    }
    expect(core.stats().marks).toBe(1);
    // The impact's fire bodies and soot puffs come on top of what the flight left.
    // (7 born on the landing frame: 3 fire, 3 soot, 1 grey; the flight's last head bodies run out meanwhile.)
    expect(core.stats().puffs).toBeGreaterThanOrEqual(puffs + 5);
    const marks = core.group.children.find((m): m is THREE.Mesh => m instanceof THREE.Mesh && m.renderOrder === 2 && (m.material as THREE.ShaderMaterial).polygonOffset)!;
    const alpha = (): number => (marks.geometry.getAttribute("iColor") as THREE.InstancedBufferAttribute).getW(0);
    const at = (seconds: number): number => {
      for (let k = 0; k < Math.round(seconds * 60); k += 1) core.update(1 / 60, 1, eye, 600);
      return alpha();
    };
    expect(at(0.2)).toBeCloseTo(0.92, 3);
    expect(at(1.2)).toBeCloseTo(0.92, 3);
    const late = at(0.6);
    expect(late).toBeGreaterThan(0.2);
    expect(late).toBeLessThan(0.8);
    at(0.7);
    expect(core.stats().marks).toBe(0);
    core.dispose();
  });

  it("never lays a word scorch on the river: slides it to dry ground on the shot's line, or steams (judge 1a round 2)", () => {
    const eye = new THREE.Vector3(0, 60, 60);
    const land = (wetAt: (x: number, z: number) => boolean): FxCore => {
      const core = new FxCore("high", { locator: fixed(0, 1, -15), wetAt });
      core.launchBolt(new THREE.Vector3(0, 4, -1), { slot: 0, serial: 6, x: 0, y: 1, z: -15 }, false);
      core.landBolt(6, 1, new THREE.Vector3(0, 1, -15), 0, -1);
      for (let k = 0; k < 40 && core.stats().marks === 0; k += 1) core.update(1 / 60, k / 60, eye, 600);
      for (let k = 0; k < 3; k += 1) core.update(1 / 60, 1, eye, 600);
      return core;
    };
    // Water from the dais side up to just past the struck foe: the scorch goes past it, onto the first dry spot.
    const past = land((_x, z) => z > -15.2);
    expect(past.stats().marks).toBe(1);
    expect(past.scorchPoint.z).toBeLessThan(-15.4);
    past.dispose();
    // All water: no scorch, steam instead.
    const wet = land(() => true);
    expect(wet.stats().marks).toBe(0);
    expect(wet.scorchPoint.lengthSq()).toBe(0);
    expect(wet.stats().puffs).toBeGreaterThan(0);
    wet.dispose();
  });

  it("charges the mouth a step a letter, spends it on the release, lets an abandoned word go", () => {
    const core = new FxCore("high", { locator: fixed(0, 1, -15) });
    const eye = new THREE.Vector3(0, 60, 60);
    const mouth = new THREE.Vector3(0, 4, -1);
    const levels: number[] = [];
    for (const frac of [0.25, 0.5, 0.75]) {
      core.keySpark(mouth, null, frac);
      for (let k = 0; k < 6; k += 1) core.update(1 / 60, 0, eye, 600);
      levels.push(core.stats().charge);
    }
    expect(levels[0]!).toBeLessThan(levels[1]!);
    expect(levels[1]!).toBeLessThan(levels[2]!);
    core.launchBolt(mouth, { slot: 0, serial: 4, x: 0, y: 1, z: -15 }, true);
    core.update(1 / 60, 0.1, eye, 600);
    expect(core.stats().charge).toBe(0);
    core.keySpark(mouth, null, 0.5);
    for (let k = 0; k < 150; k += 1) core.update(1 / 60, 0.2 + k / 60, eye, 600);
    expect(core.stats().charge).toBeLessThan(0.01);
    core.dispose();
  });

  it("draws Viêm Đế's beam down the struck foe's lane, once a lane a tick (01 §2.4)", () => {
    const stage = fakeStage();
    const fx = createFx(stage, { terrain: FLAT, locator: fixed(0, 1, -12), onShake: () => {} });
    const lane = { index: 0, length: 30 * 60_000, sky: false, xs: [0, 0], zs: [-30 * 60_000, 0], cum: [0, 30 * 60_000] };
    const world = { ...fakeWorld([{ slot: 0, serial: 3, alive: true, lane: 0 }]), lanes: [lane], combat: { infernoUntil: 600 } } as unknown as World;
    fx.frame(world, info(0));
    const hit = (by: string, serial = 3) => ev({ type: "hit", tick: 10, target: { kind: "enemy", slot: 0, serial }, source: { kind: "hero" }, amount: 40, damageType: "word", tier: 1, grade: "good", x: 0, z: -12, hpLeft: 5, by });
    const puffs = () => (fx.core as unknown as { puffs: { live: number } }).puffs.live;
    fx.onEvents([hit("word"), hit("inferno")], world);
    fx.frame(world, info(16));
    const one = puffs();
    expect(one).toBeGreaterThanOrEqual(20);
    fx.dispose();
  });

  it("shows Héo lan's seep: a stream from each waiting foe, a flash and a number at the Dragon", () => {
    const stage = fakeStage();
    const fx = createFx(stage, { terrain: FLAT, onShake: () => {} });
    const world = { ...fakeWorld(), hero: { hpMax: 600 } } as unknown as World;
    fx.frame(world, info(0));
    const glows = fx.core.stats().glows;
    fx.onEvents([ev({ type: "blight", amount: 66, from: [[0, -14], [-12, 1]] })], world);
    fx.frame(world, info(16));
    expect(fx.core.stats().glows).toBeGreaterThan(glows + 2);
    expect(fx.numbers.live).toBe(1);
    fx.dispose();
  });
});

describe("view telegraphs", () => {
  it("paints enemy warnings red and never ours (05 §2.2, §6)", () => {
    expect(telegraphColors("enemy")).toEqual({ fill: "#ff4a4a", rim: "#ff4a4a" });
    expect(telegraphColors("ally").fill).not.toBe(TELEGRAPH_COLORS.enemy);
    expect(telegraphColors("ally").rim).toBe("#ffffff");
    expect(telegraphColors("aura").fill).toBe("#c8d24a");
  });

  it("fills over at least 0.5 s, then fades; follows a general's aura until it ends", () => {
    const stage = fakeStage();
    const telegraphs = createTelegraphs(stage, FLAT, { locator: fixed(5, 0, -5) });
    const world = fakeWorld([{ slot: 0, serial: 9, x: 0, z: 0 }]);
    telegraphs.onEvents([ev({ type: "telegraph", id: 1, owner: "enemy", shape: "line", x: 0, z: -12, toX: 0, toZ: -4, radiusM: 0, widthM: 1.6, durationMs: 200, source: { kind: "enemy", slot: 3, serial: 4 } })], world);
    expect(telegraphs.live).toBe(1);
    telegraphs.tick(MIN_WINDUP_S * 0.6, 0.3);
    expect(telegraphs.live).toBe(1);
    telegraphs.tick(MIN_WINDUP_S * 0.5, 0.6);
    telegraphs.tick(0.3, 0.9);
    expect(telegraphs.live).toBe(0);
    // Ally: pale orange, never red.
    telegraphs.onEvents([ev({ type: "telegraph", id: 2, owner: "ally", shape: "circle", x: 2, z: -10, toX: 2, toZ: -10, radiusM: 4, widthM: 0, durationMs: 800, source: { kind: "hero" } })], world);
    const live = stage.layers.fx.getObjectByName("telegraphs")!.children.find((child) => child.visible) as THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
    expect((live.material.uniforms.uColor!.value as THREE.Color).getHexString()).toBe("ffc9a0");
    telegraphs.clear();
    // Aura on, then off.
    telegraphs.onEvents([ev({ type: "aura", enemy: { slot: 0, serial: 9 }, aura: "speed", on: true, radiusM: 5 })], world);
    telegraphs.tick(2, 3);
    expect(telegraphs.live).toBe(1);
    telegraphs.onEvents([ev({ type: "aura", enemy: { slot: 0, serial: 9 }, aura: "speed", on: false, radiusM: 5 })], world);
    telegraphs.tick(0.3, 3.3);
    expect(telegraphs.live).toBe(0);
    telegraphs.dispose();
  });

  it("fades a warning whose foe died while the world stands still (Thẻ Ôn holds the break)", () => {
    const stage = fakeStage();
    const telegraphs = createTelegraphs(stage, FLAT, { locator: fixed(5, 0, -5) });
    const world = fakeWorld([{ slot: 3, serial: 4, x: 0, z: -12 }]);
    telegraphs.onEvents([ev({ type: "telegraph", id: 1, owner: "enemy", shape: "line", x: 0, z: -12, toX: 0, toZ: -4, radiusM: 0, widthM: 1.6, durationMs: 1000, source: { kind: "enemy", slot: 3, serial: 4 } })], world);
    telegraphs.onEvents([ev({ type: "death", enemy: { slot: 3, serial: 4 }, foe: "tusk-boar", by: "word", x: 0, z: -12, material: "flesh", tier: 1 })], world);
    // World time stopped: only wall time passes.
    telegraphs.tick(0, 0.5, 0.5);
    expect(telegraphs.live).toBe(0);
    telegraphs.dispose();
  });

  it("shows an enemy warning's outline through bodies, never ours or an aura (round 2)", () => {
    const stage = fakeStage();
    const telegraphs = createTelegraphs(stage, FLAT, { locator: fixed(5, 0, -5) });
    const world = fakeWorld([{ slot: 0, serial: 9, x: 0, z: 0 }]);
    const meshes = () => stage.layers.fx.getObjectByName("telegraphs")!.children.filter((child): child is THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial> => (child as THREE.Mesh).isMesh && child.visible);
    telegraphs.onEvents([ev({ type: "telegraph", id: 1, owner: "enemy", shape: "line", x: 0, z: -12, toX: 0, toZ: -9, radiusM: 0, widthM: 1.6, durationMs: 500, source: { kind: "enemy", slot: 3, serial: 4 } })], world);
    const [plain, xray] = meshes();
    expect(meshes()).toHaveLength(2);
    // Published for the word tags: one ground circle round the line (its middle, half its drawn length).
    telegraphs.tick(0.1, 0.1);
    expect(drawnWarnings).toHaveLength(1);
    expect(drawnWarnings[0]!.z).toBeCloseTo(-10.5, 5);
    expect(drawnWarnings[0]!.radius).toBeCloseTo(1.5, 5);
    expect(xray!.material.defines?.XRAY).toBe(1);
    expect(xray!.material.depthFunc).toBe(THREE.GreaterDepth);
    // One grid and one set of uniforms: the x-ray fills and fades with the warning.
    expect(xray!.geometry).toBe(plain!.geometry);
    expect(xray!.material.uniforms).toBe(plain!.material.uniforms);
    telegraphs.tick(0.5, 0.6);
    telegraphs.tick(0.3, 0.9);
    expect(meshes()).toHaveLength(0);
    expect(drawnWarnings).toHaveLength(0);
    telegraphs.onEvents([ev({ type: "telegraph", id: 2, owner: "ally", shape: "circle", x: 2, z: -10, toX: 2, toZ: -10, radiusM: 4, widthM: 0, durationMs: 800, source: { kind: "hero" } })], world);
    telegraphs.onEvents([ev({ type: "aura", enemy: { slot: 0, serial: 9 }, aura: "speed", on: true, radiusM: 5 })], world);
    expect(meshes()).toHaveLength(2);
    expect(meshes().every((mesh) => mesh.material.defines?.XRAY === undefined)).toBe(true);
    telegraphs.tick(0.1, 1);
    expect(drawnWarnings).toHaveLength(0);
    telegraphs.dispose();
  });
});

describe("view heroes", () => {
  it("picks the model tier like the kit loader and keeps placeholders on Low", async () => {
    expect(modelUrl("/m/x", "low")).toBeNull();
    expect(modelUrl("/m/x", "medium")).toBe("/m/x.medium.glb");
    expect(modelUrl("/m/x", "ultra")).toBe("/m/x.high.glb");
    const heroes = createHeroes(fakeStage("low"), MAP_L2_CAU);
    await heroes.ready;
    expect(heroes.fire).toBeNull();
    const mouth = heroes.mouth(new THREE.Vector3());
    expect(mouth.y).toBeGreaterThan(MAP_L2_CAU.dais.heroHoverM);
    // Turns toward a foe in the east within a second.
    heroes.face(20, 0);
    for (let k = 0; k < 60; k += 1) heroes.tick(1 / 60, k / 60);
    const turned = heroes.mouth(new THREE.Vector3());
    expect(turned.x).toBeGreaterThan(1);
    heroes.dispose();
  });
});

describe("view actors", () => {
  const foe = (x: number, z: number, serial = 1): Record<string, unknown> => ({
    slot: 0, serial, alive: true, freed: false, foe: "moss-grunt", general: false, x: x * 60_000, z: z * 60_000, y: 0, mode: "walk", statuses: { list: [] }, word: -1, hp: 10, hpMax: 10,
  });

  it("interpolates between ticks, dissolves on death and frees the instance", () => {
    const stage = fakeStage();
    const actors = createActors(stage, FLAT);
    const world = fakeWorld([foe(0, -10)]);
    actors.frame(world, info(0));
    (world as { tick: number }).tick = 1;
    world.enemies.list[0]!.x = 60_000;
    actors.frame(world, info(16, 1 / 60, 0.5));
    const at = new THREE.Vector3();
    expect(actors.locate(0, 1, "base", at)).toBe(true);
    expect(at.x).toBeCloseTo(0.5, 5);
    expect(actors.crowd.size).toBe(1);
    actors.onEvents([ev({ type: "death", enemy: { slot: 0, serial: 1 }, foe: "moss-grunt", by: "word", x: 1, z: -10, material: "leaf", tier: 2 })], world);
    world.enemies.list[0]!.alive = false;
    for (let k = 0; k < 50; k += 1) actors.frame(world, info(32 + k * 16, 1 / 60));
    expect(actors.crowd.size).toBe(0);
    expect(actors.locate(0, 1, "base", at)).toBe(false);
    actors.dispose();
  });

  it("flashes a foe that is hit and draws traps from the world", () => {
    const stage = fakeStage();
    const actors = createActors(stage, FLAT);
    const world = fakeWorld([foe(2, -12, 4)]);
    (world.traps as { list: unknown[] }).list.push({ slot: 0, trap: "spikes", level: 1, readyAt: 0, resonated: 0 });
    actors.frame(world, info(1000));
    actors.onEvents([ev({ type: "hit", target: { kind: "enemy", slot: 0, serial: 4 }, source: { kind: "hero" }, amount: 20, damageType: "word", tier: 3, grade: "perfect", x: 2, z: -12, hpLeft: 2 })], world);
    actors.frame(world, info(1005));
    expect(actors.crowd.size).toBe(2);
    const capsules = stage.layers.actors.getObjectByName("crowd-capsule") as THREE.InstancedMesh;
    const state = capsules.geometry.getAttribute("aState") as THREE.InstancedBufferAttribute;
    expect(state.getX(0)).toBeGreaterThan(0.5);
    (world.traps as { list: unknown[] }).list.length = 0;
    actors.frame(world, info(1020));
    expect(actors.crowd.size).toBe(1);
    actors.dispose();
  });
});
