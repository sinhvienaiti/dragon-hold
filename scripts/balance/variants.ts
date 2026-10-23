/**
 * Stage variants for balance experiments (never shipped): the same waves at
 * a faster pace, so a report can say how far the plan is from a gate. A pace
 * of 1.3 plays every wave in 1 / 1.3 of its time: load × 1.3, same foes.
 * Owner: bot-balance (LANES.md).
 */
import type { StageDef } from "../../src/content/types";

export function pacedStage(stage: StageDef, pace: number): StageDef {
  if (pace === 1) return stage;
  const at = (ms: number) => Math.round(ms / pace);
  return {
    ...stage,
    waves: stage.waves.map((wave) => ({
      ...wave,
      durationMs: at(wave.durationMs),
      load100: Math.round(wave.load100 * pace),
      peaks: wave.peaks.map((peak) => ({ atMs: at(peak.atMs), lengthMs: at(peak.lengthMs) })),
      groups: wave.groups.map((group) => ({ ...group, atMs: at(group.atMs), ...(group.gapMs !== undefined ? { gapMs: at(group.gapMs) } : {}) })),
    })),
  };
}
