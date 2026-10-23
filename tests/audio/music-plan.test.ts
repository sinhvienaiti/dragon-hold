import { describe, expect, it } from "vitest";
import { FOREST_SONG, barSeconds, harpMidi, musicTargets, nextBarTime, type MusicState } from "../../src/audio/music-plan";

const base: MusicState = { phase: "prep", wave: 0, waves: 10, heroPct: 100, live: 0, generals: 0, sharedMusic: false };

describe("music plan (05 §7.2)", () => {
  it("plays only the calm layer outside waves", () => {
    for (const phase of ["prep", "warning", "break"]) {
      expect(musicTargets({ ...base, phase }).layers).toEqual({ forest: 1, wave: 0, surge: 0, general: 0 });
    }
  });

  it("adds the battle layer in a wave, the surge on the last wave or low HP, the general's layer while one lives", () => {
    expect(musicTargets({ ...base, phase: "wave", wave: 3, live: 10 }).layers).toEqual({ forest: 0.7, wave: 1, surge: 0, general: 0 });
    expect(musicTargets({ ...base, phase: "wave", wave: 10, live: 10 }).layers.surge).toBe(1);
    expect(musicTargets({ ...base, phase: "wave", wave: 3, heroPct: 30 }).layers.surge).toBe(1);
    expect(musicTargets({ ...base, phase: "wave", wave: 5, generals: 1 }).layers.general).toBe(1);
  });

  it("rises in intensity with the crowd and danger", () => {
    const calm = musicTargets({ ...base, phase: "wave", wave: 2, live: 2 }).intensity;
    const busy = musicTargets({ ...base, phase: "wave", wave: 2, live: 60 }).intensity;
    const dire = musicTargets({ ...base, phase: "wave", wave: 10, live: 60, heroPct: 20 }).intensity;
    expect(calm).toBeLessThan(busy);
    expect(busy).toBeLessThanOrEqual(dire);
    expect(dire).toBeLessThanOrEqual(1);
  });

  it("goes silent for the end stingers and while the portal plays its music", () => {
    for (const state of [{ ...base, phase: "victory" }, { ...base, phase: "defeat" }, { ...base, phase: "wave", sharedMusic: true }]) {
      expect(Object.values(musicTargets(state).layers).every((v) => v === 0)).toBe(true);
    }
  });

  it("finds the next bar line", () => {
    const bar = barSeconds(FOREST_SONG);
    expect(bar).toBeCloseTo((60 / 84) * 4, 6);
    expect(nextBarTime(0, 1, FOREST_SONG)).toBe(1);
    expect(nextBarTime(1, 1, FOREST_SONG)).toBe(1);
    expect(nextBarTime(1.01, 1, FOREST_SONG)).toBeCloseTo(1 + bar, 6);
    expect(nextBarTime(1 + bar * 3, 1, FOREST_SONG)).toBeCloseTo(1 + bar * 3, 6);
  });

  it("keeps the song in D Dorian with one chord per bar", () => {
    const dorian = new Set([2, 4, 5, 7, 9, 11, 0]); // D E F G A B C
    expect(FOREST_SONG.chords).toHaveLength(FOREST_SONG.bars);
    for (const chord of FOREST_SONG.chords) for (const midi of chord) expect(dorian.has(midi % 12)).toBe(true);
    for (const note of FOREST_SONG.melody) {
      expect(dorian.has(note.midi % 12)).toBe(true);
      expect(note.bar).toBeLessThan(FOREST_SONG.bars);
      expect(note.step + note.steps).toBeLessThanOrEqual(16);
    }
    expect(harpMidi([50, 53, 57], 0)).toBe(62);
    expect(harpMidi([50, 53, 57], 4)).toBe(77);
    // F major pentatonic chimes (kit pentatonicRatio) = D minor pentatonic: F5.
    expect(FOREST_SONG.chimeRootHz).toBeCloseTo(698.46, 2);
  });
});
