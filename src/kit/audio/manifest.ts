/** File metadata only: mix levels, buses and priorities belong to the game. */
export type ManifestSound = { readonly files: readonly string[]; readonly durationMs?: readonly number[]; readonly loop: boolean };
export type ManifestTrack = { readonly file: string; readonly bpm?: number; readonly bars?: number };
export type AudioManifest = {
  readonly sounds: Readonly<Record<string, ManifestSound>>;
  readonly music: Readonly<Record<string, ManifestTrack>>;
  readonly errors: readonly string[];
};
/** Authoring shapes; parsing still accepts unknown input to diagnose external JSON safely. */
export type AudioManifestV1 = {
  readonly version?: 1;
  readonly sounds?: Readonly<Record<string, readonly string[]>>;
  readonly music?: Readonly<Record<string, string>>;
};
export type AudioManifestV2 = {
  readonly version: 2;
  readonly sounds?: Readonly<Record<string, { readonly files: readonly string[]; readonly durationMs?: readonly number[]; readonly loop?: boolean }>>;
  readonly music?: Readonly<Record<string, ManifestTrack>>;
};
export type AudioManifestSource = string | AudioManifestV1 | AudioManifestV2 | AudioManifest;

const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const path = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const positive = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value > 0;
const empty = (error: string): AudioManifest => ({ sounds: {}, music: {}, errors: [error] });

/** Accepts Dragonhold v1 and file metadata v2, skipping each invalid entry separately. */
export function parseAudioManifest(json: unknown): AudioManifest {
  if (!record(json)) return empty("manifest: expected an object");
  if (json.version !== undefined && json.version !== 1 && json.version !== 2) return empty("manifest: unsupported version " + String(json.version));
  const sounds: Record<string, ManifestSound> = Object.create(null);
  const music: Record<string, ManifestTrack> = Object.create(null);
  const errors: string[] = [];
  for (const section of ["sounds", "music"] as const) {
    const entries = json[section];
    if (entries === undefined) continue;
    if (!record(entries)) { errors.push(section + ": expected an object"); continue; }
    for (const [id, value] of Object.entries(entries)) {
      const fail = (message: string) => errors.push(section + "." + id + ": " + message);
      if (section === "sounds") {
        const spec = Array.isArray(value) ? { files: value } : value;
        if (!record(spec) || !Array.isArray(spec.files) || spec.files.length === 0 || !spec.files.every(path)) {
          fail("files must be a non-empty array of non-empty paths"); continue;
        }
        const durations = spec.durationMs;
        if (durations !== undefined && (!Array.isArray(durations) || durations.length !== spec.files.length || !durations.every(positive))) {
          fail("durationMs must match files and contain positive finite durations"); continue;
        }
        if (spec.loop !== undefined && typeof spec.loop !== "boolean") { fail("loop must be boolean"); continue; }
        sounds[id] = { files: [...spec.files], loop: spec.loop === true, ...(durations === undefined ? {} : { durationMs: [...durations as number[]] }) };
      } else {
        const spec = typeof value === "string" ? { file: value } : value;
        if (!record(spec) || !path(spec.file)) { fail("file must be a non-empty path"); continue; }
        if ((spec.bpm !== undefined && !positive(spec.bpm)) || (spec.bars !== undefined && (!positive(spec.bars) || !Number.isInteger(spec.bars)))) {
          fail("bpm must be positive; bars must be a positive integer"); continue;
        }
        music[id] = { file: spec.file, ...(spec.bpm === undefined ? {} : { bpm: spec.bpm as number }), ...(spec.bars === undefined ? {} : { bars: spec.bars as number }) };
      }
    }
  }
  return { sounds, music, errors };
}

/** A missing or malformed manifest is an empty bank with diagnostic errors, never a rejection. */
export async function loadAudioManifest(url: string): Promise<AudioManifest> {
  try {
    const response = await fetch(url);
    if (!response.ok) return empty("manifest " + url + ": HTTP " + response.status);
    return parseAudioManifest(await response.json());
  } catch (error) {
    return empty("manifest " + url + ": " + String(error));
  }
}
