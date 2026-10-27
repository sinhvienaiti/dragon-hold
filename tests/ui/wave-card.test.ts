import { describe, expect, it } from "vitest";
import { MAP_L2_CAU } from "../../src/content/data/maps";
import { STAGE_M0 } from "../../src/content/data/stages";
import type { StageDef, WaveDef } from "../../src/content/types";
import { bannerText, summarizeWave } from "../../src/ui/wave-card";

const wave = (n: number, groups: WaveDef["groups"], generals: WaveDef["generals"] = []): WaveDef => ({
  n,
  durationMs: 60_000,
  load100: 90,
  peakLoad100: 110,
  peaks: [{ atMs: 12_000, lengthMs: 8000 }],
  generals,
  groups,
});

const STAGE: StageDef = {
  ...STAGE_M0,
  waves: [
    wave(1, [
      { atMs: 9000, lane: "suoi", shape: "cluster", foe: "thorn-ant", count: 8 },
      { atMs: 0, lane: "cau", shape: "line", foe: "moss-grunt", count: 3 },
      { atMs: 9000, lane: "cau", shape: "line", foe: "moss-grunt", count: 2 },
    ]),
    wave(
      2,
      [
        { atMs: 0, lane: "cau", shape: "escort", foe: "moss-banner", count: 1, escort: { foe: "moss-grunt", count: 4 } },
        { atMs: 15_000, lane: "troi", shape: "flight", foe: "thorn-wasp", count: 3 },
        { atMs: 20_000, lane: "suoi", shape: "single", foe: "tusk-boar", count: 1, elite: true },
      ],
      ["moss-banner"],
    ),
  ],
};

describe("ui wave card summary (02 §5.6)", () => {
  it("tallies foes per lane in stage lane order, with sorted unique group beats", () => {
    const summary = summarizeWave(STAGE, MAP_L2_CAU, 1)!;
    expect(summary.lanes.map((lane) => [lane.id, lane.nameVi, lane.sky, lane.count])).toEqual([
      ["cau", "Đường Cầu", false, 5],
      ["suoi", "Đường Suối", false, 8],
      ["troi", "Đường Trời", true, 0],
    ]);
    expect(summary.lanes[0]!.foes.map((foe) => [foe.foe, foe.count])).toEqual([["moss-grunt", 5]]);
    expect(summary.total).toBe(13);
    expect(summary.flyers).toBe(0);
    expect(summary.generals).toEqual([]);
    expect(summary.beats).toEqual([0, 9000]);
    expect(bannerText(summary)).toBe("Đợt 1 · 2 đường");
  });

  it("counts escorts, puts the general first, marks elites and counts flyers", () => {
    const summary = summarizeWave(STAGE, MAP_L2_CAU, 2)!;
    const cau = summary.lanes[0]!;
    expect(cau.foes.map((foe) => [foe.foe, foe.count, foe.general])).toEqual([
      ["moss-banner", 1, true],
      ["moss-grunt", 4, false],
    ]);
    expect(summary.lanes[1]!.foes[0]).toMatchObject({ foe: "tusk-boar", elite: true, gait: "quadruped" });
    expect(summary.lanes[2]!.foes[0]).toMatchObject({ foe: "thorn-wasp", flyer: true, gait: "flyer" });
    expect(summary.flyers).toBe(3);
    expect(summary.generals).toEqual(["moss-banner"]);
    expect(bannerText(summary)).toBe("Đợt cuối · 2 đường · có quái bay · có tướng địch");
  });

  it("returns null past the last wave and still crowns generals of a wave without groups", () => {
    expect(summarizeWave(STAGE, MAP_L2_CAU, 3)).toBeNull();
    const m0 = summarizeWave(STAGE_M0, MAP_L2_CAU, 5)!;
    expect(m0.generals).toEqual(["moss-banner"]);
    expect(m0.waves).toBe(10);
  });
});
