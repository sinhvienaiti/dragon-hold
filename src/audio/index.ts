/**
 * Game audio (05 §7): a Presenter that hears the sim's events and plays them
 * on 12 buses (master, music, ui, typing, dragon, enemies, traps, units,
 * ambience, voice, stingers, learning). Class sound sets, not species; a
 * limiter so 200 foes never clip; pronunciation and the learning frame's
 * sounds always on top (every other bus dips while a word is spoken); a
 * two-layer procedural forest-folk score that follows the run. M0a has no
 * files: every sound is a WebAudio synth behind a SoundBank, and the owner's
 * files (public/assets/dragon-hold/audio/, never in Git) replace them later.
 * Owner: audio (LANES.md).
 */
import type { FrameInfo, Presenter, Quality } from "../app/contracts";
import type { SimEvent } from "../content/types";
import { PRONUNCIATION_EVENT } from "../kit/speech";
import { uToM } from "../sim/fixed";
import type { World } from "../sim/world";
import { FileBank, LayeredBank, SynthBank, type SoundBank } from "./bank";
import { CHILD_BUSES, CLASS_SETS, foeSfx, foeVoice, type SoundClass } from "./catalog";
import { AudioEngine } from "./engine";
import { VOICE_CAP } from "./limiter";
import { EventMapper, LowHpAlarm, panFor, type Listener } from "./map-events";
import { AudioMix, DEFAULT_VOLUMES, NO_DUCK, type AudioVolumes, type DuckState } from "./mix";
import { Mixer } from "./mixer";
import { MusicDirector } from "./music";
import { musicTargets } from "./music-plan";

export type UiSound = "select" | "confirm" | "deny" | "gold";
export type LearningSound = "new" | "right" | "wrong";

export interface AudioOptions {
  /** Device tier: voice cap 16 / 24 / 32 / 32 (05 §8). */
  readonly quality?: Quality;
  /** Settings volumes 0–1 (06 §3 defaults). */
  readonly volumes?: Partial<AudioVolumes>;
  /** Load the owner's files from /assets/dragon-hold/audio/manifest.json (M0a: false, all synth, no fetch). */
  readonly files?: boolean;
  /** Resume audio on the first key or pointer press on `window` (default true). */
  readonly autoUnlock?: boolean;
  /** Where the pronunciation event comes from (kit speech); default `window`. */
  readonly events?: EventTarget | null;
  /** Make the context yourself (tests, a shared context). */
  readonly createContext?: () => AudioContext;
  readonly random?: () => number;
}

export interface AudioStats {
  readonly unlocked: boolean;
  readonly bank: string;
  readonly voices: number;
  readonly peakVoices: number;
  readonly admitted: number;
  readonly stolen: number;
  readonly rejected: Readonly<Record<string, number>>;
  readonly ducks: Readonly<Record<string, number>>;
  readonly music: Readonly<Record<string, number>>;
}

export interface GameAudio extends Presenter {
  /** Resumes (or creates) the AudioContext; call from a user gesture. */
  unlock(): void;
  readonly unlocked: boolean;
  setMuted(muted: boolean): void;
  setVolumes(volumes: Partial<AudioVolumes>): void;
  /** Focus lost or menu open: world and music low-passed, effects down (06 §2). */
  setPaused(paused: boolean): void;
  setQuality(quality: Quality): void;
  /** The portal plays its own music (kit learning bridge onSharedMusic): game music goes silent. */
  setSharedMusic(playing: boolean): void;
  /** A Bạch Long or narrator line is playing (06 §6): music, ambience, enemies dip. */
  setDialogue(active: boolean): void;
  /** Settings voice boost 1–3: effects dip deeper while a word is spoken (kit BusMix). */
  setPronunciationBoost(boost: number): void;
  /** Camera ground focus (metres) and heading (radians, 0 looks north) for stereo placement. */
  setListener(xM: number, zM: number, yaw: number): void;
  /** UI sounds for DOM panels (shop strip, placement, menus). */
  ui(sound: UiSound): void;
  /** Learning frame sounds (Thẻ Ôn, Học trước); never ducked. */
  learning(sound: LearningSound): void;
  /** Pronunciation should wait (general or boss warning open, dialogue): use in kit setSpeechGate (01 §6.4). */
  speechBlocked(): boolean;
  /** A new run on the same audio (restart, next stage): forgets foes, words, alarms; stops voices and music. */
  resetRun(): void;
  stats(): AudioStats;
}

