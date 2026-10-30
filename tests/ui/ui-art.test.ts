import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import art from "../../src/ui/ui-art.json";
import { foeIcon, handleArtError, icon, installSkin } from "../../src/ui/skin";
import { learningWordMarkup, reviewMeaningMarkup, speakerMarkup } from "../../src/ui/learning-frame";
import { SKILL_SLOTS, ULT_SLOT } from "../../src/ui/hud";
import { CONSUMABLES, HERO_UPGRADES, HOUSES, TRAPS, UNITS } from "../../src/content/data/our-side";

const ROOT = resolve(__dirname, "../..");
const accepted: Record<string, string[]> = {
  "137": "wave-horn chain dragon-rage shield phase-prep phase-fight phase-break fast-forward".split(" "),
  "138": "pause camera-reset keyboard speaker check new-word deny lock upgrade sell".split(" "),
  "139": "lane-bridge lane-stream lane-sky slot-trap slot-house slot-hold seal-lit seal-unlit edge-arrow".split(" "),
  "140": "star-lit star-unlit stat-accuracy stat-new-words stat-words-seen retry status-learned status-review status-new".split(" "),
};
// Armour waits for 161; both dragon portraits wait for UIC-DH-6.
const STILL_SVG = ["armour", "dragon", "white-dragon"];
const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)]);
const names = () => art.icons.flatMap((entry) => [entry.name, ...entry.keys]);

