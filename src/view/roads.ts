/**
 * Roads (docs/games/PATH_QUALITY.md, owner 29/10/2026: a road that looks like a long finger smear is a
 * defect). Each lane, with its trail past the gate, gets one ribbon mesh along its centreline: UVs run
 * along the road (per column arc length, so the texel density holds on bends), a core of trodden earth, a
 * worn verge whose crest stands 5 cm over the core (the lip shades the core edge), then a noisy 0.3–0.8 m
 * blend into the baked ground. Width follows view/road-profile.ts (±15 %, wider at bends, the dais junction
 * and bridge approaches). One draw call for every lane. The sim lanes are untouched.
 * Textures by name: the core, verge and edge-decal slots ask the ground manifests for Codex 155's
 * `road/road-flagstone`, `road/road-verge` and decals `road/road-edges`; until those are accepted into the
 * pick list (ground-pick.json) the core and verge use the pine-river path and earth tiles and there are no
 * edge decals. The shader only mixes those images and shapes the edges.
 * Owner: map pilot.
 */
import * as THREE from "three";
import type { MapDef } from "../content/types";
import { manifestOf } from "./paint";
import { bridgeGapAt, curvatureAt, ROAD, roadCoreHalf, roadVerge } from "./road-profile";
import { paintMaterial, Polyline, type PaintedTerrain } from "./terrain";

/** Manifest names of Codex 155 (ground-v3 road set) and what stands in for each until it is accepted. */
export const ROAD_TEXTURES = {
  core: { kind: "ground", key: "road/road-flagstone", standIn: "uTPath" },
  verge: { kind: "ground", key: "road/road-verge", standIn: "uTEarth" },
  edges: { kind: "decals", key: "road/road-edges", standIn: null },
} as const;

export interface RoadsView {
  readonly group: THREE.Group;
  /** Which image each slot uses ("road/road-flagstone" or the stand-in uniform name). */
  readonly sources: Record<keyof typeof ROAD_TEXTURES, string>;
  stats(): { triangles: number; lanes: number; footpaths: number };
  dispose(): void;
}

const STEP_M = 0.5;
/** Cross-section columns: [share of the core, share of the verge] from the centre out. */
const COLUMNS: readonly (readonly [number, number])[] = [
  [0, 0],
  [0.55, 0],
  [1, 0],
  [1, 0.5],
  [1, 1.35],
];

const ROAD_PARS = /* glsl */ `
uniform sampler2D uRCore;
uniform sampler2D uRVerge;
uniform sampler2D uREdges;
uniform float uREdgesOn;
uniform sampler2D uBaked;
uniform float uBakeOn;
uniform vec4 uMaskRect;
uniform vec3 uDirt;
uniform vec3 uDirtLight;
uniform vec3 uDirtDark;
uniform vec3 uGrassMid;
uniform float uRoadTile;
uniform vec3 uDaisRing;
`;

