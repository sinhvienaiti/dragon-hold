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
 * Medium the .medium files, High and Ultra the .high ones. A missing or
 * failed model keeps its primitive and logs one warning. Loaded once per
 * app; every crowd attached gets the layers now and as they arrive.
 * Owner: view (M0b models lane).
 */
import * as THREE from "three";
import { ModelLibrary, loadModel, pickModelTier, type ModelKind } from "../kit/three";
import type { Quality } from "../app/contracts";
import type { Crowd, CrowdLayerSource } from "./crowd";
import { bakeRig, rigOf, skinWeights, smoothNormals, type BakedRig, type Rig } from "./crowd-rig";
import { BRIDGE_MODEL, M0B_MANIFEST_URL, MODEL_SPECS, PROP_SPECS, modelLayerKey, type ModelSpec } from "./model-specs";

export interface ModelLayer {
  readonly spec: ModelSpec;
  readonly key: string;
  /** Template: each crowd gets a clone of the geometry (the crowd adds its instance attributes to it). */
  readonly source: CrowdLayerSource;
  readonly rig: Rig | null;
  readonly baked: BakedRig | null;
  readonly triangles: number;
}

/** A static prop, metres as processed (Blender sized it), nose +z, feet at y = 0. */
export interface PropModel {
  readonly manifest: string;
  readonly geometry: THREE.BufferGeometry;
  readonly map: THREE.Texture | null;
  readonly size: THREE.Vector3;
  readonly triangles: number;
}

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

/** A geometry with float position, normal and uv in world (scene) units, from one loaded GLB scene. */
function bakedGeometry(root: THREE.Object3D): { geometry: THREE.BufferGeometry; map: THREE.Texture | null } {
  root.updateMatrixWorld(true);
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  let map: THREE.Texture | null = null;
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
    const material = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.MeshStandardMaterial | undefined;
    map ??= material?.map ?? null;
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return { geometry, map };
}

/** Turns the kit's front (−z) to the crowd's nose (+z). */
function turnToNose(geometry: THREE.BufferGeometry): void {
  geometry.rotateY(Math.PI);
}

/** A crowd layer template from a loaded model: normalised to height 1, rigged and baked when the spec has a rig. */
export function buildModelLayer(spec: ModelSpec, root: THREE.Object3D): ModelLayer {
  const { geometry, map } = bakedGeometry(root);
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
  if (map !== null) map.colorSpace = THREE.SRGBColorSpace;
  const source: CrowdLayerSource = {
    geometry,
    sizeM: [size.x, size.y, size.z],
    animation: baked === null ? { kind: "procedural" } : { kind: "bones", boneTexture: baked.texture, bones: baked.bones, clips: baked.clips },
    roughness: 0.9,
    map,
    fit: spec.fit,
    model: true,
    hullNormals: true,
  };
  return { spec, key: modelLayerKey(spec), source, rig, baked, triangles: (geometry.getIndex()?.count ?? 0) / 3 };
}

/** A prop from a loaded model: turned nose +z, metres kept. */
export function buildProp(manifest: string, root: THREE.Object3D): PropModel {
  const { geometry, map } = bakedGeometry(root);
  turnToNose(geometry);
  geometry.computeBoundingBox();
  if (map !== null) map.colorSpace = THREE.SRGBColorSpace;
  return { manifest, geometry, map, size: geometry.boundingBox!.getSize(new THREE.Vector3()), triangles: (geometry.getIndex()?.count ?? 0) / 3 };
}

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
  const library = new ModelLibrary({ manifests: options.manifest ?? M0B_MANIFEST_URL, retryMs: 600_000 });
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
        if (disposed) return;
        const layer = buildModelLayer(spec, root);
        layers.set(spec.content, layer);
        loaded.push(spec.content);
        for (const crowd of crowds) crowd.defineLayer(layer.key, { ...layer.source, geometry: layer.source.geometry.clone() });
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
      if (disposed) return;
      props.set(key, buildProp(key, root));
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
      for (const layer of layers.values()) crowd.defineLayer(layer.key, { ...layer.source, geometry: layer.source.geometry.clone() });
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
        layer.source.map?.dispose();
        layer.baked?.texture.dispose();
      }
      for (const prop of props.values()) {
        prop.geometry.dispose();
        prop.map?.dispose();
      }
      layers.clear();
      props.clear();
    },
  };
}
