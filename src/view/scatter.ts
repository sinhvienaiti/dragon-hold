/**
 * Pine-river scatter for the grey box: primitive placeholder trees, rocks and
 * bushes (cones, spheres; BatchedMesh or instancing), kept off lanes, slots,
 * water and the dais; impostor ring outside the play area. Real props come
 * as the owner's GLB later.
 * Five instanced meshes (cones, trunks, round crowns, bushes, rocks): a
 * seeded plan from the terrain's forest density, sparse clumps inside the
 * play area, a dense ring in the skirt that sinks into the mist.
 * M0b: once the owner's pine-river kit loads (view/models.ts), every item
 * inside the play area and the near skirt becomes one of its GLB props
 * (K01–K11, one instanced mesh per prop, painted like the rest: ramp light,
 * wind sway on trees and bushes, 35 % dither where they hide a lane, rim,
 * mist); the far ring keeps its primitive cones in the mist. Colour fixes of
 * the provisional props are paint here (K03 trunk, K04 violet and cream,
 * K07 moss), never a new texture.
 * Owner: view-terrain (LANES.md).
 */
import * as THREE from "three";
import type { Quality } from "../app/contracts";
import type { MapDef } from "../content/types";
import { PROP_SPECS, type PropSpec, type ScatterKind } from "./model-specs";
import type { PropModel } from "./models";
import { homeViewUv, LAYOUT_RULES, type LayoutItem } from "./layout";
import { bakeImpostors, farRing, type FarItem, type ImpostorAtlas } from "./impostor";
import { mapSwitch } from "./paint";
import { hash2, Polyline, paintMaterial, seededRandom, type HeightField, type PaintedTerrain } from "./terrain";

export interface ScatterView {
  readonly group: THREE.Group;
  /** Swaps the near items for the owner's GLB props (M0b); a prop that did not load keeps its primitives. Once. */
  useProps(prop: (manifest: string) => PropModel | null, renderer?: THREE.WebGLRenderer): void;
  /** Triangles of one drawing of the scatter (no shadow pass), and how many items are GLB props. */
  stats(): { triangles: number; props: number; primitives: number };
  dispose(): void;
}

/** GLB props reach this far past the play radius (the near skirt); the far ring stays primitive in the mist. */
export const PROP_NEAR_SKIRT_M = 6;

/**
 * Map spike bands: inside the play area only the layout's groves, lone trees,
 * rim clutter and rock lines stand (view/layout.ts); the even scatter starts
 * at the forest edge (EDGE_IN metres inside the play radius). Every item is a
 * kit prop: near band (to the near skirt) full model with shadows, mid band
 * full model without shadows, far band (past FAR_FROM) impostor quads
 * (view/impostor.ts). A runtime SimplifyModifier copy for the mid band was
 * tried and dropped: the Tripo meshes split at UV seams and fell apart.
 */
export const EDGE_IN_M = 2;
/**
 * Trees past this radius draw as impostors (one atlas, one draw call); bushes and the even
 * scatter's rocks there are left out (only layout rocks, such as the cliff's, stay full models).
 * 46 m measured 677 k prop triangles; 42 m keeps the map under the 0.55 M High budget (MAP_FACTORY 4.2).
 */
export const FAR_FROM_M = 42;

/**
 * V10, V13 (map pilot): every rock prop pale grey from its own shading (moss and texture hue dropped,
 * so no mossy "eggs" and no white chains), darker toward its foot, a faint cool/warm drift by place.
 * One paint for cliff, river, lane and forest stones keeps one draw call a rock prop.
 */
const STONE_PAINT =
  "float dhL = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11)); vec3 dhG = vec3(0.43, 0.425, 0.41) * clamp(0.35 + dhL * 1.8, 0.42, 1.0); dhG *= mix(0.6, 1.06, smoothstep(-0.7, 0.6, vDhLocal.y)); dhG = mix(dhG, dhG * vec3(0.92, 0.96, 1.05), smoothstep(0.3, 0.7, dhNoise(vDhWorld.xz * 0.3))); diffuseColor.rgb = dhG;";

/** Map pilot A2: cliff blocks pale warm stone; the dark sides lift (floor 0.55), the face darker toward its foot. */
const CLIFF_PAINT =
  "float dhL = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11)); vec3 dhG = vec3(0.5, 0.49, 0.465) * clamp(0.45 + dhL * 1.7, 0.55, 1.05); dhG *= mix(0.72, 1.05, smoothstep(0.0, 0.85, vDhLocal.y)); dhG = mix(dhG, dhG * vec3(0.94, 0.97, 1.04), smoothstep(0.3, 0.7, dhNoise(vDhWorld.xz * 0.21))); diffuseColor.rgb = dhG;";

