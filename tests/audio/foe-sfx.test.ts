import { describe, expect, it } from "vitest";
import type { SoundBank } from "../../src/audio/bank";
import { FOE_SFX_IDS, FOE_SFX_SLOTS, foeSfx } from "../../src/audio/catalog";
import { AudioEngine } from "../../src/audio/engine";
import type { Mixer } from "../../src/audio/mixer";
import { ENEMIES } from "../../src/content/data/enemies";
import { GENERALS } from "../../src/content/data/generals";

function fakeMixer(): Mixer {
  const node = () => ({ connect: (next: unknown) => next, disconnect: () => undefined });
  const param = () => ({ value: 1, cancelScheduledValues: () => undefined, setValueAtTime: () => undefined, linearRampToValueAtTime: () => undefined });
  const ctx = { currentTime: 0, createGain: () => ({ ...node(), gain: param() }), createStereoPanner: () => ({ ...node(), pan: param() }) };
  return { ctx, input: () => node() } as unknown as Mixer;
}

describe("per-foe sound ids (VFX step 3: ids only, no files, no synth)", () => {
  it("gives every foe an id for spawn, move, attack, hit and death, the content's own for the last three", () => {
    for (const [id, def] of Object.entries(ENEMIES)) {
      const ids = foeSfx(id)!;
      expect(ids.spawn).toBe("enemy." + id + ".spawn");
      expect(ids.move).toBe("enemy." + id + ".move");
      expect([ids.attack, ids.hit, ids.death]).toEqual([def.show.sounds.attack, def.show.sounds.hit, def.show.sounds.death]);
    }
    for (const [id, def] of Object.entries(GENERALS)) {
      const ids = foeSfx(id)!;
      expect(ids.spawn).toBe("general." + id + ".spawn");
      expect(ids.death).toBe(def.show.sounds.death);
    }
    const count = (Object.keys(ENEMIES).length + Object.keys(GENERALS).length) * FOE_SFX_SLOTS.length;
    expect(FOE_SFX_IDS.size).toBe(count);
    expect(foeSfx("no-such-foe")).toBeNull();
  });

  it("plays a foe's own file in its class sound's place once loaded, the class sound until then, and nothing made in code", () => {
    const played: string[] = [];
    const files = new Set<string>();
    const bank: SoundBank = {
      name: "fake",
      has: () => true,
      play: (_ctx, id) => (played.push(id), 0.3),
      loop: () => null,
      music: () => null,
      hasFoe: (id) => files.has(id),
      playFoe: (_ctx, id) => (played.push(id), 0.3),
    };
    const engine = new AudioEngine(fakeMixer(), bank, {}, () => 0.5);
    const own = foeSfx("moss-grunt")!;
    expect(engine.play({ id: "enemy.biped.spawn", file: own.spawn }, 0)).toBe(true);
    // A moment the class sets had no sound for (a word hit's foe voice) stays silent without its file.
    expect(engine.play({ id: "enemy.biped.hit", file: own.hit, fileOnly: true }, 1)).toBe(false);
    files.add(own.spawn).add(own.hit);
    expect(engine.play({ id: "enemy.biped.spawn", file: own.spawn }, 2)).toBe(true);
    expect(engine.play({ id: "enemy.biped.hit", file: own.hit, fileOnly: true }, 3)).toBe(true);
    expect(played).toEqual(["enemy.biped.spawn", own.spawn, own.hit]);
  });
});
