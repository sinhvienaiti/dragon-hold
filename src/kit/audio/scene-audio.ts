// Source: games/space-typing/src/scene3d/sfx.ts (SceneAudio; kit copy: game sound table, one gain node per bus; log fixes in shared/game-kit/DRIFT.md)
import {
  DRAGON_SAMPLES,
  noiseBuffer,
  recordedVoice,
  synthVoice,
  voiceBus,
  type DragonSample,
  type SceneVoice,
} from "./dragon-voice";
import { FileBank, LayeredBank, type FileBankStats, type MissingHook } from "./file-bank";
import type { AudioManifestSource } from "./manifest";
import type { VariantOptions } from "./variants";
import { BusMix, DEFAULT_BUSES, type AudioGroup, type BusTable } from "./mix";
import { DEFAULT_AUDIO_BASE, audioUrl, clamp, rand } from "./util";

/** One sound of a game's table: a file (under the audio base, or a full URL) and its bus. */
export type SoundSpec<B extends string> = string | { url?: string; bus?: B; gain?: number; gap?: number };
export type SoundTable<S extends string, B extends string> = Readonly<Record<S, SoundSpec<B>>>;

export type PlayOptions<B extends string> = { rate?: number; pan?: number; gap?: number; bus?: B; variant?: number };

export type SceneAudioOptions<S extends string, B extends string> = VariantOptions<S> & {
  /** The game's sounds by name. */
  sounds: SoundTable<S, B>;
  /** Mix buses; Space's five groups by default. */
  buses?: BusTable<B>;
  /** Bus for sounds that name none (default: "combat" when present, else the first bus). */
  defaultBus?: NoInfer<B>;
  /** Bus the dragon voices go through (default: defaultBus). */
  voiceBus?: NoInfer<B>;
  /** Defaults to "/assets/audio/". */
  audioBase?: string;
  /** Dragon recordings to load for `voice` (false: synthesized only). Paths are under the audio base. */
  dragonSamples?: Partial<Record<DragonSample, (typeof DRAGON_SAMPLES)[DragonSample]>> | false;
  /** Manifest URL under audioBase, or v1/v2 metadata already in memory. Omitted: no manifest request. */
  manifest?: AudioManifestSource;
  /** Priority sound ids, decoded in this order before legacy table files. */
  preload?: readonly NoInfer<S>[];
  decodeConcurrency?: number;
  /** Existing game recipes, removed per id once real files are accepted. */
  missing?: Partial<Readonly<Record<NoInfer<S>, MissingHook>>>;
  /** This bus connects directly to destination, bypassing the effects master. */
  musicBus?: NoInfer<B>;
  sfxVolume?: number;
  musicVolume?: number;
};

type ResolvedSound<B extends string> = { bus: B; gain: number; gap: number | undefined };

export type PlayCounts = { file: number; hook: number; silent: number };
export type SceneAudioStats<S extends string> = FileBankStats & { plays: Partial<Record<S, PlayCounts>> };

/**
 * Web Audio effects on a few mix buses and one looping music track. Unlocks
 * on the first user gesture (browsers block audio before it).
 */
export class SceneAudio<S extends string, B extends string = AudioGroup> {
  enabled = true;
  readonly mix: BusMix<B>;
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private readonly busNodes = new Map<B, GainNode>();
  private music: { source: AudioBufferSourceNode; gain: GainNode; url: string; key: string } | null = null;
  private readonly files: FileBank<S>;
  private readonly layered: LayeredBank<S>;
  private readonly plays = new Map<S, PlayCounts>();
  private readonly musicBusName: B | undefined;
  private startup: Promise<void> = Promise.resolve();
  private musicRequest = 0;
  private readonly last = new Map<string, number>();
  private readonly sounds: Map<S, ResolvedSound<B>>;
  private readonly defaultBus: B;
  private readonly voiceBusName: B;
  private readonly audioBase: string;
  private readonly dragonSamples: Partial<Record<DragonSample, (typeof DRAGON_SAMPLES)[DragonSample]>>;
  private pronunciationActive = false;
  /** Two seconds of white noise, the raw stuff of the synthesized fire sounds. */
  private noise: AudioBuffer | null = null;
  /** The dragon's recordings, as they finish loading (`recordedVoice`). */
  private readonly dragon = new Map<DragonSample, AudioBuffer>();
  /** Saturation and compression every dragon voice goes through (`voiceBus`). */
  private voiceOut: AudioNode | null = null;
  private sfxVolume: number;
  private musicVolume: number;

