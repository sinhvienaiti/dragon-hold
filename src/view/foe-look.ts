/**
 * How a grey-box foe reads at the default camera (05 §2.2, §2.3; round 2
 * readability pass): the drawn scale per tier, a bright family colour that
 * stands off grass, dirt and water, and the look the crowd shader gives it
 * (dark outline, family rim, less ash). View only: the sim's sizes, ranges
 * and positions never change. Pure (no three), so the UI (tags) can read the
 * drawn heights too.
 * Owner: view (LANES.md).
 */
import { ENEMIES } from "../content/data/enemies";
import { GENERALS } from "../content/data/generals";
import type { Family, FoeId, Gait, PlaceholderDef, Tier } from "../content/types";

/** Drawn tier of a foe: its sim tier, or "general". */
export type DrawTier = Tier | "general";

/**
 * Drawn scale on top of the placeholder size, per tier. Small foes stand
 * ≥ 40 px at 1080p at the default camera (a 1.56 m grunt is drawn 3.5 m);
 * medium foes are bigger already in their placeholder (a boar is drawn 3.4 m
 * long), heavy and giant a step up, a general ≥ 60 px; a swarm keeps small
 * bodies and reads as a cluster (ring and spread, see actors.ts). Before
 * round 2 every foe was 1.4.
 */
export const FOE_DRAW_SCALE: Readonly<Record<DrawTier, number>> = {
  swarm: 1.5,
  small: 2.25,
  medium: 2.15,
  heavy: 2.25,
  giant: 2.35,
  general: 2.2,
};

/** Our units (blockers) stand as tall as the foes they hold. */
export const UNIT_DRAW_SCALE = 2.0;

/**
 * Family colours as drawn: the content hue (FAMILY_COLORS) pushed brighter
 * and more saturated so a body never melts into the green grass or the tan
 * path; moss turns withered olive-yellow (the Bầy Héo are withered moss, the
 * grass is fresh). Never a semantic colour (red danger, cyan typing, gold).
 */
export const FOE_VIEW_COLORS: Readonly<Record<Family, string>> = {
  moss: "#b4cc4e",
  beast: "#b07050",
  bug: "#8a7ee0",
  spore: "#d68fe0",
  stone: "#a9b0bc",
  wing: "#7f9be0",
  mist: "#b7b2e6",
  tide: "#4fc0b4",
};

export interface FoeLook {
  /** The placeholder as drawn (view colour; size and hover unchanged). */
  readonly placeholder: PlaceholderDef;
  readonly gait: Gait;
  readonly family: Family;
  readonly tier: DrawTier;
  /** Drawn scale (FOE_DRAW_SCALE of its tier). */
  readonly scale: number;
}

const FALLBACK: FoeLook = {
  placeholder: { shape: "box", color: "#a0a0a0", sizeM: [0.6, 1, 0.6], hoverM: 0 },
  gait: "biped",
  family: "stone",
  tier: "small",
  scale: FOE_DRAW_SCALE.small,
};

const cache = new Map<FoeId, FoeLook>();

/** A foe's drawn look (enemies and generals); cached per id. */
export function foeDrawLook(foe: FoeId): FoeLook {
  const hit = cache.get(foe);
  if (hit !== undefined) return hit;
  let look = FALLBACK;
  const enemy = ENEMIES[foe as keyof typeof ENEMIES];
  const general = GENERALS[foe as keyof typeof GENERALS];
  if (enemy !== undefined) {
    look = {
      placeholder: { ...enemy.show.placeholder, color: FOE_VIEW_COLORS[enemy.family] },
      gait: enemy.gait,
      family: enemy.family,
      tier: enemy.tier,
      scale: FOE_DRAW_SCALE[enemy.tier],
    };
  } else if (general !== undefined) {
    look = {
      placeholder: { ...general.show.placeholder, color: FOE_VIEW_COLORS[general.family] },
      gait: general.gait,
      family: general.family,
      tier: "general",
      scale: FOE_DRAW_SCALE.general,
    };
  }
  cache.set(foe, look);
  return look;
}

/** Drawn [width, height, length] of a foe in metres. */
export function foeDrawnSize(foe: FoeId): readonly [number, number, number] {
  const look = foeDrawLook(foe);
  const [w, h, l] = look.placeholder.sizeM;
  return [w * look.scale, h * look.scale, l * look.scale];
}

/** Drawn height of a foe's head above its ground point (hover included), metres. */
export function foeHeadM(foe: FoeId, liftM: number): number {
  return liftM + foeDrawnSize(foe)[1];
}

/**
 * Swarm spread (view only): member k of a cluster stands on a sunflower
 * spiral round the cluster's centre, so 6–10 bodies read as a cluster instead
 * of a single blob (the sim keeps them within 0.5 m). Writes [dx, dz] metres.
 */
export function swarmOffset(k: number, out: [number, number]): [number, number] {
  const r = 0.72 * Math.sqrt(k + 0.2);
  const angle = k * 2.399963;
  out[0] = Math.cos(angle) * r;
  out[1] = Math.sin(angle) * r;
  return out;
}

/** A swarm cluster as drawn this frame: ring centre and radius on the ground, metres. */
export interface DrawnCluster {
  x: number;
  z: number;
  radius: number;
}

/**
 * Swarm clusters as drawn this frame, by cluster id (view/actors.ts writes it
 * each frame; the word tags read it to stand above the whole cluster and keep
 * off it). View only, never read by the sim.
 */
export const drawnClusters = new Map<number, DrawnCluster>();

/** A live enemy warning as drawn this frame: a ground circle round it (centre, ground height, radius), metres. */
export interface DrawnWarning {
  x: number;
  y: number;
  z: number;
  radius: number;
}

/**
 * Enemy warnings drawn this frame (view/telegraphs.ts rewrites it each frame;
 * the word tags keep off them, so a tag never hides a wind-up). View only.
 */
export const drawnWarnings: DrawnWarning[] = [];
