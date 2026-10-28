/**
 * Map spike far ring (parent docs/tools/MAP_FACTORY.md §4.2 "I": one impostor
 * atlas for the far ring of a kit): each kit tree is rendered once at load
 * into one cell of an atlas (orthographic, from 55° above, flat soft light),
 * and every far tree is a camera-facing quad of its cell anchored at its
 * base: one draw call and two triangles a tree, no shadow, the shared mist.
 * Instances mirror at random and carry a tint, so a ring of one picture does
 * not look stamped. The core will bake the atlas once per kit with Blender
 * (bake_impostor.py); this runtime bake stands in for it in the spike.
 * Owner: map spike.
 */
import * as THREE from "three";
import type { PropModel } from "./models";
import { DH_GLSL, type PaintLook } from "./terrain";

/** Bake elevation (degrees above the horizon) and the cell size in texels. */
export const IMPOSTOR = { elevationDeg: 55, cellPx: 256, columns: 4 } as const;

export interface ImpostorCell {
  /** Atlas rectangle (u, v, width, height in uv). */
  readonly rect: THREE.Vector4;
  /** Quad size per unit of model scale (metres), and where the model's base sits in it (share of the height from the bottom). */
  readonly width: number;
  readonly height: number;
  readonly baseV: number;
}

export interface ImpostorAtlas {
  readonly texture: THREE.Texture;
  readonly cells: ReadonlyMap<string, ImpostorCell>;
  dispose(): void;
}

/** Renders each prop into one atlas cell (the renderer's state is restored afterwards). */
export function bakeImpostors(renderer: THREE.WebGLRenderer, props: readonly PropModel[], paint: Readonly<Record<string, (material: THREE.MeshLambertMaterial) => void>> = {}): ImpostorAtlas {
  const { cellPx, columns } = IMPOSTOR;
  const rows = Math.max(1, Math.ceil(props.length / columns));
  const target = new THREE.WebGLRenderTarget(cellPx * columns, cellPx * rows, { type: THREE.UnsignedByteType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter });
  target.texture.colorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight("#dfe8ff", "#6f6a80", 2.0));
  const sun = new THREE.DirectionalLight("#fff0d8", 2.2);
  sun.position.set(-0.4, 1, 0.8);
  scene.add(sun);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 100);
  const elevation = (IMPOSTOR.elevationDeg * Math.PI) / 180;
  const cells = new Map<string, ImpostorCell>();
  const previous = { target: renderer.getRenderTarget(), clear: renderer.getClearColor(new THREE.Color()), alpha: renderer.getClearAlpha(), autoClear: renderer.autoClear, viewport: new THREE.Vector4(), scissor: new THREE.Vector4(), scissorTest: renderer.getScissorTest(), shadows: renderer.shadowMap.enabled, toneMapping: renderer.toneMapping };
  renderer.getViewport(previous.viewport);
  renderer.getScissor(previous.scissor);
  renderer.setRenderTarget(target);
  renderer.setClearColor(0x000000, 0);
  renderer.autoClear = false;
  renderer.shadowMap.enabled = false;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.clear(true, true, true);
  renderer.setScissorTest(true);
  const materials: THREE.Material[] = [];
  props.forEach((prop, index) => {
    const material = new THREE.MeshLambertMaterial({ map: prop.map });
    paint[prop.manifest]?.(material);
    materials.push(material);
    const mesh = new THREE.Mesh(prop.geometry, material);
    scene.add(mesh);
    // Orthographic frame round the model seen from `elevation` above (model base at the origin, size ≈ 1).
    const box = prop.geometry.boundingBox ?? new THREE.Box3().setFromBufferAttribute(prop.geometry.getAttribute("position") as THREE.BufferAttribute);
    const halfW = Math.max(box.max.x - box.min.x, box.max.z - box.min.z) / 2 + 0.02;
    const top = box.max.y * Math.cos(elevation) + halfW * Math.sin(elevation);
    const bottom = -halfW * Math.sin(elevation);
    const halfH = (top - bottom) / 2 + 0.02;
    const half = Math.max(halfW, halfH);
    const centreY = (top + bottom) / 2;
    camera.left = -half;
    camera.right = half;
    camera.top = half;
    camera.bottom = -half;
    camera.updateProjectionMatrix();
    // Camera on the +z side looking back and down; screen-up through the model's up axis.
    const dir = new THREE.Vector3(0, Math.sin(elevation), Math.cos(elevation));
    const up = new THREE.Vector3(0, Math.cos(elevation), -Math.sin(elevation));
    const centre = up.clone().multiplyScalar(centreY);
    camera.position.copy(centre).addScaledVector(dir, 20);
    camera.up.copy(up);
    camera.lookAt(centre);
    const col = index % columns;
    const row = Math.floor(index / columns);
    renderer.setViewport(col * cellPx, row * cellPx, cellPx, cellPx);
    renderer.setScissor(col * cellPx, row * cellPx, cellPx, cellPx);
    renderer.render(scene, camera);
    scene.remove(mesh);
    // The base (origin) sits at screen height (0 − centreY) / half in −1..1.
    cells.set(prop.manifest, {
      rect: new THREE.Vector4(col / columns, row / rows, 1 / columns, 1 / rows),
      width: half * 2,
      height: half * 2,
      baseV: (-centreY / half) * 0.5 + 0.5,
    });
  });
  renderer.setScissorTest(previous.scissorTest);
  renderer.setScissor(previous.scissor);
  renderer.setViewport(previous.viewport);
  renderer.setRenderTarget(previous.target);
  renderer.setClearColor(previous.clear, previous.alpha);
  renderer.autoClear = previous.autoClear;
  renderer.shadowMap.enabled = previous.shadows;
  renderer.toneMapping = previous.toneMapping;
  target.texture.generateMipmaps = true;
  for (const material of materials) material.dispose();
  return {
    texture: target.texture,
    cells,
    dispose(): void {
      target.dispose();
    },
  };
}

