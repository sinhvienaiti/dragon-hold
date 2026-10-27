/**
 * Map spike (parent docs/tools/MAP_FACTORY.md §6.2; branch map-spike, never
 * merged): the decorative layout of a map as separable, parameterised rules
 * in the Map Factory layer order: L1 fields (lane, sky, river, slot
 * distances) → L2 cliff mark → L3 pond → L4 footpaths → L6 groves, lone trees,
 * rim clutter, rock lines → L7 paint stamps (dirt, junctions, scuffs).
 * The height field reads the pond and the cliff, the ground paint reads the
 * stamps, the scatter reads the trees and rocks, the water reads the pond.
 * Deterministic per map seed (hash2 per rule, cell and index). View-only
 * floats; the core redoes each rule in integer cm (spike-l2-cau.md lists the
 * exact rules). Gameplay geometry is only read. Hidden slots are never drawn
 * (05 §2): no footpath comes near a slot, and groves keep clear of slots by
 * more than their own radius, so no clearing has a slot's shape.
 * Owner: map spike.
 */
import type { MapDef, Vec2 } from "../content/types";
import { catmullRom, extendLine, hash2, Polyline, valueNoise, type Nearest } from "./terrain";

// ── Rules and their parameters (metres, degrees: bearing 0 = north (−z), 90 = east) ──

export const LAYOUT_RULES = {
  /** L3: one decorative pond, sited automatically in the most open meadow. */
  pond: {
    radiusM: 4.6,
    /** Shore wobble: ± share of the radius at 8 control directions, closed Catmull-Rom between. */
    wobble: 0.24,
    /** Centre distance from the dais centre. */
    ringM: [14, 23] as const,
    /** Clearances from the shore (centre distance minus radius). */
    clearLaneM: 7,
    clearSlotM: 7,
    clearSkyM: 6,
    clearRiverM: 9,
    gridM: 1,
    depthM: 0.85,
    /** Water this far under the dry ground at the centre. */
    levelBelowM: 0.3,
  },
  /** L2: one cliff mark in the outer skirt that frames one side (authored line, profile by rule). */
  cliff: {
    line: [
      [-19, -40],
      [-28, -33],
      [-35.5, -22],
      [-39, -10],
      [-40, 0],
    ] as readonly Vec2[],
    heightM: 9,
    /** Share of the height reached at the first ledge (two-step stylised face). */
    ledge: 0.72,
    /** Signed offset (m, + away from the dais): the face rises from faceFromM to faceToM, the top runs to plateauM, then falls over backM. */
    faceFromM: -0.8,
    ledgeAtM: 0.5,
    faceToM: 2.3,
    plateauM: 14,
    backM: 16,
    /** Height fades over this length at both ends of the line. */
    capM: 7,
    /** The face edge wanders this far (noise wave raggedWaveM along the line). */
    raggedM: 1.3,
    raggedWaveM: 6,
  },
  /** L4: decorative footpaths, narrower and paler than any lane. */
  footpaths: {
    widthM: 1.05,
    /** At a plaza end the path starts at this share of its width and reaches full width plazaTaperM out, so no footpath reads as a lane spoke at the dais. */
    plazaTaper: 0.4,
    plazaTaperM: 5,
    /** Width at an `edge` end (into the forest) as a share. */
    edgeTaper: 0.6,
    stepM: 3,
    wobbleM: 2.2,
    wobbleWaveM: 14,
    clearSlotM: 4.6,
    clearLaneM: 2.2,
    clearWaterM: 1.6,
    /** A path end (except plaza and junction ends) keeps this far from every slot. */
    endClearSlotM: 7,
    iterations: 10,
    /** Edge anchors sit this far past the play radius. */
    edgeOutM: 6,
    /**
     * Each route bows off its chord: a quadratic Bézier whose control point is
     * the chord midpoint moved along the chord normal by bend × length (signed:
     * + to the left of from→to). Small wobble rides on top.
     */
    routes: [
      { id: "fp-pond", from: { dais: "pond" }, to: { pond: true }, bend: 0.1 },
      { id: "fp-west", from: { path: "fp-pond", at: 0.45 }, to: { river: 236 }, bend: -0.14 },
      { id: "fp-south", from: { pond: 218 }, to: { edge: 196 }, bend: 0.16 },
      { id: "fp-east", from: { pond: 84 }, to: { edge: 116 }, bend: -0.18 },
      { id: "fp-north", from: { edge: 324 }, to: { edge: 283 }, bend: 0.3 },
    ] as readonly FootpathRoute[],
  },
  /** L6: groves (cluster centres, then trees inside), replacing the even scatter inside the play area. */
  groves: {
    cellM: 6,
    countMax: 12,
    radiusM: [3.8, 7.5] as const,
    minRadiusM: 2.6,
    ringM: [11, 30] as const,
    clearLaneM: 3.4,
    clearSlotM: 4.8,
    clearSkyM: 3,
    clearRiverM: 0.4,
    clearPathM: 2.2,
    clearPondM: 3,
    /** Gap between two grove discs. */
    gapM: 3.5,
    /** Trees per m² of grove disc. */
    density: 0.11,
    minTrees: 3,
    /** Trunk gap, metres. */
    treeGapM: 2.1,
    /** Tallest tree at a distance r from the dais: capA + capB · (r − 10), never above capMax. */
    capA: 3.6,
    capB: 0.26,
    capMax: 8,
    /** Violet crowns only in a grove whose disc keeps this far from lane edges and the sky lane (05 §2.2). */
    violetLaneM: 9,
    rimBushPerM: 0.22,
    clutterChance: 0.6,
  },
  /** L6: lone trees in the open meadow, each on its own dirt disc. */
  solitary: {
    count: 8,
    cellM: 5,
    ringM: [12, 29] as const,
    clearLaneM: 4.2,
    clearSlotM: 5.2,
    clearSkyM: 4,
    clearRiverM: 2,
    clearPathM: 2.4,
    clearPondM: 3,
    clearGroveM: 2.5,
    gapM: 7,
  },
  /** L6: rock lines along the water and the lane edges. */
  rocks: {
    river: { stepM: 1.5, runChance: 0.42, runM: [3, 7] as const, offsetM: [0.1, 0.9] as const, clearLaneM: 2.6, reachM: 6, k: [0.5, 1.1] as const },
    lane: { stepM: 2.0, runChance: 0.34, runM: [2, 5] as const, offsetM: [0.7, 1.3] as const, clearSlotM: 4, clearDaisM: 9, k: [0.35, 0.6] as const },
    pond: { count: 10, k: [0.6, 1.35] as const },
    cliffFoot: { stepM: 2.0, chance: 0.8, k: [1.0, 2.6] as const },
    /** Big boulders half sunk in the face (offset s from the face foot) and slabs along the top lip: the face reads as piled rock. */
    cliffFace: { stepM: 2.4, chance: 0.85, s: [-0.2, 1.0] as const, k: [2.6, 4.4] as const },
    cliffLip: { stepM: 3.1, chance: 0.7, s: [2.4, 3.6] as const, k: [1.8, 3.0] as const },
  },
  /** L7 paint stamps (potential discs: 1 at the centre, 0.5 at radius, 0 at radius + falloff). */
  paint: {
    plazaM: 6.5,
    plazaFalloffM: 1.6,
    canopyDirt: 0.78,
    canopyFalloffM: 1.3,
    groveDirt: 0.62,
    loneDirtM: 2.1,
    junctionM: 1.9,
    crossingM: 3.1,
    scuffStepM: [3.5, 6.5] as const,
    scuffM: [0.7, 1.5] as const,
    scuffOffsetM: [0.0, 0.45] as const,
    flowerPatchWaveM: 11,
  },
} as const;

