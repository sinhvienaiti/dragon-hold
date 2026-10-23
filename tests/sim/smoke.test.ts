import { describe, expect, it } from "vitest";
import { STAGE_M0 } from "../../src/content/data/stages";
import { FIRE_DRAGON, PACE } from "../../src/content/rules";
import type { SimCommand } from "../../src/content/types";
import { createWorld, hashWorld, paceFor, runLog, step } from "../../src/sim/world";

/** The M0a sim contract: a world steps at 60 Hz and hashes the same for the same inputs. */
describe("sim smoke", () => {
  const run = (seed: number, ticks: number) => {
    const world = createWorld(STAGE_M0, seed);
    const hashes: number[] = [];
    for (let tick = 0; tick < ticks; tick += 1) {
      step(world);
      if (tick % 60 === 59) hashes.push(hashWorld(world));
    }
    return { world, hashes };
  };

  it("steps 600 ticks deterministically", () => {
    const a = run(STAGE_M0.seed, 600);
    const b = run(STAGE_M0.seed, 600);
    expect(a.world.tick).toBe(600);
    expect(a.hashes).toHaveLength(10);
    expect(a.hashes).toEqual(b.hashes);
    expect(hashWorld(a.world)).toBe(hashWorld(b.world));
  });

  it("hashes another seed differently", () => {
    expect(hashWorld(run(1, 60).world)).not.toBe(hashWorld(run(2, 60).world));
  });

  it("starts in prep with the stage's numbers", () => {
    const world = createWorld(STAGE_M0);
    expect(world.phase).toBe("prep");
    expect(world.lanes.map((lane) => lane.id)).toEqual(["cau", "suoi", "troi"]);
    expect(world.liveCap).toBe(20);
    expect(world.gPm).toBe(1020);
    expect(world.hero.hp).toBe(Math.round((FIRE_DRAGON.hp * 1020) / 1000));
    expect(world.events.drain()).toEqual([]);
  });

  it("replays a command log like stepping by hand", () => {
    const log: { tick: number; command: SimCommand }[] = [
      { tick: 0, command: { type: "start" } },
      { tick: 30, command: { type: "key", letter: 4 } },
      { tick: 31, command: { type: "backspace" } },
    ];
    const replayed = createWorld(STAGE_M0);
    runLog(replayed, log, 120);
    const manual = createWorld(STAGE_M0);
    for (let tick = 0; tick < 120; tick += 1) step(manual, log.filter((entry) => entry.tick === tick).map((entry) => entry.command));
    expect(hashWorld(replayed)).toBe(hashWorld(manual));
  });

  it("derives a two-way pace k from E_eff (BALANCE.md §4.1, §9.1)", () => {
    expect(paceFor(35).kPm).toBe(1000);
    expect(paceFor(60, 970, 150).kPm).toBe(1300);
    expect(paceFor(25, 920, 350).kPm).toBe(750);
    expect(paceFor(45).kPm).toBeGreaterThan(1000);
    expect(paceFor(45).kPm).toBeLessThan(1300);
    expect(paceFor(30).kPm).toBeGreaterThan(750);
    expect(paceFor(30).kPm).toBeLessThan(1000);
    // T_a: PACE.approachMs at k = 1 × the slip and unevenness margin, shorter for a faster player, never under two of their word times.
    const ref = paceFor(35);
    expect(ref.approachTicks).toBe(Math.max(Math.round((PACE.approachMs * 60 * ref.marginPm) / 1_000_000), 2 * ref.wordTicks));
    // The margin (BALANCE.md §2 factors 3, 4): a sloppy, uneven hand gets more time than a clean, even one.
    expect(paceFor(50, 850, 350).marginPm).toBeGreaterThan(1400);
    expect(paceFor(25, 990, 200).marginPm).toBeLessThan(1150);
    expect(paceFor(35, 950, 250).marginPm).toBeGreaterThan(paceFor(70, 970, 150).marginPm);
    expect(paceFor(60, 970, 150).approachTicks).toBeLessThan(ref.approachTicks);
    for (const wpm of [15, 25, 35, 70]) expect(paceFor(wpm).approachTicks).toBeGreaterThanOrEqual(2 * paceFor(wpm).wordTicks);
  });
});
