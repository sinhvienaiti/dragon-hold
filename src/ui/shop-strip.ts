/**
 * Carry strip (Bộ Mang Theo, 03 §4.2, 05 §4.5): bottom-right item cells with
 * icon, price and number key (1…9 in the stage's carry order, then Tim Rồng
 * and Vảy Cứng in breaks). Placeables enter placement mode; Bình Máu Nhỏ,
 * Tim Rồng and Vảy Cứng are bought through the sink. In prep and breaks the
 * strip shows names, prices and why a cell is off (grey price, faint gold
 * edge, never red); in a wave it folds to icons and keys. Upgrade and sell
 * live on the map (placement-ui edit mode). Using consumables is the HUD's.
 * Owner: ui (LANES.md).
 */
import type { ActionHandler, CommandSink, FrameInfo, Presenter } from "../app/contracts";
import { CONSUMABLES, HERO_UPGRADES, HOUSES, TRAPS, UNITS } from "../content/data/our-side";
import { OUR_SIDE } from "../content/rules";
import type { ConsumableId, HeroUpgradeId, PlaceableId, SimEvent } from "../content/types";
import type { World } from "../sim/world";
import { CONFIRM_MS, buildPhase, isPlaceable, placeableInfo, SIM_PLACEMENT_RULES, type PlacementControl, type PlacementRules } from "./placement-ui";
import { el, icon, setClass, setShown, setText, uiButton, viNumber } from "./skin";

// ── Pure cell model (tests/ui/shop-strip.test.ts) ──────────────────────────

export type CellKind = "place" | "consumable" | "hero";

export interface StripCell {
  readonly id: PlaceableId | ConsumableId | HeroUpgradeId;
  readonly kind: CellKind;
  /** Number key 1…9, or null past 9 (mouse only). */
  readonly key: number | null;
  readonly nameVi: string;
  readonly icon: string;
  /** Price now (hero buys rise per buy); null when nothing more can be bought. */
  readonly price: number | null;
  readonly enabled: boolean;
  /** Why it is off now, Vietnamese; null when enabled. */
  readonly reason: string | null;
  /** The same in a few letters for the cell ("Thiếu 20", "Hết ô"). */
  readonly short: string | null;
  /** State in words ("Có 2", "Đã mua 1/3") and as a corner badge ("2", "1/3"). */
  readonly note: string | null;
  readonly badge: string | null;
  /** One line of what it does (hover and the info line). */
  readonly effect: string;
}

const isConsumable = (id: string): id is ConsumableId => id in CONSUMABLES;

const SHORT: Readonly<Record<string, string>> = {
  "Place in breaks": "Break",
  "Buy in breaks": "Break",
  "No free slots": "Full",
  "Bag full": "Full",
};
const sec = (ms: number): string => viNumber(ms / 1000) + " s";
const metres = (mm: number): string => viNumber(mm / 1000) + " m";

/** One line of what an item does, from its data (03 §6–§9). */
export function effectLine(id: PlaceableId | ConsumableId | HeroUpgradeId): string {
  if (id in TRAPS) {
    const trap = TRAPS[id as keyof typeof TRAPS];
    const e = trap.effect;
    if (e.kind === "spikes") return `Slows ${e.slowPct}%, ${e.dps} damage per second on its lane`;
    if (e.kind === "bomb") return `Blast: ${e.damage} damage at ≥ ${trap.triggerMin} foes, knockback ${metres(e.pushMm)}; recharge ${sec(trap.rechargeMs)}`;
    return `Grounds ${e.targets > 1 ? e.targets + " low flyers" : "one low flyer"} for ${sec(e.groundMs)}, range ${metres(trap.area.radiusMm)}; recharge ${sec(trap.rechargeMs)}`;
  }
  if (id in HOUSES) {
    const house = HOUSES[id as keyof typeof HOUSES];
    return `Heals allies ${viNumber(house.effect.healPmPerS / 10)}% HP per second within ${metres(house.radiusMm)}; 5 typed kills nearby: heal ${house.pulse.healPct}%`;
  }
  if (id in UNITS) {
    const unit = UNITS[id as keyof typeof UNITS];
    return `Blocks ${unit.blockSlots} foes, ${unit.hp} HP, deals ${unit.attack.damage} every ${sec(unit.attack.periodMs)}`;
  }
  if (isConsumable(id)) {
    const item = CONSUMABLES[id];
    return `Restores ${item.effect.healPct}% of Hỏa Long's HP over ${sec(item.effect.durationMs)}; use during waves`;
  }
  const buy = HERO_UPGRADES[id as HeroUpgradeId];
  return buy.effect.kind === "max-hp" ? `+${buy.effect.pct}% max HP for Hỏa Long; heals the added HP` : `+${buy.effect.amount} ${buy.effect.kind === "armour" ? "Armor" : "Magic resist"} for Hỏa Long`;
}

