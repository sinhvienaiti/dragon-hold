/**
 * Placement mode (00 §6, 03 §4.2, 05 §4.5): number key picks an item and
 * lights the suggested slot; arrows move between slots; Enter places; Esc
 * cancels; Backquote edit mode with `=` upgrade and `-` sell (press twice).
 * Slots show only while placing or in prep and breaks (05 §2.1). Mouse: click
 * a lit slot to place; in a break click an empty slot for the items it takes,
 * or a built one to upgrade or sell. DOM markers and an SVG range ring follow
 * the camera through the Projector; the ground ghost goes through the view's
 * paths.showSlots (`onSlots`). Letters still type foes: this part never
 * claims them.
 * Owner: ui (LANES.md).
 */
import type { ActionHandler, CommandSink, FrameInfo, Presenter, Projector, ScreenPoint } from "../app/contracts";
import { HOUSES, TRAPS, UNITS } from "../content/data/our-side";
import { BLOCK } from "../content/rules";
import type { MapDef, PlaceableId, SimEvent, SlotDef, SlotKind, UpgradeDef, Vec2 } from "../content/types";
import { MAX_LEVEL, canPlace as simCanPlace, sellRefund as simSellRefund, suggestedSlots as simSuggestedSlots, upgradePrice, type PlaceCheck } from "../sim/placement";
import type { World } from "../sim/world";
import { upcomingWave } from "./hud";
import { publishZones } from "./screen-zones";
import { el, icon, keyLabel, setClass, setShown, setText, uiButton } from "./skin";
import { summarizeWave } from "./wave-card";

// ── Pure helpers (tests/ui/placement.test.ts) ──────────────────────────────

export const MAX_ITEM_LEVEL = MAX_LEVEL;
/** A second `=` or `-` within this long confirms (00 §6: press twice). */
export const CONFIRM_MS = 2000;

export interface PlaceableInfo {
  readonly id: PlaceableId;
  readonly nameVi: string;
  readonly cost: number;
  readonly slot: SlotKind;
  readonly icon: string;
  readonly upgrade: UpgradeDef;
}

export function isPlaceable(id: string): id is PlaceableId {
  return id in TRAPS || id in HOUSES || id in UNITS;
}

export function placeableInfo(id: PlaceableId): PlaceableInfo {
  const def = id in TRAPS ? TRAPS[id as keyof typeof TRAPS] : id in HOUSES ? HOUSES[id as keyof typeof HOUSES] : UNITS[id as keyof typeof UNITS];
  return { id, nameVi: def.nameVi, cost: def.cost, slot: def.footprint.slot, icon: id, upgrade: def.upgrade };
}

/** Gold for the next level of an item at `level` (the sim's upgradePrice, 03 §0.2); null at the top. */
export function upgradeCost(item: PlaceableId, level: number): number | null {
  const price = upgradePrice(item, level);
  return price > 0 ? price : null;
}

/** Gold selling slot `index` gives back now (the sim's sellRefund, 03 §0.2: 70 %, 100 % in the break it was bought). */
export function sellRefund(world: World, index: number): number {
  return simSellRefund(world, index);
}

/** Building, upgrading and selling happen in prep and breaks (03 §0.1 rule 6; quick place from C6 is not in M0). */
export const buildPhase = (phase: World["phase"]): boolean => phase === "prep" || phase === "break";

const SLOT_KIND_VI: Readonly<Record<SlotKind, string>> = { trap: "Ô bẫy", house: "Bệ nhà", block: "Điểm giữ" };

const PLACE_REASON_VI: Readonly<Record<Exclude<PlaceCheck, { ok: true }>["reason"], string>> = {
  "slot-kind": "Món này không hợp ô này",
  occupied: "Ô đã có món",
  phase: "Chỉ đặt lúc nghỉ đợt",
  gold: "Chưa đủ vàng",
  limit: "Đã đủ số món này",
  locked: "Món chưa mở",
  "unknown-slot": "Không có ô này",
};

