/**
 * River and stream water from MapDef.river (widths per point, shallows at the
 * ford): a ribbon mesh along the smoothed centreline with a stylized flowing
 * shader (colour by depth, two drifting ripple layers, two-step foam at the
 * banks and over the ford, stepped sparkles toward the sun), plus a few
 * placeholder stepping stones at the ford. art-pipeline §2.4: no Water2.
 * Owner: view-terrain (LANES.md).
 */
import * as THREE from "three";
import type { MapDef } from "../content/types";
import { DH_GLSL, paintMaterial, seededRandom, type PaintedTerrain } from "./terrain";

export interface WaterView {
  readonly group: THREE.Group;
  update(dt: number): void;
  dispose(): void;
}

const MAX_SHALLOWS = 4;

const WATER_VERTEX = /* glsl */ `
varying vec2 vUv;
varying vec3 vDhWorld;
void main() {
  vUv = uv;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vDhWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const WATER_FRAGMENT = /* glsl */ `
${DH_GLSL}
uniform vec3 uDeep;
uniform vec3 uShallow;
uniform vec3 uFoam;
uniform vec3 uShallowsC[${MAX_SHALLOWS}];
varying vec2 vUv;
varying vec3 vDhWorld;
void main() {
  // vUv.x across the river (0..1), vUv.y metres downstream.
  float across = abs(vUv.x - 0.5) * 2.0;
  float shallow = 0.0;
  for (int k = 0; k < ${MAX_SHALLOWS}; k++) {
    vec3 s = uShallowsC[k];
    if (s.z > 0.0) shallow = max(shallow, 1.0 - smoothstep(s.z * 0.55, s.z + 1.6, distance(vDhWorld.xz, s.xy)));
  }
  float depth = (1.0 - across * across) * (1.0 - shallow * 0.85);
  vec3 col = mix(uShallow, uDeep, smoothstep(0.05, 0.85, depth));
  // Two ripple layers drifting downstream at two speeds, posterised to painted streaks.
  vec2 f1 = vec2(vUv.x * 5.0, vUv.y * 0.32 - uTime * 0.55);
  vec2 f2 = vec2(vUv.x * 9.0 + 3.0, vUv.y * 0.75 - uTime * 0.95);
  float n = dhNoise(f1) * 0.6 + dhNoise(f2) * 0.4;
  float streak = smoothstep(0.6, 0.66, n) - smoothstep(0.74, 0.8, n) * 0.5;
  col = mix(col, uShallow * 1.18 + 0.03, streak * 0.4);
  float dark = smoothstep(0.34, 0.28, n) * depth;
  col = mix(col, uDeep * 0.82, dark * 0.35);
  // Foam: noise-cut two-step at the banks and over the ford.
  float fn = dhNoise(vec2(vUv.x * 13.0, vUv.y * 1.4 - uTime * 0.8));
  float foamEdge = step(0.84, across + fn * 0.16) ;
  float foamSoft = smoothstep(0.7, 0.84, across + fn * 0.16) * 0.45;
  float fordNoise = dhNoise(vDhWorld.xz * 1.5 + vec2(uTime * 0.25, -uTime * 0.9));
  float foamFord = shallow * (step(0.58, fordNoise) * 0.9 + smoothstep(0.42, 0.58, fordNoise) * 0.3);
  col = mix(col, uFoam, clamp(max(max(foamEdge * 0.85, foamSoft), foamFord), 0.0, 1.0));
  // Stepped sparkles where the sun glints.
  float glint = step(0.9, dhNoise(vDhWorld.xz * 2.6 + uTime * vec2(0.35, -0.7))) * step(0.55, dhNoise(vDhWorld.xz * 0.45 - uTime * 0.2));
  col += uSunColor * glint * 0.35 * (1.0 - foamEdge);
  col = dhMist(col, vDhWorld);
  float alpha = mix(0.9, 0.62, shallow) * (1.0 - smoothstep(0.9, 1.0, across)) ;
  alpha = max(alpha, foamEdge * (1.0 - smoothstep(0.96, 1.0, across)));
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/** Ribbon along the river: `columns` vertices across, one row per centreline sample. */
function riverGeometry(terrain: PaintedTerrain, columns: number): THREE.BufferGeometry {
  const river = terrain.field.river!;
  const { line, widths } = river;
  const rows = line.count;
  const positions = new Float32Array(rows * columns * 3);
  const uvs = new Float32Array(rows * columns * 2);
  const y = terrain.field.waterLevel;
  for (let row = 0; row < rows; row += 1) {
    const prev = Math.max(0, row - 1);
    const next = Math.min(rows - 1, row + 1);
    let dx = line.xs[next]! - line.xs[prev]!;
    let dz = line.zs[next]! - line.zs[prev]!;
    const length = Math.hypot(dx, dz) || 1;
    dx /= length;
    dz /= length;
    // Reaches 0.6 m into the banks, which rise above the water and hide the edge.
    const half = widths[row]! / 2 + 0.6;
    for (let col = 0; col < columns; col += 1) {
      const u = col / (columns - 1);
      const offset = (u - 0.5) * 2 * half;
      const index = row * columns + col;
      positions[index * 3] = line.xs[row]! - dz * offset;
      positions[index * 3 + 1] = y;
      positions[index * 3 + 2] = line.zs[row]! + dx * offset;
      uvs[index * 2] = u;
      uvs[index * 2 + 1] = line.cum[row]!;
    }
  }
  const indices: number[] = [];
  for (let row = 0; row < rows - 1; row += 1) {
    for (let col = 0; col < columns - 1; col += 1) {
      const a = row * columns + col;
      const b = a + 1;
      const c = a + columns;
      const d = c + 1;
      // Counter-clockwise seen from above (the ribbon's u runs against +x).
      indices.push(a, b, c, b, d, c);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

const POND_VERTEX = /* glsl */ `
attribute float aDepth;
varying float vDepth;
varying vec3 vDhWorld;
void main() {
  vDepth = aDepth;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vDhWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

/** Map spike pond: still water, deep in the middle, a foam ring, lily pads painted on the surface. */
const POND_FRAGMENT = /* glsl */ `
${DH_GLSL}
uniform vec3 uDeep;
uniform vec3 uShallow;
uniform vec3 uFoam;
uniform vec3 uPad;
uniform vec3 uBloom;
varying float vDepth;
varying vec3 vDhWorld;
void main() {
  vec2 p = vDhWorld.xz;
  float depth = clamp(vDepth, 0.0, 1.0);
  vec3 col = mix(uShallow, uDeep, smoothstep(0.05, 0.75, depth));
  float n = dhNoise(p * 0.8 + uTime * vec2(0.12, 0.07)) * 0.6 + dhNoise(p * 2.2 - uTime * 0.16) * 0.4;
  col = mix(col, uShallow * 1.16 + 0.03, smoothstep(0.62, 0.7, n) * 0.35);
  col = mix(col, uDeep * 0.85, smoothstep(0.34, 0.26, n) * depth * 0.3);
  // Lily pads: one per 1.4 m cell in 40 % of the cells, a round leaf with a wedge cut, kept off the rim.
  vec2 cell = floor(p / 1.4);
  vec2 ctr = (cell + 0.5 + (vec2(dhHash(cell + 1.7), dhHash(cell + 8.3)) - 0.5) * 0.45) * 1.4;
  float pr = 0.24 + 0.2 * dhHash(cell + 3.3);
  vec2 dv = p - ctr;
  float a = atan(dv.y, dv.x) + dhHash(cell + 9.1) * 6.2832;
  float wedge = step(0.42, abs(mod(a, 6.2832) - 3.1416));
  float on = step(dhHash(cell + 4.2), 0.4) * smoothstep(0.12, 0.3, depth);
  float pad = (1.0 - smoothstep(pr - 0.035, pr, length(dv))) * wedge * on;
  vec3 padC = mix(uPad * 0.8, uPad * 1.15, smoothstep(0.0, pr, length(dv)) * 0.6 + dhNoise(dv * 9.0) * 0.4);
  col = mix(col, padC, pad);
  float bloom = (1.0 - smoothstep(0.06, 0.09, length(dv - vec2(pr * 0.25)))) * on * step(dhHash(cell + 6.6), 0.35);
  col = mix(col, uBloom, bloom);
  float foam = 1.0 - smoothstep(0.0, 0.07, depth + (n - 0.5) * 0.05);
  col = mix(col, uFoam, foam * 0.75);
  float glint = step(0.9, dhNoise(p * 2.6 + uTime * vec2(0.2, -0.3))) * (1.0 - pad);
  col += uSunColor * glint * 0.25;
  col = dhMist(col, vDhWorld);
  gl_FragColor = vec4(col, mix(0.95, 0.75, 1.0 - depth));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/** A fan over the pond: centre (depth 1), the shore (0), a rim 0.6 m out under the bank (negative). */
function pondGeometry(terrain: PaintedTerrain): THREE.BufferGeometry | null {
  const pond = terrain.field.layout.pond;
  if (!pond || !Number.isFinite(terrain.field.pondLevel)) return null;
  const shore = pond.shore;
  const ring = shore.count - 1;
  const y = terrain.field.pondLevel;
  const positions: number[] = [pond.x, y, pond.z];
  const depths: number[] = [1];
  for (let k = 0; k < ring; k += 1) {
    const x = shore.xs[k]!;
    const z = shore.zs[k]!;
    const ox = x - pond.x;
    const oz = z - pond.z;
    const length = Math.hypot(ox, oz) || 1;
    positions.push(x, y, z);
    depths.push(0);
    positions.push(x + (ox / length) * 0.6, y, z + (oz / length) * 0.6);
    depths.push(-0.2);
  }
  const indices: number[] = [];
  for (let k = 0; k < ring; k += 1) {
    const a = 1 + k * 2;
    const b = 1 + ((k + 1) % ring) * 2;
    indices.push(0, b, a, a, b, b + 1, a, b + 1, a + 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("aDepth", new THREE.Float32BufferAttribute(depths, 1));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

export function buildWater(map: MapDef, terrain: PaintedTerrain): WaterView {
  const group = new THREE.Group();
  group.name = "dh-water";
  const disposables: { dispose(): void }[] = [];
  const pondShape = pondGeometry(terrain);
  if (pondShape) {
    const pondMaterial = new THREE.ShaderMaterial({
      vertexShader: POND_VERTEX,
      fragmentShader: POND_FRAGMENT,
      uniforms: {
        ...terrain.look.uniforms,
        uDeep: { value: new THREE.Color("#24555c") },
        uShallow: { value: new THREE.Color("#5f978f") },
        uFoam: { value: new THREE.Color("#eef3ea") },
        uPad: { value: new THREE.Color("#5d8a4a") },
        uBloom: { value: new THREE.Color("#f1ead8") },
      },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const pondMesh = new THREE.Mesh(pondShape, pondMaterial);
    pondMesh.name = "dh-pond";
    pondMesh.renderOrder = 2;
    group.add(pondMesh);
    disposables.push(pondShape, pondMaterial);
  }
  if (!map.river || !terrain.field.river) {
    return {
      group,
      update: () => undefined,
      dispose: () => {
        group.removeFromParent();
        for (const item of disposables) item.dispose();
      },
    };
  }
  const shallows = Array.from({ length: MAX_SHALLOWS }, (_, index) => {
    const shallow = map.river!.shallows[index];
    return shallow ? new THREE.Vector3(shallow.center[0], shallow.center[1], shallow.radiusM) : new THREE.Vector3(0, 0, 0);
  });
  const material = new THREE.ShaderMaterial({
    vertexShader: WATER_VERTEX,
    fragmentShader: WATER_FRAGMENT,
    uniforms: {
      ...terrain.look.uniforms,
      // Dark jade, desaturated (05 §2.2: never the semantic teal near the paths).
      uDeep: { value: new THREE.Color("#2b6466") },
      uShallow: { value: new THREE.Color("#66a093") },
      uFoam: { value: new THREE.Color("#eef3ea") },
      uShallowsC: { value: shallows },
    },
    transparent: true,
    depthWrite: false,
  });
  const surface = new THREE.Mesh(riverGeometry(terrain, 12), material);
  surface.name = "dh-river";
  surface.renderOrder = 2;
  surface.frustumCulled = false;
  group.add(surface);
  disposables.push(surface.geometry, material);

  // Stepping stones at each ford, beside the lane so feet stay on the dirt.
  const random = seededRandom(map.terrain.seed + 77);
  const stones: THREE.Matrix4[] = [];
  const quaternion = new THREE.Quaternion();
  for (const shallow of map.river.shallows) {
    for (let index = 0; index < 14; index += 1) {
      const angle = random() * Math.PI * 2;
      const reach = shallow.radiusM * (0.35 + random() * 0.85);
      const x = shallow.center[0] + Math.cos(angle) * reach;
      const z = shallow.center[1] + Math.sin(angle) * reach;
      const lane = terrain.field.laneAt(x, z);
      if (lane.dist < lane.half + 0.4) continue;
      if (terrain.field.riverEdge(x, z) > -0.2) continue;
      const size = 0.22 + random() * 0.32;
      quaternion.setFromEuler(new THREE.Euler(random() * 0.4, random() * Math.PI * 2, random() * 0.4));
      stones.push(new THREE.Matrix4().compose(new THREE.Vector3(x, terrain.field.waterLevel - 0.05, z), quaternion, new THREE.Vector3(size * 1.3, size * 0.75, size)));
    }
  }
  if (stones.length > 0) {
    const geometry = new THREE.IcosahedronGeometry(1, 0);
    const stoneMaterial = paintMaterial(new THREE.MeshLambertMaterial({ color: "#9b97a6", flatShading: true }), terrain.look, { key: "ford-stone", rim: 0.06 });
    const mesh = new THREE.InstancedMesh(geometry, stoneMaterial, stones.length);
    stones.forEach((matrix, index) => mesh.setMatrixAt(index, matrix));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = "dh-ford-stones";
    group.add(mesh);
    disposables.push(geometry, stoneMaterial, mesh);
  }

  return {
    group,
    update(): void {
      // Time lives in the shared look (terrain.update advances it).
    },
    dispose(): void {
      group.removeFromParent();
      for (const item of disposables) item.dispose();
    },
  };
}