/** Paint fixes of the provisional props (ART_REPLACE_LATER): GLSL on diffuseColor, vDhLocal in model metres. */
const PROP_PAINT: Readonly<Record<string, string>> = {
  // K03: a warm brown trunk instead of near black; V13 (map pilot): needles a step lighter, as the tall pine.
  "props/pine-river-pine-young":
    "float dhL = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11)); float dhTrunk = 1.0 - smoothstep(0.16, 0.26, vDhLocal.y); diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.42, 0.3, 0.2) * (0.6 + dhL * 1.6), dhTrunk * 0.75); float dhLeaf = smoothstep(-0.01, 0.05, diffuseColor.g - diffuseColor.r) * (1.0 - dhTrunk); diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.0, 1.1, 0.8) * (1.1 + 0.3 * smoothstep(0.3, 1.0, vDhLocal.y)), dhLeaf);",
  // K04: the indigo half of the crown toward #8E7CC3, the grey trunk cream.
  "props/pine-river-tree-violet":
    "float dhL = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11)); float dhTrunk = 1.0 - smoothstep(0.3, 0.42, vDhLocal.y); diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.276, 0.204, 0.555) * (dhL / 0.264) * 1.1, 0.85 * (1.0 - dhTrunk)); diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.88, 0.76) * (0.45 + dhL), dhTrunk * 0.6);",
  // V13 (map pilot): pine needles toward hue 120–150, the top a step lighter, so the forest is no dark teal wall.
  "props/pine-river-pine-tall":
    "float dhLeaf = smoothstep(-0.01, 0.05, diffuseColor.g - diffuseColor.r); float dhTop = smoothstep(0.3, 1.0, vDhLocal.y); diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.0, 1.12, 0.78) * (1.24 + 0.42 * dhTop), dhLeaf);",
  // K07 (moss close to the withered #C8D24A) is gone with the moss: rocks are pale stone (map pilot V10, V13).
  "props/pine-river-rock-boulder": STONE_PAINT,
  "props/pine-river-rock-slab": STONE_PAINT,
  "props/pine-river-river-stones": STONE_PAINT,
  // Map pilot A2 (FB-10): the Tripo round 3 cliff blocks pale stone, a step lighter than the scatter stones
  // (cliff-rock-b's texture is near charcoal on its sides).
  "props/pine-river-cliff-rock-a": CLIFF_PAINT,
  "props/pine-river-cliff-rock-b": CLIFF_PAINT,
  // Reed plumes beige as the picture (Tripo made them grey-white), leaves a step lighter and yellower.
  "props/pine-river-reed-clump":
    "float dhL = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11)); float dhS = max(max(diffuseColor.r, diffuseColor.g), diffuseColor.b) - min(min(diffuseColor.r, diffuseColor.g), diffuseColor.b); float dhPlume = smoothstep(0.1, 0.25, dhL) * (1.0 - smoothstep(0.05, 0.14, dhS)); diffuseColor.rgb = mix(diffuseColor.rgb * vec3(1.08, 1.18, 0.82) * 1.25, vec3(0.62, 0.5, 0.33) * (0.55 + dhL * 1.1), dhPlume * 0.85);",
  // The small clumps a step lighter (their leaves came out darker than the pictures).
  "props/pine-river-grass-tuft": "diffuseColor.rgb *= vec3(1.06, 1.12, 0.9) * 1.15;",
  "props/pine-river-wildflower-clump": "diffuseColor.rgb *= vec3(1.06, 1.12, 0.95) * 1.12;",
};

/**
 * V7 (map pilot): warm crowns from the round tree, maple red to rust by place (FB-09, A2: hue 10–20° lit, so
 * every warm crown is the same accent family, never a bright orange beside the red); the trunk stays.
 * Albedo kept at S ≤ 0.7, V ≤ 0.7 (lit, the sunny side reads red-orange like the reference's maples);
 * ΔE2000 ≥ 20 from #FF4A4A, #FFB020, #FFC83A and the withered #C8D24A (darker and less saturated).
 */
const WARM_CROWN =
  "float dhL = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11)); float dhLeaf = smoothstep(-0.01, 0.05, diffuseColor.g - diffuseColor.r); float dhOrange = smoothstep(0.38, 0.62, dhNoise(vDhWorld.xz * 0.05 + 3.0)); vec3 dhDark = mix(vec3(0.2, 0.035, 0.018), vec3(0.24, 0.052, 0.016), dhOrange); vec3 dhLight = mix(vec3(0.42, 0.075, 0.035), vec3(0.45, 0.105, 0.033), dhOrange); diffuseColor.rgb = mix(diffuseColor.rgb, mix(dhDark, dhLight, smoothstep(0.03, 0.3, dhL)), dhLeaf);";



/** Mip bias of foliage colour maps (map pilot; A2: a step softer, leaf masses over leaf noise). */
const FOLIAGE_MAP_BIAS = 2.7;

/** A placed placeholder, metres. `size`: height for pines, crown radius for round trees and bushes, rock radius. */
export interface ScatterItem {
  readonly x: number;
  readonly z: number;
  readonly y: number;
  readonly size: number;
  readonly yaw: number;
  readonly color: string;
  /** Map spike: the kit prop this item draws as (layout items), else picked by kind and share. */
  readonly proto?: string;
  /** Map spike: instance tint multiplied into the texture. */
  readonly tint?: readonly [number, number, number];
  /** Map pilot V7: a round crown painted warm (red, orange). */
  readonly warm?: boolean;
  /** Map pilot V10: a cliff rock (beds deeper into the slope). */
  readonly stone?: boolean;
  /** Map pilot: tilt about x and z, radians (cliff rocks lean into the face). */
  readonly tilt?: readonly [number, number];
  /** Map pilot A2: share of the model's height sunk into the ground (overrides the kind's default). */
  readonly sinkShare?: number;
  /** Map pilot A2: extra scale along the model's own x (cliff blocks widened into a face). */
  readonly stretch?: number;
}

