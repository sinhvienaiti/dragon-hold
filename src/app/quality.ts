import type { Quality } from "./contracts";

/** The release build never exposes the prototype Low tier. */
export function allowedQualities(prod: boolean): readonly Quality[] {
  return prod ? ["medium", "high", "ultra"] : ["low", "medium", "high", "ultra"];
}

/** Unknown values keep the caller's default; release Low is promoted to Medium. */
export function normalizeQuality(value: unknown, prod: boolean): Quality | undefined {
  if (value === "low" && prod) return "medium";
  return allowedQualities(prod).find((quality) => quality === value);
}