export type FootpathAnchor =
  | { readonly dais: number | "pond" }
  | { readonly edge: number }
  | { readonly pond: true | number }
  | { readonly river: number }
  | { readonly path: string; readonly at: number };

export interface FootpathRoute {
  readonly id: string;
  readonly from: FootpathAnchor;
  readonly to: FootpathAnchor;
  /** Bow of the route as a share of its chord length (+ left of from→to). */
  readonly bend: number;
}

// ── Output ─────────────────────────────────────────────────────────────────

/** A kit item: proto is the m0b manifest key; k the model scale (its largest side ≈ k metres). */
export interface LayoutItem {
  readonly id: string;
  readonly proto: string;
  readonly x: number;
  readonly z: number;
  readonly k: number;
  readonly yaw: number;
  readonly tint: readonly [number, number, number];
  /** Crown radius on the ground (trees), footprint radius (rest), metres. */
  readonly radius: number;
}

export interface Pond {
  readonly x: number;
  readonly z: number;
  readonly radiusM: number;
  /** Closed shore polyline (first point repeated last). */
  readonly shore: Polyline;
  readonly level: number;
  readonly depthM: number;
  /** Signed distance to the shore: negative in the water. */
  edge(x: number, z: number): number;
}

export interface Cliff {
  readonly line: Polyline;
  /** Extra height at (x, z), metres. */
  lift(x: number, z: number): number;
  /** Signed offset from the face foot (+ away from the dais) and the end fade 0–1. */
  offset(x: number, z: number): { s: number; cap: number; along: number };
}

export interface Footpath {
  readonly id: string;
  readonly line: Polyline;
  /** Half width at each sample of `line`. */
  readonly halves: Float64Array;
}

export interface Grove {
  readonly id: string;
  readonly x: number;
  readonly z: number;
  readonly radius: number;
  readonly violet: boolean;
}

/** A soft disc in the paint (dirt): potential 1 at the centre, 0.5 at r, 0 at r + falloff. */
export interface PaintDisc {
  readonly x: number;
  readonly z: number;
  readonly r: number;
  readonly falloff: number;
  readonly strength: number;
}

export interface MapLayout {
  readonly fields: LayoutFields;
  readonly pond: Pond | null;
  readonly cliff: Cliff | null;
  readonly footpaths: readonly Footpath[];
  readonly groves: readonly Grove[];
  /** Grove and lone trees (inside the play area). */
  readonly trees: readonly LayoutItem[];
  readonly bushes: readonly LayoutItem[];
  readonly rocks: readonly LayoutItem[];
  readonly dirt: readonly PaintDisc[];
  /** Footpath distance (0 on the centre line) minus half width; large far away. */
  pathGap(x: number, z: number): number;
  /** Counts for the report. */
  readonly stats: Record<string, number>;
}

// ── L1 fields ─────────────────────────────────────────────────────────────

const RIVER_RUNOUT_M = 150;
const TRAIL_M = 16;

/** Distances to the map's gameplay geometry (metres), from MapDef alone. */
export class LayoutFields {
  readonly map: MapDef;
  readonly cx: number;
  readonly cz: number;
  readonly play: number;
  readonly lanes: { readonly line: Polyline; readonly trail: Polyline; readonly half: number; readonly spans: readonly { fromM: number; toM: number; kind: string }[] }[];
  readonly sky: readonly Polyline[];
  readonly river: { readonly line: Polyline; readonly widths: Float64Array } | null;
  private readonly hit: Nearest = { dist: 0, along: 0, x: 0, z: 0 };

  constructor(map: MapDef) {
    this.map = map;
    [this.cx, this.cz] = map.dais.center;
    this.play = map.terrain.playRadiusM;
    this.lanes = map.lanes.map((lane) => {
      const [gx, gz] = lane.points[0]!;
      const [hx, hz] = lane.points[1]!;
      const length = Math.hypot(gx - hx, gz - hz) || 1;
      return {
        line: new Polyline(lane.points),
        trail: new Polyline([[gx + ((gx - hx) / length) * TRAIL_M, gz + ((gz - hz) / length) * TRAIL_M], [gx, gz]]),
        half: lane.widthM / 2,
        spans: lane.features.map((feature) => ({ fromM: feature.fromM, toM: feature.toM, kind: feature.kind })),
      };
    });
    this.sky = map.sky.map((lane) => new Polyline(lane.points));
    if (map.river) {
      const points = extendLine(map.river.points, RIVER_RUNOUT_M, RIVER_RUNOUT_M);
      const widths = [map.river.widthsM[0]!, ...map.river.widthsM, map.river.widthsM[map.river.widthsM.length - 1]!];
      const sampled = catmullRom(points, 1.5, widths);
      this.river = { line: new Polyline(sampled.points), widths: Float64Array.from(sampled.values) };
    } else this.river = null;
  }

  /** Distance from the nearest lane edge (lanes and their trails past the gates). */
  laneGap(x: number, z: number): number {
    let best = Infinity;
    for (const lane of this.lanes) {
      best = Math.min(best, lane.line.nearest(x, z, this.hit).dist - lane.half);
      best = Math.min(best, lane.trail.nearest(x, z, this.hit).dist - lane.half * 0.8);
    }
    return best;
  }

