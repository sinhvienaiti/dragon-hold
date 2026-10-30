import { describe, expect, it } from "vitest";
import { idleSpeedUp, createIdleSpeed, frameTimeScale } from "../../src/app/idle-speed";
import { STAGE_M0 } from "../../src/content/data/stages";
import type { Phase } from "../../src/content/types";
import { mToU, mmToU } from "../../src/sim/fixed";
import { pointAt } from "../../src/sim/lanes";
import { scheduleWave, spawnFoe, traitBit } from "../../src/sim/spawn";
import { ENEMIES } from "../../src/content/data/enemies";
import { createWorld } from "../../src/sim/world";
import { applyStatus } from "../../src/sim/status";
import { inWordZone } from "../../src/sim/words";
import { createLoop } from "../../src/app/loop";

function world() { const w = createWorld(STAGE_M0, 1); w.phase = "wave"; return w; }
function boundary(ticks: number, sky = false) {
  const w = world();
  const e = spawnFoe(w, sky ? "thorn-wasp" : "moss-grunt", sky ? 2 : 0, 1)!;
  e.lateral = 0;
  // Put the T_a boundary comfortably inside the ring, then approach it at base speed.
  e.stopAt = mToU(18); e.speed = 1000; Object.assign(w.pace, { approachTicks: 60 });
  e.along = e.stopAt - e.speed * (w.pace.approachTicks + ticks);
  const p = pointAt(w.lanes[e.lane]!, e.along, e.lateral, { x: 0, z: 0 });
  e.x = p.x; e.z = p.z;
  return { w, e };
}

describe("idle acceleration eligibility", () => {
  it.each([89, 90, 91])("looks ahead exactly 90 ticks (%i)", (ticks) => {
    const { w } = boundary(ticks);
    expect(idleSpeedUp(w)).toBe(ticks > 90);
  });
  it("projects flyers along the sky lane using x/z, regardless of altitude", () => {
    const { w, e } = boundary(90, true); e.y = mToU(3);
    expect(idleSpeedUp(w)).toBe(false);
    const snapshot = JSON.stringify(w);
    idleSpeedUp(w);
    expect(JSON.stringify(w)).toBe(snapshot);
  });
  it.each(["attack", "blocked"] as const)("counts a foe %s inside 26 m immediately", (mode) => {
    const { w, e } = boundary(91); e.x = mToU(25); e.z = 0; e.mode = mode;
    expect(inWordZone(w, e)).toBe(true);
    expect(idleSpeedUp(w)).toBe(false);
  });
  it("uses base speed for a frozen/slowed foe, and ignores dead foes", () => {
    const { w, e } = boundary(90); applyStatus(w, { kind: "enemy", slot: e.slot, serial: e.serial }, e.statuses, { id: "freeze", durationMs: 10000 });
    applyStatus(w, { kind: "enemy", slot: e.slot, serial: e.serial }, e.statuses, { id: "slow", durationMs: 10000, value: 80 });
    expect(idleSpeedUp(w)).toBe(false);
    e.alive = false;
    expect(idleSpeedUp(w)).toBe(true);
  });
  it("never speeds through one live word", () => {
    const w = world(); w.words.live[0] = { text: "tree" } as never;
    expect(idleSpeedUp(w)).toBe(false);
  });
  it.each<Phase>(["prep", "warning", "break", "victory", "defeat"])("keeps %s at normal pace", (phase) => {
    const w = world(); w.phase = phase; expect(idleSpeedUp(w)).toBe(false);
  });
  it("respects the ring and clamps projection to stopAt", () => {
    const { w, e } = boundary(0); e.stopAt = 0; e.along = 0;
    const p = pointAt(w.lanes[e.lane]!, 0, e.lateral, { x: 0, z: 0 });
    e.x = p.x; e.z = p.z;
    expect(idleSpeedUp(w)).toBe(true);
  });
  it("uses the actual ring at the 89/90/91 tick boundary, including a held foe", () => {
    for (const ticks of [89, 90, 91]) {
      const w = world();
      Object.assign(w.lanes[0]!, { xs: [mToU(30), mToU(6)], zs: [0, 0], cum: [0, mToU(24)], length: mToU(24) });
      const e = spawnFoe(w, "moss-grunt", 0, 1, { lateral: 0 })!;
      e.speed = 1000; e.along = mToU(4) - ticks * e.speed;
      const p = pointAt(w.lanes[0]!, e.along, 0, { x: 0, z: 0 }); e.x = p.x; e.z = p.z;
      Object.assign(w.pace, { approachTicks: 2000 });
      expect(idleSpeedUp(w)).toBe(ticks > 90);
      e.blockedBy = 0;
      expect(idleSpeedUp(w)).toBe(ticks > 90);
    }
  });
  it.each([0, 1])("looks ahead to queued foes, accounting for spawn delay %i", delay => {
    const w = world();
    Object.assign(w.lanes[0]!, { xs: [mToU(29), mToU(6)], zs: [0, 0], cum: [0, mToU(23)], length: mToU(23) });
    Object.assign(w.pace, { approachTicks: 2000 });
    scheduleWave(w, { ...STAGE_M0.waves[0]!, groups: [{ atMs: 0, lane: "cau", shape: "single", foe: "moss-grunt", count: 1 }] });
    w.spawn.queue[0]!.at = w.tick + delay;
    const snapshot = JSON.stringify(w);
    expect(idleSpeedUp(w)).toBe(delay > 0);
    expect(JSON.stringify(w)).toBe(snapshot);
  });
  it("uses chain length and the run's pace rather than the ring alone", () => {
    const w = world(); const e = spawnFoe(w, "moss-banner", 0, 1)!;
    e.x = mToU(20); e.z = 0; e.speed = 1000; e.stopAt = e.along + 1000 * 1000;
    Object.assign(w.pace, { approachTicks: 60, wordTicks: 200 });
    expect(inWordZone(w, e)).toBe(true);
    expect(idleSpeedUp(w)).toBe(false);
  });
  it("cancels for upcoming map-1 wolves even when spawn lateral reaches the ring first", () => {
    const w = world();
    Object.assign(w.pace, { approachTicks: 2000 });
    scheduleWave(w, { ...STAGE_M0.waves[0]!, groups: [{ atMs: 0, lane: "cau", shape: "single", foe: "blight-wolf", count: 1 }] });
    const e = spawnFoe(w, "blight-wolf", 0, 1, { lateral: 0 })!; e.alive = false;
    for (let delay = 0; delay <= 90; delay += 1) {
      w.spawn.queue[0]!.at = w.tick + delay;
      const along = e.speed * (90 - delay);
      for (const lateral of [-mToU(1.1), 0, mToU(1.1)]) {
        const p = pointAt(w.lanes[0]!, along, lateral, { x: 0, z: 0 });
        if (inWordZone(w, { ...e, along, lateral, ...p })) expect(idleSpeedUp(w), "spawn delay " + delay + ", lateral " + lateral).toBe(false);
      }
    }
  });
  it("includes swift cluster spawn jitter without waiting for a live foe", () => {
    const w = world();
    Object.assign(w.lanes[0]!, { xs: [mToU(29), mToU(6)], zs: [0, 0], cum: [0, mToU(23)], length: mToU(23) });
    Object.assign(w.pace, { approachTicks: 2000 });
    scheduleWave(w, { ...STAGE_M0.waves[0]!, groups: [{ atMs: 0, lane: "cau", shape: "cluster", foe: "thorn-ant", count: 6, traits: ["swift"] }] });
    const e = spawnFoe(w, "thorn-ant", 0, 1, { cluster: 1, traits: traitBit("swift"), along: mmToU(ENEMIES["thorn-ant"].cluster!.spreadMm) * 2, lateral: 0 })!;
    e.alive = false;
    for (let delay = 0; delay <= 90; delay += 1) {
      w.spawn.queue[0]!.at = w.tick + delay;
      const along = e.along + e.speed * (90 - delay), p = pointAt(w.lanes[0]!, along, 0, { x: 0, z: 0 });
      if (inWordZone(w, { ...e, along, ...p })) expect(idleSpeedUp(w), "spawn delay " + delay).toBe(false);
    }
  });
});

