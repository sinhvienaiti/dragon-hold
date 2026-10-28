/**
 * The WebGL stage: renderer on #dh-canvas, scene, perspective camera (FOV 30°,
 * 05 §3), light rig and layer groups the other view parts add to.
 * Adapt from Space src/defense/view (copy with a source header; never import).
 * Light rig and post adapted from games/space-typing src/scene3d/space.ts via
 * kit/three Stage3D (renderer, bloom, resize), retuned for the painted forest:
 * warm key sun with soft shadows, cool sky fill, violet ground bounce, a grade
 * pass (Neutral tone map, split toning, gentle lift, vignette), bloom only
 * above HDR 1 (fire, spells) on High and Ultra.
 * `createMapStage` assembles the whole diorama (terrain, water, paths,
 * scatter, camera rig); `startTerrainPreview` is the view-only page
 * (`?view=terrain`).
 * Owner: view-terrain (LANES.md).
 */
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { FXAAShader } from "three/examples/jsm/shaders/FXAAShader.js";
import type { Projector, Quality, ScreenPoint } from "../app/contracts";
import { MAP_L2_CAU } from "../content/data/maps";
import { KEYS } from "../content/rules";
import type { MapDef } from "../content/types";
import { CAMERA_ACTIONS, createCameraRig, type CameraRig } from "./camera";
import { sceneFor } from "./maps/scene";
import { BRIDGE_MODEL, PROP_SPECS } from "./model-specs";
import { loadCrowdModels, type CrowdModels } from "./models";
import { buildPaths, type PathsView } from "./paths";
import { buildScatter, type ScatterView } from "./scatter";
import { mapSwitch } from "./paint";
import { buildTerrain, SUN_DIRECTION, sunDirection, type PaintedTerrain } from "./terrain";
import { buildWater, type WaterView } from "./water";

export interface StageLayers {
  readonly ground: THREE.Group;
  readonly actors: THREE.Group;
  readonly fx: THREE.Group;
}

export interface StageLights {
  readonly sky: THREE.HemisphereLight;
  /** Warm sun; casts the shadows on Medium and up. */
  readonly key: THREE.DirectionalLight;
  /** Cool fill from the opposite side, no shadow. */
  readonly fill: THREE.DirectionalLight;
}

export interface Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly layers: StageLayers;
  readonly quality: Quality;
  /** World metres → CSS pixels, for DOM tags and chips. */
  readonly project: Projector;
  resize(): void;
  render(): void;
  dispose(): void;
}

/** The game's stage (createStage): the Stage contract plus lights, size and frame stats. */
export interface PaintedStage extends Stage {
  /** The canvas inside the host. */
  readonly canvas: HTMLCanvasElement;
  readonly lights: StageLights;
  /** CSS size of the view. */
  readonly width: number;
  readonly height: number;
  /** Draw calls and triangles of the last rendered frame (shadow and post passes included). */
  stats(): { drawCalls: number; triangles: number };
  /** Turns the HDR bloom (fire, spells) on or off where the tier has it (High, Ultra); false when it has none. */
  setBloom(on: boolean): boolean;
}

/**
 * What each tier draws (05 §8): pixel ratio cap, shadow map, grade pass,
 * anti-aliasing (MSAA samples or FXAA), bloom (`bloom`: on at start;
 * `bloomPass`: built, so setBloom can turn it on). Measured on the bare
 * diorama at 1080p, Apple Silicon, vsync off: post + FXAA ≈ 3.5 ms, 4× MSAA
 * on the half-float target +1.8 ms, bloom +2.2 ms.
 */