describe("UI art selection and runtime", () => {
  it("selects exactly the accepted 36 and interim 17 with unique names/aliases", () => {
    expect(art.version).toBe(1);
    expect(art.icons).toHaveLength(53);
    expect(art.icons.filter((entry) => entry.interim)).toHaveLength(17);
    for (const [ticket, expected] of Object.entries(accepted)) {
      expect(art.icons.filter((entry) => entry.accepted === ticket).map((entry) => entry.name).sort()).toEqual(expected.sort());
    }
    expect(new Set(names()).size).toBe(names().length);
    for (const entry of art.icons) {
      expect(entry.sizes).toEqual([64, 128, 256]);
      expect(entry.interim).toBe(entry.accepted === null);
      expect(entry.source).not.toMatch(/\.(?:v[23]|try\w*|alpha|final|warm)|rejected-/);
      expect(entry.alt).toMatch(/[A-Za-z]/);
    }
    expect(art.icons.find((e) => e.name === "skill-roar")?.source).toBe("icons/normalized/015-skill-roar");
  });

  it("renders every name/alias as an accessible decorative image", () => {
    for (const entry of art.icons) for (const name of [entry.name, ...entry.keys]) {
      const html = icon(name);
      expect(html).toContain(`<img class="dh-art" src="/assets/dragon-hold/ui/icons/${entry.name}.64.webp?v=${art.version}"`);
      for (const attr of ['width="20"', 'height="20"', 'alt=""', 'aria-hidden="true"', 'decoding="async"', 'draggable="false"']) expect(html).toContain(attr);
      expect(html).not.toMatch(/<svg|\p{Extended_Pictographic}/u);
      const labelled = icon(name, { label: true });
      expect(labelled).toContain(`alt="${entry.alt}"`);
      expect(labelled).not.toContain("aria-hidden");
    }
    expect(icon("unknown")).toBe("");
    for (const name of STILL_SVG) expect(icon(name)).toContain("<svg");
  });

  it.each([[20, 64], [46, 128], [120, 256]])("chooses a density-safe source for box %i", (box, size) => {
    expect(icon("check", { box })).toContain(`check.${size}.webp`);
    expect(icon("check", { box })).toContain(`width="${box}" height="${box}"`);
  });

  it("covers literal callers and all data-driven skill, slot, item and family callers", () => {
    const used = new Set<string>([...SKILL_SLOTS.map((s) => s.icon), ULT_SLOT.icon]);
    for (const group of [TRAPS, HOUSES, UNITS, CONSUMABLES, HERO_UPGRADES]) for (const item of Object.values(group)) used.add(item.id);
    for (const file of files(join(ROOT, "src/ui")).filter((p) => p.endsWith(".ts"))) {
      const ast = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
      const visit = (node: ts.Node): void => {
        if (ts.isCallExpression(node) && node.expression.getText(ast) === "icon" && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) used.add(node.arguments[0].text);
        if (ts.isVariableDeclaration(node) && node.name.getText(ast) === "kindIcon" && node.initializer && ts.isObjectLiteralExpression(node.initializer)) {
          for (const prop of node.initializer.properties) if (ts.isPropertyAssignment(prop) && ts.isStringLiteral(prop.initializer)) used.add(prop.initializer.text);
        }
        ts.forEachChild(node, visit);
      };
      visit(ast);
    }
    for (const name of used) expect([...names(), ...STILL_SVG], name).toContain(name);
    for (const family of ["moss", "beast", "bug"] as const) expect(foeIcon(family)).toContain(`family-${family}.64.webp`);
    expect(readFileSync(join(ROOT, "src/ui/wave-card.ts"), "utf8")).toContain("foeIcon(tally.family)");
    expect(readFileSync(join(ROOT, "src/ui/debut-card.ts"), "utf8")).toContain("foeIcon(def.family,");
  });

  it("warns once per missing URL, hides every failed image, ignores other targets", () => {
    const warned = new Set<string>();
    const warn = vi.fn();
    const img = (src: string) => ({ tagName: "IMG", classList: { contains: (name: string) => name === "dh-art" }, currentSrc: src, src, hidden: false });
    const a = img("/check.webp"); const b = img("/check.webp"); const c = img("/speaker.webp");
    for (const target of [a, b, c, null, { tagName: "DIV" }]) handleArtError({ target }, warned, warn);
    expect(warn.mock.calls).toEqual([["[ui-art] missing image: /check.webp"], ["[ui-art] missing image: /speaker.webp"]]);
    expect([a.hidden, b.hidden, c.hidden]).toEqual([true, true, true]);
  });

  it("installs one capture listener even without a window", () => {
    const addEventListener = vi.fn();
    const doc = { documentElement: { classList: { add: vi.fn() }, dataset: {} }, defaultView: null, addEventListener, getElementById: () => ({}) };
    installSkin(doc as unknown as Document);
    installSkin(doc as unknown as Document);
    expect(addEventListener.mock.calls.filter(([type]) => type === "error")).toHaveLength(1);
    expect(addEventListener.mock.calls[0]?.[2]).toBe(true);
  });

  it("renders learning completion, NEW and review listening with real art", () => {
    const word = learningWordMarkup({ text: "cat", typed: 3, done: true, level: "new" });
    expect(word).toContain("check.64.webp");
    expect(word).toContain("new-word.64.webp");
    expect(word).toContain('width="18"');
    expect(word).toMatch(/new-word\.64\.webp[^>]*width="20" height="20"/);
    expect(learningWordMarkup({ text: "<", typed: 0, done: false, level: "known" })).toContain("&lt;");
    expect(reviewMeaningMarkup("listen", "")).toContain('speaker.64.webp');
    expect(reviewMeaningMarkup("listen", "")).toContain('width="22"');
    expect(reviewMeaningMarkup("meaning", "<&")).toBe("&lt;&amp;");
    expect(speakerMarkup()).toContain('width="18"');
    expect(word + speakerMarkup() + reviewMeaningMarkup("listen", "")).not.toMatch(/[\u2713\u2714\uFE0F]|\p{Extended_Pictographic}/u);
  });

  it("removes panel moss and star recolouring while retaining moss tokens", () => {
    const css = readFileSync(join(ROOT, "src/ui/styles/dh.css"), "utf8");
    expect(css).not.toMatch(/\.dh-panel::(?:before|after)|\.dh-star[^{}]*svg/);
    expect(css).toContain("--dh-moss:");
    expect(css).toContain(".dh-icon > img");
    expect(css).toContain(".dh-btn img");
  });
});

describe("UI imagery characters", () => {
  it("has no pictographs, variation selectors or checkmark characters in UI strings/templates or CSS content", () => {
    const bad: string[] = [];
    const banned = /\p{Extended_Pictographic}|[\uFE0F\u2713\u2714]/u;
    for (const file of files(join(ROOT, "src/ui"))) {
      const text = readFileSync(file, "utf8");
      if (file.endsWith(".ts")) {
        const ast = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
        const visit = (node: ts.Node): void => {
          if ((ts.isStringLiteral(node) || ts.isTemplateLiteralToken(node)) && banned.test(node.text)) bad.push(relative(ROOT, file) + ":" + (ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1));
          ts.forEachChild(node, visit);
        };
        visit(ast);
      } else if (file.endsWith(".css")) for (const match of text.matchAll(/content\s*:\s*(["'])(.*?)\1/g)) if (banned.test(match[2]!)) bad.push(relative(ROOT, file));
    }
    expect(bad).toEqual([]);
  });
});
