/**
 * Rồng Giữ Ải: content and simulation contracts every lane builds on
 * (docs/games/dragon-lane; 00-canon.md wins when documents disagree).
 * Owner: architect for the M0a setup, sim-battle from then on (LANES.md).
 * A lane that needs a change declares the new type in its own file and
 * reports it; only the owner edits this file.
 *
 * Units. Content data: lengths mm (…Mm), map geometry metres (MapDef, Vec2),
 * durations ms (…Ms), speeds mm/s (…MmS), percent (…Pct), permille (…Pm).
 * HP and damage are chapter-1 numbers; the sim scales them by g(c) (00 §4.1).
 * Sim state is integers only (src/sim/fixed.ts): ticks at 60 Hz, positions in
 * u with 1 m = 60 000 u, so a speed of N mm/s moves N u per tick.
 * World axes: x east, z south (towards the default camera), y up; the Dragon
 * Dais sits at the origin.
 */

// ── Basics ──────────────────────────────────────────────────────────────────

/** A point on the ground in metres: [x, z]. */
export type Vec2 = readonly [x: number, z: number];

export type Difficulty = "easy" | "normal" | "hard";

/** A finished word (00 §2): Chớp, Hoàn hảo, Tốt, Vừa, Ẩu. Words never expire. */
export type Grade = "flash" | "perfect" | "good" | "ok" | "sloppy";

/** 00 §4.2: "word" (Chữ) ignores armour and resist; only word shields stop it. "true" is poison only. */
export type DamageType = "word" | "physical" | "magic" | "true";

/** Armour and resist tiers G0–G3 / K0–K3 (00 §4.2). */
export type ArmourTier = 0 | 1 | 2 | 3;

/** Feedback tiers T0–T5 (05 §5). */
export type FeedbackTier = 0 | 1 | 2 | 3 | 4 | 5;

/** Element tags for statuses and reactions (03 §2.4); never a damage type. */
export type Element = "fire" | "ice" | "storm" | "poison" | "wind" | "earth" | "light";

// ── Enemies (Bầy Héo, 02) ───────────────────────────────────────────────────

/** M0 species; extend as content grows (02 §2.1 lists 32). */
export type EnemyId = "thorn-wasp" | "moss-grunt" | "moss-archer" | "blight-wolf" | "tusk-boar" | "thorn-ant";
/** M0 generals (02 §3.2). */
export type GeneralId = "moss-banner";
/** Anything that walks a lane for the Bầy Héo side. */
export type FoeId = EnemyId | GeneralId;

/** Eight families (02 §1.1). */
export type Family = "moss" | "beast" | "bug" | "spore" | "stone" | "wing" | "mist" | "tide";

/** Silhouette and rig group (02 §7.2). Crawler, serpent and rigless shapes come with later chapters. */
export type Gait = "biped" | "quadruped" | "flyer" | "swarm";

/** Size class (00 §4.6, 02 §1.2). Generals use GeneralRank. */
export type Tier = "swarm" | "small" | "medium" | "heavy" | "giant";
export type GeneralRank = "captain" | "warlord";

/** 03 §2.1 stance: low air ≤ 3.5 m can be netted and grounded; high air cannot. */
export type Stance = "ground" | "low-air" | "high-air";

/** Targeting role (01 §4.2, 02 §1.3). */
export type EnemyRole = "melee" | "ranged" | "charger" | "pack" | "swarm" | "sapper" | "breaker" | "support";

/** Hit and death material (05 §6.3). */
export type Material = "leaf" | "rotwood" | "stone" | "fur" | "chitin" | "mist" | "mud" | "crystal";

/** Sound set by class, not species (05 §7.1). */
export type AudioSet = "infantry" | "marksman" | "charger" | "pack" | "flyer" | "bomber" | "sapper" | "caster" | "general";

/** Counter codes (02 §1.6, 03 §0.3), ASCII. */
export type CounterCode =
  | "block" // CHẶN
  | "slow" // CHẬM
  | "hold" // GIAM
  | "blast" // NỔ
  | "push" // ĐẨY
  | "net" // LƯỚI
  | "reveal" // LỘ
  | "break-armour" // PHÁ-giáp
  | "break-word" // PHÁ-chữ
  | "silence" // CÂM
  | "quake" // RUNG
  | "breath" // PHUN
  | "interrupt" // NGẮT
  | "priority"; // ƯT

/** Word length bands (02 §1.4); real lengths follow E (01 §3.4). D5 is a 3–5 word topic chain (00 D19). */
export type WordBand = "D1" | "D2" | "D3" | "D4" | "D5";

