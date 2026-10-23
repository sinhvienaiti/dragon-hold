import { describe, expect, it } from "vitest";
import { OUR_SIDE_TUNING } from "../../src/content/data/our-side";
import { mToU, mmToU } from "../../src/sim/fixed";
import { place } from "../../src/sim/shop";
import { applyStatus, statusSpeedPm } from "../../src/sim/status";
import { blockPassPct, blockWeight, blockerFor, damageUnit } from "../../src/sim/units";
import type { World } from "../../src/sim/world";
import { eventsOf, foeAt, foeHits, makeWorld, placeOnLane, stepOurSide } from "./ourside-fixture";

/** Wave world with wardens on `points`. */
function guarded(points: string[]): World {
  const world = makeWorld({ phase: "break", gold: 5000 });
  for (const id of points) place(world, "moss-warden", id);
  world.phase = "wave";
  stepOurSide(world, 1);
  world.events.drain();
  return world;
}

/** Stand-in for sim-battle's movement as LANES.md asks it to use our side: held foes stay, others walk at slow × pass speed. */
function walk(world: World, ticks: number): void {
  for (let k = 0; k < ticks; k += 1) {
    for (const enemy of world.enemies.list) {
      if (!enemy.alive || blockerFor(world, enemy) >= 0) continue;
      enemy.along += Math.round((enemy.speed * statusSpeedPm(world, enemy) * blockPassPct(world, enemy)) / 100_000);
      placeOnLane(world, enemy);
    }
    stepOurSide(world, 1);
  }
}

