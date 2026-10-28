/**
 * The two Dragons on the dais (01 §2, 05 §6.1): Hỏa Long hovering 2.5 m over
 * the dais, turning to the locked foe, Attack_L/R in turn on each word,
 * Attack_Both on Chớp, Hoàn hảo or a foe within 6 m, Cast for Thiên Hỏa,
 * Boost for Long Hống, Hit, Death, Victory; Bạch Long standing beside as the
 * guide (00 D21: Guide_Idle, Guide_Wave, Guide_Talk, Guide_Flap). Models are
 * the owner's GLB (draconis v2 for Hỏa Long, v4 for Bạch Long; v3 kept for the
 * Viêm Đế swap at M0c), loaded with the kit three loader from
 * public/assets/dragon-hold/models/ (ignored by Git). Low quality, a missing
 * file or a failed load keeps a primitive placeholder.
 * The app builds the Dragons once and keeps them across "Chơi lại ải"
 * (reset + setLocator), so a retry neither loads nor decodes the GLBs again;
 * dispose frees geometry, materials, textures and skeletons.
 * Bạch Long's colour (round 2): the GLB is the same white humanoid dragon
 * as Space's title page (sha256 equal, textures sRGB, tier .high), but the
 * title lights it with a studio environment map and the battle scene has
 * none, so its white hide went dull lavender and the red wings and dark
 * greaves won at 60 px. Its materials now get that environment (only its
 * own, the scene keeps none), and it turns to face the default camera.
 * M0b (test pass item 35: both Dragons read red at 60 px): Bạch Long's own
 * materials recolour at runtime (no new media): red, orange and yellow turn
 * pearl white with a cool silver-blue shade, near-black greaves lift to
 * slate, the red glow turns moon white, and a cream feather rim lights its
 * edge (05 §2.2 "kem trắng, lông vũ"). Never cyan (the typing colour).
 * Hỏa Long (v2) keeps its warm peach-red.
 * Owner: view-crowd-fx (LANES.md).
 */
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { Hero, loadModel, type ShotName } from "../kit/three";
import type { EntityRef, MapDef, SimEvent } from "../content/types";
import { RINGS } from "../content/rules";
import { uToM } from "../sim/fixed";
import type { World } from "../sim/world";
import type { FrameInfo, Presenter, Quality } from "../app/contracts";
import type { FoeLocator } from "./actors";
import { turnToward } from "./actors";
import type { MouthSource } from "./fx";
import type { Stage } from "./stage";
import type { TerrainView } from "./terrain";

/** Model files (05 §9.5 folder tree), tier by quality like the kit loader: medium → .medium, high/ultra → .high. */
export const HERO_MODELS = {
  fire: "/assets/dragon-hold/models/heroes/draconis-v2/draconis-v2",
  fireInferno: "/assets/dragon-hold/models/heroes/draconis-v3/draconis-v3",
  guide: "/assets/dragon-hold/models/guides/draconis-v4/draconis-v4",
} as const;

/** Clip names of the rigs (checked against the GLBs: Hero_* on v2, Guide_* on v4). */
export const FIRE_CLIPS = {
  idle: "Hero_Idle_Hover",
  attackL: "Hero_Attack_L",
  attackR: "Hero_Attack_R",
  attackBoth: "Hero_Attack_Both",
  cast: "Hero_Cast",
  hit: "Hero_Hit",
  death: "Hero_Death",
  victory: "Hero_Victory",
} as const;
export const GUIDE_CLIPS_DH = { idle: "Guide_Idle", wave: "Guide_Wave", talk: "Guide_Talk", flap: "Guide_Flap" } as const;
export type GuideAct = "wave" | "talk" | "flap";

/** 05 §2.3 at the default camera: Hỏa Long 80–100 px, Bạch Long 60–70 px at 1080p. */
const FIRE_SIZE_M = 4.2;
const GUIDE_SIZE_M = 4.0;
/** Bạch Long's studio light (Space title: RoomEnvironment, 0.04 blur) and how strongly its materials take it. */
const GUIDE_ENV_INTENSITY = 1.15;
/** Bạch Long faces the default camera (south, +z), turned this far toward the dais. */
const GUIDE_TURN_RAD = 0.22;

