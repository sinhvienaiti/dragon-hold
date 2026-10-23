import { describe, expect, it } from "vitest";
import { STAGE_M0 } from "../../src/content/data/stages";
import type { SpawnGroupDef, StageDef } from "../../src/content/types";
import { earn, leftoverScales, learnAhead, payWaveEnd, reviewCard, spend, stageGoldTarget, stageThreat10, waveEndGold } from "../../src/sim/economy";
import { eventsOf, foeAt, makeWorld, sweepDead } from "./ourside-fixture";

const group = (lane: string, foe: SpawnGroupDef["foe"], count: number, shape: SpawnGroupDef["shape"] = "line"): SpawnGroupDef => ({ atMs: 0, lane, shape, foe, count });

/** M0 with groups in waves 1–2 only. */
const STAGE: StageDef = {
  ...STAGE_M0,
  waves: STAGE_M0.waves.map((wave, index) => ({
    ...wave,
    groups: index === 0 ? [group("cau", "moss-grunt", 4), group("suoi", "thorn-ant", 8, "cluster")] : index === 1 ? [group("cau", "moss-archer", 2)] : [],
  })),
};

describe("economy (00 §4.9)", () => {
  it("gives M0 200 at start and a budget of 900 × 1.25 × 1.8", () => {
    const world = makeWorld({ phase: "prep" });
    expect(world.economy.gold).toBe(200);
    expect(world.economy.budget).toBe(2025);
    expect(world.economy.killPool).toBe(1215);
    expect(world.economy.waveEndPool).toBe(506);
    expect(stageGoldTarget(world)).toBe(2225);
  });

  it("plans the stage threat from what the groups spawn", () => {
    // 4 × 30 + one cluster of 8 × 7 + 2 × 70.
    expect(stageThreat10(STAGE)).toBe(316);
    // G01 with an ant escort: 300 + a cluster of 6 (its minimum) × 7; elites × 1.6.
    const escort: SpawnGroupDef = { atMs: 0, lane: "suoi", shape: "escort", foe: "moss-banner", count: 1, escort: { foe: "thorn-ant", count: 1 } };
    expect(stageThreat10({ ...STAGE, waves: [{ ...STAGE.waves[0]!, groups: [escort] }] })).toBe(342);
    expect(stageThreat10({ ...STAGE, waves: [{ ...STAGE.waves[0]!, groups: [{ ...group("cau", "moss-grunt", 1), elite: true }] }] })).toBe(48);
  });

  it("pays kills by threat share and the whole kill pool when every planned foe falls", () => {
    const world = makeWorld({ stage: STAGE, phase: "wave" });
    const grunts = [0, 1, 2, 3].map((k) => foeAt(world, "moss-grunt", "cau", 2 + k));
    const ants = Array.from({ length: 8 }, (_, k) => foeAt(world, "thorn-ant", "suoi", 3, { cluster: 1, lateralM: (k - 4) * 0.2 }));
    const kill = (list: typeof grunts) => {
      for (const enemy of list) {
        enemy.alive = false;
        enemy.killedBy = "word";
      }
      sweepDead(world);
    };
    kill([grunts[0]!]);
    expect(world.economy.gold).toBe(200 + Math.floor((1215 * 30) / 316));
    kill(grunts.slice(1));
    expect(world.economy.killPaid).toBe(Math.floor((1215 * 120) / 316));
    // Seven ants pay nothing yet; the eighth pays the cluster once.
    world.events.drain();
    kill(ants.slice(0, 7));
    expect(eventsOf(world, "gold")).toEqual([]);
    kill([ants[7]!]);
    expect(eventsOf(world, "gold")).toHaveLength(1);
    expect(world.economy.killPaid).toBe(Math.floor((1215 * 176) / 316));
    const rest = [foeAt(world, "moss-archer", "cau", 3), foeAt(world, "moss-archer", "cau", 4)];
    kill(rest);
    expect(world.economy.killPaid).toBe(1215);
    // Unplanned extra kills never push past the pool.
    kill([foeAt(world, "moss-grunt", "cau", 6)]);
    expect(world.economy.killPaid).toBe(1215);
  });

  it("pays a cluster once even when its members die in one tick", () => {
    const world = makeWorld({ stage: STAGE, phase: "wave" });
    const ants = Array.from({ length: 8 }, () => foeAt(world, "thorn-ant", "suoi", 3, { cluster: 7 }));
    for (const ant of ants) {
      ant.alive = false;
      ant.killedBy = "breath";
    }
    world.events.drain();
    sweepDead(world);
    expect(eventsOf(world, "gold")).toHaveLength(1);
    expect(world.economy.killPaid).toBe(Math.floor((1215 * 56) / 316));
    expect(world.economy.clusters.size).toBe(0);
  });

  it("grows wave-end gold 10 % a wave and pays the pool exactly, once per wave", () => {
    const world = makeWorld({ phase: "break" });
    const first = waveEndGold(world, 1);
    const second = waveEndGold(world, 2);
    expect(Math.abs(second * 100 - first * 110)).toBeLessThanOrEqual(110);
    let total = 0;
    for (let wave = 1; wave <= 10; wave += 1) total += payWaveEnd(world, wave);
    expect(total).toBe(506);
    expect(world.economy.waveEndPaid).toBe(506);
    expect(payWaveEnd(world, 3)).toBe(0);
    expect(payWaveEnd(world, 11)).toBe(0);
  });

  it("caps learn-ahead at +40 in prep and rejects it later", () => {
    const world = makeWorld({ phase: "prep" });
    learnAhead(world, 5);
    learnAhead(world, 5);
    expect(world.economy.gold).toBe(240);
    expect(world.economy.otherPaid).toBe(40);
    world.phase = "break";
    world.events.drain();
    learnAhead(world, 3);
    expect(eventsOf(world, "rejected")).toMatchObject([{ command: "learn-ahead", reason: "phase" }]);
    expect(world.economy.gold).toBe(240);
  });

  it("pays review cards +10 gold and +2 XP, three answers a break", () => {
    const world = makeWorld({ phase: "break" });
    reviewCard(world, true);
    reviewCard(world, false);
    reviewCard(world, true);
    reviewCard(world, true);
    expect(world.economy.gold).toBe(220);
    expect(world.hero.xp).toBe(4);
    expect(eventsOf(world, "rejected")).toMatchObject([{ command: "review-card", reason: "limit" }]);
    world.phase = "wave";
    reviewCard(world, true);
    expect(eventsOf(world, "rejected")).toMatchObject([{ command: "review-card", reason: "phase" }]);
  });

  it("never spends below zero and reports every change", () => {
    const world = makeWorld({ phase: "break", gold: 50 });
    expect(spend(world, 60, "build")).toBe(false);
    expect(spend(world, 50, "build")).toBe(true);
    expect(world.economy.gold).toBe(0);
    earn(world, 35, "sell");
    expect(eventsOf(world, "gold")).toEqual([
      { type: "gold", delta: -50, total: 0, reason: "build", tick: 0 },
      { type: "gold", delta: 35, total: 35, reason: "sell", tick: 0 },
    ]);
    expect(world.stats.goldSpent).toBe(15);
    expect(world.stats.goldEarned).toBe(0);
    expect(leftoverScales(35)).toBe(0);
    expect(leftoverScales(999)).toBe(3);
  });
});
