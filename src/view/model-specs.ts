/**
 * The owner's M0b models (Tripo GLBs, no bones, no clips) and how the game
 * draws them: which manifest entry a content model key reads, how the model
 * is fitted to its placeholder, which rig family moves it and where its
 * joints are. Pure data (no three), so tests and the UI can read it.
 *
 * Frame of every landmark: the crowd's model frame (feet at y = 0, nose +z,
 * the body's own left at +x), in units of the model's height (the loader
 * normalises each model to height 1). Measured on orthographic renders of
 * the processed GLBs (tmp/m0b/grid, M0b lane, 27/10).
 *
 * Kit model kinds have no generals, houses or traps, so those map to
 * enemies/* and props/* in the manifest (scripts/models/presets/dragon-hold-m0b.json).
 * Owner: view (M0b models lane).
 */
import type { Family } from "../content/types";

export type Vec3 = readonly [number, number, number];

/** How a model moves: a rig family (bones and clips are built in code, view/crowd-rig.ts), or rigid. */
export type RigKind = "biped" | "quadruped" | "flyer" | "hexapod" | "spikes" | "launcher" | "rigid";

/** Biped joints; arm and leg points are the body's left side (+x), the right side mirrors them unless given. */
export interface BipedMarks {
  readonly kind: "biped";
  readonly hips: Vec3;
  readonly chest: Vec3;
  readonly neck: Vec3;
  readonly crown: Vec3;
  readonly shoulder: Vec3;
  readonly elbow: Vec3;
  readonly hand: Vec3;
  readonly rShoulder?: Vec3;
  readonly rElbow?: Vec3;
  readonly rHand?: Vec3;
  readonly hip: Vec3;
  readonly knee: Vec3;
  readonly ankle: Vec3;
  /** Arm bones take vertices only at |x| ≥ armGate and below the neck; leg bones only at y ≤ legTop. */
  readonly armGate: number;
  readonly legTop: number;
  /** The hand that carries the weapon (its swing in Attack), and what the other hand holds. */
  readonly weapon: "right" | "left";
  /** G01: a banner pole in the right hand and its flag (pole bottom → top, flag top → bottom edge). */
  readonly pole?: { readonly bottom: Vec3; readonly top: Vec3; readonly flagTop: Vec3; readonly flagBottom: Vec3 };
  /** Arms brought toward the body in every clip (degrees), so A-pose arms keep inside the tag envelope. */
  readonly armsIn: number;
}

export interface QuadMarks {
  readonly kind: "quadruped";
  readonly hips: Vec3;
  readonly chest: Vec3;
  readonly head: Vec3;
  readonly snout: Vec3;
  readonly tailBase: Vec3;
  readonly tailTip: Vec3;
  /** Front leg (left side): top, joint, paw; hind leg the same. */
  readonly shoulder: Vec3;
  readonly elbow: Vec3;
  readonly paw: Vec3;
  readonly hip: Vec3;
  readonly hock: Vec3;
  readonly hindPaw: Vec3;
  /** Leg bones take vertices only below this height. */
  readonly legTop: number;
}

export interface FlyerMarks {
  readonly kind: "flyer";
  readonly thorax: Vec3;
  readonly head: Vec3;
  readonly abdomen: Vec3;
  readonly sting: Vec3;
  /** Left wing root and tip (the right mirrors). */
  readonly wingRoot: Vec3;
  readonly wingTip: Vec3;
  /** Wings take vertices only above this height and outside |x| ≥ wingGate. */
  readonly wingTop: number;
  readonly wingGate: number;
  readonly legs: Vec3;
  /** Rest turn of each wing about its own span (degrees): lays the upright Tripo wings flat (ART_REPLACE_LATER P1). */
  readonly wingRest: number;
}

export interface AntMarks {
  readonly kind: "hexapod";
  readonly thorax: Vec3;
  readonly head: Vec3;
  readonly jaw: Vec3;
  readonly waist: Vec3;
  readonly gaster: Vec3;
  readonly tip: Vec3;
  /** Left legs front to back: [hip, foot]; the right mirrors. */
  readonly legs: readonly (readonly [Vec3, Vec3])[];
  readonly legTop: number;
}

/** Placed things with moving parts: a base and one part over it. */
export interface PartMarks {
  readonly kind: "spikes" | "launcher";
  /** The part's pivot and its far end; it takes vertices above `split` (height). */
  readonly pivot: Vec3;
  readonly end: Vec3;
  readonly split: number;
}