/**
 * Bạch Long's pearl recolour (M0b), on its base colour (linear): warm texels (hue red to yellow, saturated) become
 * pearl white shaded silver-blue by their brightness; near black lifts to slate. Exported for tests.
 */
export const GUIDE_PEARL_GLSL = /* glsl */ `
{
  vec3 dhC = diffuseColor.rgb;
  float dhMax = max(dhC.r, max(dhC.g, dhC.b));
  float dhMin = min(dhC.r, min(dhC.g, dhC.b));
  float dhSat = (dhMax - dhMin) / max(dhMax, 1e-4);
  float dhWarm = smoothstep(0.1, 0.32, dhSat) * smoothstep(-0.02, 0.03, dhC.r - dhC.g) * smoothstep(-0.02, 0.03, dhC.g - dhC.b);
  float dhLum = dot(dhC, vec3(0.2126, 0.7152, 0.0722));
  vec3 dhPearl = mix(vec3(0.46, 0.52, 0.66), vec3(0.95, 0.96, 1.0), smoothstep(0.03, 0.42, dhLum + dhMax * 0.35));
  dhC = mix(dhC, dhPearl, dhWarm);
  dhC = mix(dhC, vec3(0.24, 0.27, 0.35), (1.0 - smoothstep(0.015, 0.07, dhMax)) * 0.65);
  diffuseColor.rgb = dhC;
}
`;
/** Its glow moon white, and a cream rim on its feathered edge. */
export const GUIDE_GLOW_GLSL = /* glsl */ `
{
  float dhE = max(totalEmissiveRadiance.r, max(totalEmissiveRadiance.g, totalEmissiveRadiance.b));
  totalEmissiveRadiance = vec3(0.82, 0.88, 1.0) * dhE * 0.9;
  float dhRim = pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 2.5);
  totalEmissiveRadiance += vec3(1.0, 0.95, 0.82) * dhRim * 0.22;
}
`;
/** Placeholder colours: peach fire, cream feathers (05 §2.2). */
const FIRE_COLOR = "#d9643a";
const GUIDE_COLOR = "#efe6d2";

/** Frees everything a loaded model holds on the GPU: geometry, materials, their textures, skeleton bone textures. */
export function freeObject(root: THREE.Object3D): void {
  root.removeFromParent();
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if ((object as THREE.SkinnedMesh).isSkinnedMesh) (object as THREE.SkinnedMesh).skeleton.dispose();
    if (!mesh.isMesh) return;
    mesh.geometry.dispose();
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) value.dispose();
      material.dispose();
    }
  });
}

export function modelUrl(base: string, quality: Quality): string | null {
  if (quality === "low") return null;
  return base + (quality === "medium" ? ".medium.glb" : ".high.glb");
}

export interface HeroesView extends Presenter, MouthSource {
  /** Resolves once both models are in (or placeholders stay). */
  readonly ready: Promise<void>;
  /** Hỏa Long's rig once loaded (null: placeholder). */
  readonly fire: Hero | null;
  readonly guideLoaded: boolean;
  /** Plays a one-shot on Hỏa Long. */
  play(name: ShotName): void;
  guide(act: GuideAct): void;
  /** Turns Hỏa Long toward (x, z) metres. */
  face(x: number, z: number): void;
  /** Advances without a World (bench, showcase). */
  tick(dt: number, now: number): void;
  /** A new run on the same map: pose, words and the locked foe start over. */
  reset(): void;
  /** The run's foe locator (actors), to face the locked foe. */
  setLocator(locator: FoeLocator | undefined): void;
}

export interface HeroesOptions {
  terrain?: TerrainView;
  locator?: FoeLocator;
}

interface GuideRig {
  root: THREE.Group;
  mixer: THREE.AnimationMixer;
  idle: THREE.AnimationAction | null;
  current: THREE.AnimationAction | null;
  clips: THREE.AnimationClip[];
}