/** How the enemy's words look: one band, a swarm cluster word, or a general's chain. */
export interface WordSpec {
  readonly band: WordBand;
  /** Swarm: one D1 word for the whole cluster (02 §1.4). */
  readonly cluster?: boolean;
  /** Generals: chain words in `band`, the last one in `lastBand` (02 §3.1). */
  readonly lastBand?: WordBand;
}

/** The enemy's basic attack when near (02 §2.2, 01 §4.1). */
export interface AttackDef {
  readonly kind: "melee" | "ranged" | "charge";
  readonly damageType: DamageType;
  /** HP at C1 against the 1 000 HP Fire Dragon (02 §1.2). */
  readonly damage: number;
  readonly rangeMm: number;
  /** Time between strikes; for a charge, its cooldown. */
  readonly periodMs: number;
  /** Swing before the strike lands (01 §4.1: at least 300 ms). */
  readonly windupMs: number;
  /** Red ground telegraph during the wind-up: hits ≥ 15 HP or on our buildings (02 §1.3); small hits of swarm and small have none. */
  readonly telegraph: boolean;
  /** Ranged: stops this far from its target (01 §2.1 shooting band). */
  readonly holdMm?: number;
  /** Ranged: steps back this far when something closes in (E11). */
  readonly retreatMm?: number;
  /** Melee: may pounce over this many blockers, with this telegraph (E18). */
  readonly pounceBlockers?: number;
  readonly pounceWindupMs?: number;
  /** Charge: pushes a unit hit this far (E19). */
  readonly knockMm?: number;
  /** Charge: stands stunned this long afterwards… */
  readonly selfStunMs?: number;
  /** …and takes this much more damage meanwhile. */
  readonly vulnerablePct?: number;
}

/** Species skills (02 §2.2). One variant per mechanic; later chapters add more. */
export type EnemySkillDef =
  | { readonly kind: "poison-sting"; readonly cooldownMs: number; readonly poisonMs: number; readonly healCutPct: number }
  | { readonly kind: "fire-arrow"; readonly cooldownMs: number; readonly trapDelayMs: number }
  | { readonly kind: "pack-howl"; readonly radiusMm: number; readonly minPack: number; readonly speedPct: number };

/** Grey-box stand-in until the owner's Tripo GLB arrives: one colour per family, silhouette by gait. */
export interface PlaceholderDef {
  readonly shape: "capsule" | "box" | "sphere" | "cone";
  /** Family colour, "#rrggbb"; never a semantic colour (05 §2.2). */
  readonly color: string;
  /** Width, height, length in metres (biped tall, quadruped long and low, flyer small). */
  readonly sizeM: readonly [w: number, h: number, l: number];
  /** Flyers float this high (metres); 0 on the ground. */
  readonly hoverM: number;
}

/** Presentation keys shared by enemies, generals and our side. */
export interface PresentationDef {
  /** Future model key under /assets/dragon-hold/models/ (owner's GLB). */
  readonly model: string;
  readonly placeholder: PlaceholderDef;
  readonly material: Material;
  readonly audioSet: AudioSet;
  /** Sound slots `enemy.<id>.attack|hit|death|skill` (02 §1.5). */
  readonly sounds: { readonly attack: string; readonly hit: string; readonly death: string; readonly skill?: string };
  /** VFX keys the view maps to particle presets. */
  readonly fx: { readonly hit: string; readonly death: string; readonly attack?: string; readonly skill?: string };
}

export interface EnemyDef {
  readonly id: EnemyId;
  /** Design code, "E09". */
  readonly code: string;
  readonly nameVi: string;
  readonly nameEn: string;
  readonly family: Family;
  readonly gait: Gait;
  readonly tier: Tier;
  readonly role: EnemyRole;
  /** W × 100 (00 §4.1): HP = w100 × 90 × g(c) / 100 × difficulty (swarm and small excepted). */
  readonly w100: number;
  readonly armour: ArmourTier;
  readonly resist: ArmourTier;
  readonly speedMmS: number;
  /** Block slots it takes, in quarters: swarm 1, small 4, big 8; 0: cannot be blocked (flyers). */
  readonly blockQuarters: number;
  /** Threat ĐĐ × 10 (02 §1.2): composition and gold split only. */
  readonly threat10: number;
  readonly stance: Stance;
  /** Flight height in mm (0 on the ground). */
  readonly altitudeMm: number;
  readonly word: WordSpec;
  readonly attack: AttackDef;
  readonly skills: readonly EnemySkillDef[];
  readonly counters: readonly CounterCode[];
  /** Swarm: cluster size and spread (02 §5.2). */
  readonly cluster?: { readonly min: number; readonly max: number; readonly spreadMm: number };
  /** Pack spawns (E18): group size range. */
  readonly pack?: { readonly min: number; readonly max: number };
  /** First chapter the species appears (02 §2.1). */
  readonly firstChapter: number;
  readonly show: PresentationDef;
}

