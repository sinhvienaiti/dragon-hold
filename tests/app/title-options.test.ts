import { expect, it } from "vitest";
import { optionsFromUrl } from "../../src/app/app";
it("bypasses the title only for ?title=0, in production and development", () => {
  for (const dev of [false, true]) {
    expect(optionsFromUrl("?title=0&wpm=35", dev).title).toBe(false);
    for (const query of ["", "?title=1", "?title=false"]) expect(optionsFromUrl(query, dev).title).toBe(true);
  }
});
