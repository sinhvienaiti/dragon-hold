/**
 * M0a placeholder sounds: every one-shot of catalog.ts as a short WebAudio
 * synth (no files yet). Ideas from Space's Defense sounds (noise bursts and
 * falling tones) and the kit: the dragon's voice (kit/audio synthVoice), the
 * wood key that climbs a semitone a letter and the pentatonic chimes
 * (kit/feedback). Fire is low-passed noise over a sine thump, never a bright
 * hiss; enemies get a material layer (05 §6.3: lá "xào", lông "thịch", vỏ
 * "rắc"…) and a small spirit mote when they die. Instruments for the
 * procedural music live here too (harp, wooden flute, pad, frame drum, cello).
 * Owner: audio (LANES.md).
 */
import { synthVoice, type SceneVoice } from "../kit/audio";
import { DRAGON, keyStepRatio, pentatonicRatio } from "../kit/feedback";
import type { Material } from "../content/types";
import type { SoundId } from "./catalog";

export interface SoundParams {
  readonly rate: number;
  readonly step: number;
  readonly count: number;
  readonly variant: number;
  readonly material: Material | null;
  /** The music's chime root (Hz) so word and kill notes sit in its key. */
  readonly rootHz: number;
}

export const DEFAULT_PARAMS: SoundParams = { rate: 1, step: 0, count: 1, variant: 0, material: null, rootHz: 698.46 };

interface ToneOpts {
  attack?: number;
  /** Sustained notes hold, then fall over `release`. */
  release?: number;
  filter?: number;
  filterTo?: number;
  q?: number;
  /** Vibrato depth (fraction of the pitch) and rate (Hz). */
  vibrato?: number;
  vibratoHz?: number;
}

/** The building blocks; every time is an offset from the sound's start. */
export class SynthTools {
  constructor(
    readonly ctx: BaseAudioContext,
    readonly out: AudioNode,
    readonly noise: AudioBuffer,
    readonly t0: number,
    readonly pitch = 1,
    private readonly random: () => number = Math.random,
  ) {}

  private hz(f: number): number {
    return Math.min(this.ctx.sampleRate * 0.45, Math.max(20, f * this.pitch));
  }

