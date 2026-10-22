/**
 * Carry strip (Bộ Mang Theo, 03 §4.2): bottom-right item cells with icon,
 * price and number key; consumables with stacks and the shared cooldown;
 * Tim Rồng and Vảy Cứng in breaks. Sends buy commands through the sink.
 * Owner: ui (LANES.md). Stub: signatures fixed, body TODO.
 */
import type { ActionHandler, CommandSink, Presenter } from "../app/contracts";

export function createShopStrip(root: HTMLElement, sink: CommandSink): Presenter & ActionHandler {
  // TODO(ui)
  throw new Error("ui/shop-strip: not built yet (ui lane)");
}
