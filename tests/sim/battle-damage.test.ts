import { describe, expect, it } from "vitest";
import { ENEMIES } from "../../src/content/data/enemies";
import { DAMAGE, enemyHp } from "../../src/content/rules";
import { castSkill, damageEnemy, damageHero, reductionPm, wHp, wordDamage } from "../../src/sim/combat";
import { mToU } from "../../src/sim/fixed";
import { applyStatus } from "../../src/sim/status";
import { createWorld, step } from "../../src/sim/world";
import { EMPTY_STAGE, Log, MQ, battleStage, foe, run, type, waveWorld } from "./battle-helpers";

const HERO = { kind: "hero" } as const;

/** 00 §4.2, 03 §1–2: word damage ignores armour; our side's damage meets it; the Dragon's HP is the run. */
describe("battle damage", () => {
  it("scales foes by W × 90 × g(c) and words by P × M_q × M_c (C2: 1 W = 92 HP, a Perfect word 112)", () => {
    const world = waveWorld();
    expect(world.gPm).toBe(1020);
    expect(wHp(world)).toBe(92);
    expect(wordDamage(world, MQ.perfect, 1000, 0)).toBe(112);
    expect(wordDamage(world, MQ.ok, 1000, 0)).toBe(92);
    expect(foe(world, "moss-grunt", "cau").hp).toBe(92);
    expect(foe(world, "tusk-boar", "cau").hp).toBe(enemyHp(300, 2, 1000));
    expect(foe(world, "moss-banner", "cau").hp).toBe(551);
    // Hard: × 1.15 W on medium and above; swarm and small keep theirs (00 §4.10).
    const hard = waveWorld(EMPTY_STAGE, { difficulty: "hard" });
    expect(foe(hard, "moss-grunt", "cau").hp).toBe(92);
    expect(foe(hard, "tusk-boar", "cau").hp).toBe(enemyHp(300, 2, 1150));
  });

  it("lets word damage through armour and stops our physical damage with it (G1 = 30 %)", () => {
    const log = new Log();
    const world = waveWorld();
    const boar = foe(world, "tusk-boar", "cau");
    expect(ENEMIES["tusk-boar"].armour).toBe(1);
    type(world, boar, "perfect");
    run(world, 13, log);
    expect(log.of("hit")[0]).toMatchObject({ amount: 112, damageType: "word", grade: "perfect", tier: 3 });
    log.clear();
    const dealt = damageEnemy(world, boar, 112, "physical", { kind: "trap", slot: 0 }, "trap");
    expect(reductionPm(DAMAGE.tierG[1]!)).toBe(301);
    expect(dealt).toBe(78);
    // Magic meets resist: the boar has K0.
    expect(damageEnemy(world, boar, 50, "magic", HERO, "breath")).toBe(50);
    expect(world.stats.damageWord).toBe(112);
    expect(world.stats.damageOurSide).toBe(78);
    expect(world.stats.damageSkill).toBe(50);
  });

  it("multiplies vulnerable sources, keeps every blow at least 1 and halves armour under Phá giáp", () => {
    const world = waveWorld();
    const grunt = foe(world, "moss-grunt", "cau");
    const ref = { kind: "enemy" as const, slot: grunt.slot, serial: grunt.serial };
    applyStatus(world, ref, grunt.statuses, { id: "mark", durationMs: 4000 });
    expect(damageEnemy(world, grunt, 20, "word", HERO, "word")).toBe(23);
    expect(damageEnemy(world, grunt, 1, "physical", { kind: "unit", slot: 0 }, "unit")).toBe(1);
    applyStatus(world, ref, grunt.statuses, { id: "sunder", durationMs: 4000 });
    // G 43 × 0.5 = 22 → 18 % off: 16, then the mark × 1.15: 18.
    expect(damageEnemy(world, grunt, 20, "physical", { kind: "unit", slot: 0 }, "unit")).toBe(18);
  });

  it("kills a small foe with any word but Ẩu (00 §4.6), even past 1 W", () => {
    const log = new Log();
    const world = waveWorld();
    const archer = foe(world, "moss-archer", "cau");
    const tough = foe(world, "moss-archer", "suoi");
    expect(archer.hp).toBe(110);
    type(world, archer, "ok");
    type(world, tough, "sloppy");
    run(world, 13, log);
    expect(archer.alive).toBe(false);
    expect(tough.alive).toBe(true);
    expect(tough.hp).toBe(110 - wordDamage(world, MQ.sloppy, 1000, 0));
  });

  it("turns a word whose target died to the nearest worded foe within 4 m at 50 %", () => {
    const log = new Log();
    const world = waveWorld();
    const first = foe(world, "moss-grunt", "cau", 5, -0.5);
    const second = foe(world, "tusk-boar", "cau", 5, 0.8);
    second.word = 0;
    type(world, first, "perfect");
    damageEnemy(world, first, 500, "physical", { kind: "unit", slot: 0 }, "unit");
    run(world, 13, log);
    const turned = log.of("hit").find((hit) => hit.target.kind === "enemy" && hit.target.slot === second.slot)!;
    expect(turned.amount).toBe(56);
  });

  it("reduces the Fire Dragon's physical and magic damage by its raw armour and resist 20, takes shields first, gives rage per 4 % lost", () => {
    const world = waveWorld();
    const hero = world.hero;
    // The damage rules at 01 §2.2's 1 000 HP (× g(2)); FIRE_DRAGON.hp itself is tuned for S (BALANCE.md §9.1).
    hero.hp = hero.hpMax = 1020;
    expect(damageHero(world, 100, "physical", HERO)).toBe(83);
    expect(damageHero(world, 100, "magic", HERO)).toBe(83);
    expect(damageHero(world, 100, "true", HERO)).toBe(100);
    expect(damageHero(world, 100, "word", HERO)).toBe(100);
    hero.shield = 50;
    expect(damageHero(world, 120, "true", HERO)).toBe(70);
    expect(hero.shield).toBe(0);
    // 83 + 83 + 100 + 100 + 70 = 436 lost; 4 % of 1020 = 41 → 10 rage points of 1 (no chain bonus).
    expect(world.combat.rage).toBe(100);
    expect(world.stats.heroDamageTaken).toBe(436);
  });

  it("ends the run in defeat when the Fire Dragon falls, and the world stops", () => {
    const log = new Log();
    const world = waveWorld();
    foe(world, "moss-grunt", "cau");
    damageHero(world, 5000, "true", HERO);
    run(world, 1, log);
    expect(world.phase).toBe("defeat");
    expect(log.of("defeat")).toHaveLength(1);
    const hash = JSON.stringify(world.enemies.list.map((e) => e.along));
    run(world, 60, log);
    expect(JSON.stringify(world.enemies.list.map((e) => e.along))).toBe(hash);
    expect(log.of("defeat")).toHaveLength(1);
  });

  it("casts Phun Lửa down the lane with the most foe HP within 12 m, magic, with a burn; cooldown 14 s", () => {
    const log = new Log();
    const world = waveWorld();
    const near = foe(world, "tusk-boar", "cau", 20);
    const other = foe(world, "moss-grunt", "suoi", 2);
    castSkill(world, "breath");
    run(world, 1, log);
    const hit = log.of("hit").find((h) => h.target.kind === "enemy" && h.target.slot === near.slot)!;
    // 1.5 P = 153 at C2, magic against K0.
    expect(hit).toMatchObject({ amount: 153, damageType: "magic", tier: 3 });
    expect(log.of("hit").some((h) => h.target.kind === "enemy" && h.target.slot === other.slot)).toBe(false);
    expect(near.statuses.list.some((s) => s.id === "burn")).toBe(true);
    log.clear();
    castSkill(world, "breath");
    run(world, 1, log);
    expect(log.of("rejected")).toEqual([expect.objectContaining({ command: "skill", reason: "cooldown" })]);
  });

  it("drops Thiên Hỏa 0.8 s after a pale orange ring on the densest group: 2.5 P, stun 1 s", () => {
    const log = new Log();
    const world = waveWorld();
    const group = [foe(world, "moss-grunt", "suoi", 8, -0.6), foe(world, "moss-grunt", "suoi", 8.5, 0.6), foe(world, "tusk-boar", "suoi", 9)];
    foe(world, "moss-grunt", "cau", 3);
    castSkill(world, "skyfire");
    run(world, 1, log);
    const ring = log.of("telegraph")[0]!;
    expect(ring).toMatchObject({ owner: "ally", shape: "circle", radiusM: 4, durationMs: 800 });
    run(world, 48, log);
    const boar = group[2]!;
    expect(log.of("hit").find((h) => h.target.kind === "enemy" && h.target.slot === boar.slot)!.amount).toBe(255);
    expect(boar.statuses.list.some((s) => s.id === "stun")).toBe(true);
    expect(group[0]!.alive).toBe(false);
  });

  it("roars (Long Hống) on the urgent word: 3 P word damage within 10 m and a 6 m knockback (a general weighs 2)", () => {
    const world = waveWorld();
    const general = foe(world, "moss-banner", "cau", 0);
    general.along = general.stopAt;
    const grunt = foe(world, "moss-grunt", "suoi", 0);
    grunt.along = world.lanes[grunt.lane]!.length;
    run(world, 1);
    const before = general.along;
    castSkill(world, "roar");
    expect(general.hp).toBe(551 - 306);
    expect(before - general.along).toBe(mToU(3));
    expect(general.mode).toBe("knockback");
    expect(grunt.alive).toBe(false);
  });

  it("fills Long Nộ and unleashes Viêm Đế: a beam down the lane with every word, a 7 m blast at the end", () => {
    const log = new Log();
    const world = waveWorld();
    const front = foe(world, "tusk-boar", "cau", 8);
    const behind = foe(world, "tusk-boar", "cau", 6);
    castSkill(world, "inferno");
    run(world, 1, log);
    expect(log.of("rejected")[0]).toMatchObject({ reason: "rage" });
    world.combat.rage = 1000;
    castSkill(world, "inferno");
    expect(world.combat.rage).toBe(0);
    expect(world.stats.ultimates).toBe(1);
    log.clear();
    type(world, front, "perfect");
    run(world, 13, log);
    // The word on the front boar, and 1.2 P = 122 on both boars from the beam.
    expect(log.of("hit").filter((h) => h.target.kind === "enemy" && h.target.slot === behind.slot && h.amount === 122)).toHaveLength(1);
    world.combat.rage = 1000;
    castSkill(world, "inferno");
    run(world, 1, log);
    expect(log.of("rejected").at(-1)).toMatchObject({ reason: "cooldown" });
    log.clear();
    run(world, 600, log);
    expect(log.of("skill").some((s) => s.skill === "inferno" && s.stage === "end")).toBe(true);
  });

  it("rejects Dragon skills outside a wave", () => {
    const world = createWorld(battleStage([[]]));
    castSkill(world, "breath");
    expect(world.events.drain()).toEqual([expect.objectContaining({ type: "rejected", reason: "phase" })]);
    step(world);
  });
});
