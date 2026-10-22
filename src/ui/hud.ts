/**
 * In-wave HUD (05 §4.2): top-left gold, wave n/N, chain; top-right system
 * buttons; bottom-left both Dragons (HP, shield, skill slots, rage and the two
 * ultimates). DOM, ≤ 10 % of the screen in a wave, buttons never take focus.
 * Owner: ui (LANES.md). Stub: signatures fixed, body TODO.
 */
import type { CommandSink, Presenter } from "../app/contracts";

export function createHud(root: HTMLElement, sink: CommandSink): Presenter {
  // TODO(ui)
  throw new Error("ui/hud: not built yet (ui lane)");
}
