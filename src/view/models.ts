/**
 * The owner's M0b models in the game: reads the m0b manifest
 * (public/assets/dragon-hold/models/m0b/, media on Drive, never in Git) with
 * the kit's ModelLibrary, loads each GLB with the kit loader (meshopt,
 * quantised, WebP), and turns it into a crowd layer: one float geometry
 * turned nose +z and normalised to height 1, smoothed normals for the
 * outline hull, a rig from view/crowd-rig.ts with its clips baked into a
 * bone texture, and the base-colour map. Props (scatter, the bridge) come
 * out the same way without a rig.
 * Tier by quality like the kit: Low draws no 3D (the primitives stay),
 * Medium the .medium files, High the .high ones, Ultra the .ultra ones
 * (parent docs/games/MODEL_QUALITY.md §2b, scripts/models/m0b-tiers.mjs).
 * Each layer and prop keeps the file's maps: colour, the normal map (Medium
 * and above) and the roughness map (High and Ultra), so the painted look of
 * the crowd and the scatter lies over real surface detail. Two geometry-only
 * files ride along (manifest fields `far`, `hull`): a scatter prop's far LOD
 * (trees their Medium mesh, the rest today's M0b cut; view/scatter.ts draws it
 * past PROP_LOD_M from the camera)
 * and, on High and Ultra, a crowd model's hull (the Medium mesh) for the
 * outline and ghost passes. A missing or
 * failed model keeps its primitive and logs one warning. Loaded once per
 * app; every crowd attached gets the layers now and as they arrive.
 * Owner: view (M0b models lane).
 */
import * as THREE from "three";
import { ModelLibrary, loadModel, pickModelTier, resolveModelUrl, type ModelKind } from "../kit/three";
import type { Quality } from "../app/contracts";
import type { Crowd, CrowdLayerSource } from "./crowd";
import { bakeRig, rigOf, skinWeights, smoothNormals, type BakedRig, type Rig } from "./crowd-rig";
import { BRIDGE_MODEL, KIT3_MANIFEST_URL, M0B_MANIFEST_URL, MODEL_SPECS, PROP_SPECS, modelLayerKey, type ModelSpec } from "./model-specs";

export interface ModelLayer {
  readonly spec: ModelSpec;
  readonly key: string;
  /** Template: each crowd gets a clone of the geometry (the crowd adds its instance attributes to it). */
  readonly source: CrowdLayerSource;
  readonly rig: Rig | null;
  readonly baked: BakedRig | null;
  readonly triangles: number;
}

/**
 * The maps of one loaded model (MODEL_QUALITY §2b): colour; the normal map on Medium and above, its scale as
 * the loader set it (y flipped for derivative tangents); the roughness map (grey, read from .g) on High and
 * Ultra; the material's roughness factor (1 with a map, the model's mean on Medium, 0.9 in the old M0b files).
 */
export interface SurfaceMaps {
  readonly map: THREE.Texture | null;
  readonly normalMap: THREE.Texture | null;
  readonly normalScale: THREE.Vector2;
  readonly roughnessMap: THREE.Texture | null;
  readonly roughness: number;
}

/** Lambert parameters of a model's maps for the painted look: colour, and the normal map when the tier has one. */
export function surfaceParams(maps: SurfaceMaps): THREE.MeshLambertMaterialParameters {
  return { map: maps.map, ...(maps.normalMap ? { normalMap: maps.normalMap, normalScale: maps.normalScale } : {}) };
}

/**
 * The painted props' roughness glint (paintMaterial `gloss`, High and Ultra): the map, a floor that keeps
 * foliage matte (Tripo gave the young pine 0.33), and a strength under the ramp's light.
 */
export const PROP_GLOSS = { foliage: { floor: 0.62, strength: 0.12 }, solid: { floor: 0.35, strength: 0.12 } } as const;

/** A static prop, metres as processed (Blender sized it), nose +z, feet at y = 0. */
export interface PropModel extends SurfaceMaps {
  readonly manifest: string;
  readonly geometry: THREE.BufferGeometry;
  readonly size: THREE.Vector3;
  readonly triangles: number;
  /**
   * Far LOD (scatter props, MODEL_QUALITY §3 step 2): today's M0b cut in the same model frame and uv atlas,
   * drawn with these maps past the LOD distance from the camera (view/scatter.ts); null when the manifest has none.
   */
  readonly far: THREE.BufferGeometry | null;
}

/** The geometry-only files of a manifest entry (scripts/models/m0b-tiers.mjs): a scatter prop's far LOD, a crowd model's hull. */
interface ExtraFiles {
  far?: string;
  hull?: string;
}

