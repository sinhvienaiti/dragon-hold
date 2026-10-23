/**
 * In-wave HUD (05 §4.2): top-left gold, wave n/N, chain and the phase clock
 * (break timer, call-early bonus); top-right system buttons (pause, camera);
 * bottom-left Hỏa Long (HP, shield, armour, level), skill slots Alt + 1/2 with
 * cooldowns, the urgent-word Long Hống, consumable slots Alt + 7/8, Long Nộ and
 * Viêm Đế (Alt + 5). Bạch Long stands by as a guide (00 D21). DOM, ≤ 10 % of
 * the screen in a wave, buttons never take focus. Panels carry `data-keepout`
 * so word tags can stay clear of them.
 * Owner: ui (LANES.md).
 */
import type { ActionHandler, CommandSink, FrameInfo, Presenter } from "../app/contracts";
import { CONSUMABLES } from "../content/data/our-side";
import { CHAIN, FLOW, HERO_LEVEL, HERO_SKILLS, OUR_SIDE, RAGE, URGENT } from "../content/rules";
import type { ConsumableId, HeroSkillId, SimCommand, SimEvent } from "../content/types";
import { TICK_HZ, msToTicks } from "../sim/fixed";
import type { World } from "../sim/world";
import { el, icon, keyLabel, setClass, setShown, setText, setVar, uiButton } from "./skin";

// ── Pure read-outs (tests/ui/hud.test.ts) ───────────────────────────────────

type Clock = Pick<World, "tick" | "phaseEndsAt">;

/** Ticks left in the current phase, or null while it waits for a command (prep, Easy breaks). */
export function phaseTicksLeft(world: Clock): number | null {
  return world.phaseEndsAt < 0 ? null : Math.max(0, world.phaseEndsAt - world.tick);
}

/** Whole seconds to show on a countdown (20 at the start of a 20 s break, 1 at its end). */
export const clockSeconds = (ticks: number): number => Math.ceil(ticks / TICK_HZ);

/** Shift + Enter gold for the time left (00 §4.5): 2 per whole second, at most 40. */
export function callEarlyBonus(ticksLeft: number): number {
  return Math.min(FLOW.callEarlyGoldMax, FLOW.callEarlyGoldPerS * Math.floor(ticksLeft / TICK_HZ));
}

/** The upcoming wave in prep, warning and break: world.wave is the current or last one (0 before the first). */
export function upcomingWave(world: Pick<World, "wave" | "stage">): number {
  return Math.min(world.wave + 1, world.stage.waves.length);
}

export interface CooldownView {
  /** Seconds left, rounded up (0: ready). */
  readonly leftS: number;
  /** Share of the cooldown still to run, 0–1. */
  readonly frac: number;
}

const cooldown = (readyAt: number, tick: number, totalMs: number): CooldownView => {
  const left = Math.max(0, readyAt - tick);
  const total = Math.max(1, msToTicks(totalMs));
  return { leftS: clockSeconds(left), frac: Math.min(1, left / total) };
};

/** Hỏa Long's skills on keys (01 §2.4, 00 §6); Long Hống comes from the urgent word, Viêm Đế from full rage. */
export const SKILL_SLOTS: readonly { readonly skill: HeroSkillId; readonly action: string; readonly nameVi: string; readonly icon: string }[] = [
  { skill: "breath", action: "skill-1", nameVi: "Phun Lửa", icon: "breath" },
  { skill: "skyfire", action: "skill-2", nameVi: "Thiên Hỏa", icon: "skyfire" },
];

export const ULT_SLOT = { skill: "inferno" as HeroSkillId, action: "ult-fire", nameVi: "Viêm Đế", icon: "inferno" };

export function skillCooldown(world: World, skill: HeroSkillId): CooldownView {
  const spec = HERO_SKILLS[skill];
  const totalMs = "cooldownMs" in spec ? spec.cooldownMs : 1;
  return cooldown(world.combat.readyAt[skill], world.tick, totalMs);
}

export interface UltView {
  /** Long Nộ 0–100 (one decimal dropped). */
  readonly rage: number;
  readonly full: boolean;
  /** Viêm Đế burning now, and its seconds left. */
  readonly active: boolean;
  readonly activeS: number;
  /** Seconds until the 45 s gap between ultimates allows another (0: free). */
  readonly gapS: number;
}

