/**
 * Damage (00 §4.2, 03 §2.2) and the Fire Dragon's attacks (01 §2.3–2.4):
 * word strikes land 12 ticks after the last key; a dead target turns the
 * strike to the nearest worded foe within 4 m at 50 %; word damage ignores
 * armour, our side's physical and magic damage meet armour and resist;
 * skills Phun Lửa, Thiên Hỏa, Long Hống, Viêm Đế; rage (Long Nộ); Dragon
 * level; foes' wind-ups and strikes on units, houses, traps and the Dragon.
 * Owner: sim-battle (LANES.md).
 */
import { GENERALS } from "../content/data/generals";
import { BATTLE, CHAIN, CLUSTER, DAMAGE, DIFFICULTY, FIRE_DRAGON, HERO_LEVEL, HERO_SKILLS, RAGE, STATUS, STRENGTH, WHITE_DRAGON } from "../content/rules";
import type { DamageType, EnemyDef, EntityRef, FeedbackTier, GeneralDef, GeneralId, Grade, HeroSkillId, KillSource, Vec2, WordKind } from "../content/types";
import { auraPct } from "./auras";
import { emit } from "./events";
import { dist2, inCone, isqrt, mToU, mmToU, msToTicks, ticksToMs, uToM, within } from "./fixed";
import { damageHouse } from "./houses";
import { pointAt } from "./lanes";
import { ACTION, interruptFoe, knockBack } from "./movement";
import { applyStatus, armourPm, canAttack, tenacityFor, vulnerablePm } from "./status";
import { delayTrap, resonate } from "./traps";
import { damageUnit } from "./units";
import { foeDefOf } from "./waves";
import { chainTier, isLockProtected } from "./words";
import { enemyAt, type EnemyState, type WorldInit, type World } from "./world";

/** A finished word's hit waiting to land. */
export interface WordStrike {
  landsAt: number;
  /** Target foe (slot, serial); null for words without a foe (skill words). */
  slot: number;
  serial: number;
  word: number;
  kind: WordKind;
  grade: Grade;
  /** M_q, M_c and the sum of bonuses, permille (00 §4.2). */
  mqPm: number;
  mcPm: number;
  bonusPm: number;
  /** Where the target stood when the word finished (u): the 4 m redirect looks around it. */
  x: number;
  z: number;
  /** Chữ Chiêu: the skill it casts (null: none). */
  skill: HeroSkillId | null;
}

/** Thiên Hỏa on its way down (0.8 s). */
export interface SkyfireDrop {
  at: number;
  x: number;
  z: number;
  powerPm: number;
}

export interface CombatState {
  readonly strikes: WordStrike[];
  /** Per skill: tick it is ready again. */
  readonly readyAt: Record<HeroSkillId, number>;
  /** Long Nộ × 10 (01 §2.4). */
  rage: number;
  lastUltAt: number;
  /** Viêm Đế active until (−1: off). */
  infernoUntil: number;
  /** Urgent word used this wave. */
  urgentUsed: boolean;
  readonly skyfire: SkyfireDrop[];
  /** Fire Dragon HP lost since the last rage point (+1 per 4 %, 01 §2.4). */
  heroLoss: number;
  /** Skills whose "ready" event went out (bit per SKILL_BITS). */
  readyShown: number;
  /** Next telegraph id. */
  nextTelegraph: number;
  /** Ticks of the running wave towards the next +0.2 rage. */
  rageTicks: number;
}

const SKILL_BITS: readonly HeroSkillId[] = ["breath", "skyfire", "roar", "inferno"];
const HERO: EntityRef = { kind: "hero" };
/** A foe's body for beams and splash (half width). */
const BODY_U = mToU(0.6);

export function createCombatState(init: WorldInit): CombatState {
  return {
    strikes: [], readyAt: { breath: 0, skyfire: 0, roar: 0, inferno: 0 }, rage: 0, lastUltAt: -1, infernoUntil: -1, urgentUsed: false,
    skyfire: [], heroLoss: 0, readyShown: 0, nextTelegraph: 1, rageTicks: 0,
  };
}

// ── Numbers ─────────────────────────────────────────────────────────────────

/** Fire Dragon power P of the stage (P_ref = 100 × g(c), 00 §4.1), × 1000. */
const power1000 = (world: World): number => FIRE_DRAGON.power * world.gPm;
/** One W in HP: 90 × g(c) (00 §4.1). */
export const wHp = (world: World): number => Math.round((STRENGTH.wHp * world.gPm) / 1000);
/** D = P × M_q × M_c × (1 + Σ) (00 §4.2). */
export const wordDamage = (world: World, mqPm: number, mcPm: number, bonusPm: number): number =>
  Math.round((power1000(world) * mqPm * mcPm * (1000 + bonusPm)) / 1e12);
/** A skill of `powerPm` permille of P. */
export const skillDamage = (world: World, powerPm: number): number => Math.round((power1000(world) * powerPm) / 1e6);
/** A foe's blow on our side: × g(c), × difficulty, × its damage auras (banner). */
export function foeDamage(world: World, enemy: EnemyState, base: number): number {
  const scaled = Math.round((base * world.gPm * DIFFICULTY[world.difficulty].enemyDamagePm * (100 + auraPct(world, enemy, "damage"))) / 1e8);
  return scaled > DAMAGE.minDamage ? scaled : DAMAGE.minDamage;
}