  constructor(options: SceneAudioOptions<S, B>) {
    const buses = (options.buses ?? DEFAULT_BUSES) as BusTable<B>;
    this.mix = new BusMix(buses);
    const names = this.mix.busNames;
    if (names.length === 0) throw new RangeError("SceneAudio needs at least one bus");
    this.defaultBus = options.defaultBus ?? (names.includes("combat" as B) ? ("combat" as B) : names[0]!);
    this.voiceBusName = options.voiceBus ?? this.defaultBus;
    this.musicBusName = options.musicBus;
    if (this.musicBusName !== undefined && !(this.musicBusName in buses)) throw new RangeError("unknown music bus " + this.musicBusName);
    this.audioBase = options.audioBase ?? DEFAULT_AUDIO_BASE;
    this.dragonSamples = options.dragonSamples === false ? {} : (options.dragonSamples ?? DRAGON_SAMPLES);
    this.sfxVolume = clamp(options.sfxVolume ?? 0.5, 0, 1);
    this.musicVolume = clamp(options.musicVolume ?? 0.35, 0, 1);
    this.sounds = new Map();
    const legacy: Partial<Record<S, string>> = Object.create(null);
    for (const [name, spec] of Object.entries(options.sounds) as [S, SoundSpec<B>][]) {
      const full = typeof spec === "string" ? { url: spec } : spec;
      const bus = full.bus ?? this.defaultBus;
      if (!(bus in buses)) throw new RangeError("sound " + name + " names an unknown bus " + bus);
      const url = full.url === undefined ? undefined : audioUrl(full.url, this.audioBase);
      if (url !== undefined) legacy[name] = url;
      this.sounds.set(name, { bus, gain: full.gain ?? 1, gap: full.gap });
    }
    this.files = new FileBank({ ...options, audioBase: this.audioBase, legacy });
    this.layered = new LayeredBank(this.files, options.missing);
  }

  get unlocked(): boolean {
    return this.context !== null;
  }

  /** The resolved URL of a sound in the table. */
  url(name: S): string | undefined {
    return this.files.url(name);
  }

  setVolumes(sfx: number, music: number): void {
    this.sfxVolume = clamp(sfx, 0, 1);
    this.musicVolume = clamp(music, 0, 1);
    if (this.master !== null) this.master.gain.value = this.sfxVolume;
    if (this.music !== null) this.music.gain.gain.value = this.musicVolume;
  }

  /** Dips every bus by its duck while a word is spoken (speech/PRONUNCIATION_EVENT). */
  setPronunciationActive(active: boolean): void {
    this.pronunciationActive = active;
    const context = this.context;
    if (context === null) return;
    for (const [bus, node] of this.busNodes) {
      node.gain.setTargetAtTime(this.mix.busGain(bus, active), context.currentTime, 0.05);
    }
  }

