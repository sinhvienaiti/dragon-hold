/**
 * Procedural music (05 §7.2): one song, four layers on one clock. M0a plays
 * Rừng (pad, harp plucks, wooden flute) and Đợt (frame drum, cello ostinato)
 * from synth.ts instruments; Dồn and the general's motif sound only when the
 * owner's files exist (bank.music), and any file layer replaces its synth.
 * Notes are scheduled a little ahead of the audio clock each frame; layer
 * changes wait for the next bar and fade over 2 s.
 * Owner: audio (LANES.md).
 */
import type { SoundBank } from "./bank";
import { FOREST_SONG, LAYER_FADE_S, MUSIC_LAYERS, barSeconds, harpMidi, midiHz, stepSeconds, stepsPerBar, type MusicLayer, type MusicTargets, type Song } from "./music-plan";
import { SynthTools } from "./synth";

/** How far ahead notes are scheduled (s). */
const LOOKAHEAD_S = 0.3;
/** Layer mix inside the music bus. */
const LAYER_GAIN: Readonly<Record<MusicLayer, number>> = { forest: 0.9, wave: 0.85, surge: 0.8, general: 0.7 };

interface LayerState {
  readonly gain: GainNode;
  /** Where it is heading and where it will be once the fade ends. */
  target: number;
  pending: number;
  file: AudioBufferSourceNode | null;
}

export class MusicDirector {
  private readonly layers: Record<MusicLayer, LayerState>;
  private start = 0;
  private step = 0;
  private nextStepTime = 0;
  private running = false;
  private intensity = 0;
  /** When the last bar line turned every layer to 0 (−1: some layer plays). */
  private quietAt = -1;
  private readonly noise: AudioBuffer;

  constructor(
    readonly ctx: BaseAudioContext,
    readonly out: AudioNode,
    readonly bank: SoundBank,
    noise: AudioBuffer,
    readonly song: Song = FOREST_SONG,
    private readonly random: () => number = Math.random,
  ) {
    this.noise = noise;
    const layers = {} as Record<MusicLayer, LayerState>;
    for (const layer of MUSIC_LAYERS) {
      const gain = ctx.createGain();
      gain.gain.value = 0;
      gain.connect(out);
      layers[layer] = { gain, target: 0, pending: 0, file: null };
    }
    this.layers = layers;
  }

  /** Root of the chimes that should sit in the music's key (word and kill notes). */
  get rootHz(): number {
    return this.song.chimeRootHz;
  }

  /** Layer levels the music heads for (after their bar), for checks. */
  levels(): Readonly<Record<MusicLayer, number>> {
    return { forest: this.layers.forest.target, wave: this.layers.wave.target, surge: this.layers.surge.target, general: this.layers.general.target };
  }

  /** Call once a frame with the audio clock and the run's targets. */
  update(now: number, targets: MusicTargets): void {
    this.intensity = targets.intensity;
    for (const layer of MUSIC_LAYERS) this.layers[layer].pending = targets.layers[layer];
    const wanted = MUSIC_LAYERS.some((layer) => targets.layers[layer] > 0);
    if (!this.running) {
      if (!wanted) return;
      this.running = true;
      this.start = now + 0.1;
      this.step = 0;
      this.nextStepTime = this.start;
      this.quietAt = -1;
    }
    // Back from a hidden tab: skip what was missed instead of a burst of notes.
    const stepS = stepSeconds(this.song);
    if (this.nextStepTime < now - 0.1) {
      const skip = Math.ceil((now - this.nextStepTime) / stepS);
      this.step += skip;
      this.nextStepTime += skip * stepS;
    }
    while (this.nextStepTime < now + LOOKAHEAD_S) {
      this.schedule(this.step, this.nextStepTime);
      this.step += 1;
      this.nextStepTime = this.start + this.step * stepS;
    }
    if (!wanted && this.quietAt >= 0 && now > this.quietAt + LAYER_FADE_S) this.halt();
  }

  /** Fades every layer out now (victory, defeat, leaving the stage). */
  stop(fadeS = 1.5): void {
    const now = this.ctx.currentTime;
    for (const layer of MUSIC_LAYERS) {
      const state = this.layers[layer];
      state.target = 0;
      state.pending = 0;
      state.gain.gain.cancelScheduledValues(now);
      state.gain.gain.setValueAtTime(state.gain.gain.value, now);
      state.gain.gain.linearRampToValueAtTime(0, now + fadeS);
    }
    this.halt(now + fadeS);
  }

