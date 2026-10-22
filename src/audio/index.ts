/**
 * Game audio (05 §7): kit/audio buses (music, ambience, world, enemies,
 * heroes, traps, allies, dialogue, typing, pronunciation, ui, warnings),
 * sound sets by class not species, synthesised typing ticks, ducking for
 * pronunciation; missing files fall back to synth or silence. Media never in Git.
 * Owner: audio (LANES.md). Stub: signatures fixed, body TODO.
 */
import type { Presenter } from "../app/contracts";

export interface GameAudio extends Presenter {
  /** Resumes the AudioContext after the first user gesture. */
  unlock(): void;
  setMuted(muted: boolean): void;
}

export function createAudio(): GameAudio {
  // TODO(audio)
  throw new Error("audio: not built yet (audio lane)");
}
