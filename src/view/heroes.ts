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
import { Hero, loadModel, Ribbon, type ShotName } from "../kit/three";
import type { EntityRef, MapDef, SimEvent } from "../content/types";
import { RINGS } from "../content/rules";
import { uToM } from "../sim/fixed";
import type { World } from "../sim/world";
import type { FrameInfo, Presenter, Quality } from "../app/contracts";
import type { FoeLocator } from "./actors";
import { turnToward } from "./actors";
import { FX_RIBBON_ORDER, type MouthSource } from "./fx";
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

/**
 * Release table of Hỏa Long's Attack clips (VFX_STANDARD §3.1 rule 3): the clip time, at speed 1, where the jaws
 * let go. Measured on draconis-v2.high.glb on 28/10 (each clip sampled at 60 Hz, FX_MOUTH and the head, neck and
 * chest bones): Attack_L and Attack_R toss the head aside, fastest from frame 10 to the peak at frame 15
 * (0.25 s, a 24 fps key); Attack_Both rears the chest to frame 12 and lunges, past its fastest at frame 17.5
 * (0.292 s, a key). Before those frames the clips barely move: the head lifts ≤ 1°, Both's chest rears 4.5°.
 * At their play speeds (1.6, 1.4) the releases come 156 ms and 208 ms after play(): far over the 50 ms a key may
 * wait for its bolt. So the Dragon plays each clip from its release frame (strike clips, FIRE_STRIKE), the bolt
 * leaves on the frame the word completes, and the wind-up before it follows the typing (coil, below).
 */
export const FIRE_RELEASE_S = { attackL: 6 / 24, attackR: 6 / 24, attackBoth: 7 / 24 } as const;
/** The strike clips the Hero plays: each Attack clip from its release frame on (releaseDelay 0 by construction). */
export const FIRE_STRIKE = { attackL: FIRE_CLIPS.attackL + "_Strike", attackR: FIRE_CLIPS.attackR + "_Strike", attackBoth: FIRE_CLIPS.attackBoth + "_Strike" } as const;

/**
 * A (the wind-up follows the typing, VFX_STANDARD §5.3 part 1): with each right letter the head and neck draw back
 * and up and the chest rears, a step at a time, to these angles (rad, local X) on a whole word; the idle loop and
 * the wing beat play on underneath. R: on release the head kicks back on a spring (peak ~4 frames, settled by 10).
 */
const COIL = { neck: 0.2, head: 0.13, chest: -0.08 } as const;
const HEAD_KICK = { rad: 0.16, peakS: 0.06 } as const;
/** Sky Fire (VFX_STANDARD §5.3 part 2): the head jerks up at the release, 12 frames into the Cast clip (skyfire.ts SKY_FX.releaseS), harder than a word's. */
const SKYFIRE_KICK = { delayS: 12 / 60, gain: 1.6 } as const;
/** A word left half typed holds its coil this long (s), then lets go. */
const COIL_HOLD_S = 1.4;
/** Wing ribbons on FX_WING_L/R/L2/R2: points (one a frame), half-width (m), how long they burn after an attack (s). */
const WING_TRAIL_POINTS = 16;
const WING_TRAIL_WIDTH_M = 0.2;
const WING_TRAIL_S = 0.5;
// The fire ramp's saturated end: the peach #ffb37a, added over the sunlit dais, read as pale beige bars (judge 1a).
const WING_COLORS = [new THREE.Color("#ff8a3d"), new THREE.Color("#ff5a1f")] as const;

/**
 * An Attack clip from `fromS` on, resampled at 60 Hz (every track kept: a dropped track would let a bone fall to
 * its rest pose). Key 0 holds the whole clip's first pose and the strike starts STRIKE_LEAD_S later: the Hero plays
 * these clips additively (CHARACTER_ANIMATION.md L1), and the kit makes a clip additive against its own frame 0,
 * which must be the pose the clip was authored around (the glide pose G0), not the release pose. The mixer's first
 * step after play() is longer than the lead, so the release pose still shows on the frame the word completes.
 */
