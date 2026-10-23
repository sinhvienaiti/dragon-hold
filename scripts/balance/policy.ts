/**
 * The bots' plan outside the keys (03 §13.1): what to buy and place in prep
 * and breaks, Dragon skills (Alt + 1, 2, 5), potions, learn-ahead, review
 * cards, the start. Buying styles:
 *   balanced: the "average kit" (Cân Bằng): each break, score every action by
 *             value per gold against the next wave's card, take the best,
 *             keep 10 % of the gold for potions;
 *   best:     the no-typing floor bot (G6): spends everything, leans on
 *             killers and holders, buys Tim Rồng and Vảy Cứng;
 *   poor:     a weak buyer (BALANCE.md §6 tactics "Kém"): keeps 30 % of its
 *             gold, buys only clearly good value, never upgrades;
 *   none:     typing only, never buys.
 * Skill timing follows the tactics too: a poor player waits for bigger
 * groups, a good one casts on smaller ones.
 * Values are rough "W held or killed per wave" points (03 §13.1 asks for
 * points per gold, not an exact model). Every action goes out as a
 * SimCommand; the world decides, and a refused one is not tried again in the
 * same break. Script side: floats are fine here.
 * Owner: bot-balance (LANES.md).
 */
import type { RngStream } from "../../src/kit/platform";
import { CONSUMABLES, HERO_UPGRADES, HOUSES, TRAPS, UNITS } from "../../src/content/data/our-side";
import { BLOCK, HERO_SKILLS, RAGE, RINGS } from "../../src/content/rules";
import type { ConsumableId, HeroSkillId, HeroUpgradeId, PlaceableId, SimCommand, TrapId, Vec2, WaveDef } from "../../src/content/types";
import { U_PER_M } from "../../src/sim/fixed";
import type { SlotState } from "../../src/sim/placement";
import type { World } from "../../src/sim/world";
import { foeDef, isClusterFoe } from "./load";
import { liveFoes, metresFromDais } from "./reader";

export type BuyStyle = "balanced" | "best" | "poor" | "none";
/** BALANCE.md §6 tactics level: skill timing (buying is `buy`). */
export type SkillTactics = "poor" | "fair" | "good";

/** Foes a skill waits for, by tactics: Phun Lửa (in 12 m), Thiên Hỏa (in 4 m), Viêm Đế (in the word zone). */
const SKILL_WAIT: Readonly<Record<SkillTactics, { breath: number; skyfire: number; inferno: number }>> = {
  poor: { breath: 4, skyfire: 4, inferno: 7 },
  fair: { breath: 3, skyfire: 3, inferno: 5 },
  good: { breath: 2, skyfire: 3, inferno: 4 },
};

export interface PolicySpec {
  readonly buy: BuyStyle;
  /** The bot types (Viêm Đế pays off through its beams only then). */
  readonly typing: boolean;
  /** Uses Phun Lửa, Thiên Hỏa, Viêm Đế by their keys. */
  readonly skills: boolean;
  /** Chance each of the 8 learn-ahead words is right (0: skips Học trước). */
  readonly learnAhead: number;
  /** Chance a review card is right (0: skips Thẻ Ôn). */
  readonly reviewCards: number;
  /** Skill timing (default fair). */
  readonly tactics?: SkillTactics;
}

/** What the plan may touch: the world to read, a sink for commands, the typist's hands, its own dice. */
export interface PlanView {
  readonly world: World;
  readonly nowMs: number;
  send(command: SimCommand): void;
  /** The hands are busy with a command key for `ms` (no typing meanwhile). */
  hold(ms: number): void;
  readonly rng: RngStream;
}

// ── The next wave's card (03 §4.1: the break shows what comes) ─────────────

export interface LaneCard {
  groundW: number;
  meleeW: number;
  rangedW: number;
  clusters: number;
  packs: number;
  chargers: number;
}

export interface WaveCard {
  /** By world lane index (sky lanes stay empty; flyers are counted apart). */
  readonly lanes: LaneCard[];
  flyers: number;
  general: boolean;
  /** False when the wave has no groups yet (the stub data): a guessed card. */
  readonly planned: boolean;
}

const emptyLane = (): LaneCard => ({ groundW: 0, meleeW: 0, rangedW: 0, clusters: 0, packs: 0, chargers: 0 });