  private envelope(at: number, dur: number, gain: number, attack: number, release?: number): GainNode {
    const t = this.t0 + at;
    const env = this.ctx.createGain();
    const peak = Math.max(0.0002, gain);
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(peak, t + attack);
    if (release !== undefined && dur - release > attack) {
      env.gain.setValueAtTime(peak, t + dur - release);
      env.gain.linearRampToValueAtTime(0, t + dur);
    } else {
      env.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(attack + 0.005, dur));
    }
    env.connect(this.out);
    return env;
  }

  /** An oscillator from `f` to `to` Hz (exponential glide), optional filter and vibrato. */
  tone(type: OscillatorType, f: number, to: number, dur: number, gain: number, at = 0, opts: ToneOpts = {}): void {
    const t = this.t0 + at;
    const env = this.envelope(at, dur, gain, opts.attack ?? 0.003, opts.release);
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(this.hz(f), t);
    if (to !== f) osc.frequency.exponentialRampToValueAtTime(this.hz(to), t + dur);
    if (opts.vibrato) {
      const lfo = this.ctx.createOscillator();
      lfo.frequency.value = opts.vibratoHz ?? 5;
      const depth = this.ctx.createGain();
      depth.gain.value = this.hz(f) * opts.vibrato;
      lfo.connect(depth).connect(osc.frequency);
      lfo.start(t);
      lfo.stop(t + dur + 0.02);
    }
    if (opts.filter !== undefined) {
      const filter = this.ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.Q.value = opts.q ?? 0.7;
      filter.frequency.setValueAtTime(this.hz(opts.filter), t);
      if (opts.filterTo !== undefined) filter.frequency.exponentialRampToValueAtTime(this.hz(opts.filterTo), t + dur);
      osc.connect(filter).connect(env);
    } else {
      osc.connect(env);
    }
    osc.start(t);
    osc.stop(t + dur + 0.03);
  }

  /** Filtered noise, its filter gliding from `f` to `to`. */
  hiss(type: BiquadFilterType, f: number, to: number, dur: number, gain: number, at = 0, q = 0.8, attack = 0.002): void {
    const t = this.t0 + at;
    const env = this.envelope(at, dur, gain, attack);
    const source = this.ctx.createBufferSource();
    source.buffer = this.noise;
    source.playbackRate.value = 0.9 + this.random() * 0.2;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.Q.value = q;
    filter.frequency.setValueAtTime(this.hz(f), t);
    if (to !== f) filter.frequency.exponentialRampToValueAtTime(this.hz(to), t + dur);
    source.connect(filter).connect(env);
    source.start(t, this.random() * (this.noise.duration - dur - 0.1 > 0 ? this.noise.duration - dur - 0.1 : 0));
    source.stop(t + dur + 0.03);
  }

  /** A low sine drop: the body of a blow. */
  thump(f: number, to: number, dur: number, gain: number, at = 0): void {
    this.tone("sine", f, to, dur, gain, at, { attack: 0.002 });
  }

  /** Harp-like pluck: triangle fundamental, a quick octave shimmer, a tiny pick noise. */
  pluck(f: number, dur: number, gain: number, at = 0): void {
    this.tone("triangle", f, f, dur, gain, at, { attack: 0.002, filter: f * 6, filterTo: f * 2 });
    this.tone("sine", f * 2, f * 2, dur * 0.45, gain * 0.35, at, { attack: 0.002 });
    this.hiss("bandpass", f * 4, f * 4, 0.012, gain * 0.25, at, 3);
  }

  /** Wooden flute: soft sine with breath and a late vibrato. */
  flute(f: number, dur: number, gain: number, at = 0): void {
    this.tone("sine", f, f, dur, gain, at, { attack: Math.min(0.09, dur * 0.3), release: Math.min(0.25, dur * 0.4), vibrato: 0.006, vibratoHz: 5.2 });
    this.tone("triangle", f * 2, f * 2, dur, gain * 0.12, at, { attack: 0.1, release: Math.min(0.25, dur * 0.4) });
    this.hiss("bandpass", f * 2.2, f * 2.2, Math.min(dur, 0.25), gain * 0.35, at, 2.5, 0.03);
  }

  /** One of the kit dragon voices (synthVoice), at a level. */
  kit(name: SceneVoice, at = 0, gain = 1): void {
    const level = this.ctx.createGain();
    level.gain.value = gain;
    level.connect(this.out);
    synthVoice(this.ctx, level, this.noise, name, this.t0 + at);
  }

  /** A small rising "linh" mote: the spirit a dying foe leaves (05 §6.3). */
  mote(at: number, gain: number): void {
    this.tone("sine", 1760, 2637, 0.32, gain, at, { attack: 0.02 });
    this.tone("sine", 2637, 3520, 0.22, gain * 0.5, at + 0.05, { attack: 0.02 });
  }

  /** The hit layer of a material (05 §6.3). */
  material(material: Material | null, at: number, gain: number, big = false): void {
    const len = big ? 1.8 : 1;
    switch (material) {
      case "leaf": // "xào", bursting dry leaves
        this.hiss("bandpass", 3200, 1800, 0.12 * len, gain * 0.6, at, 0.9);
        this.hiss("highpass", 5000, 5000, 0.05 * len, gain * 0.3, at + 0.02);
        return;
      case "rotwood": // "cộp"
        this.tone("triangle", 420, 300, 0.06 * len, gain * 0.5, at);
        this.hiss("bandpass", 900, 700, 0.05 * len, gain * 0.35, at, 2);
        return;
      case "stone": // "cộc"
        this.tone("sine", 900, 700, 0.04 * len, gain * 0.45, at);
        this.hiss("highpass", 2500, 2500, 0.03 * len, gain * 0.3, at);
        return;
      case "fur": // "thịch"
        this.thump(170, 70, 0.1 * len, gain * 0.7, at);
        this.hiss("lowpass", 700, 400, 0.08 * len, gain * 0.35, at);
        return;
      case "chitin": // "rắc"
        this.hiss("highpass", 4200, 3000, 0.025 * len, gain * 0.7, at);
        this.tone("square", 2200, 1800, 0.015 * len, gain * 0.06, at);
        if (big) this.hiss("highpass", 3600, 2400, 0.03, gain * 0.4, at + 0.04);
        return;
      case "mist": // glassy "vút"
        this.tone("sine", 1200, 2400, 0.18 * len, gain * 0.18, at);
        this.hiss("highpass", 6000, 6000, 0.15 * len, gain * 0.15, at);
        return;
      case "mud": // "bọp"
        this.tone("sine", 220, 90, 0.12 * len, gain * 0.5, at);
        this.hiss("lowpass", 400, 250, 0.1 * len, gain * 0.3, at);
        return;
      case "crystal": // "keng"
        this.tone("sine", 2093, 2093, 0.4 * len, gain * 0.2, at);
        this.tone("sine", 3136, 3136, 0.3 * len, gain * 0.1, at);
        return;
      default:
        this.hiss("bandpass", 1500, 900, 0.06, gain * 0.4, at, 1.2);
    }
  }

  /** A war horn: detuned saws through an opening and closing low-pass. */
  horn(f: number, dur: number, gain: number, at = 0): void {
    const opts: ToneOpts = { attack: 0.22, release: 0.5, filter: 380, filterTo: 1300, q: 1.2 };
    this.tone("sawtooth", f, f * 0.985, dur, gain, at, opts);
    this.tone("sawtooth", f * 1.006, f * 0.99, dur, gain * 0.8, at, opts);
    this.tone("sine", f / 2, f / 2, dur, gain * 1.4, at, { attack: 0.25, release: 0.5 });
  }

  /** A frame drum hit: 3 boom, 2 slap, 1 ghost. */
  drum(kind: number, gain: number, at = 0): void {
    if (kind >= 3) {
      this.thump(118, 52, 0.38, gain, at);
      this.hiss("lowpass", 500, 200, 0.12, gain * 0.25, at);
    } else if (kind === 2) {
      this.hiss("bandpass", 1300, 900, 0.09, gain * 0.55, at, 1.4);
      this.thump(200, 140, 0.07, gain * 0.35, at);
    } else if (kind === 1) {
      this.hiss("bandpass", 1800, 1400, 0.04, gain * 0.25, at, 1.6);
    }
  }

  random01(): number {
    return this.random();
  }
}

