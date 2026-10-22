/**
 * Map slots (03 §0.1 rule 4): what sits where, at which level, what it cost.
 * Pure queries for shop, UI ghosts and bots: which slots take an item, in
 * the keyboard order of 00 §6 (number key, arrows, Enter).
 * Owner: sim-ourside (LANES.md). Stub: signatures fixed, bodies TODO.
 */
import type { PlaceableId, SlotDef } from "../content/types";
import { mToU } from "./fixed";
import type { WorldInit, World } from "./world";

export interface SlotState {
  readonly index: number;
  readonly def: SlotDef;
  /** Position in u. */
  readonly x: number;
  readonly z: number;
  /** Lane index for trap and block slots (−1: house pad). */
  readonly lane: number;
  /** u from the lane's gate (lane slots). */
  readonly along: number;
  item: PlaceableId | null;
  level: number;
  /** Gold spent on it so far (sell refunds 70 %, 03 §0.2). */
  spent: number;
  /** Break number it was bought in (same break: 100 % refund). */
  boughtInBreak: number;
}

export function createSlots(init: WorldInit): SlotState[] {
  return init.map.slots.map((def, index) => ({
    index,
    def,
    x: mToU(def.pos[0]),
    z: mToU(def.pos[1]),
    lane: def.lane === undefined ? -1 : init.lanes.findIndex((lane) => lane.id === def.lane),
    along: def.atM === undefined ? 0 : mToU(def.atM),
    item: null,
    level: 0,
    spent: 0,
    boughtInBreak: -1,
  }));
}

export type PlaceCheck = { readonly ok: true } | { readonly ok: false; readonly reason: "slot-kind" | "occupied" | "phase" | "gold" | "limit" | "locked" | "unknown-slot" };

/** Index of the slot with `id`, or −1. */
export function slotIndex(world: World, id: string): number {
  return world.slots.findIndex((slot) => slot.def.id === id);
}

/** Whether `item` may go into slot `index` now (kind, free, phase, gold, limits). */
export function canPlace(world: World, item: PlaceableId, index: number): PlaceCheck {
  // TODO(sim-ourside)
  return { ok: false, reason: "phase" };
}

/** Free slots that take `item`, in keyboard order (the suggested one first). */
export function suggestedSlots(world: World, item: PlaceableId): number[] {
  // TODO(sim-ourside)
  return [];
}
