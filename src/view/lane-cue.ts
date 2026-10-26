/**
 * Lit lanes of the wave warning (wave-card.ts: "Quái sắp vào từ các đường
 * sáng"; 01 §1.2: "Thẻ báo: đường nào sáng"). Each frame the lanes the coming wave uses go to
 * paths.cueLanes: in prep, warning and break the next wave's, in a wave this
 * one's. The dirt lanes light only in the 6 s warning; a sky lane's chevrons
 * run while the wave uses it, and stay still under "Đường Trời: Yên".
 * Until 26/10 the card promised lit lanes and none lit (review). View only.
 * Owner: view-terrain (LANES.md).
 */
import type { FrameInfo, Presenter } from "../app/contracts";
import type { SimEvent } from "../content/types";
import type { World } from "../sim/world";
import type { PathsView } from "./paths";

/** Lane ids wave `n` (1-based) sends foes along, in the stage's lane order. */
export function waveLanes(world: Pick<World, "stage">, n: number): string[] {
  const wave = world.stage.waves[n - 1];
  if (!wave) return [];
  const used = new Set<string>();
  for (const group of wave.groups) if (group.count > 0 || (group.escort?.count ?? 0) > 0) used.add(group.lane);
  return world.stage.lanes.filter((id) => used.has(id));
}

/** Which lanes to cue now, and whether the warning lights them; empty once the stage is over. */
export function laneCue(world: Pick<World, "stage" | "phase" | "wave">): { ids: string[]; warning: boolean } {
  if (world.phase === "victory" || world.phase === "defeat") return { ids: [], warning: false };
  const coming = world.phase === "prep" || world.phase === "warning" || world.phase === "break";
  const n = coming ? Math.min(world.wave + 1, world.stage.waves.length) : world.wave;
  return { ids: waveLanes(world, n), warning: world.phase === "warning" };
}

export function createLaneCue(paths: Pick<PathsView, "cueLanes">): Presenter {
  let key = "";
  return {
    onEvents(events: readonly SimEvent[], world: World): void {
      void events;
      void world;
    },
    frame(world: World, info: FrameInfo): void {
      void info;
      const cue = laneCue(world);
      const next = cue.ids.join(",") + (cue.warning ? "|warning" : "");
      if (next === key) return;
      key = next;
      paths.cueLanes(cue.ids, cue.warning);
    },
    dispose(): void {
      // The map outlives runs: the next run's cue sends its lanes on its first frame.
    },
  };
}
