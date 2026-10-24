import { describe, expect, it } from "vitest";
import { botDeck } from "../../scripts/balance/deck";
import { PACE, PRESSURE } from "../../src/content/rules";
import { BANDS } from "../../src/kit/balance";
import { BAND_MODE, DH_BANDS, DIRECTOR_IDLE_SLACK, directorBand } from "../../src/sim/director";
import { mToU } from "../../src/sim/fixed";
import { spawnFoe } from "../../src/sim/spawn";
import { paceFor, sloppyChancePm, type EnemyState, type World } from "../../src/sim/world";
import { EMPTY_STAGE, Log, battleStage, foe, run, waveWorld } from "./battle-helpers";

/** Thousandths of HP one waiting target seeps in a beat at `rateX10`, as stepBlight counts it (no auras). */
const beatX1000 = (world: World, rateX10: number): number => {
  const raw = Math.round((rateX10 * PRESSURE.everyMs * world.gPm * PRESSURE.difficultyPm[world.difficulty] * 100) / 1e9);
  const ramp = PRESSURE.rampFromPct + (world.wave - 1) * PRESSURE.rampPerWavePct;
  return Math.round((raw * world.pace.rootKPm * ramp) / 100_000);
};

const beatTicks = Math.round((PRESSURE.everyMs * 60) / 1000);

/** A grunt standing still 15 m from the dais on Đường Cầu (in the word zone, outside Vòng Nguy): it only waits. */
function waiting(world: World, alongM = 9.5): EnemyState {
  const grunt = foe(world, "moss-grunt", "cau", alongM);
  grunt.speed = 0;
  return grunt;
}

/** A world in wave 1 with the bots' deck, the director off (it would move the clock of the test's foes). */
const quietWorld = (): World => waveWorld(EMPTY_STAGE, { deck: botDeck(), paceDirector: false });

describe("Héo lan (PRESSURE, BALANCE.md §5): words left waiting seep into the Fire Dragon", () => {
  it("seeps nothing while a word is fresh, then the zone rate a beat once it has waited past the grace", () => {
    const world = quietWorld();
    const log = new Log();
    const grunt = waiting(world);
    run(world, 30, log);
    expect(grunt.word).toBeGreaterThanOrEqual(0);
    const hp = world.hero.hp;
    // Within the grace (a word time at the player's raw E × the margin), no Héo.
    run(world, Math.max(1, world.pace.graceTicks - 40), log);
    expect(world.hero.hp).toBe(hp);
    expect(log.of("blight")).toHaveLength(0);
    // Past it: one zone beat every 2 s, a running total of thousandths.
    run(world, 80, log);
    const before = world.hero.hp;
    run(world, 10 * beatTicks, log);
    const lost = before - world.hero.hp;
    const expected = (10 * beatX1000(world, PRESSURE.zoneX10)) / 1000;
    expect(lost).toBeGreaterThanOrEqual(Math.floor(expected) - 1);
    expect(lost).toBeLessThanOrEqual(Math.ceil(expected + beatX1000(world, PRESSURE.zoneX10) / 1000) + 1);
    expect(log.of("blight").length).toBeGreaterThan(5);
  });

  it("counts at most `maxTargets` waiting targets a beat: falling behind costs, it does not snowball", () => {
    const one = quietWorld();
    const many = quietWorld();
    waiting(one);
    for (const along of [8, 9.5, 11, 12.5]) waiting(many, along);
    run(one, 30 + one.pace.graceTicks + 1);
    run(many, 30 + many.pace.graceTicks + 1);
    const [a, b] = [one.hero.hp, many.hero.hp];
    run(one, 10 * beatTicks);
    run(many, 10 * beatTicks);
    const lossOne = a - one.hero.hp;
    const lossMany = b - many.hero.hp;
    expect(lossMany).toBeGreaterThan(lossOne * (PRESSURE.maxTargets - 0.5));
    expect(lossMany).toBeLessThanOrEqual(lossOne * PRESSURE.maxTargets + 2);
  });

  it("counts a swarm cluster once: it shares one word", () => {
    const world = quietWorld();
    const lane = world.lanes.findIndex((runtime) => runtime.id === "cau");
    const ants: EnemyState[] = [];
    for (let k = 0; k < 6; k += 1) {
      const ant = spawnFoe(world, "thorn-ant", lane, world.wave, { cluster: 77, along: mToU(9.5) + k * 600, lateral: 0 })!;
      ant.speed = 0;
      ants.push(ant);
    }
    run(world, 30 + world.pace.graceTicks + 1);
    const hp = world.hero.hp;
    run(world, 10 * beatTicks);
    expect(hp - world.hero.hp).toBeLessThanOrEqual(Math.ceil((10 * beatX1000(world, PRESSURE.zoneX10)) / 1000) + 1);
  });

  it("thickens over the stage: wave n seeps rampFromPct + (n − 1) × rampPerWavePct of the base", () => {
    const world = quietWorld();
    const first = beatX1000(world, PRESSURE.zoneX10);
    world.wave = 10;
    expect(beatX1000(world, PRESSURE.zoneX10) / first).toBeCloseTo((PRESSURE.rampFromPct + 9 * PRESSURE.rampPerWavePct) / PRESSURE.rampFromPct, 1);
  });
});