// ── Generals (02 §3) ────────────────────────────────────────────────────────

/** Aura effect kinds (02 §3.3 buff groups); icon per kind (02 §1.5). */
export type AuraKind = "speed" | "damage" | "attack-rate" | "armour" | "resist" | "word-shield" | "heal" | "tenacity" | "hide-words" | "trap-slow" | "no-push" | "thorns" | "range";
export type AuraIcon = "sword" | "shield" | "wind" | "leaf" | "chain" | "eye" | "rhombus" | "drum";

export interface AuraDef {
  readonly kind: AuraKind;
  readonly icon: AuraIcon;
  readonly radiusMm: number;
  readonly valuePct: number;
  /** Who it buffs; "all" by default. */
  readonly affects?: "all" | "beasts" | "flyers" | "swarms";
}

/** General skills (02 §3.2); one variant per mechanic. */
export type GeneralSkillDef = {
  readonly kind: "plant-banner";
  readonly cooldownMs: number;
  readonly windupMs: number;
  /** The banner stands this long… */
  readonly durationMs: number;
  /** …buffing allies within this radius… */
  readonly radiusMm: number;
  readonly damagePct: number;
  /** …and carries a word of this band to pull it out (01 §3.6). */
  readonly wordBand: WordBand;
};

export interface GeneralDef {
  readonly id: GeneralId;
  readonly code: string;
  readonly nameVi: string;
  readonly nameEn: string;
  readonly family: Family;
  readonly gait: Gait;
  readonly rank: GeneralRank;
  readonly role: EnemyRole;
  readonly w100: number;
  readonly armour: ArmourTier;
  readonly resist: ArmourTier;
  readonly speedMmS: number;
  readonly blockQuarters: number;
  readonly threat10: number;
  readonly stance: Stance;
  readonly altitudeMm: number;
  readonly word: WordSpec;
  readonly attack: AttackDef;
  readonly auras: readonly AuraDef[];
  readonly skill: GeneralSkillDef;
  /** Seal word (Ấn Phá): every Nth chain word for captains; turns auras off and staggers (01 §3.5, §3.6). */
  readonly seal: { readonly everyNthWord: number; readonly auraOffMs: number; readonly staggerMs: number; readonly reappearMs?: number };
  /** On death: allies within radius flinch (G01) or panic (warlords, 02 §3.1). */
  readonly onDeath: { readonly kind: "flinch" | "panic"; readonly radiusMm: number; readonly durationMs: number; readonly slowPct?: number; readonly vulnerablePct?: number };
  readonly counters: readonly CounterCode[];
  readonly firstChapter: number;
  readonly show: PresentationDef;
}

// ── Our side (03) ───────────────────────────────────────────────────────────

export type TrapId = "spikes" | "pine-bomb" | "net-launcher";
export type HouseId = "herb-hut";
export type UnitId = "moss-warden";
export type ConsumableId = "small-potion";
/** Bought in a run for the Fire Dragon (03 §6.2). */
export type HeroUpgradeId = "dragon-heart" | "hard-scale";
/** What sits in a map slot. */
export type PlaceableId = TrapId | HouseId | UnitId;
/** What the carry strip (Bộ Mang Theo) holds: keys 1…9 pick by index. */
export type CarryItemId = PlaceableId | ConsumableId;

/** Map slots (03 §0.1 rule 4): trap on a lane, house pad, block point. */
export type SlotKind = "trap" | "house" | "block";

/** Upgrades (03 §0.2, §7.3, §8.2, §9.2): level 2 and 3 costs as % of the base price, main effect gains. */
export interface UpgradeDef {
  /** Price of levels 2, 3 as % of the base price. */
  readonly costPct: readonly [number, number];
  /** Main effect gain at levels 2, 3, in % (cumulative: 145 then ×1.35). */
  readonly mainPct: readonly [number, number];
  /** Recharge change at level 3 in % (traps: −15). */
  readonly rechargePctAt3?: number;
  /** HP gain per level in % (houses, units). */
  readonly hpPct?: number;
  /** Attack gain per level in % (units). */
  readonly attackPct?: number;
}

/** Where a placed item sits and how big it is (placement ghost, view). */
export interface Footprint {
  readonly slot: SlotKind;
  readonly radiusMm: number;
}

