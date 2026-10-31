// Source: games/space-typing/src/render3d/model-loader.ts (kit copy: manifest URLs are a parameter, several manifests, URLs resolved; log fixes in shared/game-kit/DRIFT.md)
import { MODEL_TIERS, isModelKind, modelKey, type ModelManifest, type ModelManifestEntry, type ModelTier } from "./model-contracts";

/**
 * Finds and loads models listed in model manifests (a game's own, then any
 * fallback, in the order given). The manifests say which models exist, so a
 * game never probes for missing files: a model no manifest lists keeps its
 * placeholder.
 *
 * Tier per quality: Low never loads 3D; Medium loads the ".medium" file
 * (smaller textures); High the ".high" one; Ultra the ".ultra" one when the
 * manifest lists it (the whole original with every map, MODEL_QUALITY §2b),
 * else ".high". A missing tier falls back to the lighter one first.
 */
type GLTF = import("three/examples/jsm/loaders/GLTFLoader.js").GLTF;
type GLTFLoader = import("three/examples/jsm/loaders/GLTFLoader.js").GLTFLoader;

export type VisualQuality = "low" | "medium" | "high" | "ultra";

/** Space's shared models (the dev sandbox's placeholder alias; a game ships its own manifest). */
export const SPACE_MODEL_MANIFEST_URL = "/assets/space-typing/models/manifest.json";

const SCHEME = /^[a-z][a-z0-9+.-]*:/i;
const BASE = "http://kit.invalid";

/**
 * A model URL as written in the manifest at `manifestUrl`: kept when it has a
 * scheme or starts with "/", else resolved against the manifest's folder.
 * Query and hash (the "?v=" cache key) are kept.
 */
export function resolveModelUrl(url: string, manifestUrl: string): string {
  if (SCHEME.test(url) || url.startsWith("/")) return url;
  const absolute = SCHEME.test(manifestUrl);
  const resolved = new URL(url, new URL(manifestUrl, BASE));
  return absolute ? resolved.href : resolved.pathname + resolved.search + resolved.hash;
}

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []);

function parseEntry(raw: unknown, manifestUrl: string, extraKinds: readonly string[] = []): ModelManifestEntry | null {
  if (!isRecord(raw) || typeof raw.kind !== "string" || (!isModelKind(raw.kind) && !extraKinds.includes(raw.kind)) || typeof raw.id !== "string" || raw.id.length === 0 || !isRecord(raw.tiers)) return null;
  const tiers: Partial<Record<ModelTier, { url: string; bytes: number }>> = {};
  for (const name of MODEL_TIERS) {
    const file = raw.tiers[name];
    if (!isRecord(file) || typeof file.url !== "string" || file.url.length === 0) continue;
    tiers[name] = { url: resolveModelUrl(file.url, manifestUrl), bytes: typeof file.bytes === "number" && Number.isFinite(file.bytes) ? file.bytes : 0 };
  }
  if (Object.keys(tiers).length === 0) return null;
  const size: [number, number, number] =
    Array.isArray(raw.size) && raw.size.length === 3 && raw.size.every((n) => typeof n === "number" && Number.isFinite(n)) ? [raw.size[0], raw.size[1], raw.size[2]] : [1, 1, 1];
  return {
    kind: raw.kind,
    id: raw.id,
    tiers,
    triangles: typeof raw.triangles === "number" && Number.isFinite(raw.triangles) ? raw.triangles : 0,
    sockets: strings(raw.sockets),
    clips: strings(raw.clips),
    size,
  };
}

/**
 * A manifest's JSON fetched from `manifestUrl`: null unless it is version 1
 * with a models object. Kinds include Space's and any extraKinds.
 * Entries of an unknown kind, or with no usable tier,
 * are dropped (counted in `dropped`); an entry is filed under its own
 * kind/id, whatever key it had.
 */
export function parseModelManifest(json: unknown, manifestUrl: string, extraKinds: readonly string[] = []): (ModelManifest & { dropped: number }) | null {
  if (!isRecord(json) || json.version !== 1 || !isRecord(json.models)) return null;
  const models: Record<string, ModelManifestEntry> = {};
  let dropped = 0;
  for (const raw of Object.values(json.models)) {
    const entry = parseEntry(raw, manifestUrl, extraKinds);
    if (entry === null) dropped += 1;
    else models[modelKey(entry.kind, entry.id)] = entry;
  }
  return { version: 1, generatedAt: typeof json.generatedAt === "string" ? json.generatedAt : "", models, dropped };
}

/** Tiers tried per quality, in order: the quality's own, then lighter, then heavier. */
const TIER_ORDER: Readonly<Record<Exclude<VisualQuality, "low">, readonly ModelTier[]>> = {
  medium: ["medium", "high", "ultra"],
  high: ["high", "medium", "ultra"],
  ultra: ["ultra", "high", "medium"],
};

export function pickModelTier(entry: ModelManifestEntry, quality: VisualQuality): string | null {
  if (quality === "low") return null;
  for (const tier of TIER_ORDER[quality]) {
    const file = entry.tiers[tier];
    if (file !== undefined) return file.url;
  }
  return null;
}

/** What the library needs of fetch (a test passes a fake). */
export type ManifestFetch = (url: string, init?: { cache?: RequestCache }) => Promise<{ ok: boolean; headers: { get(name: string): string | null }; json(): Promise<unknown> }>;

