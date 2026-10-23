/**
 * M0 waves: 10 waves on L2-cau, load 0.60 → 1.25 (DESIGN.md §9 M0), G01 in
 * waves 5 and 10, 2–3 peaks and lulls each (02 §5.3), groups by 02 §5.2,
 * lane mix by 02 §5.5 (main lane 60–70 % of ground threat; Đường Cầu leads
 * waves 1–3 and 7–8, Đường Suối waves 4–6 and 9–10).
 * Owner: sim-battle (LANES.md).
 *
 * How the numbers meet (src/sim/waves.ts measures them; tests/sim/battle-waves):
 * - Load (00 §4.4): W_gõ / (22.7 × minutes) within 5 % of `load100`.
 * - Peaks: each foe's W is typed at 22.7 words a minute from its spawn, so
 *   load above 1.0 only comes from overlapping work; the busiest 8 s window
 *   (bot-balance gate) stays under `peakLoad100`. Middle waves cap at 1.15
 *   (00 §4.4). A wolf pack alone reads 1.19 (3 × 1.2 W within 4 s), so packs
 *   come only in waves capped at 1.25 or more: wave 5 (the first general,
 *   capped like a general stage's last wave, 00 §4.5), wave 9 and wave 10
 *   (the final band, under the stage cap 1.40).
 * - Peaks and lulls are group pace (02 §5.3 "nhịp toán"): a peak holds 2–4
 *   light groups (singles, pairs, swarm clusters, wasps) at ≥ 1.5 × the mean
 *   pace; a lull holds at most one group, often one heavy foe (boar, wolf
 *   pack, the general's chain) that keeps the typist busy with one target.
 * - Flyers stay under 15 % of a wave's threat (00 §4.5, C1–3 row), gates send
 *   one group per 1.5 s, lanes start ≥ 0.6 s apart (02 §5.3, 01 §1.4).
 */
import type { FoeId, SpawnGroupDef, WaveDef } from "../types";

type Lane = "cau" | "suoi" | "troi";

const one = (atMs: number, lane: Lane, foe: FoeId): SpawnGroupDef => ({ atMs, lane, shape: "single", foe, count: 1 });
const pair = (atMs: number, lane: Lane, foe: FoeId): SpawnGroupDef => ({ atMs, lane, shape: "pair", foe, count: 2 });
const grunt = (atMs: number, lane: Lane): SpawnGroupDef => one(atMs, lane, "moss-grunt");
const grunts = (atMs: number, lane: Lane): SpawnGroupDef => pair(atMs, lane, "moss-grunt");
const archer = (atMs: number, lane: Lane): SpawnGroupDef => one(atMs, lane, "moss-archer");
const boar = (atMs: number, lane: Lane): SpawnGroupDef => one(atMs, lane, "tusk-boar");
/** A swarm cluster of `count` ants under one word (02 §5.2: 4–10, together, 0.5 m apart). */
const ants = (atMs: number, lane: Lane, count: number): SpawnGroupDef => ({ atMs, lane, shape: "cluster", foe: "thorn-ant", count });
/**
 * A wolf pack (02 §2.2: 3–5) runs in a line, 3 s apart (2 s in the last wave):
 * 3 × 1.2 W at once reads 1.59 in a 6 s window, over the 1.15 cap of middle
 * waves and the 1.40 hard cap (00 §4.4 short peaks are 6–10 s).
 */
const wolves = (atMs: number, lane: Lane, count: number, gapMs = 3000): SpawnGroupDef => ({ atMs, lane, shape: "line", foe: "blight-wolf", count, gapMs });
const wasp = (atMs: number): SpawnGroupDef => one(atMs, "troi", "thorn-wasp");
const peak = (atMs: number, lengthMs: number) => ({ atMs, lengthMs });

interface Plan {
  readonly n: number;
  readonly seconds: number;
  readonly load100: number;
  readonly peak100: number;
  readonly breather?: boolean;
  readonly peaks: readonly { readonly atMs: number; readonly lengthMs: number }[];
  readonly groups: readonly SpawnGroupDef[];
}

