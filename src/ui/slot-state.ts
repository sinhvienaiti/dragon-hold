/**
 * Trap and house state on the map in a wave (00 D33 (1), finding 11): a
 * small chip beside each built trap and over each house shows whether it is
 * ready, recharging (ring and seconds), resting or ruined, and flashes when
 * it fires ("Nổ!", "Bắn!", "Xung!"); a house shows its energy pips toward the
 * pulse (03 §8.1, §10.2). In prep and breaks the slot markers and the slot
 * menu carry the same state (`slotRuleLine`, `slotStateLine`). DOM over the
 * map through the Projector, under the word tags.
 * Owner: ui (LANES.md).
 */
import type { FrameInfo, Presenter, Projector, ScreenPoint } from "../app/contracts";
import { HOUSES, TRAPS } from "../content/data/our-side";
import type { MapDef, PlaceableId, SimEvent, SlotDef } from "../content/types";
import { houseEnergyMax } from "../sim/houses";
import { rechargeTicks } from "../sim/traps";
import type { World } from "../sim/world";
import { laneDirection } from "./placement-ui";
import { el, icon, setClass, setShown, setText, setVar, viNumber } from "./skin";

// ── Pure model (tests/ui/slot-state.test.ts) ───────────────────────────────

export type SlotLive = "ready" | "charging" | "off" | "down";

export interface SlotBadge {
  /** Map slot index. */
  readonly slot: number;
  readonly item: PlaceableId;
  readonly kind: "trap" | "house";
  /** ready: armed, running (Gai Chông) or healing (house); charging: after a shot; off: resting (E11 fire arrow); down: Đổ Nát. */
  readonly state: SlotLive;
  /** Share of the recharge done, 0–1 (1 when ready). */
  readonly charge: number;
  /** Whole seconds until ready (0 when ready). */
  readonly secondsLeft: number;
  /** A house's energy toward its pulse and the pulse's charge (03 §10.2); 0 / 0 on traps. */
  readonly energy: number;
  readonly energyMax: number;
}

const TICKS_PER_S = 60;

/** Every built trap and house now, in slot order. */
export function slotBadges(world: World): SlotBadge[] {
  const out: SlotBadge[] = [];
  const tick = world.tick;
  for (const trap of world.traps.list) {
    const def = TRAPS[trap.trap];
    let state: SlotLive = "ready";
    let charge = 1;
    let left = 0;
    if (trap.offUntil > tick) {
      state = "off";
      left = trap.offUntil - tick;
      charge = 0;
    } else if (!def.continuous && trap.readyAt > tick) {
      state = "charging";
      left = trap.readyAt - tick;
      const full = rechargeTicks(world, def, trap.level);
      charge = full > 0 ? Math.max(0, Math.min(1, 1 - left / full)) : 1;
    }
    out.push({ slot: trap.slot, item: trap.trap, kind: "trap", state, charge, secondsLeft: Math.ceil(left / TICKS_PER_S), energy: 0, energyMax: 0 });
  }
  for (const house of world.houses.list) {
    const def = HOUSES[house.house];
    out.push({
      slot: house.slot, item: house.house, kind: "house", state: house.ruined ? "down" : "ready", charge: house.ruined ? 0 : 1, secondsLeft: 0,
      energy: house.energy, energyMax: houseEnergyMax(def),
    });
  }
  return out.sort((a, b) => a.slot - b.slot);
}

/** The flash word when an item fires (Gai Chông stabs every 0.5 s: its chip flashes without a word). */
export function firedLabel(item: PlaceableId): string {
  if (item === "pine-bomb") return "Nổ!";
  if (item === "net-launcher") return "Bắn!";
  if (item in HOUSES) return "Xung!";
  return "";
}

/** When an item fires by itself, in a few words (slot menu, shop): the rule, not its numbers. */
export function slotRuleLine(item: PlaceableId): string | null {
  if (item in TRAPS) {
    const trap = TRAPS[item as keyof typeof TRAPS];
    const e = trap.effect;
    if (e.kind === "spikes") return "Luôn chạy: đâm quái đứng trên dải gai";
    if (e.kind === "net") return "Chỉ bắn quái bay";
    const area = viNumber(trap.area.radiusMm / 1000) + " m";
    return trap.triggerHeld ? `Tự nổ khi ≥ ${trap.triggerMin} quái trong ${area}, hoặc khi lính đang chặn quái trong vùng nổ` : `Tự nổ khi ≥ ${trap.triggerMin} quái trong ${area}`;
  }
  if (item in HOUSES) {
    const house = HOUSES[item as keyof typeof HOUSES];
    return `Đủ ${houseEnergyMax(house)} lần gõ hạ quái trong ${viNumber(house.radiusMm / 1000)} m: phát Xung hồi ${house.pulse.healPct} %`;
  }
  return null;
}

/** The state now in words (slot menu). */
export function slotStateLine(badge: SlotBadge): string {
  const energy = badge.kind === "house" ? ` · Năng ${badge.energy}/${badge.energyMax}` : "";
  switch (badge.state) {
    case "down":
      return "Đổ nát: tắt tới khi sửa hay hết đợt" + energy;
    case "off":
      return `Bị chặn: còn ${badge.secondsLeft} s`;
    case "charging":
      return `Đang nạp: còn ${badge.secondsLeft} s`;
    default:
      return (badge.kind === "house" ? "Đang hồi máu" : TRAPS[badge.item as keyof typeof TRAPS]?.continuous ? "Đang chạy" : "Sẵn sàng") + energy;
  }
}

