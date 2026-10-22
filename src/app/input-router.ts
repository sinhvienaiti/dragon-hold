/**
 * One key router on window, capture phase (05 §4.1, 00 §6): a–z become key
 * commands (IME composing, repeats, Ctrl or Cmd ignored, kit/input rules),
 * command keys map through rules.ts KEYS by event.code to actions that
 * presenters may claim (camera, placement) before they become SimCommands.
 * Owner: integrator (LANES.md). Stub: signatures fixed, body TODO.
 */
import type { ActionHandler, CommandSink } from "./contracts";

export interface InputRouter {
  /** Handlers asked in order before the sim gets an action. */
  readonly handlers: ActionHandler[];
  dispose(): void;
}

export function createInputRouter(target: Window, sink: CommandSink): InputRouter {
  // TODO(integrator)
  throw new Error("app/input-router: not built yet (integrator)");
}