/** Vietnamese reason a place check failed, with the gold missing when that is why; null when it is fine. */
export function placeReason(check: PlaceCheck, gold: number, cost: number): string | null {
  if (check.ok) return null;
  if (check.reason === "gold") return "Thiếu " + Math.max(0, cost - gold) + " vàng";
  return PLACE_REASON_VI[check.reason];
}

export type Direction = "left" | "right" | "up" | "down";

const DIRS: Readonly<Record<Direction, readonly [number, number]>> = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };

/**
 * The candidate an arrow moves to on screen: the nearest one in that
 * direction (sideways distance counts double); with none there, the next or
 * previous in keyboard order (wrapping).
 */
export function stepByDirection(
  points: ReadonlyMap<number, { readonly x: number; readonly y: number }>,
  candidates: readonly number[],
  from: number,
  dir: Direction,
): number {
  if (candidates.length === 0) return -1;
  const at = points.get(from);
  const [dx, dy] = DIRS[dir];
  if (at) {
    // First inside a cone of about ±63° around the arrow, then anything ahead.
    for (const coneOnly of [true, false]) {
      let best = -1;
      let bestCost = Infinity;
      for (const index of candidates) {
        if (index === from) continue;
        const p = points.get(index);
        if (!p) continue;
        const vx = p.x - at.x;
        const vy = p.y - at.y;
        const along = vx * dx + vy * dy;
        const side = Math.abs(vx * dy - vy * dx);
        if (along <= 1 || (coneOnly && along * 2 < side)) continue;
        const cost = along + side * 2;
        if (cost < bestCost) {
          bestCost = cost;
          best = index;
        }
      }
      if (best >= 0) return best;
    }
  }
  const k = candidates.indexOf(from);
  const forward = dir === "right" || dir === "down";
  if (k < 0) return candidates[0]!;
  return candidates[(k + (forward ? 1 : candidates.length - 1)) % candidates.length]!;
}

/** Unit direction of a lane near `pos` (metres), gate towards the dais. */
export function laneDirection(map: MapDef, laneId: string, pos: Vec2): Vec2 {
  const lane = map.lanes.find((entry) => entry.id === laneId);
  if (!lane || lane.points.length < 2) return [0, 1];
  let best: Vec2 = [0, 1];
  let bestD = Infinity;
  for (let k = 1; k < lane.points.length; k += 1) {
    const [ax, az] = lane.points[k - 1]!;
    const [bx, bz] = lane.points[k]!;
    const sx = bx - ax;
    const sz = bz - az;
    const len2 = sx * sx + sz * sz || 1;
    const t = Math.max(0, Math.min(1, ((pos[0] - ax) * sx + (pos[1] - az) * sz) / len2));
    const qx = ax + sx * t - pos[0];
    const qz = az + sz * t - pos[1];
    const d = qx * qx + qz * qz;
    if (d < bestD) {
      bestD = d;
      const len = Math.sqrt(len2);
      best = [sx / len, sz / len];
    }
  }
  return best;
}

/** The ground outline (metres) an item covers at a slot: a strip along the lane, or a circle (house aura, trap area, unit leash). */
export function areaOutline(map: MapDef, slot: SlotDef, item: PlaceableId, points = 32): Vec2[] {
  let radiusM = BLOCK.leashMm / 1000;
  if (item in TRAPS) {
    const area = TRAPS[item as keyof typeof TRAPS].area;
    if (area.shape === "strip" && slot.lane) {
      const [ux, uz] = laneDirection(map, slot.lane, slot.pos);
      const half = (area.lengthMm ?? area.radiusMm * 2) / 2000;
      const side = area.radiusMm / 1000;
      const [x, z] = slot.pos;
      return [
        [x - ux * half - uz * side, z - uz * half + ux * side],
        [x + ux * half - uz * side, z + uz * half + ux * side],
        [x + ux * half + uz * side, z + uz * half - ux * side],
        [x - ux * half + uz * side, z - uz * half - ux * side],
      ];
    }
    radiusM = area.radiusMm / 1000;
  } else if (item in HOUSES) radiusM = HOUSES[item as keyof typeof HOUSES].radiusMm / 1000;
  const out: Vec2[] = [];
  for (let k = 0; k < points; k += 1) {
    const a = (k / points) * Math.PI * 2;
    out.push([slot.pos[0] + Math.cos(a) * radiusM, slot.pos[1] + Math.sin(a) * radiusM]);
  }
  return out;
}

