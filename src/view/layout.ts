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
import { sceneFor, type SceneAnchor, type SceneCliff, type SceneFootpath, type ScenePond, type SceneSpec } from "./maps/scene";
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
  /** L2: cliff marks in the outer skirt that frame one side (line and height pinned in the map's scene spec, profile by rule). */
  cliff: {
    /**
     * Signed offset s (m, + away from the dais): the face rises in `tiers`
     * equal steps (MAP_PLAN V10: three of about 3 m), each a face faceW wide
     * then a flat ledge ledgeW wide, starting at faceFromM; the top runs to
     * plateauM, then falls over backM. Each tier's edge wanders on its own.
     */
    faceFromM: -0.8,
    faceW: 1.3,
    ledgeW: 1.9,
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
    /** V8: a main path (lantern route) 1.5 m and fully trodden; a branch 0.9 m with a grass crown. */
    widthM: 0.9,
    mainWidthM: 1.5,
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
    /** A `cliff` anchor stops this far in front of the face foot (on the scree). */
    cliffStopM: 4,
    /*
     * Routes come from the scene spec. Each bows off its chord: a quadratic
     * Bézier whose control point is the chord midpoint moved along the chord
     * normal by bend × length (signed: + to the left of from→to). Small wobble
     * rides on top.
     */
  },
  /** L6: groves (cluster centres, then trees inside), replacing the even scatter inside the play area. */
  groves: {
    cellM: 6,
    /** V4: at most 7 groves inside the play area, ≥ 8 m apart (edge to edge), 1–2 anchors reaching into the forest. */
    countMax: 7,
    radiusM: [3.8, 6.2] as const,
    anchorsMax: 2,
    anchorFromM: 22,
    anchorRadiusM: [7, 9] as const,
    anchorPastM: 6,
    /** V4: the grove's own species holds this share; the rest are young pines (outer ring) and the other species. */
    dominantShare: 0.74,
    /** FB-08 (A2): one violet crown in one grove at most (the accent is rare, never at every angle). */
    violetMax: 1,
    violetGrovesMax: 1,
    /** Blossom bushes read as red specks from above (V3): few. */
    blossomShare: 0.2,
    minRadiusM: 2.6,
    ringM: [11, 30] as const,
    clearLaneM: 3.4,
    clearSlotM: 4.8,
    clearSkyM: 3,
    clearRiverM: 0.4,
    clearPathM: 2.2,
    clearPondM: 3,
    /** Gap between two grove discs. */
    gapM: 8,
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
    /** V5: lone trees on dirt discs in the transition bands (the reference's middle ground), at most openMax on the open arc. */
    count: 9,
    /** V1: lone trees on the open meadow arc (FB-11, A2: one; the meadow stays open). */
    openMax: 1,
    /** FB-11 (A2): a lone tree stands within this of a grove disc or the forest edge (the transition band), never mid-meadow. */
    bandM: 8,
    cellM: 5,
    ringM: [12, 29] as const,
    clearLaneM: 4.2,
    clearSlotM: 5.2,
    clearSkyM: 4,
    clearRiverM: 2,
    clearPathM: 2.4,
    clearPondM: 3,
    clearGroveM: 2.5,
    /** FB-11: 6–10 m apart. */
    gapM: 6,
  },
  /** L6: stone clusters (2–4 grey stones) along the water and the lane edges; the cliff's scree and lip slabs. */
  rocks: {
    // FB-02 (A2): fewer stone clusters along the water and the lanes (small grey specks add clutter).
    river: { stepM: 4.5, chance: 0.36, offsetM: [0.1, 0.8] as const, clearLaneM: 2.6, reachM: 6, k: [0.45, 0.95] as const },
    lane: { stepM: 6, chance: 0.22, offsetM: [0.7, 1.3] as const, clearSlotM: 4, clearDaisM: 9, k: [0.35, 0.6] as const },
    pond: { count: 10, k: [0.6, 1.35] as const },
    /** V10: 10–20 pale stones 0.8–2 m on the scree in front of each cliff foot; FB-10 (A2): some are low Cliff Rock (wide) blocks. */
    cliffFoot: { stepM: 2.0, chance: 0.75, outM: [0.8, 6.5] as const, k: [0.8, 2.0] as const, blockShare: 0.3, blockK: [1.6, 2.6] as const },
    /**
     * FB-10 (A2): tiered faces of the Tripo round 3 Cliff Rocks, replacing the round boulders: along each tier's
     * face foot a row of tall blocks (cliff-rock-a, height a tier × kA), turned to the dais, every stepM; the
     * lowest tier mixes in wide blocks (cliff-rock-b, width kB × tier); a few wide blocks along the top lip.
     */
    cliffFace: { stepM: [1.6, 2.8] as const, skip: 0.12, intoM: 0.35, kA: [0.78, 1.12] as const, stretchA: [1.25, 2.1] as const, tall: 0.12, tallK: 1.75, kB: [1.2, 1.5] as const, footWide: 0.35, upperWide: 0.18, lipStepM: 4.5, lipK: [2.4, 3.4] as const, yawJitter: 0.6, leanRad: 0.08 },
  },
  /** V6: the skirt forest starts insideM inside the play radius, moved by the scene's bays and headlands, ± noiseM. */
  edge: { insideM: 2, noiseM: 4, noiseWave: 4.5 },
  /**
   * V5 (map pilot): small round bushes dotted over the meadow, as in the reference: sparse on the open
   * arc, a little denser in the transition bands; clear of lanes, slots, the sky lane, water and paths.
   */
  /** FB-11 (A2): no loose bush on the open meadow; a few only near a grove disc or the forest edge (nearM), as clusters. */
  dots: { cellM: 3.6, openChance: 0, chance: 0.6, max: 14, nearM: 5, gapM: 3.2, k: [1.3, 2.1] as const, clearLaneM: 2.6, clearSlotM: 3.8, clearSkyM: 2.2, clearWaterM: 1.3, clearPathM: 0.9, clearTreeM: 2.4, daisM: 9.5 },
  /**
   * V7: warm crowns (tinted round trees). FB-09 (A2): 16 m apart and from a violet crown, 10 m from lanes,
   * slots and the sky lane, and never under the default frame's HUD (`hud`: screen boxes [u0, v0, u1, v1], 0–1).
   */
  warm: { clearM: 10, gapM: 16, share: 0.08, min: 4, violetGapM: 16, grow: 1.18, hud: [[0, 0.7, 0.32, 1.6], [0.3, 0.8, 0.7, 1.6]] as const },
  /**
   * FB-16, FB-18, FB-15 (A2): path dressing from the Tripo round 3 kit. Lantern Post every 9–12 m along a main
   * path, sides alternating, 0.9 m off its edge (more often near the dais); Rail Fence sections at both
   * bridgeheads and on the outside of main-path bends ≥ 15°; Wooden Jetty at the pond end of the pond path;
   * Reed Clumps on the pond's far shore and the slow river banks; a rest spot (log seat, stump, lantern) at the
   * end of a branch path that enters a forest bay.
   */
  dress: {
    lantern: { firstM: 3.5, stepM: [9, 12] as const, offM: 0.9, k: 2.2, clearSlotM: 4.6, clearLaneM: 2.2, clearWaterM: 1.0 },
    fence: { k: 2.4, bridgeOffM: 0.7, bendDeg: 15, bendsMax: 2, offM: 0.85, clearSlotM: 1.9, clearLaneM: 0.5 },
    jetty: { k: 3.3, landM: 0.9, deckM: 0.3 },
    reeds: { pond: 6, pondK: [0.95, 1.35] as const, riverSpots: 4, riverK: [0.9, 1.3] as const, clearLaneM: 2.4, clearSlotM: 3, clearJettyM: 2.4 },
    rest: { r: 2.6 },
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
    /** V3: radius wobble of a dirt patch (≤ 0.25) and how far its centre moves to the shade side (share of r). */
    wobble: [0.12, 0.24] as const,
    shadeShift: 0.35,
  },
} as const;

export type FootpathAnchor = SceneAnchor;
export type FootpathRoute = SceneFootpath;

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
  /** Map pilot V7: a round tree whose crown is painted warm (rust, copper); `?warm=0` draws it green. */
  readonly warm?: boolean;
  /** Map pilot V10: a cliff rock painted pale stone. */
  readonly stone?: boolean;
  /** Tilt about x and z, radians. */
  readonly tilt?: readonly [number, number];
  /** Map pilot A2: share of the model's height sunk into the ground (cliff blocks on a slope). */
  readonly sinkShare?: number;
  /** Map pilot A2: stands at the pond's water level plus this many metres (the jetty), not on the ground. */
  readonly water?: number;
  /** Map pilot A2: extra scale along the model's own x (cliff blocks widened into a face). */
  readonly stretch?: number;
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
  /** Offset where the top tier's face ends (the plateau starts past it). */
  readonly topS: number;
  /** Map pilot A2: offset of tier k's face foot at a distance `along` the line (its own wander included). */
  faceS(along: number, k: number): number;
  /** Height of one tier, metres. */
  readonly tierM: number;
  readonly tiers: number;
}

