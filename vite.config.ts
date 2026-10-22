import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { serveShared } from "./scripts/dev/serve-shared";

const root = fileURLToPath(new URL(".", import.meta.url));
/** The parent repo's shared/ (vocabulary, typing texts), served read-only in dev. */
const shared = join(root, "..", "..", "shared");

const env = (name: string): string | undefined => process.env[name]?.trim() || undefined;

// The parent repo's dev script (package.json dev:dragon:app) sets these for the
// nginx host. A plain `pnpm dev` on 127.0.0.1:3005 keeps Vite's own HMR socket.
const hmrHost = env("DEV_HMR_HOST");

export default defineConfig({
  base: "/",
  plugins: [serveShared(shared)],
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
  },
});
