import { loadAudioManifest, parseAudioManifest, type AudioManifest, type AudioManifestSource, type ManifestSound } from "./manifest";
import { audioUrl, DEFAULT_AUDIO_BASE } from "./util";
import { VariantPicker, type VariantOptions } from "./variants";

/** Existing game recipes only; the kit adds no synthesized sound recipes. */
export type MissingHook = (context: AudioContext, out: AudioNode, noise: AudioBuffer, now: number) => number | void;
export type FileBankOptions<S extends string> = VariantOptions<S> & {
  audioBase?: string;
  manifest?: AudioManifestSource;
  preload?: readonly NoInfer<S>[];
  legacy?: Partial<Readonly<Record<S, string>>>;
  decodeConcurrency?: number;
};
export type DurationMismatch = { id: string; variant: number; expectedMs: number; actualMs: number };
export type FileBankStats = { errors: readonly string[]; durationMismatches: readonly DurationMismatch[] };
export type FileSelection = { buffer: AudioBuffer; variant: number; url: string };

/** Lazy file bank with a shared bounded fetch/decode queue, including music and legacy files. */
export class FileBank<S extends string = string> {
  private readonly base: string;
  private manifest: AudioManifest;
  private manifestReady: Promise<void> | null = null;
  private priorities: Promise<void> | null = null;
  private prioritiesPending = false;
  private context: BaseAudioContext | null = null;
  private startup: Promise<void> | null = null;
  private readonly files = new Map<string, AudioBuffer>();
  private readonly loads = new Map<string, Promise<AudioBuffer | null>>();
  private readonly ids = new Map<S, Promise<void>>();
  private readonly ready = new Map<S, Map<number, AudioBuffer>>();
  private readonly picker: VariantPicker<S>;
  private readonly errors: string[] = [];
  private readonly mismatches: DurationMismatch[] = [];
  private readonly queue: (() => Promise<void>)[] = [];
  private active = 0;
  private readonly concurrency: number;

  constructor(private readonly options: FileBankOptions<S> = {}) {
    this.base = options.audioBase ?? DEFAULT_AUDIO_BASE;
    this.manifest = parseAudioManifest(typeof options.manifest === "string" || options.manifest === undefined ? {} : options.manifest);
    this.picker = new VariantPicker(options);
    const count = options.decodeConcurrency ?? 4;
    this.concurrency = Number.isFinite(count) ? Math.max(1, Math.floor(count)) : 4;
  }

  /** Fetches metadata once, then each priority id in order, then legacy table files. */
  unlock(context: BaseAudioContext, eagerFiles: readonly string[] = []): Promise<void> {
    if (this.startup !== null) return this.startup;
    this.context = context;
    if (typeof this.options.manifest === "string") {
      this.manifestReady = loadAudioManifest(audioUrl(this.options.manifest, this.base)).then(manifest => {
        this.manifest = manifest;
      });
    }
    this.prioritiesPending = this.manifestReady !== null || (this.options.preload?.length ?? 0) > 0;
    this.priorities = this.loadPriorities();
    this.startup = this.initialize(eagerFiles);
    return this.startup;
  }

  private async loadPriorities(): Promise<void> {
    if (this.manifestReady !== null) await this.manifestReady;
    for (const id of this.options.preload ?? []) await this.loadSound(id);
    this.prioritiesPending = false;
  }

  private async initialize(eagerFiles: readonly string[]): Promise<void> {
    if (this.prioritiesPending) await this.priorities;
    const legacy = (Object.keys(this.options.legacy ?? {}) as S[])
      .filter(id => this.manifest.sounds[id] === undefined).map(id => this.loadSound(id));
    await Promise.all([...legacy, ...eagerFiles.map(path => this.file(path))]);
  }

  entry(id: S): ManifestSound | undefined {
    const sound = this.manifest.sounds[id];
    if (sound !== undefined) return sound;
    const legacy = Object.hasOwn(this.options.legacy ?? {}, id) ? this.options.legacy?.[id] : undefined;
    return legacy === undefined ? undefined : { files: [legacy], loop: false };
  }

  url(id: S): string | undefined {
    const file = this.entry(id)?.files[0];
    return file === undefined ? undefined : audioUrl(file, this.base);
  }

  /** Starts all variants once; completion never triggers playback. */
  ensure(id: S): Promise<void> {
    if (this.context === null) return Promise.resolve();
    if (this.prioritiesPending) return this.priorities!.then(() => this.loadSound(id));
    return this.loadSound(id);
  }

