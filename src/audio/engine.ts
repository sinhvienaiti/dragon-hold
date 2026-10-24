/**
 * Plays cues: limiter first (voice cap, rate limits, stealing), then one
 * voice = gain → pan → bus, built by the bank at the audio clock. Impacts and
 * world sounds vary a little (pitch ±4 %, ±1.5 dB, 0–12 ms, 05 §7); typing,
 * UI and learning stay exact and immediate. Looping beds (ambience, crowd)
 * run on their own gain, never through the limiter.
 * Owner: audio (LANES.md).
 */
import type { SoundBank } from "./bank";
import { SOUNDS, type SoundId } from "./catalog";
import { VoiceLimiter, type LimiterRules } from "./limiter";
import type { Cue } from "./map-events";
import { dbToGain } from "./mix";
import { ramp, type Mixer } from "./mixer";
import { DEFAULT_PARAMS, type SoundParams } from "./synth";

/** A stolen voice fades this fast (no click). */
const STEAL_FADE_S = 0.025;

export type CueLike = Pick<Cue, "id"> & Partial<Omit<Cue, "id">>;

interface LiveVoice {
  readonly gain: GainNode;
  readonly end: number;
}

interface Bed {
  readonly gain: GainNode;
  readonly pan: StereoPannerNode;
  readonly source: AudioBufferSourceNode;
  level: number;
  panValue: number;
}

export class AudioEngine {
  readonly limiter: VoiceLimiter;
  private readonly voices = new Map<number, LiveVoice>();
  private readonly beds = new Map<SoundId, Bed>();
  private sweepAt = 0;
  /** Chime root (Hz) from the music, so notes sit in its key. */
  rootHz = DEFAULT_PARAMS.rootHz;

  constructor(
    readonly mixer: Mixer,
    readonly bank: SoundBank,
    rules: Partial<LimiterRules> = {},
    private readonly random: () => number = Math.random,
  ) {
    this.limiter = new VoiceLimiter(rules);
  }

  get ctx(): BaseAudioContext {
    return this.mixer.ctx;
  }

  /** Plays one cue now (plus its delay); false when the limiter or the bank said no. */
  play(cue: CueLike, at = this.ctx.currentTime): boolean {
    const def = SOUNDS[cue.id];
    if (def.loop || !this.bank.has(cue.id)) return false;
    const vary = def.vary;
    const rate = (cue.rate ?? 1) * (vary ? 0.96 + this.random() * 0.08 : 1);
    const jitterDb = vary ? (this.random() * 2 - 1) * 1.5 : 0;
    const when = at + (cue.delayS ?? 0) + (vary ? this.random() * 0.012 : 0);
    const admission = this.limiter.admit({
      sound: cue.id,
      priority: def.priority,
      lengthS: def.lengthMs / 1000 / rate + (cue.delayS ?? 0),
      gapS: def.gapMs / 1000,
      ...(def.group ? { group: def.group } : {}),
      now: at,
    });
    if (!admission.ok) return false;
    for (const id of admission.steal) this.fade(id, at);

    const ctx = this.ctx;
    const gain = ctx.createGain();
    gain.gain.value = dbToGain(def.gainDb + jitterDb) * Math.max(0, Math.min(1.5, cue.gain ?? 1));
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.max(-1, Math.min(1, cue.pan ?? 0));
    gain.connect(pan).connect(this.mixer.input(def.bus));
    const params: SoundParams = {
      rate,
      step: cue.step ?? 0,
      count: cue.count ?? 1,
      variant: cue.variant ?? 0,
      material: cue.material ?? null,
      rootHz: this.rootHz,
    };
    const length = this.bank.play(ctx, cue.id, gain, when, params);
    if (length <= 0) {
      this.limiter.release(admission.voice);
      gain.disconnect();
      return false;
    }
    // Hold the voice for what plays (a short synth placeholder or the file), not the catalog's target length.
    this.limiter.settle(admission.voice, when + length);
    this.voices.set(admission.voice, { gain, end: when + length });
    if (at > this.sweepAt) this.sweep(at);
    return true;
  }

  /** Starts (once) and levels a looping bed; level 0 keeps it running silently. */
  bed(id: SoundId, level: number, pan = 0, rampS = 0.4): void {
    const def = SOUNDS[id];
    if (!def.loop) return;
    let bed = this.beds.get(id);
    const now = this.ctx.currentTime;
    if (!bed) {
      if (level <= 0) return;
      const buffer = this.bank.loop(this.ctx, id);
      if (!buffer) return;
      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      const panner = this.ctx.createStereoPanner();
      source.connect(gain).connect(panner).connect(this.mixer.input(def.bus));
      // Start somewhere in the loop so beds of the same length do not phase together.
      source.start(now, this.random() * buffer.duration);
      bed = { gain, pan: panner, source, level: 0, panValue: 0 };
      this.beds.set(id, bed);
    }
    // Levels and pans move in small steps so a changing crowd does not flood the param timeline.
    const target = dbToGain(def.gainDb) * Math.round(Math.max(0, Math.min(1, level)) * 50) / 50;
    if (Math.abs(target - bed.level) > 1e-4) {
      bed.level = target;
      ramp(bed.gain.gain, target, now, rampS);
    }
    const panTarget = Math.round(Math.max(-0.6, Math.min(0.6, pan)) * 20) / 20;
    if (panTarget !== bed.panValue) {
      bed.panValue = panTarget;
      bed.pan.pan.setTargetAtTime(panTarget, now, 0.3);
    }
  }

  /** Voices sounding now (for stats). */
  activeVoices(): number {
    return this.limiter.active(this.ctx.currentTime);
  }

  stopAll(): void {
    const now = this.ctx.currentTime;
    for (const id of [...this.voices.keys()]) this.fade(id, now);
    for (const bed of this.beds.values()) {
      ramp(bed.gain.gain, 0, now, 0.2);
      bed.source.stop(now + 0.3);
    }
    this.beds.clear();
    this.limiter.clear();
  }

  private fade(id: number, now: number): void {
    const voice = this.voices.get(id);
    if (!voice) return;
    this.voices.delete(id);
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
    voice.gain.gain.linearRampToValueAtTime(0, now + STEAL_FADE_S);
  }

  /** Forgets finished voices (their nodes end on their own). */
  private sweep(now: number): void {
    this.sweepAt = now + 1;
    for (const [id, voice] of this.voices) if (voice.end < now) this.voices.delete(id);
  }
}
