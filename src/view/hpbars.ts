/**
 * Instanced HP bars for foes without a word tag (shown only when hurt),
 * units blue, houses amber when damaged (05 §4.2). Worded foes show their
 * bar under the DOM tag (ui/tags.ts). One draw call: camera-facing quads of
 * a fixed pixel size, so a bar reads the same at any zoom.
 * Owner: view-crowd-fx (LANES.md).
 */
import * as THREE from "three";
import type { SimEvent } from "../content/types";
import { ENEMIES } from "../content/data/enemies";
import { GENERALS } from "../content/data/generals";
import { uToM } from "../sim/fixed";
import type { World } from "../sim/world";
import type { FrameInfo, Presenter } from "../app/contracts";
import type { Stage } from "./stage";
import type { TerrainView } from "./terrain";
import { worldLocator, type FoeLocator } from "./actors";

/** Bar colours by owner; never a semantic colour (05 §2.2). */
export const HP_BAR = { foe: 0, general: 1, unit: 2, house: 3 } as const;
export type HpBarKind = (typeof HP_BAR)[keyof typeof HP_BAR];
export const HP_BAR_COLORS: readonly string[] = ["#e6d8b8", "#c8d24a", "#6fa8e8", "#e0a040"];

const VERTEX = /* glsl */ `
attribute vec3 iPos;
attribute vec4 iData;
uniform vec2 uScreen;
varying vec2 vUv;
varying vec4 vData;
void main() {
  vUv = uv;
  vData = iData;
  vec4 clip = projectionMatrix * viewMatrix * vec4(iPos, 1.0);
  // iData.x: width in CSS px; 5 px tall with the frame.
  vec2 px = vec2(position.x * iData.x, position.y * 5.0);
  clip.xy += px * 2.0 / uScreen * clip.w;
  gl_Position = clip;
}`;

const FRAGMENT = /* glsl */ `
uniform vec3 uColors[4];
varying vec2 vUv;
varying vec4 vData;
void main() {
  vec3 fill = uColors[int(vData.z + 0.5)];
  float inside = step(vUv.x, vData.y);
  // A dark frame, the fill, the lost part dim.
  float frame = step(vUv.y, 0.2) + step(0.8, vUv.y) + step(vUv.x * vData.x, 1.0) + step(vData.x - 1.0, vUv.x * vData.x);
  vec3 color = mix(vec3(0.12, 0.1, 0.08), fill, inside);
  color = mix(color, vec3(0.04, 0.035, 0.03), min(1.0, frame));
  gl_FragColor = vec4(color, vData.w * (min(1.0, frame) > 0.5 ? 0.9 : (inside > 0.5 ? 1.0 : 0.7)));
}`;

/** A frame's bars: begin(), push() each, end(). */
export class HpBarBatch {
  readonly mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  private readonly pos: Float32Array;
  private readonly data: Float32Array;
  private count = 0;