  skyDist(x: number, z: number): number {
    let best = Infinity;
    for (const line of this.sky) best = Math.min(best, line.nearest(x, z, this.hit).dist);
    return best;
  }

  riverWidthAt(along: number): number {
    if (!this.river) return 0;
    const { line, widths } = this.river;
    let k = 0;
    while (k < line.count - 2 && line.cum[k + 1]! < along) k += 1;
    const t = Math.min(1, Math.max(0, (along - line.cum[k]!) / Math.max(1e-9, line.cum[k + 1]! - line.cum[k]!)));
    return widths[k]! + (widths[k + 1]! - widths[k]!) * t;
  }

  /** Signed distance to the river's water edge (negative in the water). */
  riverEdge(x: number, z: number): number {
    if (!this.river) return 99;
    this.river.line.nearest(x, z, this.hit);
    return this.hit.dist - this.riverWidthAt(this.hit.along) / 2;
  }

  slotDist(x: number, z: number): number {
    let best = Infinity;
    for (const slot of this.map.slots) best = Math.min(best, Math.hypot(x - slot.pos[0], z - slot.pos[1]));
    return best;
  }

  r(x: number, z: number): number {
    return Math.hypot(x - this.cx, z - this.cz);
  }

  /** Unit direction of a bearing (0 = north, −z; 90 = east, +x). */
  static dir(bearingDeg: number): [number, number] {
    const a = (bearingDeg * Math.PI) / 180;
    return [Math.sin(a), -Math.cos(a)];
  }
}

// ── Small helpers ─────────────────────────────────────────────────────────

const smooth = (edge0: number, edge1: number, value: number): number => {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
/** Rule-scoped hash in [0, 1): one stream per rule id. */
const h = (rule: number, a: number, b: number, seed: number): number => hash2(a * 7919 + rule * 104729, b, seed);

const RULE = { pond: 1, cliff: 2, path: 3, grove: 4, groveTree: 5, solitary: 6, rockRiver: 7, rockLane: 8, rockPond: 9, rockCliff: 10, scuff: 11, rim: 12 } as const;

/** Tree tints (multiplied into the texture): base, sun green, cool blue-green, deep, fresh. Never yellow (Héo). */
const TINTS: readonly (readonly [number, number, number])[] = [
  [1, 1, 1],
  [1.05, 1.06, 0.9],
  [0.86, 0.97, 1.08],
  [0.84, 0.89, 0.88],
  [0.97, 1.09, 0.93],
];

// ── L3 pond ────────────────────────────────────────────────────────────────

function sitePond(f: LayoutFields, seed: number): Pond | null {
  const P = LAYOUT_RULES.pond;
  let best: { x: number; z: number; score: number } | null = null;
  const reach = P.ringM[1];
  for (let z = -reach; z <= reach; z += P.gridM) {
    for (let x = -reach; x <= reach; x += P.gridM) {
      const r = f.r(x + f.cx, z + f.cz);
      if (r < P.ringM[0] || r > P.ringM[1]) continue;
      const px = x + f.cx;
      const pz = z + f.cz;
      const lane = f.laneGap(px, pz) - P.radiusM - P.clearLaneM;
      const slot = f.slotDist(px, pz) - P.radiusM - P.clearSlotM;
      const sky = f.skyDist(px, pz) - P.radiusM - P.clearSkyM;
      const river = f.riverEdge(px, pz) - P.radiusM - P.clearRiverM;
      const score = Math.min(lane, slot, sky, river);
      if (score < 0) continue;
      // Most open spot; ties broken by the hash so the choice is total.
      const key = score + h(RULE.pond, Math.round(px), Math.round(pz), seed) * 1e-3;
      if (!best || key > best.score) best = { x: px, z: pz, score: key };
    }
  }
  if (!best) return null;
  // Shore: 8 control radii at the 8 compass directions, a closed Catmull-Rom between.
  const controls: Vec2[] = [];
  for (let k = 0; k < 8; k += 1) {
    const [dx, dz] = LayoutFields.dir(k * 45);
    const radius = P.radiusM * (1 + P.wobble * (2 * h(RULE.pond, k, 1, seed) - 1));
    controls.push([best.x + dx * radius, best.z + dz * radius]);
  }
  const closed: Vec2[] = [controls[7]!, ...controls, controls[0]!, controls[1]!];
  const sampled = catmullRom(closed, 0.5).points;
  // Keep the part between controls[0] and the repeat of controls[0].
  const start = sampled.findIndex((p) => Math.hypot(p[0] - controls[0]![0], p[1] - controls[0]![1]) < 1e-6);
  const loop = sampled.slice(start);
  const endIndex = loop.findIndex((p, index) => index > 0 && Math.hypot(p[0] - controls[0]![0], p[1] - controls[0]![1]) < 1e-6);
  const ring = endIndex > 0 ? loop.slice(0, endIndex + 1) : [...loop, loop[0]!];
  const shore = new Polyline(ring);
  const hit: Nearest = { dist: 0, along: 0, x: 0, z: 0 };
  const inside = (x: number, z: number): boolean => {
    let wind = false;
    for (let k = 0, j = shore.count - 1; k < shore.count; j = k++) {
      const xi = shore.xs[k]!;
      const zi = shore.zs[k]!;
      const xj = shore.xs[j]!;
      const zj = shore.zs[j]!;
      if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) wind = !wind;
    }
    return wind;
  };
  return {
    x: best.x,
    z: best.z,
    radiusM: P.radiusM,
    shore,
    level: 0,
    depthM: P.depthM,
    edge(x: number, z: number): number {
      // Far away the centre distance minus the largest radius is a safe lower bound.
      const far = Math.hypot(x - best!.x, z - best!.z) - P.radiusM * (1 + P.wobble);
      if (far > 12) return far;
      const d = shore.nearest(x, z, hit).dist;
      return inside(x, z) ? -d : d;
    },
  };
}

// ── L2 cliff mark ─────────────────────────────────────────────────────────

