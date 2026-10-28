/**
 * The M0 vertical slice stage (DESIGN.md §9 M0, 00 D16): map L2-cau, 10 waves,
 * every M0 system on. It sits outside the chapter ladder (index 0) and uses
 * chapter 2 strength: the first chapter with two lanes (02 §5.5).
 * Owner: sim-battle (LANES.md).
 */
import type { StageDef } from "../types";
import { MAP_L2_CAU } from "./maps";
import { M0_WAVES } from "./waves";

export const STAGE_M0: StageDef = {
  id: "m0-l2-cau",
  nameVi: "Stage 1 · Bridge and Brook",
  chapter: 2,
  index: 0,
  type: "normal",
  mapId: MAP_L2_CAU.id,
  seed: 20_261_023,
  lanes: ["cau", "suoi", "troi"],
  waves: M0_WAVES,
  carry: ["spikes", "pine-bomb", "net-launcher", "moss-warden", "herb-hut", "small-potion"],
  unlocks: {
    heroSkills: ["breath", "skyfire", "roar", "inferno"],
    rage: true,
    urgentWord: true,
    guideFights: false,
    triggerWords: false,
    reviewCard: true,
    learnAhead: true,
    heroUpgrades: ["dragon-heart", "hard-scale"],
  },
  elitePct: 0,
  // M0 gate: peak load ≤ 1.40 (DESIGN.md §9), above C2's 1.15.
  peakLoadCap100: 140,
  // Live cap: C2's 20 (00 §4.8); gold: a normal stage's f_type 1.0 (00 §4.9), 1,325 for two lanes.
};

export const STAGES: Readonly<Record<string, StageDef>> = { [STAGE_M0.id]: STAGE_M0 };
