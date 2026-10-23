import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { BED_IDS, bedSamples, isBed } from "../../src/audio/beds";
import { AUDIO_BASE, BUSES, CLASS_SETS, GENERAL_SETS, SOUNDS, SOUND_IDS, foeVoice } from "../../src/audio/catalog";
import { SYNTH_RECIPES } from "../../src/audio/synth";
import { ENEMY_IDS } from "../../src/content/data/enemies";
import { GENERAL_IDS } from "../../src/content/data/generals";

const DOC = readFileSync(resolve(__dirname, "../../docs/audio/M0_SOUND_LIST.md"), "utf8");

describe("audio catalog", () => {
  it("puts every sound on one of the 11 child buses", () => {
    for (const id of SOUND_IDS) {
      expect(BUSES).toContain(SOUNDS[id].bus);
      expect(SOUNDS[id].bus).not.toBe("master");
    }
  });

  it("has a synth for every one-shot and a generated bed for every loop (M0a: no files)", () => {
    for (const id of SOUND_IDS) {
      if ("loop" in SOUNDS[id]) expect(isBed(id), id).toBe(true);
      else expect(SYNTH_RECIPES[id], id).toBeTypeOf("function");
    }
    for (const id of Object.keys(SYNTH_RECIPES)) expect(SOUND_IDS).toContain(id);
    for (const id of BED_IDS) expect("loop" in SOUNDS[id]).toBe(true);
  });

  it("covers the M0 sound list (DESIGN.md §7.2)", () => {
    const need = [
      "type.key", "type.miss", "type.word",
      "fire.cast", "fire.impact.a", "fire.impact.b", "fire.impact.c", "dragon.breath", "dragon.hurt", "dragon.down",
      "general.g01.horn",
      "trap.spikes.arm", "trap.spikes.trigger", "trap.pine-bomb.arm", "trap.pine-bomb.trigger", "trap.net.arm", "trap.net.trigger",
      "unit.warden.place", "unit.warden.down", "house.herb.place", "house.herb.pulse",
      "ui.select", "ui.confirm", "ui.deny", "ui.gold",
      "wave.horn", "stinger.victory", "stinger.defeat",
    ];
    for (const id of need) expect(SOUND_IDS).toContain(id);
    expect(Object.keys(CLASS_SETS).sort()).toEqual(["biped", "flyer", "quadruped", "swarm"]);
  });

  it("gives every M0 foe a voice and every general its own set", () => {
    for (const id of [...ENEMY_IDS, ...GENERAL_IDS]) expect(foeVoice(id), id).not.toBeNull();
    for (const id of GENERAL_IDS) expect(GENERAL_SETS[id], id).toBeDefined();
    expect(foeVoice("thorn-ant")!.cls).toBe("swarm");
    expect(foeVoice("thorn-wasp")!.cls).toBe("flyer");
    expect(foeVoice("moss-banner")!.general).toBe(true);
  });

  it("keeps learning sounds P0 and warnings P1", () => {
    for (const id of SOUND_IDS) {
      if (SOUNDS[id].bus === "learning") expect(SOUNDS[id].priority).toBe(0);
      if (id.startsWith("warn.")) expect(SOUNDS[id].priority).toBe(1);
      if (id.startsWith("type.") || id.startsWith("ui.")) expect(SOUNDS[id].priority).toBe(2);
    }
  });

  it("names a unique future file under the dragon-hold audio base", () => {
    expect(AUDIO_BASE).toBe("/assets/dragon-hold/audio/");
    const files = SOUND_IDS.map((id) => SOUNDS[id].file);
    expect(new Set(files).size).toBe(files.length);
    for (const file of files) expect(file).toMatch(/^(sfx|ambience)\/[a-z0-9/-]+$/);
  });

  it("is described, id by id, in docs/audio/M0_SOUND_LIST.md", () => {
    const missing = SOUND_IDS.filter((id) => !DOC.includes("`" + id + "`"));
    expect(missing).toEqual([]);
  });
});

describe("audio beds", () => {
  it("loops without a click and peaks at 0.5", () => {
    const rate = 22_050;
    for (const id of BED_IDS) {
      const data = bedSamples(id, rate);
      let peak = 0;
      let step = 0;
      for (let i = 1; i < data.length; i += 1) {
        peak = Math.max(peak, Math.abs(data[i]!));
        step = Math.max(step, Math.abs(data[i]! - data[i - 1]!));
      }
      expect(peak, id).toBeCloseTo(0.5, 3);
      // The wrap from the last sample to the first is no bigger than the largest step inside.
      expect(Math.abs(data[0]! - data[data.length - 1]!), id).toBeLessThanOrEqual(step + 1e-6);
    }
  });

  it("is the same every time (seeded)", () => {
    expect(bedSamples("amb.river", 8000)).toEqual(bedSamples("amb.river", 8000));
  });
});
