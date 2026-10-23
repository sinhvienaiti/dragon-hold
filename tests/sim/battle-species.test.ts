import { describe, expect, it } from "vitest";
import { ENEMIES } from "../../src/content/data/enemies";
import { GENERALS } from "../../src/content/data/generals";
import { knockBack } from "../../src/sim/movement";
import { ACTION } from "../../src/sim/movement";
import { clusterLeader } from "../../src/sim/spawn";
import { applyStatus, hasStatus } from "../../src/sim/status";
import { mToU } from "../../src/sim/fixed";
import { EMPTY_STAGE, Log, battleStage, foe, fromDaisM, laneLengthM, run, runUntil, type, warden, waveWorld } from "./battle-helpers";

/** Behaviour per M0 species (02 §2.2) through the real step. */
describe("battle species", () => {
  it("keeps one readable silhouette per gait: biped tall, quadruped long and low, flyer floats, swarm tiny", () => {
    for (const def of [...Object.values(ENEMIES), ...Object.values(GENERALS)]) {
      const [w, h, l] = def.show.placeholder.sizeM;
      if (def.gait === "biped") expect(h).toBeGreaterThan(Math.max(w, l) * 1.5);
      if (def.gait === "quadruped") expect(l).toBeGreaterThan(h);
      if (def.gait === "flyer") expect(def.show.placeholder.hoverM).toBeGreaterThan(0);
      // Tiny next to the others, yet ≥ 26 px at the default camera (05 §2.3, dh-scale.mjs).
      if (def.gait === "swarm") expect(Math.max(w, h, l)).toBeLessThan(1);
      if (def.gait === "swarm") expect(h).toBeLessThan(0.5);
    }
    // One colour per family.
    expect(ENEMIES["moss-grunt"].show.placeholder.color).toBe(ENEMIES["moss-archer"].show.placeholder.color);
    expect(ENEMIES["blight-wolf"].show.placeholder.color).not.toBe(ENEMIES["moss-grunt"].show.placeholder.color);
  });

  it("E09 walks to the melee ring and cuts the Fire Dragon after a 0.5 s wind-up, every 1.4 s", () => {
    const log = new Log();
    const world = waveWorld();
    const grunt = foe(world, "moss-grunt", "cau");
    // The grunt's own cut (Héo lan comes from the Dragon's side as source "hero").
    runUntil(world, () => log.of("hit").some((hit) => hit.target.kind === "hero" && hit.source.kind === "enemy"), 1200, log);
    expect(grunt.along).toBe(world.lanes[grunt.lane]!.length);
    expect(fromDaisM(grunt)).toBeCloseTo(6, 0);
    expect(grunt.mode).toBe("attack");
    const windup = log.of("attack").find((a) => a.stage === "windup")!;
    const strike = log.of("attack").find((a) => a.stage === "strike")!;
    expect(strike.tick - windup.tick).toBe(30);
    // 8 × g(2) = 8, through the Dragon's 20 armour (16.7 %): 7 (00 §4.2).
    const hit = log.of("hit").find((h) => h.target.kind === "hero" && h.source.kind === "enemy")!;
    expect(hit.amount).toBe(7);
    expect(hit.damageType).toBe("physical");
    log.clear();
    run(world, 200, log);
    const strikes = log.of("attack").filter((a) => a.stage === "strike");
    expect(strikes.length).toBeGreaterThanOrEqual(2);
    expect(strikes[1]!.tick - strikes[0]!.tick).toBe(84);
  });

  it("E11 stops in the shooting band 12 m out and shoots with a red aim line", () => {
    const log = new Log();
    const world = waveWorld();
    const archer = foe(world, "moss-archer", "cau");
    runUntil(world, () => log.of("hit").some((hit) => hit.target.kind === "hero"), 1500, log);
    expect(fromDaisM(archer)).toBeGreaterThan(11.5);
    expect(fromDaisM(archer)).toBeLessThan(12.5);
    expect(archer.along).toBeLessThan(world.lanes[archer.lane]!.length);
    const line = log.of("telegraph").find((t) => t.source.kind === "enemy")!;
    expect(line.owner).toBe("enemy");
    expect(line.shape).toBe("line");
    expect(line.durationMs).toBe(600);
  });

  it("E11 steps back 2 m when a blocker reaches it, then shoots the unit", () => {
    const log = new Log();
    const world = waveWorld();
    const unit = warden(world, "cau-b1");
    const archer = foe(world, "moss-archer", "cau", unit.along / 60_000 - 0.5);
    const start = archer.along;
    runUntil(world, () => archer.mode === "retreat", 5, log);
    runUntil(world, () => archer.action === ACTION.none, 120, log);
    expect(start - archer.along).toBe(mToU(2));
    expect(archer.blockedBy).toBe(-1);
    runUntil(world, () => log.of("hit").some((hit) => hit.target.kind === "unit"), 400, log);
    expect(log.of("attack").find((a) => a.stage === "strike" && a.source.kind === "enemy")!.target).toEqual({ kind: "unit", slot: unit.index });
  });

  it("E18 pounces over one blocker after a 0.5 s red line, and the next blocker holds it", () => {
    const log = new Log();
    const world = waveWorld();
    const first = warden(world, "cau-b1");
    const second = warden(world, "cau-b2");
    const wolf = foe(world, "blight-wolf", "cau", 4);
    runUntil(world, () => wolf.action === ACTION.pounceWindup, 200, log);
    expect(wolf.blockedBy).toBe(first.index);
    const line = log.of("telegraph").at(-1)!;
    expect(line.durationMs).toBe(500);
    runUntil(world, () => wolf.mode === "airborne", 40, log);
    expect(wolf.blockedBy).toBe(-1);
    run(world, 10, log);
    expect(wolf.y).toBeGreaterThan(0);
    runUntil(world, () => wolf.action === ACTION.none, 30, log);
    expect(wolf.along).toBeGreaterThan(first.along + mToU(1.2));
    expect(wolf.pounces).toBe(0);
    runUntil(world, () => wolf.blockedBy === second.index, 300, log);
    const held = wolf.along;
    run(world, 120, log);
    expect(wolf.along).toBe(held);
    expect(wolf.mode).toBe("blocked");
  });

  it("E18 runs 15 % faster in a pack of three (Tru)", () => {
    const lone = waveWorld();
    const solo = foe(lone, "blight-wolf", "cau", 2);
    const packed = waveWorld();
    const pack = [foe(packed, "blight-wolf", "cau", 2, -0.6), foe(packed, "blight-wolf", "cau", 2, 0), foe(packed, "blight-wolf", "cau", 2, 0.6)];
    run(lone, 60);
    run(packed, 60);
    const gain = (pack[1]!.along - mToU(2)) / (solo.along - mToU(2));
    expect(gain).toBeGreaterThan(1.14);
    expect(gain).toBeLessThan(1.16);
  });

  it("E19 paws behind a red line for 1 s, charges into the Dragon, then stands stunned and takes 25 % more", () => {
    const log = new Log();
    const world = waveWorld();
    const boar = foe(world, "tusk-boar", "cau", 0);
    boar.along = world.lanes[boar.lane]!.length - mToU(10);
    runUntil(world, () => boar.action === ACTION.chargeWindup, 120, log);
    const line = log.of("telegraph").at(-1)!;
    expect(line.owner).toBe("enemy");
    expect(line.shape).toBe("line");
    expect(line.durationMs).toBe(1000);
    const windupTick = world.tick;
    runUntil(world, () => boar.mode === "charge", 80, log);
    expect(world.tick - windupTick).toBe(60);
    runUntil(world, () => log.of("hit").some((hit) => hit.target.kind === "hero"), 60, log);
    // 20 × g(2) = 20, through 20 armour: 17.
    expect(log.of("hit").find((hit) => hit.target.kind === "hero")!.amount).toBe(17);
    expect(boar.along).toBe(world.lanes[boar.lane]!.length);
    expect(hasStatus(boar.statuses, "stun", world.tick)).toBe(true);
    expect(hasStatus(boar.statuses, "vulnerable", world.tick)).toBe(true);
    log.clear();
    type(world, boar, "perfect");
    run(world, 13, log);
    // A Perfect word is 112 at C2; vulnerable +25 %: 140.
    expect(log.of("hit").find((hit) => hit.target.kind === "enemy")!.amount).toBe(140);
  });

  it("E19's charge throws a blocking unit back and a knockback breaks its wind-up (ĐẨY)", () => {
    const log = new Log();
    const world = waveWorld();
    const unit = warden(world, "cau-b2");
    unit.along -= mToU(3);
    const boar = foe(world, "tusk-boar", "cau", 2);
    runUntil(world, () => log.of("hit").some((hit) => hit.target.kind === "unit"), 900, log);
    expect(unit.along).toBeGreaterThan(unit.home - mToU(3));
    expect(boar.action).toBe(ACTION.none);

    const second = waveWorld();
    const pusher = foe(second, "tusk-boar", "cau", 0);
    pusher.along = second.lanes[pusher.lane]!.length - mToU(9);
    runUntil(second, () => pusher.action === ACTION.chargeWindup, 120);
    knockBack(second, pusher, mToU(3));
    expect(pusher.action).toBe(ACTION.none);
    expect(pusher.mode).toBe("knockback");
  });

  it("E01 flies the sky lane 3 m up, is never blocked, hovers 10 m out and stings the Dragon", () => {
    const log = new Log();
    const world = waveWorld();
    warden(world, "cau-b2");
    const wasp = foe(world, "thorn-wasp", "troi");
    run(world, 30, log);
    expect(wasp.y).toBe(mToU(3));
    runUntil(world, () => log.of("hit").some((hit) => hit.target.kind === "hero"), 1500, log);
    expect(wasp.blockedBy).toBe(-1);
    expect(fromDaisM(wasp)).toBeGreaterThan(9.5);
    expect(fromDaisM(wasp)).toBeLessThan(10.5);
    // 5 × g(2) = 5, through 20 armour: 4.
    expect(log.of("hit").find((hit) => hit.target.kind === "hero")!.amount).toBe(4);
    // Lưới Phóng grounds it: it walks the ground (y 0) and the view sees "grounded".
    applyStatus(world, { kind: "enemy", slot: wasp.slot, serial: wasp.serial }, wasp.statuses, { id: "grounded", durationMs: 3000 });
    run(world, 2);
    expect(wasp.y).toBe(0);
    expect(wasp.mode).toBe("grounded");
  });

  it("E25 leaves the gate as one cluster on a path edge, moves together and falls to one cluster word", () => {
    const log = new Log();
    const world = waveWorld(battleStage([[{ atMs: 0, lane: "suoi", shape: "cluster", foe: "thorn-ant", count: 8 }]]), {}, log);
    run(world, 2, log);
    const spawns = log.of("spawn").filter((s) => s.foe === "thorn-ant");
    expect(spawns).toHaveLength(8);
    expect(new Set(spawns.map((s) => s.tick)).size).toBe(1);
    expect(new Set(spawns.map((s) => s.cluster)).size).toBe(1);
    const ants = world.enemies.list.filter((e) => e.alive && e.foe === "thorn-ant");
    const side = Math.sign(ants[0]!.homeLateral);
    expect(side).not.toBe(0);
    for (const ant of ants) expect(Math.sign(ant.homeLateral)).toBe(side);
    expect(clusterLeader(world, ants[0]!.cluster)).toBe(ants[0]);
    run(world, 300, log);
    const alongs = ants.map((ant) => ant.along);
    expect(Math.max(...alongs) - Math.min(...alongs)).toBeLessThan(mToU(2.5));
    const xp = world.hero.xp;
    type(world, ants[0]!, "ok");
    run(world, 14, log);
    expect(ants.every((ant) => !ant.alive)).toBe(true);
    expect(world.hero.xp - xp).toBe(2);
  });

  it("generals stop at 8 m from the dais", () => {
    const world = waveWorld(EMPTY_STAGE);
    const general = foe(world, "moss-banner", "suoi");
    runUntil(world, () => general.mode === "attack" || general.mode === "hold", 1500);
    run(world, 30);
    expect(fromDaisM(general)).toBeGreaterThan(7.5);
    expect(fromDaisM(general)).toBeLessThan(8.5);
    expect(laneLengthM(world, general)).toBeGreaterThan(general.along / 60_000);
  });
});