/** reduction = G / (G + 100), capped at 75 %, in permille (00 §4.2). */
export function reductionPm(armourG: number): number {
  if (armourG <= 0) return 0;
  const pm = Math.round((armourG * 1000) / (armourG + 100));
  return pm > 750 ? 750 : pm;
}

/** Feedback tier (05 §5) of a blow by its source when the caller names none. */
function tierFor(by: KillSource): FeedbackTier {
  switch (by) {
    case "breath":
    case "skyfire":
      return 3;
    case "roar":
      return 4;
    case "inferno":
      return 3;
    default:
      return 1;
  }
}

const gradeTier = (grade: Grade): FeedbackTier => (grade === "flash" || grade === "perfect" ? 3 : 1);

// ── Damage to foes ─────────────────────────────────────────────────────────

/**
 * Deals damage to a foe: armour or resist by type (word ignores both), vulnerable
 * multipliers, lock protection keeps 1 HP (01 §3.3); emits `hit` and on 0 HP sets
 * alive = false, killedBy, and emits `death`. Returns the HP removed.
 */
export function damageEnemy(world: World, enemy: EnemyState, amount: number, type: DamageType, source: EntityRef, by: KillSource): number {
  return hitEnemy(world, enemy, amount, type, source, by, tierFor(by), null);
}

/** damageEnemy with the feedback tier and grade of a word hit. */
export function hitEnemy(world: World, enemy: EnemyState, amount: number, type: DamageType, source: EntityRef, by: KillSource, tier: FeedbackTier, grade: Grade | null): number {
  if (!enemy.alive || amount <= 0) return 0;
  const tick = world.tick;
  let dmg = amount;
  if (type === "physical") {
    // Phá giáp halves armour (00 §4.2).
    const armour = Math.round((enemy.armour * armourPm(enemy.statuses, tick)) / 1000);
    dmg = Math.round((dmg * (1000 - reductionPm(armour))) / 1000);
  } else if (type === "magic") dmg = Math.round((dmg * (1000 - reductionPm(enemy.resist))) / 1000);
  // Mark and vulnerable sources multiply (00 §4.2); word damage too.
  dmg = Math.round((dmg * vulnerablePm(enemy.statuses, tick)) / 1000);
  if (dmg < DAMAGE.minDamage) dmg = DAMAGE.minDamage;
  // Lock protection (01 §3.3): another source never takes the last HP of a foe being typed.
  if (by !== "word" && dmg >= enemy.hp && isLockProtected(world, enemy)) dmg = enemy.hp - 1;
  if (dmg <= 0) return 0;
  if (dmg > enemy.hp) dmg = enemy.hp;
  enemy.hp -= dmg;
  const stats = world.stats;
  if (by === "word") stats.damageWord += dmg;
  else if (by === "breath" || by === "skyfire" || by === "roar" || by === "inferno") stats.damageSkill += dmg;
  else stats.damageOurSide += dmg;
  enemy.wordsLeft = Math.ceil(enemy.hp / wHp(world));
  const x = uToM(enemy.x);
  const z = uToM(enemy.z);
  const target: EntityRef = { kind: "enemy", slot: enemy.slot, serial: enemy.serial };
  emit(world, { type: "hit", target, source, amount: dmg, damageType: type, tier, grade, x, z, hpLeft: enemy.hp });
  if (enemy.hp <= 0) {
    enemy.alive = false;
    enemy.killedBy = by;
    enemy.windupUntil = -1;
    const def = foeDefOf(enemy.foe);
    emit(world, { type: "death", enemy: { slot: enemy.slot, serial: enemy.serial }, foe: enemy.foe, by, x, z, material: def.show.material, tier: enemy.general ? 4 : 2 });
  }
  return dmg;
}

// ── Damage to our side ─────────────────────────────────────────────────────

/** Deals damage to the Fire Dragon (armour 20, resist 20 raw, 01 §2.2); rage +1 per 4 % lost; emits `hit`. */
export function damageHero(world: World, amount: number, type: DamageType, source: EntityRef): number {
  const hero = world.hero;
  if (hero.hp <= 0 || amount <= 0) return 0;
  const armour = type === "physical" ? hero.armour : type === "magic" ? hero.resist : 0;
  let dmg = Math.round((amount * (1000 - reductionPm(armour))) / 1000);
  if (dmg < DAMAGE.minDamage) dmg = DAMAGE.minDamage;
  const total = dmg;
  if (hero.shield > 0) {
    const absorbed = hero.shield < dmg ? hero.shield : dmg;
    hero.shield -= absorbed;
    dmg -= absorbed;
  }
  const lost = dmg < hero.hp ? dmg : hero.hp;
  hero.hp -= lost;
  world.stats.heroDamageTaken += lost;
  emit(world, { type: "hit", target: HERO, source, amount: total, damageType: type, tier: 1, grade: null, x: 0, z: 0, hpLeft: hero.hp });
  // Long Nộ: +1 for every 4 % of max HP lost (01 §2.4).
  const combat = world.combat;
  const step = Math.round((hero.hpMax * RAGE.hpLossStepPct) / 100);
  combat.heroLoss += lost;
  while (step > 0 && combat.heroLoss >= step) {
    combat.heroLoss -= step;
    addRage(world, RAGE.hpLossX10);
  }
  return lost;
}