  unlock(): void {
    if (this.context !== null) {
      if (this.context.state === "suspended") void this.context.resume();
      return;
    }
    if (typeof AudioContext === "undefined") return;
    const context = new AudioContext();
    this.context = context;
    this.master = context.createGain();
    this.master.gain.value = this.sfxVolume;
    this.master.connect(context.destination);
    for (const bus of this.mix.busNames) {
      const node = context.createGain();
      node.gain.value = this.mix.busGain(bus, this.pronunciationActive);
      node.connect(bus === this.musicBusName ? context.destination : this.master);
      this.busNodes.set(bus, node);
    }
    this.voiceOut = voiceBus(context, this.busNodes.get(this.voiceBusName) ?? this.master);
    this.startup = this.files.unlock(context, Object.values(this.dragonSamples).map(spec => spec.file));
    for (const [key, spec] of Object.entries(this.dragonSamples) as [DragonSample, (typeof DRAGON_SAMPLES)[DragonSample]][]) {
      void this.files.file(spec.file).then((buffer) => {
        if (buffer !== null) this.dragon.set(key, buffer);
      });
    }
  }

  /** Resolves after metadata, priority ids, legacy files and dragon recordings; other ids and music stay lazy. */
  ready(): Promise<void> { return this.startup; }

  loopBuffer(name: S): AudioBuffer | null { return this.files.loopBuffer(name); }

  stats(): SceneAudioStats<S> {
    return { ...this.files.stats(), plays: Object.fromEntries([...this.plays].map(([id, counts]) => [id, { ...counts }])) as Partial<Record<S, PlayCounts>> };
  }

  private count(name: S, kind: keyof PlayCounts): void {
    const counts = this.plays.get(name) ?? { file: 0, hook: 0, silent: 0 };
    counts[kind]++;
    this.plays.set(name, counts);
  }

  private output(bus: B): AudioNode | null {
    return this.busNodes.get(bus) ?? this.master;
  }

  /** `gap`: minimum seconds between plays; a loading file never starts this event late. */
  play(name: S, gain = 1, options: PlayOptions<B> = {}): number {
    const sound = this.sounds.get(name);
    const context = this.context;
    if (!this.enabled || context === null || this.master === null) { this.count(name, "silent"); return 0; }
    const full = { ...options, gap: options.gap ?? sound?.gap, bus: options.bus ?? sound?.bus ?? this.defaultBus };
    const now = context.currentTime;
    if (now - (this.last.get(name) ?? -1) < (full.gap ?? 0.03)) { this.count(name, "silent"); return 0; }
    const selected = this.layered.select(name, options.variant);
    if (selected.kind === "silent") { this.count(name, "silent"); return 0; }
    this.last.set(name, now);
    const level = gain * (sound?.gain ?? 1);
    if (selected.kind === "file") {
      this.count(name, "file");
      return this.startBuffer(selected.file.buffer, level, full);
    }
    this.noise ??= noiseBuffer(context);
    const out = context.createGain();
    out.gain.value = level;
    const panner = context.createStereoPanner();
    panner.pan.value = clamp(full.pan ?? 0, -1, 1);
    out.connect(panner).connect(this.output(full.bus)!);
    this.count(name, "hook");
    return selected.hook(context, out, this.noise, now) ?? 0;
  }

  /** Starts loading sound files outside the table (paths under the audio base or full URLs) for `playFile`. */
  preload(urls: readonly string[]): void {
    for (const url of urls) void this.files.file(url);
  }

  /** Like `play`, for a file `preload` loaded; `gap` is kept per file. */
  playFile(url: string, gain = 1, options: PlayOptions<B> = {}): number {
    if (!this.enabled || this.context === null || this.master === null) return 0;
    const full = audioUrl(url, this.audioBase);
    const buffer = this.files.cached(full);
    if (buffer === undefined) { void this.files.file(full); return 0; }
    const now = this.context.currentTime;
    if (now - (this.last.get(full) ?? -1) < (options.gap ?? 0.03)) return 0;
    this.last.set(full, now);
    return this.startBuffer(buffer, gain, options);
  }

  private startBuffer(buffer: AudioBuffer, gain: number, options: PlayOptions<B>): number {
    const context = this.context!;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = (options.rate ?? 1) * rand(0.95, 1.05);
    const volume = context.createGain();
    volume.gain.value = gain;
    const panner = context.createStereoPanner();
    panner.pan.value = clamp(options.pan ?? 0, -1, 1);
    source.connect(volume).connect(panner).connect(this.output(options.bus ?? this.defaultBus)!);
    source.start();
    return buffer.duration / source.playbackRate.value;
  }

