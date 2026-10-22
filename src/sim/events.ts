/**
 * The sim's output queue (types.ts SimEvent). Systems push; the app drains
 * once a frame and hands the batch to view, audio, UI and learning. Readers
 * never change the world, events never feed back into rules, and the queue
 * is not part of hashWorld.
 * Owner: architect for M0a setup, sim-battle afterwards (LANES.md).
 */
import type { SimEvent } from "../content/types";

/** Undrained events past this many are dropped oldest first (a headless run that never drains). */
export const EVENT_QUEUE_CAP = 20_000;

/** Distributes `Omit` over the union so each member keeps its own fields. */
export type EventBody = SimEvent extends infer E ? (E extends SimEvent ? Omit<E, "tick"> : never) : never;

export class EventQueue {
  private items: SimEvent[] = [];
  /** Total ever pushed, for readers that count. */
  pushed = 0;
  dropped = 0;

  push(event: SimEvent): void {
    if (this.items.length >= EVENT_QUEUE_CAP) {
      this.items.shift();
      this.dropped += 1;
    }
    this.items.push(event);
    this.pushed += 1;
  }

  /** Everything since the last drain, oldest first; the queue is empty afterwards. */
  drain(): SimEvent[] {
    const out = this.items;
    this.items = [];
    return out;
  }

  get length(): number {
    return this.items.length;
  }
}

/** Stamps `body` with the current tick and queues it. */
export function emit(world: { readonly tick: number; readonly events: EventQueue }, body: EventBody): void {
  world.events.push({ ...body, tick: world.tick } as SimEvent);
}