/** A standing unit (not fallen into a bud, HP left). */
export function unitStanding(world: World, index: number): boolean {
  const unit = world.units.list[index];
  return unit !== undefined && unit.downUntil < 0 && unit.hp > 0;
}

// ── Targets and telegraphs ─────────────────────────────────────────────────

/** A shooter sees a unit this close as a threat even when it holds no one (E11 after stepping back). */
const CLOSE_U = mmToU(BATTLE.shooterCloseMm);

function unitBlocking(world: World, index: number): boolean {
  for (const enemy of world.enemies.list) if (enemy.alive && enemy.blockedBy === index) return true;
  return false;
}

/**
 * What a foe hits now (01 §4.2, 02 §1.3): a blocked foe fights its blocker;
 * shooters pick a unit holding an ally (or one right on them), then a house
 * in range, then the Fire Dragon in range; melee foes and generals hit the
 * Dragon once they stand at their stop. Null: nothing yet.
 */
export function pickTarget(world: World, enemy: EnemyState): EntityRef | null {
  if (enemy.blockedBy >= 0 && unitStanding(world, enemy.blockedBy)) return { kind: "unit", slot: enemy.blockedBy };
  const def = foeDefOf(enemy.foe);
  if (def.attack.kind === "ranged") {
    const range = mmToU(def.attack.rangeMm);
    let best = -1;
    let bestD = 0;
    for (const unit of world.units.list) {
      if (!unitStanding(world, unit.index)) continue;
      const d = dist2(enemy.x, enemy.z, unit.x, unit.z);
      if (d > range * range) continue;
      if (d > CLOSE_U * CLOSE_U && !unitBlocking(world, unit.index)) continue;
      if (best < 0 || d < bestD) {
        best = unit.index;
        bestD = d;
      }
    }
    if (best >= 0) return { kind: "unit", slot: best };
    let house = -1;
    for (const state of world.houses.list) {
      if (state.ruined || state.hp <= 0) continue;
      const slot = world.slots[state.slot]!;
      const d = dist2(enemy.x, enemy.z, slot.x, slot.z);
      if (d > range * range) continue;
      if (house < 0 || d < bestD) {
        house = state.slot;
        bestD = d;
      }
    }
    if (house >= 0) return { kind: "house", slot: house };
    return enemy.along >= enemy.stopAt || within(enemy.x, enemy.z, 0, 0, range) ? HERO : null;
  }
  if (enemy.general) return enemy.along >= enemy.stopAt ? HERO : null;
  return enemy.along >= world.lanes[enemy.lane]!.length ? HERO : null;
}

/** World point of a target, u (the Dragon at the dais centre). */
function targetPoint(world: World, target: EntityRef): [number, number] {
  switch (target.kind) {
    case "unit": {
      const unit = world.units.list[target.slot];
      return unit ? [unit.x, unit.z] : [0, 0];
    }
    case "house":
    case "trap": {
      const slot = world.slots[target.slot];
      return slot ? [slot.x, slot.z] : [0, 0];
    }
    case "enemy": {
      const enemy = world.enemies.list[target.slot];
      return enemy ? [enemy.x, enemy.z] : [0, 0];
    }
    default:
      return [0, 0];
  }
}

/** Emits a red (enemy) or pale orange (ally) ground telegraph; returns its id. */
export function telegraph(
  world: World,
  source: EnemyState | null,
  shape: "circle" | "line" | "cone" | "arc",
  toX: number,
  toZ: number,
  radiusM: number,
  widthM: number,
  durationMs: number,
): number {
  const id = world.combat.nextTelegraph;
  world.combat.nextTelegraph += 1;
  const from: EntityRef = source ? { kind: "enemy", slot: source.slot, serial: source.serial } : HERO;
  emit(world, {
    type: "telegraph", id, owner: source ? "enemy" : "ally", shape, x: uToM(source ? source.x : toX), z: uToM(source ? source.z : toZ),
    toX: uToM(toX), toZ: uToM(toZ), radiusM, widthM, durationMs, source: from,
  });
  return id;
}

// ── Foes' attacks ──────────────────────────────────────────────────────────

/** A trap within `range` u that a fire arrow may hit (03 §7: recharging traps only; Gai Chông runs all the time). */
function trapInRange(world: World, enemy: EnemyState, range: number): number {
  let best = -1;
  let bestD = 0;
  for (const trap of world.traps.list) {
    const slot = world.slots[trap.slot];
    if (!slot) continue;
    const d = dist2(enemy.x, enemy.z, slot.x, slot.z);
    if (d > range * range) continue;
    if (best < 0 || d < bestD) {
      best = trap.slot;
      bestD = d;
    }
  }
  return best;
}

const periodTicks = (world: World, enemy: EnemyState, periodMs: number): number =>
  msToTicks(Math.round((periodMs * 100) / (100 + auraPct(world, enemy, "attack-rate"))));