function buildCliff(f: LayoutFields, seed: number): Cliff {
  const C = LAYOUT_RULES.cliff;
  const line = new Polyline(catmullRom(C.line, 1).points);
  const hit: Nearest = { dist: 0, along: 0, x: 0, z: 0 };
  const offset = (x: number, z: number): { s: number; cap: number; along: number } => {
    line.nearest(x, z, hit);
    // + away from the dais: the side of the line the dais is not on.
    const ox = hit.x - f.cx;
    const oz = hit.z - f.cz;
    const length = Math.hypot(ox, oz) || 1;
    const side = ((x - hit.x) * ox + (z - hit.z) * oz) / length >= 0 ? 1 : -1;
    const ragged = (valueNoise(hit.along / C.raggedWaveM, 0.5, seed + RULE.cliff) - 0.5) * 2 * C.raggedM;
    const cap = smooth(0, C.capM, hit.along) * smooth(line.length, line.length - C.capM, hit.along);
    return { s: side * hit.dist - ragged, cap, along: hit.along };
  };
  return {
    line,
    offset,
    lift(x: number, z: number): number {
      if (x < line.minX - 40 || x > line.maxX + 40 || z < line.minZ - 40 || z > line.maxZ + 40) return 0;
      const { s, cap } = offset(x, z);
      if (cap <= 0 || s < C.faceFromM - 0.5 || s > C.plateauM + C.backM) return 0;
      const rise = C.ledge * smooth(C.faceFromM, C.ledgeAtM, s) + (1 - C.ledge) * smooth(C.ledgeAtM + 0.6, C.faceToM, s);
      const fall = 1 - smooth(C.plateauM, C.plateauM + C.backM, s);
      return C.heightM * rise * fall * cap;
    },
  };
}

// ── L4 footpaths ──────────────────────────────────────────────────────────

function routeFootpaths(f: LayoutFields, pond: Pond | null, seed: number): Footpath[] {
  const F = LAYOUT_RULES.footpaths;
  const paths: Footpath[] = [];
  const plazaR = f.map.dais.radiusM + 2.4;

  const resolve = (anchor: FootpathAnchor, toward: Vec2 | null): { p: Vec2; kind: "plaza" | "edge" | "pond" | "river" | "junction" } | null => {
    if ("dais" in anchor) {
      let dx: number;
      let dz: number;
      if (anchor.dais === "pond") {
        if (!pond) return null;
        const length = Math.hypot(pond.x - f.cx, pond.z - f.cz) || 1;
        dx = (pond.x - f.cx) / length;
        dz = (pond.z - f.cz) / length;
      } else [dx, dz] = LayoutFields.dir(anchor.dais);
      return { p: [f.cx + dx * plazaR, f.cz + dz * plazaR], kind: "plaza" };
    }
    if ("edge" in anchor) {
      const [dx, dz] = LayoutFields.dir(anchor.edge);
      const r = f.play + F.edgeOutM;
      return { p: [f.cx + dx * r, f.cz + dz * r], kind: "edge" };
    }
    if ("pond" in anchor) {
      if (!pond) return null;
      // The shore point toward a bearing, or toward the other end.
      let dx: number;
      let dz: number;
      if (anchor.pond === true) {
        if (!toward) return null;
        dx = toward[0] - pond.x;
        dz = toward[1] - pond.z;
      } else [dx, dz] = LayoutFields.dir(anchor.pond);
      const length = Math.hypot(dx, dz) || 1;
      dx /= length;
      dz /= length;
      let t = 0;
      while (t < 20 && pond.edge(pond.x + dx * t, pond.z + dz * t) < 0.5) t += 0.25;
      return { p: [pond.x + dx * t, pond.z + dz * t], kind: "pond" };
    }
    if ("river" in anchor) {
      const [dx, dz] = LayoutFields.dir(anchor.river);
      for (let t = 10; t < f.play + 10; t += 0.25) {
        const x = f.cx + dx * t;
        const z = f.cz + dz * t;
        if (f.riverEdge(x, z) < 1.0) return { p: [x, z], kind: "river" };
      }
      return null;
    }
    const other = paths.find((path) => path.id === anchor.path);
    if (!other) return null;
    const point = other.line.pointAt(other.line.length * anchor.at);
    return { p: [point.x, point.z], kind: "junction" };
  };

  F.routes.forEach((route, routeIndex) => {
    const fromFirst = "pond" in route.from && route.from.pond === true ? null : resolve(route.from, null);
    const to = resolve(route.to, fromFirst?.p ?? null);
    const from = fromFirst ?? (to ? resolve(route.from, to.p) : null);
    if (!from || !to) return;
    // A free end (edge, pond, river) never lands near a slot (05 §2: no footpath leads to a slot).
    for (const end of [from, to]) {
      if (end.kind !== "plaza" && end.kind !== "junction" && f.slotDist(end.p[0], end.p[1]) < F.endClearSlotM) return;
    }
    const [ax, az] = from.p;
    const [bx, bz] = to.p;
    const length = Math.hypot(bx - ax, bz - az);
    const n = Math.max(2, Math.ceil(length / F.stepM));
    const nx = -(bz - az) / length;
    const nz = (bx - ax) / length;
    // Bézier control point: chord midpoint pushed along the normal by bend × length.
    const kx = (ax + bx) / 2 + nx * route.bend * length;
    const kz = (az + bz) / 2 + nz * route.bend * length;
    const xs: number[] = [];
    const zs: number[] = [];
    for (let i = 0; i <= n; i += 1) {
      const t = i / n;
      const s = t * length;
      const taper = Math.min(1, s / 6, (length - s) / 6);
      const wobble = (valueNoise(s / F.wobbleWaveM, routeIndex * 3.7, seed + RULE.path) - 0.5) * 2 * F.wobbleM * taper;
      const u = 1 - t;
      xs.push(u * u * ax + 2 * u * t * kx + t * t * bx + nx * wobble);
      zs.push(u * u * az + 2 * u * t * kz + t * t * bz + nz * wobble);
    }
    // Push interior points out of every clearance they break, then relax.
    const deficit = (x: number, z: number): number => {
      let worst = 0;
      worst = Math.min(worst, f.slotDist(x, z) - F.clearSlotM);
      worst = Math.min(worst, f.laneGap(x, z) - F.clearLaneM);
      if (to.kind !== "river") worst = Math.min(worst, f.riverEdge(x, z) - F.clearWaterM);
      if (pond && from.kind !== "pond" && to.kind !== "pond") worst = Math.min(worst, pond.edge(x, z) - F.clearWaterM);
      return worst;
    };
    for (let iteration = 0; iteration < F.iterations; iteration += 1) {
      for (let i = 1; i < n; i += 1) {
        const x = xs[i]!;
        const z = zs[i]!;
        const d = deficit(x, z);
        if (d >= 0) continue;
        const e = 0.25;
        const gx = (deficit(x + e, z) - deficit(x - e, z)) / (2 * e);
        const gz = (deficit(x, z + e) - deficit(x, z - e)) / (2 * e);
        const g = Math.hypot(gx, gz) || 1;
        xs[i] = x - (gx / g) * d * 1.1;
        zs[i] = z - (gz / g) * d * 1.1;
      }
      for (let i = 1; i < n; i += 1) {
        xs[i] = xs[i]! * 0.5 + (xs[i - 1]! + xs[i + 1]!) * 0.25;
        zs[i] = zs[i]! * 0.5 + (zs[i - 1]! + zs[i + 1]!) * 0.25;
      }
    }
    const points: Vec2[] = xs.map((x, i) => [x, zs[i]!]);
    const line = new Polyline(catmullRom(points, 0.5).points);
    const half = F.widthM / 2;
    const halves = new Float64Array(line.count);
    for (let i = 0; i < line.count; i += 1) {
      const s = line.cum[i]!;
      // Narrow toward an edge end; a little wider at a junction.
      const toEdge = to.kind === "edge" ? lerp(F.edgeTaper, 1, smooth(line.length, line.length - 8, s)) : 1;
      const fromPlaza = from.kind === "plaza" ? lerp(F.plazaTaper, 1, smooth(0, F.plazaTaperM, s)) : 1;
      halves[i] = half * toEdge * fromPlaza * (0.92 + 0.16 * valueNoise(s / 4, routeIndex + 0.5, seed + RULE.path + 1));
    }
    paths.push({ id: route.id, line, halves });
  });
  return paths;
}

