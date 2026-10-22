// Source: games/space-typing/scripts/dev/vite.worktree.config.ts (the /vocabulary/ middleware).
// Dev-only: serves /vocabulary/ and /typing-texts/ read-only from the parent
// repo's shared/ folder, as the nginx dev config does, so 127.0.0.1:3005 gets
// real word lists. Replace with the kit tools/ plugin once src/kit/tools exists.
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize, sep } from "node:path";
import type { Plugin } from "vite";

const TYPES: Record<string, string> = {
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
};

/** `shared`: absolute path of the parent repo's shared/ folder. */
export function serveShared(shared: string, prefixes: readonly string[] = ["vocabulary", "typing-texts"]): Plugin {
  return {
    name: "dragon-hold-serve-shared",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.method !== "GET" && req.method !== "HEAD") return next();
        let path: string;
        try {
          path = decodeURIComponent((req.url ?? "/").split("?")[0]!);
        } catch {
          return next();
        }
        const prefix = prefixes.find((name) => path.startsWith("/" + name + "/"));
        if (!prefix) return next();
        const folder = join(shared, prefix);
        const file = normalize(join(folder, path.slice(prefix.length + 2)));
        if (!file.startsWith(folder + sep) || !existsSync(file) || !statSync(file).isFile()) return next();
        res.setHeader("Content-Type", TYPES[extname(file).toLowerCase()] ?? "application/octet-stream");
        res.setHeader("Cache-Control", "no-cache");
        if (req.method === "HEAD") return void res.end();
        createReadStream(file).pipe(res);
      });
    },
  };
}
