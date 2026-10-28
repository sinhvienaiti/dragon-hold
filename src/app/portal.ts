/** The first configured portal origin, with a home path. */
export function portalHome(origins: string | undefined): string {
  const origin = origins?.split(",").map((value) => value.trim()).find(Boolean);
  return (origin ?? "https://typing-game.local") + "/";
}
