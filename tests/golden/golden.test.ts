import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GOLDEN_CASES, GOLDEN_PATH, readGolden, replayGoldenCase, runGoldenCase } from "../../scripts/balance/golden-spec";

/**
 * M0 golden gate (DESIGN.md §9, 05 §10): the same seed and command log give
 * the same hashWorld. After a deliberate rule or bot change, rewrite with
 * `tsx scripts/balance/golden-update.ts` and say why in the changelog.
 */
describe("golden M0", () => {
  it("has a golden file for every case", () => {
    expect(existsSync(GOLDEN_PATH), "run tsx scripts/balance/golden-update.ts").toBe(true);
    expect(readGolden().cases.map((item) => item.name)).toEqual(GOLDEN_CASES.map((item) => item.name));
  });

  it("covers Khó with the director off and Esc (round 2 gate: only Thường, director on, no release)", () => {
    const cases = readGolden().cases;
    const hard = cases.find((item) => item.difficulty === "hard" && item.director === false);
    expect(hard).toBeDefined();
    // The Ẩu bot lets go after a slip (a wrong key on the locked word), so the replay walks the Esc rule (01 §3.3).
    expect(hard!.log.filter(([, command]) => command.type === "release").length).toBeGreaterThanOrEqual(3);
  });

  const file = existsSync(GOLDEN_PATH) ? readGolden() : { stage: "", deck: [], cases: [] };
  for (const stored of file.cases) {
    it("replays " + stored.name + " to its stored hashes", () => {
      const replayed = replayGoldenCase(stored, file.deck);
      expect(replayed.hashes).toEqual(stored.hashes);
      expect(replayed.final).toBe(stored.final);
    });

    it("runs " + stored.name + " to the stored command log", () => {
      const spec = GOLDEN_CASES.find((item) => item.name === stored.name)!;
      const now = runGoldenCase(spec, file.deck);
      expect(now.log.length).toBe(stored.log.length);
      expect(now.log).toEqual(stored.log);
      expect(now.hashes).toEqual(stored.hashes);
    });
  }
});