export type RigMarks = BipedMarks | QuadMarks | FlyerMarks | AntMarks | PartMarks;

export interface ModelSpec {
  /** Content key (show.model), e.g. "enemies/moss-grunt". */
  readonly content: string;
  /** Manifest key under /assets/dragon-hold/models/m0b/ (kit kinds). */
  readonly manifest: string;
  /** Our side: no family wash, drawn before the foe ghosts. */
  readonly ours: boolean;
  /** Fitted to the placeholder's height (characters) or its footprint (placed things), uniformly. */
  readonly fit: "height" | "footprint";
  readonly rig: RigKind;
  readonly marks?: RigMarks;
  /**
   * Family wash 0–1 toward the family's view colour (FOE_VIEW_COLORS), luminance kept:
   * the texture stays readable as the owner's model, the family still reads at a squint.
   */
  readonly wash: number;
  /** Ground covered by one walk or run cycle, in model heights at full stride (foot speed matching). */
  readonly strideH: number;
  /** Fastest and slowest cycles per second while moving: past them the step shortens or lengthens instead. */
  readonly cadence: readonly [number, number];
  /** Review score (ART_ACCEPTANCE §2.1) and whether it is logged as provisional. */
  readonly score: number;
  readonly provisional: boolean;
}

const GRUNT: BipedMarks = {
  kind: "biped",
  hips: [0, 0.4, 0],
  chest: [0, 0.58, 0],
  neck: [0, 0.63, 0.02],
  crown: [0, 0.98, 0.05],
  shoulder: [0.19, 0.6, 0],
  elbow: [0.27, 0.45, 0],
  hand: [0.35, 0.27, 0.03],
  rShoulder: [-0.19, 0.6, 0],
  rElbow: [-0.27, 0.45, 0],
  rHand: [-0.35, 0.3, 0.03],
  hip: [0.12, 0.38, 0],
  knee: [0.15, 0.19, 0.03],
  ankle: [0.16, 0.05, 0],
  armGate: 0.2,
  legTop: 0.42,
  weapon: "right",
  armsIn: 6,
};

const ARCHER: BipedMarks = {
  kind: "biped",
  hips: [0, 0.4, 0],
  chest: [0, 0.57, 0],
  neck: [0, 0.62, 0.02],
  crown: [0, 1, 0.03],
  shoulder: [0.17, 0.6, 0],
  elbow: [0.24, 0.45, 0],
  hand: [0.3, 0.32, 0.03],
  hip: [0.11, 0.38, 0],
  knee: [0.12, 0.2, 0.02],
  ankle: [0.12, 0.05, 0],
  armGate: 0.17,
  legTop: 0.42,
  weapon: "left",
  armsIn: 4,
};

const BANNER: BipedMarks = {
  kind: "biped",
  hips: [0, 0.4, 0],
  chest: [0, 0.58, 0],
  neck: [0, 0.64, 0.02],
  crown: [0, 0.98, 0.03],
  shoulder: [0.17, 0.62, 0],
  elbow: [0.2, 0.42, 0],
  hand: [0.31, 0.23, 0.02],
  rShoulder: [-0.17, 0.62, 0],
  rElbow: [-0.2, 0.45, 0.02],
  rHand: [-0.29, 0.39, 0.03],
  hip: [0.11, 0.38, 0],
  knee: [0.12, 0.19, 0.02],
  ankle: [0.12, 0.05, 0],
  armGate: 0.15,
  legTop: 0.4,
  weapon: "right",
  pole: { bottom: [-0.31, 0, 0.03], top: [-0.31, 1, 0.03], flagTop: [-0.34, 0.97, 0.03], flagBottom: [-0.34, 0.54, 0.03] },
  armsIn: 0,
};

const WARDEN: BipedMarks = {
  kind: "biped",
  hips: [0, 0.38, 0],
  chest: [0, 0.6, 0],
  neck: [0, 0.68, 0],
  crown: [0, 0.98, 0],
  shoulder: [0.24, 0.67, 0],
  elbow: [0.3, 0.46, 0],
  hand: [0.39, 0.4, 0.02],
  rShoulder: [-0.24, 0.67, 0],
  rElbow: [-0.35, 0.46, 0],
  rHand: [-0.41, 0.24, 0.02],
  hip: [0.12, 0.33, 0],
  knee: [0.13, 0.17, 0],
  ankle: [0.13, 0.04, 0],
  armGate: 0.26,
  legTop: 0.36,
  weapon: "right",
  armsIn: 0,
};

