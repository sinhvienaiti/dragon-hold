import { describe, expect, it } from "vitest";
import { BASE_LATENCY_MS, capacity, expectedPresses, meanLength, type HandsSpec } from "../../scripts/balance/hands";
import { calibrate } from "../../scripts/balance/calibrate";
import { BOT_WORDS } from "../../scripts/balance/deck";
import { PACE } from "../../src/content/rules";
import { capacityX10, effectiveWpmX1000, paceFor } from "../../src/sim/world";
import { DRAGON_C_REF, effectiveE, paceK } from "../../src/kit/balance";

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

  it("agrees with the kit's E_eff and two-way k (BALANCE.md §4.1, §9.1)", () => {
    const ref = capacity(effectiveE({ e: 35, a: 0.95, cv: 0.25 }), 0.86, 4.5);
    expect(ref).toBeCloseTo(19.6, 1);
    expect(DRAGON_C_REF).toBeGreaterThan(ref); // the kit's constant is the old 22.7 reference: the game passes its own C_ref
    for (const [wpm, a, cv] of [[15, 0.88, 0.4], [25, 0.92, 0.35], [25, 0.99, 0.2], [35, 0.95, 0.25], [50, 0.96, 0.2], [50, 0.85, 0.35], [70, 0.97, 0.15]] as const) {
      const eEff = effectiveE({ e: wpm, a, cv });
      // Integer maths: within 0.002 WPM of the kit's float E_eff.
      expect(Math.abs(effectiveWpmX1000(wpm, a * 1000, cv * 1000) - eEff * 1000)).toBeLessThanOrEqual(2);
      expect(Math.abs(capacityX10(wpm, effectiveWpmX1000(wpm, a * 1000, cv * 1000)) - capacity(eEff, 0.86, meanLength(wpm)) * 10)).toBeLessThanOrEqual(1);
      // The game's own k range (00 D29: cap 1.50, BALANCE.md §4.1's shared one is 1.30).
      const k = paceK(eEff, { len: meanLength(wpm), d: 0.86, ref }, { min: PACE.kMinPm / 1000, max: PACE.kMaxPm / 1000 });
      expect(Math.abs(paceFor(wpm, a * 1000, cv * 1000).kPm - k * 1000)).toBeLessThanOrEqual(6);
    }
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
