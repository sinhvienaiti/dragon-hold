export interface IdleScenario {
  lookaheadSeconds: number;
  speed: number;
  waveSeconds: number;
  idleSeconds: number;
  noWordPct: number;
}
export function estimateIdle(samples: readonly (readonly number[])[]): {
  assumption: string;
  before: { waveSeconds: number; idleSeconds: number; noWordPct: number; gaps: number };
  after: IdleScenario;
  sensitivity: IdleScenario[];
};