/** 03 §7.1: floor traps hit ground (and grounded) foes; posts stand by the road and reach low air; hidden ones hit the first foe. */
export type TrapStyle = "floor" | "post" | "hidden";

export type TrapEffect =
  | { readonly kind: "spikes"; readonly slowPct: number; readonly dps: number; readonly damageType: DamageType }
  | { readonly kind: "bomb"; readonly damage: number; readonly damageType: DamageType; readonly pushMm: number }
  | { readonly kind: "net"; readonly groundMs: number; readonly targets: number };

export interface TrapDef {
  readonly id: TrapId;
  readonly nameVi: string;
  readonly style: TrapStyle;
  /** Runs all the time (no recharge): Gai Chông, Bùn Lầy. */
  readonly continuous: boolean;
  readonly cost: number;
  readonly rechargeMs: number;
  /** Area: a strip along the lane or a circle. */
  readonly area: { readonly shape: "strip" | "circle"; readonly radiusMm: number; readonly lengthMm?: number };
  /** Auto trigger: needs this many foes in the area (03 §7.2). */
  readonly triggerMin: number;
  /** Has the optional trigger word (Từ Kích, 03 §10.3); off for M0 (00 D13). */
  readonly wordTrigger: boolean;
  readonly hits: { readonly ground: boolean; readonly lowAir: boolean };
  readonly effect: TrapEffect;
  readonly element?: Element;
  readonly upgrade: UpgradeDef;
  readonly footprint: Footprint;
  readonly counters: readonly CounterCode[];
  /** Chapter-1 stage that unlocks it (03 §12.1). */
  readonly unlockStage: number;
  readonly show: OurShowDef;
}

export type HouseEffect = { readonly kind: "heal-aura"; readonly healPmPerS: number; readonly targets: "allies" };
export type HousePulse = { readonly kind: "heal-burst"; readonly healPct: number };

export interface HouseDef {
  readonly id: HouseId;
  readonly nameVi: string;
  readonly cost: number;
  readonly hp: number;
  readonly radiusMm: number;
  readonly effect: HouseEffect;
  /** Fires when its energy reaches the rules' charge (03 §10.2). */
  readonly pulse: HousePulse;
  /** Max per run; undefined: no limit. */
  readonly limit?: number;
  readonly upgrade: UpgradeDef;
  readonly footprint: Footprint;
  readonly counters: readonly CounterCode[];
  readonly unlockStage: number;
  readonly show: OurShowDef;
}

export interface UnitDef {
  readonly id: UnitId;
  readonly nameVi: string;
  readonly role: "blocker" | "support" | "hunter" | "decoy" | "controller";
  readonly cost: number;
  /** Block slots in whole foes (03 §9.1); big foes take 2. */
  readonly blockSlots: number;
  readonly hp: number;
  readonly armour: ArmourTier;
  readonly resist: ArmourTier;
  readonly attack: { readonly damage: number; readonly periodMs: number; readonly rangeMm: number; readonly damageType: DamageType };
  readonly respawnMs: number;
  /** How many stand at one block point. */
  readonly count: number;
  readonly upgrade: UpgradeDef;
  readonly footprint: Footprint;
  readonly counters: readonly CounterCode[];
  readonly unlockStage: number;
  readonly show: OurShowDef;
}

export type ConsumableEffect = { readonly kind: "heal-over-time"; readonly healPct: number; readonly durationMs: number };

export interface ConsumableDef {
  readonly id: ConsumableId;
  readonly nameVi: string;
  readonly cost: number;
  /** Shared cooldown after use (03 §6.3). */
  readonly cooldownMs: number;
  readonly stackMax: number;
  readonly effect: ConsumableEffect;
  /** Area effects aim here; none: self (the Fire Dragon). */
  readonly area?: { readonly radiusMm: number };
  readonly unlockStage: number;
  readonly show: OurShowDef;
}

export type HeroUpgradeEffect =
  | { readonly kind: "max-hp"; readonly pct: number }
  | { readonly kind: "armour"; readonly amount: number }
  | { readonly kind: "resist"; readonly amount: number };

export interface HeroUpgradeDef {
  readonly id: HeroUpgradeId;
  readonly nameVi: string;
  /** Price of the 1st, 2nd, 3rd buy in a run. */
  readonly costs: readonly number[];
  readonly maxPerRun: number;
  readonly effect: HeroUpgradeEffect;
  readonly unlockStage: number;
  readonly show: OurShowDef;
}

