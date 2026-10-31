/**
 * Road profile (docs/games/PATH_QUALITY.md, owner 29/10: no "finger smear" roads): the width rule shared
 * by the road ribbon (view/roads.ts) and its edge dressing (view/layout.ts), so stones and tufts sit on the
 * verge the ribbon draws. A lane's road is a core (trodden earth now, Codex 155 flagstone later), a worn
 * verge, then grass; the core runs 3–8 cm under the verge crest. Width varies ±15 % along the road (seeded
 * noise), and widens at bends, at the dais junction and on the bridge approaches. View only: the sim lanes
 * keep their own width; the core always covers the walking band.
 * Owner: map pilot.
 */
import type { Polyline } from "./terrain";
import { valueNoise } from "./terrain";

export const ROAD = {
  /** Core half width per lane half width before the variation (never under the walking band, see minShare). */
  coreShare: 1.12,
  minShare: 0.95,
  /** ±share along the road, noise wave in metres. */
  vary: 0.15,
  waveM: 10,
  /** Bends: + curvature (1/m) × gain, at most bendMax. */
  bendGain: 2.4,
  bendMax: 0.2,
  /** Junction at the dais plaza: + junctionGain inside junctionR metres of the dais centre. */
  junctionR: 12,
  junctionGain: 0.18,
  /** Bridge approaches: + bridgeGain within bridgeM metres of a span end. */
  bridgeM: 6,
  bridgeGain: 0.2,
  /** Verge width (m) and its wobble. */
  vergeM: 1.2,
  vergeVary: 0.3,
  /** The verge crest stands this much over the core (PATH_QUALITY 2.4: 3–8 cm). */
  coreDropM: 0.05,
  /** Texture metres per repeat along and across (one density on straights and bends). */
  tileM: 3.4,
  /** Ribbons stop this far out from the dais centre (the plaza paints the junction). */
  daisStopM: 6.2,
  seed: 0x70ad,
} as const;

export interface RoadSample {
  /** Arc length from the gate end of the sim polyline (metres; negative on the trail past the gate). */
  readonly s: number;
  readonly laneIndex: number;
  /** Lane half width (sim). */
  readonly half: number;
  /** |curvature| (1/m) of the centreline here. */
  readonly curvature: number;
  /** Distance to the dais centre (m). */
  readonly rDais: number;
  /** Distance along the lane to the nearest bridge span end (m), Infinity when none. */
  readonly bridgeGap: number;
}

/** Core half width (m) at one point of a lane's road. */
export function roadCoreHalf(at: RoadSample): number {
  const n = (valueNoise(at.s / ROAD.waveM, at.laneIndex * 3.7 + 0.5, ROAD.seed) - 0.5) * 2;
  const bend = Math.min(ROAD.bendMax, at.curvature * ROAD.bendGain);
  const junction = ROAD.junctionGain * Math.max(0, Math.min(1, (ROAD.junctionR - at.rDais) / 4));
  const bridge = ROAD.bridgeGain * Math.max(0, Math.min(1, 1 - at.bridgeGap / ROAD.bridgeM));
  const share = ROAD.coreShare * (1 + ROAD.vary * n) * (1 + bend + junction + bridge);
  return at.half * Math.max(ROAD.minShare, share);
}

/** Verge width (m) at one point, on one side (−1 left, +1 right of the gate → dais direction). */
export function roadVerge(at: RoadSample, side: number): number {
  const n = valueNoise(at.s / 6.5, at.laneIndex * 5.3 + side * 1.9 + 9.1, ROAD.seed + 1);
  return ROAD.vergeM * (1 + ROAD.vergeVary * (n - 0.5) * 2);
}

/** Curvature (1/m) of a polyline at arc length s, from the tangent turn over ±1.5 m. */
export function curvatureAt(line: Polyline, s: number): number {
  const a = line.pointAt(Math.max(0, s - 1.5));
  const ax = a.dx;
  const az = a.dz;
  const b = line.pointAt(Math.min(line.length, s + 1.5));
  const turn = Math.atan2(ax * b.dz - az * b.dx, ax * b.dx + az * b.dz);
  return Math.abs(turn) / 3;
}

/** Distance from arc length s to the nearest span end, Infinity when the lane has none. */
export function bridgeGapAt(spans: readonly { readonly fromM: number; readonly toM: number }[], s: number): number {
  let best = Infinity;
  for (const span of spans) best = Math.min(best, Math.abs(s - span.fromM), Math.abs(s - span.toM));
  return best;
}
