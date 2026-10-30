import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import { portalHome } from "./src/app/portal";

const env = (name: string): string | undefined => process.env[name]?.trim() || undefined;

// The parent repo's dev script (package.json dev:dragon:app) sets these for the
// nginx host. A plain `pnpm dev` on 127.0.0.1:3005 keeps Vite's own HMR socket.
const hmrHost = env("DEV_HMR_HOST");

export default defineConfig(({ mode }) => {
  const root = fileURLToPath(new URL(".", import.meta.url));
  const contract = fileURLToPath(new URL("./src/kit/learning/contract.ts", import.meta.url));
  const home = portalHome(loadEnv(mode, root, "VITE_PORTAL_URL").VITE_PORTAL_URL);
  const parentOrigin = home ? new URL(home).origin : "";
  return {
    plugins: [{
      name: "dragonhold-portal-origin",
      enforce: "pre",
      transform(code, id) {
        if (id !== contract) return null;
        // Override only the compiled fallback; the pinned kit stays byte-for-byte intact.
        const declaration = /^export const PARENT_ORIGIN = [^\n]+;$/gm;
        if (code.match(declaration)?.length !== 1) this.error("Expected one kit PARENT_ORIGIN declaration");
        return { code: code.replace(declaration, `export const PARENT_ORIGIN = ${JSON.stringify(parentOrigin)};`), map: null };
      },
    }],
    base: "/",
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
  };
});
