/**
 * What a floating card must not cover on the battle field (round 2): the
 * lanes (ground and sky, where foes walk) and the build slots, in CSS px.
 * placement-ui owns the projector and the map, so it publishes the zones for
 * its overlay root each frame; the wave card and Thẻ Ôn read them and pick
 * the first of their candidate spots that covers no lane and no slot (and no
 * HUD panel), keeping their spot while it stays clear. Pure geometry here.
 * Owner: ui (LANES.md).
 */
import type { Projector, ScreenPoint } from "../app/contracts";
import type { MapDef, SlotKind } from "../content/types";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A lane stretch on screen with its half-width in px. */
export interface LaneSegment {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  half: number;
}

export interface ScreenZones {
  readonly lanes: LaneSegment[];
  readonly slots: Rect[];
  /** Bumped on every update (readers can tell a stale set). */
  stamp: number;
}

/** Slot ghosts' ground size (metres, view/paths.ts SLOT_SIZE) plus a margin round them. */
const SLOT_SIZE_M: Readonly<Record<SlotKind, number>> = { trap: 2.0, block: 1.8, house: 4.6 };
const SLOT_MARGIN_M = 0.6;
/** A sky lane's half-width (a flyer's body and its tag), metres. */
const SKY_HALF_M = 1.6;

const registry = new WeakMap<HTMLElement, ScreenZones>();

/** The zones published for `root` (null before placement-ui's first frame, or on a page without it). */
export function zonesFor(root: HTMLElement): ScreenZones | null {
  return registry.get(root) ?? null;
}

/** Recomputes the zones of `root` from the map and the projector (placement-ui, once a frame). */
export function publishZones(root: HTMLElement, map: MapDef, project: Projector): ScreenZones {
  let zones = registry.get(root);
  if (zones === undefined) {
    zones = { lanes: [], slots: [], stamp: 0 };
    registry.set(root, zones);
  }
  zones.lanes.length = 0;
  zones.slots.length = 0;
  const a: ScreenPoint = { x: 0, y: 0, visible: false };
  const b: ScreenPoint = { x: 0, y: 0, visible: false };
  const c: ScreenPoint = { x: 0, y: 0, visible: false };
  const addPath = (points: readonly (readonly [number, number])[], y: number, halfM: number): void => {
    for (let k = 1; k < points.length; k += 1) {
      const [ax, az] = points[k - 1]!;
      const [bx, bz] = points[k]!;
      project(ax, y, az, a);
      project(bx, y, bz, b);
      // A point behind the camera projects nowhere useful; inside or just off screen is fine.
      if (a.x < -1e3 || b.x < -1e3) continue;
      const mx = (ax + bx) / 2;
      const mz = (az + bz) / 2;
      const len = Math.hypot(bx - ax, bz - az) || 1;
      project(mx + ((bz - az) / len) * halfM, y, mz - ((bx - ax) / len) * halfM, c);
      const mid: ScreenPoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, visible: true };
      const half = Math.max(6, Math.hypot(c.x - mid.x, c.y - mid.y));
      zones!.lanes.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y, half });
    }
  };
  for (const lane of map.lanes) addPath(lane.points, 0.3, lane.widthM / 2 + 0.4);
  for (const sky of map.sky) addPath(sky.points, sky.altitudeM, SKY_HALF_M);
  for (const slot of map.slots) {
    const [x, z] = slot.pos;
    project(x, 0.2, z, a);
    if (a.x < -1e3) continue;
    const r = SLOT_SIZE_M[slot.kind] / 2 + SLOT_MARGIN_M;
    project(x + r, 0.2, z, b);
    project(x, 0.2, z + r, c);
    const rx = Math.max(8, Math.abs(b.x - a.x));
    const ry = Math.max(8, Math.abs(c.y - a.y));
    zones.slots.push({ x: a.x - rx, y: a.y - ry, w: rx * 2, h: ry * 2 });
  }
  zones.stamp += 1;
  return zones;
}

/** Overlap area of two rects (px²). */
export function overlapArea(p: Rect, q: Rect): number {
  const ox = Math.max(0, Math.min(p.x + p.w, q.x + q.w) - Math.max(p.x, q.x));
  const oy = Math.max(0, Math.min(p.y + p.h, q.y + q.h) - Math.max(p.y, q.y));
  return ox * oy;
}

/** Length (px) of segment a→b inside `rect` grown by `pad` on every side (Liang–Barsky clip). */
export function segmentInside(rect: Rect, s: LaneSegment, pad = s.half): number {
  const x0 = rect.x - pad;
  const y0 = rect.y - pad;
  const x1 = rect.x + rect.w + pad;
  const y1 = rect.y + rect.h + pad;
  const dx = s.bx - s.ax;
  const dy = s.by - s.ay;
  let t0 = 0;
  let t1 = 1;
  const clip = (p: number, q: number): boolean => {
    if (p === 0) return q >= 0;
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
    return true;
  };
  if (!clip(-dx, s.ax - x0) || !clip(dx, x1 - s.ax) || !clip(-dy, s.ay - y0) || !clip(dy, y1 - s.ay)) return 0;
  return Math.max(0, t1 - t0) * Math.hypot(dx, dy);
}

/** What covering things at `rect` costs: lane px inside it, slot area, panel area, any part off the view. */
export function spotCost(rect: Rect, zones: ScreenZones | null, keepouts: readonly Rect[], view: { w: number; h: number }): { lanes: number; slots: number; panels: number; total: number } {
  let lanes = 0;
  let slots = 0;
  let panels = 0;
  if (zones !== null) {
    for (const segment of zones.lanes) lanes += segmentInside(rect, segment);
    for (const slot of zones.slots) slots += overlapArea(rect, slot);
  }
  for (const keep of keepouts) panels += overlapArea(rect, keep);
  const off = rect.w * rect.h - overlapArea(rect, { x: 0, y: 0, w: view.w, h: view.h });
  // Slots weigh most (a card over a build slot hides where to build), then lanes, then panels.
  const total = slots * 4 + lanes * 40 + panels + off * 8;
  return { lanes, slots, panels, total };
}

/**
 * Index of the spot to use among `spots`: `current` while it stays clear,
 * else the first clear one in order, else the cheapest.
 */
export function chooseSpot(spots: readonly Rect[], zones: ScreenZones | null, keepouts: readonly Rect[], view: { w: number; h: number }, current = -1): number {
  const costs = spots.map((spot) => spotCost(spot, zones, keepouts, view).total);
  if (current >= 0 && current < spots.length && costs[current]! <= 0.5) return current;
  let best = 0;
  for (let k = 0; k < costs.length; k += 1) {
    if (costs[k]! <= 0.5) return k;
    if (costs[k]! < costs[best]!) best = k;
  }
  return best;
}

/** Visible panels under `root` the card keeps off (HUD, strip, learning frame, other cards), except `self` and nodes matching `skip`. */
export function keepoutRects(root: HTMLElement, self: HTMLElement, skip = ""): Rect[] {
  const out: Rect[] = [];
  for (const node of root.querySelectorAll<HTMLElement>("[data-keepout], [data-dh-avoid], .kit-learning-frame")) {
    if (node === self || self.contains(node) || node.contains(self) || node.closest("[hidden]") !== null) continue;
    if (skip !== "" && node.matches(skip)) continue;
    const r = node.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) out.push({ x: r.left, y: r.top, w: r.width, h: r.height });
  }
  return out;
}
