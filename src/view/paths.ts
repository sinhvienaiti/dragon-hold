/**
 * Dirt paths along MapDef.lanes (decals or painted ground), the bridge deck
 * as a placeholder primitive, faint sky-lane markers, slot ghosts shown only
 * while placing or in a break (05 §2.1), and the wave warning's lit lanes:
 * during the 6 s warning every lane the next wave uses glows and pulses with
 * light running toward the dais; a sky lane's chevrons run only while a wave
 * on the way uses it (26/10 review: the card said "Quái sắp vào từ các đường
 * sáng" and no lane lit, and the sky arrows ran under "Đường Trời: Yên").
 * The dirt itself is painted by the ground shader (terrain.ts, lane mask);
 * here: the bridge (boxes, one draw call), the sky lane (a faint drifting
 * ribbon at flight height) and the slot ghosts (one instanced quad each,
 * hidden unless asked).
 * M0b: the owner's old bridge (K12) replaces the box bridge once it loads,
 * fitted to each span with its deck at the deck height actors stand on
 * (heightAt and the sim are unchanged); the box bridge stays as the fallback.
 * Owner: view-terrain (LANES.md).
 */
import * as THREE from "three";
import type { MapDef, SlotKind, Vec2 } from "../content/types";
import type { PropModel } from "./models";
import { catmullRom, DH_GLSL, hash2, mergeSimple, paintMaterial, Polyline, type BridgeSpan, type PaintedTerrain } from "./terrain";

export interface PathsView {
  readonly group: THREE.Group;
  /** Shows or hides the slot markers (placement mode, breaks). */
  showSlots(visible: boolean, highlight?: readonly number[]): void;
  /** Lanes the coming wave uses (ground and sky ids); `warning`: its 6 s warning runs, so its ground lanes light up. */
  cueLanes(ids: readonly string[], warning: boolean): void;
  dispose(): void;
  /** Animates the sky marker and the slot pulse. */
  update(dt: number): void;
  /** Swaps the box bridge for the owner's GLB bridge (M0b); null keeps the boxes. */
  useBridge(prop: PropModel | null): void;
}

/** Height of a model's walkable top at its centre line (the deck under the rails), metres from its base. */
export function deckHeight(geometry: THREE.BufferGeometry): number {
  const position = geometry.getAttribute("position");
  const index = geometry.getIndex();
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  const width = box.max.x - box.min.x;
  // Highest surface over the middle fifth of the width along the middle half of the length.
  let best = -Infinity;
  const a = new THREE.Vector3();
  const count = index ? index.count : position.count;
  for (let i = 0; i < count; i += 1) {
    a.fromBufferAttribute(position, index ? index.getX(i) : i);
    if (Math.abs(a.x - (box.min.x + width / 2)) < width * 0.1 && Math.abs(a.z) < (box.max.z - box.min.z) * 0.25) best = Math.max(best, a.y);
  }
  return Number.isFinite(best) ? best - box.min.y : (box.max.y - box.min.y) * 0.5;
}