const now = (): number => performance.now() / 1000;

export function createAudio(options: AudioOptions = {}): GameAudio {
  const random = options.random ?? Math.random;
  const mix = new AudioMix();
  const mapper = new EventMapper();
  let alarm = new LowHpAlarm();
  const synthBank = new SynthBank(random);
  const fileBank = options.files ? new FileBank() : null;
  const bank: SoundBank = fileBank ? new LayeredBank(fileBank, synthBank) : synthBank;
  const listener: Listener = { x: 0, z: 0, yaw: 0 };
  const events = options.events !== undefined ? options.events : typeof window === "undefined" ? null : window;
  let volumes: AudioVolumes = { ...DEFAULT_VOLUMES, ...options.volumes };
  let quality: Quality = options.quality ?? "high";
  let ctx: AudioContext | null = null;
  let mixer: Mixer | null = null;
  let engine: AudioEngine | null = null;
  let music: MusicDirector | null = null;
  let muted = false;
  let paused = false;
  let sharedMusic = false;
  let dialogue = false;
  let pronouncing = false;
  let ducks: DuckState = NO_DUCK;
  let nextBird = 0;
  let disposed = false;

  const onSpeech = (event: Event): void => {
    pronouncing = (event as CustomEvent<{ active?: boolean }>).detail?.active === true;
  };
  events?.addEventListener(PRONUNCIATION_EVENT, onSpeech);

  const gesture = (): void => audio.unlock();
  const autoUnlock = (options.autoUnlock ?? true) && typeof window !== "undefined";
  if (autoUnlock) {
    window.addEventListener("pointerdown", gesture, { capture: true });
    window.addEventListener("keydown", gesture, { capture: true });
  }
  const dropGesture = (): void => {
    if (!autoUnlock) return;
    window.removeEventListener("pointerdown", gesture, { capture: true });
    window.removeEventListener("keydown", gesture, { capture: true });
  };

  const counts = new Map<SoundClass, { n: number; x: number; z: number; lead: string; kinds: Map<string, number> }>();

  /** Crowd loops by class and the forest beds, from the world (05 §7.1). */
  function beds(world: World): void {
    if (!engine) return;
    for (const value of counts.values()) value.n = 0;
    for (const enemy of world.enemies.list) {
      if (!enemy.alive || enemy.freed) continue;
      const voice = foeVoice(enemy.foe);
      if (!voice) continue;
      let entry = counts.get(voice.cls);
      if (!entry) {
        entry = { n: 0, x: 0, z: 0, lead: "", kinds: new Map() };
        counts.set(voice.cls, entry);
      }
      if (entry.n === 0) {
        entry.x = 0;
        entry.z = 0;
        entry.lead = "";
        entry.kinds.clear();
      }
      entry.n += 1;
      const kind = (entry.kinds.get(enemy.foe) ?? 0) + 1;
      entry.kinds.set(enemy.foe, kind);
      if (entry.lead === "" || kind > (entry.kinds.get(entry.lead) ?? 0)) entry.lead = enemy.foe;
      entry.x += uToM(enemy.x);
      entry.z += uToM(enemy.z);
    }
    for (const cls of Object.keys(CLASS_SETS) as SoundClass[]) {
      const entry = counts.get(cls);
      const n = entry?.n ?? 0;
      const level = n === 0 ? 0 : Math.min(1, 0.3 + 0.7 * Math.sqrt(n / 40));
      const pan = entry && n > 0 ? panFor(entry.x / n, entry.z / n, listener) * 0.6 : 0;
      engine.bed(CLASS_SETS[cls].march, level, pan, 0.4, entry && n > 0 ? (foeSfx(entry.lead)?.move ?? null) : null);
    }
    const battle = world.phase === "wave";
    engine.bed("amb.forest", battle ? 0.65 : 1);
    engine.bed("amb.river", 1, -0.2);
    const t = now();
    if (!battle && t > nextBird) {
      nextBird = t + 4 + random() * 7;
      if (world.phase === "prep" || world.phase === "break") engine.play({ id: "amb.bird", pan: random() * 1.2 - 0.6, gain: 0.6 + random() * 0.4 });
    }
  }

  const audio: GameAudio = {
    get unlocked() {
      return ctx !== null && ctx.state !== "closed";
    },

    unlock() {
      if (disposed) return;
      if (ctx) {
        if (ctx.state === "suspended") void ctx.resume();
        return;
      }
      if (typeof AudioContext === "undefined" && !options.createContext) return;
      ctx = options.createContext ? options.createContext() : new AudioContext({ latencyHint: "interactive" });
      mixer = new Mixer(ctx, mix, volumes);
      mixer.setMuted(muted);
      mixer.setPaused(paused);
      engine = new AudioEngine(mixer, bank, { maxVoices: VOICE_CAP[quality] }, random);
      music = new MusicDirector(ctx, mixer.input("music"), bank, synthBank.noiseFor(ctx), undefined, random);
      engine.rootHz = music.rootHz;
      if (ctx.state === "suspended") void ctx.resume();
      if (fileBank) void fileBank.load(ctx);
      dropGesture();
    },

    onEvents(batch: readonly SimEvent[], _world: World) {
      const cues = mapper.map(batch, now(), listener);
      if (music && (mapper.phase === "victory" || mapper.phase === "defeat") && batch.some((e) => e.type === "victory" || e.type === "defeat")) music.stop(1.5);
      if (!engine) return;
      for (const cue of cues) engine.play(cue);
    },

    frame(world: World, _info: FrameInfo) {
      if (!engine || !mixer || !music || !ctx) return;
      const heroPct = world.hero.hpMax > 0 ? (world.hero.hp * 100) / world.hero.hpMax : 100;
      const alarmCue = world.phase === "wave" ? alarm.update(heroPct, now()) : alarm.update(100, now());
      if (alarmCue) engine.play({ id: alarmCue });

      music.update(
        ctx.currentTime,
        musicTargets({ phase: world.phase, wave: world.wave, waves: mapper.waves, heroPct, live: world.enemies.live, generals: mapper.generalsAlive, sharedMusic }),
      );

      const state: DuckState = { pronunciation: pronouncing, dialogue, warning: mapper.warningActive(now()) };
      for (const bus of CHILD_BUSES) {
        const target = mix.target(bus, state, mixer.duckOf(bus), ducks);
        mixer.setDuck(bus, target.duck, target.rampS);
      }
      ducks = state;
      beds(world);
    },

    setMuted(value) {
      muted = value;
      mixer?.setMuted(value);
    },

    setVolumes(next) {
      volumes = { ...volumes, ...next };
      mixer?.setVolumes(volumes);
    },

    setPaused(value) {
      paused = value;
      mixer?.setPaused(value);
    },

    setQuality(value) {
      quality = value;
      engine?.limiter.setMaxVoices(VOICE_CAP[value]);
    },

    setSharedMusic(playing) {
      sharedMusic = playing;
    },

    setDialogue(active) {
      dialogue = active;
    },

    setPronunciationBoost(boost) {
      mix.setPronunciationBoost(boost);
    },

    setListener(xM, zM, yaw) {
      listener.x = xM;
      listener.z = zM;
      listener.yaw = yaw;
    },

    ui(sound) {
      engine?.play({ id: `ui.${sound}` });
    },

    learning(sound) {
      engine?.play({ id: `learn.${sound}` });
    },

    speechBlocked() {
      return dialogue || mapper.warningActive(now());
    },

    resetRun() {
      mapper.reset();
      alarm = new LowHpAlarm();
      music?.stop(0.6);
      engine?.stopAll();
    },

    stats(): AudioStats {
      const limiter = engine?.limiter.stats;
      return {
        unlocked: audio.unlocked,
        bank: bank.name,
        voices: engine?.activeVoices() ?? 0,
        peakVoices: limiter?.peak ?? 0,
        admitted: limiter?.admitted ?? 0,
        stolen: limiter?.stolen ?? 0,
        rejected: { ...(limiter?.rejected ?? {}) },
        ducks: Object.fromEntries(CHILD_BUSES.map((bus) => [bus, mixer?.duckOf(bus) ?? 1])),
        music: { ...(music?.levels() ?? {}) },
      };
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      dropGesture();
      events?.removeEventListener(PRONUNCIATION_EVENT, onSpeech);
      engine?.stopAll();
      music?.dispose();
      mixer?.dispose();
      if (ctx && !options.createContext) void ctx.close();
      ctx = null;
      engine = null;
      music = null;
      mixer = null;
    },
  };
  return audio;
}

export { BUSES, SOUNDS, SOUND_IDS, type Bus, type SoundId } from "./catalog";
export { DEFAULT_VOLUMES, type AudioVolumes } from "./mix";
export { FileBank, LayeredBank, SynthBank, type AudioManifest, type SoundBank } from "./bank";
