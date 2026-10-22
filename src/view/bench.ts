/**
 * Crowd bench, the first M0 task (DESIGN.md §9): 220 foes of all three gaits
 * walking to the dais, frame time measured (High on Mac: mean ≤ 8 ms, p95 ≤
 * 12 ms; Low ≤ 16 ms). Opened by `/?bench=crowd`; the dh-bench CDP scenario
 * reads window.__dhBench. Source to adapt: Space scripts/visual/scenarios/defense-bench.mjs.
 * Owner: view-crowd-fx (LANES.md). Stub: signatures fixed, body TODO.
 */
import type { Quality } from "../app/contracts";

export interface BenchOptions {
  readonly count: number;
  readonly quality: Quality;
  readonly seconds: number;
}

export interface BenchResult {
  readonly frames: number;
  readonly meanMs: number;
  readonly p95Ms: number;
  readonly drawCalls: number;
  readonly triangles: number;
}

declare global {
  interface Window {
    /** Set by the crowd bench when it finishes. */
    __dhBench?: BenchResult;
  }
}

export async function runCrowdBench(host: HTMLElement, options: BenchOptions): Promise<BenchResult> {
  // TODO(view-crowd-fx)
  throw new Error("view/bench: not built yet (view-crowd-fx lane)");
}