function strike(world: World, enemy: EnemyState): void {
  const def = foeDefOf(enemy.foe);
  const aim = enemy.aim;
  enemy.aim = null;
  if (!aim) return;
  const source: EntityRef = { kind: "enemy", slot: enemy.slot, serial: enemy.serial };
  const reach = mmToU(def.attack.rangeMm) + mToU(1.5);
  const [tx, tz] = targetPoint(world, aim);
  if (aim.kind !== "hero" && !within(enemy.x, enemy.z, tx, tz, reach)) return;
  const dmg = foeDamage(world, enemy, def.attack.damage);
  switch (aim.kind) {
    case "hero":
      damageHero(world, dmg, def.attack.damageType, source);
      break;
    case "unit": {
      if (!unitStanding(world, aim.slot)) return;
      damageUnit(world, aim.slot, dmg, def.attack.damageType, source);
      // E01 Ngòi Độc (02 §2.2): a unit stung with the skill ready is poisoned.
      const sting = (def as EnemyDef).skills?.find((skill) => skill.kind === "poison-sting");
      if (sting && sting.kind === "poison-sting" && world.tick >= enemy.skillAt) {
        const unit = world.units.list[aim.slot]!;
        applyStatus(world, aim, unit.statuses, { id: "poison", durationMs: sting.poisonMs, value: Math.round((STATUS.poison.perSecond * world.gPm) / 1000), source });
        enemy.skillAt = world.tick + msToTicks(sting.cooldownMs);
      }
      break;
    }
    case "house":
      damageHouse(world, aim.slot, dmg, def.attack.damageType, source);
      break;
    case "trap": {
      // E11 Tên Lửa (02 §2.2): the trap stays off 3 s more.
      const arrow = (def as EnemyDef).skills?.find((skill) => skill.kind === "fire-arrow");
      if (arrow && arrow.kind === "fire-arrow") delayTrap(world, aim.slot, msToTicks(arrow.trapDelayMs));
      break;
    }
    default:
      return;
  }
  emit(world, { type: "attack", source, target: aim, stage: "strike", x: uToM(enemy.x), z: uToM(enemy.z), tx: uToM(tx), tz: uToM(tz) });
}

/** E19's charge lands on a unit (thrown up to 3 m back along its lane, never past its block point) or on the Dragon (02 §2.2). */
export function chargeImpact(world: World, enemy: EnemyState, target: EntityRef): void {
  const def = foeDefOf(enemy.foe);
  const source: EntityRef = { kind: "enemy", slot: enemy.slot, serial: enemy.serial };
  const dmg = foeDamage(world, enemy, def.attack.damage);
  const [tx, tz] = targetPoint(world, target);
  if (target.kind === "hero") damageHero(world, dmg, def.attack.damageType, source);
  else if (target.kind === "unit" && unitStanding(world, target.slot)) {
    damageUnit(world, target.slot, dmg, def.attack.damageType, source);
    const unit = world.units.list[target.slot]!;
    const knock = mmToU(def.attack.knockMm ?? 0);
    if (knock > 0 && unitStanding(world, target.slot)) {
      // Thrown back the way the boar runs, never past its block point (03 §9.1 leash).
      unit.along = unit.along + knock < unit.home ? unit.along + knock : unit.home;
      const lane = world.lanes[unit.lane];
      if (lane) {
        const at = pointAt(lane, unit.along, unit.lateral, { x: 0, z: 0 });
        unit.x = at.x;
        unit.z = at.z;
      }
    }
  }
  emit(world, { type: "attack", source, target, stage: "strike", x: uToM(enemy.x), z: uToM(enemy.z), tx: uToM(tx), tz: uToM(tz) });
}

/** Foes' wind-ups (telegraph events) and strikes on their targets (01 §4.2). E19 strikes through its charge (movement). */
export function stepEnemyAttacks(world: World): void {
  const tick = world.tick;
  const telegraphPm = DIFFICULTY[world.difficulty].telegraphPm;
  for (const enemy of world.enemies.list) {
    if (!enemy.alive) continue;
    const def = foeDefOf(enemy.foe);
    const attack = def.attack;
    if (attack.kind === "charge") continue;
    const ranged = attack.kind === "ranged";
    if (enemy.action !== ACTION.none || !canAttack(enemy.statuses, tick, ranged) || enemy.mode === "knockback" || enemy.mode === "airborne") {
      enemy.windupUntil = -1;
      enemy.aim = null;
      continue;
    }
    if (enemy.windupUntil >= 0) {
      if (tick < enemy.windupUntil) continue;
      enemy.windupUntil = -1;
      strike(world, enemy);
      continue;
    }
    const target = enemy.target;
    if (target === null || tick < enemy.attackAt) continue;
    let aim: EntityRef = target;
    // E11 Tên Lửa: with the skill ready, the next arrow goes to a trap in range.
    const arrow = (def as EnemyDef).skills?.find((skill) => skill.kind === "fire-arrow");
    if (arrow && arrow.kind === "fire-arrow" && tick >= enemy.skillAt) {
      const trap = trapInRange(world, enemy, mmToU(attack.rangeMm));
      if (trap >= 0) {
        aim = { kind: "trap", slot: trap };
        enemy.skillAt = tick + msToTicks(arrow.cooldownMs);
      }
    }
    enemy.aim = aim;
    const telegraphed = attack.telegraph || aim.kind === "trap";
    const windup = msToTicks((attack.windupMs * (telegraphed ? telegraphPm : 1000)) / 1000);
    enemy.windupUntil = tick + windup;
    // The period runs from wind-up to wind-up, so strikes land `periodMs` apart.
    enemy.attackAt = tick + periodTicks(world, enemy, attack.periodMs);
    const [tx, tz] = targetPoint(world, aim);
    emit(world, { type: "attack", source: { kind: "enemy", slot: enemy.slot, serial: enemy.serial }, target: aim, stage: "windup", x: uToM(enemy.x), z: uToM(enemy.z), tx: uToM(tx), tz: uToM(tz) });
    if (telegraphed) telegraph(world, enemy, ranged ? "line" : "arc", tx, tz, ranged ? 0 : 1.5, ranged ? 0.4 : 0, ticksToMs(windup));
  }
}

