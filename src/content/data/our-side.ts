/**
 * M0 items of our side (03; DESIGN.md §9 M0): traps Gai Chông, Bom Hạt Thông,
 * Lưới Phóng; blocker Vệ Binh Rêu; magic house Nhà Thuốc Lá; Bình Máu Nhỏ;
 * in-run buys Tim Rồng, Vảy Cứng. Chapter-1 numbers (×g(c) for damage and HP).
 * Seeded by the architect from 03 §6–§9; owner: sim-ourside (LANES.md).
 * Placeholders: bark brown for traps, pale blue for houses, moss green for
 * units (05 §2.2 own colours), primitives only until the owner's GLB.
 */
import type { ConsumableDef, ConsumableId, HeroUpgradeDef, HeroUpgradeId, HouseDef, HouseId, TrapDef, TrapId, UnitDef, UnitId } from "../types";

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
      placeholder: { shape: "cone", color: "#7a5a3c", sizeM: [1.6, 0.35, 3.6], hoverM: 0 },
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
    // Tự (≥ 3 foes); the Chữ mode with a trigger word stays off until C4 (00 D13).
    triggerMin: 3,
    wordTrigger: false,
    hits: { ground: true, lowAir: false },
    effect: { kind: "bomb", damage: 120, damageType: "physical", pushMm: 2000 },
    upgrade: TRAP_UPGRADE,
    footprint: { slot: "trap", radiusMm: 1200 },
    counters: ["blast"],
    unlockStage: 14,
    show: {
      model: "traps/pine-bomb",
      placeholder: { shape: "sphere", color: "#6b4a2e", sizeM: [0.9, 0.9, 0.9], hoverM: 0 },
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
    area: { shape: "circle", radiusMm: 10_000 },
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
    nameVi: "Nhà Thuốc Lá",
    cost: 120,
    hp: 600,
    radiusMm: 7000,
    // 1.5 % of max HP a second for allies, the Dragons too.
    effect: { kind: "heal-aura", healPmPerS: 15, targets: "allies" },
    pulse: { kind: "heal-burst", healPct: 10 },
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
      placeholder: { shape: "capsule", color: "#5d8a5a", sizeM: [0.7, 1.5, 0.6], hoverM: 0 },
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
