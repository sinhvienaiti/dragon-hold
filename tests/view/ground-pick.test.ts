// DH-12: the build loads ground tiles and decals from public/assets through the
// manifests prepare-ground / prepare-decals write from ground-pick.json, never /art-src.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import pick from "../../src/view/ground-pick.json";
import { GROUND_KEYS } from "../../src/view/paint";

describe("ground paint textures", () => {
  it("loads exactly the keys the pick list prepares", () => {
    expect([...GROUND_KEYS.ground].sort()).toEqual(Object.keys(pick.ground).sort());
    expect([...GROUND_KEYS.decals].sort()).toEqual(Object.keys(pick.decals).sort());
  });

  it("never reads /art-src at runtime", () => {
    const source = readFileSync(new URL("../../src/view/paint.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/["'`]\/art-src\//);
    expect(source).not.toMatch(/import\.meta\.env\.DEV/);
  });
});