/** The strip's cells now: carry items (keys 1…), then the stage's in-run buys (03 §6.2). */
export function stripCells(world: World, rules: PlacementRules = SIM_PLACEMENT_RULES): StripCell[] {
  const gold = world.economy.gold;
  const building = buildPhase(world.phase);
  const lack = (price: number): string => "Need " + (price - gold) + " Gold";
  // The cell's line stays one line at the 11 px floor in a 46 px cell (720p): "Need 35 Gold" reads "−35" under the price, "Max 3 buys" reads "Max" beside its 3/3 badge.
  const shortOf = (reason: string | null): string | null => (reason === null ? null : SHORT[reason] ?? reason.replace(/^Need (\d+) Gold$/, "−$1").replace(/^Max \d+ buys$/, "Max"));
  const cells: StripCell[] = [];
  let key = 1;
  const nextKey = (): number | null => (key <= 9 ? key++ : null);

  for (const id of world.stage.carry) {
    const k = nextKey();
    if (isPlaceable(id)) {
      const info = placeableInfo(id);
      let reason: string | null = null;
      if (!building) reason = "Place in breaks";
      else if (gold < info.cost) reason = lack(info.cost);
      else if (rules.suggestedSlots(world, id).length === 0) reason = "No free slots";
      const built = world.slots.filter((slot) => slot.item === id).length;
      cells.push({
        id, kind: "place", key: k, nameVi: info.nameVi, icon: info.icon, price: info.cost, enabled: reason === null, reason, short: shortOf(reason),
        note: built > 0 ? "Placed " + built : null, badge: built > 0 ? String(built) : null, effect: effectLine(id),
      });
    } else if (isConsumable(id)) {
      const def = CONSUMABLES[id];
      const held = Object.entries(world.shop.held).reduce((sum, [, n]) => sum + n, 0);
      const room = OUR_SIDE.consumableSlots * def.stackMax;
      const mine = world.shop.held[id] ?? 0;
      let reason: string | null = null;
      if (!building) reason = "Buy in breaks";
      else if (held >= room) reason = "Bag full";
      else if (gold < def.cost) reason = lack(def.cost);
      cells.push({
        id, kind: "consumable", key: k, nameVi: def.nameVi, icon: id, price: def.cost, enabled: reason === null, reason, short: shortOf(reason),
        note: mine > 0 ? "Held " + mine : null, badge: mine > 0 ? String(mine) : null, effect: effectLine(id),
      });
    }
  }
  for (const id of world.stage.unlocks.heroUpgrades) {
    const def = HERO_UPGRADES[id];
    const bought = world.shop.heroBuys[id] ?? 0;
    const price = bought < def.maxPerRun ? def.costs[bought] ?? null : null;
    let reason: string | null = null;
    if (price === null) reason = "Max " + def.maxPerRun + " buys";
    else if (!building) reason = "Buy in breaks";
    else if (gold < price) reason = lack(price);
    cells.push({
      id,
      kind: "hero",
      key: nextKey(),
      nameVi: def.nameVi,
      icon: id,
      price,
      enabled: reason === null,
      reason,
      short: shortOf(reason),
      note: bought > 0 ? "Bought " + bought + "/" + def.maxPerRun : null,
      badge: bought > 0 ? bought + "/" + def.maxPerRun : null,
      effect: effectLine(id),
    });
  }
  return cells;
}

