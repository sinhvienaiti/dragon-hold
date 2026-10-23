import { describe, expect, it } from "vitest";
import { BUSES, CHILD_BUSES, SOUNDS } from "../../src/audio/catalog";
import { AudioMix, BUS_TABLE, DUCKS, NO_DUCK, dbToGain, gainToDb, volumeFor, DEFAULT_VOLUMES } from "../../src/audio/mix";

const db = (gain: number) => Math.round(gainToDb(gain) * 10) / 10;

describe("audio buses and ducking (05 §7.2)", () => {
  it("has the 13 buses", () => {
    expect(BUSES).toEqual(["master", "music", "ui", "typing", "dragon", "world", "enemies", "traps", "units", "ambience", "voice", "stingers", "learning"]);
    expect(Object.keys(BUS_TABLE).sort()).toEqual([...CHILD_BUSES].sort());
  });

  it("dips the mix by the pronunciation row of the table and never the learning bus", () => {
    const mix = new AudioMix();
    const state = { ...NO_DUCK, pronunciation: true };
    expect(db(mix.duck("music", state))).toBe(-4);
    expect(db(mix.duck("enemies", state))).toBe(-6);
    expect(db(mix.duck("traps", state))).toBe(-6);
    expect(db(mix.duck("dragon", state))).toBe(-3);
    // Bolts, impacts and blasts are "world": −6 under a spoken word (05 §7.2).
    expect(db(mix.duck("world", state))).toBe(-6);
    expect(SOUNDS["fire.impact.c"].bus).toBe("world");
    expect(SOUNDS["dragon.skyfire.impact"].bus).toBe("world");
    expect(SOUNDS["dragon.roar"].bus).toBe("dragon");
    expect(mix.duck("learning", state)).toBe(1);
    for (const bus of CHILD_BUSES) expect(mix.duck(bus, NO_DUCK)).toBe(1);
  });

  it("keeps learning on top even with the voice boost", () => {
    const mix = new AudioMix();
    mix.setPronunciationBoost(3);
    const state = { ...NO_DUCK, pronunciation: true };
    expect(mix.duck("learning", state)).toBe(1);
    expect(mix.duck("music", state)).toBeCloseTo(1 / 3, 5);
  });

  it("takes the deepest dip when rules overlap, never a mute", () => {
    const mix = new AudioMix();
    const both = { pronunciation: true, dialogue: true, warning: false };
    expect(db(mix.duck("music", both))).toBe(-6);
    expect(db(mix.duck("dragon", both))).toBe(-3);
    const all = { pronunciation: true, dialogue: true, warning: true };
    for (const bus of CHILD_BUSES) expect(mix.duck(bus, all)).toBeGreaterThan(0.15);
  });

  it("ramps 80 ms down and 400 ms up for pronunciation, 500 ms up after dialogue", () => {
    const mix = new AudioMix();
    const on = { ...NO_DUCK, pronunciation: true };
    expect(mix.target("music", on, 1, NO_DUCK)).toEqual({ duck: dbToGain(-4), rampS: 0.08 });
    expect(mix.target("music", NO_DUCK, dbToGain(-4), on)).toEqual({ duck: 1, rampS: 0.4 });
    const talk = { ...NO_DUCK, dialogue: true };
    expect(mix.target("ambience", talk, 1, NO_DUCK).rampS).toBe(DUCKS.dialogue.downS);
    expect(mix.target("ambience", NO_DUCK, dbToGain(-6), talk).rampS).toBe(0.5);
  });

  it("boss warnings dip the world 4 dB, music 3 dB and nearly silence P5 ambience", () => {
    const mix = new AudioMix();
    const warning = { ...NO_DUCK, warning: true };
    expect(db(mix.duck("dragon", warning))).toBe(-4);
    expect(db(mix.duck("music", warning))).toBe(-3);
    expect(db(mix.duck("ambience", warning))).toBeLessThanOrEqual(-12);
    expect(mix.duck("stingers", warning)).toBe(1);
  });

  it("follows the settings sliders by bus", () => {
    const volumes = { ...DEFAULT_VOLUMES, music: 0.2, voice: 0.3, learning: 0.9, sfx: 0.5 };
    expect(volumeFor("music", volumes)).toBe(0.2);
    expect(volumeFor("voice", volumes)).toBe(0.3);
    expect(volumeFor("learning", volumes)).toBe(0.9);
    expect(volumeFor("enemies", volumes)).toBe(0.5);
    expect(volumeFor("typing", volumes)).toBe(0.5);
  });
});