const PLANS: readonly Plan[] = [
  {
    // Grunts and one ant cluster; 00 §4.4 sets no peak for wave 1, so it stays at or under 1.0.
    n: 1, seconds: 50, load100: 60, peak100: 100,
    peaks: [peak(2000, 9400), peak(20_200, 9400), peak(37_600, 9400)],
    groups: [
      grunt(2000, "cau"), grunt(6200, "suoi"), grunt(10_400, "cau"),
      grunts(14_900, "suoi"),
      grunt(20_200, "cau"), grunt(24_400, "suoi"), grunt(28_600, "cau"),
      grunt(32_800, "cau"),
      ants(37_600, "cau", 6), grunt(41_800, "suoi"), grunt(46_000, "cau"),
    ],
  },
  {
    // First Ong Gai on Đường Trời; a grunt pair holds each lull.
    n: 2, seconds: 50, load100: 79, peak100: 115,
    peaks: [peak(2000, 7400), peak(17_400, 7400), peak(32_800, 10_000)],
    groups: [
      grunt(2000, "cau"), grunt(5200, "suoi"), grunt(8400, "cau"),
      grunts(12_200, "suoi"),
      wasp(17_400), grunt(20_600, "cau"), grunt(23_800, "cau"),
      grunts(27_600, "cau"),
      grunt(32_800, "suoi"), ants(36_000, "cau", 6), grunt(39_200, "cau"), grunt(42_400, "suoi"), grunt(45_600, "cau"),
    ],
  },
  {
    // First Yêu Rêu Cung: it stops 14 m out and shoots the Dragon while it lives.
    n: 3, seconds: 54, load100: 80, peak100: 115,
    peaks: [peak(2000, 7600), peak(17_600, 7600), peak(33_200, 10_000)],
    groups: [
      grunt(2000, "cau"), archer(5300, "suoi"), grunt(8600, "cau"),
      grunts(12_400, "cau"),
      grunt(17_600, "suoi"), wasp(20_900), grunt(24_200, "cau"),
      grunts(28_000, "suoi"),
      grunt(33_200, "cau"), archer(36_500, "cau"), ants(39_800, "cau", 6), grunt(43_100, "suoi"), grunt(46_400, "cau"), grunt(49_700, "cau"),
    ],
  },
  {
    // Đường Suối leads; first Heo Nanh Đá, alone in a lull.
    n: 4, seconds: 56, load100: 82, peak100: 115,
    peaks: [peak(2000, 7600), peak(19_100, 7600), peak(34_700, 10_000)],
    groups: [
      grunt(2000, "suoi"), archer(5300, "cau"), grunt(8600, "suoi"),
      boar(11_900, "suoi"),
      grunt(19_100, "cau"), wasp(22_400), grunt(25_700, "suoi"),
      grunts(29_500, "suoi"),
      grunt(34_700, "suoi"), archer(38_000, "cau"), ants(41_300, "suoi", 6), grunt(44_600, "cau"), grunt(47_900, "suoi"), grunt(51_200, "suoi"),
    ],
  },
  {
    // First general: G01 walks Đường Suối alone; its 6 W keep the typist busy 16 s.
    n: 5, seconds: 62, load100: 95, peak100: 115,
    peaks: [peak(2000, 6400), peak(25_300, 10_000), peak(46_300, 10_000)],
    groups: [
      grunt(2000, "suoi"), archer(4700, "cau"), ants(7400, "suoi", 6),
      one(10_100, "suoi", "moss-banner"),
      grunt(25_300, "cau"), wasp(28_000), grunt(30_700, "suoi"), grunts(34_500, "cau"),
      boar(39_100, "suoi"),
      grunt(46_300, "suoi"), archer(49_000, "cau"), ants(52_100, "suoi", 6), grunt(54_800, "cau"), grunt(57_500, "suoi"),
    ],
  },
  {
    // Breather after the general (02 §5.1).
    n: 6, seconds: 54, load100: 75, peak100: 115, breather: true,
    peaks: [peak(2000, 8800), peak(20_900, 8800), peak(37_700, 10_000)],
    groups: [
      grunt(2000, "suoi"), grunt(5900, "cau"), grunt(9800, "suoi"),
      boar(13_700, "suoi"),
      grunt(20_900, "cau"), archer(24_800, "suoi"), wasp(28_700),
      grunts(32_600, "suoi"),
      grunt(37_700, "cau"), ants(41_600, "suoi", 6), archer(45_500, "cau"), ants(49_400, "suoi", 6),
    ],
  },
  {
    // Đường Cầu leads again; the first wolf line holds a lull.
    n: 7, seconds: 60, load100: 85, peak100: 115,
    peaks: [peak(2000, 7800), peak(20_800, 7800), peak(38_200, 10_000)],
    groups: [
      grunt(2000, "cau"), archer(5400, "suoi"), grunt(8800, "cau"),
      wolves(12_200, "cau", 3),
      grunt(20_800, "suoi"), archer(24_200, "cau"), wasp(27_600),
      boar(31_000, "cau"),
      grunt(38_200, "cau"), grunt(41_600, "suoi"), ants(45_000, "cau", 6), archer(48_400, "suoi"), grunt(51_800, "suoi"), grunt(55_200, "suoi"),
    ],
  },
  {
    // Two boars hold the lulls; a near-full typist from start to end.
    n: 8, seconds: 60, load100: 85, peak100: 115,
    peaks: [peak(2000, 9100), peak(20_800, 8000), peak(38_500, 10_000)],
    groups: [
      grunts(2000, "cau"), archer(6600, "suoi"), grunt(10_100, "cau"),
      boar(13_600, "cau"),
      grunt(20_800, "suoi"), wasp(24_300), grunt(27_800, "cau"),
      boar(31_300, "suoi"),
      grunt(38_500, "cau"), archer(42_000, "cau"), ants(45_500, "cau", 6), grunt(49_000, "cau"), grunt(52_500, "suoi"), grunt(56_000, "cau"),
    ],
  },
  {
    // Đường Suối leads: a wolf line and a boar.
    n: 9, seconds: 64, load100: 83, peak100: 115,
    peaks: [peak(2000, 8000), peak(21_100, 8000), peak(38_800, 10_000)],
    groups: [
      grunt(2000, "suoi"), archer(5500, "cau"), grunt(9000, "suoi"),
      wolves(12_500, "suoi", 3),
      grunt(21_100, "suoi"), archer(24_600, "cau"), wasp(28_100),
      boar(31_600, "suoi"),
      grunt(38_800, "suoi"), archer(42_300, "cau"), ants(45_800, "suoi", 6), grunt(49_300, "cau"), grunt(52_800, "suoi"), grunt(56_300, "suoi"), grunt(59_800, "cau"),
    ],
  },
  {
    // Last wave: a wolf line 2.2 s apart, G01 in the middle, a boar to close; the stage cap 1.40 (DESIGN.md §9 M0).
    n: 10, seconds: 66, load100: 118, peak100: 140,
    peaks: [peak(2000, 9000), peak(19_700, 6000), peak(39_500, 10_000)],
    groups: [
      grunts(2000, "suoi"), archer(5000, "cau"), ants(8200, "suoi", 6), grunt(10_000, "cau"),
      wolves(12_400, "suoi", 3, 2200),
      grunt(19_700, "cau"), wasp(21_500), archer(23_400, "cau"),
      one(25_900, "suoi", "moss-banner"),
      archer(39_500, "suoi"), grunt(42_700, "cau"), ants(45_300, "suoi", 6), wasp(46_700), grunt(49_100, "cau"), archer(51_000, "cau"), grunts(54_500, "cau"),
      boar(57_500, "suoi"),
    ],
  },
];

export const M0_WAVES: readonly WaveDef[] = PLANS.map((plan) => ({
  n: plan.n,
  durationMs: plan.seconds * 1000,
  load100: plan.load100,
  peakLoad100: plan.peak100,
  peaks: plan.peaks,
  generals: plan.groups.some((group) => group.foe === "moss-banner") ? ["moss-banner"] : [],
  ...(plan.breather ? { breather: true } : {}),
  groups: plan.groups,
}));
