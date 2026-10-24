/**
 * pnpm dh:balance: headless bots over the M0 stage (DESIGN.md §9 M0 gates,
 * 00 §7): 0 / 25 / 35 / 60 WPM with the average kit, a typing-only bot that
 * never buys and a no-typing bot with the best buys, 20 seeds each. Prints
 * (Markdown, Vietnamese) the gates first, which systems do nothing yet, win
 * rates, waves reached, typing load per wave and its peak, damage shares,
 * hard control, locks lost, the gold curve, sim cost per step, and the wave
 * plan checked by hand. Never fails unless --strict.
 *   tsx scripts/balance/run.ts [--seeds=20] [--bots=b35,b25] [--base-seed=N]
 *     [--modes=relax,balanced,challenge] [--seed-sets=2] [--base-seed2=N]
 *     [--max-minutes=60] [--jobs=N] [--json=out.json] [--strict]
 * Modes (BALANCE.md §3) play at a difficulty (00 §4.10): Thư giãn = Dễ, Cân bằng = Thường,
 * Thử thách = Khó; the director takes the mode's band. Two independent seed sets by default
 * (the stage seed and the stage seed + 1,000,003), each judged on its own and together.
 *   tsx scripts/balance/run.ts --trace=b35:20261023   (one run, wave by wave, as JSON)
 *   --pace=1.3 plays every wave 1.3× faster (load × 1.3, same foes): how far a gate is.
 * Owner: bot-balance (LANES.md).
 */