export interface ScatterPlan {
  readonly pines: readonly ScatterItem[];
  readonly crowns: readonly ScatterItem[];
  readonly bushes: readonly ScatterItem[];
  readonly rocks: readonly ScatterItem[];
  /** Map pilot A2: lanterns, fences, the jetty (layout only, no primitive). */
  readonly dress: readonly ScatterItem[];
}

/** Clearances (metres past the lane edge, the water edge, slot centres, the dais centre). */
export const SCATTER_CLEAR = {
  treeLaneInside: 3.2,
  treeLaneOutside: 2.0,
  bushLane: 1.1,
  rockLane: 0.6,
  treeWater: 0.9,
  bushWater: 0.5,
  treeSlot: 3.4,
  bushSlot: 2.6,
  treeDais: 10,
  bushDais: 7.8,
  skyLane: 2.6,
} as const;

/** Grid cell per kind and quality (bigger cells: fewer instances). */
const CELLS: Readonly<Record<Quality, { tree: number; bush: number; rock: number; reach: number }>> = {
  low: { tree: 3.6, bush: 3.2, rock: 5, reach: 86 },
  medium: { tree: 3.0, bush: 2.6, rock: 4.4, reach: 92 },
  high: { tree: 2.6, bush: 2.2, rock: 4, reach: 96 },
  ultra: { tree: 2.4, bush: 2.0, rock: 3.6, reach: 102 },
};

const PINE_GREENS = ["#3f6e5c", "#4a7b5e", "#35605a", "#557f57"] as const;
/** Pine blue and violet crowns, only far from the paths (05 §2.2). */
const PINE_FAR = ["#4d6b7d", "#57648a", "#4a6a77"] as const;
const CROWN_NEAR = ["#6f9a4f", "#5a8a5c", "#82a656", "#4f7f60"] as const;
const CROWN_FAR = ["#8e7cc3", "#6c8fd1", "#7d7fb8", "#8a82b4"] as const;
/** Props too small to cast a useful shadow (MAP_FACTORY 4.2: clutter casts none). */
const SMALL_PROPS = new Set(["props/pine-river-river-stones", "props/pine-river-stump", "props/pine-river-log", "props/pine-river-rock-slab", "props/pine-river-grass-tuft", "props/pine-river-wildflower-clump"]);
/** Map spike: share of forest-ring crowns (≥ 9 m off a lane edge) that turn violet (M0b 0.4; spike 0.18; FB-08, A2: ≤ 0.08). */
const FAR_CROWN_SHARE = 0.07;
/** FB-08 (A2): violet crowns this far apart (and from the layout's), so the accent never repeats at every angle. */
const VIOLET_GAP_M = 26;
/** FB-09 (A2): warm crowns at the forest edge this far from each other and from a violet crown, and from the sky lane. */
const WARM_GAP_M = 16;
const WARM_VIOLET_GAP_M = 16;
const WARM_SKY_M = 10;
const WARM_EDGE_MAX = 6;
/** FB-03 (A2): the first metres past the forest edge are thinned and mostly round crowns (a ragged, lit broadleaf fringe, not a pine wall). */
const FRINGE_M = 10;
const FRINGE_SKIP = 0.55;
/** Far crown colours the GLB violet crown (K04) takes over. */
const FAR_COLORS = CROWN_FAR;
const BUSH = ["#5d8f4f", "#6f9d55", "#4d7f5a", "#7aa35e"] as const;
const ROCK = ["#9a95a8", "#8b8698", "#a7a2ad"] as const;

const pick = <T>(list: readonly T[], random: () => number): T => list[Math.floor(random() * list.length) % list.length]!;