/** Lane-side gap of a trap's chip, metres: left of travel (block markers take the right), clear of foes on the trap. */
export const TRAP_CHIP_SIDE_M = 2.4;
/** A house's chip floats over its roof (placeholder 2 m tall). */
export const HOUSE_CHIP_UP_M = 2.8;

/** Where a slot's chip goes in the world (metres: x, y, z). */
export function chipPoint(map: MapDef, slot: SlotDef): readonly [number, number, number] {
  if (slot.kind === "house" || !slot.lane) return [slot.pos[0], HOUSE_CHIP_UP_M, slot.pos[1]];
  const [ux, uz] = laneDirection(map, slot.lane, slot.pos);
  // Left of travel (x east, z south): (uz, −ux).
  return [slot.pos[0] + uz * TRAP_CHIP_SIDE_M, 0, slot.pos[1] - ux * TRAP_CHIP_SIDE_M];
}

/** How long the fired flash lasts, ms (the word floats up and fades). */
export const FIRED_MS = 1200;
/** Gai Chông's chip lights this long after a stab. */
export const STAB_MS = 450;

// ── Presenter ──────────────────────────────────────────────────────────────

interface Chip {
  readonly node: HTMLElement;
  readonly face: HTMLElement;
  readonly left: HTMLElement;
  readonly pips: HTMLElement;
  readonly pop: HTMLElement;
  key: string;
  firedAt: number;
}

export function createSlotState(root: HTMLElement, project: Projector): Presenter {
  const doc = root.ownerDocument;
  const layer = el(doc, "div", "dh-slotstate");
  layer.dataset.ui = "slot-state";
  root.append(layer);
  const chips = new Map<number, Chip>();
  const fired = new Set<number>();
  const at: ScreenPoint = { x: 0, y: 0, visible: false };

  const chipFor = (slot: number): Chip => {
    let chip = chips.get(slot);
    if (chip) return chip;
    const node = el(doc, "div", "dh-slotchip");
    node.dataset.slot = String(slot);
    const face = el(doc, "span", "dh-slotchip__face");
    const left = el(doc, "b", "dh-slotchip__left");
    const pips = el(doc, "span", "dh-slotchip__pips");
    const pop = el(doc, "b", "dh-slotchip__pop");
    node.append(face, left, pips, pop);
    layer.append(node);
    chip = { node, face, left, pips, pop, key: "", firedAt: -Infinity };
    chips.set(slot, chip);
    return chip;
  };

  return {
    onEvents(events: readonly SimEvent[]): void {
      for (const event of events) if (event.type === "trap-trigger" || event.type === "house-pulse") fired.add(event.slot);
    },
    frame(world: World, info: FrameInfo): void {
      const live = world.phase === "wave" || world.phase === "warning";
      setShown(layer, live);
      if (!live) {
        fired.clear();
        return;
      }
      const seen = new Set<number>();
      for (const badge of slotBadges(world)) {
        const def = world.slots[badge.slot]?.def;
        if (!def) continue;
        seen.add(badge.slot);
        const chip = chipFor(badge.slot);
        if (fired.has(badge.slot)) chip.firedAt = info.now;
        const [x, y, z] = chipPoint(world.map, def);
        const p = project(x, y, z, at);
        if (!p.visible) {
          setShown(chip.node, false);
          continue;
        }
        setShown(chip.node, true);
        chip.node.style.translate = `${p.x.toFixed(1)}px ${p.y.toFixed(1)}px`;
        const key = badge.item + ":" + badge.kind;
        if (key !== chip.key) {
          chip.key = key;
          chip.node.dataset.kind = badge.kind;
          chip.face.innerHTML = `<span class="dh-icon">${icon(badge.item)}</span>`;
          setText(chip.pop, firedLabel(badge.item));
        }
        chip.node.dataset.state = badge.state;
        setVar(chip.node, "--charge", badge.charge.toFixed(3));
        setText(chip.left, badge.state === "charging" || badge.state === "off" ? String(badge.secondsLeft) : "");
        const pipsHtml = badge.energyMax > 0 ? Array.from({ length: badge.energyMax }, (_, k) => `<i class="${k < badge.energy ? "is-on" : ""}"></i>`).join("") : "";
        if (chip.pips.innerHTML !== pipsHtml) chip.pips.innerHTML = pipsHtml;
        // Fired: the chip pops and its word floats up; Gai Chông only flashes.
        const since = info.now - chip.firedAt;
        const span = TRAPS[badge.item as keyof typeof TRAPS]?.continuous ? STAB_MS : FIRED_MS;
        const flashing = since >= 0 && since < span;
        setClass(chip.node, "is-fired", flashing);
        if (flashing && chip.pop.textContent !== "") {
          const t = since / span;
          chip.pop.style.opacity = (1 - t * t).toFixed(2);
          chip.pop.style.translate = `-50% ${(-t * 14).toFixed(1)}px`;
        } else if (chip.pop.style.opacity !== "0") chip.pop.style.opacity = "0";
      }
      fired.clear();
      for (const [slot, chip] of chips) {
        if (seen.has(slot)) continue;
        chip.node.remove();
        chips.delete(slot);
      }
    },
    dispose(): void {
      layer.remove();
      chips.clear();
    },
  };
}