// ── Word strikes ───────────────────────────────────────────────────────────

/** Queues a word's hit for tick + 12 (called by words when a word completes). */
export function queueWordStrike(world: World, strike: Omit<WordStrike, "landsAt" | "x" | "z" | "skill"> & { readonly skill?: HeroSkillId }): void {
  const target = strike.slot >= 0 ? enemyAt(world, strike) : null;
  world.combat.strikes.push({
    landsAt: world.tick + DAMAGE.strikeDelayTicks, slot: strike.slot, serial: strike.serial, word: strike.word, kind: strike.kind, grade: strike.grade,
    mqPm: strike.mqPm, mcPm: strike.mcPm, bonusPm: strike.bonusPm, x: target ? target.x : 0, z: target ? target.z : 0, skill: strike.skill ?? null,
  });
}

/** The nearest live foe carrying a word within 4 m of (x, z) (00 §4.2 redirect). */
function redirectTarget(world: World, x: number, z: number): EnemyState | null {
  const radius = mmToU(DAMAGE.redirectRadiusMm);
  let best: EnemyState | null = null;
  let bestD = 0;
  for (const enemy of world.enemies.list) {
    if (!enemy.alive || enemy.word < 0) continue;
    const d = dist2(enemy.x, enemy.z, x, z);
    if (d > radius * radius) continue;
    if (best === null || d < bestD) {
      best = enemy;
      bestD = d;
    }
  }
  return best;
}

const isSmall = (enemy: EnemyState): boolean => {
  if (enemy.general || enemy.elite) return false;
  const tier = (foeDefOf(enemy.foe) as EnemyDef).tier;
  return tier === "small" || tier === "swarm";
};

function landStrike(world: World, strike: WordStrike): void {
  if (strike.kind === "skill") {
    castSkill(world, strike.skill ?? skillWordFor(world) ?? "breath", undefined, HERO_SKILLS.skillWordPowerPct);
    return;
  }
  if (strike.slot < 0) return;
  let target = enemyAt(world, strike);
  let scalePct = 100;
  if (target === null) {
    target = redirectTarget(world, strike.x, strike.z);
    scalePct = DAMAGE.redirectPct;
    if (target === null) return;
  }
  const lane = target.lane;
  if (strike.kind === "cluster" && target.cluster >= 0 && scalePct === 100) {
    // One cluster word: 1 W of word damage to every member within 3 m (02 §1.4).
    const dmg = Math.round((wHp(world) * (CLUSTER.hitW100 / 100) * strike.mqPm * strike.mcPm) / 1e6);
    const radius = mmToU(CLUSTER.hitRadiusMm);
    const cx = target.x;
    const cz = target.z;
    const cluster = target.cluster;
    for (const enemy of world.enemies.list) {
      if (enemy.alive && enemy.cluster === cluster && within(enemy.x, enemy.z, cx, cz, radius)) hitEnemy(world, enemy, dmg, "word", HERO, "word", 2, strike.grade);
    }
  } else {
    let dmg = Math.round((wordDamage(world, strike.mqPm, strike.mcPm, strike.bonusPm) * scalePct) / 100);
    // A small foe always falls to one word that is not Ẩu (00 §4.6).
    if (scalePct === 100 && strike.grade !== "sloppy" && isSmall(target) && dmg < target.hp) dmg = target.hp;
    hitEnemy(world, target, dmg, "word", HERO, "word", gradeTier(strike.grade), strike.grade);
    // Cộng Hưởng (03 §10.2): word hits cut the recharge of traps around the foe.
    resonate(world, target, strike.grade);
    // Lửa Chữ (01 §2.4): a Chớp word burns 0.2 P a second for 3 s.
    if (strike.grade === "flash" && target.alive) {
      const fire = HERO_SKILLS.wordFire;
      applyStatus(world, { kind: "enemy", slot: target.slot, serial: target.serial }, target.statuses, {
        id: "burn", durationMs: fire.burnMs, value: skillDamage(world, fire.burnPerSecondPm), by: "word", source: HERO,
      });
    }
  }
  // Viêm Đế: every word also fires a beam down the lane (01 §2.4).
  if (world.combat.infernoUntil > world.tick) beam(world, lane);
}