const WOLF: QuadMarks = {
  kind: "quadruped",
  hips: [0, 0.48, -0.25],
  chest: [0, 0.5, 0.36],
  head: [0, 0.68, 0.55],
  snout: [0, 0.66, 0.84],
  tailBase: [0, 0.52, -0.46],
  tailTip: [0, 0.21, -0.82],
  shoulder: [0.11, 0.4, 0.34],
  elbow: [0.11, 0.19, 0.33],
  paw: [0.11, 0.02, 0.37],
  hip: [0.11, 0.42, -0.25],
  hock: [0.11, 0.14, -0.3],
  hindPaw: [0.11, 0.02, -0.34],
  legTop: 0.38,
};

const BOAR: QuadMarks = {
  kind: "quadruped",
  hips: [0, 0.52, -0.38],
  chest: [0, 0.55, 0.28],
  head: [0, 0.62, 0.42],
  snout: [0, 0.46, 0.78],
  tailBase: [0, 0.56, -0.58],
  tailTip: [0, 0.3, -0.77],
  shoulder: [0.16, 0.41, 0.26],
  elbow: [0.16, 0.15, 0.23],
  paw: [0.16, 0.02, 0.26],
  hip: [0.16, 0.41, -0.41],
  hock: [0.16, 0.15, -0.49],
  hindPaw: [0.16, 0.02, -0.51],
  legTop: 0.34,
};

const WASP: FlyerMarks = {
  kind: "flyer",
  thorax: [0, 0.5, 0.1],
  head: [0, 0.66, 0.38],
  abdomen: [0, 0.42, -0.15],
  sting: [0, 0.03, -0.5],
  wingRoot: [0.1, 0.62, 0.08],
  wingTip: [0.8, 0.95, -0.5],
  wingTop: 0.55,
  wingGate: 0.15,
  legs: [0, 0.3, 0.12],
  wingRest: 75,
};

const ANT: AntMarks = {
  kind: "hexapod",
  thorax: [0, 0.6, 0.2],
  head: [0, 0.55, 0.62],
  jaw: [0, 0.42, 0.78],
  waist: [0, 0.5, -0.07],
  gaster: [0, 0.6, -0.55],
  tip: [0, 0.4, -0.96],
  legs: [
    [[0.08, 0.5, 0.36], [0.5, 0.03, 0.57]],
    [[0.08, 0.5, 0.12], [0.55, 0.03, 0.04]],
    [[0.08, 0.5, -0.05], [0.5, 0.03, -0.43]],
  ],
  legTop: 0.46,
};