export function ultView(world: World): UltView {
  const combat = world.combat;
  const rage = Math.floor(Math.max(0, Math.min(RAGE.maxX10, combat.rage)) / 10);
  const activeLeft = Math.max(0, combat.infernoUntil - world.tick);
  const gapLeft = combat.lastUltAt < 0 ? 0 : Math.max(0, combat.lastUltAt + msToTicks(RAGE.minIntervalMs) - world.tick);
  return { rage, full: combat.rage >= RAGE.maxX10, active: activeLeft > 0, activeS: clockSeconds(activeLeft), gapS: clockSeconds(gapLeft) };
}

export interface ConsumableSlotView {
  /** 0-based slot; Alt + 7 is slot 0. */
  readonly index: number;
  readonly action: string;
  readonly item: ConsumableId | null;
  readonly count: number;
  readonly cool: CooldownView;
}

const isConsumable = (id: string): id is ConsumableId => id in CONSUMABLES;

/**
 * Consumable slots as held (03 §6.3: 2 slots, 3 each, one shared cooldown):
 * carry order first, each kind filling slots of its stack size.
 */
export function consumableSlots(world: World): ConsumableSlotView[] {
  const ids: ConsumableId[] = [];
  for (const id of [...world.stage.carry, ...Object.keys(world.shop.held)]) if (isConsumable(id) && !ids.includes(id)) ids.push(id);
  const cool = cooldown(world.shop.consumableReadyAt, world.tick, OUR_SIDE.consumableCooldownMs);
  const slots: ConsumableSlotView[] = [];
  for (const id of ids) {
    let left = world.shop.held[id] ?? 0;
    const stack = CONSUMABLES[id].stackMax;
    while (left > 0 && slots.length < OUR_SIDE.consumableSlots) {
      const count = Math.min(left, stack);
      slots.push({ index: slots.length, action: "consumable-" + (slots.length + 1), item: id, count, cool });
      left -= count;
    }
  }
  while (slots.length < OUR_SIDE.consumableSlots) slots.push({ index: slots.length, action: "consumable-" + (slots.length + 1), item: null, count: 0, cool });
  return slots;
}

/** XP progress inside the current Dragon level, 0–1 (1 at level 10). */
export function levelProgress(level: number, xp: number): number {
  const table = HERO_LEVEL.xpToLevel;
  if (level - 1 >= table.length) return 1;
  const from = level >= 2 ? table[level - 2]! : 0;
  const to = table[level - 1]!;
  return Math.max(0, Math.min(1, (xp - from) / Math.max(1, to - from)));
}

/** Chain tier 0–4 from the thresholds (00 §4.2); same rule as sim/words chainTier, kept here so the HUD loads without the sim systems. */
export function chainTierOf(chain: number): number {
  let tier = 0;
  CHAIN.thresholds.forEach((min, index) => {
    if (chain >= min) tier = index;
  });
  return tier;
}

/** M_c of the chain tier as "×1,08" (00 §4.2); empty at tier 0. */
export function chainMultiplier(chain: number): string {
  const tier = chainTierOf(chain);
  return tier === 0 ? "" : "×" + (CHAIN.mcPm[tier]! / 1000).toFixed(2).replace(".", ",");
}

/** Command-specific texts first ("command|reason"), then by reason, then by command. */
const REJECT_PAIR: Readonly<Record<string, string>> = {
  "consumable|cooldown": "Đồ tiêu hao đang hồi",
  "consumable|none": "Hết đồ tiêu hao: mua thêm lúc nghỉ",
  "consumable|empty": "Hết đồ tiêu hao: mua thêm lúc nghỉ",
  "consumable|phase": "Chưa dùng được đồ lúc này",
  "start|phase": "Ải đã bắt đầu",
  "start|no-waves": "Ải không còn đợt nào",
  "call-early|phase": "Chỉ gọi sớm được lúc nghỉ",
  "continue|phase": "Chỉ vào đợt sớm được lúc nghỉ",
  "upgrade|not-ruined": "Nhà chưa đổ nát, chưa cần sửa",
  "buy|limit": "Đã mua đủ số lần trong ải",
};

const REJECT_TEXT: Readonly<Record<string, string>> = {
  gold: "Chưa đủ vàng",
  phase: "Việc này chỉ làm được lúc nghỉ",
  cooldown: "Kỹ năng đang hồi",
  rage: "Long Nộ chưa đầy",
  "ult-gap": "Tối Thượng cần nghỉ 45 s",
  occupied: "Ô đã có món",
  "slot-kind": "Món này không đặt được ở ô đó",
  limit: "Đã đủ giới hạn",
  locked: "Món chưa mở",
  full: "Túi đồ tiêu hao đã đầy",
  empty: "Ô này chưa có món",
  "max-level": "Đã ở cấp cao nhất",
  building: "Món đang dựng",
  "unknown-slot": "Không có ô này",
  stunned: "Hỏa Long đang choáng",
};

