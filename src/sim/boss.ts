/**
 * Scripted skills of generals and bosses (02 §3–4). M0: G01's Cắm Cờ, a
 * banner that stands 8 s, buffs damage +25 % within 5 m and carries a D1
 * word to pull it out. Boss phases and seal clusters come with M2.
 * Owner: sim-battle (LANES.md). Stub: signatures fixed, bodies TODO.
 */
import type { WorldInit, World } from "./world";

export interface BannerState {
  /** Planting general's serial; the banner's position in u. */
  owner: number;
  x: number;
  z: number;
  until: number;
  /** Its word slot (−1: none yet). */
  word: number;
}

export interface BossState {
  readonly banners: BannerState[];
  /** Per general serial: tick its skill is ready. */
  readonly skillReadyAt: Map<number, number>;
}

export function createBossState(init: WorldInit): BossState {
  return { banners: [], skillReadyAt: new Map() };
}

/** General skills (telegraph, plant, expire); emits `telegraph` and `skill`-like events. */
export function stepBoss(world: World): void {
  // TODO(sim-battle)
}

/** The banner word was typed: the banner falls. */
export function pullBanner(world: World, banner: number): void {
  // TODO(sim-battle)
}