/** Seeded placement for the map's scatter; pure apart from the field queries. */
export function planScatter(field: HeightField, quality: Quality): ScatterPlan {
  // Spike perf split: ?decor=0 is the empty ground (no trees, bushes, rocks anywhere).
  if (mapSwitch("decor") === "0") return { pines: [], crowns: [], bushes: [], rocks: [], dress: [] };
  const map = field.map;
  const [cx, cz] = map.dais.center;
  const play = map.terrain.playRadiusM;
  const cells = CELLS[quality];
  const random = seededRandom(map.terrain.seed ^ 0x5ca7);
  const sky = map.sky.map((lane) => new Polyline(lane.points));
  const nearest = { dist: 0, along: 0, x: 0, z: 0 };
  const skyDist = (x: number, z: number): number => {
    let best = Infinity;
    for (const line of sky) best = Math.min(best, line.nearest(x, z, nearest, 6).dist);
    return best;
  };
  const slotDist = (x: number, z: number, houseOnly: boolean): number => {
    let best = Infinity;
    for (const slot of map.slots) {
      if (houseOnly && slot.kind !== "house") continue;
      best = Math.min(best, Math.hypot(x - slot.pos[0], z - slot.pos[1]));
    }
    return best;
  };
  const sinkY = (x: number, z: number, sink: number): number => field.ground(x, z) - sink;

  const pines: ScatterItem[] = [];
  const crowns: ScatterItem[] = [];
  const bushes: ScatterItem[] = [];
  const rocks: ScatterItem[] = [];
  const dress: ScatterItem[] = [];

  const visit = (cell: number, each: (x: number, z: number, r: number) => void): void => {
    const steps = Math.ceil(cells.reach / cell);
    for (let j = -steps; j <= steps; j += 1) {
      for (let i = -steps; i <= steps; i += 1) {
        const x = cx + (i + random() * 0.9 - 0.45) * cell;
        const z = cz + (j + random() * 0.9 - 0.45) * cell;
        const r = Math.hypot(x - cx, z - cz);
        if (r > cells.reach) continue;
        each(x, z, r);
      }
    }
  };

  const layout = field.layout;
  // V6: the skirt forest starts at the layout's forest edge (bays, headlands, noise; EDGE_IN_M inside the play radius by default).
  const edgeAt = (x: number, z: number): number => layout.forestEdge(x, z);
  const onCliffFace = (x: number, z: number): boolean => {
    if (!layout.cliff) return false;
    const { s, cap } = layout.cliff.offset(x, z);
    return cap > 0.2 && s > -4 && s < layout.cliff.topS + 1.5;
  };
  // V7: warm crowns at the forest edge too, 12 m from each other and from the layout's warm trees.
  const warmSpots: { x: number; z: number }[] = layout.trees.filter((tree) => tree.warm).map((tree) => ({ x: tree.x, z: tree.z }));
  const violetSpots: { x: number; z: number }[] = layout.trees.filter((tree) => tree.proto.endsWith("violet")).map((tree) => ({ x: tree.x, z: tree.z }));
  const underHud = (x: number, y: number, z: number): boolean => {
    const uv = homeViewUv(map, x, y, z);
    return uv !== null && LAYOUT_RULES.warm.hud.some(([u0, v0, u1, v1]) => uv[0] >= u0 && uv[0] <= u1 && uv[1] >= v0 && uv[1] <= v1);
  };
  const warmCandidates: number[] = [];
  const inClearing = (x: number, z: number, pad: number): boolean => layout.clearings.some((c) => Math.hypot(c.x - x, c.z - z) < c.r + pad);

  // Trees: pines and round crowns by forest density, from the forest edge out (the layout owns the inside).
  visit(cells.tree, (x, z, r) => {
    const roll = random();
    const density = field.forest(x, z);
    if (roll > density) return;
    const edge = edgeAt(x, z);
    if (r < edge + (hash2(Math.round(x * 3), Math.round(z * 3), 0x1ed6) - 0.5) * 2) return;
    if (onCliffFace(x, z) || layout.pathGap(x, z) < 1.2 || inClearing(x, z, 1.5)) return;
    // FB-03: a thinner fringe in the first metres past the edge.
    const fringe = r < edge + FRINGE_M;
    if (fringe && hash2(Math.round(x * 4), Math.round(z * 4), 0xf41e) < FRINGE_SKIP * (1 - (r - edge) / FRINGE_M)) return;
    const inside = r < play + 2;
    const lane = field.laneAt(x, z);
    const laneGap = lane.dist - lane.half;
    if (laneGap < (inside ? SCATTER_CLEAR.treeLaneInside : SCATTER_CLEAR.treeLaneOutside)) return;
    if (field.riverEdge(x, z) < SCATTER_CLEAR.treeWater) return;
    if (r < SCATTER_CLEAR.treeDais) return;
    if (slotDist(x, z, false) < SCATTER_CLEAR.treeSlot) return;
    if (inside && skyDist(x, z) < SCATTER_CLEAR.skyLane) return;
    const far = laneGap > 9 && r > play - 4;
    const yaw = random() * Math.PI * 2;
    // Round crowns light the forest edge (the reference's broadleaf rim); pines deeper in.
    if (random() < (inside || fringe ? 0.7 : r < edge + 14 ? 0.45 : 0.3)) {
      const size = inside ? 1.3 + random() * 0.9 : 1.8 + random() * 1.3;
      let color = far && random() < FAR_CROWN_SHARE ? pick(CROWN_FAR, random) : pick(CROWN_NEAR, random);
      if ((CROWN_FAR as readonly string[]).includes(color)) {
        // FB-08 (A2): violet only deeper in the forest (past the near skirt), never on the lit fringe.
        if (r < play + PROP_NEAR_SKIRT_M + 2 || violetSpots.some((spot) => Math.hypot(spot.x - x, spot.z - z) < VIOLET_GAP_M) || warmSpots.some((spot) => Math.hypot(spot.x - x, spot.z - z) < WARM_VIOLET_GAP_M)) color = CROWN_NEAR[0];
        else violetSpots.push({ x, z });
      }
      // V7: a warm candidate on the lit fringe; the warm ones are picked after the visit (spacing, home view).
      if (
        !(CROWN_FAR as readonly string[]).includes(color) &&
        r < edge + 7 &&
        r < FAR_FROM_M - 1 &&
        laneGap >= 10 &&
        slotDist(x, z, false) >= 10 &&
        skyDist(x, z) >= WARM_SKY_M &&
        !underHud(x, size * 2.2, z)
      )
        warmCandidates.push(crowns.length);
      crowns.push({ x, z, y: sinkY(x, z, 0.1), size, yaw, color });
    } else {
      const size = inside ? 3.4 + random() * 2.2 : 4.6 + random() * 4.6;
      const color = far && random() < 0.22 ? pick(PINE_FAR, random) : pick(PINE_GREENS, random);
      pines.push({ x, z, y: sinkY(x, z, 0.1), size, yaw, color });
    }
  });

  // FB-09 (A2): warm fringe crowns by score (in the home view's clear middle first, then by hash), 16 m apart and
  // from violet, at most WARM_EDGE_MAX (so the accent count does not ride on the random stream).
  {
    const score = (c: ScatterItem): number => {
      const uv = homeViewUv(map, c.x, c.size * 2.2, c.z);
      const shown = uv !== null && uv[0] > 0.08 && uv[0] < 0.92 && uv[1] > 0.06 && uv[1] < 0.75 ? 1 : 0;
      return shown + hash2(Math.round(c.x * 5), Math.round(c.z * 5), 0x3a7) * 0.5;
    };
    const order = warmCandidates.map((index) => ({ index, score: score(crowns[index]!) })).sort((a, b) => b.score - a.score || a.index - b.index);
    let added = 0;
    for (const { index } of order) {
      if (added >= WARM_EDGE_MAX) break;
      const c = crowns[index]!;
      if (warmSpots.some((spot) => Math.hypot(spot.x - c.x, spot.z - c.z) < WARM_GAP_M) || violetSpots.some((spot) => Math.hypot(spot.x - c.x, spot.z - c.z) < WARM_VIOLET_GAP_M)) continue;
      crowns[index] = { ...c, warm: true };
      warmSpots.push({ x: c.x, z: c.z });
      added += 1;
    }
  }

  // Bushes: forest edges and meadow clumps, closer to the paths than trees.
  visit(cells.bush, (x, z, r) => {
    const density = field.forest(x, z);
    const chance = 0.06 + density * 0.4 * (1 - density * 0.6);
    if (random() > chance) return;
    if (r < edgeAt(x, z) - 1 || onCliffFace(x, z) || layout.pathGap(x, z) < 0.6 || inClearing(x, z, 0.4)) return;
    const lane = field.laneAt(x, z);
    if (lane.dist - lane.half < SCATTER_CLEAR.bushLane) return;
    if (field.riverEdge(x, z) < SCATTER_CLEAR.bushWater) return;
    if (r < SCATTER_CLEAR.bushDais) return;
    if (slotDist(x, z, false) < SCATTER_CLEAR.bushSlot) return;
    const size = 0.45 + random() * 0.6;
    bushes.push({ x, z, y: sinkY(x, z, 0.05), size, yaw: random() * Math.PI * 2, color: pick(BUSH, random) });
  });

  // Rocks: a few in the meadow, more along the banks.
  visit(cells.rock, (x, z, r) => {
    const edge = field.riverEdge(x, z);
    const bank = edge > -0.3 && edge < 2.6 ? 0.55 : 0;
    if (random() > 0.1 + bank) return;
    if (r < play + PROP_NEAR_SKIRT_M) return;
    const lane = field.laneAt(x, z);
    if (lane.dist - lane.half < SCATTER_CLEAR.rockLane) return;
    if (edge < -0.3) return;
    if (r < SCATTER_CLEAR.bushDais) return;
    if (slotDist(x, z, true) < SCATTER_CLEAR.bushSlot) return;
    const size = 0.25 + random() * (bank > 0 ? 0.55 : 0.75);
    rocks.push({ x, z, y: sinkY(x, z, size * 0.25), size, yaw: random() * Math.PI * 2, color: pick(ROCK, random) });
  });

  // The layout's items (groves, lone trees, rim bushes, clutter, rock lines), each with its prop and tint.
  const add = (item: LayoutItem): void => {
    const spec = PROP_SPECS.find((entry) => entry.manifest === item.proto);
    if (!spec) return;
    const sink = spec.kind === "dress" ? 0 : spec.kind === "rock" ? 0.05 : spec.kind === "bush" ? 0.05 : 0.1;
    // A2: a jetty stands on the pond's water level, not on its bed.
    const y = item.water !== undefined && Number.isFinite(field.pondLevel) ? field.pondLevel + item.water : sinkY(item.x, item.z, sink);
    const entry: ScatterItem = {
      x: item.x,
      z: item.z,
      y,
      size: item.k / spec.perSize,
      yaw: item.yaw,
      color: spec.kind === "pine" ? PINE_GREENS[0] : spec.kind === "crown" ? CROWN_NEAR[0] : spec.kind === "bush" ? BUSH[0] : ROCK[0],
      proto: item.proto,
      tint: item.tint,
      ...(item.warm ? { warm: true } : {}),
      ...(item.stone ? { stone: true } : {}),
      ...(item.tilt ? { tilt: item.tilt } : {}),
      ...(item.sinkShare !== undefined ? { sinkShare: item.sinkShare } : {}),
      ...(item.stretch !== undefined ? { stretch: item.stretch } : {}),
    };
    ({ pine: pines, crown: crowns, bush: bushes, rock: rocks, dress })[spec.kind].push(entry);
  };
  for (const item of layout.trees) add(item);
  for (const item of layout.bushes) add(item);
  for (const item of layout.rocks) add(item);
  for (const item of layout.dress) add(item);

  return { pines, crowns, bushes, rocks, dress };
}

