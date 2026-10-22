/**
 * Foe movement (02 §1.3, 01 §2.1, §4.1): walk the lane at speed × slows ×
 * auras; stop at a blocker, at the melee ring (6 m), the shooting band
 * (10–16 m) or a general's 8 m; flyers circle at 6–8 m, 3 m up; fords slow
 * 30 % and leave Wet 4 s; knockback and pull move along the lane only.
 * Owner: sim-battle (LANES.md). Stub: signatures fixed, bodies TODO.
 */
import type { EnemyState, World } from "./world";

/** Moves every live foe one tick and updates x, z, y; emits `move` on mode changes only. */
export function stepMovement(world: World): void {
  // TODO(sim-battle)
}

/** Pushes `enemy` back along its lane by `distance` u ÷ weight (03 §2.3); never off the lane. */
export function knockBack(world: World, enemy: EnemyState, distance: number): void {
  // TODO(sim-battle)
}
