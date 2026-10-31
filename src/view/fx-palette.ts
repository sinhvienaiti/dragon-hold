/**
 * Colours and draw order shared by the combat effects (fx.ts) and their layers (vfx-layers.ts, skyfire.ts): one place,
 * so a layer file never imports fx.ts (which builds on them). 05 §2.2: semantic colours only for their meaning.
 * Owner: view-crowd-fx (LANES.md).
 */
import * as THREE from "three";

/** Hỏa Long's fire: peach orange; strong (Chớp, Hoàn hảo) heads are typing teal (05 §6). */
export const FX_COLORS = {
  fire: new THREE.Color("#ff9e6b"),
  fireHot: new THREE.Color("#ffd9a0"),
  fireDeep: new THREE.Color("#e8552a"),
  /**
   * The white-hot centre of the release flash. The grade's Neutral tone map keeps hues, so the peach fireHot never
   * reaches white however bright (28/10 capture: the plain flash read as a peach haze); this one does.
   */
  flashCore: new THREE.Color("#fff4e2"),
  /** The darkest of the fire ramp: the body under the release flash, so the white-hot core has a dark edge on the sunlit dais. */
  fireDark: new THREE.Color("#a8321a"),
  /** The middle of the word release's fire ball and of the gathering charge (the shader ramps it to red and a dark rim). */
  releaseBall: new THREE.Color("#ffb347"),
  chargeBall: new THREE.Color("#ff9a3c"),
  /** Steam where a word bolt lands on water (no scorch there). */
  steam: new THREE.Color("#d9d6cf"),
  teal: new THREE.Color("#7ff5e0"),
  ember: new THREE.Color("#ff7a32"),
  smoke: new THREE.Color("#5a5650"),
  /** Light grey smoke over a word hit: it reads on dusk grass, where soot does not. */
  ash: new THREE.Color("#8a847c"),
  /** Soot: the dark puffs of a word bolt's impact (§3.5 rule 4, dark behind the bright). */
  soot: new THREE.Color("#2e2723"),
  /** Round 7 (judge 6: the dark round a word hit read olive brown on grass): a neutral, slightly cool charcoal. */
  char: new THREE.Color("#222326"),
  /** Round 8: the Firefly smoke roll's colour, a cool mid charcoal (near black read as a hole; see-through it went olive on grass). */
  smokeCool: new THREE.Color("#4a4b50"),
  /** Round 9 (both judges: the smoke read as a navy-black hole or a ground shadow): a warm brown-grey charcoal. */
  smokeWarm: new THREE.Color("#7a7067"),
  /** Round 10: a warm light dust ring at the Sky Fire impact (the old khaki dust read olive on grass). */
  dustWarm: new THREE.Color("#c2b29c"),
  /** Round 9 (both judges: the release light washed the light dais salmon-pink): a saturated amber. */
  amber: new THREE.Color("#ffab4a"),
  dust: new THREE.Color("#a89272"),
  scorch: new THREE.Color("#2a2018"),
  wood: new THREE.Color("#8a6a45"),
  vine: new THREE.Color("#7fbf5a"),
  heal: new THREE.Color("#a6f0c0"),
  gold: new THREE.Color("#ffc83a"),
  white: new THREE.Color("#ffffff"),
  stun: new THREE.Color("#fff3b0"),
  mote: new THREE.Color("#e8f4d8"),
  /** HDR crack glow of a fresh word scorch (additive): gold cooling to red; it reads on dusk grass too. */
  crackHot: new THREE.Color("#ffa040").multiplyScalar(2.2),
  crackRed: new THREE.Color("#e8552a").multiplyScalar(1.6),
  /** HDR orange (above the 1.6 bloom threshold once stacked): the hot heart of Thiên Hỏa's mass and blast. */
  blastHot: new THREE.Color("#ffa040").multiplyScalar(1.8),
} as const;

/**
 * The foes' side (VFX step 3; VFX_STANDARD §3.6 rule 3: red is theirs): crimson and wine, a pale pink-white core,
 * never Hỏa Long's orange. Their flame shapes ramp through vxFoeRamp (vfx-layers.ts).
 */
export const FOE_COLORS = {
  /** A foe flame ball or slash (PUFF_FOE, PUFF_SLASH): its luma sets how hot it burns. */
  ball: new THREE.Color("#ff7c9c"),
  /** Additive glints, trails and motes (HDR through the flare intensity). */
  glint: new THREE.Color("#ff3d6a"),
  /** The pale core of a strike or impact flash. */
  core: new THREE.Color("#ffe6ee"),
  /** The dark layer under a foe's bright one. */
  soot: new THREE.Color("#2a1418"),
  /** An arrow's or sting's shaft (normal blend). */
  shaft: new THREE.Color("#3a2a22"),
  /** Stone chips off the dais. */
  chip: new THREE.Color("#b8ad96"),
  /** Claw scratches on the stone (the mark shader draws its own groove colours; this tints nothing). */
  scratch: new THREE.Color("#ffffff"),
  /** The ring a foe comes in through. */
  portal: new THREE.Color("#3a1430"),
} as const;

/**
 * Render order of the fire ribbons (bolts, Hỏa Long's wings): above the river surface (view/water.ts, 2), which
 * is transparent and writes no depth, so at an equal order it could be sorted after the fire and cover it.
 */
export const FX_RIBBON_ORDER = 4;