/** Every model of M0b by content key. Scores: IMAGE_AUDIT §7 (26/10) and ART_REPLACE_LATER. */
export const MODEL_SPECS: Readonly<Record<string, ModelSpec>> = {
  "enemies/moss-grunt": { content: "enemies/moss-grunt", manifest: "enemies/moss-grunt", ours: false, fit: "height", rig: "biped", marks: GRUNT, wash: 0.3, strideH: 0.95, cadence: [0.7, 1.6], score: 9, provisional: false },
  "enemies/moss-archer": { content: "enemies/moss-archer", manifest: "enemies/moss-archer", ours: false, fit: "height", rig: "biped", marks: ARCHER, wash: 0.3, strideH: 0.95, cadence: [0.7, 1.6], score: 9, provisional: false },
  "generals/moss-banner": { content: "generals/moss-banner", manifest: "enemies/moss-banner", ours: false, fit: "height", rig: "biped", marks: BANNER, wash: 0.22, strideH: 0.9, cadence: [0.55, 1.3], score: 9, provisional: false },
  "enemies/blight-wolf": { content: "enemies/blight-wolf", manifest: "enemies/blight-wolf", ours: false, fit: "height", rig: "quadruped", marks: WOLF, wash: 0.2, strideH: 2.1, cadence: [1.2, 2.8], score: 9.5, provisional: false },
  "enemies/tusk-boar": { content: "enemies/tusk-boar", manifest: "enemies/tusk-boar", ours: false, fit: "height", rig: "quadruped", marks: BOAR, wash: 0.2, strideH: 1.6, cadence: [1.0, 2.6], score: 9.5, provisional: false },
  "enemies/thorn-wasp": { content: "enemies/thorn-wasp", manifest: "enemies/thorn-wasp", ours: false, fit: "height", rig: "flyer", marks: WASP, wash: 0.3, strideH: 0, cadence: [1, 1], score: 7.5, provisional: true },
  "enemies/thorn-ant": { content: "enemies/thorn-ant", manifest: "enemies/thorn-ant", ours: false, fit: "height", rig: "hexapod", marks: ANT, wash: 0.3, strideH: 1.4, cadence: [2.5, 5.5], score: 9.5, provisional: false },
  "units/moss-warden": { content: "units/moss-warden", manifest: "units/moss-warden", ours: true, fit: "height", rig: "biped", marks: WARDEN, wash: 0, strideH: 0.9, cadence: [0.7, 1.4], score: 8, provisional: true },
  "houses/herb-hut": { content: "houses/herb-hut", manifest: "props/herb-hut", ours: true, fit: "footprint", rig: "rigid", wash: 0, strideH: 0, cadence: [1, 1], score: 9.5, provisional: false },
  "traps/spikes": {
    content: "traps/spikes",
    manifest: "props/spikes",
    ours: true,
    fit: "footprint",
    rig: "spikes",
    marks: { kind: "spikes", pivot: [0, 0.3, 0], end: [0, 1, 0], split: 0.42 },
    wash: 0,
    strideH: 0,
    cadence: [1, 1],
    score: 9,
    provisional: false,
  },
  "traps/pine-bomb": { content: "traps/pine-bomb", manifest: "props/pine-bomb", ours: true, fit: "height", rig: "rigid", wash: 0, strideH: 0, cadence: [1, 1], score: 9.5, provisional: false },
  "traps/net-launcher": {
    content: "traps/net-launcher",
    manifest: "props/net-launcher",
    ours: true,
    fit: "height",
    rig: "launcher",
    marks: { kind: "launcher", pivot: [0, 0.55, 0], end: [0, 1, 0], split: 0.52 },
    wash: 0,
    strideH: 0,
    cadence: [1, 1],
    score: 9.5,
    provisional: false,
  },
};

/** Content model keys the game has but no GLB exists for (consumables: never placed in the world; HUD icons only). */
export const NO_MODEL: readonly string[] = ["items/small-potion", "items/dragon-heart", "items/hard-scale"];

/** Crowd layer key of a model (our side keeps the crowd's "our-" prefix so it draws before the foe ghosts). */
export function modelLayerKey(spec: ModelSpec): string {
  return (spec.ours ? "our-" : "") + "model:" + spec.manifest;
}

/** The family wash colour of a foe model (FOE_VIEW_COLORS hex), or null for our side. */
export function washOf(spec: ModelSpec, family: Family | null, colors: Readonly<Record<Family, string>>): string | null {
  return spec.ours || family === null ? null : colors[family];
}

/** Scatter kinds the GLB props stand in for (view/scatter.ts plan lists); "dress" (lanterns, fences, the jetty) has no primitive. */
export type ScatterKind = "pine" | "crown" | "bush" | "rock" | "dress";

export interface PropSpec {
  readonly manifest: string;
  readonly kind: ScatterKind;
  /** Height of the model at a plan item of size 1 (pines: height; crowns, bushes, rocks: radius), metres. */
  readonly perSize: number;
  /** Share of its kind's plan items this model takes (the variants of a kind add up to 1; 0: placed by the layout only). */
  readonly share: number;
  /** Sway in the wind (paintMaterial wind), 0 for rocks and wood. */
  readonly wind: number;
  /** Kept far from the paths (05 §2.2): > 0 marks the far crown, placed where the plan has a far colour (that far from a lane edge). */
  readonly laneGapMin: number;
  readonly score: number;
  readonly provisional: boolean;
}

/**
 * The pine-river kit (K01–K11) as scatter variants. Sizes: a pine item of
 * size s is s metres tall; a crown of radius r stands about 2.6 r tall; a
 * bush of radius r about 0.8 r tall; a rock of radius r about r wide.
 */
