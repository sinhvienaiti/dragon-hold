import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { build } from "vite";
import { afterEach, describe, expect, it, vi } from "vitest";

const root = resolve(__dirname, "..");
afterEach(() => vi.unstubAllEnvs());

describe("portal build configuration", () => {
  it.each([
    [undefined, ""],
    ["https://portal.example/learn/?game=dragon-hold", "https://portal.example"],
    ["https://typing-game.local/", "https://typing-game.local"],
  ])("compiles the kit fallback from VITE_PORTAL_URL=%j without changing kit files", async (url, origin) => {
    vi.stubEnv("VITE_PORTAL_URL", url);
    mkdirSync(join(root, "tmp"), { recursive: true });
    const fixture = mkdtempSync(join(root, "tmp/portal-build-"));
    const contract = join(root, "src/kit/learning/contract.ts");
    const original = readFileSync(contract, "utf8");
    try {
      const entry = join(fixture, "probe.ts");
      writeFileSync(entry, 'export { createLearningBridge } from "../../src/kit/learning";');
      const result = await build({
        configFile: join(root, "vite.config.ts"),
        logLevel: "silent",
        build: {
          write: false,
          minify: false,
          rollupOptions: {
            input: entry,
            preserveEntrySignatures: "strict",
            output: { manualChunks: () => undefined },
          },
        },
      });
      if (!("output" in result)) throw new Error("Expected a single Rollup build");
      const chunks = result.output.filter((item) => item.type === "chunk");
      expect(chunks).toHaveLength(1);
      const code = chunks[0]!.code;
      if (!url) expect(code).not.toContain("typing-game.local");
      // Execute the emitted JavaScript in Node, without a server or browser.
      const executed = spawnSync(process.execPath, ["--input-type=module", "--eval", `
        import { readFileSync } from "node:fs";
        const code = readFileSync(0);
        const bundled = await import("data:text/javascript;base64," + code.toString("base64"));
        const bridge = bundled.createLearningBridge({ gameId: "dragon-hold" });
        console.log(JSON.stringify(bridge.parentOrigin));
        bridge.dispose();
      `], { input: code, encoding: "utf8", timeout: 5000 });
      expect(executed.error).toBeUndefined();
      expect(executed.stderr).toBe("");
      expect(executed.status).toBe(0);
      expect(JSON.parse(executed.stdout)).toBe(origin);
      expect(readFileSync(contract, "utf8")).toBe(original);
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });
});
