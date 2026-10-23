import { describe, expect, it } from "vitest";
import { BASE_LATENCY_MS, type HandsSpec } from "../../scripts/balance/hands";
import { typeAgainstWords } from "../../scripts/balance/words-bench";

const hands = (wpm: number, accuracy: number): HandsSpec => ({ wpm, accuracy, backspace: 0.1, latencyMs: BASE_LATENCY_MS });

/** The typist on the game's own words store: lengths by E, first letters, next words soft-locked (01 §3, DESIGN.md §5.2). */
describe("bot typist on the words store", () => {
  it.for([
    [25, 0.95],
    [35, 0.95],
    [60, 0.97],
  ] as const)("keeps C(E) at %i WPM on the words the store deals", ([wpm, accuracy], { skip }) => {
    const bench = typeAgainstWords(hands(wpm, accuracy), { seconds: 180, seed: 5 });
    if (bench.assigned === 0) return skip();
    expect(bench.words).toBeGreaterThan(20);
    expect(bench.wordsPerMin / bench.formulaPerMin).toBeGreaterThan(0.9);
    expect(bench.wordsPerMin / bench.formulaPerMin).toBeLessThan(1.1);
    expect(bench.wrongPct).toBeLessThan((1 - accuracy) * 100 + 3);
    // Mostly clean words: Chớp and Hoàn hảo outnumber the rest.
    const clean = (bench.grades.flash ?? 0) + (bench.grades.perfect ?? 0);
    expect(clean / bench.words).toBeGreaterThan(0.6);
  });

  it("never sticks on a word the world locked under it (a slip before a switch)", ({ skip }) => {
    for (const seed of [3, 4, 5, 6, 7, 8]) {
      const bench = typeAgainstWords(hands(60, 0.97), { seconds: 90, seed });
      if (bench.assigned === 0) return skip();
      expect(bench.wrongPct, "seed " + seed).toBeLessThan(8);
      expect(bench.wordsPerMin / bench.formulaPerMin, "seed " + seed).toBeGreaterThan(0.85);
    }
  });
});