/** Our-side presentation keys. */
export interface OurShowDef {
  readonly model: string;
  readonly placeholder: PlaceholderDef;
  readonly icon: string;
  readonly sounds: { readonly place?: string; readonly fire?: string; readonly hit?: string; readonly down?: string; readonly use?: string };
  readonly fx: { readonly place?: string; readonly fire?: string; readonly hit?: string; readonly ready?: string };
}

// ── The two Dragons (01 §2) ─────────────────────────────────────────────────

/** Fire Dragon skills and ultimate (01 §2.4); the White Dragon's come at M1. */
export type HeroSkillId = "breath" | "skyfire" | "roar" | "inferno";

// ── Maps (04 §3, 03 §7–9) ───────────────────────────────────────────────────

/** Along-lane features, as distance ranges in metres from the gate. */
export type LaneFeature =
  | { readonly kind: "bridge"; readonly fromM: number; readonly toM: number; readonly widthM: number }
  | { readonly kind: "ford"; readonly fromM: number; readonly toM: number; readonly slowPct: number; readonly wetMs: number };

export interface LaneDef {
  readonly id: string;
  readonly nameVi: string;
  /** Polyline in metres: the gate first, the last point on the melee ring (6 m) facing the dais. */
  readonly points: readonly Vec2[];
  /** Dirt path width for the view. */
  readonly widthM: number;
  readonly features: readonly LaneFeature[];
}

export interface SkyLaneDef {
  readonly id: string;
  readonly nameVi: string;
  /** Ground projection of the flight arc, gate first, ending on the flyers' ring. */
  readonly points: readonly Vec2[];
  readonly altitudeM: number;
}

export interface RiverDef {
  /** Centreline in metres, upstream first; the ends run out into the skirt. */
  readonly points: readonly Vec2[];
  /** Water width at each point (river upstream, stream downstream). */
  readonly widthsM: readonly number[];
  readonly depthM: number;
  /** Water stays this far below the banks. */
  readonly bankM: number;
  /** Shallow stretches (fords): the view lifts the bed and adds stones; the sim reads the lane's ford feature. */
  readonly shallows: readonly { readonly center: Vec2; readonly radiusM: number }[];
}

export interface SlotDef {
  readonly id: string;
  readonly kind: SlotKind;
  /** Ground position in metres (for lane slots: the lane point at `atM`). */
  readonly pos: Vec2;
  /** Lane slots: lane id and distance from its gate. */
  readonly lane?: string;
  readonly atM?: number;
  /** House pads: inner ring 7–10 m or outer ring 14–20 m (03 §8.1). */
  readonly ring?: "inner" | "outer";
}

/** Procedural ground for the grey box (view-terrain); sim never reads it. */
export interface TerrainDef {
  readonly seed: number;
  /** Square ground side in metres (play area plus the 40 m skirt, 05 §3). */
  readonly sizeM: number;
  readonly playRadiusM: number;
  /** Rolling hills amplitude away from paths. */
  readonly reliefM: number;
  readonly kit: "pine-river";
}

export interface MapDef {
  /** Layout id (04 §3.1). */
  readonly id: string;
  readonly nameVi: string;
  readonly dais: { readonly center: Vec2; readonly radiusM: number; readonly heroHoverM: number; readonly guideAt: Vec2 };
  readonly lanes: readonly LaneDef[];
  readonly sky: readonly SkyLaneDef[];
  readonly river: RiverDef | null;
  readonly slots: readonly SlotDef[];
  readonly terrain: TerrainDef;
  /** Default camera (05 §3): yaw 0 looks north from the south. */
  readonly camera: { readonly yawDeg: number; readonly pitchDeg: number; readonly distanceM: number };
}

// ── Waves and stages (02 §5, 04 §11) ────────────────────────────────────────

/** Group shapes (02 §5.2). */
export type SpawnShape = "single" | "pair" | "line" | "cluster" | "escort" | "pincer" | "flight";

export interface SpawnGroupDef {
  /** From the wave start; the sim scales gaps by 1 / k_E (00 §4.4). */
  readonly atMs: number;
  /** Ground lane id or sky lane id. */
  readonly lane: string;
  readonly shape: SpawnShape;
  readonly foe: FoeId;
  readonly count: number;
  /** Gap inside the group; defaults per shape (02 §5.2). */
  readonly gapMs?: number;
  /** Escorts around a general or heavy foe, half ahead, half behind (02 §5.2). */
  readonly escort?: { readonly foe: EnemyId; readonly count: number };
  readonly elite?: boolean;
}

