/**
 * M0 map L2-cau (04 §3.1, DESIGN.md §9 M0): pine-river kit, two dirt lanes and
 * one sky lane around the Dragon Dais at the origin. The river comes in from
 * the north-east as a 6–8 m river and leaves to the south-west as a 4 m stream.
 * Đường Cầu (north) crosses it on a bridge, the choke point; Đường Suối (west)
 * wades the stream at a ford: 30 % slower and Wet (04 §2.1, 03 §2.4).
 * Metres, x east, z south (the default camera looks north). Slots follow
 * 03 §7.1, §8.1, §9.1; tests/content/map.test.ts checks the geometry rules.
 * Owner: architect for M0a setup, sim-battle afterwards (LANES.md).
 */
import type { MapDef, SlotDef, Vec2 } from "../types";

const CAU: readonly Vec2[] = [
  [8.5, -29],
  [5, -22.5],
  [2.2, -15.4],
  [1.2, -10],
  [0.4, -6],
];

const SUOI: readonly Vec2[] = [
  [-30, 7],
  [-24, 4.2],
  [-18, 1.4],
  [-12, 1],
  [-6, 0.4],
];

/** Lane slots: the point at `atM` metres from the gate (positions precomputed, checked by the map test). */
const laneSlot = (id: string, kind: "trap" | "block", lane: string, atM: number, pos: Vec2): SlotDef => ({ id, kind, lane, atM, pos });
const pad = (id: string, ring: "inner" | "outer", pos: Vec2): SlotDef => ({ id, kind: "house", ring, pos });

export const MAP_L2_CAU: MapDef = {
  id: "L2-cau",
  nameVi: "Cầu và Suối",
  dais: { center: [0, 0], radiusM: 4, heroHoverM: 2.5, guideAt: [-1.7, 1.5] },
  lanes: [
    {
      id: "cau",
      nameVi: "Đường Cầu",
      points: CAU,
      widthM: 3,
      // Water spans 11.0–17.9 m along the lane; the deck overhangs 0.5 m.
      features: [{ kind: "bridge", fromM: 10.5, toM: 18.4, widthM: 3.4 }],
    },
    {
      id: "suoi",
      nameVi: "Đường Suối",
      points: SUOI,
      widthM: 2.6,
      features: [{ kind: "ford", fromM: 6.9, toM: 14, slowPct: 30, wetMs: 4000 }],
    },
  ],
  sky: [
    {
      id: "troi",
      nameVi: "Đường Trời",
      points: [
        [30.5, -8.5],
        [20, -7],
        [7.3, -1.8],
      ],
      altitudeM: 3,
    },
  ],
  river: {
    points: [
      [70, -33],
      [38, -25],
      [24, -21],
      [12, -17.5],
      [1, -15.5],
      [-8, -13.5],
      [-14.5, -8.5],
      [-18.5, -1],
      [-23, 7],
      [-30, 15],
      [-38, 22],
      [-70, 40],
    ],
    widthsM: [8, 7.5, 7, 6.5, 6, 5.5, 5, 4.5, 4, 4, 4, 4],
    depthM: 1.2,
    bankM: 0.4,
    shallows: [{ center: [-20.5, 2.6], radiusM: 3.5 }],
  },
  slots: [
    // Đường Cầu: four trap slots (one on the bridge deck), two block points.
    laneSlot("cau-t1", "trap", "cau", 4, [6.6, -25.48]),
    laneSlot("cau-t2", "trap", "cau", 10, [4.04, -20.06]),
    laneSlot("cau-t3", "trap", "cau", 15.5, [2.11, -14.92]),
    laneSlot("cau-t4", "trap", "cau", 21.8, [0.95, -8.73]),
    laneSlot("cau-b1", "block", "cau", 9, [4.41, -21]),
    laneSlot("cau-b2", "block", "cau", 19, [1.47, -11.48]),
    // Đường Suối: three trap slots (none in the ford), two block points.
    laneSlot("suoi-t1", "trap", "suoi", 5.5, [-25.02, 4.67]),
    laneSlot("suoi-t2", "trap", "suoi", 15.5, [-15.75, 1.25]),
    laneSlot("suoi-t3", "trap", "suoi", 21.5, [-9.77, 0.78]),
    laneSlot("suoi-b1", "block", "suoi", 16, [-15.25, 1.22]),
    laneSlot("suoi-b2", "block", "suoi", 21, [-10.26, 0.83]),
    // House pads: four on the inner ring, two outer ones near the crossings.
    pad("h-nw", "inner", [-5.5, -6.5]),
    pad("h-ne", "inner", [6.5, -5]),
    pad("h-se", "inner", [5.5, 6]),
    pad("h-sw", "inner", [-5, 6.5]),
    pad("h-e", "outer", [9.5, -11]),
    pad("h-w", "outer", [-14, 6.5]),
  ],
  terrain: { seed: 20_261_023, sizeM: 144, playRadiusM: 32, reliefM: 1.6, kit: "pine-river" },
  camera: { yawDeg: 0, pitchDeg: 55, distanceM: 95 },
};

export const MAPS: Readonly<Record<string, MapDef>> = { [MAP_L2_CAU.id]: MAP_L2_CAU };
