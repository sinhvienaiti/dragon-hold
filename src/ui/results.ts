/**
 * End of the run (01 §5): victory with stars or defeat, words met (Sổ Từ Ải
 * basics), accuracy, retry. Keyboard: arrows, Enter, Esc.
 * Owner: ui (LANES.md). Stub: signatures fixed, body TODO.
 */
import type { Presenter } from "../app/contracts";

export interface ResultsActions {
  retry(): void;
}

export function createResults(root: HTMLElement, actions: ResultsActions): Presenter {
  // TODO(ui)
  throw new Error("ui/results: not built yet (ui lane)");
}
