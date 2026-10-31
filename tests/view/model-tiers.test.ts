// Model tiers lane (29/10, parent docs/games/MODEL_QUALITY.md §2b, §3): the scatter's LOD by distance, the
// painted props' maps, and the crowd hull (outline and ghost on the lighter mesh). No WebGL needed.
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { ENEMIES } from "../../src/content/data/enemies";
import { createCrowd } from "../../src/view/crowd";
import { PROP_GLOSS, surfaceParams } from "../../src/view/models";
import { binLod, PROP_LOD_M, type LodGroup } from "../../src/view/scatter";

/** A LOD group of items at (x, 0, 0) for each x, unit matrices offset by x, colour (x, 0, 0). */
function group(xs: readonly number[]): LodGroup {
  const make = () => {
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial(), xs.length);
    mesh.setColorAt(0, new THREE.Color(0, 0, 0));
    return mesh;
  };
  const matrices = new Float32Array(xs.length * 16);
  const colors = new Float32Array(xs.length * 3);
  const centers = new Float32Array(xs.length * 3);
  xs.forEach((x, i) => {
    new THREE.Matrix4().makeTranslation(x, 0, 0).toArray(matrices, i * 16);
    colors[i * 3] = x;
    centers[i * 3] = x;
  });
  return { near: make(), far: make(), matrices, colors, centers, side: new Int8Array(xs.length) };
}

describe("model tiers", () => {
  it("bins scatter props near or far by camera distance, with a 4 m band against flicker", () => {
    const lod = group([10, 60, 69, 72, 80, 120]);
    const eye = new THREE.Vector3(0, 0, 0);
    binLod(lod, eye, 70);
    // Every item starts near: 72 is inside the band (70 + 4) and stays near, 80 and 120 go far.
    expect(lod.near.count).toBe(4);
    expect(lod.far.count).toBe(2);
    const m = new THREE.Matrix4();
    lod.far.getMatrixAt(0, m);
    expect(new THREE.Vector3().setFromMatrixPosition(m).x).toBe(80);
    expect((lod.far.instanceColor!.array as Float32Array)[3]).toBe(120);
    // The camera backs off 5 m: 69 → 74 (inside the band: stays near), 72 → 77 goes far.
    binLod(lod, eye.set(-5, 0, 0), 70);
    expect(lod.near.count).toBe(3);
    expect(lod.far.count).toBe(3);
    // Coming back, a far item returns only under 70 m: at 2 m back 72 (74 m) stays far; 3 m forward (69 m) it is near.
    binLod(lod, eye.set(-2, 0, 0), 70);
    expect(lod.far.count).toBe(3);
    binLod(lod, eye.set(3, 0, 0), 70);
    expect(lod.far.count).toBe(2);
  });

  it("keeps the near meshes at High out to 70 m and further at Ultra; Low draws no 3D", () => {
    expect(PROP_LOD_M.low).toBe(0);
    expect(PROP_LOD_M.medium).toBeLessThan(PROP_LOD_M.high);
    expect(PROP_LOD_M.high).toBeLessThan(PROP_LOD_M.ultra);
  });

  it("gives painted props the normal map when the tier has one, and keeps foliage matte", () => {
    const map = new THREE.Texture();
    const normalMap = new THREE.Texture();
    const withNormal = surfaceParams({ map, normalMap, normalScale: new THREE.Vector2(1, -1), roughnessMap: null, roughness: 0.9 });
    expect(withNormal.map).toBe(map);
    expect(withNormal.normalMap).toBe(normalMap);
    expect((withNormal.normalScale as THREE.Vector2).y).toBe(-1);
    expect(surfaceParams({ map, normalMap: null, normalScale: new THREE.Vector2(1, 1), roughnessMap: null, roughness: 0.9 })).toEqual({ map });
    expect(PROP_GLOSS.foliage.floor).toBeGreaterThan(PROP_GLOSS.solid.floor);
  });

  it("draws a model layer's outline and ghost from its hull mesh, sharing the body's instance attributes", () => {
    const crowd = createCrowd(8);
    const body = new THREE.BoxGeometry(1, 2, 1, 4, 4, 4).translate(0, 1, 0);
    const hull = new THREE.BoxGeometry(1, 2, 1).translate(0, 1, 0);
    crowd.defineLayer("enemy/moss-grunt", { geometry: body, hull, sizeM: [1, 2, 1], animation: { kind: "procedural" }, model: true });
    const handle = crowd.add(ENEMIES["moss-grunt"].show.placeholder, "biped", "enemy/moss-grunt");
    crowd.set(handle, { x: 0, y: 0, z: 0, yaw: 0, flash: 0, squash: 1 });
    crowd.flush();
    const byName = new Map(crowd.group.children.map((child) => [child.name, child as THREE.InstancedMesh]));
    const mesh = byName.get("crowd-enemy/moss-grunt")!;
    const outline = byName.get("crowd-outline-enemy/moss-grunt")!;
    const ghost = byName.get("crowd-ghost-enemy/moss-grunt")!;
    expect(mesh.geometry).toBe(body);
    expect(outline.geometry).toBe(hull);
    expect(ghost.geometry).toBe(hull);
    expect(hull.getAttribute("aState")).toBe(body.getAttribute("aState"));
    expect(outline.instanceMatrix).toBe(mesh.instanceMatrix);
    expect(outline.count).toBe(1);
    crowd.dispose();
  });
});
