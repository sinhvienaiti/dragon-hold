/**
 * App boot. M0a skeleton: shows a "being built" notice; the integrator wires
 * stage, world, loop, input router and presenters here once the lanes land.
 * Owner: integrator (LANES.md).
 */
import { STAGE_M0 } from "../content/data/stages";
import { installSkin } from "../ui/skin";

export interface App {
  dispose(): void;
}

export function startApp(doc: Document = document): App {
  installSkin(doc);
  const overlay = doc.getElementById("dh-overlay");
  if (!overlay) throw new Error("app: #dh-overlay missing from index.html");
  const notice = doc.createElement("div");
  notice.className = "dh-boot";
  notice.textContent = "Rồng Giữ Ải đang dựng · " + STAGE_M0.nameVi;
  overlay.append(notice);
  // TODO(integrator): createStage, createWorld(STAGE_M0), createLoop, createInputRouter, presenters.
  return { dispose: () => notice.remove() };
}