export type ModelLibraryOptions = {
  /** Manifest URLs, first wins when two list the same model. */
  manifests: string | readonly string[];
  /** Additional kinds beyond Space's MODEL_KINDS. */
  kinds?: readonly string[];
  fetcher?: ManifestFetch;
  /** A manifest that failed is asked again after this long (ms). */
  retryMs?: number;
  /** Clock for the retry (ms). */
  now?: () => number;
};

/** One game's view of its model manifests. */
export class ModelLibrary {
  readonly urls: readonly string[];
  private readonly extraKinds: readonly string[];
  private readonly fetcher: ManifestFetch;
  private readonly retryMs: number;
  private readonly now: () => number;
  private readonly cache = new Map<string, { promise: Promise<ModelManifest | null>; retryAt: number }>();

  constructor(options: ModelLibraryOptions) {
    this.urls = typeof options.manifests === "string" ? [options.manifests] : [...options.manifests];
    if (this.urls.length === 0) throw new Error("models: no manifest URL");
    this.extraKinds = [...(options.kinds ?? [])];
    for (const kind of this.extraKinds) {
      // Compare the full match: $ also accepts a trailing newline.
      if (kind.match(/^[a-z][a-z0-9-]*$/)?.[0] !== kind) throw new Error('models: invalid kind "' + kind + '"');
    }
    this.fetcher = options.fetcher ?? ((url, init) => fetch(url, init));
    this.retryMs = options.retryMs ?? 30_000;
    this.now = options.now ?? (() => Date.now());
  }

  /** The manifest at `url` (fetched once; a failure is null, and is asked again after retryMs). */
  manifest(url: string): Promise<ModelManifest | null> {
    const cached = this.cache.get(url);
    if (cached !== undefined && (cached.retryAt === 0 || this.now() < cached.retryAt)) return cached.promise;
    const slot = { promise: Promise.resolve<ModelManifest | null>(null), retryAt: 0 };
    slot.promise = (async () => {
      let result: ModelManifest | null = null;
      try {
        const response = await this.fetcher(url, { cache: "no-cache" });
        if (!response.ok || !(response.headers.get("content-type") ?? "").includes("json")) return null;
        result = parseModelManifest(await response.json(), url, this.extraKinds);
        return result;
      } catch {
        return null;
      } finally {
        slot.retryAt = result === null ? this.now() + this.retryMs : 0;
      }
    })();
    this.cache.set(url, slot);
    return slot.promise;
  }

  /** Every manifest, in order. */
  manifests(): Promise<(ModelManifest | null)[]> {
    return Promise.all(this.urls.map((url) => this.manifest(url)));
  }

  /** The first manifest's entry for kind/id, or null. */
  async entry(kind: string, id: string): Promise<ModelManifestEntry | null> {
    const key = modelKey(kind, id);
    for (const manifest of await this.manifests()) {
      const entry = manifest?.models[key];
      if (entry !== undefined) return entry;
    }
    return null;
  }

  async url(kind: string, id: string, quality: VisualQuality): Promise<string | null> {
    const entry = await this.entry(kind, id);
    return entry === null ? null : pickModelTier(entry, quality);
  }

  /** Forgets every manifest (tests, a media sync while running). */
  reset(): void {
    this.cache.clear();
  }
}

let loaderPromise: Promise<GLTFLoader> | null = null;

/** What KTX2Loader.detectSupport reads of a renderer (a WebGLRenderer; a test passes a fake). */
export type Ktx2Renderer = Parameters<import("three/examples/jsm/loaders/KTX2Loader.js").KTX2Loader["detectSupport"]>[0];

/** KTX2 (Basis Universal, KHR_texture_basisu) textures: set by enableKtx2, attached before any load that follows. */
let ktx2: { transcoderPath: string; renderer: Ktx2Renderer; ready: Promise<void> | null } | null = null;

async function gltfLoader(): Promise<GLTFLoader> {
  loaderPromise ??= Promise.all([
    import("three/examples/jsm/loaders/GLTFLoader.js"),
    import("three/examples/jsm/libs/meshopt_decoder.module.js"),
  ]).then(([loader, meshopt]) => {
    const instance = new loader.GLTFLoader();
    instance.setMeshoptDecoder(meshopt.MeshoptDecoder);
    return instance;
  });
  const instance = await loaderPromise;
  if (ktx2 !== null) {
    const config = ktx2;
    config.ready ??= import("three/examples/jsm/loaders/KTX2Loader.js").then(({ KTX2Loader }) => {
      instance.setKTX2Loader(new KTX2Loader().setTranscoderPath(config.transcoderPath).detectSupport(config.renderer));
    });
    await config.ready;
  }
  return instance;
}

/**
 * Lets loadModel read KTX2 textures (MODEL_QUALITY §3 step 3: GPU-compressed maps, transcoded to the formats
 * `renderer` supports). `transcoderPath` is the folder serving three's basis_transcoder.js and .wasm
 * (three/examples/jsm/libs/basis/). Call once, before the first model that has KTX2 maps loads.
 */
export function enableKtx2(transcoderPath: string, renderer: Ktx2Renderer): void {
  if (transcoderPath.length === 0) throw new Error("models: enableKtx2 needs the transcoder's folder");
  if (ktx2 !== null) return;
  ktx2 = { transcoderPath: transcoderPath.endsWith("/") ? transcoderPath : transcoderPath + "/", renderer, ready: null };
}

/** Whether enableKtx2 was called (tests, diagnostics). */
export function ktx2Enabled(): boolean {
  return ktx2 !== null;
}

/** Loads a GLB (meshopt, quantized, WebP and, after enableKtx2, KTX2 textures). */
export async function loadModel(url: string): Promise<GLTF> {
  const loader = await gltfLoader();
  return loader.loadAsync(url);
}