export interface WaveDef {
  /** 1-based. */
  readonly n: number;
  readonly durationMs: number;
  /** Target average load L × 100 (00 §4.4). */
  readonly load100: number;
  /** Short peak cap × 100 (00 §4.4). */
  readonly peakLoad100: number;
  /** 2–3 peaks of 6–10 s (02 §5.3), as offsets from the wave start. */
  readonly peaks: readonly { readonly atMs: number; readonly lengthMs: number }[];
  readonly generals: readonly GeneralId[];
  /** Breather wave: load −20 % against the curve (02 §5.1). */
  readonly breather?: boolean;
  readonly groups: readonly SpawnGroupDef[];
}

/** 00 §4.5. */
export type StageType = "teach" | "normal" | "general" | "review" | "mini-boss" | "boss";

/** Systems switched on for a stage (04 §6: a closed system has no words, no slot, no first letter). */
export interface StageUnlocks {
  readonly heroSkills: readonly HeroSkillId[];
  readonly rage: boolean;
  readonly urgentWord: boolean;
  /** Bạch Long fights (shield, gale, assist words): false while he only guides (00 D21). */
  readonly guideFights: boolean;
  readonly triggerWords: boolean;
  readonly reviewCard: boolean;
  readonly learnAhead: boolean;
  readonly heroUpgrades: readonly HeroUpgradeId[];
}

export interface StageDef {
  readonly id: string;
  readonly nameVi: string;
  /** Strength chapter: g(c), live cap, flyer cap (00 §4.8). */
  readonly chapter: number;
  /** Stage number inside the chapter (1–20). */
  readonly index: number;
  readonly type: StageType;
  readonly mapId: string;
  /** Default run seed; a run may pass its own. */
  readonly seed: number;
  /** Lanes in play (ground lane ids, then sky lane ids). */
  readonly lanes: readonly string[];
  readonly waves: readonly WaveDef[];
  /** Carry strip (Bộ Mang Theo), keys 1…9 in this order (03 §0.1 rule 5). */
  readonly carry: readonly CarryItemId[];
  readonly unlocks: StageUnlocks;
  /** Elites as % of foes (00 §4.8); M0 has none. */
  readonly elitePct: number;
  /** Optional overrides of the chapter table, each with a reason in the data file. */
  readonly peakLoadCap100?: number;
  readonly liveCap?: number;
  /** Overrides f_type of the gold budget (00 §4.9), in %. */
  readonly goldTypePct?: number;
}

// ── Words and learning (01 §3, §6) ──────────────────────────────────────────

/** Learning groups (01 §6.1). */
export type WordGroup = "new" | "due" | "learning" | "known";

/** What a live word belongs to (01 §3.6); first-letter priority follows 01 §3.3. */
export type WordKind =
  | "enemy"
  | "cluster"
  | "elite"
  | "general"
  | "seal" // Ấn Phá
  | "flag" // G01's banner word
  | "interrupt" // Từ Ngắt
  | "urgent" // Từ Khẩn → Long Hống
  | "skill" // Chữ Chiêu
  | "assist" // Từ Trợ
  | "trigger" // Từ Kích
  | "boss-part"
  | "boss-seal" // Cụm Ấn
  | "map";

/** Learning activity types (01 §6.6). */
export type ActivityType = "typing-enemy" | "typing-elite" | "typing-boss" | "typing-skill" | "meaning-recall" | "listening" | "review-card";

/** One word the run may deal; meanings and IPA stay in the app (learning frame). */
export interface DeckWord {
  /** Lower case a–z, NFKC-normalised (01 §6.6 entityId). */
  readonly text: string;
  readonly group: WordGroup;
  readonly level: number;
  /** Shared-learning mastery 0–100 (read only, 01 §6.3). */
  readonly mastery: number;
  /** Correct recalls (meaning-recall, listening, review-card), 01 §6.3. */
  readonly recalls: number;
}

/** The stage's word set (70–100 words, 01 §6.1), built by the app before createWorld. */
export interface WordDeck {
  readonly words: readonly DeckWord[];
  /** Vocabulary level of the stage (letter rules: q x z j avoided up to 10). */
  readonly vocabLevel: number;
}

// ── Simulation input (00 §6 keys become these commands) ────────────────────