export const STRIKE_LEAD_S = 1e-4;
export function strikeClip(clip: THREE.AnimationClip, fromS: number, name: string): THREE.AnimationClip {
  const fps = 60;
  const length = Math.max(1 / fps, clip.duration - fromS);
  const count = Math.round(length * fps) + 1;
  const tracks = clip.tracks.map((track) => {
    const size = track.getValueSize();
    const interpolant = track.createInterpolant();
    const times = new Float32Array(count + 1);
    const values = new Float32Array((count + 1) * size);
    values.set(interpolant.evaluate(0) as ArrayLike<number>, 0);
    for (let i = 0; i < count; i += 1) {
      times[i + 1] = STRIKE_LEAD_S + Math.min(length, i / fps);
      values.set(interpolant.evaluate(Math.min(clip.duration, fromS + i / fps)) as ArrayLike<number>, (i + 1) * size);
    }
    const Track = track.constructor as new (name: string, times: Float32Array, values: Float32Array) => THREE.KeyframeTrack;
    return new Track(track.name, times, values);
  });
  return new THREE.AnimationClip(name, length + STRIKE_LEAD_S, tracks);
}

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
  /** A: the typed share of the word being typed (target) and the coil as drawn; R: seconds since the release (head kick). */
  let coilTarget = 0;
  let coil = 0;
  let coilIdle = 0;
  let typing = -1;
  let kickAge = Number.POSITIVE_INFINITY;
  let kickGain = 1;
  /** Wing trails: how bright they burn now (an attack lights them, they fade over WING_TRAIL_S). */
  let wingHeat = 0;
  let bones: { neck: THREE.Object3D | null; head: THREE.Object3D | null; chest: THREE.Object3D | null } = { neck: null, head: null, chest: null };
  let wingTips: THREE.Object3D[] = [];
  const wings = [0, 1, 2, 3].map((index) => {
    const ribbon = new Ribbon(WING_TRAIL_POINTS, WING_COLORS[Math.floor(index / 2) % WING_COLORS.length]!, WING_TRAIL_WIDTH_M);
    ribbon.mesh.renderOrder = FX_RIBBON_ORDER;
    ribbon.mesh.visible = false;
    stage.layers.fx.add(ribbon.mesh);
    return ribbon;
  });
  const tip = new THREE.Vector3();
  const eye = new THREE.Vector3();
  /**
   * Each wing ribbon follows its socket through a low-pass (≈ 3 frames): sampled once a frame, a fast beat reversed
   * inside a frame and drew right-angle hooks (judge 1a round 2); the filtered path bends round them.
   */
  const smoothTips = wings.map(() => new THREE.Vector3());
  let smoothFresh = true;

  const loadFire = async (): Promise<void> => {
    const url = modelUrl(HERO_MODELS.fire, stage.quality);
    if (url === null) return;
    try {
      const gltf = await loadModel(url);
      if (disposed) {
        freeObject(gltf.scene);
        return;
      }
      const strikes: THREE.AnimationClip[] = [];
      for (const key of ["attackL", "attackR", "attackBoth"] as const) {
        const clip = gltf.animations.find((item) => item.name === FIRE_CLIPS[key]);
        if (clip !== undefined) strikes.push(strikeClip(clip, FIRE_RELEASE_S[key], FIRE_STRIKE[key]));
      }
      const hero = new Hero(gltf.scene, [...gltf.animations, ...strikes], {
        tipsPerSide: 0,
        // The kit's own ribbons on FX_WING_* are 5 cm wide (fixed in the kit) and never added to the scene here;
        // the wing trails below use the same sockets and length at a width the play camera sees.
        trail: WING_TRAIL_POINTS,
        palette: WING_COLORS,
        fitSize: FIRE_SIZE_M,
        // Generated facing +Z; the anchor turns it to the foe.
        faceAway: false,
        clips: { idle: [FIRE_CLIPS.idle], attackL: [FIRE_STRIKE.attackL], attackR: [FIRE_STRIKE.attackR], attackBoth: [FIRE_STRIKE.attackBoth], cast: [FIRE_CLIPS.cast], hit: [FIRE_CLIPS.hit], death: [FIRE_CLIPS.death], victory: [FIRE_CLIPS.victory] },
        // The strike clips start at their release: the bolt leaves on play() (FIRE_RELEASE_S).
        release: { attackL: 0, attackR: 0, attackBoth: 0 },
        // CHARACTER_ANIMATION.md L1 (29/10): the Space-made Attack, Hit and Cast clips are built round the glide pose
        // (body pitched 70°) to play additively over the flight loop; at full weight over Hover they laid Hỏa Long
        // flat for a frame on every attack. Additive, against their first (glide) pose, as Space plays them.
        additive: ["attackL", "attackR", "attackBoth", "cast", "hit"],
        knock: 0.6,
      });
      fireAnchor.add(hero.root);
      firePlaceholder.visible = false;
      fire = hero;
      bones = { neck: hero.node("neck"), head: hero.node("head"), chest: hero.node("chest") };
      wingTips = hero.tips.slice(0, 4);
      for (const ribbon of wings) ribbon.reset(hero.root.getWorldPosition(at));
      smoothFresh = true;
    } catch (error) {
      console.warn("heroes: Hỏa Long model failed, placeholder kept", url, error);
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
      console.warn("heroes: Bạch Long model failed, placeholder kept", url, error);
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

  /**
   * Over the clips' pose (after the mixer): the coil eases to the typed share (a letter lands in ~3 frames) and
   * the release kick springs the head back. Bone rotations are rewritten by the mixer every frame, so nothing adds up.
   */
  const pose = (dt: number): void => {
    // A word left half typed lets go slowly (fx.ts lets its charge go on the same clock).
    coilIdle += dt;
    if (coilIdle > COIL_HOLD_S) coilTarget = Math.max(0, coilTarget - dt * 2.5);
    coil += (coilTarget - coil) * (1 - Math.exp(-dt * 16));
    const t = kickAge;
    kickAge += dt;
    // A kick may be booked ahead (negative age: Sky Fire's release comes 12 frames after its cast).
    const kick = Number.isFinite(t) && t >= 0 ? HEAD_KICK.rad * kickGain * (t / HEAD_KICK.peakS) * Math.exp(1 - t / HEAD_KICK.peakS) : 0;
    if (coil < 0.002 && Math.abs(kick) < 0.002) return;
    bones.neck?.rotateX(COIL.neck * coil + kick * 0.4);
    bones.head?.rotateX(COIL.head * coil + kick);
    bones.chest?.rotateX(COIL.chest * coil);
    fire?.root.updateMatrixWorld(true);
  };

  /** Wing ribbons through the FX_WING_* sockets: lit by an attack or a boost, fading over WING_TRAIL_S. */
  const trailWings = (dt: number): void => {
    const boosting = time < boostUntil;
    wingHeat = Math.max(boosting ? 0.8 : 0, wingHeat - dt / WING_TRAIL_S);
    stage.camera.getWorldPosition(eye);
    const follow = 1 - Math.exp(-dt * 20);
    wingTips.forEach((socket, index) => {
      const ribbon = wings[index]!;
      const smooth = smoothTips[index]!;
      socket.getWorldPosition(tip);
      if (smoothFresh) smooth.copy(tip);
      else smooth.lerp(tip, follow);
      ribbon.update(smooth, dt, 0, eye, wingHeat * 0.9);
      ribbon.mesh.visible = wingHeat > 0.01;
    });
    smoothFresh = wingTips.length === 0;
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
      pose(dt);
      trailWings(dt);
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
      coil = coilTarget = 0;
      kickAge = Number.POSITIVE_INFINITY;
      wingHeat = 0;
      typing = -1;
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
          case "word-progress": {
            if (event.key === "lock") {
              const target = words.get(event.word);
              lockedFoe = target?.kind === "enemy" ? { slot: target.slot, serial: target.serial } : null;
            }
            // A: the wind-up follows the typing, a step a letter (the bench drives this with partial worlds).
            const length = world.words?.live[event.word]?.text.length ?? 0;
            if (length > 0 && (event.key === "lock" || event.key === "advance" || event.key === "back" || event.key === "switch")) {
              typing = event.word;
              coilTarget = event.typed / length;
              coilIdle = 0;
            }
            break;
          }
          case "word-released":
            words.delete(event.word);
            if (event.word === typing) coilTarget = 0;
            break;
          case "word-complete": {
            const target = event.target;
            if (target?.kind === "enemy") {
              lockedFoe = { slot: target.slot, serial: target.serial };
              const foe = world.enemies.list[target.slot];
              const near = foe !== undefined && Math.hypot(uToM(foe.x), uToM(foe.z)) <= RINGS.meleeMm / 1000;
              // 05 §6.1: L and R in turn; Both on Chớp, Hoàn hảo or a foe within 6 m.
              const strong = event.grade === "flash" || event.grade === "perfect";
              if (strong || near) play("attackBoth");
              else {
                play(side === 0 ? "attackL" : "attackR");
                side = 1 - side;
              }
              // R: the strike clip starts at its release; the coil lets go into it, the head kicks back, the wings flare.
              coilTarget = 0;
              kickAge = 0;
              kickGain = strong ? 1.3 : 1;
              wingHeat = 1;
            }
            words.delete(event.word);
            break;
          }
          case "skill":
            if (event.stage !== "cast") break;
            face(event.x, event.z);
            if (event.skill === "breath") play("attackBoth");
            else if (event.skill === "skyfire") {
              play("cast");
              // R: the head jerks up as the fireball leaves the mouth (L18).
              kickAge = -SKYFIRE_KICK.delayS;
              kickGain = SKYFIRE_KICK.gain;
            } else if (event.skill === "inferno") play("cast");
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
      for (const ribbon of wings) {
        ribbon.mesh.removeFromParent();
        ribbon.dispose();
      }
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
