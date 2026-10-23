import { describe, expect, it } from "vitest";
import { GENERALS } from "../../src/content/data/generals";
import { auraPct, sealGeneral } from "../../src/sim/auras";
import { bannerStanding, pullBanner } from "../../src/sim/boss";
import { damageEnemy } from "../../src/sim/combat";
import { mToU } from "../../src/sim/fixed";
import { ACTION } from "../../src/sim/movement";
import { applyStatus, hasStatus } from "../../src/sim/status";
import { Log, foe, run, runUntil, waveWorld } from "./battle-helpers";

const G01 = GENERALS["moss-banner"];

/** G01: Xung Phong on the ground, Ấn Phá turns it off, Cắm Cờ, death flinch (02 §3.2). */
describe("battle auras and the general", () => {
  it("draws a 6 m Xung Phong ring that speeds allies inside it by 15 %, not the general itself", () => {
    const log = new Log();
    const world = waveWorld();
    const general = foe(world, "moss-banner", "cau", 10);
    const inside = foe(world, "moss-grunt", "cau", 12, 0.5);
    const outside = foe(world, "moss-grunt", "suoi", 4);
    run(world, 1, log);
    const ring = log.of("aura")[0]!;
    expect(ring).toMatchObject({ aura: "speed", on: true, radiusM: 6, enemy: { slot: general.slot, serial: general.serial } });
    expect(auraPct(world, inside, "speed")).toBe(15);
    expect(auraPct(world, outside, "speed")).toBe(0);
    expect(auraPct(world, general, "speed")).toBe(0);
    expect(world.auras.bySlot[inside.slot]).toBe(1);
    const a = inside.along;
    const b = outside.along;
    run(world, 30);
    // 2.0 m/s × 1.15 against 2.0 m/s (the grunt on Đường Suối is before its ford).
    expect((inside.along - a) / (outside.along - b)).toBeCloseTo(1.15, 2);
  });

  it("Ấn Phá turns the ring off 8 s and staggers the general 0.5 s; then the ring returns", () => {
    const log = new Log();
    const world = waveWorld();
    const general = foe(world, "moss-banner", "cau", 10);
    const ally = foe(world, "moss-grunt", "cau", 11, 0.5);
    run(world, 2, log);
    log.clear();
    sealGeneral(world, general);
    expect(hasStatus(general.statuses, "stun", world.tick)).toBe(true);
    run(world, 1, log);
    expect(log.of("aura")).toEqual([expect.objectContaining({ on: false, aura: "speed" })]);
    expect(auraPct(world, ally, "speed")).toBe(0);
    // A second seal call for the same word (words and a strike) changes nothing.
    sealGeneral(world, general);
    expect(world.auras.offUntil[general.slot]).toBe(world.tick - 1 + 480);
    run(world, 35);
    expect(general.mode).not.toBe("stunned");
    log.clear();
    runUntil(world, () => log.of("aura").some((e) => e.on), 500, log);
    expect(world.tick - 1 - (world.auras.offUntil[general.slot]! - 480)).toBe(480);
  });

  it("silence (CÂM) turns the ring off while it lasts", () => {
    const world = waveWorld();
    const general = foe(world, "moss-banner", "cau", 10);
    const ally = foe(world, "moss-grunt", "cau", 11, 0.5);
    run(world, 1);
    expect(auraPct(world, ally, "speed")).toBe(15);
    applyStatus(world, { kind: "enemy", slot: general.slot, serial: general.serial }, general.statuses, { id: "silence", durationMs: 2000 });
    run(world, 1);
    expect(auraPct(world, ally, "speed")).toBe(0);
    run(world, 130);
    expect(auraPct(world, ally, "speed")).toBe(15);
  });

  it("plants Cắm Cờ after a 1 s stand when allies are near: +25 % damage within 5 m, a word, pulled by typing", () => {
    const log = new Log();
    const world = waveWorld();
    const general = foe(world, "moss-banner", "suoi", 4);
    const allies = [foe(world, "moss-grunt", "suoi", 4.5, 0.6), foe(world, "moss-grunt", "suoi", 4.5, -0.6)];
    runUntil(world, () => general.action === ACTION.banner, 400, log);
    // First plant no sooner than 4 s after the general appears.
    expect(world.tick - general.bornAt).toBeGreaterThanOrEqual(240);
    const windup = log.of("banner").at(-1)!;
    expect(windup.stage).toBe("windup");
    expect(windup.durationMs).toBe(1000);
    const along = general.along;
    runUntil(world, () => log.of("banner").some((b) => b.stage === "plant"), 70, log);
    expect(general.along).toBe(along);
    const plant = log.of("banner").find((b) => b.stage === "plant")!;
    expect(plant.radiusM).toBe(5);
    expect(plant.durationMs).toBe(8000);
    const banner = world.boss.banners[plant.banner]!;
    expect(bannerStanding(world, plant.banner)).toBe(true);
    // Allies standing in it hit 25 % harder; the general's own aura is speed.
    run(world, 1);
    const near = allies.filter((ally) => (ally.x - banner.x) ** 2 + (ally.z - banner.z) ** 2 <= banner.radius ** 2);
    expect(near.length).toBeGreaterThan(0);
    for (const ally of near) expect(auraPct(world, ally, "damage")).toBe(25);
    pullBanner(world, plant.banner);
    expect(bannerStanding(world, plant.banner)).toBe(false);
    run(world, 1, log);
    expect(log.of("banner").some((b) => b.stage === "pulled")).toBe(true);
    for (const ally of near) expect(auraPct(world, ally, "damage")).toBe(0);
    // The next plant waits the 16 s cooldown.
    expect(world.boss.skillReadyAt.get(general.serial)! - plant.tick).toBe(960);
  });

  it("a banner falls by itself after 8 s", () => {
    const log = new Log();
    const world = waveWorld();
    const general = foe(world, "moss-banner", "suoi", 4);
    foe(world, "moss-grunt", "suoi", 4.5, 0.6);
    foe(world, "moss-grunt", "suoi", 4.5, -0.6);
    runUntil(world, () => log.of("banner").some((b) => b.stage === "plant"), 400, log);
    const plant = log.of("banner").find((b) => b.stage === "plant")!;
    runUntil(world, () => log.of("banner").some((b) => b.stage === "expired"), 600, log);
    expect(log.of("banner").find((b) => b.stage === "expired")!.tick - plant.tick).toBe(480);
    expect(general.alive).toBe(true);
  });

  it("a stun during the wind-up cancels the banner", () => {
    const log = new Log();
    const world = waveWorld();
    const general = foe(world, "moss-banner", "suoi", 4);
    foe(world, "moss-grunt", "suoi", 4.5, 0.6);
    foe(world, "moss-grunt", "suoi", 4.5, -0.6);
    runUntil(world, () => general.action === ACTION.banner, 400, log);
    applyStatus(world, { kind: "enemy", slot: general.slot, serial: general.serial }, general.statuses, { id: "stun", durationMs: 1000 });
    run(world, 2, log);
    expect(log.of("banner").at(-1)!.stage).toBe("cancel");
    expect(world.boss.banners).toHaveLength(0);
  });

  it("on death its ring goes out and allies within 6 m flinch 1 s", () => {
    const log = new Log();
    const world = waveWorld();
    const general = foe(world, "moss-banner", "cau", 10);
    const near = foe(world, "moss-grunt", "cau", 11, 0.5);
    const far = foe(world, "moss-grunt", "suoi", 2);
    run(world, 2, log);
    log.clear();
    damageEnemy(world, general, general.hp, "word", { kind: "hero" }, "word");
    run(world, 2, log);
    expect(log.of("death")[0]).toMatchObject({ foe: "moss-banner", tier: 4 });
    expect(log.of("aura")).toEqual([expect.objectContaining({ on: false })]);
    expect(hasStatus(near.statuses, "flinch", world.tick)).toBe(true);
    expect(hasStatus(far.statuses, "flinch", world.tick)).toBe(false);
    const held = near.along;
    run(world, 30);
    expect(near.along).toBe(held);
    run(world, 40);
    expect(near.along).toBeGreaterThan(held);
    expect(world.combat.rage).toBeGreaterThanOrEqual(80);
  });

  it("matches the G01 data of 02 §3.2", () => {
    expect(G01.auras).toEqual([{ kind: "speed", icon: "wind", radiusMm: 6000, valuePct: 15 }]);
    expect(G01.skill).toMatchObject({ cooldownMs: 16_000, windupMs: 1000, durationMs: 8000, radiusMm: 5000, damagePct: 25, wordBand: "D1" });
    expect(G01.seal).toMatchObject({ everyNthWord: 3, auraOffMs: 8000 });
    expect(G01.w100).toBe(600);
    expect(mToU(1)).toBe(60_000);
  });
});
