import { describe, expect, it } from "vitest";
import { STAGE_M0 } from "../../src/content/data/stages";
import type { FoeId, SimEvent } from "../../src/content/types";
import { DEBUT_LINES, SHOWN_MAX, debutsIn } from "../../src/ui/debut-card";

const spawn = (foe: FoeId, serial: number): SimEvent => ({ tick: serial, type: "spawn", enemy: { slot: serial, serial }, foe, lane: "cau", x: 0, z: -30, elite: false, cluster: -1 });

describe("ui debut cards (02 §1.5)", () => {
  it("has a line for every species of the M0 waves", () => {
    const species = new Set(STAGE_M0.waves.flatMap((wave) => wave.groups.map((group) => group.foe)));
    for (const foe of species) expect(DEBUT_LINES[foe], foe).toBeDefined();
  });

  it("introduces each species once a run, and stops after SHOWN_MAX runs", () => {
    const seen = new Set<FoeId>();
    expect(debutsIn([spawn("moss-grunt", 1), spawn("moss-grunt", 2), spawn("thorn-ant", 3)], seen, {})).toEqual(["moss-grunt", "thorn-ant"]);
    expect(debutsIn([spawn("moss-grunt", 4), spawn("moss-banner", 5)], seen, {})).toEqual(["moss-banner"]);
    expect(debutsIn([spawn("tusk-boar", 6)], new Set(), { "tusk-boar": SHOWN_MAX })).toEqual([]);
  });
});