/** Viêm Đế's beam: 2 × 22 m from the dais along `lane`, 1.2 P word damage to every foe in it. */
function beam(world: World, laneIndex: number): void {
  const lane = world.lanes[laneIndex];
  if (!lane) return;
  const inferno = HERO_SKILLS.inferno;
  const from = lane.length - mmToU(inferno.beamLengthMm);
  const half = mmToU(inferno.beamWidthMm / 2) + BODY_U;
  const dmg = skillDamage(world, inferno.beamPowerPm);
  for (const enemy of world.enemies.list) {
    if (!enemy.alive || enemy.lane !== laneIndex || enemy.along < from) continue;
    if (enemy.lateral > half || enemy.lateral < -half) continue;
    hitEnemy(world, enemy, dmg, "word", HERO, "inferno", 3, null);
  }
}

// ── Dragon skills ──────────────────────────────────────────────────────────

const unlocked = (world: World, skill: HeroSkillId): boolean => world.stage.unlocks.heroSkills.includes(skill);
const reject = (world: World, reason: string): void => emit(world, { type: "rejected", command: "skill", reason });
const bit = (skill: HeroSkillId): number => 1 << SKILL_BITS.indexOf(skill);

/** The skill a Chữ Chiêu casts (00 §5): the ultimate when rage is full, else the ready skill with the longest cooldown. */
export function skillWordFor(world: World): HeroSkillId | null {
  if (unlocked(world, "inferno") && world.stage.unlocks.rage && infernoReady(world)) return "inferno";
  if (unlocked(world, "skyfire") && world.tick >= world.combat.readyAt.skyfire) return "skyfire";
  if (unlocked(world, "breath") && world.tick >= world.combat.readyAt.breath) return "breath";
  return null;
}

function infernoReady(world: World): boolean {
  const combat = world.combat;
  if (combat.rage < RAGE.maxX10 || combat.infernoUntil > world.tick) return false;
  return combat.lastUltAt < 0 || world.tick - combat.lastUltAt >= msToTicks(RAGE.minIntervalMs);
}

/** Alt + 1/2/5 (and the urgent word's Long Hống); `at` in metres, else the default target (01 §2.4). `bonusPct`: Chữ Chiêu +10 %. */
export function castSkill(world: World, skill: HeroSkillId, at?: Vec2, bonusPct = 0): void {
  const combat = world.combat;
  const tick = world.tick;
  if (!unlocked(world, skill)) return reject(world, "locked");
  if (world.phase !== "wave") return reject(world, "phase");
  switch (skill) {
    case "breath": {
      if (tick < combat.readyAt.breath) return reject(world, "cooldown");
      breath(world, at, bonusPct);
      combat.readyAt.breath = tick + msToTicks(HERO_SKILLS.breath.cooldownMs);
      break;
    }
    case "skyfire": {
      if (tick < combat.readyAt.skyfire) return reject(world, "cooldown");
      skyfire(world, at, bonusPct);
      combat.readyAt.skyfire = tick + msToTicks(HERO_SKILLS.skyfire.cooldownMs);
      break;
    }
    case "roar":
      roar(world, bonusPct);
      break;
    case "inferno": {
      if (!world.stage.unlocks.rage) return reject(world, "locked");
      if (!infernoReady(world)) return reject(world, combat.rage < RAGE.maxX10 ? "rage" : "cooldown");
      combat.rage = 0;
      combat.lastUltAt = tick;
      combat.infernoUntil = tick + msToTicks(HERO_SKILLS.inferno.durationMs);
      world.stats.ultimates += 1;
      emit(world, { type: "rage", value: 0, full: false });
      emit(world, { type: "skill", skill: "inferno", stage: "cast", x: 0, z: 0 });
      break;
    }
  }
  combat.readyShown &= ~bit(skill);
}

const withBonus = (dmg: number, bonusPct: number): number => Math.round((dmg * (100 + bonusPct)) / 100);

/** Phun Lửa (01 §2.4): 60° cone, 12 m from the dais, magic, burn 3 s; default: the lane with the most foe HP within 12 m. */
function breath(world: World, at: Vec2 | undefined, bonusPct: number): void {
  const def = HERO_SKILLS.breath;
  const length = mmToU(def.lengthMm);
  let dx: number;
  let dz: number;
  if (at) {
    dx = mToU(at[0]);
    dz = mToU(at[1]);
  } else {
    const hpByLane = world.lanes.map(() => 0);
    for (const enemy of world.enemies.list) if (enemy.alive && within(enemy.x, enemy.z, 0, 0, length)) hpByLane[enemy.lane] = hpByLane[enemy.lane]! + enemy.hp;
    let lane = 0;
    for (let index = 1; index < hpByLane.length; index += 1) if (hpByLane[index]! > hpByLane[lane]!) lane = index;
    let sx = 0;
    let sz = 0;
    let sum = 0;
    for (const enemy of world.enemies.list) {
      if (!enemy.alive || enemy.lane !== lane || !within(enemy.x, enemy.z, 0, 0, length)) continue;
      sx += enemy.x * enemy.hp;
      sz += enemy.z * enemy.hp;
      sum += enemy.hp;
    }
    if (sum > 0) {
      dx = Math.round(sx / sum);
      dz = Math.round(sz / sum);
    } else {
      const runtime = world.lanes[lane]!;
      dx = runtime.xs[runtime.xs.length - 1]!;
      dz = runtime.zs[runtime.zs.length - 1]!;
    }
  }
  if (dx === 0 && dz === 0) dz = -1;
  const len = isqrt(dx * dx + dz * dz) || 1;
  const tx = Math.round((dx * length) / len);
  const tz = Math.round((dz * length) / len);
  emit(world, { type: "skill", skill: "breath", stage: "cast", x: uToM(tx), z: uToM(tz) });
  const powerPm = world.hero.level >= def.tier2Level ? def.powerPm[1] : def.powerPm[0];
  const dmg = withBonus(skillDamage(world, powerPm), bonusPct);
  const burn = Math.round((STATUS.burn.perSecond * world.gPm) / 1000);
  for (const enemy of world.enemies.list) {
    if (!enemy.alive || !inCone(0, 0, tx, tz, enemy.x, enemy.z, def.halfAngleCosPm, length)) continue;
    hitEnemy(world, enemy, dmg, "magic", HERO, "breath", 3, null);
    if (enemy.alive) applyStatus(world, { kind: "enemy", slot: enemy.slot, serial: enemy.serial }, enemy.statuses, { id: "burn", durationMs: def.burnMs, value: burn, by: "breath", source: HERO });
  }
  emit(world, { type: "skill", skill: "breath", stage: "impact", x: uToM(tx), z: uToM(tz) });
}