const CONE_PAINT = "diffuseColor.rgb *= mix(0.58, 1.1, smoothstep(0.0, 0.95, vDhLocal.y)) * (0.9 + 0.2 * dhNoise(vDhWorld.xz * 1.4 + vDhWorld.y * 2.2));";
const CROWN_PAINT = "diffuseColor.rgb *= mix(0.6, 1.12, smoothstep(-0.9, 0.85, vDhLocal.y)) * (0.9 + 0.2 * dhNoise(vDhWorld.xz * 1.1 + vDhWorld.y * 1.7));";
const TRUNK_PAINT = "diffuseColor.rgb *= 0.85 + 0.25 * dhNoise(vec2(vDhWorld.x + vDhWorld.z, vDhWorld.y * 6.0));";
const ROCK_PAINT = "diffuseColor.rgb *= mix(0.72, 1.08, smoothstep(-0.6, 0.8, vDhLocal.y)); diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.32, 0.42, 0.22), smoothstep(0.55, 0.9, vDhLocal.y + dhNoise(vDhWorld.xz * 2.0) * 0.4) * 0.5);";

function instanced(geometry: THREE.BufferGeometry, material: THREE.Material, count: number, name: string, shadows: boolean): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, count));
  mesh.count = count;
  mesh.name = name;
  mesh.castShadow = shadows;
  mesh.receiveShadow = shadows;
  mesh.frustumCulled = false;
  return mesh;
}

