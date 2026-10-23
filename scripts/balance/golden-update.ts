/**
 * Rewrites tests/golden/m0.json (golden-spec.ts) after a deliberate rule or
 * bot change: runs every golden case on the file's own deck (or the bots'
 * deck with --fresh-deck, or when no file exists yet) and prints, per case,
 * whether its hashes, final hash or command log moved and the first tick
 * that moved. --check compares the same way, writes nothing, and exits 1
 * when anything differs (that is when tests/golden/golden.test.ts fails).
 *   tsx scripts/balance/golden-update.ts [--check] [--fresh-deck]
 * Owner: bot-balance (LANES.md).
 */
import { existsSync, writeFileSync } from "node:fs";
import { BOT_WORDS } from "./deck";
import { GOLDEN_PATH, buildGolden, goldenText, readGolden, type GoldenFile } from "./golden-spec";

export function goldenUpdate(argv: readonly string[]): number {
  const check = argv.includes("--check");
  const before: GoldenFile | null = existsSync(GOLDEN_PATH) ? readGolden() : null;
  const words = argv.includes("--fresh-deck") || before === null ? BOT_WORDS : before.deck;
  const after = buildGolden(words);
  const changes = after.cases.map((now) => {
    const old = before?.cases.find((item) => item.name === now.name);
    if (!old) return { name: now.name, change: "mới" };
    const moved = now.hashes.findIndex((hash, k) => hash !== old.hashes[k]);
    const logSame = JSON.stringify(now.log) === JSON.stringify(old.log);
    const same = moved < 0 && now.hashes.length === old.hashes.length && now.final === old.final && logSame && now.ticks === old.ticks;
    return {
      name: now.name,
      change: same ? "giữ nguyên" : "đổi",
      firstMovedAtTick: moved < 0 ? null : (moved + 1) * now.every,
      final: old.final + " → " + now.final,
      log: logSame ? "giữ nguyên" : old.log.length + " → " + now.log.length + " lệnh",
    };
  });
  const deckChanged = before !== null && JSON.stringify(before.deck) !== JSON.stringify(after.deck);
  const same = before !== null && !deckChanged && changes.every((change) => change.change === "giữ nguyên") && before.cases.length === after.cases.length;
  console.log(JSON.stringify({ same, deckChanged, cases: changes }, null, 1));
  if (check) return same ? 0 : 1;
  if (!same) {
    writeFileSync(GOLDEN_PATH, goldenText(after));
    console.log("đã ghi " + GOLDEN_PATH);
  }
  return 0;
}

if (process.argv[1] && /golden-update\.ts$/.test(process.argv[1])) process.exitCode = goldenUpdate(process.argv.slice(2));