/** The GLB bridge over each span: centre, along the span, wide as the deck plus its rails, deck top on topY. */
function bridgeModel(prop: PropModel, bridges: readonly BridgeSpan[], material: THREE.Material): THREE.Group {
  const group = new THREE.Group();
  group.name = "dh-bridge-model";
  const deck = deckHeight(prop.geometry);
  const size = prop.size;
  for (const bridge of bridges) {
    const dx = bridge.bx - bridge.ax;
    const dz = bridge.bz - bridge.az;
    const length = Math.hypot(dx, dz);
    const along = (length + 1.6) / size.z;
    const across = (bridge.halfWidth * 2 + 0.9) / size.x;
    const up = (along + across) / 2;
    const mesh = new THREE.Mesh(prop.geometry, material);
    mesh.scale.set(across, up, along);
    mesh.rotation.y = Math.atan2(dx, dz);
    mesh.position.set((bridge.ax + bridge.bx) / 2, bridge.topY - deck * up, (bridge.az + bridge.bz) / 2);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}

/** Placeholder bridge: deck, side beams, rails and two piers, one merged mesh in wood tones. */
function bridgeMesh(terrain: PaintedTerrain): THREE.Mesh | null {
  const { bridges, waterLevel } = terrain.field;
  if (bridges.length === 0) return null;
  const parts: THREE.BufferGeometry[] = [];
  const colors: THREE.Color[] = [];
  const plank = new THREE.Color("#a8794c");
  const beam = new THREE.Color("#7a5537");
  const rail = new THREE.Color("#8d6440");
  const pier = new THREE.Color("#8e8796");
  const add = (geometry: THREE.BufferGeometry, color: THREE.Color): void => {
    parts.push(geometry);
    colors.push(color);
  };
  for (const bridge of bridges) {
    const dx = bridge.bx - bridge.ax;
    const dz = bridge.bz - bridge.az;
    const length = Math.hypot(dx, dz);
    const yaw = Math.atan2(dx, dz);
    const place = (geometry: THREE.BufferGeometry, along: number, lateral: number, y: number): THREE.BufferGeometry => {
      const t = along / length;
      const x = bridge.ax + dx * t + Math.cos(yaw) * lateral;
      const z = bridge.az + dz * t - Math.sin(yaw) * lateral;
      geometry.rotateY(yaw);
      geometry.translate(x, y, z);
      return geometry;
    };
    const width = bridge.halfWidth * 2;
    // Planks across the deck, small gaps between them.
    const plankStep = 0.55;
    for (let along = 0.3, index = 0; along < length; along += plankStep, index += 1) {
      const shade = plank.clone().multiplyScalar(0.88 + hash2(index, 3, 11) * 0.22);
      add(place(new THREE.BoxGeometry(width, 0.12, plankStep - 0.06), along, 0, bridge.topY - 0.06), shade);
    }
    // Side beams under the planks and rails on posts.
    for (const side of [-1, 1]) {
      add(place(new THREE.BoxGeometry(0.22, 0.3, length + 0.6), length / 2, side * (bridge.halfWidth - 0.15), bridge.topY - 0.25), beam);
      add(place(new THREE.BoxGeometry(0.12, 0.12, length + 0.2), length / 2, side * (bridge.halfWidth + 0.02), bridge.topY + 0.72), rail);
      for (let along = 0.2; along <= length - 0.1; along += length / Math.max(2, Math.round(length / 1.8))) {
        add(place(new THREE.BoxGeometry(0.16, 0.8, 0.16), along, side * (bridge.halfWidth + 0.02), bridge.topY + 0.34), beam);
      }
    }
    // Two piers standing in the water.
    for (const share of [0.36, 0.64]) {
      const height = bridge.topY - 0.3 - (waterLevel - 1.4);
      add(place(new THREE.BoxGeometry(width * 0.92, height, 0.5), length * share, 0, waterLevel - 1.4 + height / 2), pier);
    }
  }
  const geometry = mergeSimple(parts, colors);
  const material = paintMaterial(new THREE.MeshLambertMaterial({ vertexColors: true }), terrain.look, {
    key: "wood",
    paint: "diffuseColor.rgb *= 0.9 + 0.2 * dhNoise(vec2(vDhWorld.x + vDhWorld.z, vDhWorld.y) * vec2(1.5, 9.0));",
    rim: 0.08,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "dh-bridge";
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

const SKY_VERTEX = /* glsl */ `
varying vec2 vUv;
varying vec3 vDhWorld;
void main() {
  vUv = uv;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vDhWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

/** Soft-edged ribbon with chevrons drifting toward the dais; faint, never a semantic colour. */
const SKY_FRAGMENT = /* glsl */ `
${DH_GLSL}
uniform vec3 uTint;
uniform float uLength;
uniform float uOpacity;
uniform float uFlow;
varying vec2 vUv;
varying vec3 vDhWorld;
void main() {
  float across = abs(vUv.x - 0.5) * 2.0;
  float body = 1.0 - smoothstep(0.35, 1.0, across);
  // uFlow: the chevrons' phase, advanced only while a wave on the way uses this lane.
  float chevron = fract(vUv.y * 0.28 + across * 0.35 - uFlow * 0.45);
  float mark = smoothstep(0.0, 0.08, chevron) * (1.0 - smoothstep(0.18, 0.3, chevron));
  float ends = smoothstep(0.0, 4.0, vUv.y) * (1.0 - smoothstep(uLength - 3.0, uLength, vUv.y));
  float alpha = (body * 0.32 + mark * (1.0 - across) * 0.75) * ends * uOpacity;
  vec3 col = dhMist(uTint, vDhWorld);
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/**
 * A lit lane in the wave warning: a pulsing gold band with bright rims and
 * near-white chevrons running toward the dais. (A first cut in pale cream at
 * alpha 0.3 hardly showed on the light dirt in the 1280×720 pictures, 26/10.)
 */
const CUE_FRAGMENT = /* glsl */ `
${DH_GLSL}
uniform vec3 uTint;
uniform float uLength;
uniform float uOpacity;
varying vec2 vUv;
varying vec3 vDhWorld;
void main() {
  float across = abs(vUv.x - 0.5) * 2.0;
  float body = 1.0 - smoothstep(0.55, 1.0, across);
  float rim = smoothstep(0.6, 0.8, across) * (1.0 - smoothstep(0.86, 1.0, across));
  float chevron = fract(vUv.y * 0.22 + across * 0.3 - uTime * 0.9);
  float mark = smoothstep(0.0, 0.1, chevron) * (1.0 - smoothstep(0.24, 0.38, chevron));
  float pulse = 0.65 + 0.35 * sin(uTime * 6.0);
  float ends = smoothstep(0.0, 2.5, vUv.y) * (1.0 - smoothstep(uLength - 5.0, uLength - 1.0, vUv.y));
  vec3 colour = mix(uTint, vec3(1.0, 0.97, 0.86), mark * (1.0 - across));
  float alpha = min(1.0, body * 0.42 * pulse + rim * 0.6 + mark * (1.0 - across * 0.7) * 0.95) * ends * uOpacity;
  if (alpha < 0.01) discard;
  gl_FragColor = vec4(dhMist(colour, vDhWorld), alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/** A ribbon `half` metres either side of a smoothed line, `lift` above what actors stand on (ground, bridge deck); uv.y is metres along. */
function ribbon(points: readonly Vec2[], terrain: PaintedTerrain, half: number, lift: number): { geometry: THREE.BufferGeometry; length: number } {
  const smooth = catmullRom(points, 0.5);
  const line = new Polyline(smooth.points);
  const positions = new Float32Array(line.count * 6);
  const uvs = new Float32Array(line.count * 4);
  for (let row = 0; row < line.count; row += 1) {
    const prev = Math.max(0, row - 1);
    const next = Math.min(line.count - 1, row + 1);
    let dx = line.xs[next]! - line.xs[prev]!;
    let dz = line.zs[next]! - line.zs[prev]!;
    const length = Math.hypot(dx, dz) || 1;
    dx /= length;
    dz /= length;
    const x = line.xs[row]!;
    const z = line.zs[row]!;
    for (let col = 0; col < 2; col += 1) {
      const offset = (col === 0 ? -1 : 1) * half;
      const px = x - dz * offset;
      const pz = z + dx * offset;
      const index = row * 2 + col;
      positions[index * 3] = px;
      positions[index * 3 + 1] = terrain.heightAt(px, pz) + lift;
      positions[index * 3 + 2] = pz;
      uvs[index * 2] = col;
      uvs[index * 2 + 1] = line.cum[row]!;
    }
  }
  const indices: number[] = [];
  for (let row = 0; row < line.count - 1; row += 1) {
    const a = row * 2;
    indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return { geometry, length: line.length };
}

/** One lit-lane ribbon per dirt lane, hidden until a wave warning uses it. */
function cueMeshes(map: MapDef, terrain: PaintedTerrain, look: PaintedTerrain["look"]): THREE.Mesh[] {
  return map.lanes.map((lane) => {
    const { geometry, length } = ribbon(lane.points, terrain, (lane.widthM / 2) * 0.85, 0.1);
    const material = new THREE.ShaderMaterial({
      vertexShader: SKY_VERTEX,
      fragmentShader: CUE_FRAGMENT,
      uniforms: { ...look.uniforms, uTint: { value: new THREE.Color("#ffbd45") }, uLength: { value: length }, uOpacity: { value: 0 } },
      transparent: true,
      depthWrite: false,
      // The strip's winding faces down from the camera's side, as the sky ribbon's does.
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = "dh-lane-cue-" + lane.id;
    mesh.renderOrder = 4;
    mesh.visible = false;
    return mesh;
  });
}

function skyMesh(map: MapDef, terrain: PaintedTerrain, look: PaintedTerrain["look"]): THREE.Mesh[] {
  return map.sky.map((lane) => {
    const smooth = catmullRom(lane.points, 0.5);
    const line = new Polyline(smooth.points);
    const columns = 2;
    const positions = new Float32Array(line.count * columns * 3);
    const uvs = new Float32Array(line.count * columns * 2);
    const half = 0.75;
    for (let row = 0; row < line.count; row += 1) {
      const prev = Math.max(0, row - 1);
      const next = Math.min(line.count - 1, row + 1);
      let dx = line.xs[next]! - line.xs[prev]!;
      let dz = line.zs[next]! - line.zs[prev]!;
      const length = Math.hypot(dx, dz) || 1;
      dx /= length;
      dz /= length;
      const x = line.xs[row]!;
      const z = line.zs[row]!;
      // Just under the flight height, so flyers pass over their own lane.
      const y = terrain.heightAt(x, z) + lane.altitudeM * 0.85;
      for (let col = 0; col < columns; col += 1) {
        const offset = (col === 0 ? -1 : 1) * half;
        const index = row * columns + col;
        positions[index * 3] = x - dz * offset;
        positions[index * 3 + 1] = y;
        positions[index * 3 + 2] = z + dx * offset;
        uvs[index * 2] = col;
        uvs[index * 2 + 1] = line.cum[row]!;
      }
    }
    const indices: number[] = [];
    for (let row = 0; row < line.count - 1; row += 1) {
      const a = row * 2;
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    const material = new THREE.ShaderMaterial({
      vertexShader: SKY_VERTEX,
      fragmentShader: SKY_FRAGMENT,
      uniforms: { ...look.uniforms, uTint: { value: new THREE.Color("#f4efff") }, uLength: { value: line.length }, uOpacity: { value: SKY_ACTIVE }, uFlow: { value: 0 } },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = "dh-sky-" + lane.id;
    mesh.renderOrder = 6;
    return mesh;
  });
}

/** Sky ribbon opacity: a wave on the way uses the lane / it stays quiet ("Yên" on the wave card). */
const SKY_ACTIVE = 0.55;
const SKY_QUIET = 0.2;
/** Lit lanes fade in and out over this long, seconds. */
const CUE_FADE_S = 0.25;

const SLOT_SHAPE: Readonly<Record<SlotKind, number>> = { trap: 0, block: 1, house: 2 };
const SLOT_SIZE: Readonly<Record<SlotKind, number>> = { trap: 2.0, block: 1.8, house: 4.6 };

const SLOT_VERTEX = /* glsl */ `
attribute float aShape;
attribute float aLit;
varying vec2 vUv;
varying float vShape;
varying float vLit;
void main() {
  vUv = uv;
  vShape = aShape;
  vLit = aLit;
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
}
`;

/** Outline per slot kind (trap rounded square, block circle, house hexagon) with a dark halo for contrast on dirt. */
const SLOT_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform vec3 uTint;
uniform vec3 uLitTint;
uniform vec3 uHalo;
varying vec2 vUv;
varying float vShape;
varying float vLit;
float hexDist(vec2 p) {
  p = abs(p);
  return max(dot(p, vec2(0.8660254, 0.5)), p.y);
}
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  // d = 0.9 on the outline in every shape.
  float d;
  if (vShape < 0.5) {
    vec2 q = abs(p) - vec2(0.82 - 0.22);
    d = 0.9 + length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - 0.22;
  } else if (vShape < 1.5) {
    d = length(p) + 0.06;
  } else {
    d = hexDist(p) + 0.06;
  }
  float inner = 0.85 - vLit * 0.04;
  float line = smoothstep(inner - 0.03, inner, d) * (1.0 - smoothstep(0.91, 0.935, d));
  float halo = smoothstep(0.9, 0.935, d) * (1.0 - smoothstep(0.955, 0.99, d));
  float fill = (1.0 - smoothstep(inner - 0.04, inner, d)) * mix(0.1, 0.3, vLit);
  float pulse = 0.78 + 0.22 * sin(uTime * 4.0);
  vec3 tint = mix(uTint, uLitTint, vLit);
  vec3 col = mix(uHalo, tint, clamp(line + fill * 3.0, 0.0, 1.0));
  float alpha = clamp(line * 0.92 + halo * 0.42 + fill, 0.0, 1.0) * mix(0.8, pulse, vLit);
  if (alpha < 0.01) discard;
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export function buildPaths(map: MapDef, terrain: PaintedTerrain): PathsView {
  const group = new THREE.Group();
  group.name = "dh-paths";
  const disposables: { dispose(): void }[] = [];
  const look = terrain.look;

  const bridge = bridgeMesh(terrain);
  if (bridge) {
    group.add(bridge);
    disposables.push(bridge.geometry, bridge.material as THREE.Material);
  }

  const skies = skyMesh(map, terrain, look);
  for (const mesh of skies) {
    group.add(mesh);
    disposables.push(mesh.geometry, mesh.material as THREE.Material);
  }
  const cues = cueMeshes(map, terrain, look);
  for (const mesh of cues) {
    group.add(mesh);
    disposables.push(mesh.geometry, mesh.material as THREE.Material);
  }
  // Targets of the lit lanes (0–1) and of the sky lanes (active or not); `update` eases toward them.
  // Sky lanes start active: a page that never cues (terrain preview, bench) looks as before.
  const cueTarget = new Float32Array(cues.length);
  const skyActive = new Uint8Array(skies.length).fill(1);

  // Slot ghosts: one instanced flat quad per slot, lying on the ground.
  const slots = map.slots;
  const quad = new THREE.PlaneGeometry(1, 1);
  quad.rotateX(-Math.PI / 2);
  const shapes = new Float32Array(slots.length);
  const lit = new Float32Array(slots.length);
  const slotUniforms = { uTime: look.uniforms.uTime, uTint: { value: new THREE.Color("#efe4c4") }, uLitTint: { value: new THREE.Color("#ffffff") }, uHalo: { value: new THREE.Color("#2e261d") } };
  const slotMaterial = new THREE.ShaderMaterial({
    vertexShader: SLOT_VERTEX,
    fragmentShader: SLOT_FRAGMENT,
    uniforms: slotUniforms,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const ghosts = new THREE.InstancedMesh(quad, slotMaterial, Math.max(1, slots.length));
  const matrix = new THREE.Matrix4();
  slots.forEach((slot, index) => {
    const size = SLOT_SIZE[slot.kind];
    const [x, z] = slot.pos;
    matrix.makeScale(size, 1, size);
    matrix.setPosition(x, terrain.heightAt(x, z) + 0.06, z);
    ghosts.setMatrixAt(index, matrix);
    shapes[index] = SLOT_SHAPE[slot.kind];
  });
  ghosts.count = slots.length;
  quad.setAttribute("aShape", new THREE.InstancedBufferAttribute(shapes, 1));
  const litAttribute = new THREE.InstancedBufferAttribute(lit, 1);
  quad.setAttribute("aLit", litAttribute);
  ghosts.instanceMatrix.needsUpdate = true;
  ghosts.visible = false;
  ghosts.renderOrder = 5;
  ghosts.frustumCulled = false;
  ghosts.name = "dh-slot-ghosts";
  group.add(ghosts);
  disposables.push(quad, slotMaterial, ghosts);

  return {
    group,
    showSlots(visible: boolean, highlight: readonly number[] = []): void {
      ghosts.visible = visible && slots.length > 0;
      lit.fill(0);
      for (const index of highlight) if (index >= 0 && index < lit.length) lit[index] = 1;
      litAttribute.needsUpdate = true;
    },
    cueLanes(ids: readonly string[], warning: boolean): void {
      map.lanes.forEach((lane, index) => {
        cueTarget[index] = warning && ids.includes(lane.id) ? 1 : 0;
      });
      map.sky.forEach((lane, index) => {
        skyActive[index] = ids.includes(lane.id) ? 1 : 0;
      });
    },
    update(dt: number): void {
      // Time lives in the shared look (terrain.update advances it); the cues ease toward their targets.
      const step = dt / CUE_FADE_S;
      cues.forEach((mesh, index) => {
        const uniforms = (mesh.material as THREE.ShaderMaterial).uniforms;
        const value = uniforms.uOpacity!.value as number;
        const next = value + Math.max(-step, Math.min(step, cueTarget[index]! - value));
        uniforms.uOpacity!.value = next;
        mesh.visible = next > 0.001;
      });
      skies.forEach((mesh, index) => {
        const uniforms = (mesh.material as THREE.ShaderMaterial).uniforms;
        const goal = skyActive[index] === 1 ? SKY_ACTIVE : SKY_QUIET;
        const value = uniforms.uOpacity!.value as number;
        const skyStep = step * (SKY_ACTIVE - SKY_QUIET);
        uniforms.uOpacity!.value = value + Math.max(-skyStep, Math.min(skyStep, goal - value));
        // Chevrons drift only on an active lane.
        if (skyActive[index] === 1) uniforms.uFlow!.value = (uniforms.uFlow!.value as number) + dt;
      });
    },
    useBridge(prop: PropModel | null): void {
      if (prop === null || bridge === null || terrain.field.bridges.length === 0) return;
      const material = paintMaterial(new THREE.MeshLambertMaterial({ color: "#ffffff", map: prop.map }), look, { key: "bridge-model", rim: 0.08 });
      const model = bridgeModel(prop, terrain.field.bridges, material);
      bridge.visible = false;
      group.add(model);
      disposables.push(material);
    },
    dispose(): void {
      group.removeFromParent();
      for (const item of disposables) item.dispose();
    },
  };
}