import { fork } from "node:child_process";
import { writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { fileURLToPath } from "node:url";
import { STAGE_M0 } from "../../src/content/data/stages";
import { M0_GATES } from "../../src/content/rules";
import type { Difficulty } from "../../src/content/types";
import { BAND_MODES, type BandMode } from "../../src/kit/balance";
import { BAND_MODE } from "../../src/sim/director";
import { BOT_NAMES, BOTS, M0_BOTS, createBotWorld, runBot, type BotName, type BotRun } from "./bot";
import { pacedStage } from "./variants";
import { bandGates, m0Gates, mapNotes, markdown, planRows, readiness, summarize, type BotSummary } from "./report";

interface Task {
  readonly bot: BotName;
  readonly seed: number;
  readonly difficulty: Difficulty;
}

/** The difficulty that plays each mode (00 §4.10, BALANCE.md §3). */
const DIFFICULTY_OF: Readonly<Record<BandMode, Difficulty>> = { relax: "easy", balanced: "normal", challenge: "hard" };

interface Job {
  readonly tasks: readonly Task[];
  readonly maxTicks: number;
  readonly pace: number;
}

const args = process.argv.slice(2);
const arg = (name: string): string | undefined => args.find((a) => a.startsWith("--" + name + "="))?.split("=")[1];
const num = (name: string, fallback: number): number => {
  const value = Number(arg(name) ?? fallback);
  return Number.isFinite(value) ? value : fallback;
};

/** One run with its log dropped (reports never need it). */
function runTask(task: Task, maxTicks: number, pace: number): BotRun & { difficulty: Difficulty } {
  return { ...runBot(BOTS[task.bot], { seed: task.seed, maxTicks, timeSteps: true, stage: pacedStage(STAGE_M0, pace), difficulty: task.difficulty }), difficulty: task.difficulty };
}

const trace = arg("trace");

if (args.includes("--worker")) {
  process.once("message", async (job: Job) => {
    // Each result waits for its send to flush: a disconnect with sends still queued crashes the IPC channel (Node 24, the Dell).
    for (const task of job.tasks) {
      const run = runTask(task, job.maxTicks, job.pace);
      await new Promise<void>((done, fail) => process.send!(run, (error: Error | null) => (error ? fail(error) : done())));
    }
    process.disconnect();
  });
} else if (trace) {
  const [bot, seed] = trace.split(":") as [BotName, string?];
  if (!(bot in BOTS)) throw new Error("không có bot " + bot + "; có: " + BOT_NAMES.join(", "));
  const run = runBot(BOTS[bot], { seed: Number(seed ?? STAGE_M0.seed), maxTicks: Math.round(num("max-minutes", 60) * 3600), timeSteps: true });
  const { arrivals, log, hashes, ...rest } = run;
  console.log(JSON.stringify({ ...rest, arrivals: arrivals.length, w: arrivals.reduce((sum, a) => sum + a.w, 0) }, null, 1));
} else {
  await main();
}

async function main(): Promise<void> {
  const started = performance.now();
  const seeds = num("seeds", M0_GATES.seeds);
  const base = num("base-seed", STAGE_M0.seed);
  const sets = Math.max(1, Math.min(2, num("seed-sets", 2)));
  const bases = [base, num("base-seed2", base + 1_000_003)].slice(0, sets);
  const maxTicks = Math.round(num("max-minutes", 60) * 3600);
  const pace = num("pace", 1);
  const modes = (arg("modes")?.split(",") ?? [...BAND_MODES]).filter((mode): mode is BandMode => (BAND_MODES as readonly string[]).includes(mode));
  // Every bot by default: the M0 gate bots and BALANCE.md §6's set with the B6, B7 variants (`--set=m0`: the gate bots only).
  const bots = (arg("bots")?.split(",") ?? (arg("set") === "m0" ? [...M0_BOTS] : BOT_NAMES)).filter((name): name is BotName => {
    if (!(name in BOTS)) console.error("không có bot " + name + "; có: " + BOT_NAMES.join(", "));
    return name in BOTS;
  });
  const tasks: Task[] = modes.flatMap((mode) =>
    bots.flatMap((bot) => bases.flatMap((first) => Array.from({ length: seeds }, (_, k) => ({ bot, seed: first + k, difficulty: DIFFICULTY_OF[mode] })))),
  );
  const jobs = Math.max(1, Math.min(num("jobs", Math.max(1, Math.min(6, availableParallelism() - 4))), tasks.length));
  const runs: (BotRun & { difficulty: Difficulty })[] = [];
  const progress = (run: BotRun & { difficulty: Difficulty }) => {
    runs.push(run);
    process.stderr.write("\r" + runs.length + "/" + tasks.length + " lượt");
  };
  if (jobs === 1) for (const task of tasks) progress(runTask(task, maxTicks, pace));
  else {
    const chunks: Task[][] = Array.from({ length: jobs }, () => []);
    tasks.forEach((task, k) => chunks[k % jobs]!.push(task));
    const script = fileURLToPath(import.meta.url);
    await Promise.all(
      chunks.map(
        (chunk) =>
          new Promise<void>((resolve, reject) => {
            const child = fork(script, ["--worker"], { stdio: ["ignore", "inherit", "inherit", "ipc"] });
            child.on("message", (run) => progress(run as BotRun & { difficulty: Difficulty }));
            child.on("error", reject);
            child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error("bot worker exited with " + code))));
            child.send({ tasks: chunk, maxTicks, pace } satisfies Job);
          }),
      ),
    );
  }
  process.stderr.write("\n");
  const stage = pacedStage(STAGE_M0, pace);
  const fold = (pick: (run: BotRun & { difficulty: Difficulty }) => boolean): Partial<Record<BandMode, Record<string, BotSummary>>> => {
    const out: Partial<Record<BandMode, Record<string, BotSummary>>> = {};
    for (const mode of modes) {
      const rows: Record<string, BotSummary> = {};
      for (const bot of bots) {
        const own = runs.filter((run) => run.bot === bot && BAND_MODE[run.difficulty] === mode && pick(run)).sort((a, b) => a.seed - b.seed);
        if (own.length > 0) rows[bot] = summarize(bot, own, stage, mode);
      }
      out[mode] = rows;
    }
    return out;
  };
  const byMode = fold(() => true);
  const kitRows = (rows: Partial<Record<BandMode, Record<string, BotSummary>>>) => Object.values(rows).flatMap((r) => Object.values(r ?? {}).map((s) => s.kit));
  // B1–B9 against the shared bands (BALANCE.md §3), B1 and B7 against D27's proposed band too.
  const setGates = bases.map((first) => ({ base: first, ...bandGates(kitRows(fold((run) => run.seed >= first && run.seed < first + seeds))) }));
  const summaries = byMode.balanced ?? {};
  const world = createBotWorld(BOTS.b35, { seed: base });
  const notes = [
    ...mapNotes(world),
    "Trần quái sống của ải M0: " + world.liveCap + " (C" + STAGE_M0.chapter + " mặc định 20); quái sống tối đa đo được: " +
      Math.max(0, ...Object.values(byMode).flatMap((rows) => Object.values(rows ?? {}).map((s) => s.live.maxFoes))) + ".",
    "Seed: " + bases.map((first) => first + "…" + (first + seeds - 1)).join(" và ") + " (" + seeds + " seed mỗi bộ, mỗi bot, mỗi chế độ).",
  ];
  if (pace !== 1) notes.unshift("Thử nghiệm: mọi đợt chạy nhanh × " + pace + " (tải × " + pace + ", cùng quái). Không phải ải thật.");
  const report = markdown({ seeds: seeds * bases.length, summaries, byMode, sets: setGates, plan: planRows(stage), notes, wallS: (performance.now() - started) / 1000 });
  console.log(report);
  const gates = m0Gates(summaries);
  const json = arg("json");
  if (json) writeFileSync(json, JSON.stringify({ seeds, bases, gates, bGates: bandGates(kitRows(byMode)), bGateSets: setGates, readiness: readiness(summaries), plan: planRows(), byMode }, null, 1) + "\n");
  if (args.includes("--strict") && gates.some((gate) => gate.status !== "đạt")) process.exitCode = 1;
}
