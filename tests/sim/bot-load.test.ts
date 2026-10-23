import { describe, expect, it } from "vitest";
import { GATE_WINDOW_S, LoadTrack, REF_WPM_WORDS, foeW, isClusterFoe, peakLoad, planArrivals, planLoad, planW } from "../../scripts/balance/load";
import { planRows } from "../../scripts/balance/report";
import { STAGE_M0 } from "../../src/content/data/stages";
import { LOAD } from "../../src/content/rules";
import type { WaveDef } from "../../src/content/types";
import * as waves from "../../src/sim/waves";

const wave = (groups: WaveDef["groups"], seconds = 60): WaveDef => ({ n: 1, durationMs: seconds * 1000, load100: 60, peakLoad100: 70, peaks: [], generals: [], groups });

/** Typing load (00 §4.4) as the bots measure it. */
describe("bot load", () => {
  it("reads W from the foe data", () => {
    expect(foeW("moss-grunt")).toBe(1);
    expect(foeW("tusk-boar")).toBe(3);
    expect(foeW("moss-banner")).toBe(6);
    expect(foeW("moss-grunt", true)).toBeCloseTo(1.6, 6);
    expect(isClusterFoe("thorn-ant")).toBe(true);
    expect(isClusterFoe("thorn-wasp")).toBe(false);
  });

  it("lays a plan out by 02 §5.2: a cluster is one W, escorts around their leader", () => {
    const plan = wave([
      { atMs: 0, lane: "cau", shape: "line", foe: "moss-grunt", count: 3 },
      { atMs: 10_000, lane: "suoi", shape: "cluster", foe: "thorn-ant", count: 8 },
      { atMs: 20_000, lane: "cau", shape: "escort", foe: "moss-banner", count: 1, escort: { foe: "moss-grunt", count: 2 } },
    ]);
    const arrivals = planArrivals(plan);
    expect(arrivals.map((a) => a.s)).toEqual([0, 0.6, 1.2, 10, 20, 21, 22]);
    expect(planW(plan)).toBe(3 + 1 + 1 + 6 + 1);
    expect(planLoad(plan)).toBeCloseTo(12 / REF_WPM_WORDS, 6);
  });

  it("never reads one foe above load 1.0, and an even stream at its own load", () => {
    expect(peakLoad([{ s: 0, w: 6 }], 8)).toBeCloseTo(1, 6);
    expect(peakLoad([{ s: 0, w: 0.5 }], 8)).toBeLessThan(0.3);
    // One 1 W foe every 60 / (22.7 × 1.2) s: load 1.2.
    const gap = 60 / (REF_WPM_WORDS * 1.2);
    const stream = Array.from({ length: 200 }, (_, k) => ({ s: k * gap, w: 1 }));
    expect(peakLoad(stream, GATE_WINDOW_S)).toBeGreaterThan(1.15);
    expect(peakLoad(stream, GATE_WINDOW_S)).toBeLessThan(1.25);
    // A slow typist's stretched waves read the same against its own capacity, bursts too.
    const bursts = Array.from({ length: 30 }, (_, k) => ({ s: Math.floor(k / 3) * 10 + (k % 3) * 0.4, w: 1.2 }));
    const slow = bursts.map((a) => ({ s: a.s / 0.75, w: a.w }));
    expect(peakLoad(bursts, GATE_WINDOW_S)).toBeGreaterThan(1);
    expect(peakLoad(slow, GATE_WINDOW_S, 0.75)).toBeCloseTo(peakLoad(bursts, GATE_WINDOW_S), 2);
  });

  it("counts a cluster once however many of it spawn", () => {
    const track = new LoadTrack();
    for (let k = 0; k < 8; k += 1) track.spawn(60, 1, "thorn-ant", false, 4);
    track.spawn(120, 1, "moss-grunt", false, -1);
    track.spawn(180, 2, "thorn-ant", false, 5);
    expect(track.ofWave(1).reduce((sum, a) => sum + a.w, 0)).toBe(2);
    expect(track.ofWave(2)).toEqual([{ s: 3, w: 1, wave: 2 }]);
  });

  it("puts the M0 plan's targets inside 00 §4.4 where the bands are fixed", () => {
    const first = STAGE_M0.waves[0]!;
    const last = STAGE_M0.waves[STAGE_M0.waves.length - 1]!;
    expect(first.load100).toBeGreaterThanOrEqual(LOAD.wave1[0]);
    expect(first.load100).toBeLessThanOrEqual(LOAD.wave1[1]);
    expect(last.load100).toBeGreaterThanOrEqual(LOAD.final[0]);
    expect(last.load100).toBeLessThanOrEqual(LOAD.final[1]);
    for (const plan of STAGE_M0.waves) expect(plan.peakLoad100).toBeLessThanOrEqual(LOAD.hardCap);
  });

  it("agrees with sim-battle's own plan analysis (src/sim/waves.ts)", ({ skip }) => {
    const api = waves as unknown as { waveLoad100?: (wave: WaveDef) => number; peakLoad100?: (wave: WaveDef, windowMs?: number) => number };
    if (typeof api.waveLoad100 !== "function" || typeof api.peakLoad100 !== "function") return skip();
    for (const plan of STAGE_M0.waves) {
      if (plan.groups.length === 0) continue;
      expect(Math.abs(planLoad(plan) * 100 - api.waveLoad100(plan)), "wave " + plan.n + " load").toBeLessThanOrEqual(1);
      expect(Math.abs(peakLoad(planArrivals(plan), GATE_WINDOW_S) * 100 - api.peakLoad100(plan, GATE_WINDOW_S * 1000)), "wave " + plan.n + " peak").toBeLessThanOrEqual(1.5);
    }
  });

  const authored = STAGE_M0.waves.every((plan) => plan.groups.length > 0);
  it.skipIf(!authored)("meets each M0 wave's load target and peak cap with its groups (G9 on the plan)", () => {
    for (const row of planRows()) {
      expect(Math.abs(row.load - row.target), "wave " + row.wave + " load").toBeLessThanOrEqual(row.target * 0.1);
      expect(row.peak, "wave " + row.wave + " peak").toBeLessThanOrEqual(Math.min(row.peakCap, LOAD.hardCap / 100) + 0.015);
    }
  });
});
