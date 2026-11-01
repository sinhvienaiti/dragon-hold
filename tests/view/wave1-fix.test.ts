// Quality rescue wave 1 fix (01/11, review low findings 7-9): the prop LODs bin in MapStage.render's own call (no
// scene hook anyone restores), scene hooks are a registry (a disposed presenter removes only its own), binLod copies
// with index loops (no subarray per item), and a road texture that arrives after dispose() is freed. No WebGL needed.
import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MAP_L2_CAU } from "../../src/content/data/maps";
import { PROP_SPECS } from "../../src/view/model-specs";
import type { PropModel } from "../../src/view/models";
import { addSceneHook } from "../../src/view/scene-hooks";
import { binLod, buildScatter, PROP_LOD_M, type LodGroup } from "../../src/view/scatter";
import { buildTerrain } from "../../src/view/terrain";

const terrain = buildTerrain(MAP_L2_CAU, "ultra");

/** A stand-in GLB prop: a unit box (near) and a smaller box (far LOD). */
function fakeProp(manifest: string): PropModel {
  const geometry = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  return { manifest, geometry, far: new THREE.BoxGeometry(0.5, 1, 0.5).translate(0, 0.5, 0), size: new THREE.Vector3(1, 1, 1), triangles: 12, map: null, normalMap: null, roughnessMap: null } as unknown as PropModel;
}

/** Near and far instance counts of every prop group that has a far LOD. */
function counts(group: THREE.Group): { near: number; far: number } {
  let near = 0;
  let far = 0;
  group.traverse((object) => {
    const mesh = object as THREE.InstancedMesh;
    if (!mesh.isInstancedMesh || !mesh.name.startsWith("dh-prop-")) return;
    if (mesh.name.endsWith("-far")) far += mesh.count;
    else if (group.getObjectByName(mesh.name + "-far")) near += mesh.count;
  });
  return { near, far };
}

afterEach(() => vi.restoreAllMocks());

describe("wave 1 fix: prop LODs bin in an owned per-frame call", () => {
  it("leaves scene.onBeforeRender alone and bins on updateLod, whatever scene hooks come and go", () => {
    const scene = new THREE.Scene();
    const own = scene.onBeforeRender;
    const scatter = buildScatter(MAP_L2_CAU, terrain, "ultra");
    scene.add(scatter.group);
    // An effects presenter built before the models load (the review's case), then the props swap in.
    const fxA = vi.fn();
    const removeA = addSceneHook(scene, "before", fxA);
    const hooked = scene.onBeforeRender;
    scatter.useProps((manifest) => (PROP_SPECS.some((spec) => spec.manifest === manifest) ? fakeProp(manifest) : null));
    expect(scene.onBeforeRender).toBe(hooked);
    expect(own).not.toBe(hooked);
    // A replay builds presenter B, then disposes A: B keeps running.
    const fxB = vi.fn();
    addSceneHook(scene, "before", fxB);
    removeA();
    removeA();
    const renderer = {} as THREE.WebGLRenderer;
    const camera = new THREE.PerspectiveCamera();
    scene.onBeforeRender(renderer, scene, camera, null as never, null as never, null as never);
    expect(fxA).not.toHaveBeenCalled();
    expect(fxB).toHaveBeenCalledTimes(1);
    // The camera far out: every LOD item draws its far mesh; at the dais they come back near.
    const before = counts(scatter.group);
    expect(before.far).toBe(0);
    camera.position.set(0, 400, 0);
    scatter.updateLod(camera);
    const away = counts(scatter.group);
    expect(away.near).toBe(0);
    expect(away.far).toBe(before.near);
    camera.position.set(0, 20, 0);
    scatter.updateLod(camera);
    const home = counts(scatter.group);
    expect(home.near).toBeGreaterThan(0);
    expect(home.near + home.far).toBe(before.near);
    // Under a metre of movement: no re-bin.
    const bin = vi.spyOn(Float32Array.prototype, "subarray");
    camera.position.set(0.4, 20, 0.4);
    scatter.updateLod(camera);
    expect(counts(scatter.group)).toEqual(home);
    expect(bin).not.toHaveBeenCalled();
    scatter.dispose();
  });

  it("binLod copies matrices and colours with index loops (no subarray per item)", () => {
    const n = 5;
    const make = () => {
      const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial(), n);
      mesh.setColorAt(0, new THREE.Color(0, 0, 0));
      return mesh;
    };
    const lod: LodGroup = { near: make(), far: make(), matrices: new Float32Array(n * 16), colors: new Float32Array(n * 3), centers: new Float32Array(n * 3), side: new Int8Array(n) };
    for (let i = 0; i < n; i += 1) {
      new THREE.Matrix4().makeTranslation(i * 40, 0, 0).toArray(lod.matrices, i * 16);
      lod.colors[i * 3 + 1] = i;
      lod.centers[i * 3] = i * 40;
    }
    const subarray = vi.spyOn(Float32Array.prototype, "subarray");
    binLod(lod, new THREE.Vector3(), PROP_LOD_M.ultra);
    expect(subarray).not.toHaveBeenCalled();
    // 0, 40, 80 m near (85 m switch), 120 and 160 far, in order, with their own colour.
    expect([lod.near.count, lod.far.count]).toEqual([3, 2]);
    const m = new THREE.Matrix4();
    lod.far.getMatrixAt(1, m);
    expect(new THREE.Vector3().setFromMatrixPosition(m).x).toBe(160);
    expect((lod.far.instanceColor!.array as Float32Array)[4]).toBe(4);
  });
});

describe("wave 1 fix: roads free a texture that arrives after dispose", () => {
  it("disposes a late road texture instead of keeping it", async () => {
    vi.resetModules();
    vi.doMock("../../src/view/paint", async (importOriginal) => {
      const real = await importOriginal<typeof import("../../src/view/paint")>();
      return { ...real, manifestOf: async () => ({ textures: { "road/road-flagstone": { url: "/late.webp" } } }) };
    });
    let arrive: (texture: THREE.Texture) => void = () => {};
    const { buildRoads } = await import("../../src/view/roads");
    const three = await import("three");
    vi.spyOn(three.TextureLoader.prototype, "loadAsync").mockImplementation(() => new Promise((done) => (arrive = done)));
    const roads = buildRoads(MAP_L2_CAU, terrain);
    await new Promise((done) => setTimeout(done, 0));
    roads.dispose();
    const late = new three.Texture();
    const freed = vi.spyOn(late, "dispose");
    arrive(late);
    await new Promise((done) => setTimeout(done, 0));
    expect(freed).toHaveBeenCalledTimes(1);
    expect(roads.sources.core).not.toBe("road/road-flagstone");
    vi.doUnmock("../../src/view/paint");
  });
});
