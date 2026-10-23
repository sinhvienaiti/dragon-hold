// Entry point (index.html loads this module): the game, or a dev page by URL.
//   ?view=terrain  the diorama and free camera only (view/stage.ts)
//   ?view=ui       the HUD, shop and placement over a mock world (ui/ui-preview.ts)
//   ?bench=crowd   the crowd bench, ?bench=fx the effects showcase (view/bench.ts)
import { startApp } from "./app/app";

const params = new URLSearchParams(location.search);
const page = params.get("view");
const bench = params.get("bench");

if (page === "terrain") void import("./view/stage").then((m) => m.startTerrainPreview(document));
else if (page === "ui") void import("./ui/ui-preview").then((m) => m.startUiPreview(document));
else if (bench === "crowd" || bench === "fx") {
  // dh-bench.mjs imports view/bench.ts itself and drives it; the page only stays empty.
} else startApp();
