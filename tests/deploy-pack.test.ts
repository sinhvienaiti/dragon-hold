import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "..");
const scripts = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).scripts as Record<string, string>;
const checker = "src/kit/tools/deploy/check-pack.mjs";
const command = `pnpm build && node ${checker} dist --game dragon-hold`;
const modes = ["deploy:pack", "deploy:pack:local"] as const;

function run(mode: typeof modes[number], text: string, failBuild = false) {
  expect(scripts[mode]).toBe(command + (mode.endsWith(":local") ? " --allow-local-host" : ""));
  mkdirSync(join(root, "tmp"), { recursive: true });
  const fixture = mkdtempSync(join(root, "tmp/deploy-pack-"));
  try {
    mkdirSync(join(fixture, "src/kit/tools/deploy"), { recursive: true });
    copyFileSync(join(root, checker), join(fixture, checker));
    writeFileSync(join(fixture, "package.json"), JSON.stringify({
      private: true,
      type: "module",
      scripts: { build: "node build.mjs", [mode]: scripts[mode] },
    }));
    // A stale foreign URL must disappear before the checker reads dist.
    mkdirSync(join(fixture, "dist"));
    writeFileSync(join(fixture, "dist/stale.js"), 'fetch("/assets/typing-defense/stale.glb")');
    writeFileSync(join(fixture, "build.mjs"), `
      import { mkdirSync, rmSync, writeFileSync } from "node:fs";
      writeFileSync("built.json", "true");
      if (${failBuild}) process.exit(23);
      rmSync("dist", { recursive: true });
      mkdirSync("dist");
      writeFileSync("dist/index.html", ${JSON.stringify(text)});
    `);
    const result = spawnSync("pnpm", ["run", mode], { cwd: fixture, encoding: "utf8", timeout: 15_000 });
    expect(result.error).toBeUndefined();
    expect(JSON.parse(readFileSync(join(fixture, "built.json"), "utf8"))).toBe(true);
    return { status: result.status, output: result.stdout + result.stderr };
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
}

describe("deployment package commands", () => {
  for (const mode of modes) {
    it(`${mode} builds before checking the package for Dragonhold`, () => {
      const result = run(mode, "<title>Dragonhold</title>");
      expect(result.status).toBe(0);
      expect(result.output).not.toContain("foreign-asset:");
    });

    it(`${mode} stops when the build fails`, () => {
      const result = run(mode, "<title>Dragonhold</title>", true);
      expect(result.status).toBe(23);
      expect(result.output).not.toContain("foreign-asset:");
    });

    it(`${mode} rejects assets belonging to another game`, () => {
      const result = run(mode, '<script>fetch("/assets/typing-defense/model.glb")</script>');
      expect(result.status).toBe(1);
      expect(result.output).toContain("foreign-asset:");
    });
  }

  it("rejects the home portal in production", () => {
    const result = run("deploy:pack", '<script>const portal = "https://typing-game.local"</script>');
    expect(result.status).toBe(1);
    expect(result.output).toContain("local-host:");
  });

  it("permits the home portal for the local demo", () => {
    const result = run("deploy:pack:local", '<script>const portal = "https://typing-game.local"</script>');
    expect(result.status).toBe(0);
    expect(result.output).not.toContain("local-host:");
  });
});
