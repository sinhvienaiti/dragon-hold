/**
 * pnpm dh:balance: headless bots over the M0 stage (DESIGN.md §9 M0 gates,
 * 00 §7): 0 / 25 / 35 / 60 WPM with the average kit, a typing-only bot that
 * never buys and a no-typing bot with the best buys, 20 seeds each. Prints
 * (Markdown, Vietnamese) the gates first, which systems do nothing yet, win
 * rates, waves reached, typing load per wave and its peak, damage shares,
 * hard control, locks lost, the gold curve, sim cost per step, and the wave
 * plan checked by hand. Never fails unless --strict.
 *   tsx scripts/balance/run.ts [--seeds=20] [--bots=b35,b25] [--base-seed=N]
 *     [--max-minutes=60] [--jobs=N] [--json=out.json] [--strict]
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
import { BOT_NAMES, BOTS, M0_BOTS, createBotWorld, runBot, type BotName, type BotRun } from "./bot";
import { pacedStage } from "./variants";
import { m0Gates, mapNotes, markdown, planRows, readiness, summarize, type BotSummary } from "./report";

interface Task {
  readonly bot: BotName;
  readonly seed: number;
}

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
function runTask(task: Task, maxTicks: number, pace: number): BotRun {
  return runBot(BOTS[task.bot], { seed: task.seed, maxTicks, timeSteps: true, stage: pacedStage(STAGE_M0, pace) });
}

const trace = arg("trace");

if (args.includes("--worker")) {
  process.once("message", (job: Job) => {
    for (const task of job.tasks) process.send!(runTask(task, job.maxTicks, job.pace));
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
  const maxTicks = Math.round(num("max-minutes", 60) * 3600);
  const pace = num("pace", 1);
  // Every bot by default: the M0 gate bots and BALANCE.md §6's set with the B6, B7 variants (`--set=m0`: the gate bots only).
  const bots = (arg("bots")?.split(",") ?? (arg("set") === "m0" ? [...M0_BOTS] : BOT_NAMES)).filter((name): name is BotName => {
    if (!(name in BOTS)) console.error("không có bot " + name + "; có: " + BOT_NAMES.join(", "));
    return name in BOTS;
  });
  const tasks: Task[] = bots.flatMap((bot) => Array.from({ length: seeds }, (_, k) => ({ bot, seed: base + k })));
  const jobs = Math.max(1, Math.min(num("jobs", Math.max(1, Math.min(8, availableParallelism() - 2))), tasks.length));
  const runs: BotRun[] = [];
  const progress = (run: BotRun) => {
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
            child.on("message", (run) => progress(run as BotRun));
            child.on("error", reject);
            child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error("bot worker exited with " + code))));
            child.send({ tasks: chunk, maxTicks, pace } satisfies Job);
          }),
      ),
    );
  }
  process.stderr.write("\n");
  const summaries: Record<string, BotSummary> = {};
  for (const bot of bots) {
    const own = runs.filter((run) => run.bot === bot).sort((a, b) => a.seed - b.seed);
    summaries[bot] = summarize(bot, own, pacedStage(STAGE_M0, pace));
  }
  const world = createBotWorld(BOTS.b35, { seed: base });
  const notes = [
    ...mapNotes(world),
    "Trần quái sống của ải M0: " + world.liveCap + " (C" + STAGE_M0.chapter + " mặc định 20); quái sống tối đa đo được: " +
      Math.max(0, ...Object.values(summaries).map((s) => s.live.maxFoes)) + ".",
  ];
  if (pace !== 1) notes.unshift("Thử nghiệm: mọi đợt chạy nhanh × " + pace + " (tải × " + pace + ", cùng quái). Không phải ải thật.");
  const report = markdown({ seeds, summaries, plan: planRows(pacedStage(STAGE_M0, pace)), notes, wallS: (performance.now() - started) / 1000 });
  console.log(report);
  const gates = m0Gates(summaries);
  const json = arg("json");
  if (json) writeFileSync(json, JSON.stringify({ seeds, base, gates, readiness: readiness(summaries), plan: planRows(), summaries }, null, 1) + "\n");
  if (args.includes("--strict") && gates.some((gate) => gate.status !== "đạt")) process.exitCode = 1;
}
