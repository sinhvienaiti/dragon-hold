/** Runtime-only texture manifests. Loading is opt-in; no renderer side effects. */
export type GroundKind = "ground" | "decals";

export interface GroundTexture {
  readonly name: string;
  readonly kit: string;
  readonly width: number;
  readonly height: number;
  readonly url: string;
  readonly md5: string;
  readonly bytes: number;
}

export interface GroundManifest {
  readonly version: 1;
  readonly kind: GroundKind;
  readonly textures: Readonly<Record<string, GroundTexture>>;
}

export const GROUND_MANIFEST_URLS: Readonly<Record<GroundKind, string>> = {
  ground: "/assets/dragon-hold/ground/manifest.json",
  decals: "/assets/dragon-hold/decals/manifest.json",
};

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const positiveInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0;
const namePattern = /^[a-z0-9][a-z0-9-]*$/;

/** Validates JSON without trusting source paths or arbitrary texture URLs. */
export function parseGroundManifest(value: unknown, kind: GroundKind): GroundManifest {
  if (!record(value) || value.version !== 1 || value.kind !== kind || !record(value.textures)) {
    throw new Error("Invalid " + kind + " manifest");
  }
  const textures: Record<string, GroundTexture> = {};
  for (const [key, entry] of Object.entries(value.textures)) {
    if (!record(entry) || typeof entry.name !== "string" || !namePattern.test(entry.name)
      || typeof entry.kit !== "string" || !namePattern.test(entry.kit)
      || key !== entry.kit + "/" + entry.name
      || !positiveInteger(entry.width) || !positiveInteger(entry.height)
      || entry.width > 16383 || entry.height > 16383 || !positiveInteger(entry.bytes)
      || typeof entry.md5 !== "string" || !/^[0-9a-f]{32}$/.test(entry.md5)
      || entry.url !== "/assets/dragon-hold/" + kind + "/" + key + ".webp?v=" + entry.md5) {
      throw new Error("Invalid " + kind + " texture: " + key);
    }
    textures[key] = {
      name: entry.name, kit: entry.kit, width: entry.width, height: entry.height,
      url: entry.url, md5: entry.md5, bytes: entry.bytes,
    };
  }
  return { version: 1, kind, textures };
}

/** Reads the production manifest; callers decide how to handle missing media. */
export async function loadGroundManifest(kind: GroundKind = "ground", fetcher: typeof fetch = fetch): Promise<GroundManifest> {
  const response = await fetcher(GROUND_MANIFEST_URLS[kind]);
  if (!response.ok) throw new Error("Cannot load " + kind + " manifest: HTTP " + response.status);
  return parseGroundManifest(await response.json(), kind);
}
