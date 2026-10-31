// Quality rescue wave 1 (01/11, parent docs/games/QUALITY_RESCUE_2026-11-01.md §3, D3): High and Ultra keep the
// leaf detail, stone keeps its own colour under a light tint, and every GLB map is filtered anisotropically.
// No WebGL needed.
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { MODEL_ANISOTROPY, filterModelMaps } from "../../src/view/models";
import { FOLIAGE_MAP_BIAS, STONE_PAINT_MIX, stonePaint } from "../../src/view/scatter";
import { propMaps } from "../../src/view/stage";

describe("quality rescue D3", () => {
  it("keeps the foliage mip bias at 0.5 or less on High and Ultra, soft below", () => {
    expect(FOLIAGE_MAP_BIAS.high).toBeLessThanOrEqual(0.5);
    expect(FOLIAGE_MAP_BIAS.ultra).toBeLessThanOrEqual(0.5);
    expect(FOLIAGE_MAP_BIAS.ultra).toBeLessThanOrEqual(FOLIAGE_MAP_BIAS.high);
    expect(FOLIAGE_MAP_BIAS.medium).toBeGreaterThan(2);
  });

  it("turns the stone paint into a tint of 0.3 at most on High and Ultra, and keeps the flat grey below", () => {
    const paint = "vec3 dhG = vec3(0.4); diffuseColor.rgb = DH_STONE_MIX;";
    for (const quality of ["high", "ultra"] as const) {
      expect(STONE_PAINT_MIX[quality]).toBeLessThanOrEqual(0.3);
      expect(stonePaint(paint, quality)).toContain("diffuseColor.rgb = mix(diffuseColor.rgb, dhG, 0.30);");
    }
    for (const quality of ["low", "medium"] as const) expect(stonePaint(paint, quality)).toContain("diffuseColor.rgb = dhG;");
    expect(stonePaint(paint, "high")).not.toContain("DH_STONE_MIX");
  });

  it("filters every map of a GLB 8x on High and 16x on Ultra, each texture once", () => {
    expect(MODEL_ANISOTROPY).toMatchObject({ high: 8, ultra: 16 });
    const shared = new THREE.Texture();
    const body = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ map: shared, normalMap: new THREE.Texture(), roughnessMap: new THREE.Texture() }));
    const cap = new THREE.Mesh(new THREE.BoxGeometry(), [new THREE.MeshStandardMaterial({ map: shared }), new THREE.MeshStandardMaterial({ emissiveMap: new THREE.Texture() })]);
    const root = new THREE.Group();
    root.add(body, cap);
    const before = shared.version;
    expect(filterModelMaps(root, MODEL_ANISOTROPY.ultra)).toBe(4);
    const material = body.material;
    expect([material.map, material.normalMap, material.roughnessMap].map((texture) => texture?.anisotropy)).toEqual([16, 16, 16]);
    expect((cap.material[1] as THREE.MeshStandardMaterial).emissiveMap?.anisotropy).toBe(16);
    expect(shared.version).toBe(before + 1);
    // Already filtered: nothing to upload again.
    filterModelMaps(root, 16);
    expect(shared.version).toBe(before + 1);
  });

  it("reports the GLB prop meshes and their maps for the terrain preview", () => {
    const scene = new THREE.Scene();
    const map = new THREE.Texture();
    map.anisotropy = 16;
    const lit = new THREE.MeshLambertMaterial({ map, normalMap: map });
    lit.defines = { DH_GLOSS: "" };
    scene.add(new THREE.InstancedMesh(new THREE.BoxGeometry(), lit, 3));
    (scene.children[0] as THREE.InstancedMesh).name = "dh-prop-rock-boulder";
    const other = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshLambertMaterial(), 1);
    other.name = "dh-scatter-cones";
    scene.add(other);
    expect(propMaps(scene)).toEqual([{ name: "dh-prop-rock-boulder", count: 3, map: 16, normalMap: 16, gloss: true }]);
  });
});