// vDhMask: x signed metres across (− left), y core half, z verge width (this side), w arc length of this column.
const ROAD_PAINT = /* glsl */ `
float ad = abs(vDhMask.x);
float C = vDhMask.y;
float V = vDhMask.z;
float al = vDhMask.w;
float side = vDhMask.x < 0.0 ? -1.0 : 1.0;
vec2 ruv = vec2(vDhMask.x, al) / uRoadTile;
// Noisy layer edges: the core edge wanders ±0.25 m, its blend is 0.3–0.8 m wide; the grass edge as well.
float coreEdge = C + (dhFbm(vec2(al * 0.45, side * 3.1 + 1.7)) - 0.5) * 0.5;
float band = 0.3 + 0.5 * dhNoise(vec2(al * 1.3, side * 5.0 + 2.0));
float core = 1.0 - smoothstep(coreEdge - band * 0.5, coreEdge + band * 0.5, ad);
float outer = C + V * (0.75 + 0.55 * dhFbm(vec2(al * 0.32, side * 7.0 + 4.0)));
float grassBand = 0.3 + 0.5 * dhNoise(vec2(al * 0.9, side * 9.0 + 6.0));
float road = 1.0 - smoothstep(outer - grassBand, outer, ad);
// Roads end in the dais plaza's trodden ring, faded over 1.8 m (no cut end).
road *= smoothstep(uDaisRing.z, uDaisRing.z + 1.8, length(vDhWorld.xz - uDaisRing.xy));
vec2 guv = (vDhWorld.xz - uMaskRect.xy) / uMaskRect.zw;
vec3 ground = uBakeOn > 0.5 && all(greaterThan(guv, vec2(0.0))) && all(lessThan(guv, vec2(1.0))) ? texture2D(uBaked, guv).rgb : uGrassMid;
vec3 tC = texture2D(uRCore, ruv).rgb;
vec3 mC = textureLod(uRCore, vec2(0.5), 12.0).rgb;
vec3 tV = texture2D(uRVerge, ruv * 1.25 + 0.37).rgb;
vec3 mV = textureLod(uRVerge, vec2(0.5), 12.0).rgb;
vec3 coreC = mix(uDirt, uDirtLight, 0.55) * clamp(mix(vec3(1.0), tC / max(mC, vec3(0.004)), 0.85), 0.0, 2.0);
// Wheel lines: the verge image again, faint, along two worn tracks (no drawn pattern).
float rut = (1.0 - smoothstep(0.1, 0.3, abs(ad - C * 0.5))) * smoothstep(0.3, 0.65, dhNoise(vec2(al * 0.22, side + 3.0)));
coreC = mix(coreC, coreC * mix(vec3(1.0), tV / max(mV, vec3(0.004)), 0.6) * 0.86, rut * 0.55);
vec3 vergeC = mix(uDirtDark, uDirt, 0.55) * vec3(0.95, 0.94, 0.9) * clamp(mix(vec3(1.0), tV / max(mV, vec3(0.004)), 1.0), 0.0, 2.2);
// Thin grass creeping onto the verge's outer half.
vergeC = mix(vergeC, ground, smoothstep(0.42, 0.78, dhNoise(vDhWorld.xz * 1.6)) * smoothstep(coreEdge + 0.4, outer, ad) * 0.45);
if (uREdgesOn > 0.5) {
  vec4 e = texture2D(uREdges, vec2(fract(al / 4.0), clamp(0.5 + (ad - coreEdge) / 1.6, 0.0, 1.0)));
  vergeC = vergeC * (1.0 - e.a) + e.rgb;
}
vec3 col = mix(vergeC, coreC, core);
// The verge lip (5 cm over the core) shades the core edge.
col *= 1.0 - 0.22 * exp(-pow((ad - coreEdge - band * 0.4) / 0.2, 2.0)) * (1.0 - core * 0.5);
diffuseColor.rgb = mix(ground, col, road);
`;