/**
 * The `far` and `hull` URLs of every manifest, first manifest first. The kit's ModelLibrary keeps only the
 * quality tiers, so the game reads these two fields itself.
 */
async function extraFiles(manifests: readonly string[]): Promise<Map<string, ExtraFiles>> {
  const found = new Map<string, ExtraFiles>();
  for (const manifest of manifests) {
    try {
      const response = await fetch(manifest);
      if (!response.ok) continue;
      const json = (await response.json()) as { models?: Record<string, { kind?: string; id?: string; far?: { url?: string }; hull?: { url?: string } }> };
      for (const entry of Object.values(json.models ?? {})) {
        const key = entry.kind + "/" + entry.id;
        if (found.has(key)) continue;
        const files: ExtraFiles = {};
        if (typeof entry.far?.url === "string") files.far = resolveModelUrl(entry.far.url, manifest);
        if (typeof entry.hull?.url === "string") files.hull = resolveModelUrl(entry.hull.url, manifest);
        found.set(key, files);
      }
    } catch {
      /* no extra files from this manifest */
    }
  }
  return found;
}

/** A geometry-only GLB's scene, or null when it does not load (the tier mesh stands in). */
const optionalScene = (url: string | undefined): Promise<THREE.Object3D | null> =>
  url === undefined ? Promise.resolve(null) : loadModel(url).then((gltf) => gltf.scene, () => null);

export interface CrowdModels {
  /** False on Low (no 3D: the primitives stay). */
  readonly enabled: boolean;
  /** Resolves once every model has loaded or failed. */
  readonly ready: Promise<void>;
  /**
   * The crowd layer a content model key draws in: its model's layer when models are on (the primitive stands in
   * there until the model loads), else undefined (the primitive's own shape layer).
   */
  layerKey(content: string): string | undefined;
  /** A loaded model layer (null: not loaded, failed or none). */
  layer(content: string): ModelLayer | null;
  /** Defines every loaded layer on `crowd`, now and as more load; returns the detach. */
  attach(crowd: Crowd): () => void;
  /** A loaded prop by manifest key. */
  prop(manifest: string): PropModel | null;
  /** Fires once every model has settled (props included): scatter and the bridge swap then. */
  onProps(listener: () => void): () => void;
  /** Content keys loaded, and what stayed a placeholder (missing, failed). */
  readonly loaded: readonly string[];
  readonly missing: readonly string[];
  dispose(): void;
}