/** The card of `wave` (0-based index into the stage's waves). */
export function waveCard(world: World, index: number): WaveCard {
  const wave: WaveDef | undefined = world.stage.waves[Math.min(Math.max(index, 0), world.stage.waves.length - 1)];
  const lanes = world.lanes.map(emptyLane);
  const card: WaveCard = { lanes, flyers: 0, general: (wave?.generals.length ?? 0) > 0, planned: (wave?.groups.length ?? 0) > 0 };
  if (!wave || wave.groups.length === 0) {
    // Guess from the M0 recipe (DESIGN.md §5.4): mostly grunts, a cluster a lane, wasps from wave 3.
    world.lanes.forEach((lane, k) => {
      if (lane.sky) return;
      Object.assign(lanes[k]!, { groundW: 6, meleeW: 5, rangedW: 1, clusters: 1, packs: 0.5, chargers: 0.3 });
    });
    card.flyers = index >= 2 ? 2 : 0;
    return card;
  }
  for (const group of wave.groups) {
    const lane = world.lanes.findIndex((runtime) => runtime.id === group.lane);
    const def = foeDef(group.foe);
    if (lane < 0) continue;
    if (world.lanes[lane]!.sky || def.gait === "flyer") {
      card.flyers += group.count;
      continue;
    }
    const into = lanes[lane]!;
    if (isClusterFoe(group.foe)) {
      into.clusters += 1;
      continue;
    }
    const w = (def.w100 / 100) * group.count;
    into.groundW += w;
    if (def.role === "ranged") into.rangedW += w;
    else into.meleeW += w;
    if (def.role === "pack") into.packs += group.count / 4;
    if (def.role === "charger") into.chargers += group.count;
    if (group.escort) {
      const escort = foeDef(group.escort.foe);
      const ew = (escort.w100 / 100) * group.escort.count;
      into.groundW += ew;
      if (escort.role === "ranged") into.rangedW += ew;
      else into.meleeW += ew;
    }
  }
  return card;
}

// ── Buying ─────────────────────────────────────────────────────────────────

export interface ShopAction {
  /** Unique per state (slot, item, level, count), so one refusal blocks only this try. */
  readonly key: string;
  readonly command: SimCommand;
  readonly cost: number;
  readonly value: number;
}

const ITEM_COST: Readonly<Record<PlaceableId, number>> = {
  spikes: TRAPS.spikes.cost,
  "pine-bomb": TRAPS["pine-bomb"].cost,
  "net-launcher": TRAPS["net-launcher"].cost,
  "moss-warden": UNITS["moss-warden"].cost,
  "herb-hut": HOUSES["herb-hut"].cost,
};

const TRAP_IDS: readonly TrapId[] = ["spikes", "pine-bomb", "net-launcher"];

/** Upgrade price from `level` to `level + 1` (03 §0.2: 70 %, then 100 % of the base). */
export function upgradeCost(item: PlaceableId, level: number): number {
  const pct = level === 1 ? 70 : 100;
  return Math.round((ITEM_COST[item] * pct) / 100);
}

const slotM = (slot: SlotState): Vec2 => [slot.x / U_PER_M, slot.z / U_PER_M];
const distM = (a: Vec2, b: Vec2): number => Math.sqrt((a[0] - b[0]) * (a[0] - b[0]) + (a[1] - b[1]) * (a[1] - b[1]));

/** Where flyers end up (the sky lanes' last points, metres). */
function flyerEnds(world: World): Vec2[] {
  return world.lanes.filter((lane) => lane.sky).map((lane) => [lane.xs[lane.xs.length - 1]! / U_PER_M, lane.zs[lane.zs.length - 1]! / U_PER_M] as Vec2);
}

/** Style weights: the floor bot leans on killers and holders. */
const WEIGHTS: Readonly<Record<Exclude<BuyStyle, "none">, Readonly<Record<PlaceableId | "hero" | "potion", number>>>> = {
  balanced: { spikes: 1, "pine-bomb": 1, "net-launcher": 1, "moss-warden": 1, "herb-hut": 1, hero: 1, potion: 1 },
  poor: { spikes: 1, "pine-bomb": 0.8, "net-launcher": 0.7, "moss-warden": 0.9, "herb-hut": 0.8, hero: 0.8, potion: 1 },
  best: { spikes: 1.3, "pine-bomb": 1.5, "net-launcher": 1.1, "moss-warden": 1.2, "herb-hut": 1, hero: 1.4, potion: 1.2 },
};