  constructor(readonly capacity = 400) {
    this.pos = new Float32Array(capacity * 3);
    this.data = new Float32Array(capacity * 4);
    const base = new THREE.PlaneGeometry(1, 1);
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.index = base.index;
    geometry.setAttribute("position", base.getAttribute("position"));
    geometry.setAttribute("uv", base.getAttribute("uv"));
    geometry.setAttribute("iPos", new THREE.InstancedBufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute("iData", new THREE.InstancedBufferAttribute(this.data, 4).setUsage(THREE.DynamicDrawUsage));
    geometry.instanceCount = 0;
    const material = new THREE.ShaderMaterial({
      uniforms: { uScreen: { value: new THREE.Vector2(1280, 720) }, uColors: { value: HP_BAR_COLORS.map((hex) => new THREE.Color(hex)) } },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthWrite: false,
      depthTest: false,
    });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 20;
    this.mesh.name = "hp-bars";
  }

  get size(): number {
    return this.count;
  }

  /** CSS size of the view, for pixel-sized bars. */
  setScreen(width: number, height: number): void {
    (this.mesh.material.uniforms.uScreen!.value as THREE.Vector2).set(Math.max(1, width), Math.max(1, height));
  }

  begin(): void {
    this.count = 0;
  }

  /** A bar centred at (x, y, z) metres, `frac` 0–1 full, `widthPx` wide. */
  push(x: number, y: number, z: number, frac: number, kind: HpBarKind, widthPx = 28, alpha = 1): void {
    if (this.count >= this.capacity) return;
    const n = this.count;
    this.pos[n * 3] = x;
    this.pos[n * 3 + 1] = y;
    this.pos[n * 3 + 2] = z;
    this.data[n * 4] = widthPx;
    this.data[n * 4 + 1] = Math.max(0, Math.min(1, frac));
    this.data[n * 4 + 2] = kind;
    this.data[n * 4 + 3] = alpha;
    this.count = n + 1;
  }

  end(): void {
    const geometry = this.mesh.geometry;
    geometry.instanceCount = this.count;
    geometry.getAttribute("iPos").needsUpdate = true;
    geometry.getAttribute("iData").needsUpdate = true;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

export interface HpBarsOptions {
  /** Drawn foe positions (view/actors); default the world's positions. */
  locator?: FoeLocator;
  terrain?: TerrainView;
}

export interface HpBarsPresenter extends Presenter {
  readonly batch: HpBarBatch;
}

/** Bar width by size class: small 26 px, bigger foes and generals wider. */
function widthFor(heightM: number, general: boolean): number {
  if (general) return 44;
  return Math.round(Math.max(22, Math.min(38, 18 + heightM * 9)));
}

export function createHpBars(stage: Stage, options: HpBarsOptions = {}): HpBarsPresenter {
  const batch = new HpBarBatch(400);
  stage.layers.fx.add(batch.mesh);
  const at = new THREE.Vector3();
  let fallback: FoeLocator | null = null;
  const size = new THREE.Vector2();
  return {
    batch,
    onEvents(_events: readonly SimEvent[], _world: World): void {},
    frame(world: World, _info: FrameInfo): void {
      const locator = options.locator ?? (fallback ??= worldLocator(world, options.terrain));
      stage.renderer.getSize(size);
      batch.setScreen(size.x, size.y);
      batch.begin();
      for (const foe of world.enemies.list) {
        if (!foe.alive || foe.freed || foe.word >= 0 || foe.hp >= foe.hpMax || foe.hpMax <= 0) continue;
        if (!locator.locate(foe.slot, foe.serial, "top", at)) continue;
        const def = foe.general ? GENERALS[foe.foe as keyof typeof GENERALS] : ENEMIES[foe.foe as keyof typeof ENEMIES];
        const height = def?.show.placeholder.sizeM[1] ?? 1;
        batch.push(at.x, at.y + 0.25, at.z, foe.hp / foe.hpMax, foe.general ? HP_BAR.general : HP_BAR.foe, widthFor(height, foe.general));
      }
      for (const unit of world.units.list) {
        if (unit.downUntil >= 0 || unit.hp >= unit.hpMax || unit.hpMax <= 0) continue;
        const x = uToM(unit.x);
        const z = uToM(unit.z);
        const ground = options.terrain?.heightAt(x, z) ?? 0;
        batch.push(x, ground + 1.9, z, unit.hp / unit.hpMax, HP_BAR.unit, 28);
      }
      for (const house of world.houses.list) {
        if (house.hp >= house.hpMax || house.hpMax <= 0) continue;
        const slot = world.map.slots[house.slot];
        if (!slot) continue;
        const [x, z] = slot.pos;
        const ground = options.terrain?.heightAt(x, z) ?? 0;
        batch.push(x, ground + 2.7, z, house.hp / house.hpMax, HP_BAR.house, 40);
      }
      batch.end();
    },
    dispose(): void {
      batch.dispose();
    },
  };
}