/** Block points sit beside the path (05 §4.5: a planted flag), so their marker moves 2.2 m to the lane's right, clear of the trap slot there. */
export const BLOCK_MARKER_SIDE_M = 2.2;

/** Where a slot's DOM marker goes (metres); trap slots and pads stay on their point. */
export function markerPoint(map: MapDef, slot: SlotDef): Vec2 {
  if (slot.kind !== "block" || !slot.lane) return slot.pos;
  const [ux, uz] = laneDirection(map, slot.lane, slot.pos);
  // Right of travel (x east, z south): (−uz, ux).
  return [slot.pos[0] - uz * BLOCK_MARKER_SIDE_M, slot.pos[1] + ux * BLOCK_MARKER_SIDE_M];
}

// ── The placement layer ─────────────────────────────────────────────────────

export type PlacementMode = "idle" | "place" | "edit";

/** Placement queries; the sim's placement.ts by default (a mock page may pass its own). */
export interface PlacementRules {
  canPlace(world: World, item: PlaceableId, index: number): PlaceCheck;
  suggestedSlots(world: World, item: PlaceableId): number[];
}

export const SIM_PLACEMENT_RULES: PlacementRules = { canPlace: simCanPlace, suggestedSlots: simSuggestedSlots };

export interface PlacementOptions {
  /** Ground slot markers in the view (paths.showSlots): visible, and the slots to light. */
  onSlots?(visible: boolean, highlight: readonly number[]): void;
  rules?: PlacementRules;
}

/** What the carry strip drives. */
export interface PlacementControl {
  readonly mode: PlacementMode;
  readonly item: PlaceableId | null;
  /** Enters placement with `item` (pressing it again moves to the next suggested slot); false outside prep and breaks. */
  begin(item: PlaceableId): boolean;
  /** Enters edit mode over built items. */
  edit(): boolean;
  cancel(): void;
}

export type PlacementUi = Presenter & ActionHandler & PlacementControl;

interface Marker {
  readonly node: HTMLButtonElement;
  iconKey: string;
}