/** Value of `item` standing in `slot` against `card`, before diminishing returns. */
function baseValue(world: World, card: WaveCard, slot: SlotState, item: PlaceableId): number {
  const kind = slot.def.kind;
  const lane = slot.lane >= 0 ? card.lanes[slot.lane] : undefined;
  const runtime = slot.lane >= 0 ? world.lanes[slot.lane] : undefined;
  const wardenNear = world.slots.some((other) => other.item === "moss-warden" && other.lane === slot.lane && Math.abs(other.along - slot.along) <= 5 * U_PER_M);
  const choke = runtime !== undefined && runtime.bridges.some((span) => slot.along >= span.from && slot.along <= span.to) ? 1.2 : 1;
  const synergy = (wardenNear ? 1.4 : 1) * choke;
  switch (item) {
    case "spikes":
      return kind === "trap" && lane ? 0.3 * lane.groundW * synergy : 0;
    case "pine-bomb":
      return kind === "trap" && lane ? (1.5 * lane.clusters + 0.5 * lane.packs + 0.15 * lane.groundW) * synergy : 0;
    case "net-launcher": {
      if (kind !== "trap") return 0;
      const reach = Math.min(...flyerEnds(world).map((end) => distM(slotM(slot), end)));
      const range = TRAPS["net-launcher"].area.radiusMm / 1000;
      return 0.9 * card.flyers * (reach <= range ? 1 : reach <= range + 4 ? 0.5 : 0);
    }
    case "moss-warden": {
      if (kind !== "block" || !lane || !runtime) return 0;
      // The point nearer the dais holds longer; the far one buys typing time.
      const near = runtime.length - slot.along < 8 * U_PER_M ? 1 : 0.85;
      return 0.45 * (lane.meleeW + 2 * lane.packs) * near;
    }
    case "herb-hut": {
      if (kind !== "house") return 0;
      const radius = HOUSES["herb-hut"].radiusMm / 1000;
      const reachesHero = distM(slotM(slot), [0, 0]) <= radius + world.map.dais.radiusM;
      const units = world.slots.filter((other) => other.item === "moss-warden" && distM(slotM(slot), slotM(other)) <= radius).length;
      return (reachesHero ? 2 : 0) + 0.5 * units;
    }
  }
}

/** How many of `item` already stand on the lane of `slot` (houses: anywhere). */
function standing(world: World, slot: SlotState, item: PlaceableId): number {
  return world.slots.filter((other) => other.item === item && (item === "herb-hut" || other.lane === slot.lane)).length;
}

/** Every shop action now, scored for `card`. */
export function shopActions(world: World, card: WaveCard, style: Exclude<BuyStyle, "none">): ShopAction[] {
  const weights = WEIGHTS[style];
  const out: ShopAction[] = [];
  const units = world.slots.filter((slot) => slot.item === "moss-warden").length;
  const carried = (item: PlaceableId | ConsumableId) => world.stage.carry.includes(item);
  for (const slot of world.slots) {
    if (slot.item === null) {
      const items: PlaceableId[] = slot.def.kind === "trap" ? [...TRAP_IDS] : slot.def.kind === "block" ? (units < BLOCK.maxUnits ? ["moss-warden"] : []) : ["herb-hut"];
      for (const item of items) {
        if (!carried(item)) continue;
        const value = baseValue(world, card, slot, item) * Math.pow(0.6, standing(world, slot, item)) * weights[item];
        if (value > 0) out.push({ key: "place:" + slot.def.id + ":" + item, command: { type: "place", item, slot: slot.def.id }, cost: ITEM_COST[item], value });
      }
    } else if (slot.level >= 1 && slot.level < 3 && style !== "poor") {
      const gain = slot.level === 1 ? 0.45 : 0.35;
      const value = baseValue(world, card, slot, slot.item) * gain * weights[slot.item];
      if (value > 0) out.push({ key: "upgrade:" + slot.def.id + ":" + slot.level, command: { type: "upgrade", slot: slot.def.id }, cost: upgradeCost(slot.item, slot.level), value });
    }
  }
  const late = 0.5 + Math.min(world.wave, 10) / 10;
  const heroBuys: readonly [HeroUpgradeId, number][] = [["dragon-heart", 1.2], ["hard-scale", 1]];
  for (const [id, base] of heroBuys) {
    if (!world.stage.unlocks.heroUpgrades.includes(id)) continue;
    const bought = world.shop.heroBuys[id] ?? 0;
    const def = HERO_UPGRADES[id];
    if (bought >= def.maxPerRun) continue;
    out.push({ key: "buy:" + id + ":" + bought, command: { type: "buy", item: id }, cost: def.costs[bought] ?? def.costs[def.costs.length - 1]!, value: base * late * weights.hero * Math.pow(0.8, bought) });
  }
  const potion: ConsumableId = "small-potion";
  if (carried(potion)) {
    const held = world.shop.held[potion] ?? 0;
    const want = style === "best" ? 2 : 1;
    if (held < want) out.push({ key: "buy:" + potion + ":" + held, command: { type: "buy", item: potion }, cost: CONSUMABLES[potion].cost, value: (held === 0 ? 2.5 : 1.2) * weights.potion });
  }
  return out;
}

