/**
 * Placement mode (00 §6, 03 §4.2): number key picks an item and lights the
 * suggested slot; arrows move between slots; Enter places; Esc cancels;
 * Backquote edit mode with `=` upgrade and `-` sell (press twice). Ghost and
 * range ring through the view's paths.showSlots; letters still type foes.
 * Owner: ui (LANES.md). Stub: signatures fixed, body TODO.
 */
import type { ActionHandler, CommandSink, Presenter, Projector } from "../app/contracts";

export function createPlacementUi(root: HTMLElement, project: Projector, sink: CommandSink): Presenter & ActionHandler {
  // TODO(ui)
  throw new Error("ui/placement-ui: not built yet (ui lane)");
}