export function createPlacementUi(root: HTMLElement, project: Projector, sink: CommandSink, options: PlacementOptions = {}): PlacementUi {
  const doc = root.ownerDocument;
  const rules = options.rules ?? SIM_PLACEMENT_RULES;
  const SVG_NS = "http://www.w3.org/2000/svg";

  const layer = el(doc, "div", "dh-place");
  layer.dataset.ui = "placement";
  const svg = doc.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "dh-place__rings");
  const ring = doc.createElementNS(SVG_NS, "polygon");
  ring.setAttribute("class", "dh-place__ring");
  svg.append(ring);
  const markersNode = el(doc, "div");
  const card = el(doc, "div", "dh-panel dh-place-card");
  const cardTitle = el(doc, "span", "dh-title");
  const cardLines = el(doc, "div", "dh-place-card__lines");
  card.append(cardTitle, cardLines);
  const menu = el(doc, "div", "dh-panel dh-place-menu");
  const help = el(doc, "div", "dh-place-help");
  layer.append(svg, markersNode, help);
  setShown(card, false);
  setShown(menu, false);
  setShown(help, false);
  // The card and menu sit above the HUD so they never hide under a panel.
  root.append(layer, card, menu);

  let world: World | null = null;
  let mode: PlacementMode = "idle";
  let item: PlaceableId | null = null;
  let cursor = -1;
  let candidates: number[] = [];
  let armed: { action: "upgrade" | "sell"; slot: number; until: number } | null = null;
  let menuSlot = -1;
  let menuArmed: { action: "upgrade" | "sell"; until: number } | null = null;
  let notice = "";
  let noticeUntil = 0;
  let now = 0;
  let lastSlotsKey = "";
  let lastCardKey = "";
  let lastMenuKey = "";
  const markers: Marker[] = [];
  const screen = new Map<number, ScreenPoint>();
  const scratch: ScreenPoint = { x: 0, y: 0, visible: false };

  const say = (text: string): void => {
    notice = text;
    noticeUntil = now + 1800;
  };

  const slotName = (w: World, index: number): string => {
    const slot = w.slots[index];
    if (!slot) return "";
    const lane = slot.def.lane ? w.map.lanes.find((entry) => entry.id === slot.def.lane)?.nameVi : null;
    return SLOT_KIND_VI[slot.def.kind] + (lane ? " · " + lane : slot.def.ring === "outer" ? " · vòng ngoài" : slot.def.ring === "inner" ? " · vòng trong" : "");
  };

  const closeMenu = (): void => {
    menuSlot = -1;
    menuArmed = null;
    lastMenuKey = "";
    setShown(menu, false);
  };

  const cancel = (): void => {
    mode = "idle";
    item = null;
    cursor = -1;
    armed = null;
    candidates = [];
    closeMenu();
  };

  const begin = (next: PlaceableId): boolean => {
    if (!world) return false;
    if (!buildPhase(world.phase)) {
      say("Chỉ đặt món lúc nghỉ đợt");
      return false;
    }
    closeMenu();
    armed = null;
    if (mode === "place" && item === next) {
      // Same key again: next suggested slot.
      const list = rules.suggestedSlots(world, next);
      if (list.length > 0) cursor = list[(list.indexOf(cursor) + 1) % list.length]!;
      return true;
    }
    mode = "place";
    item = next;
    cursor = -1;
    return true;
  };

  const edit = (): boolean => {
    if (!world) return false;
    if (!buildPhase(world.phase)) {
      say("Chỉ sửa món lúc nghỉ đợt");
      return false;
    }
    if (!world.slots.some((slot) => slot.item !== null)) {
      say("Chưa có món nào để sửa");
      return false;
    }
    closeMenu();
    mode = "edit";
    item = null;
    armed = null;
    cursor = -1;
    return true;
  };

  const placeAt = (index: number, what: PlaceableId): void => {
    if (!world) return;
    const slot = world.slots[index];
    if (!slot) return;
    const check = rules.canPlace(world, what, index);
    const reason = placeReason(check, world.economy.gold, placeableInfo(what).cost);
    if (reason) {
      say(reason);
      return;
    }
    sink({ type: "place", item: what, slot: slot.def.id });
    cancel();
  };

  /** `=` or `-` on a built slot: the first press arms, a second within 2 s sends. */
  const pressEdit = (action: "upgrade" | "sell", index: number, viaMenu: boolean): void => {
    if (!world) return;
    const slot = world.slots[index];
    if (!slot || slot.item === null) return;
    if (action === "upgrade" && upgradeCost(slot.item, slot.level) === null) {
      say("Đã ở cấp cao nhất");
      return;
    }
    const current = viaMenu ? menuArmed : armed && armed.slot === index ? armed : null;
    if (current && current.action === action && now <= current.until) {
      sink(action === "upgrade" ? { type: "upgrade", slot: slot.def.id } : { type: "sell", slot: slot.def.id });
      if (viaMenu) closeMenu();
      armed = null;
      menuArmed = null;
      if (action === "sell" && mode === "edit") cursor = -1;
      return;
    }
    if (viaMenu) menuArmed = { action, until: now + CONFIRM_MS };
    else armed = { action, slot: index, until: now + CONFIRM_MS };
  };

  const openMenu = (index: number): void => {
    if (!world || !buildPhase(world.phase)) return;
    if (menuSlot === index) {
      closeMenu();
      return;
    }
    menuSlot = index;
    menuArmed = null;
    lastMenuKey = "";
  };

  const onMarker = (index: number): void => {
    if (!world) return;
    if (mode === "place" && item) {
      if (candidates.includes(index)) placeAt(index, item);
      return;
    }
    if (mode === "edit") {
      if (world.slots[index]?.item) cursor = index;
      return;
    }
    openMenu(index);
  };

  const ensureMarkers = (w: World): void => {
    while (markers.length < w.slots.length) {
      const index = markers.length;
      const node = uiButton(doc, "dh-marker", () => onMarker(index));
      node.dataset.slot = String(index);
      node.addEventListener("mouseenter", () => {
        if ((mode === "place" && candidates.includes(index)) || (mode === "edit" && world?.slots[index]?.item)) cursor = index;
      });
      node.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        cancel();
      });
      node.hidden = true;
      markersNode.append(node);
      markers.push({ node, iconKey: "" });
    }
  };

  const kindIcon: Readonly<Record<SlotKind, string>> = { trap: "bar", house: "rune", block: "flag" };

  /** Puts a floating panel next to a screen point, clear of HUD panels (`data-keepout`) and inside the viewport. */
  const placeNear = (node: HTMLElement, x: number, y: number, prefer: "above" | "below"): void => {
    const view = doc.defaultView;
    if (!view) return;
    const ui = Number.parseFloat(view.getComputedStyle(doc.documentElement).getPropertyValue("--ui")) || 1;
    const w = node.offsetWidth;
    const h = node.offsetHeight;
    const gap = 24 * ui;
    const keep = [...root.querySelectorAll<HTMLElement>("[data-keepout]")].filter((panel) => !panel.hidden && panel.offsetParent !== null).map((panel) => panel.getBoundingClientRect());
    const above = { left: x - w / 2, top: y - gap - h };
    const below = { left: x - w / 2, top: y + gap };
    const spots = prefer === "above"
      ? [above, below, { left: x + gap, top: y - h / 2 }, { left: x - gap - w, top: y - h / 2 }]
      : [below, above, { left: x + gap, top: y - h / 2 }, { left: x - gap - w, top: y - h / 2 }];
    const margin = 8;
    let best = spots[0]!;
    let bestCost = Infinity;
    for (const spot of spots) {
      const left = Math.max(margin, Math.min(view.innerWidth - w - margin, spot.left));
      const top = Math.max(margin, Math.min(view.innerHeight - h - margin, spot.top));
      let cost = 0;
      for (const r of keep) {
        const ox = Math.max(0, Math.min(left + w, r.right) - Math.max(left, r.left));
        const oy = Math.max(0, Math.min(top + h, r.bottom) - Math.max(top, r.top));
        cost += ox * oy;
      }
      // Covering the slot itself is worse than a small overlap.
      if (x > left && x < left + w && y > top && y < top + h) cost += w * h;
      if (cost < bestCost) {
        bestCost = cost;
        best = { left, top };
      }
      if (cost === 0) break;
    }
    node.style.translate = `${best.left.toFixed(1)}px ${best.top.toFixed(1)}px`;
  };

  const renderMenu = (w: World): void => {
    if (menuSlot < 0) return;
    const slot = w.slots[menuSlot];
    const at = screen.get(menuSlot);
    if (!slot || !at || !buildPhase(w.phase)) {
      closeMenu();
      return;
    }
    const key = [menuSlot, slot.item, slot.level, w.economy.gold, menuArmed?.action ?? "", w.phase].join("|");
    if (key === lastMenuKey) {
      placeNear(menu, at.x, at.y, "below");
      return;
    }
    lastMenuKey = key;
    const children: HTMLElement[] = [];
    if (slot.item === null) {
      children.push(el(doc, "span", "dh-title", slotName(w, menuSlot)));
      const items = w.stage.carry.filter((id): id is PlaceableId => isPlaceable(id) && placeableInfo(id).slot === slot.def.kind);
      for (const id of items) {
        const info = placeableInfo(id);
        const check = rules.canPlace(w, id, menuSlot);
        const reason = placeReason(check, w.economy.gold, info.cost);
        const button = uiButton(doc, reason ? "is-poor" : "", () => placeAt(menuSlot, id));
        button.title = reason ?? info.nameVi;
        const keyIndex = w.stage.carry.indexOf(id) + 1;
        button.innerHTML = `<span class="dh-key">${keyIndex}</span><span class="dh-icon">${icon(info.icon)}</span>`;
        button.append(el(doc, "span", "", info.nameVi), el(doc, "span", "", String(info.cost)));
        children.push(button);
      }
      if (items.length === 0) children.push(el(doc, "span", "dh-place-card__line", "Bộ Mang Theo không có món cho ô này"));
    } else {
      const info = placeableInfo(slot.item);
      children.push(el(doc, "span", "dh-title", info.nameVi + " · cấp " + slot.level));
      const cost = upgradeCost(slot.item, slot.level);
      const up = uiButton(doc, cost === null || cost > w.economy.gold ? "is-poor" : "", () => pressEdit("upgrade", menuSlot, true));
      up.innerHTML = `<span class="dh-key">=</span>`;
      up.append(el(doc, "span", "", menuArmed?.action === "upgrade" ? "Bấm lần nữa để nâng" : cost === null ? "Cấp tối đa" : "Nâng cấp " + (slot.level + 1)), el(doc, "span", "", cost === null ? "" : String(cost)));
      if (cost === null) up.disabled = true;
      const sell = uiButton(doc, "", () => pressEdit("sell", menuSlot, true));
      sell.innerHTML = `<span class="dh-key">-</span>`;
      sell.append(el(doc, "span", "", menuArmed?.action === "sell" ? "Bấm lần nữa để bán" : "Bán"), el(doc, "span", "", "+" + sellRefund(w, menuSlot)));
      children.push(up, sell);
    }
    menu.replaceChildren(...children);
    setShown(menu, true);
    placeNear(menu, at.x, at.y, "below");
  };

  const frame = (w: World, info: FrameInfo): void => {
    world = w;
    now = info.now;
    ensureMarkers(w);
    // Lanes and slots on screen, for the floating cards that must not cover them (wave card, Thẻ Ôn).
    publishZones(root, w.map, project);
    const building = buildPhase(w.phase);
    if (mode !== "idle" && !building) cancel();
    if (menuSlot >= 0 && !building) closeMenu();
    if (armed && now > armed.until) armed = null;
    if (menuArmed && now > menuArmed.until) {
      menuArmed = null;
      lastMenuKey = "";
    }

    // Which slots show (05 §2.1: only while placing or in prep and breaks).
    let visible: number[] = [];
    if (mode === "place" && item) {
      candidates = rules.suggestedSlots(w, item);
      if (!candidates.includes(cursor)) cursor = candidates[0] ?? -1;
      visible = candidates;
    } else if (mode === "edit") {
      candidates = w.slots.filter((slot) => slot.item !== null).map((slot) => slot.index);
      if (candidates.length === 0) {
        cancel();
      } else if (!candidates.includes(cursor)) cursor = candidates[0]!;
      visible = candidates;
    } else if (building) {
      visible = w.slots.map((slot) => slot.index);
    }
    const shown = new Set(visible);

    screen.clear();
    for (const marker of markers) {
      const index = Number(marker.node.dataset.slot);
      const slot = w.slots[index];
      if (!slot || !shown.has(index)) {
        setShown(marker.node, false);
        continue;
      }
      const [mx, mz] = markerPoint(w.map, slot.def);
      const p = project(mx, 0, mz, scratch);
      if (!p.visible) {
        setShown(marker.node, false);
        continue;
      }
      screen.set(index, { x: p.x, y: p.y, visible: true });
      setShown(marker.node, true);
      // The translate property, not transform: the cursor and dim scales must not scale the position.
      marker.node.style.translate = `${p.x.toFixed(1)}px ${p.y.toFixed(1)}px`;
      marker.node.dataset.kind = slot.def.kind;
      const iconKey = slot.item ? slot.item + ":" + slot.level : "empty:" + slot.def.kind;
      if (iconKey !== marker.iconKey) {
        marker.iconKey = iconKey;
        marker.node.innerHTML = slot.item
          ? `<span class="dh-icon">${icon(slot.item)}</span><span class="dh-marker__pips">${[1, 2, 3].map((k) => `<i class="${k <= slot.level ? "is-on" : ""}"></i>`).join("")}</span>`
          : `<span class="dh-icon">${icon(kindIcon[slot.def.kind])}</span>`;
        marker.node.title = slot.item ? placeableInfo(slot.item).nameVi + " · cấp " + slot.level : slotName(w, index);
      }
      setClass(marker.node, "is-filled", slot.item !== null);
      setClass(marker.node, "is-cand", mode === "place");
      setClass(marker.node, "is-cursor", mode !== "idle" && index === cursor);
      setClass(marker.node, "is-dim", mode === "idle" && slot.item === null && menuSlot !== index);
    }

    // Range ring and the card at the cursor.
    const cursorSlot = cursor >= 0 ? w.slots[cursor] : undefined;
    const cursorAt = cursor >= 0 ? screen.get(cursor) : undefined;
    const ringItem = mode === "place" ? item : mode === "edit" ? cursorSlot?.item ?? null : null;
    if (cursorSlot && cursorAt && ringItem) {
      const outline = areaOutline(w.map, cursorSlot.def, ringItem);
      const pts: string[] = [];
      for (const [x, z] of outline) {
        const p = project(x, 0, z, scratch);
        pts.push(p.x.toFixed(1) + "," + p.y.toFixed(1));
      }
      ring.setAttribute("points", pts.join(" "));
      ring.setAttribute("class", "dh-place__ring" + (mode === "edit" ? " is-edit" : ""));
      svg.style.display = "";
    } else {
      svg.style.display = "none";
    }

    if (cursorSlot && cursorAt && mode !== "idle") {
      const lines: { html: string; armed?: boolean }[] = [];
      let titleText = "";
      if (mode === "place" && item) {
        const info = placeableInfo(item);
        titleText = info.nameVi;
        const reason = placeReason(rules.canPlace(w, item, cursor), w.economy.gold, info.cost);
        lines.push({ html: `<span class="dh-money">${info.cost} vàng</span> · ${slotName(w, cursor)}` });
        if (cursorSlot.def.lane) {
          const summary = summarizeWave(w.stage, w.map, upcomingWave(w));
          const count = summary?.lanes.find((lane) => lane.id === cursorSlot.def.lane)?.count ?? 0;
          lines.push({ html: `Đợt kế: <b>${count}</b> quái qua đường này` });
        }
        lines.push({ html: reason ? `<b>${reason}</b>` : `<span class="dh-key">${keyLabel("enter")}</span> đặt · <span class="dh-key">Esc</span> hủy` });
      } else if (mode === "edit" && cursorSlot.item) {
        const info = placeableInfo(cursorSlot.item);
        titleText = info.nameVi + " · cấp " + cursorSlot.level;
        const cost = upgradeCost(cursorSlot.item, cursorSlot.level);
        lines.push({
          html: cost === null ? "Cấp tối đa" : `<span class="dh-key">=</span> nâng cấp ${cursorSlot.level + 1}: <span class="dh-money">${cost} vàng</span>`,
        });
        lines.push({ html: `<span class="dh-key">-</span> bán: <span class="dh-money">+${sellRefund(w, cursor)} vàng</span>` });
        if (armed && armed.slot === cursor) {
          const up = armed.action === "upgrade";
          lines.push({ html: `Bấm <span class="dh-key">${up ? "=" : "-"}</span> lần nữa để ${up ? "nâng" : "bán"}`, armed: true });
        }
      }
      const cardKey = titleText + "|" + lines.map((line) => line.html).join("|");
      if (cardKey !== lastCardKey) {
        lastCardKey = cardKey;
        setText(cardTitle, titleText);
        cardLines.innerHTML = lines.map((line) => `<div class="dh-place-card__line${line.armed ? " is-armed" : ""}">${line.html}</div>`).join("");
      }
      setShown(card, true);
      placeNear(card, cursorAt.x, cursorAt.y, "above");
    } else {
      setShown(card, false);
    }

    renderMenu(w);

    // Help line: the keys of the current mode, or a short notice.
    let helpHtml = "";
    if (now < noticeUntil) helpHtml = notice;
    else if (mode === "place") helpHtml = candidates.length === 0 ? "Hết ô trống cho món này · <span class=\"dh-key\">Esc</span> hủy" : `<span class="dh-key">←</span><span class="dh-key">→</span><span class="dh-key">↑</span><span class="dh-key">↓</span> đổi ô · <span class="dh-key">${keyLabel("enter")}</span> đặt · <span class="dh-key">Esc</span> hủy · chữ cái vẫn gõ quái`;
    else if (mode === "edit") helpHtml = `Sửa món: <span class="dh-key">←</span><span class="dh-key">→</span> chọn · <span class="dh-key">=</span> nâng (2 lần) · <span class="dh-key">-</span> bán (2 lần) · <span class="dh-key">Esc</span> thoát`;
    if (help.innerHTML !== helpHtml) help.innerHTML = helpHtml;
    setShown(help, helpHtml !== "");

    // While placing or editing, the wave card folds (CSS) so slots near the gates stay visible.
    const placing = mode === "idle" ? "" : mode;
    if (root.dataset.placing !== placing) root.dataset.placing = placing;

    // Ground markers in the view.
    const highlight = mode === "idle" ? [] : visible;
    const slotsKey = (visible.length > 0 ? "1" : "0") + ":" + highlight.join(",");
    if (slotsKey !== lastSlotsKey) {
      lastSlotsKey = slotsKey;
      options.onSlots?.(visible.length > 0, highlight);
    }
  };

  const onEvents = (events: readonly SimEvent[], w: World): void => {
    world = w;
    for (const event of events) {
      if (event.type === "phase" && !buildPhase(event.phase)) cancel();
      if (event.type === "sold" && mode === "edit" && w.slots[event.slot]) cursor = -1;
    }
  };

  const move = (dir: Direction): void => {
    if (candidates.length === 0) return;
    cursor = stepByDirection(screen, candidates, cursor, dir);
    armed = null;
  };

  const handleAction = (action: string): boolean => {
    if (!world) return false;
    const carry = /^carry-(\d)$/.exec(action);
    if (carry) {
      const id = world.stage.carry[Number(carry[1]) - 1];
      if (!id || !isPlaceable(id)) return false;
      begin(id);
      return true;
    }
    switch (action) {
      case "edit-mode":
        if (mode === "edit") cancel();
        else edit();
        return true;
      case "rotate-left":
      case "rotate-right":
      case "tilt-up":
      case "tilt-down":
        if (mode === "idle") return false;
        move(action === "rotate-left" ? "left" : action === "rotate-right" ? "right" : action === "tilt-up" ? "up" : "down");
        return true;
      case "enter":
        if (mode === "place" && item) {
          if (cursor >= 0) placeAt(cursor, item);
          else say("Hết ô trống cho món này");
          return true;
        }
        return mode === "edit";
      case "escape":
        if (menuSlot >= 0) {
          closeMenu();
          return true;
        }
        if (mode !== "idle") {
          cancel();
          return true;
        }
        return false;
      case "upgrade":
      case "sell":
        if (mode !== "edit") return false;
        if (cursor >= 0) pressEdit(action, cursor, false);
        return true;
      default:
        return false;
    }
  };

  return {
    get mode() {
      return mode;
    },
    get item() {
      return item;
    },
    begin,
    edit,
    cancel,
    onEvents,
    frame,
    handleAction,
    dispose(): void {
      options.onSlots?.(false, []);
      delete root.dataset.placing;
      layer.remove();
      card.remove();
      menu.remove();
    },
  };
}
