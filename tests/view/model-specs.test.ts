// M0b: which model every content key reads, the m0b preset, family wash, props and the pearl Bạch Long.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ENEMIES } from "../../src/content/data/enemies";
import { GENERALS } from "../../src/content/data/generals";
import { CONSUMABLES, HOUSES, TRAPS, UNITS } from "../../src/content/data/our-side";
import { MODEL_CONTRACTS } from "../../src/kit/three/model-contracts";
import { BRIDGE_MODEL, MODEL_SPECS, NO_MODEL, PROP_SPECS, modelLayerKey } from "../../src/view/model-specs";
import { GUIDE_GLOW_GLSL, GUIDE_PEARL_GLSL } from "../../src/view/heroes";

const preset = JSON.parse(readFileSync(join(__dirname, "../../scripts/models/presets/dragon-hold-m0b.json"), "utf8")) as { kinds: string[]; models: Record<string, { source: string; static?: unknown }> };

describe("M0b model specs", () => {
  it("has a model for every foe, general, trap, house and unit of M0 (consumables have none)", () => {
    const keys = [
      ...Object.values(ENEMIES).map((def) => def.show.model),
      ...Object.values(GENERALS).map((def) => def.show.model),
      ...Object.values(TRAPS).map((def) => def.show.model),
      ...Object.values(HOUSES).map((def) => def.show.model),
      ...Object.values(UNITS).map((def) => def.show.model),
    ];
    for (const key of keys) expect(MODEL_SPECS[key], key).toBeDefined();
    for (const def of Object.values(CONSUMABLES)) expect(NO_MODEL).toContain(def.show.model);
    for (const [key, spec] of Object.entries(MODEL_SPECS)) expect(spec.content).toBe(key);
  });

  it("reads kit kinds only (generals as enemies, houses and traps as props) and every one is in the m0b preset", () => {
    const manifests = [...Object.values(MODEL_SPECS).map((spec) => spec.manifest), ...PROP_SPECS.map((prop) => prop.manifest), BRIDGE_MODEL.manifest];
    for (const key of manifests) {
      const kind = key.slice(0, key.indexOf("/"));
      expect(Object.keys(MODEL_CONTRACTS), key).toContain(kind);
      expect(preset.kinds, key).toContain(kind);
      expect(preset.models[key], key).toBeDefined();
    }
    // 24 owner sources, each read once.
    const sources = Object.values(preset.models).map((entry) => entry.source);
    expect(new Set(sources).size).toBe(24);
    expect(Object.keys(preset.models).sort()).toEqual([...new Set(manifests)].sort());
  });

  it("washes foes toward their family (luminance kept) but never our side, whose layers draw before the foe ghosts", () => {
    for (const spec of Object.values(MODEL_SPECS)) {
      if (spec.ours) {
        expect(spec.wash, spec.content).toBe(0);
        expect(modelLayerKey(spec).startsWith("our-"), spec.content).toBe(true);
      } else {
        expect(spec.wash, spec.content).toBeGreaterThanOrEqual(0.2);
        expect(spec.wash, spec.content).toBeLessThanOrEqual(0.4);
        expect(modelLayerKey(spec).startsWith("our-"), spec.content).toBe(false);
      }
    }
  });

  it("logs every provisional model (score 7–8.5) and keeps nothing under 7 (ART_ACCEPTANCE §2.1)", () => {
    for (const spec of [...Object.values(MODEL_SPECS), ...PROP_SPECS]) {
      expect(spec.score).toBeGreaterThanOrEqual(7);
      expect(spec.provisional).toBe(spec.score < 9);
    }
  });

  it("splits each scatter kind between its props by shares that add up to 1", () => {
    for (const kind of ["pine", "crown", "bush", "rock"] as const) {
      const total = PROP_SPECS.filter((prop) => prop.kind === kind).reduce((sum, prop) => sum + prop.share, 0);
      expect(total, kind).toBeCloseTo(1, 5);
    }
    // The violet crown only far from the paths (05 §2.2).
    expect(PROP_SPECS.find((prop) => prop.manifest.endsWith("tree-violet"))!.laneGapMin).toBeGreaterThan(0);
  });

  it("recolours Bạch Long pearl and moon white with a cream rim, never the typing cyan (05 §2.2)", () => {
    expect(GUIDE_PEARL_GLSL).toContain("dhPearl");
    expect(GUIDE_GLOW_GLSL).toContain("vec3(1.0, 0.95, 0.82)");
    const colours = [...(GUIDE_PEARL_GLSL + GUIDE_GLOW_GLSL).matchAll(/vec3\(([\d.]+), ([\d.]+), ([\d.]+)\)/g)]
      .map((m) => [Number(m[1]), Number(m[2]), Number(m[3])])
      // The luminance weights are not a colour.
      .filter((c) => c[1] !== 0.7152);
    expect(colours.length).toBeGreaterThanOrEqual(4);
    const cyan = [0x7f / 255, 0xf5 / 255, 0xe0 / 255];
    for (const c of colours) {
      // Cyan is green and blue well above red; every recolour stays near grey or warm.
      const greenOverRed = c[1]! - c[0]!;
      expect(greenOverRed, c.join(",")).toBeLessThan(0.15);
      expect(Math.hypot(c[0]! - cyan[0]!, c[1]! - cyan[1]!, c[2]! - cyan[2]!)).toBeGreaterThan(0.25);
    }
  });
});
