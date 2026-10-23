/**
 * Where a bot's wave time goes (BALANCE.md §3 I and S): every wave tick is
 * typing (a word in mind), reading (a word live, hands free), or idle, and an
 * idle tick says why: the wave's first word has not come yet, a spawn gap
 * (no foe alive, groups still queued), foes walking outside the word zone,
 * or foes in the zone without a word yet (its strike in flight, waiting for
 * the 0.25 s deal). Idle by 5 s bin of the wave, HP lost split by Héo lan
 * (blight) and blows, by wave, Héo by foe and state, by how many foes stood
 * in Vòng Nguy. The tool behind the idle analysis of the balance changelog.
 *   tsx scripts/balance/anatomy.ts [--bot=b35] [--seeds=10] [--base-seed=N] [--difficulty=normal] [--pace=1]
 * Script side: floats are fine here. Owner: bot-balance (LANES.md).
 */
import { STAGE_M0 } from "../../src/content/data/stages";
import { PRESSURE, RINGS } from "../../src/content/rules";
import { foeDefOf } from "../../src/sim/waves";
import type { Difficulty, StageDef } from "../../src/content/types";
import { pacedStage } from "./variants";
import { mmToU, within } from "../../src/sim/fixed";
import { inWordZone } from "../../src/sim/words";
import type { World } from "../../src/sim/world";
import { BOTS, runBot, type BotName } from "./bot";
import { liveWords } from "./reader";

const args = process.argv.slice(2);
const arg = (name: string): string | undefined => args.find((a) => a.startsWith("--" + name + "="))?.split("=")[1];

type Kind = "typing" | "reading" | "start" | "gap" | "approach" | "noWord";
const KINDS: readonly Kind[] = ["typing", "reading", "start", "gap", "approach", "noWord"];

interface WaveRow {
  wave?: number;
  ticks: number;
  kinds: Record<Kind, number>;
  blight: number;
  blows: number;
  firstWordTicks: number;
  ringFoeTicks: number;
  maxRing: number;
  maxLive: number;
  foes: number;
}

/** Idle ticks by 5 s bin since the wave started, summed over waves (where in a wave the hands wait). */
export const idleBins: number[] = [];
export const allBins: number[] = [];
/** What is on screen while the hands are free but a word is up ("reading"), and why foes in the zone have no word ("noWord"). */
export const probe: Record<string, number> = {};

/** Héo lan seeped, HP, by foe species and the state that made it seep (PRESSURE rates, before k and auras). */
export const seepBy: Record<string, number> = {};

const DANGER = mmToU(RINGS.dangerMm);

export function anatomy(bot: BotName, seed: number, difficulty: Difficulty = "normal", stage: StageDef = STAGE_M0): { result: string; hpPct: number; waves: WaveRow[] } {
  const waves: WaveRow[] = [];
  let row: WaveRow | null = null;
  let firstWord = false;
  let startedAt = 0;
  const run = runBot(BOTS[bot], {
    seed,
    difficulty,
    stage,
    onTick: (world: World, events, busy) => {
      for (const event of events) {
        if (event.type === "wave-start") {
          row = { wave: event.wave, ticks: 0, kinds: { typing: 0, reading: 0, start: 0, gap: 0, approach: 0, noWord: 0 }, blight: 0, blows: 0, firstWordTicks: -1, ringFoeTicks: 0, maxRing: 0, maxLive: 0, foes: 0 };
          waves[event.wave - 1] = row;
          firstWord = false;
          startedAt = event.tick;
        } else if (row && event.type === "hit" && event.target.kind === "hero") {
          if (event.source.kind === "hero") row.blight += event.amount;
          else row.blows += event.amount;
        } else if (row && event.type === "spawn") row.foes += 1;
      }
      if (!row || world.phase !== "wave") return;
      row.ticks += 1;
      let words = 0;
      for (const word of liveWords(world)) if (word) words += 1;
      if (words > 0 && !firstWord) {
        firstWord = true;
        row.firstWordTicks = world.tick - startedAt;
      }
      let alive = 0;
      let zone = 0;
      let ring = 0;
      const seen = new Set<number>();
      const grace = Math.round((world.pace.wordTicks * PRESSURE.graceX10) / 10);
      for (const enemy of world.enemies.list) {
        if (!enemy.alive) continue;
        if (inWordZone(world, enemy) && !(enemy.cluster >= 0 && seen.has(enemy.cluster))) {
          if (enemy.cluster >= 0) seen.add(enemy.cluster);
          const word = enemy.word >= 0 ? world.words.live[enemy.word] : null;
          const standing = enemy.mode === "blocked" || enemy.mode === "attack" || enemy.mode === "hold";
          if (word ? world.tick - word.bornTick > grace : standing) {
            const near = within(enemy.x, enemy.z, 0, 0, mmToU(PRESSURE.ringMm));
            const rate = near ? PRESSURE.ringX10 : enemy.blockedBy >= 0 ? (PRESSURE.zoneX10 * PRESSURE.heldPct) / 100 : PRESSURE.zoneX10;
            const key = "w" + (row?.wave ?? 0) + " " + enemy.foe + ":" + (near ? "ring-" : "zone-") + enemy.mode + (word ? "" : "-noword");
            seepBy[key] = (seepBy[key] ?? 0) + rate / 10 / 60;
          }
        }
        alive += 1;
        if (inWordZone(world, enemy)) zone += 1;
        if (within(enemy.x, enemy.z, 0, 0, DANGER)) ring += 1;
      }
      row.ringFoeTicks += ring;
      if (ring > row.maxRing) row.maxRing = ring;
      if (alive > row.maxLive) row.maxLive = alive;
      let kind: Kind;
      if (busy) kind = "typing";
      else if (words > 0) kind = "reading";
      else if (!firstWord) kind = "start";
      else if (alive === 0) kind = "gap";
      else if (zone === 0) kind = "approach";
      else kind = "noWord";
      row.kinds[kind] += 1;
      if (kind === "reading") {
        const kinds = liveWords(world).filter((word) => word !== null).map((word) => word!.kind + (word!.asleep ? "-asleep" : "")).sort().join("+");
        probe["reading " + kinds] = (probe["reading " + kinds] ?? 0) + 1;
      } else if (kind === "noWord") {
        const why: string[] = [];
        for (const enemy of world.enemies.list) {
          if (!enemy.alive || !inWordZone(world, enemy)) continue;
          const entry = world.words.foes.get(enemy.serial);
          const strike = world.combat.strikes.some((st) => st.serial === enemy.serial || (enemy.cluster >= 0 && st.cluster === enemy.cluster));
          why.push(strike ? "strike" : entry && entry.nextAt >= 0 ? "next" : enemy.cluster >= 0 ? "cluster" : "wait");
        }
        const key = "noWord " + [...new Set(why)].sort().join("+");
        probe[key] = (probe[key] ?? 0) + 1;
      }
      const bin = Math.floor((world.tick - startedAt) / 300);
      allBins[bin] = (allBins[bin] ?? 0) + 1;
      if (kind === "start" || kind === "gap" || kind === "approach" || kind === "noWord") idleBins[bin] = (idleBins[bin] ?? 0) + 1;
    },
  });
  return { result: run.result, hpPct: run.heroHpPct, waves };
}

