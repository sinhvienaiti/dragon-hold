/**
 * Looping beds made in code: the pine forest's wind, the river, and one
 * crowd loop per class (05 §7.1: past a few foes of a class, steps become a
 * herd loop instead of one sound each). Each is a few seconds of samples
 * written once into an AudioBuffer from a seeded generator, its end blended
 * into its start so the loop has no click.
 * Owner: audio (LANES.md).
 */
import type { SoundId } from "./catalog";

export type BedId = Extract<SoundId, "amb.forest" | "amb.river" | "enemy.biped.march" | "enemy.quadruped.march" | "enemy.flyer.march" | "enemy.swarm.march">;
export const BED_IDS: readonly BedId[] = ["amb.forest", "amb.river", "enemy.biped.march", "enemy.quadruped.march", "enemy.flyer.march", "enemy.swarm.march"];

const BLEND_S = 0.12;

function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/** One-pole low-pass coefficient for `hz`. */
const pole = (hz: number, rate: number): number => 1 - Math.exp((-2 * Math.PI * hz) / rate);

/** Adds a short percussive grain at `at` (samples): filtered noise and an optional low sine. */
function grain(data: Float32Array, rate: number, rand: () => number, at: number, ms: number, gain: number, cutoff: number, lowHz: number, high = false): void {
  const length = Math.floor((ms / 1000) * rate);
  const a = pole(cutoff, rate);
  let lp = 0;
  for (let i = 0; i < length && at + i < data.length; i += 1) {
    const env = Math.exp((-5 * i) / length);
    const white = rand() * 2 - 1;
    lp += a * (white - lp);
    const noise = high ? white - lp : lp;
    const sine = lowHz > 0 ? Math.sin((2 * Math.PI * lowHz * i) / rate) * 0.8 : 0;
    data[at + i]! += (noise + sine) * env * gain;
  }
}

type Writer = (data: Float32Array, rate: number, rand: () => number, seconds: number) => void;

