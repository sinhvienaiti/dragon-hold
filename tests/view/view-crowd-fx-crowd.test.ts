// Lane view-crowd-fx: the instanced crowd and the HP bar batch (no WebGL needed).
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { ENEMIES } from "../../src/content/data/enemies";
import { CHARACTER_SCALE, createCrowd, TINT, type CrowdInstance } from "../../src/view/crowd";
import { FOE_DRAW_SCALE, foeDrawLook, foeDrawnSize, foeHeadM, swarmOffset } from "../../src/view/foe-look";
import { HP_BAR, HpBarBatch } from "../../src/view/hpbars";

const grunt = ENEMIES["moss-grunt"].show.placeholder;
const wolf = ENEMIES["blight-wolf"].show.placeholder;
const wasp = ENEMIES["thorn-wasp"].show.placeholder;

const inst = (x: number, z: number, extra: Partial<CrowdInstance> = {}): CrowdInstance => ({ x, y: 0, z, yaw: 0, flash: 0, squash: 1, ...extra });

/** The crowd's layer meshes by name. */
function layers(group: THREE.Group): Map<string, THREE.InstancedMesh> {
  const out = new Map<string, THREE.InstancedMesh>();
  for (const child of group.children) if ((child as THREE.InstancedMesh).isInstancedMesh) out.set(child.name, child as THREE.InstancedMesh);
  return out;
}