export type Recipe = (t: SynthTools, p: SoundParams) => void;

/** Recipes by sound id; loops (ambience, crowd beds) are generated in beds.ts instead. */
export const SYNTH_RECIPES: Partial<Record<SoundId, Recipe>> = {
  // ── Typing (05 §7.2): start at once, under 60 ms ───────────────────────────
  "type.key": (t, p) => {
    const rise = keyStepRatio(p.step, DRAGON.audio.keySteps);
    t.hiss("bandpass", 1900, 1900, 0.012, 0.8, 0, 2.2);
    t.tone("triangle", 560, 380, 0.04, 0.7, 0);
    t.tone("sine", 1318.5 * rise, 1318.5 * rise, 0.055, 0.32, 0.002);
  },
  "type.miss": (t) => {
    t.tone("triangle", 190, 130, 0.05, 0.95, 0);
    t.hiss("lowpass", 500, 400, 0.03, 0.48, 0);
  },
  "type.back": (t) => {
    t.tone("sine", 900, 700, 0.03, 0.42, 0);
    t.hiss("highpass", 3000, 3000, 0.015, 0.21, 0);
  },
  "type.switch": (t) => {
    t.tone("triangle", 700, 500, 0.03, 0.35, 0);
    t.tone("triangle", 820, 600, 0.03, 0.3, 0.04);
  },
  "type.word": (t, p) => {
    const root = p.rootHz;
    t.hiss("bandpass", 1800, 1800, 0.05, 0.7, 0, 2);
    t.tone("square", 220, 160, 0.09, 0.17, 0.015);
    if (p.variant === 0) {
      t.tone("sine", root, root, 0.22, 0.35, 0.03);
    } else {
      t.tone("sine", root * pentatonicRatio(3), root * pentatonicRatio(3), 0.24, 0.34, 0.03);
      t.tone("sine", root * 2, root * 2, 0.28, 0.2, 0.09);
      if (p.variant === 2) t.tone("sine", root * pentatonicRatio(7), root * pentatonicRatio(7), 0.22, 0.14, 0.15);
    }
  },

  // ── Hỏa Long ──────────────────────────────────────────────────────────────
  "fire.cast": (t) => t.kit("spit", 0, 0.9),
  "fire.impact.a": (t) => {
    t.kit("fireImpact", 0, 0.9);
    t.thump(130, 50, 0.16, 0.4);
  },
  "fire.impact.b": (t) => {
    t.hiss("lowpass", 1400, 220, 0.3, 0.7, 0, 0.8, 0.01);
    t.thump(145, 48, 0.2, 0.55);
    t.hiss("bandpass", 2400, 900, 0.1, 0.25, 0.04, 1.4);
  },
  "fire.impact.c": (t) => {
    t.kit("blaze", 0, 1);
    t.thump(95, 32, 0.4, 0.6);
  },
  "impact.multi": (t, p) => {
    t.thump(90, 34, 0.42, 0.8);
    t.hiss("lowpass", 1200, 180, 0.46, 0.5, 0, 0.8, 0.01);
    const crackles = Math.min(5, 1 + Math.floor(Math.log2(p.count)));
    for (let i = 0; i < crackles; i += 1) t.hiss("bandpass", 2600, 1500, 0.03, 0.22, 0.06 + i * 0.06 + t.random01() * 0.03, 2);
  },
  "dragon.hurt": (t) => {
    t.kit("grunt", 0, 0.8);
    t.thump(110, 40, 0.3, 0.6);
    t.hiss("lowpass", 600, 300, 0.25, 0.3, 0);
  },
  "dragon.low": (t) => {
    t.tone("sawtooth", 196, 196, 0.32, 0.12, 0, { filter: 900, attack: 0.02, release: 0.1 });
    t.tone("sawtooth", 147, 147, 0.42, 0.12, 0.38, { filter: 800, attack: 0.02, release: 0.15 });
    t.thump(70, 40, 0.3, 0.6, 0);
    t.thump(70, 40, 0.3, 0.5, 0.38);
  },
  "dragon.heartbeat": (t) => {
    t.thump(68, 40, 0.13, 0.8, 0);
    t.thump(62, 38, 0.15, 0.55, 0.19);
  },
  "dragon.down": (t) => {
    t.kit("fall", 0, 1);
    t.tone("sine", 82, 30, 1.4, 0.4, 0.1, { attack: 0.05 });
  },
  "dragon.breath": (t) => {
    t.kit("inhale", 0, 0.55);
    t.kit("breath", 0.32, 1);
  },
  "dragon.skyfire.cast": (t) => {
    t.tone("sine", 1800, 300, 0.85, 0.16, 0, { attack: 0.05 });
    t.hiss("bandpass", 3000, 600, 0.8, 0.25, 0, 4, 0.05);
  },
  "dragon.skyfire.impact": (t) => {
    t.kit("blazeBig", 0, 0.9);
    t.thump(62, 22, 0.9, 0.9);
  },
  "dragon.roar": (t) => {
    t.kit("roar", 0, 1);
    t.hiss("lowpass", 800, 100, 1, 0.45, 0.12, 0.8, 0.03);
    t.thump(80, 30, 0.6, 0.5, 0.12);
  },
  "dragon.rage": (t) => {
    t.tone("sawtooth", 110, 440, 0.8, 0.1, 0, { attack: 0.3, filter: 500, filterTo: 2000 });
    t.hiss("bandpass", 400, 2400, 0.8, 0.2, 0, 3, 0.3);
    t.kit("grunt", 0.72, 0.7);
  },
  "dragon.inferno": (t) => {
    t.kit("spitBig", 0, 1);
    t.kit("blazeBig", 0.25, 0.9);
    for (const [f, at] of [[293.66, 0.1], [440, 0.18], [587.33, 0.26]] as const) t.tone("sine", f, f, 1.3, 0.06, at, { attack: 0.3, release: 0.5 });
  },
  "dragon.skill-ready": (t) => {
    t.pluck(880, 0.3, 0.25);
    t.pluck(1174.66, 0.3, 0.22, 0.08);
  },
  "dragon.level": (t) => {
    [587.33, 698.46, 880, 1174.66].forEach((f, i) => t.pluck(f, 0.5, 0.22, i * 0.07));
  },
  "dragon.potion": (t) => {
    for (let i = 0; i < 3; i += 1) t.tone("sine", 320, 180, 0.08, 0.3, i * 0.12, { attack: 0.01 });
    t.tone("sine", 1568, 1568, 0.4, 0.08, 0.36, { attack: 0.03 });
    t.tone("sine", 1975.5, 1975.5, 0.35, 0.06, 0.42, { attack: 0.03 });
  },

  // ── Enemies: bipeds (bước nhẹ, hự, chém "xoẹt") ───────────────────────────
  "enemy.biped.spawn": (t) => {
    t.tone("sawtooth", 140, 105, 0.35, 0.14, 0, { attack: 0.03, filter: 700 });
    t.hiss("bandpass", 500, 420, 0.3, 0.15, 0, 2, 0.03);
  },
  "enemy.biped.windup": (t) => {
    for (let i = 0; i < 3; i += 1) t.hiss("highpass", 3500, 3500, 0.04, 0.2, i * 0.06);
    t.tone("triangle", 300, 420, 0.2, 0.05, 0.02);
  },
  "enemy.biped.attack": (t) => {
    t.hiss("bandpass", 1200, 4000, 0.16, 0.6, 0, 1.5, 0.01);
    t.tone("triangle", 500, 200, 0.12, 0.1, 0.02);
  },
  "enemy.biped.shoot": (t) => {
    t.tone("triangle", 220, 200, 0.25, 0.35, 0);
    t.tone("sine", 440, 400, 0.2, 0.1, 0);
    t.hiss("bandpass", 2500, 3500, 0.12, 0.15, 0.05, 6);
  },
  "enemy.biped.hit": (t, p) => {
    t.material(p.material, 0, 0.8);
    t.thump(180, 90, 0.08, 0.3);
  },
  "enemy.biped.death": (t, p) => {
    t.material(p.material, 0, 1, true);
    t.thump(160, 50, 0.25, 0.4);
    t.mote(0.18, 0.05);
  },

  // ── Quadrupeds (vó nặng, khịt, húc "huỵch", cắn "phập") ───────────────────
  "enemy.quadruped.spawn": (t) => {
    t.hiss("lowpass", 900, 600, 0.15, 0.3, 0);
    t.tone("sawtooth", 90, 75, 0.3, 0.15, 0.12, { attack: 0.04, filter: 500 });
  },
  "enemy.quadruped.windup": (t) => {
    t.hiss("bandpass", 800, 600, 0.25, 0.3, 0, 1, 0.03);
    t.tone("sawtooth", 80, 80, 0.3, 0.1, 0, { attack: 0.05, filter: 400 });
  },
  "enemy.quadruped.attack": (t) => {
    t.hiss("highpass", 2000, 2000, 0.03, 0.5, 0);
    t.tone("triangle", 300, 120, 0.08, 0.3, 0);
    t.hiss("bandpass", 600, 400, 0.1, 0.2, 0.01);
  },
  "enemy.quadruped.charge": (t) => {
    t.thump(120, 40, 0.35, 0.9);
    t.hiss("lowpass", 600, 200, 0.3, 0.5, 0);
    t.hiss("bandpass", 300, 300, 0.2, 0.2, 0.05);
  },
  "enemy.quadruped.howl": (t) => {
    t.tone("triangle", 350, 520, 0.4, 0.14, 0, { attack: 0.12, vibrato: 0.01, vibratoHz: 6 });
    t.tone("triangle", 520, 400, 0.65, 0.14, 0.4, { attack: 0.02, release: 0.3, vibrato: 0.012, vibratoHz: 6 });
    t.hiss("bandpass", 900, 1200, 1, 0.05, 0, 3, 0.1);
  },
  "enemy.quadruped.hit": (t, p) => {
    t.material(p.material, 0, 0.8);
    t.thump(150, 70, 0.08, 0.3);
  },
  "enemy.quadruped.death": (t, p) => {
    t.material(p.material, 0, 1, true);
    t.thump(130, 45, 0.3, 0.45);
    t.mote(0.22, 0.05);
  },

  // ── Flyers (vỗ cánh, kêu cao, bổ nhào rít) ────────────────────────────────
  "enemy.flyer.spawn": (t) => {
    for (let i = 0; i < 3; i += 1) t.tone("square", 1200, 1500, 0.06, 0.04, i * 0.08, { filter: 3000 });
    t.tone("sawtooth", 190, 210, 0.3, 0.05, 0, { attack: 0.08, filter: 1500 });
  },
  "enemy.flyer.windup": (t) => {
    t.tone("sawtooth", 180, 320, 0.3, 0.08, 0, { attack: 0.05, filter: 2000 });
  },
  "enemy.flyer.attack": (t) => {
    t.tone("sine", 1600, 600, 0.25, 0.12, 0);
    t.hiss("bandpass", 2000, 800, 0.25, 0.2, 0, 3);
    t.hiss("highpass", 4000, 4000, 0.02, 0.3, 0.24);
  },
  "enemy.flyer.hit": (t, p) => {
    t.material(p.material, 0, 0.7);
  },
  "enemy.flyer.death": (t, p) => {
    t.material(p.material, 0, 0.9, true);
    t.tone("sawtooth", 300, 80, 0.6, 0.07, 0.03, { filter: 1500, filterTo: 400 });
    t.mote(0.3, 0.05);
  },

  // ── Swarm (lộp độp nhanh, rít nhỏ) ────────────────────────────────────────
  "enemy.swarm.spawn": (t) => {
    for (let i = 0; i < 6; i += 1) t.hiss("highpass", 5000, 5000, 0.006, 0.25, i * 0.035 + t.random01() * 0.01);
  },
  "enemy.swarm.attack": (t) => {
    t.hiss("highpass", 3000, 3000, 0.02, 0.4, 0);
    t.tone("triangle", 900, 500, 0.03, 0.1, 0);
  },
  "enemy.swarm.hit": (t, p) => t.material(p.material, 0, 0.6),
  "enemy.swarm.death": (t, p) => {
    t.tone("sine", 600, 200, 0.06, 0.25, 0);
    t.material(p.material, 0, 0.8, true);
    t.mote(0.08, 0.03);
  },
  "kill.chime": (t, p) => {
    const note = (p.rootHz / 2) * pentatonicRatio(p.step);
    t.tone("triangle", note, note, 0.16, 0.3, 0);
    t.tone("sine", note * 2.01, note * 2.01, 0.12, 0.1, 0.012);
  },

  // ── Warnings (P1) ─────────────────────────────────────────────────────────
  "warn.strike": (t) => {
    t.tone("triangle", 1046.5, 1000, 0.07, 0.3, 0);
    t.tone("triangle", 1396.9, 1350, 0.09, 0.3, 0.1);
    t.hiss("bandpass", 2000, 2000, 0.02, 0.2, 0, 3);
  },
  "warn.telegraph": (t) => {
    t.hiss("bandpass", 600, 3000, 0.65, 0.7, 0, 5, 0.1);
    t.tone("sawtooth", 200, 400, 0.6, 0.12, 0, { attack: 0.1, filter: 1500 });
  },

  // ── General G01 ───────────────────────────────────────────────────────────
  "general.g01.horn": (t) => t.horn(110, 2.1, 0.2),
  "general.g01.attack": (t) => {
    t.hiss("bandpass", 900, 3000, 0.22, 0.7, 0, 1.2, 0.01);
    t.thump(140, 60, 0.2, 0.5, 0.03);
  },
  "general.g01.skill": (t) => {
    t.tone("sawtooth", 180, 150, 0.4, 0.15, 0, { attack: 0.03, filter: 900 });
    t.hiss("bandpass", 700, 600, 0.35, 0.15, 0, 2, 0.03);
    t.thump(100, 40, 0.4, 0.9, 0.45);
    t.hiss("lowpass", 500, 200, 0.3, 0.4, 0.45);
    t.drum(3, 0.7, 0.75);
  },
  "general.g01.aura": (t) => {
    t.drum(3, 0.9, 0);
    t.drum(3, 0.55, 0.19);
  },
  "general.g01.death": (t) => {
    t.thump(70, 25, 0.9, 1);
    t.hiss("lowpass", 900, 150, 1, 0.6, 0);
    t.tone("sawtooth", 110, 70, 1.2, 0.08, 0.2, { attack: 0.05, filter: 800, filterTo: 200 });
    t.mote(0.6, 0.07);
    t.mote(0.75, 0.05);
  },
  "general.aura.break": (t) => {
    for (let i = 0; i < 8; i += 1) {
      const f = 2000 + t.random01() * 4000;
      t.tone("sine", f, f * 0.98, 0.05 + t.random01() * 0.15, 0.06, i * 0.025 + t.random01() * 0.02);
    }
    t.hiss("highpass", 6000, 4000, 0.3, 0.3, 0);
  },

  // ── Traps ─────────────────────────────────────────────────────────────────
  "trap.spikes.arm": (t) => {
    t.tone("triangle", 500, 350, 0.05, 0.4, 0);
    t.tone("sine", 300, 600, 0.25, 0.08, 0.06, { vibrato: 0.05, vibratoHz: 18 });
    t.hiss("bandpass", 1500, 1500, 0.04, 0.2, 0, 2);
  },
  "trap.spikes.trigger": (t) => {
    t.hiss("highpass", 3000, 1500, 0.08, 0.5, 0);
    t.tone("triangle", 800, 250, 0.1, 0.2, 0);
    t.tone("triangle", 380, 300, 0.05, 0.3, 0.05);
  },
  "trap.pine-bomb.arm": (t) => {
    t.tone("sawtooth", 90, 110, 0.3, 0.2, 0, { attack: 0.05, filter: 400 });
    t.hiss("lowpass", 600, 500, 0.4, 0.38, 0.1, 0.8, 0.15);
  },
  "trap.pine-bomb.trigger": (t, p) => {
    t.thump(90, 28, 0.7, 1);
    t.hiss("lowpass", 2500, 200, 0.9, 0.8, 0, 0.8, 0.005);
    const seeds = Math.min(8, 3 + p.count);
    for (let i = 0; i < seeds; i += 1) t.hiss("bandpass", 2000 + t.random01() * 2000, 1500, 0.025, 0.2, 0.08 + t.random01() * 0.4, 2);
  },
  "trap.net.arm": (t) => {
    for (let i = 0; i < 5; i += 1) t.tone("square", 1200, 1100, 0.012, 0.15, i * 0.08, { filter: 2500 });
    t.tone("sawtooth", 140, 160, 0.4, 0.12, 0.05, { attack: 0.05, filter: 500 });
  },
  "trap.net.trigger": (t) => {
    t.thump(150, 60, 0.15, 0.6);
    t.hiss("bandpass", 500, 500, 0.1, 0.3, 0, 1.5);
    t.hiss("bandpass", 800, 2500, 0.35, 0.3, 0.05, 2, 0.03);
    t.hiss("bandpass", 1200, 900, 0.2, 0.2, 0.4, 1);
  },

  // ── Supports ──────────────────────────────────────────────────────────────
  "unit.warden.place": (t) => {
    t.thump(110, 45, 0.3, 0.8);
    t.hiss("bandpass", 3000, 2500, 0.25, 0.2, 0.05, 0.9, 0.02);
    t.tone("sine", 82, 82, 0.5, 0.1, 0.02, { attack: 0.08 });
  },
  "unit.warden.down": (t) => {
    t.hiss("lowpass", 1500, 200, 0.8, 0.5, 0, 0.8, 0.01);
    t.thump(80, 30, 0.4, 0.6);
    t.pluck(523.25, 0.3, 0.1, 0.6);
  },
  "house.herb.place": (t) => {
    t.tone("triangle", 400, 300, 0.06, 0.3, 0);
    for (let i = 0; i < 4; i += 1) t.tone("sine", 600, 1200, 0.05, 0.08, 0.15 + i * 0.08);
    t.tone("sine", 1318.5, 1318.5, 0.3, 0.06, 0.4, { attack: 0.02 });
  },
  "house.herb.pulse": (t) => {
    [784, 988, 1174.66].forEach((f, i) => t.tone("sine", f, f, 0.7, 0.12, i * 0.05, { attack: 0.03 }));
    t.hiss("highpass", 7000, 7000, 0.6, 0.08, 0, 0.8, 0.1);
  },
  "unit.hit": (t) => {
    t.tone("triangle", 350, 250, 0.05, 0.35, 0);
    t.hiss("bandpass", 1200, 1000, 0.05, 0.2, 0, 1.5);
  },

  // ── UI ×4 ─────────────────────────────────────────────────────────────────
  "ui.select": (t) => t.tone("sine", 1400, 1300, 0.04, 0.2, 0),
  "ui.confirm": (t) => {
    t.pluck(784, 0.2, 0.25);
    t.pluck(1174.66, 0.22, 0.22, 0.06);
  },
  "ui.deny": (t) => {
    t.tone("triangle", 300, 260, 0.08, 0.3, 0);
    t.tone("triangle", 280, 240, 0.09, 0.25, 0.1);
  },
  "ui.gold": (t) => {
    t.tone("sine", 1975.5, 1975.5, 0.08, 0.25, 0);
    t.tone("sine", 2637, 2637, 0.15, 0.25, 0.05);
    t.tone("sine", 2349.3, 2349.3, 0.18, 0.2, 0.12);
    t.hiss("highpass", 6000, 6000, 0.05, 0.25, 0);
  },

  // ── Stingers ──────────────────────────────────────────────────────────────
  "wave.horn": (t) => {
    t.horn(73.42, 2, 0.12);
    t.horn(110, 1.8, 0.06, 0.15);
    t.drum(3, 0.9, 0);
  },
  "wave.clear": (t) => {
    [62, 65, 67, 69, 72, 74, 77, 81].forEach((midi, i) => t.pluck(440 * 2 ** ((midi - 69) / 12), 0.6, 0.18, i * 0.075));
  },
  "stinger.victory": (t) => {
    t.drum(3, 0.8, 0);
    t.drum(2, 0.6, 0.36);
    t.drum(3, 0.9, 0.72);
    [74, 77, 81, 86].forEach((midi, i) => t.flute(440 * 2 ** ((midi - 69) / 12), i === 3 ? 1.8 : 0.36, 0.14, i * 0.36));
    [50, 57, 62, 65, 69].forEach((midi, i) => t.pluck(440 * 2 ** ((midi - 69) / 12), 1.6, 0.14, 1.08 + i * 0.05));
  },
  "stinger.defeat": (t) => {
    t.drum(3, 0.7, 0);
    t.drum(3, 0.5, 1.4);
    [69, 67, 65, 62].forEach((midi, i) => t.flute(440 * 2 ** ((midi - 69) / 12), i === 3 ? 1.6 : 0.6, 0.13, i * 0.62));
    for (const midi of [38, 45, 50]) t.tone("triangle", 440 * 2 ** ((midi - 69) / 12), 440 * 2 ** ((midi - 69) / 12), 3.3, 0.05, 0.2, { attack: 0.6, release: 1.2, filter: 600 });
  },

  // ── Learning (never ducked) ───────────────────────────────────────────────
  "learn.new": (t) => {
    t.tone("sine", 1046.5, 1046.5, 0.6, 0.14, 0, { attack: 0.005 });
    t.tone("sine", 1568, 1568, 0.5, 0.1, 0.08, { attack: 0.005 });
    t.tone("sine", 2093, 2093, 0.3, 0.03, 0.08);
  },
  "learn.right": (t) => {
    t.pluck(880, 0.3, 0.22);
    t.pluck(1174.66, 0.35, 0.2, 0.07);
  },
  "learn.wrong": (t) => {
    t.tone("triangle", 392, 349.2, 0.3, 0.14, 0, { attack: 0.01, filter: 1400 });
  },

  // ── Ambience one-shots ────────────────────────────────────────────────────
  "amb.bird": (t) => {
    const base = 2600 + t.random01() * 900;
    for (let i = 0; i < 3; i += 1) t.tone("sine", base, base * 1.3, 0.06, 0.25, i * 0.09 + t.random01() * 0.02, { attack: 0.005 });
  },
};
