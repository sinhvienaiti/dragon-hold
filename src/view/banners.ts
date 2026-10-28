/**
 * G01's banner (02 §3.2 Cắm Cờ, 05 §6 general row: "mang cờ; chiêu: cột sáng
 * màu hào quang, tên chiêu 1 s"). Every live general carries a banner on its
 * back; `banner` events plant it ("plant": the banner stands, a light pillar
 * in the aura colour rises, the aura ring shows its 5 m reach and "Cắm Cờ"
 * floats over it for 1 s), raise it ("windup"), and take it down ("pulled":
 * it falls; "expired": it sinks; "cancel": the general lowers it again).
 * Pole and cloth are primitive placeholders (AGENTS.md). M0b: while a general
 * is drawn as the owner's G01 model (FoeLocator.drawsModel), the model carries
 * its own banner and its clips raise it (intro, Cắm Cờ) and drop it (death),
 * so the carried placeholder, its wind-up lift and its fallen copy are not
 * drawn; the planted banner stays (it holds the flag word, pillar and ring).
 * Owner: view-crowd-fx (LANES.md).
 */
import * as THREE from "three";
import type { EnemyRef, FoeId, SimEvent } from "../content/types";
import { GENERALS } from "../content/data/generals";
import type { World } from "../sim/world";
import { uToM } from "../sim/fixed";
import type { FrameInfo, Presenter } from "../app/contracts";
import type { FoeLocator } from "./actors";
import { foeDrawnSize } from "./foe-look";
import type { Stage } from "./stage";
import { TELEGRAPH_COLORS, type TelegraphsView } from "./telegraphs";
import type { TerrainView } from "./terrain";

/** Héo cloth (00 D02): ash grey with a withered-yellow border and crack sigil. */
const CLOTH_ASH = "#77736a";
const POLE_COLOR = "#2b241d";
/** Pole height over the drawn body (carried, planted), cloth size (metres). */
const POLE_OVER_BODY = 1.6;
/** Planted: tall enough that the cloth shows above the general's and the flag word's tags. */
const PLANTED_OVER_BODY = 2.2;
const CLOTH_W = 3.0;
const CLOTH_H = 2.2;
/**
 * The cloth turns to the camera and leans back this much (radians): the play
 * camera looks down steeply, and an upright cloth showed edge-on as a sliver.
 */
const CLOTH_LEAN = 0.55;
/** The light pillar (metres) and how long it flares before it settles. */
const PILLAR_H = 11;
const PILLAR_R = 0.75;
const FLARE_S = 1.2;
/** "Cắm Cờ" over the planted banner: 1 s (05 §6), its size (metres) and lift over the pole. */
const NAME_S = 1;
const NAME_W = 8.5;
const NAME_LIFT = 1.4;
const FALL_S = 0.55;
const SINK_S = 0.6;
/** A dead general's banner falls (02 §3.4 "cờ gãy đổ"), lies this long, then sinks (test pass 27/10: it vanished with the body). */
const DEAD_LIE_S = 2;
/** The carried banner rises this much while the general winds up (1 s, 02 §3.2). */
const WINDUP_LIFT = 0.9;

const PILLAR_VERTEX = /* glsl */ `
varying float vH;
varying vec3 vNormalV;
void main() {
  vH = uv.y;
  vNormalV = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
// Bright at the foot, fading up; a soft edge so the column reads as light, a slow shimmer.
const PILLAR_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uAlpha;
uniform float uTime;
varying float vH;
varying vec3 vNormalV;
void main() {
  float rim = pow(1.0 - abs(vNormalV.z), 1.5);
  float fade = (1.0 - vH) * (1.0 - vH);
  float shimmer = 0.8 + 0.2 * sin(vH * 18.0 - uTime * 5.0);
  float a = fade * (0.35 + 0.65 * (1.0 - rim)) * shimmer * uAlpha;
  gl_FragColor = vec4(uColor * (1.3 + 0.7 * (1.0 - vH)), a);
}`;