  dispose(): void {
    this.halt();
    for (const layer of MUSIC_LAYERS) this.layers[layer].gain.disconnect();
  }

  private halt(at = this.ctx.currentTime): void {
    this.running = false;
    for (const layer of MUSIC_LAYERS) {
      const state = this.layers[layer];
      if (state.file) {
        state.file.stop(at + 0.05);
        state.file = null;
      }
    }
  }

  private audible(layer: MusicLayer): boolean {
    const state = this.layers[layer];
    return state.target > 0 || state.pending > 0;
  }

  private schedule(step: number, time: number): void {
    const song = this.song;
    const per = stepsPerBar(song);
    const pos = step % per;
    const barIndex = Math.floor(step / per);
    const bar = barIndex % song.bars;
    if (pos === 0) this.barLine(barIndex, time);
    const chord = song.chords[bar]!;
    const stepS = stepSeconds(song);

    if (this.audible("forest") && !this.layers.forest.file) {
      const tools = new SynthTools(this.ctx, this.layers.forest.gain, this.noise, time, 1, this.random);
      if (pos === 0) {
        for (const midi of chord) tools.tone("triangle", midiHz(midi), midiHz(midi), barSeconds(song) + 0.5, 0.12, 0, { attack: 0.7, release: 0.9, filter: 900 });
      }
      if (pos % 2 === 0) {
        const pattern = song.harp[bar % song.harp.length]!;
        const eighth = pos / 2;
        // Odd bars breathe: two plucks left out.
        if (!(bar % 2 === 1 && (eighth === 3 || eighth === 7))) tools.pluck(midiHz(harpMidi(chord, pattern[eighth]!)), 0.9, 0.2 + (eighth === 0 ? 0.06 : 0));
      }
      for (const note of song.melody) if (note.bar === bar && note.step === pos) tools.flute(midiHz(note.midi), note.steps * stepS, 0.2);
    }

    if (this.audible("wave") && !this.layers.wave.file) {
      const tools = new SynthTools(this.ctx, this.layers.wave.gain, this.noise, time, 1, this.random);
      const pattern = song.drum[this.intensity > 0.7 ? 1 : 0];
      const kind = pattern[pos] ?? 0;
      if (kind > 0) tools.drum(kind, kind === 1 ? 0.6 : kind === 2 ? 0.85 : 1);
      if (pos % 2 === 0) {
        const degree = song.cello[pos / 2] ?? -1;
        if (degree >= 0) {
          const root = chord[0]! - 12;
          const midi = degree === 0 ? root : degree === 1 ? root + 7 : root + 12;
          tools.tone("sawtooth", midiHz(midi), midiHz(midi), stepS * 1.7, 0.14, 0, { attack: 0.012, filter: 650, filterTo: 380, q: 1.1 });
        }
      }
    }
  }

  /** Bar line: layer changes start here and fade over LAYER_FADE_S; file layers start in step with the clock. */
  private barLine(barIndex: number, time: number): void {
    for (const layer of MUSIC_LAYERS) {
      const state = this.layers[layer];
      const file = this.bank.music(layer);
      if (file && !state.file) {
        const source = this.ctx.createBufferSource();
        source.buffer = file;
        source.loop = true;
        source.connect(state.gain);
        source.start(time, (barIndex * barSeconds(this.song)) % file.duration);
        state.file = source;
      }
      // A synth-only layer with no file stays silent (Dồn and the general's motif in M0a).
      const playable = file !== null || layer === "forest" || layer === "wave";
      const target = playable ? state.pending * LAYER_GAIN[layer] : 0;
      if (Math.abs(target - state.target) < 1e-4) continue;
      const param = state.gain.gain;
      param.cancelScheduledValues(time);
      param.setValueAtTime(state.target, time);
      param.linearRampToValueAtTime(target, time + LAYER_FADE_S);
      state.target = target;
    }
    const quiet = MUSIC_LAYERS.every((layer) => this.layers[layer].target === 0);
    if (!quiet) this.quietAt = -1;
    else if (this.quietAt < 0) this.quietAt = time;
  }
}