describe("frame acceleration", () => {
  it("scales the real loop's sim steps, keeps presentation dt and cancels on the first word frame", () => {
    let pending: ((now: number) => void) | null = null;
    let steps = 0;
    const w = world(); const latch = createIdleSpeed();
    const frames: { dt: number; worldDt: number }[] = [];
    const loop = createLoop({ step: () => { steps += 1; }, frame: info => { frames.push(info); latch.update(w, info.now, false); },
      timeScale: now => frameTimeScale(1, 1, false, latch.update(w, now, false), false),
    }, { scheduler: { request: cb => { pending = cb; return 1; }, cancel: () => { pending = null; } } });
    const draw = (now: number) => { const cb = pending!; pending = null; cb(now); };
    loop.start(); draw(0); draw(100); draw(200);
    const before = steps; draw(300);
    expect(steps - before).toBe(10);
    expect(frames.at(-1)!.dt).toBe(0.1);
    expect(frames.at(-1)!.worldDt).toBeCloseTo(0.175);
    w.words.live[0] = { text: "tree" } as never;
    draw(400);
    expect(frames.at(-1)!.worldDt).toBe(0.1);
    loop.stop();
  });
  it("waits 0.3 real seconds, cancels on the first word frame and waits again", () => {
    const speed = createIdleSpeed(); const w = world();
    expect(speed.update(w, 0, false)).toBe(false);
    expect(speed.update(w, 299, false)).toBe(false);
    expect(speed.update(w, 300, false)).toBe(true);
    w.words.live[0] = { text: "tree" } as never;
    expect(speed.update(w, 301, false)).toBe(false);
    w.words.live[0] = null;
    expect(speed.update(w, 400, false)).toBe(false);
    expect(speed.update(w, 700, false)).toBe(true);
    expect(speed.update(w, 701, true)).toBe(false);
    expect(speed.update(w, 1000, false)).toBe(false);
  });
  it("manual ×2 wins; both multiply hit-stop and dev speed once", () => {
    expect(frameTimeScale(1, 1, false, true, false)).toBe(1.75);
    expect(frameTimeScale(0.2, 3, true, true, false)).toBeCloseTo(1.2);
    expect(frameTimeScale(0.2, 3, false, true, false)).toBeCloseTo(1.05);
    expect(frameTimeScale(1, 1, true, true, true)).toBe(1);
  });
});