/** The best affordable action above the reserve and the floor, or null. */
export function bestShopAction(actions: readonly ShopAction[], gold: number, reserve: number, minPer100: number, tried: ReadonlySet<string>): ShopAction | null {
  let best: ShopAction | null = null;
  let bestRatio = minPer100;
  for (const action of actions) {
    if (tried.has(action.key) || action.cost > gold - reserve) continue;
    const ratio = (action.value * 100) / action.cost;
    if (ratio > bestRatio) [best, bestRatio] = [action, ratio];
  }
  return best;
}

// ── Skills and potions in a wave ───────────────────────────────────────────

const SKILL_COOLDOWN_MS: Readonly<Record<HeroSkillId, number>> = {
  breath: HERO_SKILLS.breath.cooldownMs,
  skyfire: HERO_SKILLS.skyfire.cooldownMs,
  roar: 0,
  inferno: RAGE.minIntervalMs,
};

// ── The plan ───────────────────────────────────────────────────────────────

const SHOP_EVERY_MS = 500;
const TACTICS_EVERY_MS = 250;

export class Plan {
  private phase = "";
  private phaseAtMs = 0;
  private nextShopMs = 0;
  private nextTacticsMs = 0;
  private readonly tried = new Set<string>();
  private learned = false;
  private started = false;
  private cardsLeft = 0;
  private readonly castAtMs: Partial<Record<HeroSkillId, number>> = {};
  /** Commands sent, by type (the report's "decisions"). */
  readonly sent: Record<string, number> = {};
  /** When the start command went out (−1: not yet). */
  startedAtMs = -1;

  constructor(readonly spec: PolicySpec) {}

  tick(view: PlanView): void {
    const { world, nowMs } = view;
    if (world.phase !== this.phase) {
      this.phase = world.phase;
      this.phaseAtMs = nowMs;
      this.tried.clear();
      this.nextShopMs = nowMs + (world.phase === "break" ? 1000 : 0);
      if (world.phase === "break") this.cardsLeft = this.spec.reviewCards > 0 ? 3 : 0;
    }
    switch (world.phase) {
      case "prep":
        return this.prep(view);
      case "break":
        return this.breakTime(view);
      case "warning":
      case "wave":
        return this.tactics(view);
      default:
        return;
    }
  }

  private send(view: PlanView, command: SimCommand): void {
    this.sent[command.type] = (this.sent[command.type] ?? 0) + 1;
    view.send(command);
  }

  private prep(view: PlanView): void {
    if (this.started || view.nowMs < this.nextShopMs) return;
    this.nextShopMs = view.nowMs + SHOP_EVERY_MS;
    if (this.shopStep(view)) return;
    if (!this.learned && this.spec.learnAhead > 0) {
      this.learned = true;
      let correct = 0;
      for (let k = 0; k < 8; k += 1) if (view.rng.chance(this.spec.learnAhead)) correct += 1;
      this.send(view, { type: "learn-ahead", correct });
      return;
    }
    this.started = true;
    this.startedAtMs = view.nowMs;
    this.send(view, { type: "start" });
  }