export function buildRoads(map: MapDef, terrain: PaintedTerrain): RoadsView {
  const group = new THREE.Group();
  group.name = "dh-roads";
  const field = terrain.field;
  const [cx, cz] = map.dais.center;
  const positions: number[] = [];
  const masks: number[] = [];
  const indices: number[] = [];
  const cols = COLUMNS.length * 2 - 1;
  const point = { x: 0, z: 0, dx: 0, dz: 1 };
  const around = { x: 0, z: 0, dx: 0, dz: 1 };

  /**
   * One road along `line` (arc length `at` from its start; s = at − sOffset is the profile's arc parameter).
   * halfAt: the walking half width at `at`; vergeScale: footpaths keep a narrower verge.
   */
  const addRoad = (line: Polyline, index: number, sOffset: number, spans: readonly { fromM: number; toM: number }[], halfAt: (at: number) => number, vergeScale: number, taperIn: number, taperOut: number, lift0: number): void => {
    let strip: { ring: number; columnLength: number[] } | null = null;
    let last: number[] | null = null;
    const daisStop = map.dais.radiusM + 0.6;
    for (let at = 0; at <= line.length + 1e-6; at += STEP_M) {
      const s = at - sOffset;
      line.pointAt(at, point);
      const r = Math.hypot(point.x - cx, point.z - cz);
      const onBridge = spans.some((span) => s > span.fromM - 0.15 && s < span.toM + 0.15);
      if (onBridge || r < daisStop) {
        strip = null;
        continue;
      }
      // A smooth cross direction: the mean tangent over ±0.75 m (the sim polyline has corners).
      line.pointAt(Math.max(0, at - 0.75), around);
      let tx = around.dx;
      let tz = around.dz;
      line.pointAt(Math.min(line.length, at + 0.75), around);
      tx += around.dx;
      tz += around.dz;
      const tl = Math.hypot(tx, tz) || 1;
      tx /= tl;
      tz /= tl;
      const sample = { s, laneIndex: index, half: halfAt(at), curvature: curvatureAt(line, at), rDais: r, bridgeGap: bridgeGapAt(spans, s) };
      // Ends narrow over taperIn / taperOut metres (a lane's trail into the forest, a footpath's destination).
      const taper = Math.min(1, taperIn > 0 ? 0.15 + (0.85 * at) / taperIn : 1, taperOut > 0 ? 0.15 + (0.85 * (line.length - at)) / taperOut : 1);
      const C = roadCoreHalf(sample) * taper;
      const ring = positions.length / 3;
      const row: number[] = [];
      for (let c = 0; c < cols; c += 1) {
        const k = c - (COLUMNS.length - 1);
        const sideSign = k < 0 ? -1 : 1;
        const [coreShare, vergeShare] = COLUMNS[Math.abs(k)]!;
        const V = roadVerge(sample, sideSign) * vergeScale * taper;
        const d = (C * coreShare + V * vergeShare) * (k === 0 ? 0 : sideSign);
        const x = point.x - tz * d;
        const z = point.z + tx * d;
        // Core 3 cm over the ground, verge crest 8 cm (5 cm over the core), the grass edge 2.5 cm; roads stack by 4 mm.
        const lift = (vergeShare === 0 ? 0.03 : vergeShare <= 0.5 ? 0.03 + ROAD.coreDropM : 0.025) + lift0;
        positions.push(x, field.ground(x, z) + lift, z);
        row.push(x, z);
        masks.push(d, C, V, 0);
      }
      // Arc length per column (each edge line keeps its own length: one texel density on bends).
      if (strip && last) {
        for (let c = 0; c < cols; c += 1) {
          strip.columnLength[c]! += Math.hypot(row[c * 2]! - last[c * 2]!, row[c * 2 + 1]! - last[c * 2 + 1]!);
          masks[(ring + c) * 4 + 3] = strip.columnLength[c]!;
        }
        for (let c = 0; c < cols - 1; c += 1) {
          const a = strip.ring + c;
          const b = ring + c;
          // Counter-clockwise seen from above (front faces up).
          indices.push(a, a + 1, b, a + 1, b + 1, b);
        }
        strip.ring = ring;
      } else {
        strip = { ring, columnLength: new Array<number>(cols).fill(s) };
        for (let c = 0; c < cols; c += 1) masks[(ring + c) * 4 + 3] = s;
      }
      last = row;
    }
  };

  // Lanes: trail far end → gate → … → dais end, as one line; s = 0 at the gate (the sim polyline's start).
  field.lanes.forEach((lane, li) => {
    const trailLength = lane.trail.length;
    const line = new Polyline([[lane.trail.xs[0]!, lane.trail.zs[0]!], ...Array.from(lane.line.xs, (x, k) => [x, lane.line.zs[k]!] as [number, number])]);
    const spans = lane.bridges.map((span) => ({ fromM: span.fromM, toM: span.toM }));
    // The trail narrows toward the forest (the height field's trail taper): 0.55 of the lane at its far end.
    addRoad(line, li, trailLength, spans, (at) => lane.halfWidth * (at < trailLength ? 0.55 + (0.45 * at) / trailLength : 1), 1, 3, 0, li * 0.004);
  });
  // PATH_QUALITY: every trodden footpath is a road too (main: the lantern routes; branch: narrower verge).
  field.layout.footpaths.forEach((path, pi) => {
    const halfAt = (at: number): number => {
      let k = 0;
      while (k < path.line.count - 1 && path.line.cum[k + 1]! < at) k += 1;
      return path.halves[k]!;
    };
    addRoad(path.line, 10 + pi, 0, [], halfAt, path.tier === "main" ? 0.65 : 0.45, 0, 2.5, 0.012 + pi * 0.003);
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("aDhMask", new THREE.Float32BufferAttribute(masks, 4));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const paint = terrain.paint.uniforms;
  // A slot's own image once Codex 155 is in the manifest; until then the paint's stand-in tile (read live, so it
  // follows the tile when that loads). The bake and palette are the paint's own uniform objects.
  const own: Record<keyof typeof ROAD_TEXTURES, THREE.Texture | null> = { core: null, verge: null, edges: null };
  const emptyEdges = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
  const uniforms: Record<string, { value: unknown }> = {
    uRCore: { get value() { return own.core ?? paint[ROAD_TEXTURES.core.standIn]!.value; } },
    uRVerge: { get value() { return own.verge ?? paint[ROAD_TEXTURES.verge.standIn]!.value; } },
    uREdges: { get value() { return own.edges ?? emptyEdges; } },
    uREdgesOn: { value: 0 },
    uBaked: paint.uBaked!,
    uBakeOn: paint.uBakeOn!,
    uMaskRect: paint.uMaskRect!,
    uDirt: paint.uDirt!,
    uDirtLight: paint.uDirtLight!,
    uDirtDark: paint.uDirtDark!,
    uGrassMid: paint.uGrassMid!,
    uRoadTile: { value: ROAD.tileM },
    uDaisRing: { value: new THREE.Vector3(cx, cz, map.dais.radiusM + 0.6) },
  };
  emptyEdges.needsUpdate = true;
  const material = paintMaterial(new THREE.MeshLambertMaterial({ color: "#ffffff", polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }), terrain.look, {
    key: "road",
    mask: true,
    fragmentPars: ROAD_PARS,
    paint: ROAD_PAINT,
    uniforms,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "dh-roads";
  mesh.receiveShadow = true;
  mesh.renderOrder = 1;
  group.add(mesh);

  // Codex 155 by name: a slot switches to its own image only once the manifest lists it (accepted).
  const sources: Record<keyof typeof ROAD_TEXTURES, string> = { core: ROAD_TEXTURES.core.standIn, verge: ROAD_TEXTURES.verge.standIn, edges: "none" };
  const loader = new THREE.TextureLoader();
  const owned: THREE.Texture[] = [];
  for (const slot of Object.keys(ROAD_TEXTURES) as (keyof typeof ROAD_TEXTURES)[]) {
    const want = ROAD_TEXTURES[slot];
    void manifestOf(want.kind).then((manifest) => {
      const entry = manifest?.textures[want.key];
      if (!entry) return;
      return loader.loadAsync(entry.url).then((texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        texture.anisotropy = 4;
        owned.push(texture);
        own[slot] = texture;
        if (slot === "edges") uniforms.uREdgesOn!.value = 1;
        sources[slot] = want.key;
      });
    }).catch((error: unknown) => console.error("roads: " + want.key + " did not load; the stand-in stays", error));
  }

  return {
    group,
    sources,
    stats: () => ({ triangles: indices.length / 3, lanes: field.lanes.length, footpaths: field.layout.footpaths.length }),
    dispose(): void {
      group.removeFromParent();
      geometry.dispose();
      material.dispose();
      emptyEdges.dispose();
      for (const texture of owned) texture.dispose();
    },
  };
}