/** A geometry with float position, normal and uv in world (scene) units, and the first material's maps, from one loaded GLB scene. */
function bakedGeometry(root: THREE.Object3D): { geometry: THREE.BufferGeometry; maps: SurfaceMaps } {
  root.updateMatrixWorld(true);
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  let material: THREE.MeshStandardMaterial | null = null;
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  const normalMatrix = new THREE.Matrix3();
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const geometry = mesh.geometry;
    const position = geometry.getAttribute("position");
    const normal = geometry.getAttribute("normal");
    const uv = geometry.getAttribute("uv");
    if (position === undefined) return;
    normalMatrix.getNormalMatrix(mesh.matrixWorld);
    const base = positions.length / 3;
    for (let i = 0; i < position.count; i += 1) {
      p.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
      positions.push(p.x, p.y, p.z);
      if (normal !== undefined) {
        n.fromBufferAttribute(normal, i).applyMatrix3(normalMatrix).normalize();
        normals.push(n.x, n.y, n.z);
      } else normals.push(0, 1, 0);
      if (uv !== undefined) uvs.push(uv.getX(i), uv.getY(i));
      else uvs.push(0, 0);
    }
    const index = geometry.getIndex();
    if (index !== null) for (let i = 0; i < index.count; i += 1) indices.push(base + index.getX(i));
    else for (let i = 0; i < position.count; i += 1) indices.push(base + i);
    material ??= ((Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.MeshStandardMaterial | undefined) ?? null;
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  const found = material as THREE.MeshStandardMaterial | null;
  const maps: SurfaceMaps = {
    map: found?.map ?? null,
    normalMap: found?.normalMap ?? null,
    normalScale: found?.normalScale?.clone() ?? new THREE.Vector2(1, 1),
    roughnessMap: found?.roughnessMap ?? null,
    roughness: found?.roughness ?? 0.9,
  };
  if (maps.map !== null) maps.map.colorSpace = THREE.SRGBColorSpace;
  return { geometry, maps };
}

/** Turns the kit's front (−z) to the crowd's nose (+z). */
function turnToNose(geometry: THREE.BufferGeometry): void {
  geometry.rotateY(Math.PI);
}

/** A crowd layer template from a loaded model: normalised to height 1, rigged and baked when the spec has a rig. */
export function buildModelLayer(spec: ModelSpec, root: THREE.Object3D, hullRoot: THREE.Object3D | null = null): ModelLayer {
  const { geometry, maps } = bakedGeometry(root);
  turnToNose(geometry);
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  const height = Math.max(1e-4, box.max.y - box.min.y);
  geometry.translate(0, -box.min.y, 0);
  geometry.scale(1 / height, 1 / height, 1 / height);
  geometry.computeBoundingBox();
  const size = geometry.boundingBox!.getSize(new THREE.Vector3());
  const position = geometry.getAttribute("position").array as Float32Array;
  const normal = geometry.getAttribute("normal").array as Float32Array;
  geometry.setAttribute("aHullN", new THREE.Float32BufferAttribute(smoothNormals(position, normal), 3));
  const rig = rigOf(spec.rig, spec.marks, spec.ours, spec.manifest);
  let baked: BakedRig | null = null;
  if (rig !== null) {
    const weights = skinWeights(position, rig.bones);
    geometry.setAttribute("aSkinI", new THREE.Float32BufferAttribute(weights.index, 4));
    geometry.setAttribute("aSkinW", new THREE.Float32BufferAttribute(weights.weight, 4));
    // The baker keeps feet and paws on the ground in every frame (its ground check skins these vertices).
    baked = bakeRig(rig, { positions: position, index: weights.index, weight: weights.weight });
  }
  // The hull (High, Ultra): the Medium mesh in the body's frame, with its own smoothed normals and skin weights
  // from the same rig, so the outline and the ghost move with the body at half its triangles.
  let hull: THREE.BufferGeometry | undefined;
  if (hullRoot !== null) {
    hull = bakedGeometry(hullRoot).geometry;
    turnToNose(hull);
    hull.translate(0, -box.min.y, 0);
    hull.scale(1 / height, 1 / height, 1 / height);
    const hullPosition = hull.getAttribute("position").array as Float32Array;
    hull.setAttribute("aHullN", new THREE.Float32BufferAttribute(smoothNormals(hullPosition, hull.getAttribute("normal").array as Float32Array), 3));
    if (rig !== null) {
      const weights = skinWeights(hullPosition, rig.bones);
      hull.setAttribute("aSkinI", new THREE.Float32BufferAttribute(weights.index, 4));
      hull.setAttribute("aSkinW", new THREE.Float32BufferAttribute(weights.weight, 4));
    }
  }
  const source: CrowdLayerSource = {
    geometry,
    sizeM: [size.x, size.y, size.z],
    animation: baked === null ? { kind: "procedural" } : { kind: "bones", boneTexture: baked.texture, bones: baked.bones, clips: baked.clips },
    roughness: maps.roughness,
    map: maps.map,
    normalMap: maps.normalMap,
    normalScale: maps.normalScale,
    roughnessMap: maps.roughnessMap,
    fit: spec.fit,
    model: true,
    hullNormals: true,
    ...(hull ? { hull } : {}),
  };
  return { spec, key: modelLayerKey(spec), source, rig, baked, triangles: (geometry.getIndex()?.count ?? 0) / 3 };
}

/** A prop from a loaded model (and its far LOD): turned nose +z, metres kept. */
export function buildProp(manifest: string, root: THREE.Object3D, farRoot: THREE.Object3D | null = null): PropModel {
  const { geometry, maps } = bakedGeometry(root);
  turnToNose(geometry);
  geometry.computeBoundingBox();
  let far: THREE.BufferGeometry | null = null;
  if (farRoot !== null) {
    far = bakedGeometry(farRoot).geometry;
    turnToNose(far);
    far.computeBoundingBox();
  }
  return { manifest, geometry, ...maps, size: geometry.boundingBox!.getSize(new THREE.Vector3()), triangles: (geometry.getIndex()?.count ?? 0) / 3, far };
}

/** Each crowd gets its own geometries (it adds its instance attributes to them). */
const sourceCopy = (source: CrowdLayerSource): CrowdLayerSource => ({ ...source, geometry: source.geometry.clone(), ...(source.hull ? { hull: source.hull.clone() } : {}) });

const splitKey = (key: string): [ModelKind, string] => {
  const slash = key.indexOf("/");
  return [key.slice(0, slash) as ModelKind, key.slice(slash + 1)];
};

/** Starts loading every M0b model for `quality` (once per app). */
export function loadCrowdModels(quality: Quality, options: { manifest?: string; only?: readonly string[] } = {}): CrowdModels {
  const enabled = quality !== "low";
  const layers = new Map<string, ModelLayer>();
  const props = new Map<string, PropModel>();
  const crowds = new Set<Crowd>();
  const propListeners = new Set<() => void>();
  const loaded: string[] = [];
  const missing: string[] = [];
  let disposed = false;
  const manifestUrls = options.manifest !== undefined ? [options.manifest] : [M0B_MANIFEST_URL, KIT3_MANIFEST_URL];
  const library = new ModelLibrary({ manifests: manifestUrls, retryMs: 600_000 });
  const extras = enabled ? extraFiles(manifestUrls) : Promise.resolve(new Map<string, ExtraFiles>());
  // The hull only pays where the body is heavier than the Medium mesh it is made of.
  const hulls = quality === "high" || quality === "ultra";
  const wanted = (key: string): boolean => options.only === undefined || options.only.includes(key);

  const fetchRoot = async (manifestKey: string): Promise<THREE.Object3D | null> => {
    const [kind, id] = splitKey(manifestKey);
    const entry = await library.entry(kind, id);
    const url = entry === null ? null : pickModelTier(entry, quality);
    if (url === null) return null;
    const gltf = await loadModel(url);
    return gltf.scene;
  };

  const crowdJobs = Object.values(MODEL_SPECS)
    .filter((spec) => wanted(spec.content))
    .map(async (spec) => {
      try {
        const root = enabled ? await fetchRoot(spec.manifest) : null;
        if (root === null) {
          if (enabled) {
            missing.push(spec.content);
            console.warn("models: " + spec.manifest + " is not in the m0b manifest; " + spec.content + " keeps its placeholder");
          }
          return;
        }
        const hullRoot = hulls ? await optionalScene((await extras).get(spec.manifest)?.hull) : null;
        if (disposed) return;
        const layer = buildModelLayer(spec, root, hullRoot);
        layers.set(spec.content, layer);
        loaded.push(spec.content);
        for (const crowd of crowds) crowd.defineLayer(layer.key, sourceCopy(layer.source));
      } catch (error) {
        missing.push(spec.content);
        console.warn("models: " + spec.manifest + " failed; " + spec.content + " keeps its placeholder", error);
      }
    });

  const propKeys = [...PROP_SPECS.map((prop) => prop.manifest), BRIDGE_MODEL.manifest].filter(wanted);
  const propJobs = propKeys.map(async (key) => {
    try {
      const root = enabled ? await fetchRoot(key) : null;
      if (root === null) {
        if (enabled) {
          missing.push(key);
          console.warn("models: " + key + " is not in the m0b manifest; its primitive stays");
        }
        return;
      }
      // The far LOD is optional: a manifest without it, or a failed load, draws the tier mesh at every distance.
      const farRoot = await optionalScene((await extras).get(key)?.far);
      if (disposed) return;
      props.set(key, buildProp(key, root, farRoot));
      loaded.push(key);
    } catch (error) {
      missing.push(key);
      console.warn("models: " + key + " failed; its primitive stays", error);
    }
  });

  const ready = Promise.all([...crowdJobs, ...propJobs]).then(() => {
    if (disposed) return;
    for (const listener of propListeners) listener();
  });

  return {
    enabled,
    ready,
    loaded,
    missing,
    layerKey(content: string): string | undefined {
      const spec = MODEL_SPECS[content];
      return enabled && spec !== undefined ? modelLayerKey(spec) : undefined;
    },
    layer(content: string): ModelLayer | null {
      return layers.get(content) ?? null;
    },
    attach(crowd: Crowd): () => void {
      crowds.add(crowd);
      for (const layer of layers.values()) crowd.defineLayer(layer.key, sourceCopy(layer.source));
      return () => crowds.delete(crowd);
    },
    prop(manifest: string): PropModel | null {
      return props.get(manifest) ?? null;
    },
    onProps(listener: () => void): () => void {
      propListeners.add(listener);
      return () => propListeners.delete(listener);
    },
    dispose(): void {
      disposed = true;
      crowds.clear();
      propListeners.clear();
      for (const layer of layers.values()) {
        layer.source.geometry.dispose();
        layer.source.hull?.dispose();
        layer.source.map?.dispose();
        layer.source.normalMap?.dispose();
        layer.source.roughnessMap?.dispose();
        layer.baked?.texture.dispose();
      }
      for (const prop of props.values()) {
        prop.geometry.dispose();
        prop.map?.dispose();
        prop.normalMap?.dispose();
        prop.roughnessMap?.dispose();
        prop.far?.dispose();
      }
      layers.clear();
      props.clear();
    },
  };
}
