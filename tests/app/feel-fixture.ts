// Source: Last Line (games/typing-survival, branch ts-typefx, 07895db) tests/feel-fixture.ts, unchanged but for this line.
/**
 * A sample Typing Feel host for the tests (parent docs/games/TYPING_FEEL_SERVICE.md
 * §4.2–4.4): a `typing-feel/catalogue-3` catalogue and `typing-feel/set-1`
 * set manifests made here, with made-up sample bytes. The game holds no copy
 * of the real catalogue or its sets any more, so these tests run on a clone
 * without the parent repo and never touch the network.
 */
export const FEEL_BASE = "https://feel.test/v1/keys/";

export type SampleSet = { readonly id: string; readonly name: string; readonly family: string; readonly keys: number; readonly spaces: number; readonly score: number | null };

/**
 * Seven sets in four families, in catalogue order. The catalogue's default
 * (Bright Clack) is not the first set, and two owner picks carry no score, as
 * in the real `r1` catalogue.
 */
export const SAMPLE_SETS: readonly SampleSet[] = [
  { id: "deep", name: "Deep Velvet", family: "Deep", keys: 20, spaces: 8, score: 6.37 },
  { id: "deep-amber", name: "Deep Amber", family: "Deep", keys: 18, spaces: 8, score: 6.21 },
  { id: "solid", name: "Solid Velvet", family: "Solid", keys: 22, spaces: 8, score: 6.1 },
  { id: "hail-stone", name: "Hail Stone", family: "Solid", keys: 25, spaces: 8, score: null },
  { id: "raindrop-tile", name: "Raindrop Tile", family: "Crisp", keys: 17, spaces: 8, score: null },
  { id: "bright-clack", name: "Bright Clack Velvet", family: "Bright Clack", keys: 30, spaces: 8, score: 6.52 },
  { id: "bright-clack-amber", name: "Bright Clack Amber", family: "Bright Clack", keys: 24, spaces: 8, score: 6.44 },
];
export const SAMPLE_IDS: readonly string[] = SAMPLE_SETS.map((set) => set.id);
/** One heading per family run, in catalogue order. */
export const SAMPLE_FAMILIES: readonly string[] = ["Deep", "Solid", "Crisp", "Bright Clack"];

/** `sets/<id>/<fp12>/` (the fingerprint is made up, 12 hex digits). */
export const setPath = (id: string): string => "sets/" + id + "/" + (SAMPLE_IDS.indexOf(id) + 1).toString(16).padStart(12, "f") + "/";
/** A set's folder on the sample host. */
export const setDir = (id: string): string => FEEL_BASE + setPath(id);

const numbered = (dir: string, set: "key" | "space", n: number): string[] => Array.from({ length: n }, (_, i) => dir + set + "-" + String(i + 1).padStart(2, "0") + ".ogg");

/** A sample set's file URLs by sound set, in number order. */
export function sampleFiles(id: string): { key: string[]; space: string[] } {
  const set = SAMPLE_SETS.find((s) => s.id === id)!;
  return { key: numbered(setDir(id), "key", set.keys), space: numbered(setDir(id), "space", set.spaces) };
}

/** The sample catalogue; `default: null` leaves the field out. The profiles are listed backwards: the kit sorts them by `order`. */
export function catalogue(options: { readonly default?: string | null; readonly sets?: readonly SampleSet[] } = {}): Record<string, unknown> {
  const sets = options.sets ?? SAMPLE_SETS;
  const families = [...new Set(sets.map((set) => set.family))];
  const fallback = options.default === undefined ? "bright-clack" : options.default;
  return {
    schema: "typing-feel/catalogue-3",
    contract: 1,
    revision: "r-test",
    publishedAt: "2026-10-31T00:00:00Z",
    ...(fallback === null ? {} : { default: fallback }),
    effects: { style: "stamp", intensity: "normal", size: "large", volume: 1 },
    families: families.map((name, order) => ({ id: name.toLowerCase().replace(/ /g, "-"), name, order })),
    profiles: sets
      .map((set, order) => ({
        id: set.id, name: set.name, family: set.family, familyId: set.family.toLowerCase().replace(/ /g, "-"), order, score: set.score, ownerPick: set.score === null,
        status: "published", keys: set.keys, spaces: set.spaces, manifest: setPath(set.id) + "keys-manifest.json", preview: setPath(set.id) + "preview.ogg",
      }))
      .reverse(),
  };
}

/** A sample set's game manifest (`typing-feel/set-1`). */
export function setManifest(id: string): Record<string, unknown> {
  const set = SAMPLE_SETS.find((s) => s.id === id)!;
  const files = (kind: "key" | "space", n: number) => Array.from({ length: n }, (_, i) => ({ file: kind + "-" + String(i + 1).padStart(2, "0") + ".ogg", set: kind, durationMs: kind === "key" ? 300 : 450 }));
  return {
    schema: "typing-feel/set-1", id: set.id, name: set.name,
    licence: "Test fixture (no audio)", recipe: "natural-v1",
    files: [...files("key", set.keys), ...files("space", set.spaces)],
    preview: "preview.ogg",
  };
}

export type Reply = { readonly status: number; readonly type?: string; readonly text?: string; readonly bytes?: boolean };

/** What the sample host answers for `url`: the catalogue, a set manifest, a sample (made-up bytes), or 404 (no SPA fallback). */
export function serve(url: string, root: Record<string, unknown> = catalogue()): Reply {
  if (!url.startsWith(FEEL_BASE)) return { status: 404 };
  const path = url.slice(FEEL_BASE.length);
  if (path === "keys-manifest.json") return { status: 200, type: "application/json", text: JSON.stringify(root) };
  const match = /^sets\/([a-z0-9-]+)\/[0-9a-f]{12}\/(keys-manifest\.json|preview\.ogg|(?:key|space)-\d{2}\.ogg)$/.exec(path);
  if (match === null || !SAMPLE_IDS.includes(match[1]!) || setPath(match[1]!) !== "sets/" + match[1] + "/" + path.split("/")[2] + "/") return { status: 404 };
  if (match[2] === "keys-manifest.json") return { status: 200, type: "application/json", text: JSON.stringify(setManifest(match[1]!)) };
  const file = match[2]!;
  const set = SAMPLE_SETS.find((s) => s.id === match[1])!;
  const n = Number(file.slice(file.indexOf("-") + 1, file.indexOf(".")));
  if (file !== "preview.ogg" && n > (file.startsWith("key") ? set.keys : set.spaces)) return { status: 404 };
  return { status: 200, type: "audio/ogg", bytes: true };
}
