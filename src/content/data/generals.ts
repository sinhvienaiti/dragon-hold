/**
 * M0 general G01 Yêu Rêu Cầm Cờ (02 §3.2 stats, §3.4 presentation): aura
 * Xung Phong, skill Cắm Cờ, Ấn Phá on every 3rd chain word. Chapter-1 numbers.
 * Seeded by the architect from 02; owner: sim-battle (LANES.md).
 */
import type { GeneralDef, GeneralId } from "../types";
import { FAMILY_COLORS } from "./enemies";

export const GENERALS: Readonly<Record<GeneralId, GeneralDef>> = {
  "moss-banner": {
    id: "moss-banner",
    code: "G01",
    nameVi: "Yêu Rêu Cầm Cờ",
    nameEn: "Moss Bannerman",
    family: "moss",
    gait: "biped",
    rank: "captain",
    role: "support",
    w100: 600,
    armour: 1,
    resist: 0,
    // 02 gives no speed; captains walk S1–S3 inside their escort, S2 here.
    speedMmS: 1800,
    blockQuarters: 8,
    threat10: 300,
    stance: "ground",
    altitudeMm: 0,
    // Chain of D3 words, the last one D4 (02 §3.1).
    word: { band: "D3", lastBand: "D4" },
    attack: { kind: "melee", damageType: "physical", damage: 14, rangeMm: 1500, periodMs: 1600, windupMs: 500, telegraph: false },
    auras: [{ kind: "speed", icon: "wind", radiusMm: 6000, valuePct: 15 }],
    skill: { kind: "plant-banner", cooldownMs: 16_000, windupMs: 1000, durationMs: 8000, radiusMm: 5000, damagePct: 25, wordBand: "D1" },
    // Ấn Phá: chain words 3, 6, 9…; turns the aura off 8 s and staggers 0.5 s (01 §3.6).
    seal: { everyNthWord: 3, auraOffMs: 8000, staggerMs: 500 },
    // "Quân gần chùn 1 s": allies within the aura radius flinch.
    onDeath: { kind: "flinch", radiusMm: 6000, durationMs: 1000 },
    counters: ["priority", "silence"],
    firstChapter: 1,
    show: {
      model: "generals/moss-banner",
      placeholder: { shape: "capsule", color: FAMILY_COLORS.moss, sizeM: [1.0, 2.4, 0.9], hoverM: 0 },
      material: "leaf",
      audioSet: "general",
      sounds: { attack: "general.moss-banner.attack", hit: "general.moss-banner.hit", death: "general.moss-banner.death", skill: "general.moss-banner.skill" },
      fx: { hit: "hit.leaf", death: "death.leaf", attack: "slash.white", skill: "banner.pillar" },
    },
  },
};

export const GENERAL_IDS = Object.keys(GENERALS) as GeneralId[];
