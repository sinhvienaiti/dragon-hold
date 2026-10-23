// A plain world with just the fields the UI reads, so ui tests do not depend on the sim systems' progress.
import { MAP_L2_CAU } from "../../src/content/data/maps";
import { STAGE_M0 } from "../../src/content/data/stages";
import type { Phase, StageDef } from "../../src/content/types";
import type { SlotState } from "../../src/sim/placement";
import type { World } from "../../src/sim/world";

export interface FakeWorldInit {
  phase?: Phase;
  tick?: number;
  phaseEndsAt?: number;
  wave?: number;
  gold?: number;
  stage?: StageDef;
}

export function fakeWorld(init: FakeWorldInit = {}): World {
  const stage = init.stage ?? STAGE_M0;
  const slots = MAP_L2_CAU.slots.map((def, index) => ({
    index,
    def,
    x: Math.round(def.pos[0] * 60_000),
    z: Math.round(def.pos[1] * 60_000),
    lane: def.lane === undefined ? -1 : stage.lanes.indexOf(def.lane),
    along: def.atM === undefined ? 0 : Math.round(def.atM * 60_000),
    item: null,
    level: 0,
    spent: 0,
    boughtInBreak: -1,
    activeAt: 0,
  })) as unknown as SlotState[];
  const world = {
    stage,
    map: MAP_L2_CAU,
    tick: init.tick ?? 6000,
    phase: init.phase ?? "break",
    phaseEndsAt: init.phaseEndsAt ?? -1,
    wave: init.wave ?? 3,
    hero: { hp: 800, hpMax: 1020, shield: 0, armour: 20, resist: 20, level: 3, xp: 62, statuses: {} },
    guide: { hp: 700, hpMax: 700, downUntil: -1 },
    combat: { strikes: [], readyAt: { breath: 0, skyfire: 0, roar: 0, inferno: 0 }, rage: 0, lastUltAt: -1, infernoUntil: -1, urgentUsed: false },
    words: { chain: 0, lock: -1 },
    shop: { held: {} as Record<string, number>, heroBuys: {} as Record<string, number>, consumableReadyAt: 0, breakNo: 3 },
    economy: { gold: init.gold ?? 200, budget: 0, killPaid: 0, waveEndPaid: 0, otherPaid: 0 },
    slots,
    stats: { keys: 0, wrongKeys: 0, strayKeys: 0, words: 0, goldEarned: 0, goldSpent: 0 },
  };
  return world as unknown as World;
}
