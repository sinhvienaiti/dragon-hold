/**
 * pnpm dh:balance: headless bots over the M0 stage (DESIGN.md §9 M0 gates,
 * 00 §7): 0 / 25 / 35 / 60 WPM, typing-only and buy-only variants, 20 seeds;
 * prints win rates, peak load, damage shares, gold, lost locks.
 * Owner: bot-balance (LANES.md). Stub: the bots are TODO.
 */
import { STAGE_M0 } from "../../src/content/data/stages";
import { M0_GATES } from "../../src/content/rules";
import { createWorld, hashWorldHex, step } from "../../src/sim/world";

// TODO(bot-balance): typist bots feeding SimCommands, buy strategies, gate report.
const world = createWorld(STAGE_M0, STAGE_M0.seed);
for (let tick = 0; tick < 600; tick += 1) step(world);
console.log(JSON.stringify({ stage: STAGE_M0.id, ticks: world.tick, hash: hashWorldHex(world), gates: M0_GATES, bots: "TODO" }));