if (process.argv[1]?.endsWith("anatomy.ts")) {
  const bot = (arg("bot") ?? "b35") as BotName;
  const seeds = Number(arg("seeds") ?? 10);
  const base = Number(arg("base-seed") ?? STAGE_M0.seed);
  const difficulty = (arg("difficulty") ?? "normal") as Difficulty;
  const sum: WaveRow[] = [];
  const results: Record<string, number> = {};
  const hps: number[] = [];
  for (let k = 0; k < seeds; k += 1) {
    const one = anatomy(bot, base + k, difficulty, pacedStage(STAGE_M0, Number(arg("pace") ?? 1)));
    results[one.result] = (results[one.result] ?? 0) + 1;
    hps.push(one.hpPct);
    one.waves.forEach((w, i) => {
      if (!w) return;
      const s = (sum[i] ??= { ticks: 0, kinds: { typing: 0, reading: 0, start: 0, gap: 0, approach: 0, noWord: 0 }, blight: 0, blows: 0, firstWordTicks: 0, ringFoeTicks: 0, maxRing: 0, maxLive: 0, foes: 0 });
      s.ticks += w.ticks;
      for (const kind of KINDS) s.kinds[kind] += w.kinds[kind];
      s.blight += w.blight;
      s.blows += w.blows;
      s.firstWordTicks += w.firstWordTicks;
      s.ringFoeTicks += w.ringFoeTicks;
      s.maxRing = Math.max(s.maxRing, w.maxRing);
      s.maxLive = Math.max(s.maxLive, w.maxLive);
      s.foes += w.foes;
    });
  }
  const pct = (a: number, b: number) => (b > 0 ? ((a * 100) / b).toFixed(1) : "—");
  console.log(`${bot} × ${seeds} seeds (${difficulty}): ${JSON.stringify(results)}; HP end median ${hps.sort((a, b) => a - b)[hps.length >> 1]!.toFixed(1)} %`);
  console.log("| wave | s | typing | reading | idle start | idle gap | idle approach | idle noWord | first word s | blight | blows | ring foe-s | max ring | max live | foes |");
  console.log("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|");
  const total: WaveRow = { ticks: 0, kinds: { typing: 0, reading: 0, start: 0, gap: 0, approach: 0, noWord: 0 }, blight: 0, blows: 0, firstWordTicks: 0, ringFoeTicks: 0, maxRing: 0, maxLive: 0, foes: 0 };
  sum.forEach((s, i) => {
    const n = seeds;
    for (const kind of KINDS) total.kinds[kind] += s.kinds[kind];
    total.ticks += s.ticks;
    total.blight += s.blight;
    total.blows += s.blows;
    console.log(
      `| ${i + 1} | ${(s.ticks / n / 60).toFixed(1)} | ${KINDS.map((kind) => pct(s.kinds[kind], s.ticks)).join(" | ")} | ${(s.firstWordTicks / n / 60).toFixed(1)} | ${(s.blight / n).toFixed(0)} | ${(s.blows / n).toFixed(0)} | ${(s.ringFoeTicks / n / 60).toFixed(1)} | ${s.maxRing} | ${s.maxLive} | ${(s.foes / n).toFixed(1)} |`,
    );
  });
  console.log("Idle % by 5 s bin of the wave: " + allBins.map((n, k) => k * 5 + "s " + (((idleBins[k] ?? 0) * 100) / n).toFixed(0) + "% (" + (n / seeds / 60).toFixed(0) + "s)").join(", "));
  console.log("Probe: " + Object.entries(probe).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => k + " " + (v / seeds / 60).toFixed(1) + "s").join(", "));
  console.log("Seep by foe:state (HP a run, before k, g and auras): " + Object.entries(seepBy).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => k + " " + (v / seeds).toFixed(0)).join(", "));
  console.log(`| all | ${(total.ticks / seeds / 60).toFixed(1)} | ${KINDS.map((kind) => pct(total.kinds[kind], total.ticks)).join(" | ")} | — | ${(total.blight / seeds).toFixed(0)} | ${(total.blows / seeds).toFixed(0)} | | | | |`);
}