export const PROP_SPECS: readonly PropSpec[] = [
  { manifest: "props/pine-river-pine-tall", kind: "pine", perSize: 1.0, share: 0.6, wind: 0.05, laneGapMin: 0, score: 9.5, provisional: false },
  { manifest: "props/pine-river-pine-young", kind: "pine", perSize: 0.82, share: 0.4, wind: 0.06, laneGapMin: 0, score: 8.5, provisional: true },
  { manifest: "props/pine-river-pine-round", kind: "crown", perSize: 2.4, share: 1, wind: 0.035, laneGapMin: 0, score: 9.5, provisional: false },
  // Not by share: it stands where the scatter plan put a far violet or blue crown (≥ 9 m off a lane edge, 05 §2.2).
  { manifest: "props/pine-river-tree-violet", kind: "crown", perSize: 2.5, share: 0, wind: 0.035, laneGapMin: 9, score: 8.5, provisional: true },
  { manifest: "props/pine-river-bush-moss", kind: "bush", perSize: 2.1, share: 0.55, wind: 0.05, laneGapMin: 0, score: 9.5, provisional: false },
  { manifest: "props/pine-river-bush-blossom", kind: "bush", perSize: 2.1, share: 0.45, wind: 0.05, laneGapMin: 0, score: 9, provisional: false },
  { manifest: "props/pine-river-rock-boulder", kind: "rock", perSize: 1.5, share: 0.3, wind: 0, laneGapMin: 0, score: 8.5, provisional: true },
  { manifest: "props/pine-river-rock-slab", kind: "rock", perSize: 1.9, share: 0.2, wind: 0, laneGapMin: 0, score: 10, provisional: false },
  { manifest: "props/pine-river-river-stones", kind: "rock", perSize: 2.2, share: 0.2, wind: 0, laneGapMin: 0, score: 10, provisional: false },
  { manifest: "props/pine-river-stump", kind: "rock", perSize: 1.6, share: 0.15, wind: 0, laneGapMin: 0, score: 9.5, provisional: false },
  { manifest: "props/pine-river-log", kind: "rock", perSize: 2.4, share: 0.15, wind: 0, laneGapMin: 0, score: 9.5, provisional: false },
  // Tripo round 3 (map pilot A2, 28/10): layout-only map dressing, manifest kit3 (KIT3_MANIFEST_URL).
  { manifest: "props/pine-river-lantern-post", kind: "dress", perSize: 1, share: 0, wind: 0, laneGapMin: 0, score: 9, provisional: false },
  { manifest: "props/pine-river-rail-fence", kind: "dress", perSize: 1, share: 0, wind: 0, laneGapMin: 0, score: 9, provisional: false },
  { manifest: "props/pine-river-wooden-jetty", kind: "dress", perSize: 1, share: 0, wind: 0, laneGapMin: 0, score: 9, provisional: false },
  { manifest: "props/pine-river-cliff-rock-a", kind: "rock", perSize: 1, share: 0, wind: 0, laneGapMin: 0, score: 8.5, provisional: true },
  { manifest: "props/pine-river-cliff-rock-b", kind: "rock", perSize: 1, share: 0, wind: 0, laneGapMin: 0, score: 7.5, provisional: true },
  { manifest: "props/pine-river-reed-clump", kind: "bush", perSize: 1, share: 0, wind: 0.07, laneGapMin: 0, score: 8, provisional: true },
  { manifest: "props/pine-river-wildflower-clump", kind: "bush", perSize: 1, share: 0, wind: 0.05, laneGapMin: 0, score: 7.5, provisional: true },
  { manifest: "props/pine-river-grass-tuft", kind: "bush", perSize: 1, share: 0, wind: 0.06, laneGapMin: 0, score: 8, provisional: true },
];

/** K12, the old bridge over the river on L2-cau (paths.ts keeps its box bridge as the fallback). */
export const BRIDGE_MODEL = { manifest: "props/pine-river-bridge-old", score: 10 } as const;

/** Manifest of the M0b models (public/assets/dragon-hold/models/m0b/, media on Drive). */
export const M0B_MANIFEST_URL = "/assets/dragon-hold/models/m0b/manifest.json";
/** Manifest of the Tripo round 3 map kit (public/assets/dragon-hold/models/kit3/, same preset; missing: those props are not drawn). */
export const KIT3_MANIFEST_URL = "/assets/dragon-hold/models/kit3/manifest.json";
