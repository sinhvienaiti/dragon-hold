/**
 * pnpm dh:golden:update: rewrites tests/golden/*.json (world hashes at fixed
 * ticks for fixed seeds and command logs). Run only after a deliberate rule
 * change, and say why in the changelog.
 * Owner: bot-balance (LANES.md). Stub: scenarios are TODO.
 */
const update = process.argv.includes("--update");
// TODO(bot-balance): golden scenarios (seed, command log, ticks) → hashes.
console.log(JSON.stringify({ update, golden: "TODO" }));