export type SimCommand =
  /** a–z as 0–25; `ms` is wall time for learning responseMs only, never read by rules. */
  | { readonly type: "key"; readonly letter: number; readonly ms?: number }
  | { readonly type: "backspace" }
  /** Esc, first step: let go of the locked word. */
  | { readonly type: "release" }
  /** Left click on a foe: word priority and skill target (01 §3.9). */
  | { readonly type: "mark"; readonly enemy: EnemyRef }
  /** Alt + 1/2/5 (roar comes from the urgent word). `at`: metres, the hovered point. */
  | { readonly type: "skill"; readonly skill: HeroSkillId; readonly at?: Vec2 }
  /** Alt + 7/8/9. */
  | { readonly type: "consumable"; readonly item: ConsumableId; readonly at?: Vec2 }
  | { readonly type: "buy"; readonly item: ConsumableId | HeroUpgradeId }
  | { readonly type: "place"; readonly item: PlaceableId; readonly slot: string }
  | { readonly type: "upgrade"; readonly slot: string }
  | { readonly type: "sell"; readonly slot: string }
  /** Enter in prep: the first wave warning starts. */
  | { readonly type: "start" }
  /** Shift + Enter during a break (00 §4.5). */
  | { readonly type: "call-early" }
  /** Enter on Easy: the break ends (00 §4.5). */
  | { readonly type: "continue" }
  /** Prep: words typed right in Học trước (01 §6.5); gold goes through the sim so replays match. */
  | { readonly type: "learn-ahead"; readonly correct: number }
  /** Break: one Thẻ Ôn answer (01 §6.5); right gives gold and XP. */
  | { readonly type: "review-card"; readonly correct: boolean };

// ── Simulation output: the event union view, audio and UI consume ───────────

/** Run phases: prep (Bày binh) → warning (Báo đợt 6 s) → wave → break → … → victory | defeat. */
export type Phase = "prep" | "warning" | "wave" | "break" | "victory" | "defeat";

/** A foe in the enemy store: `slot` is reused, `serial` never (stable id for the view). */
export interface EnemyRef {
  readonly slot: number;
  readonly serial: number;
}

export type EntityRef =
  | { readonly kind: "enemy"; readonly slot: number; readonly serial: number }
  | { readonly kind: "hero" }
  | { readonly kind: "guide" }
  /** Placed items by map slot index (MapDef.slots); units by unit index. */
  | { readonly kind: "trap"; readonly slot: number }
  | { readonly kind: "house"; readonly slot: number }
  | { readonly kind: "unit"; readonly slot: number };

/** Movement state changes (positions themselves are read from the world each frame). */
export type MoveMode = "walk" | "blocked" | "attack" | "hold" | "knockback" | "grounded" | "airborne" | "stunned" | "retreat" | "charge";

export type KillSource = "word" | "breath" | "skyfire" | "roar" | "inferno" | "trap" | "unit" | "house" | "status" | "consumable";
export type GoldReason = "start" | "kill" | "wave-end" | "call-early" | "learn-ahead" | "review-card" | "build" | "upgrade" | "sell" | "buy" | "repair";
export type StatusId =
  // On foes (03 §2.3) and units.
  | "slow" | "stun" | "root" | "freeze" | "grounded" | "knockback" | "pull" | "burn" | "poison" | "wet" | "oiled" | "mark" | "sunder" | "silence" | "reveal" | "taunt"
  | "vulnerable" // E19 after a charge, panic
  | "flinch" // G01 death
  | "steadfast" // Vững: immune to hard control
  // On our side.
  | "shield" | "regen" | "fortify" | "haste" | "curse";
/** Key results (TD router codes plus the tier-2 pair and backspace). */
export type WordKeyResult = "lock" | "advance" | "done" | "wrong" | "switch" | "stray" | "pair" | "back" | "asleep";
export type WordReleaseReason = "done" | "target-gone" | "hidden" | "replaced" | "released" | "phase";
export type TelegraphShape = "circle" | "line" | "cone" | "arc";

