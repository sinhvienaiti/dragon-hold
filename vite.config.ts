import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { serveSharedFolders } from "./src/kit/tools";

const root = fileURLToPath(new URL(".", import.meta.url));
/** The parent repo's shared/ (/vocabulary/, /typing-texts/), served read-only in dev by the kit plugin. */
const sharedRoot = join(root, "..", "..", "shared");

const env = (name: string): string | undefined => process.env[name]?.trim() || undefined;

// The parent repo's dev script (package.json dev:dragon:app) sets these for the
// nginx host. A plain `pnpm dev` on 127.0.0.1:3005 keeps Vite's own HMR socket.
const hmrHost = env("DEV_HMR_HOST");

export default defineConfig({
  base: "/",
  plugins: [serveSharedFolders({ sharedRoot })],
  server: {
    host: env("DEV_HOST") ?? "127.0.0.1",
    port: 3005,
    strictPort: true,
    allowedHosts: (env("DEV_ALLOWED_HOSTS") ?? "dragon.typing-game.local")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
    hmr: hmrHost
      ? {
          host: hmrHost,
          protocol: (env("DEV_HMR_PROTOCOL") as "ws" | "wss" | undefined) ?? "wss",
          clientPort: Number(env("DEV_HMR_CLIENT_PORT") ?? 443),
        }
      : undefined,
  },
  build: {
    target: "es2022",
    // three.js in its own chunk: cached across game updates, and no chunk over the 500 kB warning.
    rollupOptions: { output: { manualChunks: { three: ["three"] } } },
    // three.js alone is ~560 kB minified (140 kB gzip).
    chunkSizeWarningLimit: 600,
  },
});
