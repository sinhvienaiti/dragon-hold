/**
 * Sound banks: where a sound id's audio comes from. M0a plays every id from
 * SynthBank (synth.ts recipes, beds.ts loops). FileBank plays the owner's
 * files listed in /assets/dragon-hold/audio/manifest.json (public/assets is
 * gitignored; media never in Git); LayeredBank asks the files first and falls
 * back to the synth for anything missing, so files replace sounds one by one.
 * Manifest: { "sounds": { "<id>": ["sfx/…/a.ogg", "sfx/…/b.ogg"] },
 *             "music": { "forest": "music/forest/forest.ogg", … } }.
 * Owner: audio (LANES.md).
 */
import { audioUrl, noiseBuffer } from "../kit/audio";
import { AUDIO_BASE, SOUNDS, SOUND_IDS, type SoundId } from "./catalog";
import { bedBuffer, isBed } from "./beds";
import type { MusicLayer } from "./music-plan";
import { SYNTH_RECIPES, SynthTools, type SoundParams } from "./synth";

export interface SoundBank {
  readonly name: string;
  /** The bank can play `id` now. */
  has(id: SoundId): boolean;
  /** Plays `id` into `out` from `when`; returns how long it lasts in seconds (0: it did not play). */
  play(ctx: BaseAudioContext, id: SoundId, out: AudioNode, when: number, params: SoundParams): number;
  /** The buffer of a looping bed (ambience, crowd), or null. */
  loop(ctx: BaseAudioContext, id: SoundId): AudioBuffer | null;
  /** A music layer recorded as a file, or null (the synth plays it). */
  music(layer: MusicLayer): AudioBuffer | null;
}

/** Every catalog sound made in code. */
export class SynthBank implements SoundBank {
  readonly name = "synth";
  private readonly noise = new WeakMap<BaseAudioContext, AudioBuffer>();

  constructor(private readonly random: () => number = Math.random) {}

  has(id: SoundId): boolean {
    return SYNTH_RECIPES[id] !== undefined || isBed(id);
  }

  noiseFor(ctx: BaseAudioContext): AudioBuffer {
    let buffer = this.noise.get(ctx);
    if (!buffer) {
      buffer = noiseBuffer(ctx);
      this.noise.set(ctx, buffer);
    }
    return buffer;
  }

  play(ctx: BaseAudioContext, id: SoundId, out: AudioNode, when: number, params: SoundParams): number {
    const recipe = SYNTH_RECIPES[id];
    if (!recipe) return 0;
    recipe(new SynthTools(ctx, out, this.noiseFor(ctx), when, params.rate, this.random), params);
    return SOUNDS[id].lengthMs / 1000;
  }

  loop(ctx: BaseAudioContext, id: SoundId): AudioBuffer | null {
    return isBed(id) ? bedBuffer(ctx, id) : null;
  }

  music(): AudioBuffer | null {
    return null;
  }
}

export interface AudioManifest {
  readonly sounds?: Partial<Record<SoundId, readonly string[]>>;
  readonly music?: Partial<Record<MusicLayer, string>>;
}

/** The owner's files; nothing is fetched until `load` (no 404s while there are none). */
export class FileBank implements SoundBank {
  readonly name = "files";
  private readonly buffers = new Map<SoundId, AudioBuffer[]>();
  private readonly layers = new Map<MusicLayer, AudioBuffer>();
  private readonly turn = new Map<SoundId, number>();

  constructor(
    readonly base = AUDIO_BASE,
    readonly manifestUrl = base + "manifest.json",
  ) {}

  /** Fetches the manifest and decodes what it lists; resolves with the number of sounds ready. */
  async load(ctx: BaseAudioContext): Promise<number> {
    let manifest: AudioManifest;
    try {
      const response = await fetch(this.manifestUrl);
      if (!response.ok) return 0;
      manifest = (await response.json()) as AudioManifest;
    } catch {
      return 0;
    }
    const decode = async (path: string): Promise<AudioBuffer | null> => {
      try {
        const response = await fetch(audioUrl(path, this.base));
        if (!response.ok) return null;
        return await ctx.decodeAudioData(await response.arrayBuffer());
      } catch {
        return null;
      }
    };
    const known = new Set<string>(SOUND_IDS);
    const jobs: Promise<void>[] = [];
    for (const [id, paths] of Object.entries(manifest.sounds ?? {}) as [SoundId, readonly string[]][]) {
      if (!known.has(id) || !Array.isArray(paths)) continue;
      jobs.push(
        Promise.all(paths.map(decode)).then((list) => {
          const ready = list.filter((buffer): buffer is AudioBuffer => buffer !== null);
          if (ready.length > 0) this.buffers.set(id, ready);
        }),
      );
    }
    for (const [layer, path] of Object.entries(manifest.music ?? {}) as [MusicLayer, string][]) {
      if (typeof path !== "string") continue;
      jobs.push(decode(path).then((buffer) => void (buffer && this.layers.set(layer, buffer))));
    }
    await Promise.all(jobs);
    return this.buffers.size;
  }

  has(id: SoundId): boolean {
    return this.buffers.has(id);
  }

  play(ctx: BaseAudioContext, id: SoundId, out: AudioNode, when: number, params: SoundParams): number {
    const list = this.buffers.get(id);
    if (!list || SOUNDS[id].loop) return 0;
    // Variants in turn (05 §7: 3–6 variants), or the one the cue names.
    const index = params.variant > 0 ? params.variant % list.length : (this.turn.get(id) ?? 0) % list.length;
    this.turn.set(id, index + 1);
    const buffer = list[index]!;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = params.rate;
    source.connect(out);
    source.start(when);
    return buffer.duration / params.rate;
  }

  loop(_ctx: BaseAudioContext, id: SoundId): AudioBuffer | null {
    return SOUNDS[id].loop ? (this.buffers.get(id)?.[0] ?? null) : null;
  }

  music(layer: MusicLayer): AudioBuffer | null {
    return this.layers.get(layer) ?? null;
  }
}

/** Files first, synth for whatever is missing. */
export class LayeredBank implements SoundBank {
  readonly name = "layered";
  constructor(
    readonly files: SoundBank,
    readonly fallback: SoundBank,
  ) {}

  has(id: SoundId): boolean {
    return this.files.has(id) || this.fallback.has(id);
  }

  play(ctx: BaseAudioContext, id: SoundId, out: AudioNode, when: number, params: SoundParams): number {
    return this.files.has(id) ? this.files.play(ctx, id, out, when, params) : this.fallback.play(ctx, id, out, when, params);
  }

  loop(ctx: BaseAudioContext, id: SoundId): AudioBuffer | null {
    return this.files.loop(ctx, id) ?? this.fallback.loop(ctx, id);
  }

  music(layer: MusicLayer): AudioBuffer | null {
    return this.files.music(layer) ?? this.fallback.music(layer);
  }
}
