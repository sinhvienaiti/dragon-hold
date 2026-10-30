/** Pure title transitions: no DOM, promises or clock. */
export type TitleSource = "words" | "models" | "ground" | "dragons";
export type TitleStatus = "loading" | "ready" | "blocked" | "started";
export type TitleDeckError = "load-failed" | "empty" | "too-small";
export interface TitleState {
  readonly status: TitleStatus;
  readonly completed: readonly TitleSource[];
  readonly reason?: TitleDeckError;
  readonly portal: boolean;
  readonly focus: number;
}
export function initialTitleState(portal: boolean): TitleState {
  return { status: "loading", completed: [], portal, focus: 0 };
}
export function settleTitle(state: TitleState, source: TitleSource, reason?: TitleDeckError): TitleState {
  if (state.status === "started" || state.completed.includes(source)) return state;
  const completed = [...state.completed, source];
  const blocked = state.reason ?? (source === "words" ? reason : undefined);
  return { ...state, completed, reason: blocked, status: blocked ? "blocked" : completed.length === 4 ? "ready" : "loading" };
}
/** Retry after a deck error: forget only the words result; the other sources stay settled. */
export function retryTitle(state: TitleState): TitleState {
  if (state.status !== "blocked") return state;
  return { status: "loading", completed: state.completed.filter(source => source !== "words"), portal: state.portal, focus: state.focus };
}
/** On a blocked title the first slot is Retry; titleAction itself never retries. */
export function wantsRetry(state: TitleState, action: string | null): boolean {
  return state.status === "blocked" && action === "enter" && state.focus === 0;
}
export function titleAction(state: TitleState, action: string | null): { state: TitleState; command: "start" | "portal" | null } {
  if (state.status === "started") return { state, command: null };
  const delta = action === "rotate-left" || action === "tilt-up" ? -1 : action === "rotate-right" || action === "tilt-down" ? 1 : 0;
  if (delta) return { state: { ...state, focus: (state.focus + delta + (state.portal ? 2 : 1)) % (state.portal ? 2 : 1) }, command: null };
  if (action === "enter") {
    if (state.focus === 1 && state.portal) return { state, command: "portal" };
    if (state.status === "ready") return { state: { ...state, status: "started" }, command: "start" };
  }
  return { state, command: null };
}
