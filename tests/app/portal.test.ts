import { describe, expect, it } from "vitest";
import { portalHome } from "../../src/app/portal";

describe("portalHome", () => {
  it.each([undefined, "", " ,  , "])("uses the local portal for %j", (origins) => {
    expect(portalHome(origins)).toBe("https://typing-game.local/");
  });

  it("uses the first trimmed origin", () => {
    expect(portalHome(" https://a.example , https://b.example")).toBe("https://a.example/");
  });

  it("skips empty origins", () => {
    expect(portalHome(" , , https://b.example , https://c.example ")).toBe("https://b.example/");
  });
});
