/**
 * The carved-wood UI skin (DESIGN.md §1, 05 §4): Cormorant Garamond titles,
 * Be Vietnam Pro battle text, kit/ui semantic colours and --ui scale, and
 * src/ui/styles/dh.css. Installs once at boot.
 * Owner: ui (LANES.md). Stub: body TODO.
 */
import "./styles/dh.css";

/** Installs fonts, kit tokens and the game stylesheet on `doc`. */
export function installSkin(doc: Document): void {
  // TODO(ui): @fontsource imports, kit/ui installKitStyles, applyUiScale on resize.
  doc.documentElement.classList.add("dh-skin");
}
