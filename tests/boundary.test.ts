import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * Rồng Giữ Ải's boundary (05 §9.4). src/ imports only src/**, three,
 * three/examples/jsm/* and @fontsource/*; nothing from Space Typing. The rules
 * (src/sim, src/typing, src/content) are deterministic TypeScript: no three,
 * no DOM, no clock, no Math.random, no trig, pow, hypot or **, and they import
 * only each other and the pure kit modules. src/kit/** is copied from
 * shared/game-kit and checked by src/kit/verify-kit.mjs instead.
 */
const ROOT = resolve(__dirname, "..");
const SRC = join(ROOT, "src");
const KIT = join(SRC, "kit");
const PURE = ["src/sim", "src/typing", "src/content"];
// kit/balance is pure TS too (BALANCE.md §8): the sim runs its flow meter and pace director.
const PURE_KIT = ["src/kit/platform", "src/kit/typing", "src/kit/balance"];
const CODE = /\.(ts|tsx|mts|js|mjs)$/;

type Source = { path: string; abs: string; text: string };

function walk(dir: string): Source[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) return abs === KIT ? [] : walk(abs);
    return CODE.test(name) ? [{ path: relative(ROOT, abs).split(sep).join("/"), abs, text: readFileSync(abs, "utf8") }] : [];
  });
}

const sources = walk(SRC);
const isPure = (path: string) => PURE.some((dir) => path.startsWith(dir + "/"));

/** Module specifiers of static imports, re-exports, import types and dynamic imports. */
function specifiers(source: Source): string[] {
  return ts.preProcessFile(source.text, true, true).importedFiles.map((file) => file.fileName);
}

/** The repo-relative path a relative specifier points at (no extension resolution needed for prefix checks). */
const target = (source: Source, spec: string) => relative(ROOT, resolve(dirname(source.abs), spec)).split(sep).join("/");

const BARE_ALLOWED = [/^three$/, /^three\/examples\/jsm\//, /^@fontsource\//];

const BANNED_GLOBALS = new Set(["window", "document", "Date", "performance", "localStorage", "sessionStorage", "requestAnimationFrame", "setTimeout", "setInterval", "crypto", "navigator", "globalThis"]);
const BANNED_MATH = new Set(["random", "sin", "cos", "tan", "asin", "acos", "atan", "atan2", "sinh", "cosh", "tanh", "asinh", "acosh", "atanh", "exp", "expm1", "log", "log1p", "log2", "log10", "pow", "hypot", "cbrt"]);

/** Identifiers and operators the rules may not use; comments and strings never count. */
function purityProblems(source: Source): string[] {
  const file = ts.createSourceFile(source.path, source.text, ts.ScriptTarget.Latest, true);
  const problems: string[] = [];
  const at = (node: ts.Node) => source.path + ":" + (file.getLineAndCharacterOfPosition(node.getStart()).line + 1);
  const isNameSlot = (node: ts.Identifier) => {
    const parent = node.parent;
    if (ts.isPropertyAccessExpression(parent) && parent.name === node) return true;
    if ((ts.isPropertyAssignment(parent) || ts.isPropertySignature(parent) || ts.isPropertyDeclaration(parent) || ts.isMethodDeclaration(parent) || ts.isMethodSignature(parent)) && parent.name === node) return true;
    return ts.isQualifiedName(parent) && parent.right === node;
  };
  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node) && BANNED_GLOBALS.has(node.text) && !isNameSlot(node)) problems.push(at(node) + " uses " + node.text);
    if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "Math" && BANNED_MATH.has(node.name.text)) {
      problems.push(at(node) + " uses Math." + node.name.text);
    }
    if (ts.isBinaryExpression(node) && (node.operatorToken.kind === ts.SyntaxKind.AsteriskAsteriskToken || node.operatorToken.kind === ts.SyntaxKind.AsteriskAsteriskEqualsToken)) {
      problems.push(at(node) + " uses **");
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return problems;
}

describe("dragon-hold boundary", () => {
  it("finds the source tree", () => {
    expect(sources.length).toBeGreaterThan(20);
    expect(sources.some((source) => source.path === "src/sim/world.ts")).toBe(true);
  });

  it("imports only src/**, three, three/examples/jsm/* and @fontsource/*", () => {
    const bad: string[] = [];
    for (const source of sources) {
      for (const spec of specifiers(source)) {
        if (spec.startsWith(".")) {
          const to = target(source, spec);
          if (!to.startsWith("src/")) bad.push(source.path + " → " + spec);
        } else if (!BARE_ALLOWED.some((pattern) => pattern.test(spec))) bad.push(source.path + " → " + spec);
      }
    }
    expect(bad).toEqual([]);
  });

  it("never names Space Typing", () => {
    const bad = sources.filter((source) => specifiers(source).some((spec) => spec.includes("space-typing"))).map((source) => source.path);
    expect(bad).toEqual([]);
  });

  it("keeps the Node-only kit tools out of the game", () => {
    const bad = sources.filter((source) => specifiers(source).some((spec) => spec.startsWith(".") && target(source, spec).startsWith("src/kit/tools"))).map((source) => source.path);
    expect(bad).toEqual([]);
  });

  it("asks for assets only under /assets/dragon-hold/ (or Space's shared models in the dev sandbox)", () => {
    const bad: string[] = [];
    for (const source of sources) {
      for (const match of source.text.matchAll(/["'`](\/assets\/[^"'`]*)/g)) {
        const url = match[1]!;
        if (!url.startsWith("/assets/dragon-hold/") && !url.startsWith("/assets/space-typing/models/")) bad.push(source.path + " → " + url);
      }
    }
    expect(bad).toEqual([]);
  });

  it("keeps sim/, typing/ and content/ pure: imports", () => {
    const bad: string[] = [];
    for (const source of sources.filter((s) => isPure(s.path))) {
      for (const spec of specifiers(source)) {
        if (!spec.startsWith(".")) {
          bad.push(source.path + " → " + spec);
          continue;
        }
        const to = target(source, spec);
        if (!PURE.some((dir) => to.startsWith(dir + "/")) && !PURE_KIT.some((dir) => to === dir || to.startsWith(dir + "/"))) bad.push(source.path + " → " + spec);
      }
    }
    expect(bad).toEqual([]);
  });

  it("keeps sim/, typing/ and content/ pure: no DOM, clock, Math.random, trig, pow or **", () => {
    const bad = sources.filter((s) => isPure(s.path)).flatMap(purityProblems);
    expect(bad).toEqual([]);
  });

  it("catches what it should (self-test)", () => {
    const fake = (text: string): Source => ({ path: "src/sim/fake.ts", abs: join(SRC, "sim", "fake.ts"), text });
    expect(purityProblems(fake("const a = Math.random();"))).toHaveLength(1);
    expect(purityProblems(fake("const t = Date.now();"))).toHaveLength(1);
    expect(purityProblems(fake("const p = 2 ** 3;"))).toHaveLength(1);
    expect(purityProblems(fake("const s = Math.sin(1);"))).toHaveLength(1);
    expect(purityProblems(fake("// window, Date, Math.random() in a comment\nconst text = 'document';\nconst o = { window: 1 };"))).toEqual([]);
    expect(specifiers(fake('import { x } from "../../../space-typing/src/logic";'))).toEqual(["../../../space-typing/src/logic"]);
  });
});