describe("units (03 §9)", () => {
  it("holds two small foes on 2 slots; a third pushes past at 50 % speed", () => {
    const world = guarded(["cau-b1"]);
    const warden = world.units.list[0]!;
    const a = foeAt(world, "moss-grunt", "cau", 7.2, { hp: 5000 });
    const b = foeAt(world, "moss-grunt", "cau", 6.8, { hp: 5000 });
    walk(world, 60);
    expect(a.blockedBy).toBe(0);
    expect(b.blockedBy).toBe(0);
    expect(warden.blockUsed).toBe(8);
    const heldAt = [a.along, b.along];
    const c = foeAt(world, "moss-grunt", "cau", 5, { hp: 5000 });
    let pushing = 0;
    for (let k = 0; k < 240; k += 1) {
      walk(world, 1);
      if (Math.abs(c.along - warden.along) <= mmToU(OUR_SIDE_TUNING.contactMm)) {
        expect(blockPassPct(world, c)).toBe(50);
        pushing += 1;
      }
    }
    expect([a.along, b.along]).toEqual(heldAt);
    expect(c.blockedBy).toBe(-1);
    // 2 × 1.2 m of reach at half of 2 m/s: about 2.4 s inside it, then on towards the dais.
    expect(pushing).toBeGreaterThanOrEqual(138);
    expect(pushing).toBeLessThanOrEqual(150);
    expect(c.along).toBeGreaterThan(warden.along + mmToU(OUR_SIDE_TUNING.contactMm));
  });

  it("never blocks flyers, but a grounded low flyer weighs like a small foe", () => {
    const world = guarded(["cau-b1"]);
    const wasp = foeAt(world, "thorn-wasp", "troi", 10);
    const boar = foeAt(world, "tusk-boar", "cau", 3);
    expect(blockWeight(world, wasp)).toBe(0);
    expect(blockWeight(world, boar)).toBe(8);
    applyStatus(world, { kind: "enemy", slot: wasp.slot, serial: wasp.serial }, wasp.statuses, { id: "grounded", durationMs: 3000 });
    expect(blockWeight(world, wasp)).toBe(4);
  });

  it("strikes the foe it blocks for 12 VL × g(c) every 1.2 s", () => {
    const world = guarded(["cau-b1"]);
    // G0 archer: the raw blow shows.
    const archer = foeAt(world, "moss-archer", "cau", 8.5, { hp: 5000 });
    world.events.drain();
    walk(world, 140);
    const hits = foeHits(world, "unit");
    expect(hits.map(([, serial, amount, type]) => [serial, amount, type])).toEqual([
      [archer.serial, 12, "physical"],
      [archer.serial, 12, "physical"],
    ]);
    expect(hits[1]![0] - hits[0]![0]).toBe(72);
    walk(world, 72);
    expect(foeHits(world, "unit")).toHaveLength(1);
    expect(world.stats.damageOurSide).toBe(36);
  });

  it("falls at 0 HP, frees its foes, rises after 14 s and at wave end", () => {
    const world = guarded(["cau-b1"]);
    const warden = world.units.list[0]!;
    const grunt = foeAt(world, "moss-grunt", "cau", 8.5, { hp: 5000 });
    walk(world, 5);
    expect(grunt.blockedBy).toBe(0);
    // G1 armour: 100 physical → 70.
    expect(damageUnit(world, 0, 100, "physical", { kind: "enemy", slot: grunt.slot, serial: grunt.serial })).toBe(70);
    damageUnit(world, 0, 5000, "physical", { kind: "enemy", slot: grunt.slot, serial: grunt.serial });
    expect(warden.downUntil).toBe(world.tick + 840);
    expect(grunt.blockedBy).toBe(-1);
    expect(eventsOf(world, "unit-down")).toHaveLength(1);
    walk(world, 30);
    expect(grunt.blockedBy).toBe(-1);
    stepOurSide(world, 840);
    expect(warden).toMatchObject({ downUntil: -1, hp: 459 });
    // A blow dealt elsewhere that leaves 0 HP also fells it on the next step.
    warden.hp = 0;
    stepOurSide(world, 1);
    expect(warden.downUntil).toBeGreaterThan(world.tick);
    world.phase = "break";
    stepOurSide(world, 1);
    expect(warden.downUntil).toBe(-1);
    expect(eventsOf(world, "unit-up")).toHaveLength(2);
  });

  it("holds a wolf like any small foe; after movement's pounce lets go it is not grabbed again", () => {
    const world = guarded(["cau-b1"]);
    const warden = world.units.list[0]!;
    const wolf = foeAt(world, "blight-wolf", "cau", 7, { hp: 5000 });
    walk(world, 20);
    expect(wolf.blockedBy).toBe(0);
    expect(warden.blockUsed).toBe(4);
    // The pounce is sim-battle's: blockerFor never spends it.
    expect(wolf.pounces).toBe(1);
    // Movement's leap: let go, 3 m on, one pounce spent.
    wolf.blockedBy = -1;
    wolf.pounces -= 1;
    wolf.along = warden.along + mToU(3);
    placeOnLane(world, wolf);
    expect(blockerFor(world, wolf)).toBe(-1);
    expect(warden.blockUsed).toBe(0);
    stepOurSide(world, 1);
    expect(warden.blockUsed).toBe(0);
  });

  it("steps out up to 4 m to meet a foe, then walks back to its point", () => {
    const world = guarded(["cau-b2"]);
    const warden = world.units.list[0]!;
    const home = warden.home;
    const grunt = foeAt(world, "moss-grunt", "cau", 14);
    stepOurSide(world, 100);
    expect(warden.along).toBe(home - mToU(4));
    grunt.alive = false;
    stepOurSide(world, 100);
    expect(warden.along).toBe(home);
  });

  it("regenerates 4 %/s after 3 s unhit; chain 10+ adds 1 %/s", () => {
    const world = guarded(["suoi-b1"]);
    const warden = world.units.list[0]!;
    world.tick = 600;
    damageUnit(world, 0, 100, "physical", { kind: "hero" });
    expect(warden.hp).toBe(389);
    stepOurSide(world, 180);
    expect(warden.hp).toBe(389);
    stepOurSide(world, 1);
    expect(warden.hp).toBe(389 + 18);
    world.words.chain = 10;
    damageUnit(world, 0, 100, "physical", { kind: "hero" });
    stepOurSide(world, 60);
    expect(warden.hp).toBe(389 + 18 - 70 + 5);
  });
});
