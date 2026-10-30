import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv, type Plugin } from "vite";

const root = fileURLToPath(new URL(".", import.meta.url));
const env = (name: string): string | undefined => process.env[name]?.trim() || undefined;

// The parent repo's dev script (package.json dev:dragon:app) sets these for the
// nginx host. A plain `pnpm dev` on 127.0.0.1:3005 keeps Vite's own HMR socket.
const hmrHost = env("DEV_HMR_HOST");

/**
 * The Typing Feel origin of VITE_TYPING_FEEL_ORIGIN (parent
 * docs/games/TYPING_FEEL_SERVICE.md §5.1), as the preconnect's href: an
 * http(s) URL without credentials, reduced to its origin. Anything else is
 * no origin, as for the game itself (typingFeelKeysBase).
 */
function feelOrigin(value: string | undefined): string | null {
  const text = value?.trim() ?? "";
  if (!text || /[\s?#]/.test(text)) return null;
  try {
    const url = new URL(text);
    return (url.protocol === "http:" || url.protocol === "https:") && url.host !== "" && !url.username && !url.password ? url.origin : null;
  } catch {
    return null;
  }
}

/** `<link rel="preconnect" … crossorigin>` to the Typing Feel host, only when this build has one: no tag at all otherwise. */
function feelPreconnect(origin: string | null): Plugin {
  return {
    name: "typing-feel-preconnect",
    transformIndexHtml: () => (origin === null ? [] : [{ tag: "link", attrs: { rel: "preconnect", href: origin, crossorigin: true }, injectTo: "head" }]),
  };
}

export default defineConfig(({ mode }) => ({
  base: "/",
  // The build script sets the origin (the parent's build:dragon and dev:dragon:app); .env files count too.
  plugins: [feelPreconnect(feelOrigin(loadEnv(mode, root, "VITE_TYPING_FEEL_").VITE_TYPING_FEEL_ORIGIN))],
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
}));
