/**
 * Typing load (00 §4.4, DESIGN.md §5.3):
 *   W_gõ(wave) = Σ W of foes (a swarm cluster counts 1, a word-shield layer 1)
 *   L          = W_gõ / (22.7 × minutes)
 * from the wave plan and from spawn times in a run. Peaks: each foe's W
 * arrives as work spread over the time the reference typist needs for it
 * (W × 60 / 22.7 s), so one foe alone never reads above 1.0; the peak is the
 * most work in any window of 6, 8 or 10 s (00 §4.4 short peaks are 6–10 s:
 * G9 reads the largest of the three). A run at pace k is measured against
 * its own capacity (22.7 × k) over windows stretched by 1 / k like its waves,
 * so a slow or fast typist's waves read the same as the plan.
 * Script side: floats are fine here.
 * Owner: bot-balance (LANES.md).
 */
import { ENEMIES } from "../../src/content/data/enemies";
import { GENERALS } from "../../src/content/data/generals";
import { ELITE_PM, LOAD_W100, TEMPO } from "../../src/content/rules";
import type { EnemyDef, FoeId, GeneralDef, SpawnShape, WaveDef } from "../../src/content/types";

/** Words a minute of the 35 WPM reference typist (00 §4.3). */
export const REF_WPM_WORDS = TEMPO.refWordsPerMinX10 / 10;
/** Peak windows in seconds; G9 and the plan read the largest of them. */
export const PEAK_WINDOWS_S = [6, 8, 10] as const;

export function foeDef(foe: FoeId): EnemyDef | GeneralDef {
  const def = (ENEMIES as Record<string, EnemyDef | undefined>)[foe] ?? (GENERALS as Record<string, GeneralDef | undefined>)[foe];
  if (!def) throw new Error("load: unknown foe " + foe);
  return def;
}

/** True for foes whose cluster shares one word (02 §1.4). */
export const isClusterFoe = (foe: FoeId): boolean => foeDef(foe).word.cluster === true;

/** W of one foe (not for cluster members): w100 / 100, elites × 1.6 (00 §4.6). */
export function foeW(foe: FoeId, elite = false): number {
  const w = foeDef(foe).w100 / 100;
  return elite ? (w * ELITE_PM) / 1000 : w;
}

/** Default gaps inside a group (02 §5.2). */
export const SHAPE_GAP_MS: Readonly<Record<SpawnShape, number>> = { single: 0, pair: 800, line: 600, cluster: 0, escort: 1000, pincer: 0, flight: 500 };

/** One arrival of typing work: seconds from the wave start (or the run start) and W_gõ. */
export interface Arrival {
  readonly s: number;
  readonly w: number;
}

/** The plan's arrivals of one wave (02 §5.2 gaps; a cluster group is one W_gõ; escorts half ahead, half behind, 1 s apart). */
export function planArrivals(wave: WaveDef): Arrival[] {
  const out: Arrival[] = [];
  for (const group of wave.groups) {
    const at = group.atMs / 1000;
    if (isClusterFoe(group.foe)) {
      out.push({ s: at, w: LOAD_W100.cluster / 100 });
      continue;
    }
    const gap = (group.gapMs ?? SHAPE_GAP_MS[group.shape]) / 1000;
    const w = foeW(group.foe, group.elite === true);
    const escort = group.escort;
    const ahead = escort ? Math.floor(escort.count / 2) : 0;
    // An escort of swarm foes is a cluster each: one W_gõ.
    const ew = escort ? (isClusterFoe(escort.foe) ? LOAD_W100.cluster / 100 : foeW(escort.foe)) : 0;
    if (escort) for (let k = 0; k < ahead; k += 1) out.push({ s: at + k, w: ew });
    for (let k = 0; k < group.count; k += 1) out.push({ s: at + ahead + k * gap, w });
    if (escort) for (let k = 0; k < escort.count - ahead; k += 1) out.push({ s: at + ahead + (group.count - 1) * gap + 1 + k, w: ew });
  }
  return out.sort((a, b) => a.s - b.s);
}

/** W_gõ of a wave's plan. */
export const planW = (wave: WaveDef): number => planArrivals(wave).reduce((sum, arrival) => sum + arrival.w, 0);

/** Average load of a wave's plan (00 §4.4). */
export const planLoad = (wave: WaveDef): number => planW(wave) / (REF_WPM_WORDS * (wave.durationMs / 60_000));

const BIN_S = 0.05;

/**
 * The most work in any `windowS` window (reference seconds), as a load: each
 * arrival spreads its W at the capacity rate 22.7 × kE words a minute from
 * its time on, and the window stretches to windowS / kE like the waves do.
 */
export function peakLoad(arrivals: readonly Arrival[], windowS: number, kE = 1): number {
  if (arrivals.length === 0) return 0;
  const rate = (REF_WPM_WORDS * kE) / 60;
  const span = windowS / kE;
  const start = Math.min(...arrivals.map((arrival) => arrival.s));
  const end = Math.max(...arrivals.map((arrival) => arrival.s + arrival.w / rate)) + span;
  const bins = new Float64Array(Math.ceil((end - start) / BIN_S) + 2);
  for (const arrival of arrivals) {
    // Work per bin while this arrival is being typed: rate × bin, for w / rate seconds (the last bin takes the rest).
    let left = arrival.w;
    let bin = Math.floor((arrival.s - start) / BIN_S);
    const perBin = rate * BIN_S;
    while (left > 1e-12 && bin < bins.length) {
      const take = left < perBin ? left : perBin;
      bins[bin] = bins[bin]! + take;
      left -= take;
      bin += 1;
    }
  }
  const width = Math.max(1, Math.round(span / BIN_S));
  let sum = 0;
  let best = 0;
  for (let bin = 0; bin < bins.length; bin += 1) {
    sum += bins[bin]!;
    if (bin >= width) sum -= bins[bin - width]!;
    if (sum > best) best = sum;
  }
  return best / (rate * span);
}

/** Arrivals measured in a run: spawn events folded into W_gõ, a cluster once per id. */
export class LoadTrack {
  readonly arrivals: (Arrival & { readonly wave: number })[] = [];
  private readonly clusters = new Set<number>();

  /** One `spawn` event at `tick` (60 Hz) in `wave`. */
  spawn(tick: number, wave: number, foe: FoeId, elite: boolean, cluster: number): void {
    let w: number;
    if (isClusterFoe(foe)) {
      if (cluster >= 0) {
        if (this.clusters.has(cluster)) return;
        this.clusters.add(cluster);
        w = LOAD_W100.cluster / 100;
      } else w = foeW(foe, elite);
    } else w = foeW(foe, elite);
    this.arrivals.push({ s: tick / 60, w, wave });
  }

  ofWave(wave: number): Arrival[] {
    return this.arrivals.filter((arrival) => arrival.wave === wave);
  }
}
