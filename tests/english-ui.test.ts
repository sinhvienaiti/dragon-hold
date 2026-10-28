import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { NUMBER_FEEL } from "../src/view/fx";

const ROOT = resolve(__dirname, "..");
// Vietnamese letters only: the requested broad range also contains × and IPA.
const VIETNAMESE = /[À-ÃÈ-ÊÌ-ÍÒ-ÕÙ-ÚÝà-ãè-êì-íò-õù-úýĂăĐđĨĩŨũƠơƯưẠ-ỹ]/;
// No whole-file vocabulary exemptions: only vi fields and this meaning fixture.
const VOCABULARY_FILES = new Set(["src/ui/ui-preview.ts"]);
const PREVIEW_MEANING = '">khu rừng</div>';
// Dev-only, not in the production build: Vite builds index.html alone, and no
// game file links or imports these pages (checked below).
const DEV_ONLY = ["src/audio/dev/harness.html", "src/audio/dev/harness.ts"];

function vocabularyMeaning(file: string, node: ts.StringLiteral | ts.TemplateLiteralToken): boolean {
  if (!VOCABULARY_FILES.has(file)) return false;
  const parent = node.parent;
  if (ts.isPropertyAssignment(parent) && parent.initializer === node && parent.name.getText() === "vi") return true;
  return node.kind === ts.SyntaxKind.TemplateTail && node.text === PREVIEW_MEANING;
}

function violations(file: string, text: string): string[] {
  const ast = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith(".json") ? ts.ScriptKind.JSON : ts.ScriptKind.TS);
  const bad: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isStringLiteral(node) || ts.isTemplateLiteralToken(node)) {
      let value = node.text;
      // Embedded CSS/GLSL comments do not render as player text.
      if (value.includes("\n") && /(?:\.[\w-]+\s*\{|uniform |#include )/.test(value)) {
        value = value.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");
      }
      const authoringBrief = file === "src/view/maps/L2-cau.map.json" && ts.isPropertyAssignment(node.parent) && node.parent.name.getText(ast) === '"brief"';
      if (VIETNAMESE.test(value.normalize("NFC")) && !vocabularyMeaning(file, node) && !authoringBrief) {
        bad.push(file + ":" + (ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1) + " " + JSON.stringify(value));
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  return bad;
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) return abs === join(ROOT, "src/kit") ? [] : sourceFiles(abs);
    return /\.(?:[cm]?[jt]sx?|json|css|html)$/.test(entry.name) ? [abs] : [];
  });
}

describe("English player text", () => {
  it("keeps Vietnamese literals only in vocabulary meanings outside the copied kit", () => {
    const bad = sourceFiles(join(ROOT, "src")).flatMap((abs) => {
      const file = relative(ROOT, abs);
      if (DEV_ONLY.includes(file)) return [];
      const text = readFileSync(abs, "utf8");
      if (file.endsWith(".css")) {
        return [...text.matchAll(/content\s*:\s*(["'])(.*?)\1/g)].filter((match) => VIETNAMESE.test(match[2]!)).map(() => file + ": CSS content");
      }
      if (file.endsWith(".html")) {
        return VIETNAMESE.test(text.replace(/<!--[\s\S]*?-->/g, "")) ? [file + ": HTML text"] : [];
      }
      return violations(file, text);
    });
    expect(bad).toEqual([]);
  });

  it("keeps the dev-only pages out of the game: not built, linked or imported", () => {
    const config = readFileSync(join(ROOT, "vite.config.ts"), "utf8");
    expect(config).not.toMatch(/audio\/dev|harness/);
    const game = [join(ROOT, "index.html"), ...sourceFiles(join(ROOT, "src"))].filter((abs) => !relative(ROOT, abs).startsWith("src/audio/dev/"));
    for (const abs of game) expect(readFileSync(abs, "utf8"), relative(ROOT, abs)).not.toMatch(/audio\/dev\/|harness\.(?:html|ts)/);
    for (const file of DEV_ONLY) expect(readFileSync(join(ROOT, file), "utf8").length).toBeGreaterThan(0);
  });

  it("detects strings, templates, nested expressions and Unicode escapes", () => {
    expect(violations("src/ui/probe.ts", 'const a = "Bắt đầu"; const b = `Đợt ${"Mới"}`; const c = "B\\u1eaft đầu";')).toHaveLength(4);
  });

  it("ignores source comments, embedded comments, multiplication and IPA", () => {
    expect(violations("src/ui/probe.ts", '// Bắt đầu\nconst a = "×"; const b = "/ˈfɔːrɪst/"; const css = `\n.box { color: red; } /* Thẻ Ôn */`;')).toEqual([]);
  });

  it("allows vi fixtures without exempting other labels in their file", () => {
    expect(violations("src/ui/ui-preview.ts", 'const word = { vi: "cây cầu", title: "Bắt đầu" };')).toHaveLength(1);
    expect(violations("src/ui/probe.ts", 'const word = { vi: "cây cầu" };')).toHaveLength(1);
  });

  it("labels Perfect hits in English (the kit profile says HOÀN HẢO)", () => {
    expect(NUMBER_FEEL.numbers.label).toBe("PERFECT");
  });

  it("names Dragonhold and declares English in the entry page", () => {
    const html = readFileSync(join(ROOT, "index.html"), "utf8");
    expect(html).toContain('<html lang="en">');
    expect(html).toContain("<title>Dragonhold</title>");
    expect(VIETNAMESE.test(html.replace(/<!--[\s\S]*?-->/g, ""))).toBe(false);
  });
});