export interface Footpath {
  readonly id: string;
  /** V8: "main" paths are wide and fully trodden, "branch" paths narrow with a grass crown. */
  readonly tier: "main" | "branch";
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
  /**
   * Map pilot V3: an organic patch instead of a round disc. The radius at
   * angle a is r × (1 + wobble · (0.7 sin(lobes · a + phase) + 0.3 sin((lobes + 2) · a + 2.3 phase))),
   * stretched by `stretch` along `angle`; wobble ≤ 0.25.
   */
  readonly lobes?: number;
  readonly wobble?: number;
  readonly phase?: number;
  readonly stretch?: number;
  readonly angle?: number;
}

export interface MapLayout {
  readonly fields: LayoutFields;
  readonly pond: Pond | null;
  /** All cliff marks as one: lift is the highest, offset the nearest line's. */
  readonly cliff: Cliff | null;
  readonly cliffs: readonly Cliff[];
  /** V6: radius where the skirt forest starts at a bearing (bays push it out, headlands in, ±noise). */
  forestEdge(x: number, z: number): number;
  readonly footpaths: readonly Footpath[];
  readonly groves: readonly Grove[];
  /** Grove and lone trees (inside the play area). */
  readonly trees: readonly LayoutItem[];
  readonly bushes: readonly LayoutItem[];
  readonly rocks: readonly LayoutItem[];
  readonly dirt: readonly PaintDisc[];
  /** Map pilot A2: lanterns, fences and the jetty (kit "dress" props). */
  readonly dress: readonly LayoutItem[];
  /** Map pilot A2: discs the skirt scatter keeps free (the rest spot at a branch path's forest end). */
  readonly clearings: readonly { readonly x: number; readonly z: number; readonly r: number }[];
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

const RULE = { pond: 1, cliff: 2, path: 3, grove: 4, groveTree: 5, solitary: 6, rockRiver: 7, rockLane: 8, rockPond: 9, rockCliff: 10, scuff: 11, rim: 12, dots: 13, dress: 14 } as const;

/** Tree tints (multiplied into the texture): base, sun green, cool blue-green, deep, fresh. Never yellow (Héo). */
const TINTS: readonly (readonly [number, number, number])[] = [
  [1, 1, 1],
  [1.05, 1.06, 0.9],
  [0.86, 0.97, 1.08],
  [0.84, 0.89, 0.88],
  [0.97, 1.09, 0.93],
];

// ── L3 pond ────────────────────────────────────────────────────────────────

function sitePond(f: LayoutFields, seed: number, pinned: ScenePond | null): Pond | null {
  const P = LAYOUT_RULES.pond;
  let best: { x: number; z: number; score: number } | null = pinned ? { x: pinned.at[0], z: pinned.at[1], score: 0 } : null;
  const reach = pinned ? -1 : P.ringM[1];
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

function buildCliff(f: LayoutFields, seed: number, spec: SceneCliff): Cliff {
  const C = { ...LAYOUT_RULES.cliff, heightM: spec.heightM };
  const tiers = Math.max(1, spec.tiers);
  const line = new Polyline(catmullRom(spec.line, 1).points);
  const hit: Nearest = { dist: 0, along: 0, x: 0, z: 0 };
  // Tier k's own wander (the base ragged edge is in `offset`).
  const tierWander = (along: number, k: number): number => (k === 0 ? 0 : (valueNoise(along / (C.raggedWaveM * 0.8), 3.1 + k * 1.7, seed + RULE.cliff) - 0.5) * 2 * C.raggedM * 0.8);
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
    tiers,
    tierM: C.heightM / tiers,
    faceS: (along: number, k: number): number => C.faceFromM + k * (C.faceW + C.ledgeW) + tierWander(along, k),
    topS: C.faceFromM + (tiers - 1) * (C.faceW + C.ledgeW) + C.faceW + C.raggedM * 0.8,
    lift(x: number, z: number): number {
      if (x < line.minX - 40 || x > line.maxX + 40 || z < line.minZ - 40 || z > line.maxZ + 40) return 0;
      const { s, cap, along } = offset(x, z);
      if (cap <= 0 || s < C.faceFromM - 2.5 || s > C.plateauM + C.backM) return 0;
      let rise = 0;
      for (let k = 0; k < tiers; k += 1) {
        const from = C.faceFromM + k * (C.faceW + C.ledgeW) + tierWander(along, k);
        rise += smooth(from, from + C.faceW, s) / tiers;
      }
      const fall = 1 - smooth(C.plateauM, C.plateauM + C.backM, s);
      return C.heightM * rise * fall * cap;
    },
  };
}

// ── L4 footpaths ──────────────────────────────────────────────────────────

function routeFootpaths(f: LayoutFields, pond: Pond | null, cliff: Cliff | null, seed: number, routes: readonly SceneFootpath[]): Footpath[] {
  const F = LAYOUT_RULES.footpaths;
  const paths: Footpath[] = [];
  const plazaR = f.map.dais.radiusM + 2.4;

  const resolve = (anchor: FootpathAnchor, toward: Vec2 | null): { p: Vec2; kind: "plaza" | "edge" | "pond" | "river" | "junction" | "cliff" | "point" } | null => {
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
    if ("cliff" in anchor) {
      // The scree in front of the cliff foot toward a bearing (a rock field is the path's destination).
      if (!cliff) return null;
      const [dx, dz] = LayoutFields.dir(anchor.cliff);
      for (let t = 10; t < 70; t += 0.25) {
        const x = f.cx + dx * t;
        const z = f.cz + dz * t;
        const o = cliff.offset(x, z);
        if (o.cap > 0.3 && o.s > -LAYOUT_RULES.footpaths.cliffStopM) return { p: [x, z], kind: "cliff" };
      }
      return null;
    }
    if ("point" in anchor) return { p: [anchor.point[0], anchor.point[1]], kind: "point" };
    const other = paths.find((path) => path.id === anchor.path);
    if (!other) return null;
    const point = other.line.pointAt(other.line.length * anchor.at);
    return { p: [point.x, point.z], kind: "junction" };
  };

  routes.forEach((route, routeIndex) => {
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
    const half = (route.tier === "main" ? F.mainWidthM : F.widthM) / 2;
    const halves = new Float64Array(line.count);
    for (let i = 0; i < line.count; i += 1) {
      const s = line.cum[i]!;
      // Narrow toward an edge end; a little wider at a junction.
      const toEdge = to.kind === "edge" ? lerp(F.edgeTaper, 1, smooth(line.length, line.length - 8, s)) : 1;
      const fromPlaza = from.kind === "plaza" ? lerp(F.plazaTaper, 1, smooth(0, F.plazaTaperM, s)) : 1;
      halves[i] = half * toEdge * fromPlaza * (0.92 + 0.16 * valueNoise(s / 4, routeIndex + 0.5, seed + RULE.path + 1));
    }
    paths.push({ id: route.id, tier: route.tier, line, halves });
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


/** Smallest signed difference of two bearings, degrees, in (−180, 180]. */
function bearingDelta(a: number, b: number): number {
  let d = (a - b) % 360;
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  return d;
}

/** Bearing of (x, z) from the dais centre, degrees in [0, 360). */
export function bearingOf(f: LayoutFields, x: number, z: number): number {
  const b = (Math.atan2(x - f.cx, -(z - f.cz)) * 180) / Math.PI;
  return b < 0 ? b + 360 : b;
}

/** All cliff marks queried as one: the highest lift, the nearest line's offset. */
function compositeCliff(cliffs: readonly Cliff[]): Cliff {
  if (cliffs.length === 1) return cliffs[0]!;
  return {
    line: cliffs[0]!.line,
    topS: Math.max(...cliffs.map((cliff) => cliff.topS)),
    tiers: cliffs[0]!.tiers,
    tierM: cliffs[0]!.tierM,
    faceS: cliffs[0]!.faceS,
    lift(x: number, z: number): number {
      let best = 0;
      for (const cliff of cliffs) best = Math.max(best, cliff.lift(x, z));
      return best;
    },
    offset(x: number, z: number) {
      let best = cliffs[0]!.offset(x, z);
      for (let k = 1; k < cliffs.length; k += 1) {
        const next = cliffs[k]!.offset(x, z);
        // The line that owns the spot: live (cap > 0) first, then the nearest.
        if ((next.cap > 0 && best.cap <= 0) || ((next.cap > 0) === (best.cap > 0) && Math.abs(next.s) < Math.abs(best.s))) best = next;
      }
      return best;
    },
  };
}

const PINE_ROUND = "props/pine-river-pine-round";
const PINE_TALL = "props/pine-river-pine-tall";
const PINE_YOUNG = "props/pine-river-pine-young";
const ROCK_SLAB = "props/pine-river-rock-slab";
const RIVER_STONES = "props/pine-river-river-stones";
/** V13: gravel and stones mid grey, never a white chain. */
const GREY: readonly [number, number, number] = [0.7, 0.71, 0.73];
const CLIFF_A = "props/pine-river-cliff-rock-a";
const CLIFF_B = "props/pine-river-cliff-rock-b";
const LANTERN = "props/pine-river-lantern-post";
const FENCE = "props/pine-river-rail-fence";
const JETTY = "props/pine-river-wooden-jetty";
const REED = "props/pine-river-reed-clump";
const TUFT = "props/pine-river-grass-tuft";
const FLOWER = "props/pine-river-wildflower-clump";
/** Processed heights of the width-sized round 3 props (scripts/models/presets/dragon-hold-m0b.json: 1 m wide). */
const CLIFF_B_H = 0.444;

/**
 * Where a world point lands in the map's home view (map.camera, the stage camera's 30° field, 16:9):
 * [u, v] from the top-left, 0–1, or null behind the camera. FB-09 keeps warm crowns out of the HUD boxes.
 */
export function homeViewUv(map: MapDef, x: number, y: number, z: number): [number, number] | null {
  const D = Math.PI / 180;
  const [cx, cz] = map.dais.center;
  const [lx, lz] = map.camera.lookM ?? [0, 0];
  const yaw = map.camera.yawDeg * D;
  const pitch = map.camera.pitchDeg * D;
  const tx = cx + lx;
  const ty = 0.6;
  const tz = cz + lz;
  const flat = Math.cos(pitch) * map.camera.distanceM;
  const px = tx + Math.sin(yaw) * flat;
  const py = ty + Math.sin(pitch) * map.camera.distanceM;
  const pz = tz + Math.cos(yaw) * flat;
  let fx = tx - px;
  let fy = ty - py;
  let fz = tz - pz;
  const fl = Math.hypot(fx, fy, fz);
  fx /= fl;
  fy /= fl;
  fz /= fl;
  // right = forward × up (up = +y), camera up = right × forward.
  let rx = -fz;
  let rz = fx;
  const rl = Math.hypot(rx, rz) || 1;
  rx /= rl;
  rz /= rl;
  const ux = -rz * fy;
  const uy = rz * fx - rx * fz;
  const uz = rx * fy;
  const dx = x - px;
  const dy = y - py;
  const dz = z - pz;
  const depth = dx * fx + dy * fy + dz * fz;
  if (depth <= 0) return null;
  const tan = Math.tan(15 * D);
  const ndcX = (dx * rx + dz * rz) / (depth * tan * (16 / 9));
  const ndcY = (dx * ux + dy * uy + dz * uz) / (depth * tan);
  return [(ndcX + 1) / 2, (1 - ndcY) / 2];
}

export function buildLayout(map: MapDef, scene: SceneSpec | null = sceneFor(map)): MapLayout {
  const f = new LayoutFields(map);
  const seed = map.terrain.seed ^ 0x6d61;
  const pond = sitePond(f, seed, scene?.ponds[0] ?? null);
  const cliffs = (scene?.cliffs ?? []).map((spec) => buildCliff(f, seed, spec));
  const cliff = cliffs.length > 0 ? compositeCliff(cliffs) : null;
  const footpaths = routeFootpaths(f, pond, cliff, seed, scene?.footpaths ?? []);
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
  // FB-18 (A2): a branch path that ends in the forest ends at a rest spot (a clearing with a log seat).
  const DR = LAYOUT_RULES.dress;
  const clearings: { x: number; z: number; r: number }[] = [];
  for (const path of footpaths) {
    if (path.tier !== "branch") continue;
    const last = path.line.count - 1;
    const x = path.line.xs[last]!;
    const z = path.line.zs[last]!;
    if (f.r(x, z) > f.play) clearings.push({ x, z, r: DR.rest.r });
  }

  // Light: shade side is away from the sun (V3 puts each dirt patch's centre there).
  const sunB = ((scene?.lighting.sunBearingDeg ?? 221.6) * Math.PI) / 180;
  const shadeX = -Math.sin(sunB);
  const shadeZ = Math.cos(sunB);

  // V1: the open meadow arc (no groves, at most a few lone trees).
  const open = scene?.open ?? null;
  const inOpen = (x: number, z: number, margin = 0): boolean => {
    if (!open) return false;
    const r = f.r(x, z);
    if (r < open.ringM[0] - margin || r > open.ringM[1] + margin) return false;
    const b = bearingOf(f, x, z);
    const spread = (Math.asin(Math.min(1, margin / Math.max(r, 1))) * 180) / Math.PI;
    return bearingDelta(b, open.fromDeg) >= -spread && bearingDelta(b, open.toDeg) <= spread;
  };

  // V6: forest edge with bays (+ depth) and headlands (− depth), ±noise along the ring.
  const E = LAYOUT_RULES.edge;
  const bays = scene?.bays ?? [];
  const forestEdge = (x: number, z: number): number => {
    const b = bearingOf(f, x, z);
    let edge = f.play - E.insideM;
    for (const bay of bays) {
      const t = Math.abs(bearingDelta(b, bay.bearingDeg)) / bay.halfWidthDeg;
      if (t < 1) edge += bay.depthM * (1 - smooth(0.3, 1, t));
    }
    const r = f.r(x, z) || 1;
    const ux = (x - f.cx) / r;
    const uz = (z - f.cz) / r;
    return edge + (valueNoise(ux * E.noiseWave + 9.1, uz * E.noiseWave + 3.7, seed + 77) - 0.5) * 2 * E.noiseM;
  };

  // Groves: pinned (scene spec) or by rule (open arc kept clear, edge-to-edge gap, anchors may reach the forest).
  const G = LAYOUT_RULES.groves;
  const groves: (Grove & { warm: boolean; dominant: string })[] = [];
  const dominantOf = (index: number): string => (h(RULE.grove, index, 41, seed) < 0.5 ? PINE_ROUND : PINE_TALL);
  for (const pin of scene?.groves ?? []) {
    const [x, z] = pin.at;
    const violet = Math.min(f.laneGap(x, z), f.skyDist(x, z)) - pin.radiusM >= G.violetLaneM;
    groves.push({ id: pin.id, x, z, radius: pin.radiusM, violet, warm: pin.warm, dominant: pin.dominant ?? dominantOf(groves.length) });
  }
  let anchors = 0;
  for (const c of scene && scene.groves.length > 0 ? [] : candidates(f, G.cellM, G.ringM[1], RULE.grove, seed)) {
    if (groves.length >= G.countMax) break;
    const r = f.r(c.x, c.z);
    if (r < G.ringM[0] || r > G.ringM[1]) continue;
    const anchor = anchors < G.anchorsMax && r >= G.anchorFromM;
    const want = anchor ? lerp(G.anchorRadiusM[0], G.anchorRadiusM[1], h(RULE.grove, Math.round(c.x * 10), Math.round(c.z * 10), seed)) : lerp(G.radiusM[0], G.radiusM[1], h(RULE.grove, Math.round(c.x * 10), Math.round(c.z * 10), seed));
    const radius = Math.min(
      want,
      f.laneGap(c.x, c.z) - G.clearLaneM,
      f.slotDist(c.x, c.z) - G.clearSlotM,
      f.skyDist(c.x, c.z) - G.clearSkyM,
      f.riverEdge(c.x, c.z) + G.clearRiverM,
      pathGap(c.x, c.z) + G.clearPathM,
      pondEdge(c.x, c.z) - G.clearPondM,
      r - 9,
      anchor ? f.play + G.anchorPastM - r : f.play + 3.5 - r,
    );
    if (radius < G.minRadiusM) continue;
    if (inOpen(c.x, c.z, radius + 2)) continue;
    if (groves.some((g) => Math.hypot(g.x - c.x, g.z - c.z) < g.radius + radius + G.gapM)) continue;
    if (anchor && radius >= G.anchorRadiusM[0] - 0.5) anchors += 1;
    const violet = Math.min(f.laneGap(c.x, c.z), f.skyDist(c.x, c.z)) - radius >= G.violetLaneM;
    groves.push({ id: "grove:" + c.cell, x: c.x, z: c.z, radius, violet, warm: true, dominant: dominantOf(groves.length) });
  }

  // FB-08 (A2): violet crowns in violetGrovesMax groves at most, the ones farthest from lanes and the sky lane.
  {
    const clear = (g: Grove): number => Math.min(f.laneGap(g.x, g.z), f.skyDist(g.x, g.z)) - g.radius;
    const keep = new Set(groves.filter((g) => g.violet).sort((a, b) => clear(b) - clear(a) || (a.id < b.id ? -1 : 1)).slice(0, G.violetGrovesMax).map((g) => g.id));
    groves.forEach((g, gi) => {
      if (g.violet && !keep.has(g.id)) groves[gi] = { ...g, violet: false };
    });
  }

  // Trees inside each grove: dart throwing in rank order; one species holds ≥ 70 % (V4), young pines under, 1–2 accents.
  const trees: LayoutItem[] = [];
  const bushes: LayoutItem[] = [];
  const rocks: LayoutItem[] = [];
  const treeOk = (x: number, z: number): boolean =>
    f.laneGap(x, z) >= 3.3 && f.riverEdge(x, z) >= 0.95 && f.slotDist(x, z) >= 3.5 && f.skyDist(x, z) >= 2.7 && f.r(x, z) >= 10.2 && pathGap(x, z) >= 1.1 && pondEdge(x, z) >= 1.2;
  const bushOk = (x: number, z: number): boolean =>
    f.laneGap(x, z) >= 1.3 && f.riverEdge(x, z) >= 0.6 && f.slotDist(x, z) >= 2.8 && f.r(x, z) >= 8 && pathGap(x, z) >= 0.5 && pondEdge(x, z) >= 0.6;
  const heightOf = (proto: string, roll: number, cap: number, under: boolean): number => {
    if (proto === PINE_YOUNG) return Math.min(cap * 0.85, 2.6 + roll * 1.6);
    if (proto === PINE_ROUND) return Math.min(under ? cap * 0.9 : cap, 4.6 + roll * 2.2);
    if (proto === PINE_TALL) return Math.min(under ? cap * 0.9 : cap, 5.6 + roll * 2.2);
    return Math.min(cap, 5.2 + roll * 3);
  };
  const crownOf = (proto: string): number => (proto === PINE_ROUND ? 0.55 : proto.endsWith("violet") ? 0.5 : 0.28);
  const groveTrees = new Map<string, LayoutItem[]>();
  groves.forEach((grove, gi) => {
    const tintBase = TINTS[Math.floor(h(RULE.grove, gi, 77, seed) * TINTS.length)]!;
    const area = Math.PI * grove.radius * grove.radius;
    const want = Math.max(G.minTrees, Math.round(area * G.density));
    const placed: LayoutItem[] = [];
    let violets = 0;
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
      const pick = h(RULE.groveTree, gi * 1000 + attempt, 6, seed);
      const cap = treeCap(f, x, z);
      let proto: string;
      if (grove.violet && rho < 0.6 && pick < 0.3 && violets < G.violetMax) {
        proto = "props/pine-river-tree-violet";
        violets += 1;
      } else if (pick < G.dominantShare) proto = grove.dominant;
      else if (rho > 0.5) proto = PINE_YOUNG;
      else proto = grove.dominant === PINE_ROUND ? PINE_TALL : PINE_ROUND;
      const height = heightOf(proto, roll, cap, rho > 0.55);
      const jitter = 0.94 + h(RULE.groveTree, gi * 1000 + attempt, 4, seed) * 0.12;
      const tint: [number, number, number] = [tintBase[0] * jitter, tintBase[1] * jitter, tintBase[2] * jitter];
      placed.push({ id: grove.id + ":" + placed.length, proto, x, z, k: height, yaw: h(RULE.groveTree, gi * 1000 + attempt, 5, seed) * Math.PI * 2, tint, radius: height * crownOf(proto) });
    }
    trees.push(...placed);
    groveTrees.set(grove.id, placed);
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
      const blossom = h(RULE.rim, gi * 100 + k, 4, seed) < G.blossomShare;
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

  // Lone trees: a few on the open meadow (V1: 1–3), the rest in the transition bands (V5).
  const S = LAYOUT_RULES.solitary;
  const lone: LayoutItem[] = [];
  let openLone = 0;
  for (const c of candidates(f, S.cellM, S.ringM[1], RULE.solitary, seed)) {
    if (lone.length >= S.count) break;
    const r = f.r(c.x, c.z);
    if (r < S.ringM[0] || r > S.ringM[1]) continue;
    if (f.laneGap(c.x, c.z) < S.clearLaneM || f.slotDist(c.x, c.z) < S.clearSlotM || f.skyDist(c.x, c.z) < S.clearSkyM) continue;
    if (f.riverEdge(c.x, c.z) < S.clearRiverM || pathGap(c.x, c.z) < S.clearPathM || pondEdge(c.x, c.z) < S.clearPondM) continue;
    if (groves.some((g) => Math.hypot(g.x - c.x, g.z - c.z) < g.radius + S.clearGroveM)) continue;
    if (lone.some((t) => Math.hypot(t.x - c.x, t.z - c.z) < S.gapM)) continue;
    // FB-11 (A2): only in the transition band, near a grove disc or the forest edge.
    const nearGrove = groves.some((g) => Math.hypot(g.x - c.x, g.z - c.z) - g.radius < S.bandM);
    if (!nearGrove && forestEdge(c.x, c.z) - r > S.bandM) continue;
    const isOpen = inOpen(c.x, c.z);
    if (isOpen && openLone >= S.openMax) continue;
    if (isOpen) openLone += 1;
    const roll = h(RULE.solitary, Math.round(c.x * 10), Math.round(c.z * 10), seed);
    const proto = roll < 0.6 ? PINE_ROUND : PINE_TALL;
    const height = Math.min(treeCap(f, c.x, c.z), proto === PINE_ROUND ? 5 + roll * 2 : 5.8 + roll * 2);
    lone.push({ id: "lone:" + c.cell, proto, x: c.x, z: c.z, k: height, yaw: roll * 40, tint: TINTS[Math.floor(roll * 97) % TINTS.length]!, radius: height * crownOf(proto) });
  }
  trees.push(...lone);

  // V6: one tree in each forest bay (its floor stays open meadow).
  const bayTrees: LayoutItem[] = [];
  bays.forEach((bay, bi) => {
    if (bay.depthM <= 0) return;
    const b = bay.bearingDeg + (h(RULE.solitary, bi, 91, seed) - 0.5) * bay.halfWidthDeg * 0.6;
    const [dx, dz] = LayoutFields.dir(b);
    const r = f.play - E.insideM + bay.depthM * (0.5 + 0.2 * h(RULE.solitary, bi, 92, seed));
    const x = f.cx + dx * r;
    const z = f.cz + dz * r;
    if (!treeOk(x, z) || f.laneGap(x, z) < 5 || f.slotDist(x, z) < 6 || (cliff && cliff.offset(x, z).s > -3 && cliff.offset(x, z).cap > 0.2)) return;
    if ([...trees, ...bayTrees].some((t) => Math.hypot(t.x - x, t.z - z) < 4)) return;
    if (clearings.some((c) => Math.hypot(c.x - x, c.z - z) < c.r + 2.5)) return;
    const roll = h(RULE.solitary, bi, 93, seed);
    const height = 5.4 + roll * 1.8;
    bayTrees.push({ id: "bay:" + bi, proto: PINE_ROUND, x, z, k: height, yaw: roll * 6.283, tint: TINTS[bi % TINTS.length]!, radius: height * 0.55 });
  });
  trees.push(...bayTrees);

  // V7: warm crowns (tinted round trees) at bays, junction-side lone trees and grove outer faces;
  // ≥ 9 m from lanes, slots and the sky lane, ≥ 12 m apart, about 8 % of the trees.
  const W = LAYOUT_RULES.warm;
  const warmIds = new Set<string>();
  // FB-09: the crown's middle (about 0.7 of its height) projected into the home view, inside a HUD box.
  const underHud = (tree: LayoutItem): boolean => {
    const uv = homeViewUv(map, tree.x, tree.k * 0.7, tree.z);
    return uv !== null && W.hud.some(([u0, v0, u1, v1]) => uv[0] >= u0 && uv[0] <= u1 && uv[1] >= v0 && uv[1] <= v1);
  };
  {
    const pool: { item: LayoutItem; score: number }[] = [];
    for (const tree of trees) {
      if (tree.proto !== PINE_ROUND) continue;
      if (f.laneGap(tree.x, tree.z) < W.clearM || f.slotDist(tree.x, tree.z) < W.clearM || f.skyDist(tree.x, tree.z) < W.clearM) continue;
      if (underHud(tree)) continue;
      // One accent colour per spot: no warm crown beside a violet one.
      if (trees.some((t) => t.proto.endsWith("violet") && Math.hypot(t.x - tree.x, t.z - tree.z) < W.violetGapM)) continue;
      let score = h(RULE.rim, Math.round(tree.x * 10), Math.round(tree.z * 10), seed) * 0.3;
      if (tree.id.startsWith("bay:")) score += 2;
      else if (tree.id.startsWith("lone:")) score += pathGap(tree.x, tree.z) < 6 ? 1.5 : 0.6;
      else {
        const grove = groves.find((g) => tree.id.startsWith(g.id + ":"));
        if (!grove || !grove.warm) continue;
        // Outer face: on the far side of the grove from the dais.
        const out = ((tree.x - grove.x) * (grove.x - f.cx) + (tree.z - grove.z) * (grove.z - f.cz)) / Math.max(grove.radius * f.r(grove.x, grove.z), 1e-6);
        if (out < 0.25) continue;
        score += 1 + out;
      }
      // A2: prefer spots the home view shows clear of its edges and the HUD (accents the default frame carries).
      const uv = homeViewUv(map, tree.x, tree.k * 0.7, tree.z);
      if (uv !== null && uv[0] > 0.08 && uv[0] < 0.92 && uv[1] > 0.08 && uv[1] < 0.75) score += 1.6;
      pool.push({ item: tree, score });
    }
    pool.sort((a, b) => b.score - a.score || (a.item.id < b.item.id ? -1 : 1));
    const target = Math.max(W.min, Math.round(trees.length * W.share));
    const taken: LayoutItem[] = [];
    for (const { item } of pool) {
      if (taken.length >= target) break;
      if (taken.some((t) => Math.hypot(t.x - item.x, t.z - item.z) < W.gapM)) continue;
      taken.push(item);
      warmIds.add(item.id);
    }
  }
  // A warm crown is the grove's accent tree: a little larger than its neighbours (the reference's maples), within the height cap.
  const warmTrees = trees.map((tree) => (warmIds.has(tree.id) ? { ...tree, warm: true, k: Math.min(G.capMax, tree.k * W.grow), radius: tree.radius * W.grow } : tree));
  trees.length = 0;
  trees.push(...warmTrees);

  // Rock clusters along the river banks (V13: 2–4 grey stones together, never a white chain).
  const R = LAYOUT_RULES.rocks;
  if (f.river) {
    const line = f.river.line;
    const point = { x: 0, z: 0, dx: 0, dz: 1 };
    for (const side of [-1, 1]) {
      let index = 0;
      for (let s = 0; s < line.length; s += R.river.stepM, index += 1) {
        const key = index * 2 + (side > 0 ? 1 : 0);
        if (h(RULE.rockRiver, key, 1, seed) > R.river.chance) continue;
        line.pointAt(s + h(RULE.rockRiver, key, 3, seed) * R.river.stepM * 0.5, point);
        if (f.r(point.x, point.z) > f.play + R.river.reachM) continue;
        const half = f.riverWidthAt(s) / 2;
        const count = 2 + Math.floor(h(RULE.rockRiver, key, 2, seed) * 3);
        for (let k = 0; k < count; k += 1) {
          const along = (h(RULE.rockRiver, key * 7 + k, 4, seed) - 0.5) * 1.4;
          const off = half + lerp(R.river.offsetM[0], R.river.offsetM[1], h(RULE.rockRiver, key * 7 + k, 5, seed));
          const x = point.x + point.dx * along - point.dz * off * side;
          const z = point.z + point.dz * along + point.dx * off * side;
          if (f.laneGap(x, z) < R.river.clearLaneM || pathGap(x, z) < 0.3) continue;
          const roll = h(RULE.rockRiver, key * 7 + k, 6, seed);
          const proto = roll < 0.7 ? RIVER_STONES : ROCK_SLAB;
          const kk = lerp(R.river.k[0], R.river.k[1], h(RULE.rockRiver, key * 7 + k, 7, seed)) * (k === 0 ? 1 : 0.75);
          rocks.push({ id: "rock:river:" + side + ":" + index + ":" + k, proto, x, z, k: kk, yaw: roll * 6.283, tint: GREY, radius: kk * 0.5 });
        }
      }
    }
  }
  // Small grey clusters by the lane edges, off slots and the plaza.
  f.lanes.forEach((lane, laneIndex) => {
    const point = { x: 0, z: 0, dx: 0, dz: 1 };
    for (const side of [-1, 1]) {
      let index = 0;
      for (let s = 2; s < lane.line.length; s += R.lane.stepM, index += 1) {
        const key = laneIndex * 1000 + index * 2 + (side > 0 ? 1 : 0);
        if (lane.spans.some((span) => s > span.fromM - 2.5 && s < span.toM + 2.5)) continue;
        if (h(RULE.rockLane, key, 1, seed) > R.lane.chance) continue;
        lane.line.pointAt(s, point);
        const count = 2 + Math.floor(h(RULE.rockLane, key, 2, seed) * 2);
        for (let k = 0; k < count; k += 1) {
          const along = (h(RULE.rockLane, key * 5 + k, 3, seed) - 0.5) * 1.0;
          const off = lane.half + lerp(R.lane.offsetM[0], R.lane.offsetM[1], h(RULE.rockLane, key * 5 + k, 4, seed));
          const x = point.x + point.dx * along - point.dz * off * side;
          const z = point.z + point.dz * along + point.dx * off * side;
          if (f.slotDist(x, z) < R.lane.clearSlotM || f.r(x, z) < R.lane.clearDaisM || f.riverEdge(x, z) < 0.3 || pathGap(x, z) < 0.3) continue;
          const roll = h(RULE.rockLane, key * 5 + k, 5, seed);
          const kk = lerp(R.lane.k[0], R.lane.k[1], roll);
          rocks.push({ id: "rock:lane:" + laneIndex + ":" + side + ":" + index + ":" + k, proto: roll < 0.75 ? RIVER_STONES : ROCK_SLAB, x, z, k: kk, yaw: roll * 6.283, tint: GREY, radius: kk * 0.5 });
        }
      }
    }
  });
  // FB-16, FB-18, FB-15 (A2): path dressing (lanterns, fences, the jetty, reeds, the rest spot).
  const dress: LayoutItem[] = [];
  const tangent = { x: 0, z: 0, dx: 0, dz: 1 };
  const dressOk = (x: number, z: number, slotM: number, laneM: number, waterM: number): boolean =>
    f.slotDist(x, z) >= slotM && f.laneGap(x, z) >= laneM && f.riverEdge(x, z) >= waterM && pondEdge(x, z) >= waterM && f.skyDist(x, z) >= 1.5 && f.r(x, z) >= f.map.dais.radiusM + 2.6 && !(cliff && cliff.lift(x, z) > 0.3);
  const halfAt = (path: Footpath, s: number): number => {
    let k = 0;
    while (k < path.line.count - 1 && path.line.cum[k + 1]! < s) k += 1;
    return path.halves[k]!;
  };
  // Wooden Jetty: at the pond end of a main path, its steps on the path end, the deck out over the water.
  let jetty: { ax: number; az: number; bx: number; bz: number } | null = null;
  if (pond) {
    for (const path of footpaths) {
      if (path.tier !== "main" || jetty) continue;
      const last = path.line.count - 1;
      const ex = path.line.xs[last]!;
      const ez = path.line.zs[last]!;
      if (Math.abs(pond.edge(ex, ez)) > 1.2) continue;
      const ul = Math.hypot(pond.x - ex, pond.z - ez) || 1;
      const ux = (pond.x - ex) / ul;
      const uz = (pond.z - ez) / ul;
      const J = DR.jetty;
      const cx = ex + ux * (J.k / 2 - J.landM);
      const cz = ez + uz * (J.k / 2 - J.landM);
      jetty = { ax: ex - ux * J.landM, az: ez - uz * J.landM, bx: ex + ux * (J.k - J.landM), bz: ez + uz * (J.k - J.landM) };
      // In the game a prop faces +z (models.ts turns it): the steps end (+z) on the path, the deck (−z) over the water.
      dress.push({ id: "dress:jetty", proto: JETTY, x: cx, z: cz, k: J.k, yaw: Math.atan2(-ux, -uz), tint: [1, 1, 1], radius: J.k * 0.5, water: J.deckM - J.k * 0.276 });
      // A lantern at the landing, beside the steps.
      const side = h(RULE.dress, 501, 1, seed) < 0.5 ? -1 : 1;
      const lx = ex - ux * 1.4 - uz * side * 1.5;
      const lz = ez - uz * 1.4 + ux * side * 1.5;
      if (dressOk(lx, lz, DR.lantern.clearSlotM, DR.lantern.clearLaneM, 0.3)) dress.push({ id: "dress:lantern:jetty", proto: LANTERN, x: lx, z: lz, k: DR.lantern.k, yaw: Math.atan2(uz * side, -ux * side), tint: [1, 1, 1], radius: 0.4 });
    }
  }
  const jettyGap = (x: number, z: number): number => {
    if (!jetty) return 99;
    const vx = jetty.bx - jetty.ax;
    const vz = jetty.bz - jetty.az;
    const t = Math.min(1, Math.max(0, ((x - jetty.ax) * vx + (z - jetty.az) * vz) / (vx * vx + vz * vz)));
    return Math.hypot(x - jetty.ax - vx * t, z - jetty.az - vz * t);
  };
  // Lantern Post every 9–12 m along each main path, alternating sides, the arm over the path.
  footpaths.forEach((path, pi) => {
    if (path.tier !== "main") return;
    const L = DR.lantern;
    let side = h(RULE.dress, 600 + pi, 1, seed) < 0.5 ? -1 : 1;
    let n = 0;
    for (let s = L.firstM; s < path.line.length - 2.5; n += 1) {
      path.line.pointAt(s, tangent);
      const off = halfAt(path, s) + L.offM;
      let placed = false;
      for (const tryside of [side, -side]) {
        const x = tangent.x - tangent.dz * off * tryside;
        const z = tangent.z + tangent.dx * off * tryside;
        if (!dressOk(x, z, L.clearSlotM, L.clearLaneM, L.clearWaterM) || jettyGap(x, z) < 1.5) continue;
        if (dress.some((d) => d.proto === LANTERN && Math.hypot(d.x - x, d.z - z) < 6)) continue;
        // The lantern's front (+z in the game, its arm) toward the path.
        dress.push({ id: "dress:lantern:" + path.id + ":" + n, proto: LANTERN, x, z, k: L.k * (0.94 + 0.1 * h(RULE.dress, 610 + pi * 50 + n, 2, seed)), yaw: Math.atan2(tangent.dz * tryside, -tangent.dx * tryside), tint: [1, 1, 1], radius: 0.4 });
        placed = true;
        side = -tryside;
        break;
      }
      // Near the dais the first gaps are the shortest (FB-13: denser at the plaza, sparser toward the gates).
      const step = lerp(L.stepM[0], L.stepM[1], h(RULE.dress, 620 + pi * 50 + n, 3, seed));
      s += placed ? step : 2;
    }
  });
  // Rail Fence: both bridgeheads, each side of the lane, along the bank.
  const FN = DR.fence;
  const fenceOk = (x: number, z: number, tx: number, tz: number): boolean => {
    // Both ends and the middle of the section clear of slots, lanes and the water.
    for (const t of [-0.5, 0, 0.5]) {
      const px = x + tx * FN.k * t;
      const pz = z + tz * FN.k * t;
      if (f.slotDist(px, pz) < FN.clearSlotM || f.laneGap(px, pz) < FN.clearLaneM || f.riverEdge(px, pz) < 0.25 || pondEdge(px, pz) < 0.4 || pathGap(px, pz) < 0.15) return false;
    }
    return true;
  };
  const fenceAt = (id: string, x: number, z: number, tx: number, tz: number): void => {
    if (!fenceOk(x, z, tx, tz)) return;
    // The section's long side (model x) along (tx, tz).
    dress.push({ id, proto: FENCE, x, z, k: FN.k, yaw: Math.atan2(-tz, tx), tint: [1, 1, 1], radius: FN.k * 0.5 });
  };
  f.lanes.forEach((lane, laneIndex) => {
    if (!f.river) return;
    const river = f.river.line;
    const hit: Nearest = { dist: 0, along: 0, x: 0, z: 0 };
    const along = { x: 0, z: 0, dx: 0, dz: 1 };
    for (const span of lane.spans) {
      if (span.kind !== "bridge") continue;
      for (const [at, away] of [[span.fromM - FN.bridgeOffM, -1], [span.toM + FN.bridgeOffM, 1]] as const) {
        lane.line.pointAt(at, tangent);
        river.nearest(tangent.x, tangent.z, hit);
        river.pointAt(hit.along, along);
        for (const side of [-1, 1]) {
          // Along the bank (the river's own direction), out from the lane on this side.
          const nx = -tangent.dz * side;
          const nz = tangent.dx * side;
          const dot = along.dx * nx + along.dz * nz;
          if (Math.abs(dot) < 0.3) continue;
          const tx = along.dx * Math.sign(dot);
          const tz = along.dz * Math.sign(dot);
          const start = lane.half / Math.abs(dot) + 0.6;
          let x = tangent.x + tx * (start + FN.k / 2);
          let z = tangent.z + tz * (start + FN.k / 2);
          // Back from the water edge, away from the bridge.
          for (let i = 0; i < 16 && f.riverEdge(x, z) < 0.75; i += 1) {
            x += tangent.dx * away * 0.25;
            z += tangent.dz * away * 0.25;
          }
          fenceAt("dress:fence:bridge:" + laneIndex + ":" + at.toFixed(1) + ":" + side, x, z, tx, tz);
        }
      }
    }
  });
  // …and on the outside of the sharpest main-path bends (≥ 15°).
  footpaths.forEach((path) => {
    if (path.tier !== "main") return;
    const bends: { s: number; turn: number }[] = [];
    const a = { x: 0, z: 0, dx: 0, dz: 1 };
    const b = { x: 0, z: 0, dx: 0, dz: 1 };
    for (let s = 4; s < path.line.length - 4; s += 1) {
      path.line.pointAt(s - 3, a);
      path.line.pointAt(s + 3, b);
      const turn = (Math.atan2(a.dx * b.dz - a.dz * b.dx, a.dx * b.dx + a.dz * b.dz) * 180) / Math.PI;
      if (Math.abs(turn) >= FN.bendDeg) bends.push({ s, turn });
    }
    bends.sort((p, q) => Math.abs(q.turn) - Math.abs(p.turn));
    const taken: number[] = [];
    for (const bend of bends) {
      if (taken.length >= FN.bendsMax) break;
      if (taken.some((s) => Math.abs(s - bend.s) < 6)) continue;
      path.line.pointAt(bend.s, tangent);
      // Outside of the bend: away from the turn direction.
      const side = bend.turn > 0 ? 1 : -1;
      const off = halfAt(path, bend.s) + FN.offM;
      const x = tangent.x - tangent.dz * off * side;
      const z = tangent.z + tangent.dx * off * side;
      const before = dress.length;
      fenceAt("dress:fence:" + path.id + ":" + bend.s, x, z, tangent.dx, tangent.dz);
      if (dress.length > before) taken.push(bend.s);
    }
  });
  // Rest spots: a log seat and a stump in the clearing at a branch path's forest end, a lantern by the path.
  clearings.forEach((c, ci) => {
    const path = footpaths.find((p) => p.tier === "branch" && Math.hypot(p.line.xs[p.line.count - 1]! - c.x, p.line.zs[p.line.count - 1]! - c.z) < 0.1);
    if (!path) return;
    path.line.pointAt(path.line.length - 0.5, tangent);
    const lx = c.x + tangent.dx * 1.6 - tangent.dz * 1.3;
    const lz = c.z + tangent.dz * 1.6 + tangent.dx * 1.3;
    rocks.push({ id: "rest:log:" + ci, proto: "props/pine-river-log", x: lx, z: lz, k: 2.2, yaw: Math.atan2(tangent.dx, tangent.dz) + 1.4, tint: [1, 1, 1], radius: 1.1 });
    const sx = c.x + tangent.dx * 0.4 + tangent.dz * 1.6;
    const sz = c.z + tangent.dz * 0.4 - tangent.dx * 1.6;
    rocks.push({ id: "rest:stump:" + ci, proto: "props/pine-river-stump", x: sx, z: sz, k: 0.85, yaw: ci * 1.7, tint: [1, 1, 1], radius: 0.45 });
    const px = c.x - tangent.dx * 2.2 - tangent.dz * 1.1;
    const pz = c.z - tangent.dz * 2.2 + tangent.dx * 1.1;
    dress.push({ id: "dress:lantern:rest:" + ci, proto: LANTERN, x: px, z: pz, k: DR.lantern.k, yaw: Math.atan2(tangent.dz, -tangent.dx), tint: [1, 1, 1], radius: 0.4 });
    for (let k = 0; k < 3; k += 1) {
      const a = h(RULE.dress, 700 + ci * 10 + k, 1, seed) * 6.283;
      const rr = c.r + 0.3 + h(RULE.dress, 700 + ci * 10 + k, 2, seed) * 0.8;
      bushes.push({ id: "rest:tuft:" + ci + ":" + k, proto: k === 0 ? FLOWER : TUFT, x: c.x + Math.cos(a) * rr, z: c.z + Math.sin(a) * rr, k: 0.6 + 0.2 * h(RULE.dress, 700 + ci * 10 + k, 3, seed), yaw: a, tint: [1, 1, 1], radius: 0.35 });
    }
  });
  // Reed Clumps: on the pond's far shore (away from the dais and the jetty) and in a few slow river reaches.
  if (pond) {
    const RD = DR.reeds;
    let count = 0;
    for (let k = 0; k < 40 && count < RD.pond; k += 1) {
      const s = h(RULE.rockPond, 300 + k, 1, seed) * pond.shore.length;
      const p = pond.shore.pointAt(s);
      const ox = p.x - pond.x;
      const oz = p.z - pond.z;
      const length = Math.hypot(ox, oz) || 1;
      // The far side: facing away from the dais.
      if ((ox * (pond.x - f.cx) + oz * (pond.z - f.cz)) / (length * (f.r(pond.x, pond.z) || 1)) < -0.1) continue;
      const out = -0.15 + h(RULE.rockPond, 300 + k, 2, seed) * 0.4;
      const x = p.x + (ox / length) * out;
      const z = p.z + (oz / length) * out;
      if (jettyGap(x, z) < RD.clearJettyM || pathGap(x, z) < 1 || bushes.some((b) => b.proto === REED && Math.hypot(b.x - x, b.z - z) < 1.1)) continue;
      bushes.push({ id: "reed:pond:" + k, proto: REED, x, z, k: lerp(RD.pondK[0], RD.pondK[1], h(RULE.rockPond, 300 + k, 3, seed)), yaw: h(RULE.rockPond, 300 + k, 4, seed) * 6.283, tint: [1, 1, 1], radius: 0.45 });
      count += 1;
    }
  }
  if (f.river) {
    const RD = DR.reeds;
    const line = f.river.line;
    const point = { x: 0, z: 0, dx: 0, dz: 1 };
    let spots = 0;
    for (let k = 0; k < 60 && spots < RD.riverSpots; k += 1) {
      const s = h(RULE.rockRiver, 900 + k, 1, seed) * line.length;
      line.pointAt(s, point);
      if (f.r(point.x, point.z) > f.play - 2 || f.r(point.x, point.z) < 12) continue;
      const side = h(RULE.rockRiver, 900 + k, 2, seed) < 0.5 ? -1 : 1;
      const half = f.riverWidthAt(s) / 2;
      const cx = point.x - point.dz * (half + 0.05) * side;
      const cz = point.z + point.dx * (half + 0.05) * side;
      if (f.laneGap(cx, cz) < RD.clearLaneM || f.slotDist(cx, cz) < RD.clearSlotM || pathGap(cx, cz) < 1.2 || f.skyDist(cx, cz) < 2) continue;
      if (bushes.some((b) => b.proto === REED && Math.hypot(b.x - cx, b.z - cz) < 8)) continue;
      spots += 1;
      for (let n = 0; n < 3; n += 1) {
        const along = (n - 1) * 0.9 + (h(RULE.rockRiver, 900 + k * 7 + n, 3, seed) - 0.5) * 0.5;
        const x = cx + point.dx * along;
        const z = cz + point.dz * along;
        bushes.push({ id: "reed:river:" + k + ":" + n, proto: REED, x, z, k: lerp(RD.riverK[0], RD.riverK[1], h(RULE.rockRiver, 900 + k * 7 + n, 4, seed)), yaw: n * 2.3 + k, tint: [1, 1, 1], radius: 0.45 });
      }
    }
  }

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
      if (pathGap(fx, fz) < 0.8 || jettyGap(fx, fz) < 1.4) continue;
      const kk = lerp(R.pond.k[0], R.pond.k[1], h(RULE.rockPond, k, 3, seed));
      rocks.push({ id: "rock:pond:" + k, proto: k % 3 === 0 ? ROCK_SLAB : RIVER_STONES, x: fx, z: fz, k: kk, yaw: h(RULE.rockPond, k, 4, seed) * 6.283, tint: GREY, radius: kk * 0.5 });
    }
    for (let k = 0; k < 3; k += 1) {
      const s = ((k + 0.5) / 3) * pond.shore.length;
      const p = pond.shore.pointAt(s);
      const ox = p.x - pond.x;
      const oz = p.z - pond.z;
      const length = Math.hypot(ox, oz) || 1;
      const x = p.x + (ox / length) * 1.5;
      const z = p.z + (oz / length) * 1.5;
      if (!bushOk(x, z) || jettyGap(x, z) < 2) continue;
      bushes.push({ id: "pond:bush" + k, proto: "props/pine-river-bush-moss", x, z, k: 1.6, yaw: k * 2.1, tint: [1, 1, 1], radius: 0.8 });
    }
  }
  // V10: pale scree at each cliff foot; big pale rocks bedded in the tier faces, leaning into the
  // slope at random tiers along the line (a rock mass, never a row of slabs); a few on the top lip.
  const C = LAYOUT_RULES.cliff;
  cliffs.forEach((cl, ci) => {
    const point = { x: 0, z: 0, dx: 0, dz: 1 };
    const inward = (): [number, number] => {
      let nx = -point.dz;
      let nz = point.dx;
      if (nx * (f.cx - point.x) + nz * (f.cz - point.z) < 0) {
        nx = -nx;
        nz = -nz;
      }
      return [nx, nz];
    };
    let index = 0;
    for (let s = C.capM * 0.4; s < cl.line.length - C.capM * 0.4; s += R.cliffFoot.stepM, index += 1) {
      const key = ci * 1000 + index;
      if (h(RULE.rockCliff, key, 1, seed) > R.cliffFoot.chance) continue;
      cl.line.pointAt(s + (h(RULE.rockCliff, key, 4, seed) - 0.5) * R.cliffFoot.stepM, point);
      const [nx, nz] = inward();
      const out = lerp(R.cliffFoot.outM[0], R.cliffFoot.outM[1], h(RULE.rockCliff, key, 2, seed) ** 1.6);
      const x = point.x + nx * out;
      const z = point.z + nz * out;
      if (f.laneGap(x, z) < 3 || f.riverEdge(x, z) < 0.8 || pathGap(x, z) < 0.4) continue;
      const roll = h(RULE.rockCliff, key, 3, seed);
      const k = lerp(R.cliffFoot.k[0], R.cliffFoot.k[1], h(RULE.rockCliff, key, 5, seed)) * (out > 3 ? 0.75 : 1);
      if (h(RULE.rockCliff, key, 6, seed) < R.cliffFoot.blockShare && out < 3.5) {
        // FB-10 (A2): rubble blocks from the cliff at its foot.
        const kb = lerp(R.cliffFoot.blockK[0], R.cliffFoot.blockK[1], h(RULE.rockCliff, key, 5, seed));
        rocks.push({ id: "rock:cliff:" + ci + ":" + index, proto: CLIFF_B, x, z, k: kb, yaw: roll * 6.283, tint: [1, 1, 1], radius: kb * 0.45, stone: true, sinkShare: 0.25 });
        continue;
      }
      const proto = roll < 0.6 ? ROCK_SLAB : RIVER_STONES;
      rocks.push({ id: "rock:cliff:" + ci + ":" + index, proto, x, z, k, yaw: roll * 6.283, tint: [1, 1, 1], radius: k * 0.5, stone: true });
    }
    // FB-10 (A2): tiered faces of Cliff Rock blocks (no round boulders on the faces).
    const F = R.cliffFace;
    const ends = (s: number): number => smooth(0, C.capM, s) * smooth(cl.line.length, cl.line.length - C.capM, s);
    for (let tier = 0; tier < cl.tiers; tier += 1) {
      let k2 = 0;
      // Irregular steps, a few gaps, a few tall blocks over two tiers: a rock face, not a wall of equal blocks.
      for (let s = C.capM * 0.35 + h(RULE.rockCliff, ci * 7 + tier, 21, seed) * F.stepM[0]; s < cl.line.length - C.capM * 0.35; s += lerp(F.stepM[0], F.stepM[1], h(RULE.rockCliff, ci * 100000 + tier * 1000 + k2, 20, seed)), k2 += 1) {
        const key = ci * 100000 + tier * 1000 + k2;
        if (h(RULE.rockCliff, key, 26, seed) < F.skip) continue;
        const along = s;
        cl.line.pointAt(along, point);
        const [ix, iz] = inward();
        const fade = ends(along);
        if (fade < 0.25) continue;
        // The block's centre a little into the face: its front stands on the ledge below, its back in the face.
        const wantS = cl.faceS(along, tier) + F.intoM;
        let x = point.x - ix * wantS;
        let z = point.z - iz * wantS;
        const off = cl.offset(x, z).s;
        x -= ix * (wantS - off);
        z -= iz * (wantS - off);
        if (f.laneGap(x, z) < 3 || f.riverEdge(x, z) < 1) continue;
        const wide = h(RULE.rockCliff, key, 23, seed) < (tier === 0 ? F.footWide : F.upperWide);
        const tall = !wide && tier < cl.tiers - 1 && h(RULE.rockCliff, key, 30, seed) < F.tall;
        const tierH = cl.tierM * (0.55 + 0.45 * fade) * (tall ? F.tallK : 1);
        const proto = wide ? CLIFF_B : CLIFF_A;
        const k = wide ? (tierH / CLIFF_B_H) * 0.5 * lerp(F.kB[0], F.kB[1], h(RULE.rockCliff, key, 24, seed)) : tierH * lerp(F.kA[0], F.kA[1], h(RULE.rockCliff, key, 24, seed));
        const height = wide ? k * CLIFF_B_H : k;
        // Sink so the base meets the ledge in front (the slope under the centre is higher).
        const fx = x + ix * 0.9;
        const fz = z + iz * 0.9;
        const sink = Math.max(0, cl.lift(x, z) - cl.lift(fx, fz)) + 0.12;
        // The block's front (+z in the game) toward the dais.
        const yaw = Math.atan2(ix, iz) + (h(RULE.rockCliff, key, 25, seed) - 0.5) * 2 * F.yawJitter;
        rocks.push({
          id: "rock:cliff-face:" + ci + ":" + tier + ":" + k2,
          proto,
          x,
          z,
          k,
          yaw,
          tint: [1, 1, 1],
          radius: k * 0.45,
          stone: true,
          sinkShare: Math.min(0.6, sink / Math.max(height, 0.5)),
          // Tall blocks widened into a face (a row of narrow pillars read as headstones).
          ...(wide ? {} : { stretch: lerp(F.stretchA[0], F.stretchA[1], h(RULE.rockCliff, key, 29, seed)) }),
          tilt: [(h(RULE.rockCliff, key, 27, seed) - 0.5) * 2 * F.leanRad, (h(RULE.rockCliff, key, 28, seed) - 0.5) * 2 * F.leanRad],
        });
      }
    }
    // A few wide blocks along the top lip, so the top edge reads as rock, not a grass bank.
    let k3 = 0;
    for (let s = C.capM * 0.6; s < cl.line.length - C.capM * 0.6; s += F.lipStepM, k3 += 1) {
      const key = ci * 1000 + k3;
      cl.line.pointAt(s + (h(RULE.rockCliff, key, 41, seed) - 0.5) * F.lipStepM * 0.6, point);
      const [ix, iz] = inward();
      const wantS = cl.topS + 0.4;
      let x = point.x - ix * wantS;
      let z = point.z - iz * wantS;
      const off = cl.offset(x, z).s;
      x -= ix * (wantS - off);
      z -= iz * (wantS - off);
      if (f.riverEdge(x, z) < 1.5) continue;
      const k = lerp(F.lipK[0], F.lipK[1], h(RULE.rockCliff, key, 42, seed)) * (0.6 + 0.4 * ends(s));
      rocks.push({ id: "rock:cliff-lip:" + ci + ":" + k3, proto: CLIFF_B, x, z, k, yaw: Math.atan2(ix, iz) + (h(RULE.rockCliff, key, 43, seed) - 0.5) * 0.8, tint: [1, 1, 1], radius: k * 0.45, stone: true, sinkShare: 0.35 });
    }
  });
  // LG1: a fallen log beside the Cầu trail past its gate (the gate's forest gap has a story).
  f.lanes.forEach((lane, laneIndex) => {
    if (laneIndex !== 0) return;
    const [gx, gz] = [lane.trail.xs[1]!, lane.trail.zs[1]!];
    const dx = (lane.trail.xs[0]! - gx) / lane.trail.length;
    const dz = (lane.trail.zs[0]! - gz) / lane.trail.length;
    const x = gx + dx * 6.5 - dz * (lane.half + 2.4);
    const z = gz + dz * 6.5 + dx * (lane.half + 2.4);
    rocks.push({ id: "gate:log:" + laneIndex, proto: "props/pine-river-log", x, z, k: 2.8, yaw: Math.atan2(dx, dz) + 0.35, tint: [1, 1, 1], radius: 1.4 });
  });

  // V5: meadow dots (small bushes), off every lane, slot, path, grove and tree.
  {
    const D = LAYOUT_RULES.dots;
    const dots: LayoutItem[] = [];
    for (const c of candidates(f, D.cellM, f.play, RULE.dots, seed)) {
      if (dots.length >= D.max) break;
      const r = f.r(c.x, c.z);
      if (r < D.daisM || r > forestEdge(c.x, c.z) - 1.5) continue;
      const roll = h(RULE.dots, Math.round(c.x * 10), Math.round(c.z * 10), seed);
      if (roll > (inOpen(c.x, c.z) ? D.openChance : D.chance)) continue;
      if (f.laneGap(c.x, c.z) < D.clearLaneM || f.slotDist(c.x, c.z) < D.clearSlotM || f.skyDist(c.x, c.z) < D.clearSkyM) continue;
      if (f.riverEdge(c.x, c.z) < D.clearWaterM || pondEdge(c.x, c.z) < D.clearWaterM || pathGap(c.x, c.z) < D.clearPathM) continue;
      if (cliff && cliff.lift(c.x, c.z) > 0.2) continue;
      if (groves.some((g) => Math.hypot(g.x - c.x, g.z - c.z) < g.radius + 1)) continue;
      if (trees.some((t) => Math.hypot(t.x - c.x, t.z - c.z) < t.radius + D.clearTreeM)) continue;
      // FB-11 (A2): only in the band by a grove disc or the forest edge, never loose on the meadow.
      if (!groves.some((g) => Math.hypot(g.x - c.x, g.z - c.z) - g.radius < D.nearM) && forestEdge(c.x, c.z) - r > D.nearM) continue;
      if ([...dots, ...rocks].some((t) => Math.hypot(t.x - c.x, t.z - c.z) < D.gapM)) continue;
      const k = lerp(D.k[0], D.k[1], h(RULE.dots, Math.round(c.x * 10), Math.round(c.z * 10), seed + 1));
      // Deep green (the moss bush model is yellow-green), each on a small worn halo (paint below).
      const shade = 0.9 + 0.12 * roll;
      dots.push({ id: "dot:" + c.cell, proto: "props/pine-river-bush-moss", x: c.x, z: c.z, k, yaw: roll * 37.7, tint: [0.62 * shade, 0.8 * shade, 0.62 * shade], radius: k * 0.45 });
    }
    bushes.push(...dots);
  }

  // L7 dirt stamps (V3: lobed patches, centre pushed to the shade side): plaza, canopy dirt, lone and bay
  // trees, junctions, lane crossings, lane scuffs, cliff scree.
  const P = LAYOUT_RULES.paint;
  const dirt: PaintDisc[] = [];
  const blob = (x: number, z: number, r: number, falloff: number, strength: number, key: number, shade: number): PaintDisc => {
    const lobes = 3 + Math.floor(h(RULE.scuff, key, 31, seed) * 3);
    return {
      x: x + shadeX * r * shade,
      z: z + shadeZ * r * shade,
      r,
      falloff,
      strength,
      lobes,
      wobble: P.wobble[0] + (P.wobble[1] - P.wobble[0]) * h(RULE.scuff, key, 32, seed),
      phase: h(RULE.scuff, key, 33, seed) * 6.283,
      stretch: 1 + 0.35 * h(RULE.scuff, key, 34, seed),
      angle: h(RULE.scuff, key, 35, seed) * Math.PI,
    };
  };
  dirt.push({ ...blob(f.cx, f.cz, P.plazaM, P.plazaFalloffM, 1, 1, 0), stretch: 1, wobble: 0.08, lobes: 5 });
  groves.forEach((grove, gi) => dirt.push(blob(grove.x, grove.z, grove.radius * P.groveDirt, 1.6, 0.9, 100 + gi, P.shadeShift)));
  trees.forEach((tree, ti) => {
    const free = tree.id.startsWith("lone:") || tree.id.startsWith("bay:");
    const r = free ? P.loneDirtM : Math.max(1.1, tree.radius * P.canopyDirt);
    dirt.push(blob(tree.x, tree.z, r, P.canopyFalloffM, 1, 300 + ti, P.shadeShift));
  });
  footpaths.forEach((path, pi) => {
    for (const end of [0, path.line.count - 1]) {
      const x = path.line.xs[end]!;
      const z = path.line.zs[end]!;
      // Junctions, the plaza mouth and inner destinations get a trodden patch; forest ends fade out instead,
      // unless a rest spot is there (FB-18, A2).
      const rest = clearings.find((c) => Math.hypot(c.x - x, c.z - z) < 0.1);
      if (rest) {
        dirt.push(blob(x, z, rest.r, 1.2, 0.85, 700 + pi * 2 + end, P.shadeShift * 0.5));
        continue;
      }
      if (f.r(x, z) > f.play + 4) continue;
      dirt.push(blob(x, z, path.tier === "main" ? P.junctionM * 1.25 : P.junctionM, 1.2, 0.75, 700 + pi * 2 + end, 0));
    }
  });
  f.lanes.forEach((lane, laneIndex) => {
    for (const span of lane.spans) {
      for (const at of [span.fromM - 1.2, span.toM + 1.2]) {
        const p = lane.line.pointAt(at);
        dirt.push(blob(p.x, p.z, P.crossingM, 1.5, 0.9, 800 + laneIndex * 10 + Math.round(at), 0));
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
        dirt.push(blob(point.x - point.dz * off * side, point.z + point.dx * off * side, r, 0.8, 0.62, 900 + laneIndex * 100 + index, 0));
      }
      s += lerp(P.scuffStepM[0], P.scuffStepM[1], h(RULE.scuff, laneIndex * 100 + index, 4, seed));
    }
  });
  // V3: a pale halo under each meadow dot, no dirt core (the reference's bushes sit on pale rings).
  bushes.forEach((bush, bi) => {
    if (!bush.id.startsWith("dot:")) return;
    dirt.push(blob(bush.x, bush.z, bush.radius * 1.6, 0.9, 0.43, 1500 + bi, 0));
  });
  cliffs.forEach((cl, ci) => {
    const point = { x: 0, z: 0, dx: 0, dz: 1 };
    let index = 0;
    for (let s = 3; s < cl.line.length - 3; s += 2.4, index += 1) {
      cl.line.pointAt(s, point);
      let nx = -point.dz;
      let nz = point.dx;
      if (nx * (f.cx - point.x) + nz * (f.cz - point.z) < 0) {
        nx = -nx;
        nz = -nz;
      }
      const key = 2000 + ci * 100 + index;
      const out = 1.5 + h(RULE.rockCliff, key, 7, seed) * 2.5;
      const x = point.x + nx * out;
      const z = point.z + nz * out;
      if (f.riverEdge(x, z) < 1 || f.laneGap(x, z) < 2) continue;
      dirt.push(blob(x, z, 2 + h(RULE.rockCliff, key, 8, seed) * 1.6, 1.4, 0.8, key, 0));
    }
  });

  return {
    fields: f,
    pond,
    cliff,
    cliffs,
    forestEdge,
    footpaths,
    groves,
    trees,
    bushes,
    rocks,
    dirt,
    dress,
    clearings,
    pathGap,
    stats: {
      groves: groves.length,
      groveTrees: trees.length - lone.length - bayTrees.length,
      loneTrees: lone.length,
      openLone,
      bayTrees: bayTrees.length,
      warmTrees: warmIds.size,
      bushes: bushes.length,
      rocks: rocks.length,
      footpaths: footpaths.length,
      dirtStamps: dirt.length,
      dress: dress.length,
      lanterns: dress.filter((d) => d.proto === LANTERN).length,
      fences: dress.filter((d) => d.proto === FENCE).length,
      reeds: bushes.filter((b) => b.proto === REED).length,
      cliffBlocks: rocks.filter((r) => r.proto === CLIFF_A || r.proto === CLIFF_B).length,
    },
  };
}
