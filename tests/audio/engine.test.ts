import { describe, expect, it } from "vitest";
import { synthSeconds, type SoundBank } from "../../src/audio/bank";
import { SOUNDS, SOUND_IDS } from "../../src/audio/catalog";
import { AudioEngine } from "../../src/audio/engine";
import type { Mixer } from "../../src/audio/mixer";

// The smallest Web Audio stand-in the engine touches: gain and panner nodes that connect.
function fakeMixer(): Mixer {
  const node = () => ({ connect: (next: unknown) => next, disconnect: () => undefined });
  const param = () => ({ value: 1, cancelScheduledValues: () => undefined, setValueAtTime: () => undefined, linearRampToValueAtTime: () => undefined });
  const ctx = {
    currentTime: 0,
    createGain: () => ({ ...node(), gain: param() }),
    createStereoPanner: () => ({ ...node(), pan: param() }),
  };
  return { ctx, input: () => node() } as unknown as Mixer;
}

const bank = (seconds: number): SoundBank => ({ name: "fake", has: () => true, play: () => seconds, loop: () => null, music: () => null });

describe("audio engine and the voice table", () => {
  it("holds a voice for what the bank plays, not the catalog's file target", () => {
    // fire.cast: the real file is 750 ms (Q6), the synth placeholder 340 ms.
    expect(SOUNDS["fire.cast"].lengthMs).toBe(750);
    const engine = new AudioEngine(fakeMixer(), bank(synthSeconds("fire.cast")), {}, () => 0.5);
    expect(engine.play({ id: "fire.cast" }, 0)).toBe(true);
    // vary: rate 1.0, start +6 ms, so the voice ends at 0.346 s.
    expect(engine.limiter.active(0.3)).toBe(1);
    expect(engine.limiter.active(0.36)).toBe(0);
  });

  it("holds a longer file to its own end", () => {
    const engine = new AudioEngine(fakeMixer(), bank(0.9), {}, () => 0.5);
    expect(engine.play({ id: "fire.cast" }, 0)).toBe(true);
    expect(engine.limiter.active(0.85)).toBe(1);
    expect(engine.limiter.active(0.95)).toBe(0);
  });

  it("gives a synth length only where the file target grew past the placeholder", () => {
    const longer = SOUND_IDS.filter((id) => SOUNDS[id].synthMs !== undefined);
    expect(longer.sort()).toEqual(
      ["dragon.hurt", "dragon.inferno", "dragon.skyfire.impact", "fire.cast", "fire.impact.a", "fire.impact.b", "fire.impact.c", "general.g01.attack", "impact.multi"].sort(),
    );
    for (const id of SOUND_IDS) {
      const def = SOUNDS[id];
      if (def.synthMs !== undefined) expect(def.synthMs, id).toBeLessThan(def.lengthMs);
      expect(synthSeconds(id), id).toBe((def.synthMs ?? def.lengthMs) / 1000);
    }
  });
});
