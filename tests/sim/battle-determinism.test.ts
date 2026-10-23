import { describe, expect, it } from "vitest";
import { STAGE_M0 } from "../../src/content/data/stages";
import { hashWorld, type World } from "../../src/sim/world";
import { playStage, warden } from "./battle-helpers";

/** Keys hashWorld skips (static input or output); everything else must be integers (05 §9.4). */
const SKIP = new Set(["stage", "map", "lanes", "events", "deck", "wall"]);

function floats(value: unknown, path: string, out: string[]): void {
  if (out.length > 5 || value === null || value === undefined) return;
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) out.push(path + " = " + value);
    return;
  }
  if (typeof value !== "object") return;
  if (ArrayBuffer.isView(value)) return;
  if (value instanceof Map) {
    for (const [key, item] of value) floats(item, path + "[" + String(key) + "]", out);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => floats(item, path + "[" + index + "]", out));
    return;
  }
  for (const [key, item] of Object.entries(value)) if (!SKIP.has(key)) floats(item, path + "." + key, out);
}

/** Hashes every 10 s of a whole M0 run with the ideal typist and two wardens. */
function hashes(seed: number): { world: World; trail: number[] } {
  const trail: number[] = [];
  let placed = false;
  const world = playStage(STAGE_M0, 200, seed, {}, (w) => {
    if (!placed && w.phase === "warning") {
      placed = true;
      warden(w, "cau-b2");
      warden(w, "suoi-b2");
    }
    if (w.tick % 600 === 0) trail.push(hashWorld(w));
  });
  return { world, trail };
}

describe("battle determinism", () => {
  it("replays a whole M0 stage to the same hash every 10 s for the same seed", () => {
    const a = hashes(STAGE_M0.seed);
    const b = hashes(STAGE_M0.seed);
    expect(a.trail.length).toBeGreaterThan(50);
    expect(a.trail).toEqual(b.trail);
    expect(hashWorld(a.world)).toBe(hashWorld(b.world));
    expect(a.world.phase).toBe(b.world.phase);
  });

  it("differs for another seed (spawn jitter comes from the seeded spawn stream only)", () => {
    const a = hashes(1);
    const b = hashes(2);
    expect(a.trail).not.toEqual(b.trail);
  });

  it("keeps every number of the battle state an integer through a whole run", () => {
    const { world } = hashes(7);
    const out: string[] = [];
    const battle = { hero: world.hero, guide: world.guide, enemies: world.enemies, waves: world.waves, spawn: world.spawn, auras: world.auras, combat: world.combat, boss: world.boss, stats: world.stats };
    floats(battle, "world", out);
    expect(out).toEqual([]);
    expect(Number.isSafeInteger(world.tick) && Number.isSafeInteger(world.phaseEndsAt)).toBe(true);
  });

  it("runs a whole stage at well over 200 × real time headless (00 §8)", () => {
    const start = performance.now();
    const world = playStage(STAGE_M0, 159);
    const ms = performance.now() - start;
    const realMs = (world.tick * 1000) / 60;
    expect(realMs / ms).toBeGreaterThan(200);
  });
});