  /** A sound built on the spot: `build` wires Web Audio nodes into `out` (on a bus), from `now`. */
  synth(
    key: string,
    build: (context: AudioContext, out: AudioNode, noise: AudioBuffer, now: number) => void,
    gain = 1,
    options: { pan?: number; gap?: number; bus?: B } = {},
  ): void {
    const context = this.context;
    if (!this.enabled || context === null || this.master === null) return;
    const now = context.currentTime;
    if (now - (this.last.get("synth:" + key) ?? -1) < (options.gap ?? 0.03)) return;
    this.last.set("synth:" + key, now);
    this.noise ??= noiseBuffer(context);
    const out = context.createGain();
    out.gain.value = gain;
    const panner = context.createStereoPanner();
    panner.pan.value = clamp(options.pan ?? 0, -1, 1);
    out.connect(panner).connect(this.output(options.bus ?? this.defaultBus)!);
    build(context, out, this.noise, now);
  }

  /** A dragon's sound: from its recordings once loaded (`recordedVoice`), synthesized until then. */
  voice(name: SceneVoice, gain = 1, options: { pan?: number; gap?: number } = {}): void {
    const context = this.context;
    if (!this.enabled || context === null || this.master === null) return;
    const now = context.currentTime;
    if (now - (this.last.get("voice:" + name) ?? -1) < (options.gap ?? 0.03)) return;
    this.last.set("voice:" + name, now);
    this.noise ??= noiseBuffer(context);
    const out = context.createGain();
    out.gain.value = gain;
    const panner = context.createStereoPanner();
    panner.pan.value = clamp(options.pan ?? 0, -1, 1);
    out.connect(panner).connect(this.voiceOut ?? this.master);
    if (!recordedVoice(context, out, this.noise, this.dragon, name, now)) synthVoice(context, out, this.noise, name, now);
  }

  /** Loops a path under the audio base, crossfading from the previous track. */
  async playMusic(path: string | null): Promise<void> {
    await this.changeMusic(path === null ? "" : "file:" + audioUrl(path, this.audioBase), path === null ? null : () => this.files.file(path).then(buffer => buffer === null ? null : { buffer, url: audioUrl(path, this.audioBase) }));
  }

  /** Loops a named manifest track. Music is fetched and decoded only on this call. */
  async playTrack(name: string | null): Promise<void> {
    await this.changeMusic(name === null ? "" : "track:" + name, name === null ? null : () => this.files.track(name));
  }

  private async changeMusic(key: string, load: (() => Promise<{ buffer: AudioBuffer; url: string } | null>) | null): Promise<void> {
    const context = this.context;
    if (context === null) return;
    const request = ++this.musicRequest;
    if (this.music?.key === key) return;
    this.fadeMusic(context);
    if (load === null) return;
    const track = await load();
    if (request !== this.musicRequest || track === null || this.context !== context || this.music?.url === track.url) return;
    const source = context.createBufferSource();
    source.buffer = track.buffer;
    source.loop = true;
    const gain = context.createGain();
    gain.gain.value = 0;
    gain.gain.setTargetAtTime(this.enabled ? this.musicVolume : 0, context.currentTime, 0.6);
    const destination = this.musicBusName === undefined ? context.destination : this.busNodes.get(this.musicBusName)!;
    source.connect(gain).connect(destination);
    source.start();
    this.music = { source, gain, url: track.url, key };
  }

  private fadeMusic(context: AudioContext): void {
    if (this.music === null) return;
    this.music.gain.gain.setTargetAtTime(0, context.currentTime, 0.4);
    this.music.source.stop(context.currentTime + 2);
    this.music = null;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (this.music !== null && this.context !== null) this.music.gain.gain.setTargetAtTime(enabled ? this.musicVolume : 0, this.context.currentTime, 0.2);
  }
}