// ── The strip ───────────────────────────────────────────────────────────────

export interface ShopStripOptions {
  /** Placement mode the placeable cells start (placement-ui); without it those cells only show. */
  placement?: PlacementControl;
  rules?: PlacementRules;
}

interface CellNodes {
  readonly button: HTMLButtonElement;
  readonly name: HTMLElement;
  readonly price: HTMLElement;
  readonly priceValue: HTMLElement;
  readonly reason: HTMLElement;
  readonly badge: HTMLElement;
  readonly key: HTMLElement;
}

export function createShopStrip(root: HTMLElement, sink: CommandSink, options: ShopStripOptions = {}): Presenter & ActionHandler {
  const doc = root.ownerDocument;
  const rules = options.rules ?? SIM_PLACEMENT_RULES;
  let world: World | null = null;
  let cells: StripCell[] = [];
  let hover: string | null = null;
  /** A notice in the info line; `html` is trusted markup built here (key chips). */
  let flash: { text: string; until: number; html?: string } | null = null;
  let now = 0;

  const strip = el(doc, "section", "dh-panel dh-strip");
  strip.dataset.ui = "shop-strip";
  strip.dataset.keepout = "";
  const head = el(doc, "div", "dh-strip__head");
  const title = el(doc, "span", "dh-title", "Loadout");
  const info = el(doc, "span", "dh-strip__info");
  head.append(title, info);
  const rows = el(doc, "div", "dh-strip__rows");
  const placeRow = el(doc, "div", "dh-strip__row");
  const buyRow = el(doc, "div", "dh-strip__row");
  rows.append(placeRow, buyRow);
  strip.append(head, rows);
  root.append(strip);

  const nodes = new Map<string, CellNodes>();

  /** A buy picked by key waits for the same key again (like selling, 2 s): one stray digit never spends 30–80 gold. */
  let armed: { id: string; until: number } | null = null;

  const press = (cell: StripCell, viaKey = false): void => {
    const node = nodes.get(cell.id)?.button;
    const bump = (ok: boolean): void => {
      if (!node) return;
      node.classList.remove("is-pressed", "is-nope");
      void node.offsetWidth;
      node.classList.add(ok ? "is-pressed" : "is-nope");
    };
    if (cell.kind === "place") {
      if (!options.placement) return;
      const ok = cell.enabled && options.placement.begin(cell.id as PlaceableId);
      bump(ok);
      if (!ok && cell.reason) flash = { text: cell.nameVi + ": " + cell.reason, until: now + 1800 };
      return;
    }
    if (!cell.enabled) {
      bump(false);
      flash = { text: cell.nameVi + ": " + (cell.reason ?? "cannot buy yet"), until: now + 1800 };
      return;
    }
    if (viaKey && (armed === null || armed.id !== cell.id || now > armed.until)) {
      armed = { id: cell.id, until: now + CONFIRM_MS };
      // "Bấm 6 lần nữa" read as "press six more times" (test pass 26/10): the key goes in a chip, pressed once again.
      flash = {
        text: "Press " + cell.key + " again to buy " + cell.nameVi + " (" + (cell.price ?? 0) + " Gold)",
        html: `Press <span class="dh-key">${cell.key}</span> again to buy ${cell.nameVi} (${cell.price ?? 0} Gold)`,
        until: armed.until,
      };
      nodes.get(cell.id)?.button.classList.add("is-armed");
      return;
    }
    armed = null;
    // The "press again" notice goes with the buy: it named the old price (gate round 2).
    flash = null;
    nodes.get(cell.id)?.button.classList.remove("is-armed");
    bump(true);
    sink({ type: "buy", item: cell.id as ConsumableId | HeroUpgradeId });
  };

  const build = (list: StripCell[]): void => {
    placeRow.replaceChildren();
    buyRow.replaceChildren();
    nodes.clear();
    for (const cell of list) {
      const button = uiButton(doc, "dh-cell", () => {
        const current = cells.find((entry) => entry.id === cell.id);
        if (current) press(current);
      });
      button.dataset.item = cell.id;
      button.addEventListener("mouseenter", () => (hover = cell.id));
      button.addEventListener("mouseleave", () => {
        if (hover === cell.id) hover = null;
      });
      const key = el(doc, "span", "dh-key", cell.key === null ? "" : String(cell.key));
      const iconNode = el(doc, "span", "dh-icon");
      iconNode.innerHTML = icon(cell.icon);
      const name = el(doc, "span", "dh-cell__name", cell.nameVi);
      const price = el(doc, "span", "dh-cell__price");
      price.innerHTML = `<span class="dh-icon">${icon("coin")}</span>`;
      const priceValue = el(doc, "span");
      price.append(priceValue);
      const textCol = el(doc, "span", "dh-cell__text");
      textCol.append(name, price);
      const reason = el(doc, "span", "dh-cell__reason");
      const badge = el(doc, "span", "dh-cell__badge");
      button.append(key, badge, iconNode, textCol, reason);
      setShown(key, cell.key !== null);
      (cell.kind === "place" ? placeRow : buyRow).append(button);
      nodes.set(cell.id, { button, name, price, priceValue, reason, badge, key });
    }
    setShown(buyRow, buyRow.childElementCount > 0);
  };

  const frame = (w: World, frameInfo: FrameInfo): void => {
    world = w;
    now = frameInfo.now;
    cells = stripCells(w, rules);
    const ids = cells.map((cell) => cell.id).join(",");
    if (ids !== [...nodes.keys()].join(",")) build(cells);
    const building = buildPhase(w.phase);
    setClass(strip, "is-compact", !building);
    setShown(strip, w.phase !== "victory" && w.phase !== "defeat");
    for (const cell of cells) {
      const n = nodes.get(cell.id);
      if (!n) continue;
      setText(n.priceValue, cell.price === null ? "—" : String(cell.price));
      setText(n.reason, cell.short ?? "");
      setShown(n.reason, cell.short !== null);
      setText(n.badge, cell.badge ?? "");
      setShown(n.badge, cell.badge !== null);
      const poor = cell.reason !== null && cell.reason.startsWith("Need");
      setClass(n.button, "is-poor", poor);
      setClass(n.button, "is-blocked", !cell.enabled && !poor);
      setClass(n.button, "is-on", options.placement?.item === cell.id && options.placement.mode === "place");
      setClass(n.button, "is-armed", armed !== null && armed.id === cell.id && now <= armed.until);
      const keyText = cell.key === null ? "" : " (key " + cell.key + ")";
      n.button.title = cell.nameVi + keyText + ": " + cell.effect + (cell.note ? " · " + cell.note : "") + (cell.reason ? " · " + cell.reason : "");
    }
    // Info line: a notice, the hovered cell, or the keys.
    let html: string;
    if (flash && now < flash.until) html = `<b>${flash.html ?? flash.text}</b>`;
    else {
      const cell = hover ? cells.find((entry) => entry.id === hover) : undefined;
      html = cell
        ? `<b>${cell.nameVi}</b> · ${cell.effect}` + (cell.reason ? ` · <b>${cell.reason}</b>` : "")
        : `Keys <b>1–${Math.min(9, cells.length)}</b> pick item · <span class="dh-key">\`</span> edit placed items`;
    }
    if (info.innerHTML !== html) info.innerHTML = html;
  };

  const onEvents = (events: readonly SimEvent[], w: World): void => {
    world = w;
    for (const event of events) {
      if (event.type !== "bought") continue;
      const node = nodes.get(event.item)?.button;
      if (!node) continue;
      node.classList.remove("is-pressed");
      void node.offsetWidth;
      node.classList.add("is-pressed");
    }
  };

  const handleAction = (action: string): boolean => {
    if (!world) return false;
    const match = /^carry-(\d)$/.exec(action);
    if (!match) return false;
    const cell = stripCells(world, rules).find((entry) => entry.key === Number(match[1]));
    if (!cell) return false;
    // Placeables go to placement-ui when the strip was not given it.
    if (cell.kind === "place" && !options.placement) return false;
    press(cell, true);
    return true;
  };

  return {
    onEvents,
    frame,
    handleAction,
    dispose(): void {
      strip.remove();
    },
  };
}