// ── L6 groves, lone trees, clutter ────────────────────────────────────────

interface Candidate {
  x: number;
  z: number;
  rank: number;
  cell: string;
}

/** One candidate per cell of a jittered grid over the play square, ranked by hash (rank order = acceptance order). */
function candidates(f: LayoutFields, cell: number, reach: number, rule: number, seed: number): Candidate[] {
  const out: Candidate[] = [];
  const steps = Math.ceil(reach / cell);
  for (let j = -steps; j <= steps; j += 1) {
    for (let i = -steps; i <= steps; i += 1) {
      const x = f.cx + (i + (h(rule, i, j * 3 + 1, seed) - 0.5) * 0.8) * cell;
      const z = f.cz + (j + (h(rule, i, j * 3 + 2, seed) - 0.5) * 0.8) * cell;
      out.push({ x, z, rank: h(rule, i, j * 3, seed), cell: i + "_" + j });
    }
  }
  out.sort((a, b) => a.rank - b.rank || (a.cell < b.cell ? -1 : 1));
  return out;
}

function treeCap(f: LayoutFields, x: number, z: number): number {
  const G = LAYOUT_RULES.groves;
  return Math.min(G.capMax, G.capA + G.capB * Math.max(0, f.r(x, z) - 10));
}

export function buildLayout(map: MapDef): MapLayout {
  const f = new LayoutFields(map);
  const seed = map.terrain.seed ^ 0x6d61;
  const pond = sitePond(f, seed);
  const cliff = buildCliff(f, seed);
  const footpaths = routeFootpaths(f, pond, seed);
  const pathHit: Nearest = { dist: 0, along: 0, x: 0, z: 0 };
  const pathGap = (x: number, z: number): number => {
    let best = 99;
    for (const path of footpaths) {
      path.line.nearest(x, z, pathHit, 8);
      if (!Number.isFinite(pathHit.dist)) continue;
      // Half width at the nearest sample.
      let k = 0;
      while (k < path.line.count - 1 && path.line.cum[k + 1]! < pathHit.along) k += 1;
      best = Math.min(best, pathHit.dist - path.halves[k]!);
    }
    return best;
  };
  const pondEdge = (x: number, z: number): number => (pond ? pond.edge(x, z) : 99);

  // Groves.
  const G = LAYOUT_RULES.groves;
  const groves: Grove[] = [];
  for (const c of candidates(f, G.cellM, G.ringM[1], RULE.grove, seed)) {
    if (groves.length >= G.countMax) break;
    const r = f.r(c.x, c.z);
    if (r < G.ringM[0] || r > G.ringM[1]) continue;
    const want = lerp(G.radiusM[0], G.radiusM[1], h(RULE.grove, Math.round(c.x * 10), Math.round(c.z * 10), seed));
    const radius = Math.min(
      want,
      f.laneGap(c.x, c.z) - G.clearLaneM,
      f.slotDist(c.x, c.z) - G.clearSlotM,
      f.skyDist(c.x, c.z) - G.clearSkyM,
      f.riverEdge(c.x, c.z) + G.clearRiverM,
      pathGap(c.x, c.z) + G.clearPathM,
      pondEdge(c.x, c.z) - G.clearPondM,
      r - 9,
      f.play + 2 - r + 1.5,
    );
    if (radius < G.minRadiusM) continue;
    if (groves.some((g) => Math.hypot(g.x - c.x, g.z - c.z) < g.radius + radius + G.gapM)) continue;
    const violet = Math.min(f.laneGap(c.x, c.z), f.skyDist(c.x, c.z)) - radius >= G.violetLaneM;
    groves.push({ id: "grove:" + c.cell, x: c.x, z: c.z, radius, violet });
  }

  // Trees inside each grove: dart throwing in rank order, big crowns near the centre.
  const trees: LayoutItem[] = [];
  const bushes: LayoutItem[] = [];
  const rocks: LayoutItem[] = [];
  const treeOk = (x: number, z: number): boolean =>
    f.laneGap(x, z) >= 3.3 && f.riverEdge(x, z) >= 0.95 && f.slotDist(x, z) >= 3.5 && f.skyDist(x, z) >= 2.7 && f.r(x, z) >= 10.2 && pathGap(x, z) >= 1.1 && pondEdge(x, z) >= 1.2;
  const bushOk = (x: number, z: number): boolean =>
    f.laneGap(x, z) >= 1.3 && f.riverEdge(x, z) >= 0.6 && f.slotDist(x, z) >= 2.8 && f.r(x, z) >= 8 && pathGap(x, z) >= 0.5 && pondEdge(x, z) >= 0.6;
  groves.forEach((grove, gi) => {
    const tintBase = TINTS[Math.floor(h(RULE.grove, gi, 77, seed) * TINTS.length)]!;
    const area = Math.PI * grove.radius * grove.radius;
    const want = Math.max(G.minTrees, Math.round(area * G.density));
    const placed: LayoutItem[] = [];
    for (let attempt = 0; attempt < want * 25 && placed.length < want; attempt += 1) {
      // Uniform in the disc without trig: rejection from the square.
      const u = h(RULE.groveTree, gi * 1000 + attempt, 1, seed) * 2 - 1;
      const v = h(RULE.groveTree, gi * 1000 + attempt, 2, seed) * 2 - 1;
      if (u * u + v * v > 1) continue;
      const x = grove.x + u * grove.radius;
      const z = grove.z + v * grove.radius;
      if (!treeOk(x, z)) continue;
      if (placed.some((t) => Math.hypot(t.x - x, t.z - z) < G.treeGapM)) continue;
      const rho = Math.sqrt(u * u + v * v);
      const roll = h(RULE.groveTree, gi * 1000 + attempt, 3, seed);
      const cap = treeCap(f, x, z);
      let proto: string;
      let height: number;
      if (grove.violet && rho < 0.6 && roll < 0.35) {
        proto = "props/pine-river-tree-violet";
        height = Math.min(cap, 5.2 + roll * 3);
      } else if (rho < 0.55) {
        proto = roll < 0.5 ? "props/pine-river-pine-round" : "props/pine-river-pine-tall";
        height = Math.min(cap, (proto.endsWith("round") ? 4.6 : 5.6) + roll * 2.2);
      } else {
        proto = roll < 0.5 ? "props/pine-river-pine-young" : roll < 0.78 ? "props/pine-river-pine-tall" : "props/pine-river-pine-round";
        height = Math.min(cap * 0.85, (proto.endsWith("young") ? 2.6 : 4.2) + roll * 1.6);
      }
      const jitter = 0.94 + h(RULE.groveTree, gi * 1000 + attempt, 4, seed) * 0.12;
      const tint: [number, number, number] = [tintBase[0] * jitter, tintBase[1] * jitter, tintBase[2] * jitter];
      const crown = proto.endsWith("round") ? 0.55 : proto.endsWith("violet") ? 0.5 : 0.28;
      placed.push({ id: grove.id + ":" + placed.length, proto, x, z, k: height, yaw: h(RULE.groveTree, gi * 1000 + attempt, 5, seed) * Math.PI * 2, tint, radius: height * crown });
    }
    trees.push(...placed);
    // Rim bushes and one clutter item.
    const rimCount = Math.round(2 * Math.PI * grove.radius * G.rimBushPerM);
    for (let k = 0; k < rimCount; k += 1) {
      const u = h(RULE.rim, gi * 100 + k, 1, seed) * 2 - 1;
      const v = h(RULE.rim, gi * 100 + k, 2, seed) * 2 - 1;
      const length = Math.hypot(u, v) || 1;
      const reach = grove.radius + 0.4 + h(RULE.rim, gi * 100 + k, 3, seed) * 1.3;
      const x = grove.x + (u / length) * reach;
      const z = grove.z + (v / length) * reach;
      if (!bushOk(x, z)) continue;
      const blossom = h(RULE.rim, gi * 100 + k, 4, seed) < 0.4;
      bushes.push({ id: grove.id + ":rim" + k, proto: blossom ? "props/pine-river-bush-blossom" : "props/pine-river-bush-moss", x, z, k: 1.5 + h(RULE.rim, gi * 100 + k, 5, seed) * 1.0, yaw: h(RULE.rim, gi * 100 + k, 6, seed) * 6.283, tint: [1, 1, 1], radius: 0.8 });
    }
    if (h(RULE.rim, gi, 9, seed) < G.clutterChance) {
      const u = h(RULE.rim, gi, 10, seed) * 2 - 1;
      const v = h(RULE.rim, gi, 11, seed) * 2 - 1;
      const x = grove.x + u * grove.radius * 0.7;
      const z = grove.z + v * grove.radius * 0.7;
      if (bushOk(x, z) && !placed.some((t) => Math.hypot(t.x - x, t.z - z) < 1.2)) {
        const log = h(RULE.rim, gi, 12, seed) < 0.5;
        rocks.push({ id: grove.id + ":clutter", proto: log ? "props/pine-river-log" : "props/pine-river-stump", x, z, k: log ? 2.4 : 1.1, yaw: h(RULE.rim, gi, 13, seed) * 6.283, tint: [1, 1, 1], radius: log ? 1.2 : 0.5 });
      }
    }
  });

  // Lone trees in the open meadow.
  const S = LAYOUT_RULES.solitary;
  const lone: LayoutItem[] = [];
  for (const c of candidates(f, S.cellM, S.ringM[1], RULE.solitary, seed)) {
    if (lone.length >= S.count) break;
    const r = f.r(c.x, c.z);
    if (r < S.ringM[0] || r > S.ringM[1]) continue;
    if (f.laneGap(c.x, c.z) < S.clearLaneM || f.slotDist(c.x, c.z) < S.clearSlotM || f.skyDist(c.x, c.z) < S.clearSkyM) continue;
    if (f.riverEdge(c.x, c.z) < S.clearRiverM || pathGap(c.x, c.z) < S.clearPathM || pondEdge(c.x, c.z) < S.clearPondM) continue;
    if (groves.some((g) => Math.hypot(g.x - c.x, g.z - c.z) < g.radius + S.clearGroveM)) continue;
    if (lone.some((t) => Math.hypot(t.x - c.x, t.z - c.z) < S.gapM)) continue;
    const roll = h(RULE.solitary, Math.round(c.x * 10), Math.round(c.z * 10), seed);
    const proto = roll < 0.55 ? "props/pine-river-pine-round" : "props/pine-river-pine-tall";
    const height = Math.min(treeCap(f, c.x, c.z), proto.endsWith("round") ? 5 + roll * 2 : 5.8 + roll * 2);
    lone.push({ id: "lone:" + c.cell, proto, x: c.x, z: c.z, k: height, yaw: roll * 40, tint: TINTS[Math.floor(roll * 97) % TINTS.length]!, radius: height * (proto.endsWith("round") ? 0.55 : 0.28) });
  }
  trees.push(...lone);

  // Rock lines: along the river's banks (runs of stones at the water's edge).
  const R = LAYOUT_RULES.rocks;
  if (f.river) {
    const line = f.river.line;
    const point = { x: 0, z: 0, dx: 0, dz: 1 };
    for (const side of [-1, 1]) {
      let run = 0;
      let index = 0;
      for (let s = 0; s < line.length; s += R.river.stepM, index += 1) {
        line.pointAt(s, point);
        const r = f.r(point.x, point.z);
        if (r > f.play + R.river.reachM) {
          run = 0;
          continue;
        }
        const seg = Math.floor(s / 6);
        if (run <= 0) {
          if (h(RULE.rockRiver, seg * 2 + (side > 0 ? 1 : 0), 1, seed) > R.river.runChance) continue;
          run = Math.round(lerp(R.river.runM[0], R.river.runM[1], h(RULE.rockRiver, seg * 2 + (side > 0 ? 1 : 0), 2, seed)));
        }
        run -= 1;
        const half = f.riverWidthAt(s) / 2;
        const off = half + lerp(R.river.offsetM[0], R.river.offsetM[1], h(RULE.rockRiver, index, side + 5, seed));
        const x = point.x - point.dz * off * side;
        const z = point.z + point.dx * off * side;
        if (f.laneGap(x, z) < R.river.clearLaneM) {
          run = 0;
          continue;
        }
        if (pathGap(x, z) < 0.3) continue;
        const roll = h(RULE.rockRiver, index, side + 9, seed);
        const proto = roll < 0.55 ? "props/pine-river-river-stones" : roll < 0.85 ? "props/pine-river-rock-slab" : "props/pine-river-rock-boulder";
        const k = lerp(R.river.k[0], R.river.k[1], h(RULE.rockRiver, index, side + 11, seed)) * (proto.endsWith("boulder") ? 0.8 : 1);
        rocks.push({ id: "rock:river:" + side + ":" + index, proto, x, z, k, yaw: roll * 6.283, tint: [1, 1, 1], radius: k * 0.5 });
      }
    }
  }
  // Rock lines along lane edges (both sides, short runs), off slots and the plaza.
  f.lanes.forEach((lane, laneIndex) => {
    const point = { x: 0, z: 0, dx: 0, dz: 1 };
    for (const side of [-1, 1]) {
      let run = 0;
      let index = 0;
      for (let s = 1; s < lane.line.length; s += R.lane.stepM, index += 1) {
        if (lane.spans.some((span) => s > span.fromM - 2.5 && s < span.toM + 2.5)) {
          run = 0;
          continue;
        }
        const seg = Math.floor(s / 7);
        const key = laneIndex * 1000 + seg * 2 + (side > 0 ? 1 : 0);
        if (run <= 0) {
          if (h(RULE.rockLane, key, 1, seed) > R.lane.runChance) continue;
          run = Math.round(lerp(R.lane.runM[0], R.lane.runM[1], h(RULE.rockLane, key, 2, seed)));
        }
        run -= 1;
        lane.line.pointAt(s, point);
        const off = lane.half + lerp(R.lane.offsetM[0], R.lane.offsetM[1], h(RULE.rockLane, laneIndex * 1000 + index, side + 5, seed));
        const x = point.x - point.dz * off * side;
        const z = point.z + point.dx * off * side;
        if (f.slotDist(x, z) < R.lane.clearSlotM || f.r(x, z) < R.lane.clearDaisM || f.riverEdge(x, z) < 0.3 || pathGap(x, z) < 0.3) continue;
        const roll = h(RULE.rockLane, laneIndex * 1000 + index, side + 9, seed);
        const k = lerp(R.lane.k[0], R.lane.k[1], roll);
        rocks.push({ id: "rock:lane:" + laneIndex + ":" + side + ":" + index, proto: roll < 0.7 ? "props/pine-river-river-stones" : "props/pine-river-rock-slab", x, z, k, yaw: roll * 6.283, tint: [1, 1, 1], radius: k * 0.5 });
      }
    }
  });
  // Pond rim stones, with gaps where a footpath reaches the water.
  if (pond) {
    for (let k = 0; k < R.pond.count; k += 1) {
      const s = ((k + h(RULE.rockPond, k, 1, seed) * 0.6) / R.pond.count) * pond.shore.length;
      const p = pond.shore.pointAt(s);
      // Outward from the pond centre (the shore is a blob, so radial is close to the normal).
      const out = 0.15 + h(RULE.rockPond, k, 2, seed) * 0.5;
      const ox = p.x - pond.x;
      const oz = p.z - pond.z;
      const length = Math.hypot(ox, oz) || 1;
      const fx = p.x + (ox / length) * out;
      const fz = p.z + (oz / length) * out;
      if (pathGap(fx, fz) < 0.6) continue;
      const kk = lerp(R.pond.k[0], R.pond.k[1], h(RULE.rockPond, k, 3, seed));
      rocks.push({ id: "rock:pond:" + k, proto: k % 3 === 0 ? "props/pine-river-rock-slab" : "props/pine-river-river-stones", x: fx, z: fz, k: kk, yaw: h(RULE.rockPond, k, 4, seed) * 6.283, tint: [1, 1, 1], radius: kk * 0.5 });
    }
    for (let k = 0; k < 3; k += 1) {
      const s = ((k + 0.5) / 3) * pond.shore.length;
      const p = pond.shore.pointAt(s);
      const ox = p.x - pond.x;
      const oz = p.z - pond.z;
      const length = Math.hypot(ox, oz) || 1;
      const x = p.x + (ox / length) * 1.5;
      const z = p.z + (oz / length) * 1.5;
      if (!bushOk(x, z)) continue;
      bushes.push({ id: "pond:bush" + k, proto: k === 1 ? "props/pine-river-bush-blossom" : "props/pine-river-bush-moss", x, z, k: 1.6, yaw: k * 2.1, tint: [1, 1, 1], radius: 0.8 });
    }
  }
  // Boulders and slabs along the cliff foot.
  {
    const C = LAYOUT_RULES.cliff;
    const point = { x: 0, z: 0, dx: 0, dz: 1 };
    let index = 0;
    for (let s = C.capM * 0.5; s < cliff.line.length - C.capM * 0.5; s += R.cliffFoot.stepM, index += 1) {
      if (h(RULE.rockCliff, index, 1, seed) > R.cliffFoot.chance) continue;
      cliff.line.pointAt(s, point);
      // Toward the dais = inward normal.
      let nx = -point.dz;
      let nz = point.dx;
      if (nx * (f.cx - point.x) + nz * (f.cz - point.z) < 0) {
        nx = -nx;
        nz = -nz;
      }
      const out = 1.2 + h(RULE.rockCliff, index, 2, seed) * 1.8;
      const x = point.x + nx * out;
      const z = point.z + nz * out;
      if (f.laneGap(x, z) < 3 || f.riverEdge(x, z) < 0.5) continue;
      const roll = h(RULE.rockCliff, index, 3, seed);
      const k = lerp(R.cliffFoot.k[0], R.cliffFoot.k[1], roll);
      rocks.push({ id: "rock:cliff:" + index, proto: roll < 0.55 ? "props/pine-river-rock-boulder" : "props/pine-river-rock-slab", x, z, k, yaw: roll * 6.283, tint: [1, 1, 1], radius: k * 0.5 });
    }
    // Face boulders and lip slabs: points at a signed offset s from the face line (+ away from the dais).
    for (const [rule, R2, proto0, proto1, salt] of [
      ["face", R.cliffFace, "props/pine-river-rock-boulder", "props/pine-river-rock-slab", 21],
      ["lip", R.cliffLip, "props/pine-river-rock-slab", "props/pine-river-rock-boulder", 31],
    ] as const) {
      let k2 = 0;
      for (let s = C.capM * 0.6; s < cliff.line.length - C.capM * 0.6; s += R2.stepM, k2 += 1) {
        if (h(RULE.rockCliff, k2, salt, seed) > R2.chance) continue;
        cliff.line.pointAt(s + (h(RULE.rockCliff, k2, salt + 1, seed) - 0.5) * R2.stepM * 0.6, point);
        let nx = -point.dz;
        let nz = point.dx;
        if (nx * (f.cx - point.x) + nz * (f.cz - point.z) > 0) {
          nx = -nx;
          nz = -nz;
        }
        // nx, nz now point away from the dais; the ragged edge is folded in by sampling offset() at the spot.
        const want = lerp(R2.s[0], R2.s[1], h(RULE.rockCliff, k2, salt + 2, seed));
        let x = point.x + nx * want;
        let z = point.z + nz * want;
        const off = cliff.offset(x, z).s;
        x += nx * (want - off);
        z += nz * (want - off);
        const roll = h(RULE.rockCliff, k2, salt + 3, seed);
        const k = lerp(R2.k[0], R2.k[1], h(RULE.rockCliff, k2, salt + 4, seed)) * smooth(0, C.capM, s) * smooth(cliff.line.length, cliff.line.length - C.capM, s);
        if (k < 1) continue;
        rocks.push({ id: "rock:cliff-" + rule + ":" + k2, proto: roll < 0.65 ? proto0 : proto1, x, z, k, yaw: roll * 6.283, tint: [0.98 + roll * 0.06, 0.97 + roll * 0.05, 0.95], radius: k * 0.5 });
      }
    }
  }

  // L7 dirt stamps: plaza apron, canopy dirt, lone-tree discs, junctions, lane crossings, lane scuffs.
  const P = LAYOUT_RULES.paint;
  const dirt: PaintDisc[] = [];
  dirt.push({ x: f.cx, z: f.cz, r: P.plazaM, falloff: P.plazaFalloffM, strength: 1 });
  for (const grove of groves) dirt.push({ x: grove.x, z: grove.z, r: grove.radius * P.groveDirt, falloff: 1.6, strength: 0.9 });
  for (const tree of trees) {
    const isLone = tree.id.startsWith("lone:");
    dirt.push({ x: tree.x, z: tree.z, r: isLone ? P.loneDirtM : Math.max(1.1, tree.radius * P.canopyDirt), falloff: P.canopyFalloffM, strength: 1 });
  }
  for (const path of footpaths) {
    for (const end of [0, path.line.count - 1]) {
      const x = path.line.xs[end]!;
      const z = path.line.zs[end]!;
      // Junctions and the plaza mouth get a trodden patch; forest ends fade out instead.
      if (f.r(x, z) > f.play) continue;
      dirt.push({ x, z, r: P.junctionM, falloff: 1.2, strength: 0.75 });
    }
  }
  f.lanes.forEach((lane) => {
    for (const span of lane.spans) {
      for (const at of [span.fromM - 1.2, span.toM + 1.2]) {
        const p = lane.line.pointAt(at);
        dirt.push({ x: p.x, z: p.z, r: P.crossingM, falloff: 1.5, strength: 0.9 });
      }
    }
  });
  f.lanes.forEach((lane, laneIndex) => {
    const point = { x: 0, z: 0, dx: 0, dz: 1 };
    let index = 0;
    for (let s = 2; s < lane.line.length + 10; index += 1) {
      const along = Math.min(s, lane.line.length);
      const onTrail = s > lane.line.length;
      if (!onTrail) lane.line.pointAt(along, point);
      else lane.trail.pointAt(lane.trail.length - (s - lane.line.length), point);
      const inSpan = lane.spans.some((span) => s > span.fromM - 1 && s < span.toM + 1);
      if (!inSpan && f.r(point.x, point.z) > 7.5) {
        const side = h(RULE.scuff, laneIndex * 100 + index, 1, seed) < 0.5 ? -1 : 1;
        const off = lane.half + lerp(P.scuffOffsetM[0], P.scuffOffsetM[1], h(RULE.scuff, laneIndex * 100 + index, 2, seed));
        const r = lerp(P.scuffM[0], P.scuffM[1], h(RULE.scuff, laneIndex * 100 + index, 3, seed));
        dirt.push({ x: point.x - point.dz * off * side, z: point.z + point.dx * off * side, r, falloff: 0.8, strength: 0.62 });
      }
      s += lerp(P.scuffStepM[0], P.scuffStepM[1], h(RULE.scuff, laneIndex * 100 + index, 4, seed));
    }
  });
  // Scree at the cliff foot.
  {
    const point = { x: 0, z: 0, dx: 0, dz: 1 };
    let index = 0;
    for (let s = 3; s < cliff.line.length - 3; s += 2.6, index += 1) {
      cliff.line.pointAt(s, point);
      let nx = -point.dz;
      let nz = point.dx;
      if (nx * (f.cx - point.x) + nz * (f.cz - point.z) < 0) {
        nx = -nx;
        nz = -nz;
      }
      const out = 1.5 + h(RULE.rockCliff, index, 7, seed) * 1.5;
      dirt.push({ x: point.x + nx * out, z: point.z + nz * out, r: 1.6 + h(RULE.rockCliff, index, 8, seed) * 1.4, falloff: 1.4, strength: 0.75 });
    }
  }

  return {
    fields: f,
    pond,
    cliff,
    footpaths,
    groves,
    trees,
    bushes,
    rocks,
    dirt,
    pathGap,
    stats: {
      groves: groves.length,
      groveTrees: trees.length - lone.length,
      loneTrees: lone.length,
      bushes: bushes.length,
      rocks: rocks.length,
      footpaths: footpaths.length,
      dirtStamps: dirt.length,
    },
  };
}