const WRITERS: Readonly<Record<BedId, { seconds: number; seed: number; write: Writer }>> = {
  "amb.forest": {
    seconds: 6,
    seed: 11,
    write: (data, rate, rand, seconds) => {
      const a1 = pole(420, rate);
      const a2 = pole(2600, rate);
      let low = 0;
      let mid = 0;
      for (let i = 0; i < data.length; i += 1) {
        const t = i / rate;
        // Gusts with whole cycles over the loop so the swell repeats cleanly.
        const gust = 0.55 + 0.3 * Math.sin((2 * Math.PI * 1 * t) / seconds) + 0.15 * Math.sin((2 * Math.PI * 3 * t) / seconds + 1.3);
        const white = rand() * 2 - 1;
        low += a1 * (white - low);
        mid += a2 * (white - mid);
        // Low roar of the canopy and a thin needle hiss on top.
        data[i] = (low * 2.2 + (mid - low) * 0.12 * gust) * gust;
      }
    },
  },
  "amb.river": {
    seconds: 5,
    seed: 23,
    write: (data, rate, rand) => {
      const a1 = pole(1300, rate);
      const a2 = pole(220, rate);
      let l1 = 0;
      let l2 = 0;
      for (let i = 0; i < data.length; i += 1) {
        const white = rand() * 2 - 1;
        l1 += a1 * (white - l1);
        l2 += a2 * (white - l2);
        data[i] = (l1 - l2) * 0.9;
      }
      // Bubbles: short rising blips.
      const bubbles = Math.floor((data.length / rate) * 9);
      for (let b = 0; b < bubbles; b += 1) {
        const at = Math.floor(rand() * data.length);
        const f0 = 500 + rand() * 900;
        const length = Math.floor((0.02 + rand() * 0.025) * rate);
        let phase = 0;
        for (let i = 0; i < length && at + i < data.length; i += 1) {
          const f = f0 * (1 + (0.35 * i) / length);
          phase += (2 * Math.PI * f) / rate;
          data[at + i]! += Math.sin(phase) * Math.sin((Math.PI * i) / length) * 0.08;
        }
      }
    },
  },
  "enemy.biped.march": {
    seconds: 4,
    seed: 37,
    write: (data, rate, rand) => {
      // About six walkers: soft footfalls, a light armour clink now and then.
      for (let t = 0; t < data.length / rate; t += 0.14 + rand() * 0.06) {
        grain(data, rate, rand, Math.floor(t * rate), 55, 0.7 + rand() * 0.3, 450, 70 + rand() * 20);
        if (rand() < 0.18) grain(data, rate, rand, Math.floor((t + 0.02) * rate), 12, 0.25, 5000, 0, true);
      }
    },
  },
  "enemy.quadruped.march": {
    seconds: 4,
    seed: 41,
    write: (data, rate, rand) => {
      // Gallop triplets: three quick pads, a gap.
      for (let t = 0; t < data.length / rate; t += 0.3 + rand() * 0.05) {
        for (let k = 0; k < 3; k += 1) grain(data, rate, rand, Math.floor((t + k * 0.055) * rate), 40, 0.55 + rand() * 0.25, 600, 90 + rand() * 30);
      }
    },
  },
  "enemy.flyer.march": {
    seconds: 4,
    seed: 53,
    write: (data, rate, rand) => {
      // Wing buzz: two voices and a 28 Hz tremolo, all whole cycles over the 4 s loop.
      for (let i = 0; i < data.length; i += 1) {
        const t = i / rate;
        const tremolo = 0.6 + 0.4 * Math.sin(2 * Math.PI * 28 * t);
        let s = 0;
        for (const [f, a] of [[170, 0.5], [340, 0.25], [510, 0.12], [230, 0.35], [460, 0.15]] as const) s += Math.sin(2 * Math.PI * f * t) * a;
        data[i] = s * tremolo * 0.6 + (rand() * 2 - 1) * 0.04;
      }
    },
  },
  "enemy.swarm.march": {
    seconds: 4,
    seed: 67,
    write: (data, rate, rand) => {
      // Dense chitin skitter.
      for (let t = 0; t < data.length / rate; t += 0.012 + rand() * 0.03) grain(data, rate, rand, Math.floor(t * rate), 3 + rand() * 3, 0.5 + rand() * 0.5, 3000, 0, true);
    },
  },
};

/** The bed's samples (mono), normalised to a 0.5 peak and blended at the seam. */
export function bedSamples(id: BedId, rate: number): Float32Array<ArrayBuffer> {
  const spec = WRITERS[id];
  const length = Math.floor(spec.seconds * rate);
  const blend = Math.floor(BLEND_S * rate);
  const raw = new Float32Array(length + blend);
  spec.write(raw, rate, lcg(spec.seed), spec.seconds);
  const out = raw.slice(0, length);
  // The loop jumps from length − 1 back to 0: start as the generator's continuation and fade into its own start.
  for (let i = 0; i < blend; i += 1) {
    const w = i / blend;
    out[i] = raw[i]! * w + raw[length + i]! * (1 - w);
  }
  let peak = 0;
  for (const value of out) peak = Math.max(peak, Math.abs(value));
  if (peak > 0) for (let i = 0; i < out.length; i += 1) out[i] = (out[i]! / peak) * 0.5;
  return out;
}

const cache = new WeakMap<BaseAudioContext, Map<BedId, AudioBuffer>>();

export const isBed = (id: SoundId): id is BedId => (BED_IDS as readonly string[]).includes(id);

/** The bed as an AudioBuffer for `ctx` (made once per context). */
export function bedBuffer(ctx: BaseAudioContext, id: BedId): AudioBuffer {
  let byId = cache.get(ctx);
  if (!byId) {
    byId = new Map();
    cache.set(ctx, byId);
  }
  const known = byId.get(id);
  if (known) return known;
  const samples = bedSamples(id, ctx.sampleRate);
  const buffer = ctx.createBuffer(1, samples.length, ctx.sampleRate);
  buffer.copyToChannel(samples, 0);
  byId.set(id, buffer);
  return buffer;
}
