/**
 * M0 items of our side (03; DESIGN.md §9 M0): traps Gai Chông, Bom Hạt Thông,
 * Lưới Phóng; blocker Vệ Binh Rêu; magic house Lều Thuốc Nam; Bình Máu Nhỏ;
 * in-run buys Tim Rồng, Vảy Cứng. Chapter-1 numbers (×g(c) for damage and HP).
 * Seeded by the architect from 03 §6–§9, checked against 03 §6.2–§9.2 by
 * sim-ourside (owner, LANES.md). Bots tune numbers here, never in code
 * (03 §13.1: over the 40 % non-typing cap, lower these numbers).
 * Placeholders: bark brown for traps, pale blue for houses and units with a
 * blue disc at a unit's feet (05 §2.2 own colours; never a foe family's
 * colour), primitives only until the owner's GLB.
 */
import type { ConsumableDef, ConsumableId, HeroUpgradeDef, HeroUpgradeId, HouseDef, HouseId, PlaceableId, TrapDef, TrapId, UnitDef, UnitId } from "../types";

/**
 * Our-side behaviour numbers the design leaves open (sim-ourside starting
 * values; rules live in src/sim, these are data the bots may tune).
 */
export const OUR_SIDE_TUNING = {
  /** Units step out to meet foes inside their 4 m leash at this speed (03 §9.1 gives none). */
  unitSpeedMmS: 2500,
  /** A unit and a foe on its lane touch within this distance (same as movement's contact, inside melee 1.5 m, 02 §1.3). */
  contactMm: 1200,
  /** Several units on one block point stand this far apart across the lane. */
  unitSpreadMm: 700,
  /** Gai Chông stabs every 0.5 s (8 VL/s → 4 a stab at C1); its slow lingers 0.3 s after a foe steps off. */
  spikesPulseMs: 500,
  spikesLingerMs: 300,
  /** The Dragons count as inside a house's area up to the dais edge (dais 4 m, 01 §2.1). */
  heroReachMm: 4000,
  /** Houses heal on a 1 s beat. */
  houseBeatMs: 1000,
  /** C6+ quick place: one item a wave, built in 2 s (03 §0.1 rule 6, §4.1). */
  quickBuildMs: 2000,
} as const;

const TRAP_UPGRADE = { costPct: [70, 100], mainPct: [45, 35], rechargePctAt3: -15 } as const;

export const TRAPS: Readonly<Record<TrapId, TrapDef>> = {
  spikes: {
    id: "spikes",
    nameVi: "Gai Chông",
    style: "floor",
    continuous: true,
    cost: 50,
    rechargeMs: 0,
    area: { shape: "strip", radiusMm: 1500, lengthMm: 4000 },
    triggerMin: 1,
    wordTrigger: false,
    hits: { ground: true, lowAir: false },
    effect: { kind: "spikes", slowPct: 25, dps: 8, damageType: "physical" },
    upgrade: TRAP_UPGRADE,
    footprint: { slot: "trap", radiusMm: 1500 },
    counters: ["slow"],
    unlockStage: 2,
    show: {
      model: "traps/spikes",
      // Light bark and taller than the lane's dirt, so the spikes read on the bridge deck (05 §2.3: traps 30–50 px).
      placeholder: { shape: "cone", color: "#c49a64", sizeM: [1.8, 0.55, 3.6], hoverM: 0 },
      icon: "trap-spikes",
      sounds: { place: "trap.place", fire: "trap.spikes.stab" },
      fx: { place: "place.dust", fire: "spikes.thrust" },
    },
  },
  "pine-bomb": {
    id: "pine-bomb",
    nameVi: "Bom Hạt Thông",
    style: "floor",
    continuous: false,
    cost: 90,
    rechargeMs: 22_000,
    area: { shape: "circle", radiusMm: 3000 },
    // Tự: ≥ 2 foes in 3 m, or one a blocker holds (00 D33 (1); 03 had ≥ 3, foes came one by one and it
    // almost never fired). The Chữ mode with a trigger word stays off until C4 (00 D13).
    triggerMin: 2,
    triggerHeld: true,
    wordTrigger: false,
    hits: { ground: true, lowAir: false },
    // 03 §7.2 gave 120 VL at ≥ 3 foes (2–3 blasts a run). With D33 (1)'s trigger it fires 6–13 times a run, and at 120
    // every bot won 2–18 points more (G1 91.7 %, B4 broke); 30 keeps its share of the damage near the old one.
    effect: { kind: "bomb", damage: 30, damageType: "physical", pushMm: 2000 },
    upgrade: TRAP_UPGRADE,
    footprint: { slot: "trap", radiusMm: 1200 },
    counters: ["blast"],
    unlockStage: 14,
    show: {
      model: "traps/pine-bomb",
      placeholder: { shape: "sphere", color: "#b07a42", sizeM: [1.4, 1.2, 1.4], hoverM: 0 },
      icon: "trap-pine-bomb",
      sounds: { place: "trap.place", fire: "trap.pine-bomb.blast" },
      fx: { place: "place.dust", fire: "blast.resin", ready: "ready.breathe" },
    },
  },
  "net-launcher": {
    id: "net-launcher",
    nameVi: "Lưới Phóng",
    style: "post",
    continuous: false,
    cost: 80,
    rechargeMs: 15_000,
    // 10 m + 10 % (00 §7 data tuning): from cau-t4 it reaches the wasps' stop on Đường Trời (10.5 m).
    area: { shape: "circle", radiusMm: 11_000 },
    triggerMin: 1,
    wordTrigger: false,
    hits: { ground: false, lowAir: true },
    effect: { kind: "net", groundMs: 3000, targets: 1 },
    upgrade: TRAP_UPGRADE,
    footprint: { slot: "trap", radiusMm: 800 },
    counters: ["net"],
    unlockStage: 13,
    show: {
      model: "traps/net-launcher",
      placeholder: { shape: "box", color: "#7a5a3c", sizeM: [0.5, 1.8, 0.5], hoverM: 0 },
      icon: "trap-net",
      sounds: { place: "trap.place", fire: "trap.net.shoot", hit: "trap.net.wrap" },
      fx: { place: "place.dust", fire: "net.throw", hit: "net.wrap" },
    },
  },
};