/** The cloth's sigil: ash cloth, a dark hem, a withered-yellow eye with cracks (canvas once). */
function clothTexture(): THREE.Texture {
  const canvas = globalThis.document?.createElement("canvas");
  if (!canvas) return new THREE.Texture();
  canvas.width = 128;
  canvas.height = 96;
  const g = canvas.getContext("2d");
  if (g) {
    g.fillStyle = CLOTH_ASH;
    g.fillRect(0, 0, 128, 96);
    // A withered-yellow border, a dark top hem and a ragged bottom (dark notches).
    g.strokeStyle = TELEGRAPH_COLORS.aura;
    g.lineWidth = 6;
    g.strokeRect(3, 3, 122, 76);
    g.fillStyle = "#24211d";
    for (let x = 0; x < 128; x += 16) {
      g.beginPath();
      g.moveTo(x, 96);
      g.lineTo(x + 8, 80);
      g.lineTo(x + 16, 96);
      g.fill();
    }
    g.fillRect(0, 0, 128, 7);
    // The Héo eye (00 D02 #C8D24A) and its cracks.
    g.strokeStyle = TELEGRAPH_COLORS.aura;
    g.fillStyle = TELEGRAPH_COLORS.aura;
    g.lineWidth = 5;
    g.beginPath();
    g.ellipse(64, 44, 26, 14, 0, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    g.arc(64, 44, 7, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(38, 44);
    g.lineTo(22, 30);
    g.lineTo(14, 36);
    g.moveTo(90, 44);
    g.lineTo(104, 58);
    g.lineTo(114, 52);
    g.moveTo(64, 58);
    g.lineTo(60, 74);
    g.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** "Cắm Cờ" as a sprite texture: cream letters, a dark outline, the aura colour underline. */
function nameTexture(text: string): { texture: THREE.Texture; aspect: number } {
  const canvas = globalThis.document?.createElement("canvas");
  if (!canvas) return { texture: new THREE.Texture(), aspect: 4 };
  canvas.width = 512;
  canvas.height = 128;
  const g = canvas.getContext("2d");
  if (g) {
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = '800 72px "Be Vietnam Pro", system-ui, sans-serif';
    g.lineJoin = "round";
    g.lineWidth = 14;
    g.strokeStyle = "rgba(20, 16, 12, 0.92)";
    g.strokeText(text, 256, 58);
    g.fillStyle = "#fff4d6";
    g.fillText(text, 256, 58);
    g.fillStyle = TELEGRAPH_COLORS.aura;
    g.fillRect(156, 104, 200, 8);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return { texture, aspect: 4 };
}

/**
 * One banner: pole and cloth (shared geometry and materials). The cloth hangs
 * from a pivot at the pole's top (named "cloth"): the pivot leans back and
 * sways; the group turns to the camera (`faceCamera`).
 */
function makeBanner(pole: THREE.BufferGeometry, cloth: THREE.BufferGeometry, poleMat: THREE.Material, clothMat: THREE.Material, height: number): THREE.Group {
  const group = new THREE.Group();
  const stick = new THREE.Mesh(pole, poleMat);
  stick.scale.set(1, height, 1);
  stick.position.y = height / 2;
  const pivot = new THREE.Group();
  pivot.name = "cloth";
  pivot.rotation.order = "YXZ";
  pivot.position.set(0, height - 0.15, 0);
  pivot.rotation.x = -CLOTH_LEAN;
  const flag = new THREE.Mesh(cloth, clothMat);
  flag.position.set(CLOTH_W / 2 + 0.05, -CLOTH_H / 2, 0);
  pivot.add(flag);
  group.add(stick, pivot);
  for (const mesh of [stick, flag]) {
    mesh.castShadow = false;
    mesh.receiveShadow = false;
  }
  return group;
}

/** Yaw that turns a banner's local +z (the cloth's face) to the camera, from the camera's look direction. */
function faceCamera(camera: THREE.Camera, scratch: THREE.Vector3): number {
  camera.getWorldDirection(scratch);
  return Math.atan2(-scratch.x, -scratch.z);
}

interface Carried {
  readonly serial: number;
  readonly group: THREE.Group;
  /** Drawn body size (w, h, l) and the height the pole reaches. */
  readonly height: number;
  readonly side: number;
  readonly back: number;
  /** Last drawn ground point and facing. */
  x: number;
  z: number;
  yaw: number;
  seen: number;
  /** Windup until (seconds, −1 none); hidden while its own banner stands. */
  raiseUntil: number;
  planted: number;
  /** Drawn as the G01 model, which carries its own banner: the placeholder stays hidden. */
  onModel: boolean;
}

interface Planted {
  readonly index: number;
  readonly owner: number;
  readonly x: number;
  readonly z: number;
  readonly group: THREE.Group;
  readonly pillar: THREE.Mesh<THREE.CylinderGeometry, THREE.ShaderMaterial>;
  readonly name: THREE.Sprite;
  /** Seconds since planted; the ring's telegraph id. */
  age: number;
  ring: number;
  /** "fall" or "sink" while it goes; seconds into it. */
  leaving: "fall" | "sink" | null;
  leftFor: number;
}

export interface BannersOptions {
  locator?: FoeLocator;
  /** The aura ring of a planted banner (the general's own ring uses the same look). */
  telegraphs?: TelegraphsView;
}

export interface BannersView extends Presenter {
  /**
   * Banners drawn now: carried by generals (the placeholder, or the G01 model's own while it is drawn), standing
   * on the ground, and "Cắm Cờ" labels showing.
   */
  readonly carried: number;
  /** Of the carried ones, how many are the placeholder (0 once every general is drawn as the model). */
  readonly carriedPlaceholders: number;
  readonly planted: number;
  readonly named: number;
}

export function createBanners(stage: Stage, terrain: TerrainView, options: BannersOptions = {}): BannersView {
  const root = new THREE.Group();
  root.name = "banners";
  stage.layers.actors.add(root);
  const pole = new THREE.CylinderGeometry(0.11, 0.14, 1, 6);
  const cloth = new THREE.PlaneGeometry(CLOTH_W, CLOTH_H, 6, 2);
  const poleMat = new THREE.MeshLambertMaterial({ color: POLE_COLOR });
  const clothMap = clothTexture();
  const clothMat = new THREE.MeshLambertMaterial({ map: clothMap, side: THREE.DoubleSide, emissive: new THREE.Color(TELEGRAPH_COLORS.aura), emissiveIntensity: 0.05 });
  const pillarGeo = new THREE.CylinderGeometry(PILLAR_R, PILLAR_R * 1.3, PILLAR_H, 20, 1, true);
  pillarGeo.translate(0, PILLAR_H / 2, 0);
  const pillarMat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(TELEGRAPH_COLORS.aura) }, uAlpha: { value: 0 }, uTime: { value: 0 } },
    vertexShader: PILLAR_VERTEX,
    fragmentShader: PILLAR_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const label = nameTexture("Cắm Cờ");
  const nameMat = new THREE.SpriteMaterial({ map: label.texture, depthTest: false, depthWrite: false, transparent: true });
  const carried = new Map<number, Carried>();
  const planted: Planted[] = [];
  /** Banners of dead generals: falling, lying, then sinking. */
  const fallen: { group: THREE.Group; age: number; y: number; tilt: number }[] = [];
  const at = new THREE.Vector3();
  const look = new THREE.Vector3();
  let stamp = 0;
  let nowS = 0;

  // Compile the banner, pillar and label shaders now (hidden), not at the first general of the run.
  {
    const probe = makeBanner(pole, cloth, poleMat, clothMat, 4);
    const pillar = new THREE.Mesh(pillarGeo, pillarMat);
    const name = new THREE.Sprite(nameMat);
    probe.add(pillar, name);
    root.add(probe);
    try {
      stage.renderer.compile(root, stage.camera, stage.scene);
    } catch {
      // No GL context (tests): compiled on first use.
    }
    root.remove(probe);
  }

  const groundY = (x: number, z: number): number => terrain.heightAt(x, z);

  const carry = (serial: number, foe: FoeId): Carried => {
    let rec = carried.get(serial);
    if (rec) return rec;
    const [w, h, l] = foeDrawnSize(foe);
    const height = h * POLE_OVER_BODY;
    const group = makeBanner(pole, cloth, poleMat, clothMat, height);
    root.add(group);
    // Just outside the drawn body (back-left), so the pole is not inside the capsule.
    rec = { serial, group, height, side: w * 0.55, back: l * 0.45, x: 0, z: 0, yaw: 0, seen: stamp, raiseUntil: -1, planted: -1, onModel: false };
    carried.set(serial, rec);
    return rec;
  };

  const ownerOf = (owner: EnemyRef): Carried | undefined => carried.get(owner.serial);

  const plant = (event: Extract<SimEvent, { type: "banner" }>, world: World): void => {
    // The general stands on the spot it plants: the banner goes beside it (camera right, its cloth further out),
    // taller than its body; the pillar wraps both; the name floats over the word tags.
    const owner = world.enemies.list[event.owner.slot];
    const [w, h] = foeDrawnSize(owner && owner.serial === event.owner.serial ? owner.foe : "moss-banner");
    const height = Math.max(5.2, h * PLANTED_OVER_BODY);
    const yaw = faceCamera(stage.camera, look);
    const side = w / 2 + 0.6;
    const px = event.x + Math.cos(yaw) * side;
    const pz = event.z - Math.sin(yaw) * side;
    const group = makeBanner(pole, cloth, poleMat, clothMat, height);
    group.position.set(px, groundY(px, pz), pz);
    // The cloth turns to the camera each frame.
    group.rotation.y = yaw;
    const y = groundY(event.x, event.z);
    const pillar = new THREE.Mesh(pillarGeo, pillarMat.clone());
    const radius = Math.max(PILLAR_R, w / 2 + 0.6);
    pillar.scale.set(radius / PILLAR_R, Math.max(1, (height + 4) / PILLAR_H), radius / PILLAR_R);
    pillar.position.set(event.x, y, event.z);
    pillar.renderOrder = 4;
    pillar.frustumCulled = false;
    const name = new THREE.Sprite(nameMat.clone());
    name.center.set(0.5, 0);
    name.scale.set(NAME_W, NAME_W / label.aspect, 1);
    name.position.set(event.x, y + height + NAME_LIFT, event.z);
    name.renderOrder = 12;
    root.add(group, pillar, name);
    const ring = options.telegraphs?.show({ owner: "aura", shape: "aura", x: event.x, z: event.z, toX: event.x, toZ: event.z + 1, radiusM: event.radiusM, widthM: 0 }, 0) ?? -1;
    planted.push({ index: event.banner, owner: event.owner.serial, x: px, z: pz, group, pillar, name, age: 0, ring, leaving: null, leftFor: 0 });
    const rec = ownerOf(event.owner);
    if (rec) {
      rec.planted = event.banner;
      rec.raiseUntil = -1;
    }
  };

  const takeDown = (index: number, how: "fall" | "sink"): void => {
    const item = planted.find((entry) => entry.index === index && entry.leaving === null);
    if (!item) return;
    item.leaving = how;
    item.leftFor = 0;
    if (item.ring >= 0) options.telegraphs?.end(item.ring);
    for (const rec of carried.values()) if (rec.planted === index) rec.planted = -1;
  };

  const drop = (item: Planted): void => {
    root.remove(item.group, item.pillar, item.name);
    item.pillar.material.dispose();
    item.name.material.dispose();
  };

  return {
    get carried(): number {
      let n = 0;
      for (const rec of carried.values()) if (rec.group.visible || (rec.onModel && rec.planted < 0)) n += 1;
      return n;
    },
    get carriedPlaceholders(): number {
      let n = 0;
      for (const rec of carried.values()) if (rec.group.visible) n += 1;
      return n;
    },
    get planted(): number {
      return planted.filter((item) => item.leaving === null).length;
    },
    get named(): number {
      return planted.filter((item) => item.name.visible).length;
    },
    onEvents(events: readonly SimEvent[], world: World): void {
      for (const event of events) {
        if (event.type === "death" && event.foe in GENERALS) {
          const rec = carried.get(event.enemy.serial);
          // The G01 model drops its own banner in its death clip; only a placeholder falls here.
          if (rec && rec.group.visible) {
            carried.delete(event.enemy.serial);
            // It falls away from the dais, the way the general was walking.
            fallen.push({ group: rec.group, age: 0, y: rec.group.position.y, tilt: Math.cos(rec.yaw) >= 0 ? 1 : -1 });
          }
          continue;
        }
        if (event.type !== "banner") {
          if (event.type === "phase" && (event.phase === "victory" || event.phase === "defeat")) for (const item of planted) takeDown(item.index, "sink");
          continue;
        }
        switch (event.stage) {
          case "windup": {
            const rec = ownerOf(event.owner);
            if (rec) rec.raiseUntil = nowS + Math.max(0.3, event.durationMs / 1000);
            break;
          }
          case "cancel": {
            const rec = ownerOf(event.owner);
            if (rec) rec.raiseUntil = -1;
            break;
          }
          case "plant":
            plant(event, world);
            break;
          case "pulled":
            takeDown(event.banner, "fall");
            break;
          case "expired":
            takeDown(event.banner, "sink");
            break;
        }
      }
    },
    frame(world: World, info: FrameInfo): void {
      stamp += 1;
      nowS = info.now / 1000;
      const dt = info.worldDt;
      const toCamera = faceCamera(stage.camera, look);
      // Carried banners: on every live general's back, facing the way it walks (none over the G01 model).
      for (const foe of world.enemies.list) {
        if (!foe.alive || foe.freed || !(foe.foe in GENERALS)) continue;
        const rec = carry(foe.serial, foe.foe);
        rec.seen = stamp;
        rec.onModel = options.locator?.drawsModel?.(foe.slot, foe.serial) ?? false;
        const drawn = options.locator?.locate(foe.slot, foe.serial, "base", at) ?? false;
        if (!drawn) at.set(uToM(foe.x), groundY(uToM(foe.x), uToM(foe.z)), uToM(foe.z));
        const mx = at.x - rec.x;
        const mz = at.z - rec.z;
        if (mx * mx + mz * mz > 1e-5) rec.yaw = Math.atan2(mx, mz);
        else if (rec.x === 0 && rec.z === 0) rec.yaw = Math.atan2(-at.x, -at.z);
        rec.x = at.x;
        rec.z = at.z;
        // Back-left of the body: forward (sin yaw, cos yaw), right (cos yaw, −sin yaw).
        const fx = Math.sin(rec.yaw);
        const fz = Math.cos(rec.yaw);
        const g = rec.group;
        g.visible = rec.planted < 0 && !rec.onModel;
        if (!g.visible) continue;
        const raising = rec.raiseUntil > nowS;
        g.position.set(at.x - fx * rec.back - fz * rec.side, at.y + (raising ? WINDUP_LIFT : 0), at.z - fz * rec.back + fx * rec.side);
        g.rotation.set(0, toCamera, raising ? Math.sin(nowS * 14) * 0.08 : 0);
        const flag = g.getObjectByName("cloth");
        if (flag) flag.rotation.y = Math.sin(nowS * 2.6 + rec.serial) * 0.18;
      }
      for (const [serial, rec] of carried) {
        if (rec.seen === stamp) continue;
        root.remove(rec.group);
        carried.delete(serial);
      }
      // Dead generals' banners: fall over, lie, sink.
      for (let k = fallen.length - 1; k >= 0; k -= 1) {
        const item = fallen[k]!;
        item.age += dt;
        const fall = Math.min(1, item.age / FALL_S);
        item.group.rotation.z = item.tilt * fall * fall * (Math.PI / 2.2);
        const sink = Math.max(0, item.age - FALL_S - DEAD_LIE_S) / SINK_S;
        item.group.position.y = item.y - sink * 3;
        if (sink >= 1) {
          root.remove(item.group);
          fallen.splice(k, 1);
        }
      }
      // Planted banners: the pillar flares then settles, the name shows 1 s, then they go when taken down.
      for (let k = planted.length - 1; k >= 0; k -= 1) {
        const item = planted[k]!;
        item.age += dt;
        const uniforms = item.pillar.material.uniforms;
        uniforms.uTime!.value = nowS;
        const flare = item.age < FLARE_S ? 1 - item.age / FLARE_S : 0;
        let alpha = 0.5 + 0.9 * flare;
        item.name.visible = item.age < NAME_S && item.leaving === null;
        if (item.name.visible) item.name.material.opacity = Math.min(1, (NAME_S - item.age) * 5);
        item.group.rotation.y = toCamera;
        const flag = item.group.getObjectByName("cloth");
        if (flag) flag.rotation.y = Math.sin(nowS * 2.2 + item.index) * 0.2;
        if (item.leaving !== null) {
          item.leftFor += dt;
          const span = item.leaving === "fall" ? FALL_S : SINK_S;
          const t = Math.min(1, item.leftFor / span);
          alpha *= 1 - t;
          if (item.leaving === "fall") item.group.rotation.z = t * t * (Math.PI / 2);
          else item.group.position.y = groundY(item.x, item.z) - t * 5.4;
          if (t >= 1) {
            drop(item);
            planted.splice(k, 1);
            continue;
          }
        }
        uniforms.uAlpha!.value = alpha;
      }
    },
    dispose(): void {
      for (const item of planted) drop(item);
      planted.length = 0;
      for (const item of fallen) root.remove(item.group);
      fallen.length = 0;
      carried.clear();
      root.removeFromParent();
      pole.dispose();
      cloth.dispose();
      poleMat.dispose();
      clothMat.dispose();
      clothMap.dispose();
      pillarGeo.dispose();
      pillarMat.dispose();
      nameMat.dispose();
      label.texture.dispose();
    },
  };
}
