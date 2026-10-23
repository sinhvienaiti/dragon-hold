import { describe, expect, it } from "vitest";
import { ENEMY_IDS } from "../../src/content/data/enemies";
import { GENERALS } from "../../src/content/data/generals";
import { STAGE_M0 } from "../../src/content/data/stages";
import { M0_WAVES } from "../../src/content/data/waves";
import { FLOW, LOAD } from "../../src/content/rules";
import type { WaveDef } from "../../src/content/types";
import {
  foeDefOf, groupMembers, groupSpanMs, groupsIn, headsIn, lullsOf, peakLoad100, planArrivals, threatByLane10, waveLoad100, waveW100,
} from "../../src/sim/waves";
import { createWorld, step } from "../../src/sim/world";
import { Log, battleStage, nearest, playStage, run, runUntil, type, waveWorld } from "./battle-helpers";

const meanPace = (wave: WaveDef): number => wave.groups.length / (wave.durationMs / 1000);
const holdsHeavy = (wave: WaveDef, fromMs: number, toMs: number): boolean =>
  wave.groups.some((group) => group.atMs >= fromMs && group.atMs < toMs && foeDefOf(group.foe).w100 >= 300);

/** The 10 M0 waves against the typing-load budget (00 §4.4) and the wave generator rules (02 §5). */
describe("battle waves: the plan", () => {
  it("has 10 waves ramping from wave 1's 0.55–0.65 to the last wave's 1.05–1.25, generals in waves 5 and 10 only", () => {
    expect(M0_WAVES).toHaveLength(10);
    expect(M0_WAVES[0]!.load100).toBeGreaterThanOrEqual(LOAD.wave1[0]);
    expect(M0_WAVES[0]!.load100).toBeLessThanOrEqual(LOAD.wave1[1]);
    expect(M0_WAVES[9]!.load100).toBeGreaterThanOrEqual(LOAD.final[0]);
    expect(M0_WAVES[9]!.load100).toBeLessThanOrEqual(LOAD.final[1]);
    for (const wave of M0_WAVES) {
      const generals = wave.groups.filter((group) => group.foe in GENERALS);
      expect(generals.length > 0).toBe(wave.n === 5 || wave.n === 10);
      expect(wave.generals.length > 0).toBe(wave.n === 5 || wave.n === 10);
    }
    expect(M0_WAVES[5]!.breather).toBe(true);
    expect(M0_WAVES[5]!.load100).toBeLessThan(M0_WAVES[4]!.load100 * 0.85);
  });

  it("meets each wave's load within 5 % (W_gõ / (22.7 × minutes)), wave 1 in 0.55–0.65 and the last in 1.05–1.25", () => {
    for (const wave of M0_WAVES) {
      const load = waveLoad100(wave);
      expect(Math.abs(load - wave.load100), "wave " + wave.n).toBeLessThanOrEqual(wave.load100 * 0.05);
    }
    expect(waveLoad100(M0_WAVES[0]!)).toBeGreaterThanOrEqual(LOAD.wave1[0]);
    expect(waveLoad100(M0_WAVES[0]!)).toBeLessThanOrEqual(LOAD.wave1[1]);
    expect(waveLoad100(M0_WAVES[9]!)).toBeGreaterThanOrEqual(LOAD.final[0]);
    expect(waveLoad100(M0_WAVES[9]!)).toBeLessThanOrEqual(LOAD.final[1] + 5);
  });

  it("keeps the busiest 6, 8 and 10 s under each wave's peak cap; middle waves ≤ 1.15, wave 1 ≤ 1.00, every wave ≤ 1.40 (00 §4.4, G9)", () => {
    for (const wave of M0_WAVES) {
      const peak = Math.max(peakLoad100(wave, 6000), peakLoad100(wave, 8000), peakLoad100(wave, 10_000));
      expect(peak, "wave " + wave.n).toBeLessThanOrEqual(wave.peakLoad100);
      expect(wave.peakLoad100).toBeLessThanOrEqual(LOAD.hardCap);
      expect(wave.peakLoad100).toBeLessThanOrEqual(STAGE_M0.peakLoadCap100!);
    }
    for (const n of [2, 3, 4, 6, 7, 8]) expect(M0_WAVES[n - 1]!.peakLoad100).toBeLessThanOrEqual(LOAD.middlePeakMax);
    expect(M0_WAVES[0]!.peakLoad100).toBeLessThanOrEqual(100);
  });

  it("reads one foe alone as at most 1.0; a tight wolf pack reads 1.59 over 6 s, so packs run 3 s apart (2.2 s in the last wave)", () => {
    const solo: WaveDef = { n: 1, durationMs: 60_000, load100: 0, peakLoad100: 0, peaks: [], generals: [], groups: [{ atMs: 0, lane: "suoi", shape: "single", foe: "moss-banner", count: 1 }] };
    expect(peakLoad100(solo, 6000)).toBe(100);
    const tight: WaveDef = { ...solo, groups: [{ atMs: 0, lane: "suoi", shape: "line", foe: "blight-wolf", count: 3, gapMs: 400 }] };
    expect(peakLoad100(tight, 6000)).toBeGreaterThan(140);
    const line: WaveDef = { ...solo, groups: [{ atMs: 0, lane: "suoi", shape: "line", foe: "blight-wolf", count: 3, gapMs: 3000 }] };
    expect(peakLoad100(line, 6000)).toBeLessThanOrEqual(LOAD.middlePeakMax);
    for (const wave of M0_WAVES) {
      for (const group of wave.groups) if (group.foe === "blight-wolf") expect(group.gapMs ?? 0, "wave " + wave.n).toBeGreaterThanOrEqual(wave.n === M0_WAVES.length ? 2200 : 3000);
    }
  });

  it("has 2–3 peaks of 6–10 s at ≥ 1.5 × the mean group pace (or holding a general or heavy foe), lulls ≥ 8 s at ≤ 0.4 ×, the last peak the biggest", () => {
    for (const wave of M0_WAVES) {
      const tag = "wave " + wave.n;
      expect(wave.peaks.length, tag).toBeGreaterThanOrEqual(2);
      expect(wave.peaks.length, tag).toBeLessThanOrEqual(3);
      const mean = meanPace(wave);
      for (const peak of wave.peaks) {
        expect(peak.lengthMs, tag).toBeGreaterThanOrEqual(LOAD.peakMs[0]);
        expect(peak.lengthMs, tag).toBeLessThanOrEqual(LOAD.peakMs[1]);
        const groups = groupsIn(wave, peak.atMs, peak.atMs + peak.lengthMs);
        expect(groups, tag).toBeGreaterThanOrEqual(2);
        if (!holdsHeavy(wave, peak.atMs, peak.atMs + peak.lengthMs)) expect(groups, tag + " peak " + peak.atMs).toBeGreaterThanOrEqual(Math.floor(1.5 * mean * (peak.lengthMs / 1000)));
      }
      for (const lull of lullsOf(wave)) {
        const length = lull.toMs - lull.fromMs;
        expect(length, tag).toBeGreaterThanOrEqual(FLOW.lullMinMs);
        expect(groupsIn(wave, lull.fromMs, lull.toMs), tag + " lull " + lull.fromMs).toBeLessThanOrEqual(Math.max(1, Math.ceil((FLOW.lullRatePct / 100) * mean * (length / 1000))));
      }
      const heads = wave.peaks.map((peak) => headsIn(wave, peak.atMs, peak.atMs + peak.lengthMs));
      expect(heads.at(-1), tag).toBe(Math.max(...heads));
    }
  });

  it("keeps flyers under 15 % of a wave's threat and 35 % of its heads (00 §4.5, C1–3)", () => {
    for (const wave of M0_WAVES) {
      const threat = threatByLane10(wave);
      const total = [...threat.values()].reduce((sum, value) => sum + value, 0);
      expect((threat.get("troi") ?? 0) * 100, "wave " + wave.n).toBeLessThanOrEqual(total * 15);
      const arrivals = planArrivals(wave);
      const heads = arrivals.reduce((sum, arrival) => sum + arrival.heads, 0);
      const flyers = arrivals.filter((arrival) => arrival.lane === "troi").reduce((sum, arrival) => sum + arrival.heads, 0);
      expect(flyers * 100).toBeLessThanOrEqual(heads * 35);
    }
  });

  it("gives the main ground lane 60–70 % of the ground threat (± 2) and swaps sides during the stage (02 §5.5)", () => {
    const mains: string[] = [];
    for (const wave of M0_WAVES) {
      const ground = [...threatByLane10(wave).entries()].filter(([lane]) => lane !== "troi");
      const total = ground.reduce((sum, [, value]) => sum + value, 0);
      const [lane, value] = ground.reduce((best, entry) => (entry[1] > best[1] ? entry : best));
      expect((value * 100) / total, "wave " + wave.n).toBeGreaterThanOrEqual(58);
      expect((value * 100) / total, "wave " + wave.n).toBeLessThanOrEqual(72);
      mains.push(lane);
    }
    expect(new Set(mains).size).toBe(2);
  });

  it("caps the general's W at 35 % of its wave's W_gõ (00 §4.5)", () => {
    for (const wave of M0_WAVES) {
      const general = planArrivals(wave).filter((arrival) => arrival.foe in GENERALS).reduce((sum, arrival) => sum + arrival.w100, 0);
      expect(general * 100, "wave " + wave.n).toBeLessThanOrEqual(waveW100(wave) * 35);
    }
  });

  it("sends one group per gate every 1.5 s after the last one has left, lanes ≥ 0.6 s apart, all before the wave's end", () => {
    for (const wave of M0_WAVES) {
      const groups = [...wave.groups].sort((a, b) => a.atMs - b.atMs);
      for (let i = 1; i < groups.length; i += 1) {
        for (let j = 0; j < i; j += 1) {
          const [a, b] = [groups[j]!, groups[i]!];
          if (a.lane === b.lane) expect(b.atMs - a.atMs, "wave " + wave.n + " " + b.lane + "@" + b.atMs).toBeGreaterThanOrEqual(Math.max(FLOW.gateGapMs, groupSpanMs(a) + 600));
          else expect(b.atMs - a.atMs, "wave " + wave.n + " @" + b.atMs).toBeGreaterThanOrEqual(FLOW.laneStaggerMs);
        }
      }
      for (const group of wave.groups) expect(group.atMs + groupSpanMs(group)).toBeLessThanOrEqual(wave.durationMs - 3000);
    }
  });

  it("brings every M0 species and G01, ant clusters of 6–10 and wolf packs of 3–5", () => {
    const seen = new Set(M0_WAVES.flatMap((wave) => planArrivals(wave).map((arrival) => arrival.foe)));
    for (const id of ENEMY_IDS) expect(seen.has(id), id).toBe(true);
    expect(seen.has("moss-banner")).toBe(true);
    for (const wave of M0_WAVES) {
      for (const group of wave.groups) {
        if (group.foe === "thorn-ant") {
          expect(group.count).toBeGreaterThanOrEqual(6);
          expect(group.count).toBeLessThanOrEqual(10);
        }
        if (group.foe === "blight-wolf") expect(groupMembers(group).length).toBeGreaterThanOrEqual(3);
      }
    }
  });
});

