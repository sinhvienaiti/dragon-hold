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
/** A wolf pack (02 §2.2: 3–5) runs in a tight line, 0.4 s apart. */
const wolves = (atMs: number, lane: Lane, count: number): SpawnGroupDef => ({ atMs, lane, shape: "line", foe: "blight-wolf", count, gapMs: 400 });
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
    // Grunts and two ant clusters; 00 §4.4 sets no peak for wave 1, so it stays under 1.0.
    n: 1, seconds: 50, load100: 60, peak100: 100,
    peaks: [peak(8000, 8000), peak(24000, 8000), peak(40000, 9000)],
    groups: [
      grunt(1000, "cau"),
      grunt(8500, "suoi"), ants(11_500, "cau", 6), grunt(14_500, "cau"),
      grunts(20_000, "suoi"),
      grunt(24_500, "cau"), grunt(28_000, "cau"),
      grunts(40_500, "cau"), ants(44_000, "suoi", 7),
    ],
  },
  {
    // First Ong Gai on Đường Trời. Load 0.76 (one more grunt, 49 s): inside 00 §4.4's middle band 0.75–1.00.
    n: 2, seconds: 49, load100: 76, peak100: 115,
    peaks: [peak(9000, 8000), peak(25_000, 8000), peak(41_000, 8000)],
    groups: [
      grunt(1000, "cau"), grunt(4500, "suoi"), grunt(6500, "cau"),
      ants(9500, "cau", 7), grunts(12_500, "suoi"),
      grunt(21_000, "cau"),
      grunts(25_500, "cau"), wasp(28_500),
      grunt(37_000, "cau"),
      ants(41_500, "cau", 8), grunt(44_500, "suoi"), grunt(46_000, "suoi"),
    ],
  },
  {
    // First Yêu Rêu Cung. 54 s: load 0.75, inside the middle band (00 §4.4).
    n: 3, seconds: 54, load100: 75, peak100: 115,
    peaks: [peak(9000, 8000), peak(26_000, 9000), peak(43_000, 10_000)],
    groups: [
      grunt(1000, "cau"), grunt(4500, "suoi"),
      archer(9500, "cau"), ants(12_500, "suoi", 7), grunt(15_500, "cau"),
      grunts(21_000, "suoi"),
      grunts(27_500, "cau"), wasp(30_500), archer(34_500, "suoi"),
      grunt(39_000, "cau"),
      ants(43_500, "cau", 8), grunt(46_500, "cau"), grunt(49_500, "cau"),
    ],
  },
  {
    // Đường Suối leads; first Heo Nanh Đá, alone in a lull.
    n: 4, seconds: 55, load100: 82, peak100: 115,
    peaks: [peak(8000, 8000), peak(24_000, 9000), peak(42_000, 10_000)],
    groups: [
      grunt(1000, "suoi"), grunt(4500, "cau"),
      ants(8500, "suoi", 7), grunts(11_500, "suoi"), archer(15_500, "cau"),
      wasp(19_500),
      grunts(24_500, "cau"), archer(30_500, "suoi"),
      boar(34_000, "suoi"),
      ants(42_500, "suoi", 8), grunts(45_500, "cau"), grunt(49_500, "suoi"),
    ],
  },
  {
    // First general: G01 walks Đường Suối alone after the first wolf pack; its 6 W keep the typist busy 16 s.
    n: 5, seconds: 60, load100: 95, peak100: 125,
    peaks: [peak(7000, 8000), peak(27_500, 9000), peak(45_000, 10_000)],
    groups: [
      grunt(1000, "suoi"), grunt(3500, "cau"),
      ants(7000, "suoi", 7), archer(10_000, "cau"), grunt(13_500, "suoi"),
      wolves(20_000, "suoi", 3),
      grunt(27_600, "cau"), one(31_000, "suoi", "moss-banner"),
      ants(45_500, "cau", 8), wasp(48_500), archer(51_500, "cau"), grunts(54_500, "cau"),
    ],
  },
  {
    // Breather after the general (02 §5.1).
    // 54 s: load 0.75, the middle band's floor (00 §4.4).
    n: 6, seconds: 54, load100: 76, peak100: 115, breather: true,
    peaks: [peak(8000, 8000), peak(25_000, 8000), peak(41_000, 10_000)],
    groups: [
      grunt(1000, "suoi"), grunt(4000, "cau"),
      ants(8500, "suoi", 7), archer(11_500, "suoi"), grunt(14_500, "suoi"),
      boar(20_000, "suoi"),
      grunts(29_000, "cau"), wasp(32_500),
      archer(36_000, "cau"),
      ants(41_500, "cau", 8), grunt(44_500, "suoi"), grunt(47_500, "suoi"),
    ],
  },
  {
    // Đường Cầu leads again.
    n: 7, seconds: 60, load100: 90, peak100: 115,
    peaks: [peak(7000, 9000), peak(24_500, 9000), peak(42_000, 10_000)],
    groups: [
      grunt(1000, "cau"), archer(3800, "suoi"),
      ants(7200, "cau", 7), grunt(10_000, "cau"), wasp(12_800),
      boar(16_500, "cau"),
      grunts(25_500, "suoi"), archer(29_000, "cau"), wasp(33_000),
      grunts(36_500, "cau"),
      ants(42_500, "cau", 8), archer(45_500, "suoi"), grunt(48_800, "cau"), ants(51_800, "cau", 8),
      grunts(54_800, "suoi"),
    ],
  },
  {
    // Two boars hold the lulls; a near-full typist from start to end.
    n: 8, seconds: 60, load100: 97, peak100: 115,
    peaks: [peak(8000, 8000), peak(24_500, 9000), peak(43_000, 10_000)],
    groups: [
      grunts(1000, "cau"), archer(5300, "suoi"),
      ants(8500, "cau", 7), wasp(11_200), grunt(13_900, "cau"),
      boar(16_600, "cau"),
      grunts(25_500, "cau"), archer(29_500, "suoi"), wasp(32_800),
      boar(35_500, "suoi"),
      ants(43_500, "cau", 8), archer(46_300, "suoi"), grunts(50_300, "cau"),
      ants(54_700, "cau", 8),
    ],
  },
  {
    // Final band: Đường Suối leads, a wolf pack and two boars. 64 s: load 1.00, the middle band's top (00 §4.4).
    n: 9, seconds: 64, load100: 100, peak100: 125,
    peaks: [peak(8000, 8000), peak(27_000, 8000), peak(43_000, 10_000)],
    groups: [
      grunts(1000, "suoi"), archer(5500, "cau"),
      ants(8500, "suoi", 7), wasp(11_000), grunt(13_500, "cau"),
      wolves(19_800, "suoi", 3),
      grunt(27_400, "cau"), wasp(29_900), archer(32_400, "suoi"),
      boar(35_400, "suoi"),
      ants(43_200, "cau", 8), grunt(45_700, "cau"), archer(48_600, "suoi"), grunts(52_000, "suoi"),
      boar(56_000, "cau"),
    ],
  },
  {
    // Last wave: G01 again with an ant cluster at its heels, a wolf pack, a boar; stage cap 1.40.
    // Load 1.24: the last wave's band is 1.05–1.25 (00 §4.4), so the lull keeps only the archer and the boar.
    n: 10, seconds: 65, load100: 125, peak100: 140,
    peaks: [peak(6000, 8000), peak(23_000, 8000), peak(52_000, 10_000)],
    groups: [
      grunts(1000, "suoi"), archer(1600, "cau"),
      ants(6400, "suoi", 8), wasp(9100), grunt(9700, "cau"), archer(11_300, "suoi"),
      wolves(17_000, "suoi", 3),
      grunt(23_500, "cau"), wasp(25_400), { atMs: 28_400, lane: "suoi", shape: "escort", foe: "moss-banner", count: 1, escort: { foe: "thorn-ant", count: 1 } },
      archer(43_900, "cau"), boar(45_400, "cau"),
      ants(52_000, "cau", 8), wasp(53_400), archer(55_600, "suoi"), grunts(59_000, "cau"), ants(61_700, "suoi", 9),
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
