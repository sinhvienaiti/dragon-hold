import { describe, expect, it } from "vitest";
import { STAGE_M0 } from "../../src/content/data/stages";
import type { FoeId, SimEvent } from "../../src/content/types";
import { DEBUT_LINES, DEBUT_STALE_MS, SHOWN_MAX, debutsIn, nextDebut, type QueuedDebut } from "../../src/ui/debut-card";

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

  it("drops a card that waited too long, never a general's, and shows a general first", () => {
    // A fast-forward queued grunt, ant and G01 at once (dh-banner 27/10: "Yêu Rêu Lính" showed in wave 5).
    const queue: QueuedDebut[] = [{ foe: "moss-grunt", at: 0 }, { foe: "thorn-ant", at: 0 }, { foe: "moss-banner", at: 0 }];
    expect(nextDebut(queue, 1000)).toBe("moss-banner");
    expect(queue.map((item) => item.at)).toEqual([1000, 1000]);
    expect(nextDebut(queue, 1000 + DEBUT_STALE_MS + 1)).toBeNull();
    expect(queue).toEqual([]);
    const general: QueuedDebut[] = [{ foe: "moss-banner", at: 500 }];
    expect(nextDebut(general, 500 + 3 * DEBUT_STALE_MS)).toBe("moss-banner");
  });
});
