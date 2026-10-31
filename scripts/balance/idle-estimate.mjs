import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const round = value => Math.round(value * 10) / 10;
const pct = (part, total) => round(100 * part / Math.max(1e-9, total));

/** Offline estimate from the audit's [ms, phase, wave, words, visibleWords, liveFoes, hp] rows. */
export function estimateIdle(samples) {
  let waveSeconds = 0;
  let idleSeconds = 0;
  let gap = 0;
  const gaps = [];
  const endGap = () => { if (gap > 0) gaps.push(gap); gap = 0; };
  for (let i = 0; i < samples.length - 1; i += 1) {
    const [ms, phase, wave, , visible] = samples[i];
    const next = samples[i + 1];
    // Preserve the original audit's 500 ms interval cap and visible-word definition.
    const dt = Math.min(500, next[0] - ms) / 1000;
    if (phase !== 2) { endGap(); continue; }
    waveSeconds += dt;
    if (visible === 0) { gap += dt; idleSeconds += dt; }
    else endGap();
    if (next[1] !== 2 || next[2] !== wave) endGap();
  }
  endGap();
  const scenario = (lookaheadSeconds, speed) => {
    const shortened = gaps.reduce((sum, g) => sum + Math.min(g, lookaheadSeconds) + Math.max(0, g - lookaheadSeconds) / speed, 0);
    const total = waveSeconds - idleSeconds + shortened;
    return { lookaheadSeconds, speed, waveSeconds: round(total), idleSeconds: round(shortened), noWordPct: pct(shortened, total) };
  };
  return {
    assumption: "Samples contain no foe positions. Visible words stand in for foes entering the Word Zone. Only wave gaps shrink; the final lookahead seconds run at ×1. The 0.3 s activation latch and manual ×2 are not modelled.",
    before: { waveSeconds: Math.round(waveSeconds), idleSeconds: round(idleSeconds), noWordPct: pct(idleSeconds, waveSeconds), gaps: gaps.length },
    after: scenario(1.5, 1.75),
    sensitivity: [0, 0.5, 1, 1.5].flatMap(lookahead => [1.75, 2].map(speed => scenario(lookahead, speed))),
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv[2]) { console.error("Usage: node scripts/balance/idle-estimate.mjs <samples.json>"); process.exitCode = 1; }
  else console.log(JSON.stringify(estimateIdle(JSON.parse(readFileSync(process.argv[2], "utf8"))), null, 2));
}