export const HOUSES: Readonly<Record<HouseId, HouseDef>> = {
  "herb-hut": {
    id: "herb-hut",
    nameVi: "Lều Thuốc Nam",
    cost: 120,
    hp: 600,
    radiusMm: 7000,
    // 03 gave 1.5 % of max HP a second for allies, the Dragons too: one hut healed ~90 % a wave and wiped out Héo lan
    // (BALANCE.md §9.1: the Dragon's HP is the margin S now). 0.3 % a second, ~18 % a wave, near 00 §4.5's 20 % heal cap.
    effect: { kind: "heal-aura", healPmPerS: 3, targets: "allies" },
    pulse: { kind: "heal-burst", healPct: 10 },
    // 3 word kills in 7 m fire the pulse (00 D33 (1); the 5 of 03 §10.2 came about once a run).
    energyMax: 3,
    upgrade: { costPct: [70, 100], mainPct: [45, 35], hpPct: 40 },
    footprint: { slot: "house", radiusMm: 2000 },
    counters: [],
    unlockStage: 16,
    show: {
      model: "houses/herb-hut",
      placeholder: { shape: "box", color: "#8fb3cf", sizeM: [2.2, 2, 2.2], hoverM: 0 },
      icon: "house-herb-hut",
      sounds: { place: "house.place", fire: "house.herb.pulse", down: "house.down" },
      fx: { place: "place.dust", fire: "pulse.leaf", ready: "drops.float" },
    },
  },
};

export const UNITS: Readonly<Record<UnitId, UnitDef>> = {
  "moss-warden": {
    id: "moss-warden",
    nameVi: "Vệ Binh Rêu",
    role: "blocker",
    cost: 70,
    blockSlots: 2,
    hp: 450,
    armour: 1,
    resist: 0,
    attack: { damage: 12, periodMs: 1200, rangeMm: 1500, damageType: "physical" },
    respawnMs: 14_000,
    count: 1,
    upgrade: { costPct: [70, 100], mainPct: [40, 40], hpPct: 40, attackPct: 25 },
    footprint: { slot: "block", radiusMm: 4000 },
    counters: ["block"],
    unlockStage: 6,
    show: {
      model: "units/moss-warden",
      // Our side reads pale blue (05 §2.2), never the moss green of the Bầy Héo; a blue disc marks its feet.
      placeholder: { shape: "capsule", color: "#a9c9ea", sizeM: [0.8, 1.6, 0.7], hoverM: 0 },
      icon: "unit-moss-warden",
      sounds: { place: "unit.place", hit: "unit.warden.hit", down: "unit.down" },
      fx: { place: "place.leaves", hit: "hit.leaf" },
    },
  },
};

export const CONSUMABLES: Readonly<Record<ConsumableId, ConsumableDef>> = {
  "small-potion": {
    id: "small-potion",
    nameVi: "Bình Máu Nhỏ",
    cost: 30,
    cooldownMs: 8000,
    stackMax: 3,
    effect: { kind: "heal-over-time", healPct: 25, durationMs: 2000 },
    unlockStage: 7,
    show: {
      model: "items/small-potion",
      placeholder: { shape: "sphere", color: "#c97b7b", sizeM: [0.3, 0.4, 0.3], hoverM: 0 },
      icon: "item-small-potion",
      sounds: { use: "item.potion.drink" },
      fx: { fire: "heal.rise" },
    },
  },
};

export const HERO_UPGRADES: Readonly<Record<HeroUpgradeId, HeroUpgradeDef>> = {
  "dragon-heart": {
    id: "dragon-heart",
    nameVi: "Tim Rồng",
    costs: [80, 120, 160],
    maxPerRun: 3,
    effect: { kind: "max-hp", pct: 10 },
    unlockStage: 17,
    show: {
      model: "items/dragon-heart",
      placeholder: { shape: "sphere", color: "#c96a5a", sizeM: [0.4, 0.4, 0.4], hoverM: 0 },
      icon: "buy-dragon-heart",
      sounds: { use: "buy.heart" },
      fx: { fire: "heal.rise" },
    },
  },
  "hard-scale": {
    id: "hard-scale",
    nameVi: "Vảy Cứng",
    costs: [70, 105, 140],
    maxPerRun: 3,
    effect: { kind: "armour", amount: 15 },
    unlockStage: 17,
    show: {
      model: "items/hard-scale",
      placeholder: { shape: "box", color: "#a8664a", sizeM: [0.4, 0.1, 0.4], hoverM: 0 },
      icon: "buy-hard-scale",
      sounds: { use: "buy.scale" },
      fx: { fire: "armour.shine" },
    },
  },
};

/** Every placeable item, for kind and price lookups. */
export const PLACEABLES: Readonly<Record<PlaceableId, TrapDef | HouseDef | UnitDef>> = { ...TRAPS, ...HOUSES, ...UNITS };