describe("view crowd", () => {
  it("draws every placeholder shape in one layer each with its outline hull, plus one for the shadows", () => {
    const crowd = createCrowd(64);
    for (let k = 0; k < 10; k += 1) crowd.set(crowd.add(grunt, "biped"), inst(k, 0));
    for (let k = 0; k < 6; k += 1) crowd.set(crowd.add(wolf, "quadruped"), inst(k, 3));
    for (let k = 0; k < 4; k += 1) crowd.set(crowd.add(wasp, "flyer"), inst(k, 6));
    crowd.flush(1);
    expect(crowd.size).toBe(20);
    // capsule, box, sphere, their three outline hulls + shadows.
    expect(crowd.drawCalls()).toBe(7);
    const meshes = layers(crowd.group);
    expect(meshes.get("crowd-capsule")!.count).toBe(10);
    // The hull shares the body's instance matrices and count.
    expect(meshes.get("crowd-outline-capsule")!.instanceMatrix).toBe(meshes.get("crowd-capsule")!.instanceMatrix);
    expect(meshes.get("crowd-outline-capsule")!.count).toBe(10);
    // Without outlines: one call per layer.
    const plain = createCrowd(8, { outlines: false });
    plain.set(plain.add(grunt, "biped"), inst(0, 0));
    plain.flush();
    expect(plain.drawCalls()).toBe(2);
    plain.dispose();
    expect(meshes.get("crowd-box")!.count).toBe(6);
    expect(meshes.get("crowd-sphere")!.count).toBe(4);
    crowd.dispose();
  });

  it("keeps handles valid when instances are removed out of order (swap-remove)", () => {
    const crowd = createCrowd(16);
    const handles = [0, 1, 2, 3].map((k) => {
      const handle = crowd.add(grunt, "biped");
      crowd.set(handle, inst(k * 10, 0));
      return handle;
    });
    crowd.remove(handles[0]!);
    crowd.remove(handles[0]!);
    // The last instance moved into slot 0; moving it again must move the right one.
    crowd.set(handles[3]!, inst(99, 0));
    crowd.flush();
    const mesh = layers(crowd.group).get("crowd-capsule")!;
    expect(mesh.count).toBe(3);
    const xs = [0, 1, 2].map((index) => {
      const matrix = new THREE.Matrix4();
      mesh.getMatrixAt(index, matrix);
      return Math.round(new THREE.Vector3().setFromMatrixPosition(matrix).x);
    });
    expect(xs.sort((a, b) => a - b)).toEqual([10, 20, 99]);
    // A freed handle is reused.
    expect(crowd.add(grunt, "biped")).toBe(handles[0]);
    crowd.dispose();
  });

  it("draws characters 1.4 × their placeholder size, items at 1 ×, flyers at their hover height", () => {
    const crowd = createCrowd(8);
    const foe = crowd.add(grunt, "biped");
    const trap = crowd.add(grunt, "still");
    const fly = crowd.add(wasp, "flyer");
    crowd.set(foe, inst(0, 0));
    crowd.set(trap, inst(5, 0));
    crowd.set(fly, inst(0, 5));
    crowd.flush();
    const meshes = layers(crowd.group);
    const capsules = meshes.get("crowd-capsule")!;
    const scale = (mesh: THREE.InstancedMesh, index: number) => {
      const matrix = new THREE.Matrix4();
      mesh.getMatrixAt(index, matrix);
      const position = new THREE.Vector3();
      const size = new THREE.Vector3();
      matrix.decompose(position, new THREE.Quaternion(), size);
      return { position, size };
    };
    expect(scale(capsules, 0).size.y).toBeCloseTo(grunt.sizeM[1] * CHARACTER_SCALE, 5);
    expect(scale(capsules, 1).size.y).toBeCloseTo(grunt.sizeM[1], 5);
    expect(scale(meshes.get("crowd-sphere")!, 0).position.y).toBeCloseTo(wasp.hoverM, 5);
    crowd.dispose();
  });

  it("writes flash, dissolve and tint into the instance state, squash into the matrix", () => {
    const crowd = createCrowd(8);
    const handle = crowd.add(grunt, "biped");
    crowd.set(handle, inst(0, 0, { flash: 1, squash: 0.91, dissolve: 0.5, tint: TINT.slow, tintMix: 0.8 }));
    crowd.flush();
    const mesh = layers(crowd.group).get("crowd-capsule")!;
    const state = mesh.geometry.getAttribute("aState") as THREE.InstancedBufferAttribute;
    expect([state.getX(0), state.getY(0), state.getZ(0), state.getW(0)].map((v) => Math.round(v * 100) / 100)).toEqual([1, 0.5, TINT.slow, 0.8]);
    const matrix = new THREE.Matrix4();
    mesh.getMatrixAt(0, matrix);
    const size = new THREE.Vector3();
    matrix.decompose(new THREE.Vector3(), new THREE.Quaternion(), size);
    // Squashed: shorter and wider than the plain size (dissolve shrinks both by 12.5 %).
    expect(size.y / size.x).toBeLessThan((grunt.sizeM[1] / grunt.sizeM[0]) * 0.95);
    crowd.dispose();
  });

  it("takes a per-instance draw scale and look (round 2 foes)", () => {
    const crowd = createCrowd(8);
    const handle = crowd.add(grunt, "biped", undefined, { foe: true, scale: 2.25, outline: 1.5, rim: 0.9, ash: 0.05 });
    crowd.set(handle, inst(0, 0));
    crowd.flush();
    const mesh = layers(crowd.group).get("crowd-capsule")!;
    const matrix = new THREE.Matrix4();
    mesh.getMatrixAt(0, matrix);
    const size = new THREE.Vector3();
    matrix.decompose(new THREE.Vector3(), new THREE.Quaternion(), size);
    expect(size.y).toBeCloseTo(grunt.sizeM[1] * 2.25, 5);
    const look = mesh.geometry.getAttribute("aLook") as THREE.InstancedBufferAttribute;
    expect([look.getX(0), look.getY(0), look.getZ(0)].map((v) => Math.round(v * 100) / 100)).toEqual([1.5, 0.9, 0.05]);
    crowd.dispose();
  });

  it("marks flyers with a ground spot and a tether, and draws swarm rings with the shadows", () => {
    const crowd = createCrowd(8);
    crowd.set(crowd.add(grunt, "biped"), inst(0, 0));
    crowd.set(crowd.add(wasp, "flyer"), inst(3, 0));
    crowd.setRings([{ x: 5, y: 0, z: 5, radius: 2, color: "#8a7ee0", alpha: 0.9 }]);
    crowd.flush();
    const shadows = crowd.group.getObjectByName("crowd-shadows") as THREE.Mesh<THREE.InstancedBufferGeometry>;
    // Grunt: one contact shadow; wasp: spot + tether; one ring.
    expect(shadows.geometry.instanceCount).toBe(4);
    const data = shadows.geometry.getAttribute("iData") as THREE.InstancedBufferAttribute;
    const kinds = [0, 1, 2, 3].map((k) => data.getZ(k));
    expect(kinds).toEqual([0, 1, 2, 3]);
    // The tether reaches up to the flyer.
    expect(data.getW(2)).toBeCloseTo(wasp.hoverM, 5);
    expect(data.getX(3)).toBeCloseTo(4, 5);
    crowd.dispose();
  });

  it("fills the shadow batch once a frame and refuses past capacity", () => {
    const crowd = createCrowd(3);
    const handles = [0, 1, 2, 3].map(() => crowd.add(grunt, "biped"));
    expect(handles[3]).toBe(-1);
    for (const handle of handles) crowd.set(handle, inst(1, 1));
    crowd.flush();
    const shadows = crowd.group.getObjectByName("crowd-shadows") as THREE.Mesh<THREE.InstancedBufferGeometry>;
    expect(shadows.geometry.instanceCount).toBe(3);
    crowd.dispose();
  });

  it("takes a rigid GLB layer now and refuses skinned layers until M0b", () => {
    const crowd = createCrowd(8);
    const handle = crowd.add(grunt, "biped", "enemy/moss-grunt");
    crowd.set(handle, inst(2, 0));
    crowd.defineLayer("enemy/moss-grunt", { geometry: new THREE.BoxGeometry(1, 2, 1).translate(0, 1, 0), sizeM: [1, 2, 1], animation: { kind: "procedural" } });
    crowd.flush();
    expect(layers(crowd.group).get("crowd-enemy/moss-grunt")!.count).toBe(1);
    const texture = new THREE.DataTexture(new Float32Array(4), 1, 1);
    expect(() => crowd.defineLayer("x", { geometry: new THREE.BoxGeometry(), sizeM: [1, 1, 1], animation: { kind: "vat", texture, frames: 1, clips: [] } })).toThrow(/M0b/);
    crowd.dispose();
  });
});

