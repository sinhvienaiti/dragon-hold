import { describe, expect, it } from "vitest";
import { BASE_LATENCY_MS, capacity, expectedPresses, meanLength, type HandsSpec } from "../../scripts/balance/hands";
import { calibrate } from "../../scripts/balance/calibrate";
import { BOT_WORDS } from "../../scripts/balance/deck";
import { kEFor } from "../../src/sim/world";

const hands = (wpm: number, accuracy: number): HandsSpec => ({ wpm, accuracy, backspace: 0.1, latencyMs: BASE_LATENCY_MS });

/** The bots' typing power (DESIGN.md §5.2, 00 §4.3). */
describe("bot hands", () => {
  it("gives the design's C(E): 17.0 / 22.7 / 30.6 words a minute", () => {
    expect(capacity(25)).toBeCloseTo(17.0, 0);
    expect(capacity(35)).toBeCloseTo(22.7, 1);
    expect(capacity(60)).toBeCloseTo(30.6, 0);
    expect(meanLength(35)).toBe(4.5);
    expect(meanLength(60)).toBe(5.5);
    expect(capacity(0)).toBe(0);
  });

  it("agrees with the sim's k_E", () => {
    for (const wpm of [25, 30, 35, 60]) expect(Math.abs(kEFor(wpm) - Math.min(1000, Math.max(750, (capacity(wpm) * 1000) / 22.7)))).toBeLessThanOrEqual(3);
  });

  it("counts presses: retries and Backspaces on top of the letters", () => {
    expect(expectedPresses(5, 1, 0.1)).toBe(5);
    expect(expectedPresses(5, 0.95, 0)).toBeCloseTo(5 / 0.95, 6);
    expect(expectedPresses(5, 0.95, 0.1)).toBeGreaterThan(5 / 0.95);
  });

  it.each([
    [25, 0.95],
    [35, 0.95],
    [60, 0.97],
  ])("types %i WPM at C(E) of the words it meets, through the kit router", (wpm, accuracy) => {
    const run = calibrate(hands(wpm, accuracy), { minutes: 10, seed: 7 });
    expect(run.words).toBeGreaterThan(100);
    // Net speed: the formula's time per word, slips and Backspaces included (±4 %).
    expect(run.wordsPerMin / run.formulaPerMin).toBeGreaterThan(0.96);
    expect(run.wordsPerMin / run.formulaPerMin).toBeLessThan(1.04);
    expect(run.slipPct).toBeGreaterThan((1 - accuracy) * 100 - 1.5);
    expect(run.slipPct).toBeLessThan((1 - accuracy) * 100 + 1.5);
  });

  it("is deterministic for a seed and differs between seeds", () => {
    const a = calibrate(hands(35, 0.95), { minutes: 3, seed: 11 });
    const b = calibrate(hands(35, 0.95), { minutes: 3, seed: 11 });
    const c = calibrate(hands(35, 0.95), { minutes: 3, seed: 12 });
    expect(a).toEqual(b);
    expect(c.keys === a.keys && c.words === a.words && c.slipPct === a.slipPct).toBe(false);
  });

  it("uses a deck of 100 words with 01 §6.1's group mix", () => {
    const count = (group: string) => BOT_WORDS.filter((word) => word.group === group).length;
    expect(BOT_WORDS).toHaveLength(100);
    expect([count("new"), count("due"), count("learning"), count("known")]).toEqual([15, 35, 30, 20]);
    expect(new Set(BOT_WORDS.map((word) => word.text)).size).toBe(100);
    for (const word of BOT_WORDS) expect(word.text).toMatch(/^[a-z]{3,10}$/);
    expect(BOT_WORDS.some((word) => "qxzj".includes(word.text[0]!))).toBe(false);
  });
});