/** Every event carries the tick it happened on. Positions are metres for readers; the sim never reads events back. */
export type SimEvent = { readonly tick: number } & (
  | { readonly type: "phase"; readonly phase: Phase; readonly wave: number; readonly endsAtTick: number }
  | { readonly type: "wave-start"; readonly wave: number; readonly waves: number; readonly lanes: readonly string[]; readonly generals: readonly GeneralId[] }
  | { readonly type: "wave-end"; readonly wave: number; readonly bonusGold: number }
  | { readonly type: "spawn"; readonly enemy: EnemyRef; readonly foe: FoeId; readonly lane: string; readonly x: number; readonly z: number; readonly elite: boolean; readonly cluster: number }
  | { readonly type: "move"; readonly enemy: EnemyRef; readonly mode: MoveMode; readonly x: number; readonly z: number }
  | { readonly type: "attack"; readonly source: EntityRef; readonly target: EntityRef; readonly stage: "windup" | "strike"; readonly x: number; readonly z: number; readonly tx: number; readonly tz: number }
  | {
      readonly type: "telegraph";
      readonly id: number;
      /** Enemy warnings are red; ours (Thiên Hỏa) pale orange (05 §6). */
      readonly owner: "enemy" | "ally";
      readonly shape: TelegraphShape;
      readonly x: number;
      readonly z: number;
      readonly toX: number;
      readonly toZ: number;
      readonly radiusM: number;
      readonly widthM: number;
      readonly durationMs: number;
      readonly source: EntityRef;
    }
  | {
      readonly type: "hit";
      readonly target: EntityRef;
      readonly source: EntityRef;
      readonly amount: number;
      readonly damageType: DamageType;
      readonly tier: FeedbackTier;
      readonly grade: Grade | null;
      readonly x: number;
      readonly z: number;
      readonly hpLeft: number;
    }
  | { readonly type: "death"; readonly enemy: EnemyRef; readonly foe: FoeId; readonly by: KillSource; readonly x: number; readonly z: number; readonly material: Material; readonly tier: FeedbackTier }
  | { readonly type: "trap-trigger"; readonly slot: number; readonly trap: TrapId; readonly x: number; readonly z: number; readonly count: number }
  | { readonly type: "status"; readonly target: EntityRef; readonly status: StatusId; readonly on: boolean; readonly durationMs: number; readonly x: number; readonly z: number }
  | {
      readonly type: "word-assigned";
      /** Word store slot. */
      readonly word: number;
      readonly text: string;
      readonly kind: WordKind;
      readonly group: WordGroup;
      readonly target: EntityRef | null;
      /** First-letter tier: 1 own letter, 2 shared pair (01 §3.3). */
      readonly firstTier: 1 | 2;
    }
  | { readonly type: "word-progress"; readonly word: number; readonly typed: number; readonly key: WordKeyResult; readonly letter: number }
  | {
      readonly type: "word-complete";
      readonly word: number;
      readonly text: string;
      readonly kind: WordKind;
      readonly grade: Grade;
      readonly errors: number;
      /** First key to last key, ticks (t_k, 01 §3.7). */
      readonly keyTicks: number;
      /** Wall time from the keys' `ms`, for learning only (01 §6.6). */
      readonly responseMs: number;
      readonly target: EntityRef | null;
      readonly activity: ActivityType;
      /** The one scored learning event of this word in this run (00 D14). */
      readonly scored: boolean;
      readonly hintUsed: boolean;
    }
  | { readonly type: "word-released"; readonly word: number; readonly reason: WordReleaseReason }
  | { readonly type: "grade"; readonly word: number; readonly grade: Grade; readonly mqPm: number; readonly chain: number; readonly chainTier: number }
  | { readonly type: "gold"; readonly delta: number; readonly total: number; readonly reason: GoldReason }
  | { readonly type: "rage"; readonly value: number; readonly full: boolean }
  | { readonly type: "skill"; readonly skill: HeroSkillId; readonly stage: "ready" | "cast" | "impact" | "end"; readonly x: number; readonly z: number }
  | { readonly type: "hero-level"; readonly level: number }
  | { readonly type: "built"; readonly slot: number; readonly item: PlaceableId; readonly level: number }
  | { readonly type: "upgraded"; readonly slot: number; readonly item: PlaceableId; readonly level: number }
  | { readonly type: "sold"; readonly slot: number; readonly item: PlaceableId; readonly refund: number }
  | { readonly type: "bought"; readonly item: ConsumableId | HeroUpgradeId; readonly count: number }
  | { readonly type: "consumable"; readonly item: ConsumableId; readonly x: number; readonly z: number }
  | { readonly type: "rejected"; readonly command: SimCommand["type"]; readonly reason: string }
  | { readonly type: "unit-down"; readonly unit: number; readonly x: number; readonly z: number }
  | { readonly type: "unit-up"; readonly unit: number; readonly x: number; readonly z: number }
  | { readonly type: "house-pulse"; readonly slot: number; readonly house: HouseId; readonly x: number; readonly z: number }
  | { readonly type: "aura"; readonly enemy: EnemyRef; readonly aura: AuraKind; readonly on: boolean; readonly radiusM: number }
  | { readonly type: "defeat"; readonly wave: number }
  | { readonly type: "victory"; readonly stars: 1 | 2 | 3 }
);

export type SimEventType = SimEvent["type"];
/** The event of one type, e.g. `EventOf<"hit">`. */
export type EventOf<T extends SimEventType> = Extract<SimEvent, { readonly type: T }>;
