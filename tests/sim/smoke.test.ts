import { describe, expect, it } from "vitest";
import { STAGE_M0 } from "../../src/content/data/stages";
import type { SimCommand } from "../../src/content/types";
import { createWorld, hashWorld, kEFor, runLog, step } from "../../src/sim/world";

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
    expect(world.liveCap).toBe(30);
    expect(world.gPm).toBe(1020);
    expect(world.hero.hp).toBe(1020);
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

  it("derives k_E from the typist's speed (00 §4.4)", () => {
    expect(kEFor(35)).toBe(1000);
    expect(kEFor(60)).toBe(1000);
    expect(kEFor(25)).toBe(750);
    expect(kEFor(30)).toBeGreaterThan(750);
    expect(kEFor(30)).toBeLessThan(1000);
  });
});