describe("view hp bars", () => {
  it("batches bars, clamps the fill and stops at capacity", () => {
    const batch = new HpBarBatch(2);
    batch.begin();
    batch.push(0, 1, 0, 1.4, HP_BAR.foe);
    batch.push(0, 1, 0, -1, HP_BAR.unit);
    batch.push(0, 1, 0, 0.5, HP_BAR.house);
    batch.end();
    expect(batch.size).toBe(2);
    const data = batch.mesh.geometry.getAttribute("iData") as THREE.InstancedBufferAttribute;
    expect(data.getY(0)).toBe(1);
    expect(data.getY(1)).toBe(0);
    expect(data.getZ(1)).toBe(HP_BAR.unit);
    expect(batch.mesh.geometry.instanceCount).toBe(2);
    batch.dispose();
  });
});

describe("view foe look (round 2 readability)", () => {
  it("draws small foes bigger than 1.4 ×, generals bigger still, swarm bodies small", () => {
    expect(FOE_DRAW_SCALE.small).toBeGreaterThan(CHARACTER_SCALE);
    expect(foeDrawLook("moss-grunt").scale).toBe(FOE_DRAW_SCALE.small);
    expect(foeDrawLook("moss-banner").tier).toBe("general");
    expect(foeDrawnSize("moss-banner")[1]).toBeGreaterThan(foeDrawnSize("moss-grunt")[1] * 1.4);
    expect(foeDrawnSize("thorn-ant")[1]).toBeLessThan(foeDrawnSize("moss-grunt")[1] / 2);
    // Tag anchors follow the drawn head (hover included).
    expect(foeHeadM("thorn-wasp", 3)).toBeCloseTo(3 + foeDrawnSize("thorn-wasp")[1], 5);
  });

  it("gives each family a view colour that is not its dark content colour, and keeps sizes", () => {
    const look = foeDrawLook("moss-grunt");
    expect(look.placeholder.color).not.toBe(grunt.color);
    expect(look.placeholder.sizeM).toEqual(grunt.sizeM);
    expect(look.placeholder.hoverM).toBe(grunt.hoverM);
  });

  it("spreads a swarm cluster on a spiral without two bodies on one spot", () => {
    const at: [number, number] = [0, 0];
    const points = Array.from({ length: 10 }, (_, k) => [...swarmOffset(k, at)] as [number, number]);
    for (let i = 0; i < points.length; i += 1)
      for (let j = i + 1; j < points.length; j += 1) expect(Math.hypot(points[i]![0] - points[j]![0], points[i]![1] - points[j]![1])).toBeGreaterThan(0.5);
    expect(Math.max(...points.map(([x, z]) => Math.hypot(x, z)))).toBeLessThan(2.5);
  });
});