describe("the player's time margin (BALANCE.md §2 factors 3 and 4)", () => {
  it("reads the chance of a Ẩu word from accuracy and word length", () => {
    expect(sloppyChancePm(35, 1000)).toBe(0);
    expect(sloppyChancePm(35, 950)).toBeGreaterThan(15);
    expect(sloppyChancePm(35, 950)).toBeLessThan(35);
    expect(sloppyChancePm(50, 850)).toBeGreaterThan(200);
    expect(sloppyChancePm(50, 850)).toBeLessThan(250);
  });

  it("stretches T_a and the Héo grace for slips and an uneven hand, never the pace k", () => {
    const clean = paceFor(50, 960, 200);
    const sloppy = paceFor(50, 850, 350);
    expect(sloppy.marginPm).toBeGreaterThan(clean.marginPm + 300);
    expect(sloppy.marginPm).toBe(1000 + Math.round((sloppyChancePm(50, 850) * PACE.sloppyMarginX10) / 10) + Math.round((350 * PACE.unevenMarginPct) / 100));
    // The grace is a word at raw E (C(E), 00 §4.3) × the margin.
    expect(paceFor(35, 950, 250).graceTicks).toBeGreaterThan(Math.round(36_000 / 227));
    expect(paceFor(35, 950, 250).rootKPm).toBe(1000);
    const fast = paceFor(60, 970, 150);
    expect(fast.rootKPm).toBe(Math.round(Math.sqrt(fast.kPm * 1000)));
    expect(paceFor(70, 970, 150).rootKPm).toBe(Math.round(Math.sqrt(1500 * 1000)));
  });

  it("keeps the canon's gate floors at any pace, and the wave waits with a held group (00 D29, G9 at k 1.5)", () => {
    // Two groups on Đường Cầu 1.5 s apart, one on Đường Suối 0.6 s after the second: the plan's gate rules at the reference pace.
    const group = (atMs: number, lane: "cau" | "suoi") => ({ atMs, lane, shape: "single" as const, foe: "moss-grunt" as const, count: 1 });
    const stage = battleStage([[group(0, "cau"), group(1500, "cau"), group(2100, "suoi")]]);
    const starts = (wpm: number, accuracyPm: number, cvPm: number): { lane: string; tick: number }[] => {
      const log = new Log();
      const world = waveWorld(stage, { typistWpm: wpm, accuracyPm, cvPm, paceDirector: false }, log);
      run(world, 400, log);
      const spawns = log.of("spawn");
      expect(spawns).toHaveLength(3);
      // Ticks after the first group left.
      return spawns.map((event) => ({ lane: event.lane, tick: event.tick - spawns[0]!.tick }));
    };
    // k = 1: as planned, 1.5 s (90 ticks) on one gate, then 0.6 s (36 ticks) to the other lane.
    expect(starts(35, 950, 250)).toEqual([{ lane: "cau", tick: 0 }, { lane: "cau", tick: 90 }, { lane: "suoi", tick: 126 }]);
    // k = 1.5: the plan reads 0, 1.0 and 1.4 s, but one gate still waits 1.5 s (02 §5.3) and lanes 0.6 s (01 §1.4).
    // While Đường Cầu holds its second group, the rest of the wave waits too: Đường Suối keeps its place
    // behind it instead of leaving first (unheld it would leave at 1.4 s and push the second grunt to 2.0 s).
    expect(paceFor(70, 970, 150).kPm).toBe(1500);
    expect(starts(70, 970, 150)).toEqual([{ lane: "cau", tick: 0 }, { lane: "cau", tick: 90 }, { lane: "suoi", tick: 126 }]);
    // k = 0.75: every gap, the gate rules too, stretched by 1 / k.
    expect(starts(15, 900, 400)).toEqual([{ lane: "cau", tick: 0 }, { lane: "cau", tick: 120 }, { lane: "suoi", tick: 168 }]);
  });
});

describe("the pace director (BALANCE.md §4.2) in M0", () => {
  it("steers to the difficulty's mode, with the idle target raised by the plan's own idle", () => {
    expect(BAND_MODE).toEqual({ easy: "relax", normal: "balanced", hard: "challenge" });
    for (const mode of ["relax", "balanced", "challenge"] as const) {
      const band = directorBand(mode);
      expect(band.i.max).toBe(BANDS[mode].i.max! + DIRECTOR_IDLE_SLACK);
      expect(band.s).toEqual(BANDS[mode].s);
      expect(band.p).toEqual(BANDS[mode].p);
    }
    expect(waveWorld(EMPTY_STAGE, { difficulty: "hard" }).director.director.band.p).toEqual(BANDS.challenge.p);
  });

  it("keeps D27's proposed bands (Cân bằng I ≤ 20 %, waiting for the owner) apart from the shared ones, the rest as BALANCE.md §3", () => {
    expect(DH_BANDS.balanced.i).toEqual({ max: 200 });
    expect({ ...DH_BANDS.balanced, i: BANDS.balanced.i }).toEqual(BANDS.balanced);
    expect(DH_BANDS.relax).toEqual(BANDS.relax);
    expect(DH_BANDS.challenge).toEqual(BANDS.challenge);
    // The director's own idle target in Cân bằng stays above the game's band.
    expect(directorBand("balanced").i.max).toBeGreaterThan(DH_BANDS.balanced.i.max!);
  });

  it("never steps in wave 1 (light by design)", () => {
    const world = waveWorld(EMPTY_STAGE, { deck: botDeck() });
    const log = new Log();
    // Nothing to type for a minute: idle as can be, yet no step in the warm-up wave.
    run(world, 3600, log);
    expect(world.wave).toBe(1);
    expect(log.of("pace")).toHaveLength(0);
  });
});