  private loadSound(id: S): Promise<void> {
    const known = this.ids.get(id);
    if (known !== undefined) return known;
    const entry = this.entry(id);
    if (entry === undefined) return Promise.resolve();
    const list = new Map<number, AudioBuffer>();
    this.ready.set(id, list);
    const load = Promise.all(entry.files.map(async (file, variant) => {
      const buffer = await this.loadFile(file);
      if (buffer === null) return;
      list.set(variant, buffer);
      const expectedMs = entry.durationMs?.[variant];
      const actualMs = buffer.duration * 1000;
      if (expectedMs !== undefined && Math.abs(expectedMs - actualMs) > 20 + 1e-9) this.mismatches.push({ id, variant, expectedMs, actualMs });
    })).then(() => undefined);
    this.ids.set(id, load);
    return load;
  }

  has(id: S): boolean { return (this.ready.get(id)?.size ?? 0) > 0; }

  select(id: S, variant?: number): FileSelection | null {
    void this.ensure(id);
    if (this.entry(id)?.loop) return null;
    const list = this.ready.get(id);
    const index = this.picker.pick(id, [...(list?.keys() ?? [])].sort((a, b) => a - b), variant);
    if (index === undefined) return null;
    return { buffer: list!.get(index)!, variant: index, url: audioUrl(this.entry(id)!.files[index]!, this.base) };
  }

  /** Measured seconds take precedence over metadata, even when other variants are pending. */
  duration(id: S, variant = 0): number {
    return this.ready.get(id)?.get(variant)?.duration ?? ((this.entry(id)?.durationMs?.[variant] ?? 0) / 1000);
  }

  loopBuffer(id: S): AudioBuffer | null {
    void this.ensure(id);
    if (!this.entry(id)?.loop) return null;
    const list = this.ready.get(id);
    const first = [...(list?.keys() ?? [])].sort((a, b) => a - b)[0];
    return first === undefined ? null : list!.get(first)!;
  }

  async track(name: string): Promise<{ url: string; buffer: AudioBuffer } | null> {
    if (this.manifestReady !== null) await this.manifestReady;
    const entry = this.manifest.music[name];
    if (entry === undefined) return null;
    const buffer = await this.file(entry.file);
    return buffer === null ? null : { buffer, url: audioUrl(entry.file, this.base) };
  }

  cached(path: string): AudioBuffer | undefined { return this.files.get(audioUrl(path, this.base)); }

  /** All consumers share this queue and URL cache; failures stay silent and diagnostic. */
  file(path: string): Promise<AudioBuffer | null> {
    if (this.context === null) return Promise.resolve(null);
    if (this.prioritiesPending) return this.priorities!.then(() => this.loadFile(path));
    return this.loadFile(path);
  }

  private loadFile(path: string): Promise<AudioBuffer | null> {
    const context = this.context;
    if (context === null) return Promise.resolve(null);
    const url = audioUrl(path, this.base);
    const known = this.loads.get(url);
    if (known !== undefined) return known;
    const load = new Promise<AudioBuffer | null>(resolve => {
      this.queue.push(async () => {
        try {
          const response = await fetch(url);
          if (!response.ok) throw new Error("HTTP " + response.status);
          const buffer = await context.decodeAudioData(await response.arrayBuffer());
          this.files.set(url, buffer);
          resolve(buffer);
        } catch (error) { this.errors.push("file " + url + ": " + String(error)); resolve(null); }
      });
    });
    this.loads.set(url, load);
    this.pump();
    return load;
  }

  private pump(): void {
    while (this.active < this.concurrency && this.queue.length > 0) {
      this.active++;
      void this.queue.shift()!().finally(() => { this.active--; this.pump(); });
    }
  }

  stats(): FileBankStats {
    return { errors: [...this.manifest.errors, ...this.errors], durationMismatches: this.mismatches.map(item => ({ ...item })) };
  }
}

export type LayeredSelection = { kind: "file"; file: FileSelection } | { kind: "hook"; hook: MissingHook } | { kind: "silent" };
/** File-first selection: the game supplies any transitional hooks, never new kit recipes. */
export class LayeredBank<S extends string = string> {
  constructor(readonly files: FileBank<S>, readonly missing: Partial<Readonly<Record<S, MissingHook>>> = {}) {}
  select(id: S, variant?: number): LayeredSelection {
    const file = this.files.select(id, variant);
    if (file !== null) return { kind: "file", file };
    if (this.files.has(id) || this.files.entry(id)?.loop) return { kind: "silent" };
    const hook = Object.hasOwn(this.missing, id) ? this.missing[id] : undefined;
    return hook === undefined ? { kind: "silent" } : { kind: "hook", hook };
  }
}