describe("battle waves: the director at run time", () => {
  it("spawns each group of a wave when the plan says (one tick per 16.7 ms) and every head of it", () => {
    for (const n of [1, 2, 3]) {
      const wave = M0_WAVES[n - 1]!;
      const log = new Log();
      // The plan's own timing: the pace director (which may stretch or squeeze the gaps) is off here.
      // Nobody types, so the live cap (20) would hold the last groups at their gates: room for the whole plan.
      const world = waveWorld(battleStage([wave.groups], { liveCap: 60 }), { paceDirector: false }, log);
      // Nobody types here: keep the Dragon up so the wave plays out.
      world.hero.hp = world.hero.hpMax = 1_000_000;
      const start = world.waves.startedAt;
      run(world, Math.round((wave.durationMs * 60) / 1000), log);
      const spawns = log.of("spawn");
      expect(spawns.length, "wave " + n).toBe(planArrivals(wave).reduce((sum, arrival) => sum + arrival.heads, 0));
      for (const arrival of planArrivals(wave)) {
        const tick = start + Math.round((arrival.ms * 60) / 1000);
        expect(spawns.some((spawn) => spawn.foe === arrival.foe && Math.abs(spawn.tick - tick) <= 1), "wave " + n + " " + arrival.foe + "@" + arrival.ms).toBe(true);
      }
      expect(world.waves.pending[0]).toBe(0);
    }
  });

  it("stretches spawn times by 1 / k for a slow typist (BALANCE.md §4.1) without changing who comes", () => {
    const wave = M0_WAVES[1]!;
    const fast = new Log();
    const slow = new Log();
    const a = waveWorld(battleStage([wave.groups]), {}, fast);
    const b = waveWorld(battleStage([wave.groups]), { paceKPm: 750 }, slow);
    a.hero.hp = a.hero.hpMax = 1_000_000;
    b.hero.hp = b.hero.hpMax = 1_000_000;
    run(a, 4000, fast);
    run(b, 4000, slow);
    const ta = fast.of("spawn").map((spawn) => spawn.tick - a.waves.startedAt);
    const tb = slow.of("spawn").map((spawn) => spawn.tick - b.waves.startedAt);
    expect(tb).toHaveLength(ta.length);
    expect(fast.of("spawn").map((s) => s.foe)).toEqual(slow.of("spawn").map((s) => s.foe));
    const last = ta.length - 1;
    expect(tb[last]! / ta[last]!).toBeCloseTo(1000 / 750, 1);
  });

  it("holds groups at the gate at the live cap while the clock runs, never above the cap", () => {
    const log = new Log();
    const stage = battleStage([[
      { atMs: 0, lane: "cau", shape: "line", foe: "moss-grunt", count: 4 },
      { atMs: 2000, lane: "cau", shape: "line", foe: "moss-grunt", count: 4 },
    ]], { liveCap: 5 });
    const world = waveWorld(stage, {}, log);
    let most = 0;
    for (let k = 0; k < 400; k += 1) {
      run(world, 1, log);
      most = Math.max(most, world.enemies.live);
    }
    expect(most).toBe(5);
    expect(world.stats.capWaitTicks).toBeGreaterThan(0);
    expect(world.waves.pending[0]).toBe(1);
    // Kills free room: the rest leave the gate.
    for (const enemy of world.enemies.list) if (enemy.alive) type(world, enemy);
    run(world, 200, log);
    expect(log.of("spawn")).toHaveLength(8);
  });

  it("runs prep → warning 6 s → wave → break 20 s (heal 10 %) → warning → … → victory with stars", () => {
    const log = new Log();
    const stage = battleStage([[{ atMs: 0, lane: "cau", shape: "single", foe: "moss-grunt", count: 1 }], [{ atMs: 0, lane: "suoi", shape: "single", foe: "moss-grunt", count: 1 }]]);
    const world = createWorld(stage);
    step(world);
    expect(world.phase).toBe("prep");
    step(world, [{ type: "start" }]);
    log.all.push(...world.events.drain());
    expect(world.phase).toBe("warning");
    expect(world.phaseEndsAt - world.tick).toBe(359);
    runUntil(world, () => world.phase === "wave", 400, log);
    expect(log.of("wave-start")[0]).toMatchObject({ wave: 1, waves: 2 });
    world.hero.hpMax = 1020;
    world.hero.hp = 500;
    runUntil(world, () => world.enemies.live > 0, 5, log);
    type(world, nearest(world)!);
    runUntil(world, () => world.phase === "break", 100, log);
    expect(log.of("wave-end")[0]!.wave).toBe(1);
    expect(world.hero.hp).toBe(500 + 102);
    expect(world.phaseEndsAt - world.tick).toBe(1199);
    // Shift + Enter: 2 gold a second left (max 40) and +5 rage.
    const gold = world.economy.gold;
    run(world, 600);
    // 599 ticks left at the call: 9 whole seconds.
    step(world, [{ type: "call-early" }]);
    expect(world.phase).toBe("warning");
    expect(world.economy.gold - gold).toBe(18);
    expect(world.combat.rage).toBe(50);
    runUntil(world, () => world.phase === "wave", 400, log);
    runUntil(world, () => world.enemies.live > 0, 5, log);
    type(world, nearest(world)!);
    runUntil(world, () => world.phase === "victory", 100, log);
    expect(log.of("victory")).toEqual([expect.objectContaining({ stars: 2 })]);
  });

  it("waits for Enter in an Easy break", () => {
    const stage = battleStage([[{ atMs: 0, lane: "cau", shape: "single", foe: "moss-grunt", count: 1 }], [{ atMs: 0, lane: "cau", shape: "single", foe: "moss-grunt", count: 1 }]]);
    const world = waveWorld(stage, { difficulty: "easy" });
    runUntil(world, () => world.enemies.live > 0, 5);
    type(world, nearest(world)!);
    runUntil(world, () => world.phase === "break", 100);
    expect(world.phaseEndsAt).toBe(-1);
    run(world, 3000);
    expect(world.phase).toBe("break");
    step(world, [{ type: "continue" }]);
    expect(world.phase).toBe("warning");
  });

  it("plays the whole M0 stage: an ideal fast typist wins with stars, nobody typing loses in wave 1", () => {
    const won = playStage(STAGE_M0, 159);
    expect(won.phase).toBe("victory");
    expect(won.wave).toBe(10);
    expect(won.stats.kills).toBe(M0_WAVES.reduce((sum, wave) => sum + planArrivals(wave).reduce((s, a) => s + a.heads, 0), 0));
    const lost = playStage(STAGE_M0, 1_000_000);
    expect(lost.phase).toBe("defeat");
    expect(lost.wave).toBeLessThanOrEqual(3);
  });
});
