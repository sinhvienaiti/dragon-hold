import { describe, expect, it } from "vitest";
import { TRAPS } from "../../src/content/data/our-side";
import { mToU } from "../../src/sim/fixed";
import { slotIndex } from "../../src/sim/placement";
import { place, upgrade } from "../../src/sim/shop";
import { hasStatus, slowCapFor, slowPct, stanceNow } from "../../src/sim/status";
import { delayTrap, rechargeTicks, resonate, trapMainPm } from "../../src/sim/traps";
import { blockerFor } from "../../src/sim/units";
import type { World } from "../../src/sim/world";
import { eventsOf, foeAt, foeHits, makeWorld, placeOnLane, stepOurSide } from "./ourside-fixture";

/** A wave-phase world with `items` placed during the break before it. */
function armed(items: [item: Parameters<typeof place>[1], slot: string][]): World {
  const world = makeWorld({ phase: "break", gold: 5000 });
  for (const [item, slot] of items) place(world, item, slot);
  world.phase = "wave";
  stepOurSide(world, 0);
  world.events.drain();
  return world;
}

describe("traps (03 §7)", () => {
  it("scales the main effect ×1.45 then ×1.35 and recharge −15 % at level 3", () => {
    const bomb = TRAPS["pine-bomb"];
    expect(trapMainPm(bomb, 1)).toBe(1000);
    expect(trapMainPm(bomb, 2)).toBe(1450);
    expect(trapMainPm(bomb, 3)).toBe(1958);
    const world = makeWorld();
    expect(rechargeTicks(world, bomb, 1)).toBe(1320);
    expect(rechargeTicks(world, bomb, 3)).toBe(1122);
    world.words.chain = 20;
    expect(rechargeTicks(world, bomb, 3)).toBe(1010);
  });

  it("Gai Chông slows ground foes in its 4 m strip and stabs 8 VL/s × g(c) every 0.5 s", () => {
    const world = armed([["spikes", "cau-t1"]]);
    // G0 archer: no armour, so the raw stab shows.
    const grunt = foeAt(world, "moss-archer", "cau", 4.5, { lateralM: 1 });
    foeAt(world, "thorn-wasp", "troi", 4);
    foeAt(world, "moss-archer", "cau", 7);
    stepOurSide(world, 31);
    const events = world.events.drain();
    const hits = events.filter((event) => event.type === "hit" && event.source.kind === "trap");
    expect(hits.map((event) => [event.tick, event.type === "hit" && event.target.kind === "enemy" ? event.target.serial : 0, event.type === "hit" ? event.amount : 0])).toEqual([
      [0, grunt.serial, 4],
      [30, grunt.serial, 4],
    ]);
    expect(world.stats.damageOurSide).toBe(8);
    expect(slowPct(grunt.statuses, world.tick, slowCapFor(grunt))).toBe(25);
    expect(events.filter((event) => event.type === "trap-trigger")).toMatchObject([{ trap: "spikes", count: 1 }, { trap: "spikes", count: 1 }]);
    // Off the strip, the slow lingers 0.3 s.
    grunt.along = mToU(9);
    placeOnLane(world, grunt);
    stepOurSide(world, 16);
    expect(slowPct(grunt.statuses, world.tick, slowCapFor(grunt))).toBe(25);
    stepOurSide(world, 1);
    expect(slowPct(grunt.statuses, world.tick, slowCapFor(grunt))).toBe(0);
  });

  it("Bom Hạt Thông waits for 2 ground foes (00 D33 (1)), blasts them all, pushes survivors 2 m and recharges 22 s", () => {
    const world = armed([["pine-bomb", "cau-t2"]]);
    expect(TRAPS["pine-bomb"].triggerMin).toBe(2);
    // G0 wolves with HP to spare, so both survive the blast; one free foe alone does not fire it.
    const boars = [foeAt(world, "blight-wolf", "cau", 9.5, { hp: 5000 })];
    stepOurSide(world, 5);
    expect(foeHits(world, "trap")).toEqual([]);
    boars.push(foeAt(world, "blight-wolf", "cau", 10.5, { lateralM: 0.5, hp: 5000 }));
    const before = boars.map((boar) => boar.along);
    stepOurSide(world, 1);
    const events = world.events.drain();
    // 30 × g(c) (00 D33 (1): 03's 120 cut to a quarter as it fires 3–5 times as often).
    expect(events.filter((event) => event.type === "hit").map((event) => (event.type === "hit" ? event.amount : 0))).toEqual([31, 31]);
    // Small foes slide the full 2 m back along the lane.
    expect(boars.map((boar, k) => before[k]! - boar.along)).toEqual([120_000, 120_000]);
    expect(events.filter((event) => event.type === "trap-trigger")).toMatchObject([{ trap: "pine-bomb", count: 2 }]);
    const bomb = world.traps.list[0]!;
    expect(bomb.readyAt).toBe(5 + 1320);
    // Still recharging: three more foes do nothing.
    for (const boar of boars) {
      boar.along = mToU(10);
      placeOnLane(world, boar);
    }
    stepOurSide(world, 600);
    expect(foeHits(world, "trap")).toEqual([]);
  });

  it("Bom Hạt Thông also blasts one foe a blocker holds in its area (00 D33 (1))", () => {
    const world = armed([["pine-bomb", "cau-t2"], ["moss-warden", "cau-b1"]]);
    const grunt = foeAt(world, "moss-grunt", "cau", 9.5, { hp: 5000 });
    // One free foe in the 3 m blast does nothing.
    stepOurSide(world, 3);
    expect(foeHits(world, "trap")).toEqual([]);
    // Movement asks the warden (it stands by), which takes hold: the bomb fires that tick.
    expect(blockerFor(world, grunt)).toBe(0);
    stepOurSide(world, 1);
    expect(eventsOf(world, "trap-trigger")).toMatchObject([{ trap: "pine-bomb", count: 1 }]);
  });

  it("Bom Hạt Thông at level 3 hits for 30 × 1.958 × g(c)", () => {
    const world = makeWorld({ phase: "break", gold: 5000 });
    place(world, "pine-bomb", "suoi-t2");
    upgrade(world, "suoi-t2");
    upgrade(world, "suoi-t2");
    world.phase = "wave";
    for (const at of [15, 15.5, 16]) foeAt(world, "blight-wolf", "suoi", at, { hp: 5000 });
    world.events.drain();
    stepOurSide(world, 1);
    expect(foeHits(world, "trap").map(([, , amount]) => amount)).toEqual([60, 60, 60]);
  });

  it("Lưới Phóng grounds the nearest low flyer within 10 m for 3 s and ignores ground foes", () => {
    const world = armed([["net-launcher", "cau-t4"]]);
    const grunt = foeAt(world, "moss-grunt", "cau", 21.8);
    const near = foeAt(world, "thorn-wasp", "troi", 24.2);
    const next = foeAt(world, "thorn-wasp", "troi", 23.6);
    const out = foeAt(world, "thorn-wasp", "troi", 12);
    stepOurSide(world, 1);
    expect(hasStatus(near.statuses, "grounded", world.tick)).toBe(true);
    expect(stanceNow(world, near)).toBe("ground");
    expect(hasStatus(next.statuses, "grounded", world.tick)).toBe(false);
    expect(hasStatus(out.statuses, "grounded", world.tick)).toBe(false);
    expect(hasStatus(grunt.statuses, "grounded", world.tick)).toBe(false);
    expect(world.traps.list[0]!.readyAt).toBe(900);
    stepOurSide(world, 179);
    expect(stanceNow(world, near)).toBe("low-air");
    expect(eventsOf(world, "trap-trigger")).toMatchObject([{ trap: "net-launcher", count: 1 }]);
  });

  it("cuts a recharging trap's recharge on word hits in its area, at most 50 % a cycle (Cộng Hưởng)", () => {
    const world = armed([["pine-bomb", "cau-t2"]]);
    const boars = [9.5, 10, 10.5].map((at) => foeAt(world, "tusk-boar", "cau", at));
    stepOurSide(world, 1);
    const bomb = world.traps.list[0]!;
    const ready = bomb.readyAt;
    const inside = boars[0]!;
    inside.along = mToU(10);
    placeOnLane(world, inside);
    resonate(world, inside, "good");
    expect(bomb.readyAt).toBe(ready - 48);
    resonate(world, inside, "perfect");
    expect(bomb.readyAt).toBe(ready - 48 - 72);
    const outside = foeAt(world, "moss-grunt", "cau", 2);
    resonate(world, outside, "flash");
    expect(bomb.readyAt).toBe(ready - 120);
    for (let k = 0; k < 20; k += 1) resonate(world, inside, "flash");
    expect(bomb.readyAt).toBe(ready - 660);
  });

  it("rests while a fire arrow hit it (E11) and while a quick place builds", () => {
    const world = armed([["spikes", "cau-t1"]]);
    delayTrap(world, slotIndex(world, "cau-t1"), 180);
    foeAt(world, "moss-archer", "cau", 4);
    stepOurSide(world, 180);
    expect(foeHits(world, "trap")).toHaveLength(0);
    stepOurSide(world, 1);
    expect(foeHits(world, "trap")).toHaveLength(1);
  });
});
