/**
 * Pine-river scatter for the grey box: primitive placeholder trees, rocks and
 * bushes (cones, spheres; BatchedMesh or instancing), kept off lanes, slots,
 * water and the dais; impostor ring outside the play area. Real props come
 * as the owner's GLB later.
 * Five instanced meshes (cones, trunks, round crowns, bushes, rocks): a
 * seeded plan from the terrain's forest density, sparse clumps inside the
 * play area, a dense ring in the skirt that sinks into the mist.
 * Owner: view-terrain (LANES.md).
 */
import * as THREE from "three";
import type { Quality } from "../app/contracts";
import type { MapDef } from "../content/types";
import { Polyline, paintMaterial, seededRandom, type HeightField, type PaintedTerrain } from "./terrain";

export interface ScatterView {
  readonly group: THREE.Group;
  dispose(): void;
}

/** A placed placeholder, metres. `size`: height for pines, crown radius for round trees and bushes, rock radius. */
export interface ScatterItem {
  readonly x: number;
  readonly z: number;
  readonly y: number;
  readonly size: number;
  readonly yaw: number;
  readonly color: string;
}

export interface ScatterPlan {
  readonly pines: readonly ScatterItem[];
  readonly crowns: readonly ScatterItem[];
  readonly bushes: readonly ScatterItem[];
  readonly rocks: readonly ScatterItem[];
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
const BUSH = ["#5d8f4f", "#6f9d55", "#4d7f5a", "#7aa35e"] as const;
const ROCK = ["#9a95a8", "#8b8698", "#a7a2ad"] as const;

const pick = <T>(list: readonly T[], random: () => number): T => list[Math.floor(random() * list.length) % list.length]!;

/** Seeded placement for the map's scatter; pure apart from the field queries. */
export function planScatter(field: HeightField, quality: Quality): ScatterPlan {
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

  // Trees: pines and round crowns by forest density.
  visit(cells.tree, (x, z, r) => {
    const roll = random();
    const density = field.forest(x, z);
    if (roll > density) return;
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
    if (random() < (inside ? 0.45 : 0.2)) {
      const size = inside ? 1.3 + random() * 0.9 : 1.8 + random() * 1.3;
      const color = far && random() < 0.4 ? pick(CROWN_FAR, random) : pick(CROWN_NEAR, random);
      crowns.push({ x, z, y: sinkY(x, z, 0.1), size, yaw, color });
    } else {
      const size = inside ? 3.4 + random() * 2.2 : 4.6 + random() * 4.6;
      const color = far && random() < 0.22 ? pick(PINE_FAR, random) : pick(PINE_GREENS, random);
      pines.push({ x, z, y: sinkY(x, z, 0.1), size, yaw, color });
    }
  });

  // Bushes: forest edges and meadow clumps, closer to the paths than trees.
  visit(cells.bush, (x, z, r) => {
    const density = field.forest(x, z);
    const chance = 0.06 + density * 0.4 * (1 - density * 0.6);
    if (random() > chance) return;
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
    const lane = field.laneAt(x, z);
    if (lane.dist - lane.half < SCATTER_CLEAR.rockLane) return;
    if (edge < -0.3) return;
    if (r < SCATTER_CLEAR.bushDais) return;
    if (slotDist(x, z, true) < SCATTER_CLEAR.bushSlot) return;
    const size = 0.25 + random() * (bank > 0 ? 0.55 : 0.75);
    rocks.push({ x, z, y: sinkY(x, z, size * 0.25), size, yaw: random() * Math.PI * 2, color: pick(ROCK, random) });
  });

  return { pines, crowns, bushes, rocks };
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

  let trunkIndex = 0;
  plan.pines.forEach((pine, index) => {
    const height = pine.size;
    const radius = height * 0.27;
    set(cones, index, pine.x, pine.y + height * 0.14, pine.z, radius, height * 0.86, radius, pine.yaw, pine.color);
    set(trunks, trunkIndex++, pine.x, pine.y, pine.z, height * 0.035, height * 0.3, height * 0.035, pine.yaw, "#5b4a3f");
  });
  plan.crowns.forEach((crown, index) => {
    const radius = crown.size;
    const trunkHeight = radius * 1.05;
    set(rounds, index, crown.x, crown.y + trunkHeight + radius * 0.75, crown.z, radius, radius * 0.88, radius, crown.yaw, crown.color);
    set(trunks, trunkIndex++, crown.x, crown.y, crown.z, radius * 0.1, trunkHeight + radius * 0.5, radius * 0.1, crown.yaw, "#64513f");
  });
  plan.bushes.forEach((bush, index) => {
    set(shrubs, index, bush.x, bush.y + bush.size * 0.38, bush.z, bush.size * 1.15, bush.size * 0.72, bush.size, bush.yaw, bush.color);
  });
  plan.rocks.forEach((stone, index) => {
    set(stones, index, stone.x, stone.y, stone.z, stone.size * 1.25, stone.size * 0.7, stone.size, stone.yaw, stone.color, (stone.size % 0.1) * 3);
  });
  for (const mesh of [cones, trunks, rounds, shrubs, stones]) {
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    if (mesh.count > 0) group.add(mesh);
  }

  const geometries = [cone, trunk, sphere, bushSphere, rock];
  const materials = [coneMaterial, crownMaterial, trunkMaterial, rockMaterial];
  const meshes = [cones, trunks, rounds, shrubs, stones];
  return {
    group,
    dispose(): void {
      group.removeFromParent();
      for (const item of [...geometries, ...materials, ...meshes]) item.dispose();
    },
  };
}