/** Thiên Hỏa (01 §2.4): lands 0.8 s later, 4 m, magic, stun 1 s; default: the densest group in the word zone. */
function skyfire(world: World, at: Vec2 | undefined, bonusPct: number): void {
  const def = HERO_SKILLS.skyfire;
  const radius = mmToU(def.radiusMm);
  let x = 0;
  let z = 0;
  if (at) {
    x = mToU(at[0]);
    z = mToU(at[1]);
  } else {
    let bestCount = -1;
    let bestHp = 0;
    for (const enemy of world.enemies.list) {
      if (!enemy.alive) continue;
      let count = 0;
      let hp = 0;
      for (const other of world.enemies.list) {
        if (!other.alive || !within(other.x, other.z, enemy.x, enemy.z, radius)) continue;
        count += 1;
        hp += other.hp;
      }
      if (count > bestCount || (count === bestCount && hp > bestHp)) {
        bestCount = count;
        bestHp = hp;
        x = enemy.x;
        z = enemy.z;
      }
    }
  }
  const powerPm = world.hero.level >= def.tier2Level ? def.powerPm[1] : def.powerPm[0];
  world.combat.skyfire.push({ at: world.tick + msToTicks(def.delayMs), x, z, powerPm: Math.round((powerPm * (100 + bonusPct)) / 100) });
  telegraph(world, null, "circle", x, z, def.radiusMm / 1000, 0, def.delayMs);
  emit(world, { type: "skill", skill: "skyfire", stage: "cast", x: uToM(x), z: uToM(z) });
}

function skyfireImpact(world: World, drop: SkyfireDrop): void {
  const def = HERO_SKILLS.skyfire;
  const radius = mmToU(def.radiusMm);
  const dmg = skillDamage(world, drop.powerPm);
  for (const enemy of world.enemies.list) {
    if (!enemy.alive || !within(enemy.x, enemy.z, drop.x, drop.z, radius)) continue;
    hitEnemy(world, enemy, dmg, "magic", HERO, "skyfire", 3, null);
    if (enemy.alive) {
      applyStatus(world, { kind: "enemy", slot: enemy.slot, serial: enemy.serial }, enemy.statuses, { id: "stun", durationMs: def.stunMs, tenacityPct: tenacityFor(world, enemy), by: "skyfire", source: HERO });
      interruptFoe(world, enemy);
    }
  }
  emit(world, { type: "skill", skill: "skyfire", stage: "impact", x: uToM(drop.x), z: uToM(drop.z) });
}

/** Long Hống (01 §3.6): 3 P word damage within 10 m, knockback 6 m, every cast interrupted. */
function roar(world: World, bonusPct: number): void {
  const def = HERO_SKILLS.roar;
  const radius = mmToU(def.radiusMm);
  const dmg = withBonus(skillDamage(world, def.powerPm), bonusPct);
  emit(world, { type: "skill", skill: "roar", stage: "cast", x: 0, z: 0 });
  for (const enemy of world.enemies.list) {
    if (!enemy.alive) continue;
    interruptFoe(world, enemy);
    if (!within(enemy.x, enemy.z, 0, 0, radius)) continue;
    hitEnemy(world, enemy, dmg, "word", HERO, "roar", 4, null);
    if (enemy.alive) knockBack(world, enemy, mmToU(def.knockMm));
  }
  emit(world, { type: "skill", skill: "roar", stage: "impact", x: 0, z: 0 });
}

/** Viêm Đế ends with Spit_Big: 4 P magic within 7 m (01 §2.4). */
function infernoFinale(world: World): void {
  const def = HERO_SKILLS.inferno;
  const radius = mmToU(def.finaleRadiusMm);
  const dmg = skillDamage(world, def.finalePowerPm);
  for (const enemy of world.enemies.list) if (enemy.alive && within(enemy.x, enemy.z, 0, 0, radius)) hitEnemy(world, enemy, dmg, "magic", HERO, "inferno", 5, null);
  emit(world, { type: "skill", skill: "inferno", stage: "end", x: 0, z: 0 });
}