export function buildScatter(map: MapDef, terrain: PaintedTerrain, quality: Quality): ScatterView {
  const plan = planScatter(terrain.field, quality);
  const look = terrain.look;
  const shadows = quality !== "low";
  const group = new THREE.Group();
  group.name = "dh-scatter";

  const cone = new THREE.ConeGeometry(1, 1, quality === "low" ? 7 : 9, 1);
  cone.translate(0, 0.5, 0);
  const trunk = new THREE.CylinderGeometry(0.8, 1, 1, 6, 1, true);
  trunk.translate(0, 0.5, 0);
  const sphere = new THREE.IcosahedronGeometry(1, quality === "low" || quality === "medium" ? 1 : 2);
  const bushSphere = new THREE.IcosahedronGeometry(1, 1);
  const rock = new THREE.IcosahedronGeometry(1, 0);

  const coneMaterial = paintMaterial(new THREE.MeshLambertMaterial({ color: "#ffffff" }), look, { key: "pine", paint: CONE_PAINT, rim: 0.13, sphere: { y: 0.3, mix: 0.55 }, wind: 0.05, dither: true });
  const crownMaterial = paintMaterial(new THREE.MeshLambertMaterial({ color: "#ffffff" }), look, { key: "crown", paint: CROWN_PAINT, rim: 0.14, wind: 0.035, dither: true });
  const trunkMaterial = paintMaterial(new THREE.MeshLambertMaterial({ color: "#ffffff" }), look, { key: "trunk", paint: TRUNK_PAINT, dither: true });
  const rockMaterial = paintMaterial(new THREE.MeshLambertMaterial({ color: "#ffffff", flatShading: true }), look, { key: "rock", paint: ROCK_PAINT, rim: 0.06 });

  const trees = plan.pines.length + plan.crowns.length;
  /** Items that became GLB props (per kind, by plan index): their primitives are hidden. */
  const taken: Record<ScatterKind, Set<number>> = { pine: new Set(), crown: new Set(), bush: new Set(), rock: new Set(), dress: new Set() };
  const cones = instanced(cone, coneMaterial, plan.pines.length, "dh-pines", shadows);
  const trunks = instanced(trunk, trunkMaterial, trees, "dh-trunks", shadows);
  const rounds = instanced(sphere, crownMaterial, plan.crowns.length, "dh-crowns", shadows);
  const shrubs = instanced(bushSphere, crownMaterial, plan.bushes.length, "dh-bushes", shadows);
  const stones = instanced(rock, rockMaterial, plan.rocks.length, "dh-rocks", shadows);

  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const euler = new THREE.Euler();
  const color = new THREE.Color();
  const set = (mesh: THREE.InstancedMesh, index: number, x: number, y: number, z: number, sx: number, sy: number, sz: number, yaw: number, hex: string, tilt = 0): void => {
    euler.set(tilt, yaw, tilt * 0.6, "YXZ");
    quaternion.setFromEuler(euler);
    matrix.compose(position.set(x, y, z), quaternion, scale.set(sx, sy, sz));
    mesh.setMatrixAt(index, matrix);
    mesh.setColorAt(index, color.set(hex));
  };

  /** Writes every primitive; an item taken by a GLB prop gets a zero scale (hidden, same draw call). */
  const fillPrimitives = (): void => {
    let trunkIndex = 0;
    plan.pines.forEach((pine, index) => {
      const k = taken.pine.has(index) ? 0 : 1;
      const height = pine.size;
      const radius = height * 0.27;
      set(cones, index, pine.x, pine.y + height * 0.14, pine.z, radius * k, height * 0.86 * k, radius * k, pine.yaw, pine.color);
      set(trunks, trunkIndex++, pine.x, pine.y, pine.z, height * 0.035 * k, height * 0.3 * k, height * 0.035 * k, pine.yaw, "#5b4a3f");
    });
    plan.crowns.forEach((crown, index) => {
      const k = taken.crown.has(index) ? 0 : 1;
      const radius = crown.size;
      const trunkHeight = radius * 1.05;
      set(rounds, index, crown.x, crown.y + trunkHeight + radius * 0.75, crown.z, radius * k, radius * 0.88 * k, radius * k, crown.yaw, crown.color);
      set(trunks, trunkIndex++, crown.x, crown.y, crown.z, radius * 0.1 * k, (trunkHeight + radius * 0.5) * k, radius * 0.1 * k, crown.yaw, "#64513f");
    });
    plan.bushes.forEach((bush, index) => {
      const k = taken.bush.has(index) ? 0 : 1;
      set(shrubs, index, bush.x, bush.y + bush.size * 0.38, bush.z, bush.size * 1.15 * k, bush.size * 0.72 * k, bush.size * k, bush.yaw, bush.color);
    });
    plan.rocks.forEach((stone, index) => {
      const k = taken.rock.has(index) ? 0 : 1;
      set(stones, index, stone.x, stone.y, stone.z, stone.size * 1.25 * k, stone.size * 0.7 * k, stone.size * k, stone.yaw, stone.color, (stone.size % 0.1) * 3);
    });
    for (const mesh of [cones, trunks, rounds, shrubs, stones]) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  };
  fillPrimitives();
  for (const mesh of [cones, trunks, rounds, shrubs, stones]) if (mesh.count > 0) group.add(mesh);

  const geometries = [cone, trunk, sphere, bushSphere, rock];
  const materials: THREE.Material[] = [coneMaterial, crownMaterial, trunkMaterial, rockMaterial];
  const meshes = [cones, trunks, rounds, shrubs, stones];
  /** GLB prop meshes (their geometry belongs to view/models.ts). */
  const propMeshes: THREE.InstancedMesh[] = [];
  let used = false;
  const field = terrain.field;
  const near = map.terrain.playRadiusM + PROP_NEAR_SKIRT_M;
  const [cx, cz] = map.dais.center;

  let atlas: ImpostorAtlas | null = null;
  const useProps = (prop: (manifest: string) => PropModel | null, renderer?: THREE.WebGLRenderer): void => {
    if (used) return;
    used = true;
    const loaded = PROP_SPECS.map((spec) => ({ spec, model: prop(spec.manifest) })).filter((entry): entry is { spec: PropSpec; model: PropModel } => entry.model !== null);
    if (loaded.length === 0) return;
    const lists: Record<ScatterKind, readonly ScatterItem[]> = { pine: plan.pines, crown: plan.crowns, bush: plan.bushes, rock: plan.rocks, dress: plan.dress };
    /** Items per prop and band ("near" inside the near skirt, "mid" past it). */
    const placed = new Map<string, { spec: PropSpec; model: PropModel; band: "near" | "mid"; warm: boolean; items: ScatterItem[] }>();
    // V7 A/B: ?warm=0 draws the warm crowns green.
    const warmOn = mapSwitch("warm") !== "0";
    const farItems: FarItem[] = [];
    for (const kind of ["pine", "crown", "bush", "rock", "dress"] as const) {
      const all = loaded.filter((entry) => entry.spec.kind === kind);
      // A prop kept off the paths (the violet crown, 05 §2.2) stands exactly where the plan put a far colour.
      const far = all.find((entry) => entry.spec.laneGapMin > 0);
      // Layout-only props (share 0) never stand in for a plain plan item.
      const variants = all.filter((entry) => entry.spec.laneGapMin === 0 && entry.spec.share > 0);
      if (all.length === 0) continue;
      const total = variants.reduce((sum, entry) => sum + entry.spec.share, 0);
      lists[kind].forEach((item, index) => {
        let pick: (typeof all)[number] | undefined;
        if (item.proto !== undefined) pick = loaded.find((entry) => entry.spec.manifest === item.proto);
        else if (far !== undefined && (FAR_COLORS as readonly string[]).includes(item.color)) pick = far;
        else {
          // A stable pick by position.
          let roll = hash2(Math.round(item.x * 7), Math.round(item.z * 7), 0x51ce) * total;
          pick = variants[variants.length - 1];
          for (const entry of variants) {
            roll -= entry.spec.share;
            if (roll <= 0) {
              pick = entry;
              break;
            }
          }
        }
        if (pick === undefined) return;
        taken[kind].add(index);
        const r = Math.hypot(item.x - cx, item.z - cz);
        if (renderer && r > FAR_FROM_M && kind === "rock" && item.proto === undefined) return;
        if (renderer && r > FAR_FROM_M && kind !== "rock" && kind !== "dress") {
          // Far ring: an impostor quad (trees), nothing for bushes (lost in the mist).
          if (kind === "bush") return;
          const k = item.size * pick.spec.perSize;
          // FB-03 (A2): the far ring a step lighter (0.94–1.1), so the forest beyond the edge is no dark wall.
          const spread = 0.94 + hash2(Math.round(item.x * 5), Math.round(item.z * 5), 0xfa7) * 0.16;
          farItems.push({ manifest: pick.spec.manifest, x: item.x, y: item.y, z: item.z, k, mirror: hash2(Math.round(item.x * 3), Math.round(item.z * 3), 0x31) < 0.5, tint: item.tint ?? [spread, spread, spread] });
          return;
        }
        // Small clutter casts no shadow in either band: one group (one draw call) for both.
        const band = r <= near || SMALL_PROPS.has(pick.spec.manifest) ? "near" : "mid";
        const warm = warmOn && item.warm === true && pick.spec.manifest === "props/pine-river-pine-round";
        const key = pick.spec.manifest + "|" + band + (warm ? "|warm" : "");
        const group = placed.get(key) ?? { spec: pick.spec, model: pick.model, band, warm, items: [] };
        group.items.push(item);
        placed.set(key, group);
      });
    }
    fillPrimitives();
    // Primitive meshes whose every item became a prop leave the scene (no hidden instances in the vertex stage).
    const hide = (mesh: THREE.InstancedMesh, kind: ScatterKind | ScatterKind[]): void => {
      const kinds = Array.isArray(kind) ? kind : [kind];
      if (kinds.every((k) => taken[k].size === lists[k].length)) mesh.visible = false;
    };
    hide(cones, "pine");
    hide(trunks, ["pine", "crown"]);
    hide(rounds, "crown");
    hide(shrubs, "bush");
    hide(stones, "rock");
    const tint = new THREE.Color();
    for (const { spec, model, band, warm, items } of placed.values()) {
      if (items.length === 0) continue;
      const name = spec.manifest.slice(spec.manifest.lastIndexOf("/") + 1) + (warm ? "-warm" : "");
      const paint = warm ? WARM_CROWN : PROP_PAINT[spec.manifest];
      const material = paintMaterial(new THREE.MeshLambertMaterial({ color: "#ffffff", map: model.map }), look, {
        key: "prop-" + name + (band === "mid" ? "-mid" : ""),
        ...(paint ? { paint } : {}),
        rim: spec.kind === "rock" ? 0.06 : spec.kind === "dress" ? 0.08 : 0.12,
        ...(spec.wind > 0 ? { wind: spec.wind } : {}),
        dither: spec.kind !== "rock" && spec.kind !== "dress",
        // Foliage a mip softer: leaf masses like the reference, less pixel noise (MAP_PLAN 2.4 clutter).
        ...(spec.kind !== "rock" && spec.kind !== "dress" ? { mapBias: FOLIAGE_MAP_BIAS } : {}),
      });
      const geometry = model.geometry;
      // Small clutter and the far ring cast no shadow (MAP_FACTORY 4.2).
      const casts = shadows && band === "near" && !SMALL_PROPS.has(spec.manifest);
      const mesh = instanced(geometry, material, items.length, "dh-prop-" + name + (band === "mid" ? "-mid" : ""), casts);
      mesh.receiveShadow = shadows && band === "near";
      items.forEach((item, index) => {
        const k = item.size * spec.perSize;
        // Rocks and logs sink a little; trees stand on their roots.
        // Cliff stone beds deeper into the slope.
        const sink = k * model.size.y * (item.sinkShare ?? (spec.kind === "rock" ? (item.stone ? 0.26 : 0.12) : 0));
        euler.set(item.tilt?.[0] ?? 0, item.yaw, item.tilt?.[1] ?? 0, "YXZ");
        quaternion.setFromEuler(euler);
        matrix.compose(position.set(item.x, item.y - sink, item.z), quaternion, scale.set(k * (item.stretch ?? 1), k, k));
        mesh.setMatrixAt(index, matrix);
        // A little brightness spread so a grove never looks stamped; layout items carry their own tint.
        // A2: a narrower spread (0.93–1.03): neighbouring crowns differ less, the forest reads as masses (clutter).
        const spread = 0.93 + hash2(index, items.length, 7) * 0.1;
        if (item.tint) tint.setRGB(item.tint[0], item.tint[1], item.tint[2]);
        else tint.setScalar(spread);
        mesh.setColorAt(index, tint);
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      group.add(mesh);
      propMeshes.push(mesh);
      materials.push(material);
    }
    if (renderer && farItems.length > 0) {
      const used = [...new Set(farItems.map((item) => item.manifest))];
      atlas = bakeImpostors(renderer, used.map((key) => loaded.find((entry) => entry.spec.manifest === key)!.model));
      const ring = farRing(atlas, farItems, look);
      group.add(ring);
      propMeshes.push(ring);
      materials.push(ring.material as THREE.Material);
    }
  };

  return {
    group,
    useProps,
    stats() {
      // Hidden primitives (zero scale) still go through the vertex stage: they count.
      let triangles = 0;
      for (const mesh of [...meshes, ...propMeshes]) if (mesh.visible) triangles += ((mesh.geometry.getIndex()?.count ?? mesh.geometry.getAttribute("position").count) / 3) * mesh.count;
      const props = propMeshes.reduce((sum, mesh) => sum + mesh.count, 0);
      const primitives = plan.pines.length + plan.crowns.length + plan.bushes.length + plan.rocks.length - (taken.pine.size + taken.crown.size + taken.bush.size + taken.rock.size);
      return { triangles, props, primitives };
    },
    dispose(): void {
      group.removeFromParent();
      for (const item of [...geometries, ...materials, ...meshes, ...propMeshes]) item.dispose();
      atlas?.dispose();
    },
  };
}