export const STAGE_QUALITY: Readonly<Record<Quality, { dpr: number; shadow: number; post: boolean; samples: number; fxaa: boolean; bloom: boolean; bloomPass: boolean }>> = {
  low: { dpr: 1, shadow: 0, post: false, samples: 0, fxaa: false, bloom: false, bloomPass: false },
  medium: { dpr: 1, shadow: 1024, post: true, samples: 0, fxaa: true, bloom: false, bloomPass: false },
  high: { dpr: 1.25, shadow: 2048, post: true, samples: 0, fxaa: true, bloom: false, bloomPass: true },
  ultra: { dpr: 2, shadow: 4096, post: true, samples: 4, fxaa: false, bloom: true, bloomPass: true },
};

/** Mist colour (sky never shows at 40–75° tilt; the far ground melts into it). */
const MIST = new THREE.Color("#b6c0d4");

const GRADE_SHADER = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uExposure: { value: 1.0 },
    uSaturation: { value: 1.0 },
    // Map pilot (MAP_PLAN 2.5): shadows cool blue, not violet; a milky lift without the violet cast.
    uLift: { value: new THREE.Vector3(0.022, 0.024, 0.034) },
    uShadowTint: { value: new THREE.Vector3(0.95, 0.98, 1.05) },
    uHighTint: { value: new THREE.Vector3(1.04, 1.01, 0.94) },
    uVignette: { value: 0.22 },
    uAspect: { value: 16 / 9 },
  },
  vertexShader: /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`,
  fragmentShader: /* glsl */ `
