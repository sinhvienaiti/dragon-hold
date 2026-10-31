import { expect, it } from "vitest";
import { allowedQualities, normalizeQuality } from "../../src/app/quality";
import { optionsFromUrl } from "../../src/app/app";
it("allows Low only in development, including URL and explicit quality", () => {
  expect(allowedQualities(true)).toEqual(["medium", "high", "ultra"]);
  expect(allowedQualities(false)).toEqual(["low", "medium", "high", "ultra"]);
  expect(normalizeQuality("low", true)).toBe("medium");
  expect(normalizeQuality("strange", true)).toBeUndefined();
  expect(optionsFromUrl("?q=low", false).quality).toBe("medium");
  expect(optionsFromUrl("?q=low", true).quality).toBe("low");
  expect(optionsFromUrl("?q=strange", false).quality).toBeUndefined();
});