const COMMAND_TEXT: Partial<Record<SimCommand["type"], string>> = {
  skill: "Chưa dùng được kỹ năng",
  consumable: "Chưa dùng được đồ",
  buy: "Chưa mua được",
  place: "Chưa đặt được",
  upgrade: "Chưa nâng được",
  sell: "Chưa bán được",
  "call-early": "Chưa gọi sớm được",
  start: "Chưa bắt đầu được",
};

/** Gentle Vietnamese text for a `rejected` event (never a red alert). */
export function rejectText(command: SimCommand["type"], reason: string): string {
  return REJECT_PAIR[command + "|" + reason] ?? REJECT_TEXT[reason] ?? COMMAND_TEXT[command] ?? "Chưa làm được lúc này";
}

// ── The HUD ─────────────────────────────────────────────────────────────────

export interface HudOptions {
  /** Pause menu (06 §2 rule 9): the pause button and the last step of Esc. */
  onPause?(): void;
  /** Camera back to the default view (Alt + 0); the button shows only when given. */
  onCameraReset?(): void;
}

export interface Hud extends Presenter, ActionHandler {
  /** Shows a short gentle message above the carry strip. */
  toast(text: string): void;
}

interface SlotNodes {
  readonly button: HTMLButtonElement;
  readonly cool: HTMLElement;
  readonly time: HTMLElement;
  readonly count: HTMLElement | null;
}

