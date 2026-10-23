/**
 * pnpm dh:golden:update (package.json runs this file with --update): the
 * golden runs of golden-update.ts. With --update it rewrites
 * tests/golden/m0.json when anything moved; without it, it only checks.
 * Owner: bot-balance (LANES.md).
 */
import { goldenUpdate } from "./golden-update";

const argv = process.argv.slice(2);
process.exitCode = goldenUpdate(argv.includes("--update") ? argv.filter((a) => a !== "--update") : ["--check", ...argv]);
