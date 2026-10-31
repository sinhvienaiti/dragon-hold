// Source: new for the kit: Tab order inside an open quick panel (judges 31/10: Tab left Settings on the title)
/**
 * a11y-dialog 8.1.5 ends its trap at the last radio in DOM order, but Tab
 * leaves a radio group from the checked radio, so when the last row is a
 * choice whose checked chip is not its last one, Tab walked out of the panel
 * and stayed on <body>. QuickSettings handles Tab itself while a panel is
 * open: the stops below, round in both directions.
 */

const TABBABLE = "button,input,select,textarea,a[href],[tabindex]";

const shown = (el: HTMLElement, box: HTMLElement): boolean =>
  el.closest("[hidden],[inert]") === null && (typeof el.checkVisibility !== "function" || !box.checkVisibility() || el.checkVisibility());

/**
 * What Tab visits in `box`, in order: enabled, shown controls with tabIndex
 * ≥ 0; of each radio group only its checked radio (else its first enabled one).
 */
export function tabStops(box: HTMLElement): HTMLElement[] {
  const stops: HTMLElement[] = [];
  const groups = new Set<string>();
  for (const el of box.querySelectorAll<HTMLElement>(TABBABLE)) {
    if (el.tabIndex < 0 || (el as HTMLButtonElement).disabled || !shown(el, box)) continue;
    const radio = el as HTMLInputElement;
    if (el.tagName !== "INPUT" || radio.type !== "radio" || radio.name === "") {
      stops.push(el);
      continue;
    }
    if (groups.has(radio.name)) continue;
    groups.add(radio.name);
    const group = [...box.querySelectorAll<HTMLInputElement>('input[type="radio"]')].filter((r) => r.name === radio.name && !r.disabled && shown(r, box));
    stops.push(group.find((r) => r.checked) ?? group[0]!);
  }
  return stops;
}

/**
 * The stop Tab (or Shift+Tab, `back`) moves to from `active`: the next one,
 * round. From outside the stops (the dialog itself, <body>), the first (last);
 * from a control inside `box` that is not a stop, the nearest one past it.
 */
export function nextStop(stops: readonly HTMLElement[], active: Element | null, box: HTMLElement, back: boolean): HTMLElement | null {
  const n = stops.length;
  if (n === 0) return null;
  const at = stops.indexOf(active as HTMLElement);
  if (at >= 0) return stops[(at + (back ? n - 1 : 1)) % n]!;
  if (active !== null && active !== box && box.contains(active)) {
    // 4: the stop follows `active`; 2: it comes before.
    const near = (back ? [...stops].reverse() : stops).find((s) => (active.compareDocumentPosition(s) & (back ? 2 : 4)) !== 0);
    if (near !== undefined) return near;
  }
  return back ? stops[n - 1]! : stops[0]!;
}
