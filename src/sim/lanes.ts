/**
 * Lanes compiled to integer geometry: polylines in u (1 m = 60 000 u), the
 * distance from the gate at each point, and along-lane features. A foe's
 * position is `along` (u from its gate) plus a signed `lateral` offset.
 * Owner: architect for M0a setup, sim-battle afterwards (LANES.md).
 */
import type { MapDef } from "../content/types";
import { isqrt, mToU, msToTicks } from "./fixed";

export interface LaneSpan {
  readonly from: number;
  readonly to: number;
}

export interface BridgeSpan extends LaneSpan {
  /** Half the deck width, u: foes squeeze onto it (the choke point). */
  readonly halfWidth: number;
}

export interface FordSpan extends LaneSpan {
  readonly slowPct: number;
  readonly wetTicks: number;
}

export interface LaneRuntime {
  /** Index in StageDef.lanes order (ground lanes, then sky lanes). */
  readonly index: number;
  readonly id: string;
  readonly sky: boolean;
  /** Points in u, gate first. */
  readonly xs: readonly number[];
  readonly zs: readonly number[];
  /** Distance from the gate at each point, u. */
  readonly cum: readonly number[];
  readonly length: number;
  /** Flight height of a sky lane, u (0 on the ground). */
  readonly altitude: number;
  /** Half the dirt path width, u (0 for sky lanes). */
  readonly halfWidth: number;
  readonly bridges: readonly BridgeSpan[];
  readonly fords: readonly FordSpan[];
}

/** The stage's lanes in `ids` order; throws on an id the map lacks. */
export function compileLanes(map: MapDef, ids: readonly string[]): LaneRuntime[] {
  return ids.map((id, index) => {
    const ground = map.lanes.find((lane) => lane.id === id);
    const sky = map.sky.find((lane) => lane.id === id);
    const def = ground ?? sky;
    if (!def) throw new Error("lanes: map " + map.id + " has no lane " + id);
    const xs = def.points.map(([x]) => mToU(x));
    const zs = def.points.map(([, z]) => mToU(z));
    const cum = [0];
    for (let k = 1; k < xs.length; k += 1) {
      const dx = xs[k]! - xs[k - 1]!;
      const dz = zs[k]! - zs[k - 1]!;
      cum.push(cum[k - 1]! + isqrt(dx * dx + dz * dz));
    }
    const features = ground?.features ?? [];
    return {
      index,
      id,
      sky: !ground,
      xs,
      zs,
      cum,
      length: cum[cum.length - 1]!,
      altitude: sky ? mToU(sky.altitudeM) : 0,
      halfWidth: ground ? mToU(ground.widthM / 2) : 0,
      bridges: features.flatMap((f) => (f.kind === "bridge" ? [{ from: mToU(f.fromM), to: mToU(f.toM), halfWidth: mToU(f.widthM / 2) }] : [])),
      fords: features.flatMap((f) =>
        f.kind === "ford" ? [{ from: mToU(f.fromM), to: mToU(f.toM), slowPct: f.slowPct, wetTicks: msToTicks(f.wetMs) }] : [],
      ),
    };
  });
}

/** A reusable point; pointAt writes into it to avoid allocating per foe per tick. */
export interface LanePoint {
  x: number;
  z: number;
}

/** The lane point `along` u from the gate (clamped to the lane), shifted `lateral` u to the right of travel. */
export function pointAt(lane: LaneRuntime, along: number, lateral: number, out: LanePoint): LanePoint {
  const last = lane.xs.length - 1;
  const d = along <= 0 ? 0 : along >= lane.length ? lane.length : along;
  let k = 1;
  while (k < last && lane.cum[k]! < d) k += 1;
  const x0 = lane.xs[k - 1]!;
  const z0 = lane.zs[k - 1]!;
  const dx = lane.xs[k]! - x0;
  const dz = lane.zs[k]! - z0;
  const seg = lane.cum[k]! - lane.cum[k - 1]! || 1;
  const t = d - lane.cum[k - 1]!;
  // Right of travel in x-east, z-south axes is (−dz, dx).
  out.x = x0 + Math.round((dx * t - dz * lateral) / seg);
  out.z = z0 + Math.round((dz * t + dx * lateral) / seg);
  return out;
}

/** The span of `spans` that contains `along`, or null. */
export function spanAt<T extends LaneSpan>(spans: readonly T[], along: number): T | null {
  for (const span of spans) if (along >= span.from && along <= span.to) return span;
  return null;
}
