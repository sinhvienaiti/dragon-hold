/**
 * The Web Audio graph (05 §7): eleven buses → master → limiter (−3 dB, ratio
 * 20, 2 ms attack) → a soft clip guard (never past 0.96) → speakers. Each bus
 * is level (settings × bus gain) → duck → pause low-pass → master, with a send
 * to one shared forest reverb made in code (0.9 s pine forest). The dragon bus
 * goes through the kit's voice bus (drive and compression for fire and roars).
 * Works on any BaseAudioContext, so the dev harness can render it offline.
 * Owner: audio (LANES.md).
 */
import { voiceBus } from "../kit/audio";
import { CHILD_BUSES, type ChildBus } from "./catalog";
import { PAUSE_CUTOFF_HZ, PAUSE_FILTERED, PAUSE_SFX_DB, dbToGain, volumeFor, type AudioMix, type AudioVolumes } from "./mix";

/** 05 §7 master limiter. */
export const LIMITER = { thresholdDb: -3, ratio: 20, attackS: 0.002, releaseS: 0.12, kneeDb: 0 } as const;
/** Soft clip: linear to 0.8, then bends to at most this. */
export const GUARD_CEILING = 0.96;
/** Reverb (pine forest, 05 §7) and how much of each bus goes to it. */
export const REVERB_S = 0.9;
const REVERB_SEND: Readonly<Record<ChildBus, number>> = {
  music: 0.18,
  ui: 0,
  typing: 0,
  dragon: 0.1,
  world: 0.12,
  enemies: 0.14,
  traps: 0.12,
  units: 0.12,
  ambience: 0,
  voice: 0.08,
  stingers: 0.16,
  learning: 0.04,
};
const REVERB_RETURN = 0.4;

interface BusNodes {
  readonly input: AudioNode;
  readonly level: GainNode;
  readonly duck: GainNode;
  readonly filter: BiquadFilterNode | null;
  duckValue: number;
}

export interface MixerOptions {
  readonly destination?: AudioNode;
  /** Tap an analyser after the guard (dev harness, stats). */
  readonly meter?: boolean;
}

export class Mixer {
  readonly master: GainNode;
  readonly limiter: DynamicsCompressorNode;
  readonly guard: WaveShaperNode;
  readonly meter: AnalyserNode | null;
  private readonly buses = new Map<ChildBus, BusNodes>();
  private volumes: AudioVolumes;
  private muted = false;
  private paused = false;
  private readonly reverb: ConvolverNode;

  constructor(
    readonly ctx: BaseAudioContext,
    readonly mix: AudioMix,
    volumes: AudioVolumes,
    options: MixerOptions = {},
  ) {
    this.volumes = volumes;
    this.master = ctx.createGain();
    this.master.gain.value = volumes.master;
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = LIMITER.thresholdDb;
    this.limiter.knee.value = LIMITER.kneeDb;
    this.limiter.ratio.value = LIMITER.ratio;
    this.limiter.attack.value = LIMITER.attackS;
    this.limiter.release.value = LIMITER.releaseS;
    this.guard = ctx.createWaveShaper();
    this.guard.curve = guardCurve();
    this.master.connect(this.limiter).connect(this.guard).connect(options.destination ?? ctx.destination);
    this.meter = options.meter ? ctx.createAnalyser() : null;
    if (this.meter) {
      this.meter.fftSize = 2048;
      this.guard.connect(this.meter);
    }

    this.reverb = ctx.createConvolver();
    this.reverb.buffer = forestImpulse(ctx, REVERB_S);
    const reverbReturn = ctx.createGain();
    reverbReturn.gain.value = REVERB_RETURN;
    this.reverb.connect(reverbReturn).connect(this.master);

    for (const bus of CHILD_BUSES) {
      const level = ctx.createGain();
      level.gain.value = this.levelOf(bus);
      const duck = ctx.createGain();
      duck.gain.value = 1;
      let tail: AudioNode = duck;
      let filter: BiquadFilterNode | null = null;
      if (PAUSE_FILTERED.has(bus)) {
        filter = ctx.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.value = 20_000;
        filter.Q.value = 0.5;
        duck.connect(filter);
        tail = filter;
      }
      level.connect(duck);
      tail.connect(this.master);
      if (REVERB_SEND[bus] > 0) {
        const send = ctx.createGain();
        send.gain.value = REVERB_SEND[bus];
        tail.connect(send).connect(this.reverb);
      }
      // Dragon sounds go through the kit's voice bus (drive, compression) into the level.
      const input = bus === "dragon" ? voiceBus(ctx, level) : level;
      this.buses.set(bus, { input, level, duck, filter, duckValue: 1 });
    }
  }