/** Strikes and skill impacts due this tick; Viêm Đế's end; rage over time; skill-ready events. */
export function stepWordHits(world: World): void {
  const combat = world.combat;
  const tick = world.tick;
  let index = 0;
  while (index < combat.strikes.length) {
    const strike = combat.strikes[index]!;
    if (strike.landsAt > tick) {
      index += 1;
      continue;
    }
    combat.strikes.splice(index, 1);
    landStrike(world, strike);
  }
  index = 0;
  while (index < combat.skyfire.length) {
    const drop = combat.skyfire[index]!;
    if (drop.at > tick) {
      index += 1;
      continue;
    }
    combat.skyfire.splice(index, 1);
    skyfireImpact(world, drop);
  }
  if (combat.infernoUntil >= 0 && tick >= combat.infernoUntil) {
    combat.infernoUntil = -1;
    infernoFinale(world);
  }
  if (world.phase === "wave") {
    combat.rageTicks += 1;
    if (combat.rageTicks >= 60) {
      combat.rageTicks = 0;
      addRage(world, RAGE.perSecondInWaveX10);
    }
  }
  for (const skill of SKILL_BITS) {
    if (skill === "roar" || !unlocked(world, skill) || (combat.readyShown & bit(skill)) !== 0) continue;
    const ready = skill === "inferno" ? world.stage.unlocks.rage && infernoReady(world) : tick >= combat.readyAt[skill];
    if (!ready) continue;
    combat.readyShown |= bit(skill);
    emit(world, { type: "skill", skill, stage: "ready", x: 0, z: 0 });
  }
}

// ── Kills, rage, level ─────────────────────────────────────────────────────

/** Rage, XP and level-up on a kill (01 §2.4–2.5); a general's death makes allies near it flinch (02 §3.2). Cleanup calls it once per dead foe. */
export function onEnemyKilled(world: World, enemy: EnemyState): void {
  const def = foeDefOf(enemy.foe);
  if (enemy.general) {
    const general = def as GeneralDef;
    addRage(world, RAGE.killGeneralX10);
    grantXp(world, general.rank === "warlord" ? HERO_LEVEL.xp.warlord : HERO_LEVEL.xp.captain);
    const death = GENERALS[enemy.foe as GeneralId].onDeath;
    const radius = mmToU(death.radiusMm);
    for (const other of world.enemies.list) {
      if (!other.alive || !within(other.x, other.z, enemy.x, enemy.z, radius)) continue;
      applyStatus(world, { kind: "enemy", slot: other.slot, serial: other.serial }, other.statuses, {
        id: death.kind === "panic" ? "vulnerable" : "flinch", durationMs: death.durationMs, value: death.vulnerablePct ?? 0, self: true,
      });
      interruptFoe(world, other);
    }
    return;
  }
  const tier = (def as EnemyDef).tier;
  if (tier === "medium" || tier === "heavy" || tier === "giant") addRage(world, RAGE.killMediumPlusX10);
  if (enemy.cluster >= 0) {
    // A cluster counts once, when its last member falls (others dead this tick wait for cleanup).
    for (const other of world.enemies.list) if (other !== enemy && other.cluster === enemy.cluster && (other.alive || !other.freed)) return;
    grantXp(world, HERO_LEVEL.xp.cluster);
    return;
  }
  if (enemy.elite) grantXp(world, HERO_LEVEL.xp.elite);
  else grantXp(world, tier === "small" || tier === "swarm" ? HERO_LEVEL.xp.small : HERO_LEVEL.xp.medium);
}

/** Adds rage × 10 with chain-tier bonus, capped at 100 (01 §2.4); emits `rage`. */
export function addRage(world: World, x10: number): void {
  if (!world.stage.unlocks.rage || x10 === 0) return;
  const combat = world.combat;
  const gain = x10 > 0 ? Math.round((x10 * (100 + CHAIN.rageBonusPct[chainTier(world.words.chain)]!)) / 100) : x10;
  const before = combat.rage;
  const after = before + gain;
  combat.rage = after < 0 ? 0 : after > RAGE.maxX10 ? RAGE.maxX10 : after;
  if (combat.rage !== before) emit(world, { type: "rage", value: combat.rage / 10, full: combat.rage >= RAGE.maxX10 });
}

/** Adds Dragon XP and levels up (01 §2.5): both Dragons +5 % max HP a level, healed; emits `hero-level`. */
export function grantXp(world: World, xp: number): void {
  if (xp <= 0) return;
  const hero = world.hero;
  hero.xp += xp;
  const table = HERO_LEVEL.xpToLevel;
  while (hero.level <= table.length && hero.xp >= table[hero.level - 1]!) {
    hero.level += 1;
    const gain = Math.round((FIRE_DRAGON.hp * world.gPm * HERO_LEVEL.hpPerLevelPct) / 100_000);
    hero.hpMax += gain;
    if (hero.hp > 0) hero.hp += gain;
    const guideGain = Math.round((WHITE_DRAGON.hp * HERO_LEVEL.hpPerLevelPct) / 100);
    world.guide.hpMax += guideGain;
    if (world.guide.downUntil < 0) world.guide.hp += guideGain;
    emit(world, { type: "hero-level", level: hero.level });
  }
}