uniform sampler2D tDiffuse;
uniform float uExposure;
uniform float uSaturation;
uniform vec3 uLift;
uniform vec3 uShadowTint;
uniform vec3 uHighTint;
uniform float uVignette;
uniform float uAspect;
varying vec2 vUv;
// Khronos PBR Neutral (three's NeutralToneMapping): keeps painted hues.
vec3 dhNeutral(vec3 color) {
  const float start = 0.8 - 0.04;
  const float desat = 0.15;
  float x = min(color.r, min(color.g, color.b));
  float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
  color -= offset;
  float peak = max(color.r, max(color.g, color.b));
  if (peak < start) return color;
  float d = 1.0 - start;
  float newPeak = 1.0 - d * d / (peak + d - start);
  color *= newPeak / peak;
  float g = 1.0 - 1.0 / (desat * (peak - newPeak) + 1.0);
  return mix(color, vec3(newPeak), g);
}
vec3 dhToSrgb(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}
void main() {
  vec4 texel = texture2D(tDiffuse, vUv);
  vec3 c = dhNeutral(max(texel.rgb * uExposure, 0.0));
  c = dhToSrgb(clamp(c, 0.0, 1.0));
  // Split toning: cool violet shadows, warm cream highlights; milky lift like paint on paper.
  float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c *= mix(uShadowTint, uHighTint, smoothstep(0.2, 0.8, luma));
  c = mix(vec3(luma), c, uSaturation);
  c = uLift + c * (1.0 - uLift);
  vec2 v = (vUv - 0.5) * vec2(uAspect, 1.0);
  c *= 1.0 - uVignette * smoothstep(0.45, 1.05, length(v));
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}
`,
};

/** Projects (x, y, z) metres to CSS pixels of a `width` × `height` view; ignores the shake offset. */
export function projectToScreen(camera: THREE.PerspectiveCamera, width: number, height: number, x: number, y: number, z: number, out: ScreenPoint, scratch = new THREE.Vector4(), clean = new THREE.Matrix4()): ScreenPoint {
  clean.copy(camera.projectionMatrix);
  // A symmetric perspective has no x/y shift in column 2; the rig puts its shake there.
  clean.elements[8] = 0;
  clean.elements[9] = 0;
  scratch.set(x, y, z, 1).applyMatrix4(camera.matrixWorldInverse).applyMatrix4(clean);
  if (scratch.w <= 1e-6) {
    out.x = -1e4;
    out.y = -1e4;
    out.visible = false;
    return out;
  }
  const nx = scratch.x / scratch.w;
  const ny = scratch.y / scratch.w;
  const nz = scratch.z / scratch.w;
  out.x = (nx * 0.5 + 0.5) * width;
  out.y = (1 - (ny * 0.5 + 0.5)) * height;
  out.visible = nz >= -1 && nz <= 1 && out.x >= 0 && out.x <= width && out.y >= 0 && out.y <= height;
  return out;
}

export function createStage(host: HTMLElement, quality: Quality = "high"): PaintedStage {
  const tier = STAGE_QUALITY[quality];
  const canvas = host.ownerDocument.createElement("canvas");
  canvas.className = "dh-gl";
  canvas.style.display = "block";
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.touchAction = "none";
  host.append(canvas);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !tier.post, powerPreference: "high-performance", stencil: false });
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, tier.dpr));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // The grade pass tone maps; without post the renderer does (Neutral keeps the painted hues).
  renderer.toneMapping = tier.post ? THREE.NoToneMapping : THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.setClearColor(MIST, 1);
  renderer.shadowMap.enabled = tier.shadow > 0;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.info.autoReset = false;

  const scene = new THREE.Scene();
  scene.background = MIST.clone();
  // Depth fog for other lanes' standard materials: far past the play area (view-terrain materials use radial mist).
  scene.fog = new THREE.Fog(MIST.clone(), 150, 380);

  const camera = new THREE.PerspectiveCamera(30, 16 / 9, 2, 700);
  camera.position.set(0, 78, 55);
  camera.lookAt(0, 0, 0);

  const sky = new THREE.HemisphereLight("#cfe0ff", "#6f5d80", 1.55);
  const key = new THREE.DirectionalLight("#ffe2b8", 3.3);
  key.position.copy(SUN_DIRECTION).multiplyScalar(140);
  key.target.position.set(0, 0, 0);
  key.castShadow = tier.shadow > 0;
  if (tier.shadow > 0) {
    key.shadow.mapSize.set(tier.shadow, tier.shadow);
    const box = key.shadow.camera;
    box.left = -78;
    box.right = 78;
    box.top = 78;
    box.bottom = -78;
    box.near = 20;
    box.far = 300;
    key.shadow.bias = -0.0006;
    key.shadow.normalBias = 0.05;
    key.shadow.radius = 3;
  }
  const fill = new THREE.DirectionalLight("#9fb6ff", 0.55);
  fill.position.set(60, 50, -70);
  scene.add(sky, key, key.target, fill);

  const layers: StageLayers = { ground: new THREE.Group(), actors: new THREE.Group(), fx: new THREE.Group() };
  layers.ground.name = "dh-layer-ground";
  layers.actors.name = "dh-layer-actors";
  layers.fx.name = "dh-layer-fx";
  scene.add(layers.ground, layers.actors, layers.fx);

  let composer: EffectComposer | null = null;
  let grade: ShaderPass | null = null;
  let bloom: UnrealBloomPass | null = null;
  let fxaa: ShaderPass | null = null;
  if (tier.post) {
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: tier.samples });
    composer = new EffectComposer(renderer, target);
    composer.addPass(new RenderPass(scene, camera));
    if (tier.bloomPass) {
      // Only HDR light above 1.6 blooms: fire and spells, never the sunlit ground.
      bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.32, 0.5, 1.6);
      bloom.enabled = tier.bloom;
      composer.addPass(bloom);
    }
    grade = new ShaderPass(GRADE_SHADER);
    composer.addPass(grade);
    if (tier.fxaa) {
      // After the grade: FXAA reads the final sRGB picture.
      fxaa = new ShaderPass(FXAAShader);
      composer.addPass(fxaa);
    }
  }

  let width = 1;
  let height = 1;
  const resize = (): void => {
    width = Math.max(1, host.clientWidth);
    height = Math.max(1, host.clientHeight);
    renderer.setSize(width, height, false);
    composer?.setPixelRatio(renderer.getPixelRatio());
    composer?.setSize(width, height);
    if (grade) grade.uniforms.uAspect!.value = width / height;
    const ratio = renderer.getPixelRatio();
    if (fxaa) (fxaa.uniforms.resolution!.value as THREE.Vector2).set(1 / (width * ratio), 1 / (height * ratio));
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  resize();
  const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(resize);
  observer?.observe(host);

  const scratch = new THREE.Vector4();
  const clean = new THREE.Matrix4();
  const project: Projector = (x, y, z, out) => projectToScreen(camera, width, height, x, y, z, out, scratch, clean);

  return {
    renderer,
    scene,
    camera,
    layers,
    quality,
    project,
    canvas,
    lights: { sky, key, fill },
    get width() {
      return width;
    },
    get height() {
      return height;
    },
    resize,
    render(): void {
      renderer.info.reset();
      if (composer) composer.render();
      else renderer.render(scene, camera);
    },
    stats() {
      return { drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
    },
    setBloom(on: boolean): boolean {
      if (!bloom) return false;
      bloom.enabled = on;
      return true;
    },
    dispose(): void {
      observer?.disconnect();
      bloom?.dispose();
      grade?.dispose();
      fxaa?.dispose();
      composer?.dispose();
      composer?.renderTarget1.dispose();
      composer?.renderTarget2.dispose();
      key.shadow.map?.dispose();
      renderer.dispose();
      canvas.remove();
    },
  };
}

// ── The whole diorama ────────────────────────────────────────────────────────

export interface MapStage {
  readonly stage: PaintedStage;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly terrain: PaintedTerrain;
  readonly water: WaterView;
  readonly paths: PathsView;
  readonly scatter: ScatterView;
  readonly rig: CameraRig;
  /** Ground height actors stand on (dais tiers and bridge decks included). */
  heightAt(xM: number, zM: number): number;
  /** Eases the camera, flows the water, sways the trees. */
  update(dt: number): void;
  render(): void;
  /** World metres → CSS pixels (stage.project). */
  worldToScreen(xM: number, yM: number, zM: number, out?: ScreenPoint): ScreenPoint;
  /** Swaps near scatter items and the bridge for the owner's GLB props once `models` has loaded them (M0b). */
  useModels(models: CrowdModels): void;
  /** Map pilot load times, ms: terrain (height field, layout, paint masks), scatter plan, ground bake (null until done or off). */
  readonly loadStats: {
    terrainMs: number;
    layoutMs: number;
    maskMs: number;
    scatterMs: number;
    bakeMs: number | null;
    bakeSplit: { prepMs: number; compileMs: number; renderMs: number } | null;
    baked: boolean;
  };
  /** Settles once the ground bake has run (or was skipped or failed). */
  readonly groundBaked: Promise<void>;
  dispose(): void;
}

/** Builds the stage and the painted diorama of `map` into `host` (the #dh-canvas element). */
export function createMapStage(host: HTMLElement, map: MapDef, quality: Quality = "high"): MapStage {
  const stage = createStage(host, quality);
  const t0 = performance.now();
  const terrain = buildTerrain(map, quality);
  const t1 = performance.now();
  const water = buildWater(map, terrain);
  const paths = buildPaths(map, terrain);
  const t2 = performance.now();
  const scatter = buildScatter(map, terrain, quality);
  const loadStats = {
    terrainMs: t1 - t0,
    layoutMs: terrain.field.layoutMs,
    maskMs: terrain.paint.bakeMs,
    scatterMs: performance.now() - t2,
    bakeMs: null as number | null,
    bakeSplit: null as { prepMs: number; compileMs: number; renderMs: number } | null,
    baked: false,
  };
  stage.layers.ground.add(terrain.group, water.group, paths.group, scatter.group);
  // The map's light (scene spec): the key sun moves to the map's bearing and elevation; the cool fill
  // comes from the other side; the sky light's ground bounce takes the map's colour.
  const sun = sunDirection(map);
  stage.lights.key.position.copy(sun).multiplyScalar(140);
  stage.lights.fill.position.set(-sun.x * 90, 50, -sun.z * 90);
  const lighting = sceneFor(map)?.lighting;
  if (lighting?.hemiSky) stage.lights.sky.color.set(lighting.hemiSky);
  if (lighting?.hemiGround) stage.lights.sky.groundColor.set(lighting.hemiGround);
  if (lighting?.hemiIntensity) stage.lights.sky.intensity = lighting.hemiIntensity;
  stage.scene.background = terrain.look.mist.clone();
  stage.renderer.setClearColor(terrain.look.mist, 1);
  (stage.scene.fog as THREE.Fog).color.copy(terrain.look.mist);
  const rig = createCameraRig(stage.camera, map, host);
  rig.update(0);
  let disposed = false;
  // A3: bake the ground paint once its tiles and decals are in (the live paint shows until then).
  const groundBaked = terrain.paint.ready
    .then(() => (disposed ? null : terrain.paint.bake(stage.renderer, terrain.look)))
    .then((ms) => {
      loadStats.bakeMs = ms;
      loadStats.baked = ms !== null;
      loadStats.bakeSplit = terrain.paint.bakeSplit;
    })
    .catch((error: unknown) => console.warn("paint: the ground bake failed; the live paint stays", error));
  return {
    loadStats,
    groundBaked,
    stage,
    scene: stage.scene,
    camera: stage.camera,
    renderer: stage.renderer,
    terrain,
    water,
    paths,
    scatter,
    rig,
    heightAt: terrain.heightAt,
    update(dt: number): void {
      terrain.update(dt);
      water.update(dt);
      paths.update(dt);
      rig.update(dt);
    },
    render: stage.render,
    worldToScreen(xM, yM, zM, out = { x: 0, y: 0, visible: false }) {
      return stage.project(xM, yM, zM, out);
    },
    useModels(models: CrowdModels): void {
      void models.ready.then(() => {
        if (disposed) return;
        scatter.useProps((key) => models.prop(key), stage.renderer);
        paths.useBridge(models.prop(BRIDGE_MODEL.manifest));
      });
    },
    dispose(): void {
      disposed = true;
      rig.dispose();
      scatter.dispose();
      paths.dispose();
      water.dispose();
      terrain.dispose();
      stage.dispose();
    },
  };
}

// ── View-only page (?view=terrain) ───────────────────────────────────────────

export interface TerrainPreviewInfo {
  readonly ready: boolean;
  readonly frames: number;
  /** Mean frame time of the last second, ms. */
  readonly frameMs: number;
  readonly drawCalls: number;
  readonly triangles: number;
  readonly yawDeg: number;
  readonly pitchDeg: number;
  readonly zoom: number;
  readonly load?: MapStage["loadStats"];
}

declare global {
  interface Window {
    /** Set by the terrain preview (`?view=terrain`) for CDP scenarios. */
    __dhTerrain?: {
      info(): TerrainPreviewInfo;
      setView(view: { yawDeg?: number; pitchDeg?: number; zoom?: number; targetX?: number; targetZ?: number }, snap?: boolean): void;
      action(name: string): boolean;
      showSlots(visible: boolean, highlight?: readonly number[]): void;
      project(x: number, y: number, z: number): ScreenPoint;
      heightAt(x: number, z: number): number;
    };
  }
}

const QUALITIES: readonly Quality[] = ["low", "medium", "high", "ultra"];

/**
 * The view-only page: the L2-cau diorama with the free camera and no game.
 * URL: `?view=terrain[&q=low|medium|high|ultra][&hud=0]`. Camera keys follow
 * rules.ts KEYS (arrows, Alt + ↑/↓, Alt + 0); letters do nothing here.
 */
export function startTerrainPreview(doc: Document = document, map: MapDef = MAP_L2_CAU): { dispose(): void } {
  const view = doc.defaultView ?? window;
  const params = new URLSearchParams(view.location.search);
  const asked = params.get("q") as Quality | null;
  const quality: Quality = asked && QUALITIES.includes(asked) ? asked : "high";
  const host = doc.getElementById("dh-canvas") ?? doc.body;
  const world = createMapStage(host, map, quality);
  // Map spike: the preview loads the kit props too (scatter, bridge), so captures show the real map.
  const models = params.get("props") === "0" ? null : loadCrowdModels(quality, { only: [...PROP_SPECS.map((prop) => prop.manifest), BRIDGE_MODEL.manifest] });
  let propsSettled = models === null;
  if (models !== null) {
    world.useModels(models);
    void models.ready.then(() => {
      // useModels swaps on the same promise; one more tick lets that run first.
      setTimeout(() => (propsSettled = true), 0);
    });
  }

  let label: HTMLElement | null = null;
  if (params.get("hud") !== "0") {
    label = doc.createElement("div");
    label.className = "dh-terrain-preview";
    label.style.cssText = "position:fixed;left:12px;bottom:10px;padding:6px 10px;border-radius:6px;background:rgba(32,26,20,.62);color:#f3ead6;font:500 13px/1.4 system-ui,sans-serif;pointer-events:none;z-index:5";
    label.textContent = "Xem đất · " + map.nameVi + " · chuột phải xoay, lăn chuột thu phóng, chuột giữa kéo · ← → ↑ ↓ · Alt + ↑/↓ · Alt + 0";
    doc.body.append(label);
  }

  // Camera keys by event.code (00 §6); letters are never camera keys.
  const cameraKeys = KEYS.filter((binding) => (CAMERA_ACTIONS as readonly string[]).includes(binding.action));
  const onKey = (event: KeyboardEvent): void => {
    if (event.isComposing || event.ctrlKey || event.metaKey || event.code.startsWith("Key")) return;
    const mod = event.altKey ? "alt" : event.shiftKey ? "shift" : "none";
    const binding = cameraKeys.find((entry) => entry.code === event.code && entry.mod === mod);
    if (binding && world.rig.handleAction(binding.action)) event.preventDefault();
  };
  view.addEventListener("keydown", onKey);

  let frames = 0;
  let last = view.performance.now();
  let windowStart = last;
  let windowFrames = 0;
  let frameMs = 0;
  let raf = 0;
  const tick = (time: number): void => {
    const dt = Math.min(0.05, Math.max(0, (time - last) / 1000));
    last = time;
    world.update(dt);
    world.render();
    frames += 1;
    windowFrames += 1;
    if (time - windowStart >= 1000) {
      frameMs = (time - windowStart) / windowFrames;
      windowStart = time;
      windowFrames = 0;
    }
    raf = view.requestAnimationFrame(tick);
  };
  raf = view.requestAnimationFrame(tick);

  view.__dhTerrain = {
    info: () => ({
      ready: frames > 2 && propsSettled && (world.loadStats.baked || mapSwitch("bake") === "0"),
      load: world.loadStats,
      frames,
      frameMs,
      ...world.stage.stats(),
      yawDeg: world.rig.yawDeg,
      pitchDeg: world.rig.pitchDeg,
      zoom: world.rig.zoom,
    }),
    setView: (next, snap = true) => world.rig.setView(next, snap),
    action: (name) => world.rig.handleAction(name),
    showSlots: (visible, highlight) => world.paths.showSlots(visible, highlight),
    project: (x, y, z) => world.worldToScreen(x, y, z),
    heightAt: (x, z) => world.heightAt(x, z),
  };

  return {
    dispose(): void {
      view.cancelAnimationFrame(raf);
      view.removeEventListener("keydown", onKey);
      label?.remove();
      delete view.__dhTerrain;
      world.dispose();
      models?.dispose();
    },
  };
}