  /** Where a sound on `bus` connects. */
  input(bus: ChildBus): AudioNode {
    return this.buses.get(bus)!.input;
  }

  /** Current duck factor of a bus (what the last ramp heads to). */
  duckOf(bus: ChildBus): number {
    return this.buses.get(bus)!.duckValue;
  }

  /** The bus's level right now (settings × bus gain × pause), for checks. */
  levelOf(bus: ChildBus): number {
    const pause = this.paused && bus !== "music" && bus !== "learning" && bus !== "ui" ? dbToGain(PAUSE_SFX_DB) : 1;
    return this.mix.level(bus) * volumeFor(bus, this.volumes) * pause;
  }

  setDuck(bus: ChildBus, factor: number, rampS: number): void {
    const nodes = this.buses.get(bus)!;
    if (Math.abs(nodes.duckValue - factor) < 1e-4) return;
    nodes.duckValue = factor;
    ramp(nodes.duck.gain, factor, this.ctx.currentTime, rampS);
  }

  setVolumes(volumes: AudioVolumes): void {
    this.volumes = volumes;
    this.refreshLevels(0.05);
    ramp(this.master.gain, this.muted ? 0 : volumes.master, this.ctx.currentTime, 0.05);
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    ramp(this.master.gain, muted ? 0 : this.volumes.master, this.ctx.currentTime, 0.06);
  }

  /** Paused: world and music through an 800 Hz low-pass, effects down (05 §7.2, 06 §2). */
  setPaused(paused: boolean): void {
    if (this.paused === paused) return;
    this.paused = paused;
    const now = this.ctx.currentTime;
    for (const nodes of this.buses.values()) {
      if (nodes.filter) nodes.filter.frequency.setTargetAtTime(paused ? PAUSE_CUTOFF_HZ : 20_000, now, 0.08);
    }
    this.refreshLevels(0.15);
  }

  private refreshLevels(rampS: number): void {
    const now = this.ctx.currentTime;
    for (const [bus, nodes] of this.buses) ramp(nodes.level.gain, this.levelOf(bus), now, rampS);
  }

  /** Peak |sample| of the last analyser window (0 without a meter). */
  peak(): number {
    if (!this.meter) return 0;
    const data = new Float32Array(this.meter.fftSize);
    this.meter.getFloatTimeDomainData(data);
    let peak = 0;
    for (const value of data) peak = Math.max(peak, Math.abs(value));
    return peak;
  }

  dispose(): void {
    this.master.disconnect();
    this.guard.disconnect();
  }
}

/** Smooth move of a param to `value` over about `rampS`. */
export function ramp(param: AudioParam, value: number, now: number, rampS: number): void {
  param.cancelScheduledValues(now);
  param.setValueAtTime(param.value, now);
  param.setTargetAtTime(value, now, Math.max(0.005, rampS / 3));
}

/** Linear up to 0.8, then a tanh knee that never passes GUARD_CEILING. */
export function guardCurve(points = 2048): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(points);
  const knee = 0.8;
  const room = GUARD_CEILING - knee;
  for (let i = 0; i < points; i += 1) {
    const x = (i / (points - 1)) * 2 - 1;
    const a = Math.abs(x);
    const y = a <= knee ? a : knee + room * Math.tanh((a - knee) / room);
    curve[i] = Math.sign(x) * y;
  }
  return curve;
}

/** A stereo forest impulse: decaying noise, darker as it fades (−60 dB at `seconds`). */
export function forestImpulse(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const length = Math.floor(seconds * ctx.sampleRate);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  let seed = 7;
  const rand = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let channel = 0; channel < 2; channel += 1) {
    const data = buffer.getChannelData(channel);
    let low = 0;
    for (let i = 0; i < length; i += 1) {
      const t = i / length;
      const decay = Math.exp(-6.9 * t);
      // The low-pass closes as the tail goes: leaves eat the highs.
      const a = 0.9 - 0.75 * t;
      low += a * (rand() * 2 - 1 - low);
      data[i] = low * decay * (i < 64 ? i / 64 : 1);
    }
  }
  return buffer;
}
