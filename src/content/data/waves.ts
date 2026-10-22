/**
 * M0 waves: 10 waves on L2-cau, load 0.60 → 1.25 (DESIGN.md §9 M0), G01 in
 * waves 5 and 10, 2–3 peaks and lulls each (02 §5.3), groups by 02 §5.2,
 * lane mix by 02 §5.5 (main lane 60–70 % of threat, sides swap once).
 * Owner: sim-battle (LANES.md). The architect set timing and load targets;
 * the groups are TODO (sim-battle authors them, bot-balance checks G9, G13).
 */
import type { WaveDef } from "../types";

/** n, duration s, load × 100, short-peak cap × 100, generals. Wave 6 is the breather after the first general (02 §5.1). */
const PLAN: readonly (readonly [n: number, seconds: number, load100: number, peak100: number, general: boolean, breather: boolean])[] = [
  [1, 50, 60, 70, false, false],
  [2, 52, 68, 85, false, false],
  [3, 55, 75, 100, false, false],
  [4, 55, 82, 110, false, false],
  [5, 60, 95, 115, true, false],
  [6, 55, 76, 100, false, true],
  [7, 60, 90, 115, false, false],
  [8, 60, 97, 115, false, false],
  [9, 62, 105, 125, false, false],
  [10, 65, 125, 140, true, false],
];

export const M0_WAVES: readonly WaveDef[] = PLAN.map(([n, seconds, load100, peakLoad100, general, breather]) => ({
  n,
  durationMs: seconds * 1000,
  load100,
  peakLoad100,
  // TODO(sim-battle): 2–3 peaks of 6–10 s with lulls ≥ 8 s (02 §5.3).
  peaks: [],
  generals: general ? ["moss-banner"] : [],
  ...(breather ? { breather: true } : {}),
  // TODO(sim-battle): spawn groups (02 §5.2) meeting load100 (00 §4.4); none yet, so the stub stage spawns nothing.
  groups: [],
}));