  private breakTime(view: PlanView): void {
    if (view.nowMs < this.nextShopMs) return;
    this.nextShopMs = view.nowMs + SHOP_EVERY_MS;
    if (this.cardsLeft > 0 && view.nowMs - this.phaseAtMs >= 2000) {
      this.cardsLeft -= 1;
      this.send(view, { type: "review-card", correct: view.rng.chance(this.spec.reviewCards) });
      return;
    }
    this.shopStep(view);
  }

  /** One purchase if one is worth it; true when a command went out. */
  private shopStep(view: PlanView): boolean {
    const style = this.spec.buy;
    if (style === "none") return false;
    const world = view.world;
    const next = world.phase === "prep" ? 0 : world.wave;
    const card = waveCard(world, next);
    const gold = world.economy.gold;
    const reserve = style === "balanced" ? Math.ceil(gold * 0.1) : style === "poor" ? Math.ceil(gold * 0.3) : 0;
    const floor = style === "balanced" ? 0.4 : style === "poor" ? 0.9 : 0;
    const action = bestShopAction(shopActions(world, card, style), gold, reserve, floor, this.tried);
    if (!action) return false;
    this.tried.add(action.key);
    this.send(view, action.command);
    return true;
  }

  private tactics(view: PlanView): void {
    const { world, nowMs } = view;
    if (nowMs < this.nextTacticsMs) return;
    this.nextTacticsMs = nowMs + TACTICS_EVERY_MS;
    const hero = world.hero;
    const potion: ConsumableId = "small-potion";
    if (this.spec.buy !== "none" && (world.shop.held[potion] ?? 0) > 0 && world.shop.consumableReadyAt <= world.tick && hero.hp * 100 < hero.hpMax * 45) {
      this.send(view, { type: "consumable", item: potion });
      view.hold(300);
      return;
    }
    if (!this.spec.skills || world.phase !== "wave") return;
    const unlocked = world.stage.unlocks.heroSkills;
    const foes = liveFoes(world);
    const ready = (skill: HeroSkillId) =>
      unlocked.includes(skill) && world.combat.readyAt[skill] <= world.tick && nowMs >= (this.castAtMs[skill] ?? -Infinity) + SKILL_COOLDOWN_MS[skill];
    const cast = (skill: HeroSkillId, at?: Vec2) => {
      this.castAtMs[skill] = nowMs;
      this.send(view, at ? { type: "skill", skill, at } : { type: "skill", skill });
      view.hold(250);
    };
    const wait = SKILL_WAIT[this.spec.tactics ?? "fair"];
    const breathM = HERO_SKILLS.breath.lengthMm / 1000;
    const nearBreath = foes.filter((foe) => metresFromDais(foe) <= breathM).length;
    if (ready("breath") && (nearBreath >= wait.breath || (nearBreath >= wait.breath - 1 && hero.hp * 100 < hero.hpMax * 60))) return cast("breath");
    if (ready("skyfire")) {
      const spot = densest(foes, HERO_SKILLS.skyfire.radiusMm / 1000, RINGS.wordZoneMm / 1000);
      if (spot && spot.count >= wait.skyfire) return cast("skyfire", spot.at);
    }
    if (world.stage.unlocks.rage && ready("inferno") && world.combat.rage >= RAGE.maxX10) {
      const zone = foes.filter((foe) => metresFromDais(foe) <= RINGS.wordZoneMm / 1000).length;
      const finale = foes.filter((foe) => metresFromDais(foe) <= HERO_SKILLS.inferno.finaleRadiusMm / 1000).length;
      if ((this.spec.typing && (zone >= wait.inferno || foes.some((foe) => foe.general))) || finale >= 3) cast("inferno");
    }
  }
}

/** The foe with the most foes within `radius` m of it (inside `zone` m of the dais), as a point in metres. */
export function densest(foes: readonly { x: number; z: number }[], radius: number, zone: number): { at: Vec2; count: number } | null {
  let best: { at: Vec2; count: number } | null = null;
  const r = radius * U_PER_M;
  for (const foe of foes) {
    if (Math.sqrt(foe.x * foe.x + foe.z * foe.z) / U_PER_M > zone) continue;
    let count = 0;
    for (const other of foes) if ((other.x - foe.x) * (other.x - foe.x) + (other.z - foe.z) * (other.z - foe.z) <= r * r) count += 1;
    if (best === null || count > best.count) best = { at: [foe.x / U_PER_M, foe.z / U_PER_M], count };
  }
  return best;
}