export function createHud(root: HTMLElement, sink: CommandSink, options: HudOptions = {}): Hud {
  const doc = root.ownerDocument;
  const hud = el(doc, "div", "dh-hud");
  hud.dataset.ui = "hud";
  let world: World | null = null;

  const pressed = (button: HTMLElement, ok: boolean): void => {
    const name = ok ? "is-pressed" : "is-nope";
    button.classList.remove("is-pressed", "is-nope");
    void button.offsetWidth;
    button.classList.add(name);
  };

  // Top left: gold, wave, chain, phase line.
  const battle = el(doc, "section", "dh-panel dh-battle");
  battle.dataset.keepout = "";
  const goldStat = el(doc, "div", "dh-stat dh-stat--gold");
  goldStat.style.position = "relative";
  goldStat.innerHTML = `<span class="dh-icon">${icon("coin")}</span>`;
  const goldValue = el(doc, "b", "", "0");
  const goldFloat = el(doc, "span", "dh-gold-float");
  goldStat.append(goldValue, goldFloat);
  goldStat.title = "Vàng";
  const waveStat = el(doc, "div", "dh-stat");
  waveStat.append(el(doc, "span", "dh-label", "Đợt"));
  const waveValue = el(doc, "b", "", "0/0");
  waveStat.append(waveValue);
  const chainStat = el(doc, "div", "dh-stat dh-stat--chain");
  chainStat.append(el(doc, "span", "dh-label", "Chuỗi"));
  const chainValue = el(doc, "b", "", "0");
  const chainMult = el(doc, "span", "dh-chain-mult");
  chainStat.append(chainValue, chainMult);
  const phaseLine = el(doc, "div", "dh-phase");
  battle.append(goldStat, waveStat, chainStat, phaseLine);

  // Top right: system buttons.
  const system = el(doc, "div", "dh-system");
  system.dataset.keepout = "";
  const pauseButton = uiButton(doc, "dh-pause", () => options.onPause?.());
  pauseButton.innerHTML = icon("pause") + `<span class="dh-key">Esc</span>`;
  pauseButton.title = "Tạm dừng (Esc)";
  setShown(pauseButton, Boolean(options.onPause));
  system.append(pauseButton);
  if (options.onCameraReset) {
    const cameraButton = uiButton(doc, "dh-camera", () => options.onCameraReset?.());
    cameraButton.innerHTML = icon("camera") + `<span class="dh-key">${keyLabel("camera-reset")}</span>`;
    cameraButton.title = "Camera về hướng chuẩn (" + keyLabel("camera-reset") + ")";
    system.prepend(cameraButton);
  }

  // Bottom left: the Dragons.
  const dragons = el(doc, "section", "dh-panel dh-dragons");
  dragons.dataset.keepout = "";
  const side = el(doc, "div");
  const portrait = el(doc, "div", "dh-portrait");
  portrait.innerHTML = icon("dragon");
  const levelBadge = el(doc, "span", "dh-level", "1");
  levelBadge.title = "Cấp Rồng trong ải";
  portrait.append(levelBadge);
  const guide = el(doc, "div", "dh-guide");
  guide.innerHTML = `<span class="dh-icon">${icon("white-dragon")}</span>`;
  guide.append(el(doc, "span", "", "Bạch Long"), el(doc, "span", "", "dẫn đường"));
  guide.title = "Bạch Long đứng cạnh dẫn lời, chưa vào trận";
  side.append(portrait, guide);

  const main = el(doc, "div", "dh-dragon-main");
  const head = el(doc, "div", "dh-dragon-head");
  head.append(el(doc, "span", "dh-title", "Hỏa Long"));
  const armourChip = el(doc, "span", "dh-chip");
  armourChip.title = "Giáp";
  armourChip.innerHTML = `<span class="dh-icon">${icon("armour")}</span>`;
  const armourValue = el(doc, "b", "", "0");
  armourChip.append(armourValue);
  const shieldChip = el(doc, "span", "dh-chip");
  shieldChip.title = "Khiên";
  shieldChip.innerHTML = `<span class="dh-icon">${icon("shield")}</span>`;
  const shieldValue = el(doc, "b", "", "0");
  shieldChip.append(shieldValue);
  head.append(armourChip, shieldChip);

  const hp = el(doc, "div", "dh-hp");
  const hpGhost = el(doc, "div", "dh-hp__ghost");
  const hpFill = el(doc, "div", "dh-hp__fill");
  const hpShield = el(doc, "div", "dh-hp__shield");
  const hpText = el(doc, "span", "dh-hp__text", "");
  hp.append(hpGhost, hpFill, hpShield, hpText);

  const actions = el(doc, "div", "dh-actions");
  const makeSlot = (className: string, iconName: string, keyText: string, title: string, onPress: () => void, withCount = false): SlotNodes => {
    const button = uiButton(doc, "dh-slot " + className, onPress);
    button.title = title;
    button.innerHTML = `<span class="dh-icon">${icon(iconName)}</span>`;
    const cool = el(doc, "span", "dh-slot__cool");
    const time = el(doc, "span", "dh-slot__time");
    const count = withCount ? el(doc, "span", "dh-slot__count") : null;
    const key = el(doc, "span", "dh-key", keyText);
    button.append(cool, time, key);
    if (count) button.append(count);
    return { button, cool, time, count };
  };

  const skillSlots = SKILL_SLOTS.map((slot) =>
    makeSlot("dh-skill", slot.icon, keyLabel(slot.action), slot.nameVi + " (" + keyLabel(slot.action) + ")", () => useSkill(slot.skill, slot.action)),
  );
  const roarSlot = makeSlot("dh-roar", "roar", "Từ Khẩn", "Long Hống: gõ Từ Khẩn khi quái áp sát (một lần mỗi đợt)", () => undefined);
  roarSlot.button.querySelector(".dh-key")?.classList.add("dh-key--word");
  const sep = el(doc, "span", "dh-actions__sep");
  const consumableNodes = Array.from({ length: OUR_SIDE.consumableSlots }, (_, index) =>
    makeSlot("dh-consumable", "potion", keyLabel("consumable-" + (index + 1)), "Đồ tiêu hao (" + keyLabel("consumable-" + (index + 1)) + ")", () => useConsumable(index), true),
  );

  const rage = el(doc, "div", "dh-rage");
  const rageLabel = el(doc, "span", "dh-label", "Long Nộ");
  const rageBar = el(doc, "div", "dh-rage__bar");
  const rageFill = el(doc, "div", "dh-rage__fill");
  rageBar.append(rageFill);
  const rageValue = el(doc, "span", "dh-rage__value", "0");
  const ultSlot = makeSlot("dh-ult", ULT_SLOT.icon, keyLabel(ULT_SLOT.action), ULT_SLOT.nameVi + " (" + keyLabel(ULT_SLOT.action) + "): khi Long Nộ đầy", () => useSkill(ULT_SLOT.skill, ULT_SLOT.action));
  rage.append(rageLabel, rageBar, rageValue);
  actions.append(...skillSlots.map((slot) => slot.button), roarSlot.button, ultSlot.button, sep, ...consumableNodes.map((slot) => slot.button));

  main.append(head, hp, rage, actions);
  dragons.append(side, main);

  const toastNode = el(doc, "div", "dh-toast");
  toastNode.setAttribute("role", "status");
  let toastTimer = 0;
  const toast = (text: string): void => {
    setText(toastNode, text);
    setClass(toastNode, "is-on", true);
    const view = doc.defaultView;
    if (!view) return;
    view.clearTimeout(toastTimer);
    toastTimer = view.setTimeout(() => setClass(toastNode, "is-on", false), 1800);
  };

  hud.append(battle, system, dragons, toastNode);
  root.append(hud);

  // Commands.
  function useSkill(skill: HeroSkillId, action: string): void {
    const node = action === ULT_SLOT.action ? ultSlot.button : skillSlots[SKILL_SLOTS.findIndex((slot) => slot.action === action)]?.button;
    if (!world || !world.stage.unlocks.heroSkills.includes(skill)) {
      if (node) pressed(node, false);
      return;
    }
    const ready = skill === "inferno" ? ultView(world).full : skillCooldown(world, skill).leftS === 0;
    if (node) pressed(node, ready);
    // The sim decides; it answers a refusal with `rejected`.
    sink({ type: "skill", skill });
  }

  function useConsumable(index: number): void {
    const node = consumableNodes[index]?.button;
    const slot = world ? consumableSlots(world)[index] : undefined;
    if (!slot || slot.item === null) {
      if (node) pressed(node, false);
      toast("Ô đồ tiêu hao trống: mua Bình Máu lúc nghỉ");
      return;
    }
    if (node) pressed(node, slot.cool.leftS === 0);
    sink({ type: "consumable", item: slot.item });
  }

  const frame = (w: World, _info: FrameInfo): void => {
    world = w;
    const hero = w.hero;
    const phase = w.phase;
    const total = w.stage.waves.length;
    setText(goldValue, String(w.economy.gold));
    const shownWave = phase === "prep" || phase === "warning" ? upcomingWave(w) : Math.max(1, w.wave);
    setText(waveValue, shownWave + "/" + total);
    setText(chainValue, String(w.words.chain));
    setText(chainMult, chainMultiplier(w.words.chain));

    // Phase line: prep, warning, break clock with the call-early bonus.
    const left = phaseTicksLeft(w);
    let line = "";
    if (phase === "prep") line = `Bày binh · <b>${keyLabel("enter")}</b> để bắt đầu`;
    else if (phase === "warning") line = `Đợt ${upcomingWave(w)} tới sau <b>${clockSeconds(left ?? 0)} s</b>`;
    else if (phase === "break") {
      line = left === null
        ? `Nghỉ · <b>${keyLabel("enter")}</b> để vào đợt ${upcomingWave(w)}`
        : `Nghỉ <b>${clockSeconds(left)} s</b> · ${keyLabel("call-early")} gọi sớm <span class="dh-bonus">+${callEarlyBonus(left)} vàng</span>`;
    } else if (phase === "wave") line = `Đang giữ ải · đợt <b>${w.wave}</b>`;
    else if (phase === "victory") line = "Giữ ải thành công";
    else line = "Bệ Rồng thất thủ";
    if (phaseLine.innerHTML !== line) phaseLine.innerHTML = line;

    // The toast sits just above the strip, which folds outside prep and breaks.
    setClass(toastNode, "is-low", phase !== "prep" && phase !== "break");

    // Hỏa Long.
    const hpFrac = hero.hpMax > 0 ? Math.max(0, Math.min(1, hero.hp / hero.hpMax)) : 0;
    // The ghost bar trails the fill through its slower CSS transition, showing what a hit took.
    setVar(hp, "--fill", hpFrac.toFixed(4));
    setVar(hp, "--ghost", hpFrac.toFixed(4));
    const shieldFrac = hero.hpMax > 0 ? Math.min(1, hero.shield / hero.hpMax) : 0;
    setVar(hp, "--shield", shieldFrac.toFixed(4));
    setClass(hp, "is-low", hpFrac * 100 < URGENT.heroHpPct && hero.hp > 0);
    setText(hpText, hero.hp + " / " + hero.hpMax + (hero.shield > 0 ? " · khiên " + hero.shield : ""));
    setText(armourValue, String(hero.armour));
    setShown(shieldChip, hero.shield > 0);
    setText(shieldValue, String(hero.shield));
    setText(levelBadge, String(hero.level));
    levelBadge.title = "Cấp Rồng " + hero.level + " · " + Math.round(levelProgress(hero.level, hero.xp) * 100) + " % tới cấp sau";

    // Skills.
    const unlocked = w.stage.unlocks.heroSkills;
    SKILL_SLOTS.forEach((slot, index) => {
      const nodes = skillSlots[index]!;
      const open = unlocked.includes(slot.skill);
      setShown(nodes.button, open);
      if (!open) return;
      const cd = skillCooldown(w, slot.skill);
      setVar(nodes.cool, "--cool", cd.frac.toFixed(3));
      setText(nodes.time, cd.leftS > 0 ? String(cd.leftS) : "");
      setClass(nodes.button, "is-ready", cd.leftS === 0 && phase === "wave");
    });
    const roarOpen = unlocked.includes("roar") && w.stage.unlocks.urgentWord;
    setShown(roarSlot.button, roarOpen);
    setClass(roarSlot.button, "is-used", w.combat.urgentUsed);
    roarSlot.button.title = w.combat.urgentUsed ? "Long Hống: đã dùng trong đợt này" : "Long Hống: gõ Từ Khẩn khi quái áp sát (một lần mỗi đợt)";

    // Consumables.
    const slots = consumableSlots(w);
    slots.forEach((slot, index) => {
      const nodes = consumableNodes[index]!;
      const has = slot.item !== null;
      setClass(nodes.button, "is-empty", !has);
      setVar(nodes.cool, "--cool", has ? slot.cool.frac.toFixed(3) : "0");
      setText(nodes.time, has && slot.cool.leftS > 0 ? String(slot.cool.leftS) : "");
      if (nodes.count) setText(nodes.count, has ? String(slot.count) : "");
      const name = slot.item ? CONSUMABLES[slot.item].nameVi : "Ô trống";
      nodes.button.title = name + " (" + keyLabel(slot.action) + ")";
    });

    // Long Nộ and Viêm Đế.
    const ult = ultView(w);
    setShown(rage, w.stage.unlocks.rage);
    setVar(rageFill, "--fill", (ult.rage / 100).toFixed(3));
    setText(rageValue, String(ult.rage));
    setClass(rage, "is-full", ult.full);
    const ultOpen = unlocked.includes("inferno");
    setShown(ultSlot.button, ultOpen);
    setClass(ultSlot.button, "is-active", ult.active);
    setClass(ultSlot.button, "is-ready", ult.full && !ult.active && ult.gapS === 0);
    setVar(ultSlot.cool, "--cool", ult.active ? "0" : (1 - ult.rage / 100).toFixed(3));
    setText(ultSlot.time, ult.active ? String(ult.activeS) : "");
  };

  const onEvents = (events: readonly SimEvent[], w: World): void => {
    world = w;
    let goldDelta = 0;
    for (const event of events) {
      switch (event.type) {
        case "gold":
          if (event.reason !== "start") goldDelta += event.delta;
          break;
        case "rejected":
          toast(rejectText(event.command, event.reason));
          break;
        case "hit":
          if (event.target.kind === "hero") {
            hp.classList.remove("is-hit");
            void hp.offsetWidth;
            hp.classList.add("is-hit");
          }
          break;
        case "hero-level":
          levelBadge.classList.remove("is-up");
          void levelBadge.offsetWidth;
          levelBadge.classList.add("is-up");
          break;
        default:
          break;
      }
    }
    if (goldDelta !== 0) {
      setText(goldFloat, (goldDelta > 0 ? "+" : "−") + Math.abs(goldDelta));
      setClass(goldFloat, "is-spend", goldDelta < 0);
      goldFloat.classList.remove("is-on");
      void goldFloat.offsetWidth;
      goldFloat.classList.add("is-on");
    }
  };

  const handleAction = (action: string): boolean => {
    if (!world) return false;
    if (action === "skill-1" || action === "skill-2") {
      const slot = SKILL_SLOTS.find((entry) => entry.action === action)!;
      useSkill(slot.skill, action);
      return true;
    }
    if (action === ULT_SLOT.action) {
      useSkill(ULT_SLOT.skill, action);
      return true;
    }
    if (action.startsWith("consumable-")) {
      const index = Number(action.slice("consumable-".length)) - 1;
      if (index >= OUR_SIDE.consumableSlots) return false;
      useConsumable(index);
      return true;
    }
    if (action === "escape" && options.onPause) {
      options.onPause();
      return true;
    }
    return false;
  };

  return {
    onEvents,
    frame,
    handleAction,
    toast,
    dispose(): void {
      doc.defaultView?.clearTimeout(toastTimer);
      hud.remove();
    },
  };
}
