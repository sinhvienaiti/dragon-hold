/**
 * Integer helpers for the sim (05 §9.4: no trig, pow, hypot or ** in sim/).
 * Ticks run at 60 Hz. Positions are u with 1 m = 60 000 u, so a speed of
 * N mm/s moves N u per tick and a distance of N mm is 60 N u. Products stay
 * below 2^53 for maps up to ±150 m, so plain JS numbers hold them exactly.
 * Owner: architect for M0a setup, sim-battle afterwards (LANES.md).
 */

export const TICK_HZ = 60;
/** u per metre. */
export const U_PER_M = 60_000;
/** u per millimetre. */
export const U_PER_MM = 60;

/** Metres (content, readers) to u, rounded. */
export const mToU = (m: number): number => Math.round(m * U_PER_M);
/** u to metres, for readers only (events, view); never fed back into rules. */
export const uToM = (u: number): number => u / U_PER_M;
export const mmToU = (mm: number): number => mm * U_PER_MM;
/** Milliseconds to whole ticks, rounded (16.67 ms each). */
export const msToTicks = (ms: number): number => Math.round((ms * TICK_HZ) / 1000);
export const ticksToMs = (ticks: number): number => Math.round((ticks * 1000) / TICK_HZ);

export const clamp = (value: number, min: number, max: number): number => (value < min ? min : value > max ? max : value);

/** round(a × b / c) for integers; c > 0. */
export const mulDiv = (a: number, b: number, c: number): number => Math.round((a * b) / c);
/** `value` scaled by a percent, rounded. */
export const pct = (value: number, percent: number): number => Math.round((value * percent) / 100);
/** `value` scaled by a permille, rounded. */
export const pm = (value: number, permille: number): number => Math.round((value * permille) / 1000);

/** floor(√n) for a non-negative integer (sqrt is correctly rounded in IEEE 754; the fix-up guards the edge). */
export function isqrt(n: number): number {
  if (n <= 0) return 0;
  let root = Math.floor(Math.sqrt(n));
  while (root * root > n) root -= 1;
  while ((root + 1) * (root + 1) <= n) root += 1;
  return root;
}

export const dist2 = (ax: number, az: number, bx: number, bz: number): number => (ax - bx) * (ax - bx) + (az - bz) * (az - bz);
export const dist = (ax: number, az: number, bx: number, bz: number): number => isqrt(dist2(ax, az, bx, bz));
/** True when (ax, az) lies within `radius` u of (bx, bz), without a square root. */
export const within = (ax: number, az: number, bx: number, bz: number, radius: number): boolean => dist2(ax, az, bx, bz) <= radius * radius;

/**
 * True when (px, pz) lies inside a cone from (ox, oz) along (dx, dz) with
 * half-angle cos = `cosPm` / 1000 and length `range` u (Phun Lửa: 60° cone).
 */
export function inCone(ox: number, oz: number, dx: number, dz: number, px: number, pz: number, cosPm: number, range: number): boolean {
  const vx = px - ox;
  const vz = pz - oz;
  const d2 = vx * vx + vz * vz;
  if (d2 > range * range) return false;
  if (d2 === 0) return true;
  const dot = vx * dx + vz * dz;
  if (dot <= 0) return false;
  // dot / (|v| |d|) ≥ cos; vectors up to ~1e6 u keep every product below 2^53.
  return dot * 1000 >= cosPm * isqrt(d2) * isqrt(dx * dx + dz * dz);
}
