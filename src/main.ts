// Entry point (index.html loads this module): the game, or a dev page by URL.
//   ?view=terrain  the diorama and free camera only (view/stage.ts)
//   ?view=ui       the HUD, shop and placement over a mock world (ui/ui-preview.ts)
//   ?bench=crowd   the crowd bench, ?bench=fx the effects showcase (view/bench.ts),
//   ?bench=models  the M0b model studio (view/studio.ts, driven by dh-models.mjs)
import { startApp } from "./app/app";
// Static: app.ts imports view/stage.ts too, so a dynamic import could not split it (vite warned).
import { startTerrainPreview } from "./view/stage";

const params = new URLSearchParams(location.search);
const page = params.get("view");
const bench = params.get("bench");

if (page === "terrain") startTerrainPreview(document);
else if (page === "ui") void import("./ui/ui-preview").then((m) => m.startUiPreview(document));
else if (bench === "crowd" || bench === "fx" || bench === "models") {
  // dh-bench.mjs imports view/bench.ts itself and drives it; the page only stays empty.
} else startApp();
