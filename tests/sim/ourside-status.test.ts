import { describe, expect, it } from "vitest";
import type { EntityRef } from "../../src/content/types";
import { msToTicks } from "../../src/sim/fixed";
import { useConsumable } from "../../src/sim/shop";
import { applyStatus, canAttack, canMove, hardControlSharePm, hasStatus, slowCapFor, slowPct, stanceNow, statusSpeedPm, stepStatus, tenacityFor, vulnerablePm } from "../../src/sim/status";
import type { EnemyState, World } from "../../src/sim/world";
import { eventsOf, foeAt, foeHits, makeWorld } from "./ourside-fixture";

const ref = (enemy: EnemyState): EntityRef => ({ kind: "enemy", slot: enemy.slot, serial: enemy.serial });

/** Steps statuses only, `ticks` times. */
function run(world: World, ticks: number): void {
  for (let k = 0; k < ticks; k += 1) {
    stepStatus(world);
    world.tick += 1;
  }
}

describe("statuses (03 §2.3)", () => {
  it("keeps the strongest slow under the foe and general caps", () => {
    const world = makeWorld({ phase: "wave" });
    const grunt = foeAt(world, "moss-grunt", "cau", 5);
    applyStatus(world, ref(grunt), grunt.statuses, { id: "slow", durationMs: 4000, value: 25 });
    applyStatus(world, ref(grunt), grunt.statuses, { id: "slow", durationMs: 1000, value: 40 });
    expect(slowPct(grunt.statuses, world.tick, slowCapFor(grunt))).toBe(40);
    expect(statusSpeedPm(world, grunt)).toBe(600);
    // The 40 % slow ends after 1 s; the longer 25 % one stays.
    run(world, 60);
    expect(slowPct(grunt.statuses, world.tick, slowCapFor(grunt))).toBe(25);
    applyStatus(world, ref(grunt), grunt.statuses, { id: "slow", durationMs: 1000, value: 90 });
    expect(slowPct(grunt.statuses, world.tick, slowCapFor(grunt))).toBe(60);
    const general = foeAt(world, "moss-banner", "cau", 5);
    applyStatus(world, ref(general), general.statuses, { id: "slow", durationMs: 1000, value: 90 });
    expect(slowPct(general.statuses, world.tick, slowCapFor(general))).toBe(45);
  });

  it("shrinks repeated hard control ×1, ×0.6, ×0.3, then grants Vững 4 s", () => {
    const world = makeWorld({ phase: "wave" });
    const grunt = foeAt(world, "moss-grunt", "cau", 5);
    // A long-lived foe, so the G15 guard does not bind here.
    grunt.statuses.life = msToTicks(60_000);
    const stun = { id: "stun" as const, durationMs: 1000 };
    expect(applyStatus(world, ref(grunt), grunt.statuses, stun)).toBe(60);
    expect(canMove(grunt.statuses, world.tick)).toBe(false);
    expect(canAttack(grunt.statuses, world.tick, true)).toBe(false);
    run(world, 60);
    expect(applyStatus(world, ref(grunt), grunt.statuses, stun)).toBe(36);
    run(world, 36);
    expect(applyStatus(world, ref(grunt), grunt.statuses, stun)).toBe(18);
    run(world, 1);
    // Third control running: further hard control is resisted; Vững follows it.
    expect(applyStatus(world, ref(grunt), grunt.statuses, { id: "root", durationMs: 2000 })).toBe(0);
    run(world, 17);
    expect(hasStatus(grunt.statuses, "steadfast", world.tick)).toBe(true);
    expect(applyStatus(world, ref(grunt), grunt.statuses, stun)).toBe(0);
    run(world, msToTicks(4000));
    expect(hasStatus(grunt.statuses, "steadfast", world.tick)).toBe(false);
    expect(applyStatus(world, ref(grunt), grunt.statuses, stun)).toBe(60);
  });

  it("lets rooted archers shoot but not rooted melee foes", () => {
    const world = makeWorld({ phase: "wave" });
    const grunt = foeAt(world, "moss-grunt", "cau", 5);
    grunt.statuses.life = msToTicks(60_000);
    applyStatus(world, ref(grunt), grunt.statuses, { id: "root", durationMs: 2000 });
    expect(canMove(grunt.statuses, world.tick)).toBe(false);
    expect(canAttack(grunt.statuses, world.tick, false)).toBe(false);
    expect(canAttack(grunt.statuses, world.tick, true)).toBe(true);
  });

  it("keeps our hard control on one foe within 35 % of its life (G15 guard)", () => {
    const world = makeWorld({ phase: "wave" });
    const grunt = foeAt(world, "moss-grunt", "cau", 5);
    // A 1 s stun every second for 60 s: diminishing returns plus the guard.
    for (let second = 0; second < 60; second += 1) {
      applyStatus(world, ref(grunt), grunt.statuses, { id: "stun", durationMs: 1000 });
      run(world, 60);
    }
    expect(grunt.statuses.hardTicks).toBeGreaterThan(0);
    expect(grunt.statuses.hardTicks * 100).toBeLessThanOrEqual(35 * grunt.statuses.life);
    expect(hardControlSharePm(world)).toBeLessThanOrEqual(350);
    // A fresh foe still gets a full stun (the guard counts at least 10 s of life).
    const fresh = foeAt(world, "moss-grunt", "suoi", 2);
    expect(applyStatus(world, ref(fresh), fresh.statuses, { id: "stun", durationMs: 1000 })).toBe(60);
  });

  it("does not count self stuns (E19 after a charge) as our control", () => {
    const world = makeWorld({ phase: "wave" });
    const boar = foeAt(world, "tusk-boar", "cau", 5);
    expect(applyStatus(world, ref(boar), boar.statuses, { id: "stun", durationMs: 1500, self: true })).toBe(90);
    run(world, 30);
    expect(boar.statuses.hardTicks).toBe(0);
    expect(boar.statuses.hardHits).toBe(0);
  });

  it("burns in up to 3 stacks, once a second, by the source that lit it", () => {
    const world = makeWorld({ phase: "wave" });
    const general = foeAt(world, "moss-banner", "cau", 5);
    for (let k = 0; k < 4; k += 1) applyStatus(world, ref(general), general.statuses, { id: "burn", durationMs: 4000, value: 5, by: "breath" });
    const burn = general.statuses.list.find((entry) => entry.id === "burn")!;
    expect(burn.stacks).toBe(3);
    world.events.drain();
    run(world, 240);
    // K0 resist: 3 × 5 magic a second, from the Dragon, counted as skill damage.
    expect(foeHits(world, "hero").map(([, serial, amount, type]) => [serial, amount, type])).toEqual(Array(4).fill([general.serial, 15, "magic"]));
    expect(world.stats.damageSkill).toBe(60);
    expect(hasStatus(general.statuses, "burn", world.tick)).toBe(false);
  });

  it("grounds only low flyers, generals for half, shortened by tenacity", () => {
    const world = makeWorld({ phase: "wave" });
    const wasp = foeAt(world, "thorn-wasp", "troi", 5);
    const grunt = foeAt(world, "moss-grunt", "cau", 5);
    expect(stanceNow(world, wasp)).toBe("low-air");
    expect(applyStatus(world, ref(grunt), grunt.statuses, { id: "grounded", durationMs: 3000 })).toBe(0);
    expect(applyStatus(world, ref(wasp), wasp.statuses, { id: "grounded", durationMs: 3000, tenacityPct: tenacityFor(world, wasp) })).toBe(180);
    expect(stanceNow(world, wasp)).toBe("ground");
    expect(applyStatus(world, ref(wasp), wasp.statuses, { id: "grounded", durationMs: 3000, tenacityPct: 15 })).toBe(153);
    const general = foeAt(world, "moss-banner", "cau", 4);
    expect(tenacityFor(world, general)).toBe(35);
  });

  it("multiplies Đánh dấu with other vulnerability", () => {
    const world = makeWorld({ phase: "wave" });
    const boar = foeAt(world, "tusk-boar", "cau", 5);
    applyStatus(world, ref(boar), boar.statuses, { id: "mark", durationMs: 2000 });
    applyStatus(world, ref(boar), boar.statuses, { id: "vulnerable", durationMs: 2000, value: 25, self: true });
    expect(vulnerablePm(boar.statuses, world.tick)).toBe(1438);
  });

  it("heals a potion over 2 s, halved under poison, with on and off events", () => {
    const world = makeWorld({ phase: "wave" });
    world.shop.held["small-potion"] = 2;
    world.hero.hp = 100;
    const heal = Math.round((world.hero.hpMax * 25) / 100);
    useConsumable(world, "small-potion");
    const on = eventsOf(world, "status");
    expect(on).toMatchObject([{ status: "regen", on: true, durationMs: 2000 }]);
    run(world, 120);
    // 25 % of max HP.
    expect(world.hero.hp).toBe(100 + heal);
    expect(eventsOf(world, "status")).toMatchObject([{ status: "regen", on: false }]);
    world.hero.hp = 100;
    world.shop.consumableReadyAt = 0;
    applyStatus(world, { kind: "hero" }, world.hero.statuses, { id: "poison", durationMs: 4000, value: 0 });
    useConsumable(world, "small-potion");
    run(world, 120);
    // Poison halves it.
    expect(world.hero.hp).toBeGreaterThanOrEqual(100 + Math.floor(heal / 2) - 1);
    expect(world.hero.hp).toBeLessThanOrEqual(100 + Math.ceil(heal / 2) + 1);
  });
});