export function createHeroes(stage: Stage, map: MapDef, options: HeroesOptions = {}): HeroesView {
  const group = new THREE.Group();
  group.name = "heroes";
  stage.layers.actors.add(group);
  const [daisX, daisZ] = map.dais.center;
  const ground = (x: number, z: number): number => options.terrain?.heightAt(x, z) ?? 0;
  // Fire Dragon: an anchor over the dais the code turns; the rig (or placeholder) inside.
  const fireAnchor = new THREE.Group();
  fireAnchor.position.set(daisX, ground(daisX, daisZ) + map.dais.heroHoverM, daisZ);
  group.add(fireAnchor);
  const guideAnchor = new THREE.Group();
  const [gx, gz] = map.dais.guideAt;
  guideAnchor.position.set(gx, ground(gx, gz), gz);
  guideAnchor.rotation.y = Math.sign(-gx) * GUIDE_TURN_RAD;
  group.add(guideAnchor);

  // Placeholders (primitives only): a capsule body and a cone snout; the guide a capsule.
  const firePlaceholder = new THREE.Group();
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: FIRE_COLOR, roughness: 0.6, emissive: "#3a1004" });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.75, 1.6, 4, 12), bodyMaterial);
  body.rotation.x = Math.PI / 2;
  const snout = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1, 10), bodyMaterial);
  snout.rotation.x = Math.PI / 2;
  snout.position.set(0, 0.2, 1.7);
  firePlaceholder.add(body, snout);
  fireAnchor.add(firePlaceholder);
  const guidePlaceholder = new THREE.Mesh(new THREE.CapsuleGeometry(0.55, 1.4, 4, 12), new THREE.MeshStandardMaterial({ color: GUIDE_COLOR, roughness: 0.7 }));
  guidePlaceholder.position.y = 1.25;
  guideAnchor.add(guidePlaceholder);

  let fire: Hero | null = null;
  let guide: GuideRig | null = null;
  let guideEnv: THREE.Texture | null = null;
  let yaw = Math.atan2(0.15, -1);
  let wantYaw = yaw;
  let side = 0;
  let hurt = 0;
  let glow = 0;
  let time = 0;
  let boostUntil = 0;
  let dead = false;
  /** Death or Victory left the rig in an end pose; a reset plays it out. */
  let posed = false;
  let disposed = false;
  let locator = options.locator;
  /** Word slot → its foe, and the locked foe Hỏa Long faces. */
  const words = new Map<number, EntityRef>();
  let lockedFoe: { slot: number; serial: number } | null = null;
  const at = new THREE.Vector3();
  const mouthFallback = [0, 0.2, 1.9] as const;

  const loadFire = async (): Promise<void> => {
    const url = modelUrl(HERO_MODELS.fire, stage.quality);
    if (url === null) return;
    try {
      const gltf = await loadModel(url);
      if (disposed) {
        freeObject(gltf.scene);
        return;
      }
      const hero = new Hero(gltf.scene, gltf.animations, {
        tipsPerSide: 0,
        trail: 2,
        fitSize: FIRE_SIZE_M,
        // Generated facing +Z; the anchor turns it to the foe.
        faceAway: false,
        clips: { idle: [FIRE_CLIPS.idle], attackL: [FIRE_CLIPS.attackL], attackR: [FIRE_CLIPS.attackR], attackBoth: [FIRE_CLIPS.attackBoth], cast: [FIRE_CLIPS.cast], hit: [FIRE_CLIPS.hit], death: [FIRE_CLIPS.death], victory: [FIRE_CLIPS.victory] },
        knock: 0.6,
      });
      fireAnchor.add(hero.root);
      firePlaceholder.visible = false;
      fire = hero;
    } catch (error) {
      console.warn("heroes: Hoa Long model failed, placeholder kept", url, error);
    }
  };

  const loadGuide = async (): Promise<void> => {
    const url = modelUrl(HERO_MODELS.guide, stage.quality);
    if (url === null) return;
    try {
      const gltf = await loadModel(url);
      if (disposed) {
        freeObject(gltf.scene);
        return;
      }
      const model = gltf.scene;
      // The studio environment Space's title lights it with, on its own materials only.
      const pmrem = new THREE.PMREMGenerator(stage.renderer);
      const room = new RoomEnvironment();
      guideEnv = pmrem.fromScene(room, 0.04).texture;
      room.dispose();
      pmrem.dispose();
      model.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.frustumCulled = false;
        for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
          const standard = material as THREE.MeshStandardMaterial;
          if (!standard.isMeshStandardMaterial) continue;
          standard.envMap = guideEnv;
          standard.envMapIntensity = GUIDE_ENV_INTENSITY;
          // Pearl, not red: told apart from Hỏa Long at 60 px (M0b).
          standard.onBeforeCompile = (shader) => {
            shader.fragmentShader = shader.fragmentShader
              .replace("#include <map_fragment>", "#include <map_fragment>\n" + GUIDE_PEARL_GLSL)
              .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\n" + GUIDE_GLOW_GLSL);
          };
          standard.customProgramCacheKey = () => "dh-guide-pearl-v1";
          standard.needsUpdate = true;
        }
      });
      const mixer = new THREE.AnimationMixer(model);
      const idleClip = gltf.animations.find((clip) => clip.name === GUIDE_CLIPS_DH.idle);
      const idle = idleClip ? mixer.clipAction(idleClip) : null;
      idle?.play();
      mixer.update(0);
      // Fit: GUIDE_SIZE_M tall, feet on the dais.
      model.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const pivot = new THREE.Group();
      model.position.set(-center.x, -box.min.y, -center.z);
      pivot.scale.setScalar(GUIDE_SIZE_M / Math.max(size.y, 0.001));
      pivot.add(model);
      const root = new THREE.Group();
      root.add(pivot);
      guideAnchor.add(root);
      guidePlaceholder.visible = false;
      const rig: GuideRig = { root, mixer, idle, current: null, clips: gltf.animations };
      mixer.addEventListener("finished", ((event: { action: THREE.AnimationAction }) => {
        if (event.action !== rig.current || rig.idle === null) return;
        rig.idle.enabled = true;
        rig.idle.setEffectiveWeight(1);
        rig.idle.crossFadeFrom(event.action, 0.35, false);
        rig.current = null;
      }) as never);
      guide = rig;
    } catch (error) {
      console.warn("heroes: Bach Long model failed, placeholder kept", url, error);
    }
  };

  const ready = Promise.all([loadFire(), loadGuide()]).then(() => undefined);

  const play = (name: ShotName): void => {
    if (dead && name !== "victory") return;
    if (fire !== null) fire.play(name);
    if (name === "cast") glow = 1;
  };

  const guideAct = (act: GuideAct): void => {
    const rig = guide;
    if (rig === null || rig.idle === null) return;
    const clip = rig.clips.find((item) => item.name === GUIDE_CLIPS_DH[act]);
    if (clip === undefined) return;
    const next = rig.mixer.clipAction(clip);
    next.reset();
    next.setLoop(THREE.LoopOnce, 1);
    next.clampWhenFinished = true;
    next.enabled = true;
    next.setEffectiveWeight(1);
    next.play();
    next.crossFadeFrom(rig.current ?? rig.idle, rig.current ? 0.18 : 0.25, false);
    rig.current = next;
  };

  const face = (x: number, z: number): void => {
    const dx = x - fireAnchor.position.x;
    const dz = z - fireAnchor.position.z;
    if (dx * dx + dz * dz > 0.01) wantYaw = Math.atan2(dx, dz);
  };

  const tick = (dt: number, now: number): void => {
    time = now;
    if (lockedFoe !== null && locator?.locate(lockedFoe.slot, lockedFoe.serial, "base", at)) face(at.x, at.z);
    yaw = turnToward(yaw, wantYaw, dt * 5.5);
    fireAnchor.rotation.y = yaw;
    hurt = Math.max(0, hurt - dt * 6);
    glow = Math.max(0, glow - dt * 1.5);
    if (fire !== null) {
      fire.locomotion = time < boostUntil ? "boost" : "idle";
      fire.update(dt, time, 0);
      fire.setLook(hurt, glow, 1);
    } else {
      // Placeholder hover bob.
      firePlaceholder.position.y = Math.sin(time * 1.7) * 0.12;
      bodyMaterial.emissiveIntensity = 1 + hurt * 3 + glow * 2;
    }
    guide?.mixer.update(dt);
  };

  const view: HeroesView = {
    ready,
    get fire(): Hero | null {
      return fire;
    },
    get guideLoaded(): boolean {
      return guide !== null;
    },
    play,
    guide: guideAct,
    face,
    tick,

    reset(): void {
      dead = false;
      hurt = 0;
      glow = 0;
      boostUntil = 0;
      words.clear();
      lockedFoe = null;
      yaw = wantYaw = Math.atan2(0.15, -1);
      // A short shot fades the Death or Victory pose back to the idle hover.
      if (posed && fire !== null) fire.play("hit");
      posed = false;
    },

    setLocator(next: FoeLocator | undefined): void {
      locator = next;
    },

    mouth(out: THREE.Vector3): THREE.Vector3 {
      if (fire !== null) return fire.socketWorld(fire.sockets.mouth, out, mouthFallback);
      firePlaceholder.updateMatrixWorld(true);
      return snout.localToWorld(out.set(0, 0.5, 0));
    },

    onEvents(events: readonly SimEvent[], world: World): void {
      for (const event of events) {
        switch (event.type) {
          case "word-assigned":
            if (event.target !== null) words.set(event.word, event.target);
            else words.delete(event.word);
            break;
          case "word-progress":
            if (event.key === "lock") {
              const target = words.get(event.word);
              lockedFoe = target?.kind === "enemy" ? { slot: target.slot, serial: target.serial } : null;
            }
            break;
          case "word-released":
            words.delete(event.word);
            break;
          case "word-complete": {
            const target = event.target;
            if (target?.kind === "enemy") {
              lockedFoe = { slot: target.slot, serial: target.serial };
              const foe = world.enemies.list[target.slot];
              const near = foe !== undefined && Math.hypot(uToM(foe.x), uToM(foe.z)) <= RINGS.meleeMm / 1000;
              // 05 §6.1: L and R in turn; Both on Chớp, Hoàn hảo or a foe within 6 m.
              if (event.grade === "flash" || event.grade === "perfect" || near) play("attackBoth");
              else {
                play(side === 0 ? "attackL" : "attackR");
                side = 1 - side;
              }
            }
            words.delete(event.word);
            break;
          }
          case "skill":
            if (event.stage !== "cast") break;
            face(event.x, event.z);
            if (event.skill === "breath") play("attackBoth");
            else if (event.skill === "skyfire" || event.skill === "inferno") play("cast");
            else if (event.skill === "roar") {
              boostUntil = time + 0.9;
              guideAct("flap");
            }
            break;
          case "hit":
            // Héo lan seeps (source "hero") without a flinch; foes' blows knock the Dragon.
            if (event.target.kind === "hero" && event.source.kind !== "hero") {
              hurt = 1;
              fire?.hurt(Math.min(1, 0.3 + event.amount / 60));
              if (event.amount >= 20) play("hit");
            }
            break;
          case "wave-start":
            guideAct("wave");
            break;
          case "phase":
            if (event.phase === "prep") guideAct("talk");
            break;
          case "victory":
            play("victory");
            posed = true;
            guideAct("wave");
            break;
          case "defeat":
            play("death");
            posed = true;
            dead = true;
            break;
          default:
            break;
        }
      }
    },

    frame(_world: World, info: FrameInfo): void {
      tick(info.dt, info.now / 1000);
    },

    dispose(): void {
      disposed = true;
      if (fire !== null) {
        // The kit's Hero frees geometry, materials and textures; its bone textures are ours to free.
        fire.root.traverse((object) => (object as THREE.SkinnedMesh).isSkinnedMesh && (object as THREE.SkinnedMesh).skeleton.dispose());
        fire.dispose();
      }
      if (guide !== null) {
        guide.mixer.stopAllAction();
        guide.mixer.uncacheRoot(guide.root);
        freeObject(guide.root);
      }
      guideEnv?.dispose();
      body.geometry.dispose();
      snout.geometry.dispose();
      bodyMaterial.dispose();
      guidePlaceholder.geometry.dispose();
      (guidePlaceholder.material as THREE.Material).dispose();
      group.removeFromParent();
    },
  };
  return view;
}
