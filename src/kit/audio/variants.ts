export type VariantOptions<S extends string = string> = {
  random?: () => number;
  /** Defaults to one; a game can use two for correct keys. */
  avoidLast?: number | Partial<Readonly<Record<NoInfer<S>, number>>>;
};

/** Histories contain original manifest indices, even when only some files decoded. */
export class VariantPicker<S extends string = string> {
  private readonly history = new Map<S, number[]>();
  private readonly random: () => number;
  constructor(private readonly options: VariantOptions<S> = {}) { this.random = options.random ?? Math.random; }

  /** Explicit variants are zero-based; an unavailable variant returns undefined. */
  pick(id: S, ready: readonly number[], variant?: number): number | undefined {
    if (ready.length === 0 || (variant !== undefined && !ready.includes(variant))) return undefined;
    const setting = this.options.avoidLast;
    const requested = typeof setting === "number" ? setting : (setting?.[id] ?? 1);
    const avoid = Math.min(ready.length - 1, Math.max(0, Number.isFinite(requested) ? Math.floor(requested) : 1));
    const history = this.history.get(id) ?? [];
    const excluded = new Set(history.filter(n => ready.includes(n)).slice(-avoid));
    const candidates = avoid === 0 ? ready : ready.filter(n => !excluded.has(n));
    const draw = variant !== undefined || candidates.length === 1 ? 0 : this.random();
    const index = Math.min(candidates.length - 1, Math.max(0, Math.floor((Number.isFinite(draw) ? draw : 0) * candidates.length)));
    const selected = variant ?? candidates[index]!;
    // Keep enough history for a larger ready set as decoding finishes.
    history.push(selected);
    const limit = Math.max(1, Number.isFinite(requested) ? Math.floor(requested) : 1);
    this.history.set(id, history.slice(-limit));
    return selected;
  }
}