const VERTEX = /* glsl */ `
attribute vec4 aRect;
attribute vec3 aSize;
attribute vec3 aTint;
varying vec2 vUv;
varying vec3 vTint;
varying vec3 vDhWorld;
void main() {
  vec3 base = instanceMatrix[3].xyz;
  float s = length(instanceMatrix[0].xyz);
  // aSize: quad width, height (per unit scale), base height share; position.xy in [-0.5, 0.5].
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  float mirror = sign(instanceMatrix[0][0] + 1e-4);
  float x = position.x * aSize.x * s;
  float y = (position.y + 0.5 - aSize.z) * aSize.y * s;
  vec3 world = base + right * x + up * y;
  vDhWorld = world;
  vec2 uv = position.xy + 0.5;
  if (mirror < 0.0) uv.x = 1.0 - uv.x;
  vUv = aRect.xy + uv * aRect.zw;
  vTint = aTint;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`;

const FRAGMENT = /* glsl */ `
${DH_GLSL}
uniform sampler2D uAtlas;
varying vec2 vUv;
varying vec3 vTint;
varying vec3 vDhWorld;
void main() {
  vec4 t = texture2D(uAtlas, vUv);
  if (t.a < 0.5) discard;
  vec3 col = t.rgb / max(t.a, 1e-3) * vTint;
  col = dhMist(col, vDhWorld);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;

export interface FarItem {
  readonly manifest: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Model scale (metres per model unit). */
  readonly k: number;
  readonly mirror: boolean;
  readonly tint: readonly [number, number, number];
}

/** One instanced quad mesh for every far item (cells it has no picture for are skipped). */
export function farRing(atlas: ImpostorAtlas, items: readonly FarItem[], look: PaintLook): THREE.InstancedMesh {
  const usable = items.filter((item) => atlas.cells.has(item.manifest));
  const quad = new THREE.PlaneGeometry(1, 1);
  const rects = new Float32Array(usable.length * 4);
  const sizes = new Float32Array(usable.length * 3);
  const tints = new Float32Array(usable.length * 3);
  const matrix = new THREE.Matrix4();
  const material = new THREE.ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    uniforms: { ...look.uniforms, uAtlas: { value: atlas.texture } },
  });
  const mesh = new THREE.InstancedMesh(quad, material, Math.max(1, usable.length));
  mesh.count = usable.length;
  usable.forEach((item, index) => {
    const cell = atlas.cells.get(item.manifest)!;
    rects.set([cell.rect.x, cell.rect.y, cell.rect.z, cell.rect.w], index * 4);
    sizes.set([cell.width, cell.height, cell.baseV], index * 3);
    tints.set(item.tint, index * 3);
    matrix.makeScale(item.mirror ? -item.k : item.k, item.k, item.k).setPosition(item.x, item.y, item.z);
    mesh.setMatrixAt(index, matrix);
  });
  quad.setAttribute("aRect", new THREE.InstancedBufferAttribute(rects, 4));
  quad.setAttribute("aSize", new THREE.InstancedBufferAttribute(sizes, 3));
  quad.setAttribute("aTint", new THREE.InstancedBufferAttribute(tints, 3));
  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.name = "dh-far-ring";
  return mesh;
}
