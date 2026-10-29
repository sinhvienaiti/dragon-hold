// Source: new for the kit: the focus strip, the active word big near the eye line (owner 29/10; TYPING_FEEDBACK_REVIEW.md §7)
/**
 * The word being typed, big, at a configurable anchor of the game's overlay
 * (default the upper middle), its meaning under it. Each typed letter plays
 * the chosen style; a wrong key twitches the due letter; a finished word
 * pops the rim, squeezes away and sends its letters flying to the game's
 * target (the dragon, the tower, the ship).
 *
 * It follows the game's typing through TypingFxDriver (it is a sink) and
 * never decides what is right. Glyphs are spans in a fixed layout and move
 * only by transform and opacity; layout is read once a word. Particles live
 * on one small canvas behind the letters. Two word layers take turns, so a
 * new word can show while the last one leaves.
 */
import { injectTypingFxCss } from "./css";
import { DEFAULT_PALETTE, FxCanvas, mixHex, type TypingFxPalette, type TypingFxTextures } from "./draw";
import type { TypingFxSink } from "./driver";
import { comboParticles, comboSize, isMilestone, levelFor, PRIORITY, wordPriority, type IntensityLevel } from "./intensity";
import { ParticlePool, PK } from "./pool";
import { flyEase, newPose, popEnvelope, restPose, spawnWrongBeat, squeeze, STYLES, TONE, WRONG_MS, wrongPose, type GlyphPose, type SpawnCtx, type StyleRecipe, type WordCtx } from "./styles";
import { DEFAULT_TYPING_FX, stripCapPx, type TypingFxSettings } from "./settings";

export type FocusStripOptions = {
  /** The game's overlay (positioned); the strip and its flying letters live inside it. */
  root: HTMLElement;
  /** Top centre of the strip as fractions of the root (default 0.5, 0.2: upper middle, clear of a top HUD). */
  anchor?: { x: number; y: number };
  /** Which edge of the strip the anchor holds: "top" (default) or "bottom" (the strip grows upward from a line). */
  anchorEdge?: "top" | "bottom";
  /** A fixed font size at a 1080 px tall root, over the size setting's cap height (tests, special screens). */
  fontPx?: number;
  font?: string;
  weight?: number;
  palette?: Partial<TypingFxPalette>;
  settings?: Partial<TypingFxSettings>;
  /** Where finished letters fly, in root px; false: none (they rise and fade). */
  target?: (out: { x: number; y: number }) => boolean;
  /** A flying letter reached the target (`last`: the word's final one). */
  onArrive?: (index: number, last: boolean) => void;
  /** true / false, or "system" (default): follow prefers-reduced-motion. */
  reducedMotion?: boolean | "system";
  /** Run its own requestAnimationFrame loop (default true); false: the game calls update(now) each frame. */
  autoTick?: boolean;
  /** Extra classes on the plate (a game's own skin). */
  plateClass?: string;
  zIndex?: number;
  /** Letters per word layer (default 24; longer words are cut). */
  maxLetters?: number;
  /** ms before a new word shows while the last one leaves (default 110; a key on it shows it at once). */
  gapMs?: number;
  /** A clock (default performance.now): the Lab steps it for frame captures. */
  clock?: () => number;
  random?: () => number;
};

type Layer = {
  el: HTMLDivElement;
  row: HTMLDivElement;
  mean: HTMLDivElement;
  marker: HTMLSpanElement;
  glyph: HTMLSpanElement[];
  base: HTMLElement[];
  hot: HTMLElement[];
  ga: HTMLElement[];
  gb: HTMLElement[];
  text: string;
  len: number;
  /** Glyph centres, x in stage px (0 = the anchor), and the row's centre and baseline (stage y). */
  sx: Float32Array;
  rowY: number;
  baseY: number;
  width: number;
  height: number;
  rowW: number;
  /** 0 hidden, 1 live, 2 leaving, 3 waiting to show. */
  state: number;
  t0: number;
  typed: number;
  /** Per glyph: effect (0 none, 1 key, 2 wrong), its start, next particle phase, owner, needs a reset. */
  fx: Uint8Array;
  fxAt: Float64Array;
  fxPhase: Uint8Array;
  fxOwner: Int32Array;
  dirty: Uint8Array;
  /** The word's release level (PRIORITY) while leaving. */
  release: number;
  /** Letters shown as "_" (bit i: letter i), the game's missing-letter rule. */
  mask: number;
  /** Light spilled onto each letter by a neighbour's key: when, and how bright (0 … 1). */
  litAt: Float64Array;
  lit: Float32Array;
};

const MASK_CHAR = "_";

const FLY_TRAIL_LAG = 0.06;
/** Share of a flight spent lifting off the word before the dive. */
const FLY_LIFT = 0.26;

export class FocusStrip implements TypingFxSink {
  readonly el: HTMLDivElement;
  readonly pool: ParticlePool;
  private readonly root: HTMLElement;
  private readonly doc: Document;
  private readonly stage: HTMLDivElement;
  private readonly plate: HTMLDivElement;
  private readonly rim: HTMLDivElement;
  private readonly warnEl: HTMLDivElement;
  private readonly flashEl: HTMLDivElement;
  private readonly badge: HTMLDivElement;
  private readonly flyLayer: HTMLDivElement;
  private readonly canvasEl: HTMLCanvasElement;
  private readonly fx: FxCanvas;
  private readonly layers: [Layer, Layer];
  private live: Layer | null = null;
  private readonly max: number;
  private readonly gap: number;
  private readonly clock: () => number;
  private readonly random: () => number;
  private readonly ctx: SpawnCtx;
  private readonly pose: GlyphPose = newPose();
  private settings: TypingFxSettings = { ...DEFAULT_TYPING_FX };
  private recipe: StyleRecipe = STYLES.stamp;
  private level: IntensityLevel;
  private reducedPref: boolean | "system";
  private reduced = false;
  private media: MediaQueryList | null = null;
  private palette: TypingFxPalette = { ...DEFAULT_PALETTE };
  private anchor = { x: 0.5, y: 0.2 };
  /** A pixel anchor set by the game (root px), over the fractional one. */
  private anchorPx: { x: number; y: number } | null = null;
  private anchorEdge: "top" | "bottom" = "top";
  /** The strip's top centre in root px, as placed now (flying letters start from it). */
  private originX = 0;
  private originY = 0;
  private capRatio = 0;
  private fontPx: number | null;
  private size = 52;
  private rootW = 0;
  private rootH = 0;
  private canvasW = 0;
  private canvasH = 0;
  private serial = 0;
  private lastKeyOwner = -1;
  private combo = 0;
  private rimAt = -1e9;
  private rimLevel = 0;
  private warnAt = -1e9;
  private badgeAt = -1e9;
  private plateAlpha = -1;
  private frame = 0;
  private observer: ResizeObserver | null = null;
  // Flying letters: a fixed pool of spans (each letter: one head and up to two trail copies).
  private readonly flyEl: HTMLSpanElement[] = [];
  private readonly flyAt: Float64Array;
  private readonly flyDur: Float32Array;
  private readonly flyFrom: Float32Array;
  private readonly flyLift: Float32Array;
  private readonly flyCtl2: Float32Array;
  private readonly flyCtl: Float32Array;
  private readonly flyTo: Float32Array;
  private readonly flyLag: Float32Array;
  private readonly flyIndex: Int16Array;
  private readonly flyFlags: Uint8Array; // 1 live, 2 arrived (head), 4 last letter, 8 head, 32 has a target
  private flyCursor = 0;
  private readonly hitEl: HTMLSpanElement[] = [];
  private readonly hitAt: Float64Array;
  private readonly hitXY: Float32Array;
  private readonly targetPt = { x: 0, y: 0 };
  /** Counts for the Lab's readouts. */
  readonly stats = { keys: 0, wrongs: 0, words: 0, flyers: 0, maxParticles: 0 };

  constructor(private readonly options: FocusStripOptions) {
    this.root = options.root;
    this.doc = options.root.ownerDocument;
    injectTypingFxCss(this.doc);
    this.max = Math.max(4, Math.min(48, options.maxLetters ?? 24));
    this.gap = options.gapMs ?? 110;
    this.clock = options.clock ?? (() => performance.now());
    this.random = options.random ?? Math.random;
    this.fontPx = options.fontPx ?? null;
    if (options.anchor) this.anchor = { ...options.anchor };
    this.anchorEdge = options.anchorEdge ?? "top";
    this.reducedPref = options.reducedMotion ?? "system";
    this.pool = new ParticlePool(400);
    this.level = levelFor("normal", false);

    const div = (cls: string, parent: HTMLElement): HTMLDivElement => {
      const el = this.doc.createElement("div");
      el.className = cls;
      parent.appendChild(el);
      return el;
    };
    this.el = div("tfx", this.root);
    this.el.setAttribute("aria-hidden", "true");
    if (options.zIndex !== undefined) this.el.style.setProperty("--tfx-z", String(options.zIndex));
    this.stage = div("tfx-stage", this.el);
    this.plate = div("tfx-plate" + (options.plateClass ? " " + options.plateClass : ""), this.stage);
    // Dragonhold's word tags keep off [data-dh-avoid] boxes: the plate is the strip's box.
    this.plate.setAttribute("data-dh-avoid", "");
    this.flashEl = div("tfx-flash", this.plate);
    this.rim = div("tfx-rim", this.plate);
    this.warnEl = div("tfx-warn", this.plate);
    this.canvasEl = this.doc.createElement("canvas");
    this.canvasEl.className = "tfx-canvas";
    this.stage.appendChild(this.canvasEl);
    this.fx = new FxCanvas(this.canvasEl);
    this.layers = [this.makeLayer(), this.makeLayer()];
    this.badge = div("tfx-badge", this.stage);
    // Under the strip: a letter diving to a target below passes behind the plate, never over the next word.
    this.flyLayer = this.doc.createElement("div");
    this.flyLayer.className = "tfx-fly";
    this.root.insertBefore(this.flyLayer, this.el);

    const flyCount = this.max * 3;
    this.flyAt = new Float64Array(flyCount);
    this.flyDur = new Float32Array(flyCount);
    this.flyFrom = new Float32Array(flyCount * 2);
    this.flyLift = new Float32Array(flyCount * 2);
    this.flyCtl2 = new Float32Array(flyCount * 2);
    this.flyCtl = new Float32Array(flyCount * 2);
    this.flyTo = new Float32Array(flyCount * 2);
    this.flyLag = new Float32Array(flyCount);
    this.flyIndex = new Int16Array(flyCount);
    this.flyFlags = new Uint8Array(flyCount);
    for (let i = 0; i < flyCount; i += 1) {
      const span = this.doc.createElement("span");
      span.className = "tfx-f";
      this.flyLayer.appendChild(span);
      this.flyEl.push(span);
    }
    this.hitAt = new Float64Array(3).fill(-1e9);
    this.hitXY = new Float32Array(6);
    for (let i = 0; i < 3; i += 1) {
      const span = this.doc.createElement("span");
      span.className = "tfx-hit";
      this.flyLayer.appendChild(span);
      this.hitEl.push(span);
    }

    this.ctx = { pool: this.pool, owner: 0, prio: 1, x: 0, y: 0, h: 52, glyph: 0, now: 0, mult: 1, size: 1, still: false, random: this.random, light: this.lightNeighbour, key: 0 };
    this.setFont(options.font ?? '"Be Vietnam Pro", "Segoe UI", system-ui, sans-serif', options.weight ?? 800);
    this.setPalette(options.palette ?? {});
    if (this.reducedPref === "system" && typeof matchMedia === "function") {
      this.media = matchMedia("(prefers-reduced-motion: reduce)");
      this.media.addEventListener("change", this.onMotion);
    }
    this.configure(options.settings ?? {});
    if (typeof ResizeObserver === "function") {
      this.observer = new ResizeObserver(() => this.layout());
      this.observer.observe(this.root);
    }
    this.layout();
    if (options.autoTick !== false) this.frame = requestAnimationFrame(this.tick);
  }

  private readonly onMotion = (): void => this.configure({});

  /** The glyph a spawn is aimed at (layer and index), for a style's light on its neighbours. */
  private aimLayer: Layer | null = null;
  private aimIndex = 0;
  private aimNow = 0;

  /** A style's light spilling onto the letter `offset` places away (SpawnCtx.light). */
  private readonly lightNeighbour = (offset: number, amount: number): void => {
    const layer = this.aimLayer;
    if (layer === null) return;
    const i = this.aimIndex + offset;
    if (i < 0 || i >= layer.len) return;
    layer.litAt[i] = this.aimNow;
    layer.lit[i] = Math.max(0, Math.min(1, amount));
    layer.dirty[i] = 1;
  };

  /** A game theme's painted sprites (Codex packs 173–175: glyph-spark, ink-splash, seal-stamp, ember); {}: procedural. */
  setTextures(textures: TypingFxTextures): void {
    this.fx.setTextures(textures);
  }

  private readonly tick = (): void => {
    this.update(this.clock());
    this.frame = requestAnimationFrame(this.tick);
  };

  private makeLayer(): Layer {
    const el = this.doc.createElement("div");
    el.className = "tfx-layer";
    const row = this.doc.createElement("div");
    row.className = "tfx-row";
    el.appendChild(row);
    const mean = this.doc.createElement("div");
    mean.className = "tfx-mean";
    el.appendChild(mean);
    const layer: Layer = {
      el, row, mean, marker: this.doc.createElement("span"), glyph: [], base: [], hot: [], ga: [], gb: [],
      text: "", len: 0, sx: new Float32Array(this.max), rowY: 0, baseY: 0, width: 0, height: 0, rowW: 0,
      state: 0, t0: 0, typed: 0,
      fx: new Uint8Array(this.max), fxAt: new Float64Array(this.max), fxPhase: new Uint8Array(this.max), fxOwner: new Int32Array(this.max), dirty: new Uint8Array(this.max),
      release: 0, mask: 0, litAt: new Float64Array(this.max).fill(-1e9), lit: new Float32Array(this.max),
    };
    for (let i = 0; i < this.max; i += 1) {
      const g = this.doc.createElement("span");
      g.className = "tfx-g";
      g.style.display = "none";
      const part = (cls: string): HTMLElement => {
        const b = this.doc.createElement("b");
        b.className = cls;
        g.appendChild(b);
        return b;
      };
      layer.base.push(part("tfx-c"));
      layer.hot.push(part("tfx-h"));
      layer.ga.push(part("tfx-a"));
      layer.gb.push(part("tfx-b"));
      layer.glyph.push(g);
      row.appendChild(g);
    }
    layer.marker.style.cssText = "display:inline-block;width:0;height:0;vertical-align:baseline";
    row.appendChild(layer.marker);
    this.stage.appendChild(el);
    return layer;
  }

  // ── Settings ───────────────────────────────────────────────────────────

  /** Style, intensity (and the sound fields, kept for the game's save). Reduced motion follows the option. */
  configure(settings: Partial<TypingFxSettings>): void {
    const resize = settings.size !== undefined && settings.size !== this.settings.size;
    this.settings = { ...this.settings, ...settings };
    this.recipe = STYLES[this.settings.style] ?? STYLES.stamp;
    this.reduced = this.reducedPref === "system" ? this.media?.matches === true : this.reducedPref;
    this.level = levelFor(this.settings.intensity, this.reduced);
    this.pool.cap = this.level.cap;
    this.ctx.still = this.reduced;
    this.el.className = "tfx tfx--" + this.recipe.id + (this.recipe.ghost === "hot" ? " tfx--ghost-hot" : "") + (this.reduced ? " tfx--still" : "");
    const [clipA, clipB] = this.recipe.clip ?? ["", ""];
    for (const layer of this.layers) {
      for (let i = 0; i < this.max; i += 1) {
        layer.ga[i]!.style.clipPath = clipA;
        layer.gb[i]!.style.clipPath = clipB;
        layer.fx[i] = 0;
        layer.dirty[i] = 1;
      }
    }
    this.vars("--tfx-typed", this.typedColor());
    if (resize && this.rootH > 0) this.layout();
  }

  get current(): Readonly<TypingFxSettings> {
    return this.settings;
  }

  get reducedMotion(): boolean {
    return this.reduced;
  }

  setReducedMotion(value: boolean | "system"): void {
    this.reducedPref = value;
    if (value === "system" && this.media === null && typeof matchMedia === "function") {
      this.media = matchMedia("(prefers-reduced-motion: reduce)");
      this.media.addEventListener("change", this.onMotion);
    }
    this.configure({});
  }

  setPalette(palette: Partial<TypingFxPalette>): void {
    this.palette = { ...this.palette, ...palette };
    const p = this.palette;
    this.vars("--tfx-accent", p.accent);
    this.vars("--tfx-hot", p.hot);
    this.vars("--tfx-ink", p.ink);
    this.vars("--tfx-warn", p.warn);
    this.vars("--tfx-gold", p.gold);
    this.vars("--tfx-pending", p.pending);
    this.vars("--tfx-meaning", p.meaning);
    this.vars("--tfx-ghost", mixHex(p.accent, "#ffffff", 0.62));
    this.vars("--tfx-typed", this.typedColor());
    this.fx.setPalette(p);
  }

  /** The strip and its flying letters (a sibling in the root) share the variables. */
  private vars(name: string, value: string): void {
    this.el.style.setProperty(name, value);
    this.flyLayer.style.setProperty(name, value);
  }

  private typedColor(): string {
    const p = this.palette;
    return this.recipe?.id === "stamp" ? mixHex(p.accent, "#ffffff", 0.35) : p.accent;
  }

  setFont(family: string, weight = 800): void {
    this.vars("--tfx-font", family);
    this.vars("--tfx-weight", String(weight));
  }

  setAnchor(x: number, y: number): void {
    this.anchor = { x, y };
    this.anchorPx = null;
    this.layout();
  }

  /** Anchors the strip at (x, y) root px; `edge` "bottom" keeps its bottom on that line (it grows upward). */
  setAnchorPx(x: number, y: number, edge: "top" | "bottom" = this.anchorEdge): void {
    const moved = this.anchorPx === null || this.anchorPx.x !== x || this.anchorPx.y !== y || edge !== this.anchorEdge;
    this.anchorPx = { x, y };
    this.anchorEdge = edge;
    if (moved) this.place();
  }

  /** The word's font size now (px). */
  get fontSize(): number {
    return this.size;
  }

  /** Cap height over font size of the strip's font (measured once a layout; 0.7 when it cannot be). */
  private measureCap(): number {
    try {
      const canvas = this.doc.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (ctx === null) return 0.7;
      ctx.font = `${this.weight()} 100px ${this.family()}`;
      const ascent = ctx.measureText("H").actualBoundingBoxAscent;
      return ascent > 40 && ascent < 95 ? ascent / 100 : 0.7;
    } catch {
      return 0.7;
    }
  }

  /** Puts the strip's top centre where the anchor says (once a layout, a word, or an anchor move). */
  private place(): void {
    const x = this.anchorPx !== null ? this.anchorPx.x : this.anchor.x * this.rootW;
    const y = this.anchorPx !== null ? this.anchorPx.y : this.anchor.y * this.rootH;
    const top = this.anchorEdge === "bottom" ? y - this.plateH + this.size * 0.06 : y;
    if (x === this.originX && top === this.originY) return;
    this.originX = x;
    this.originY = top;
    this.el.style.left = x + "px";
    this.el.style.top = top + "px";
  }

  /** The game's word chain (escalates key effects); complete() sets it too. */
  setCombo(combo: number): void {
    this.combo = Math.max(0, combo | 0);
  }

  // ── Layout (once a word, and on resize) ───────────────────────────────

  layout(): void {
    this.rootW = this.root.clientWidth;
    this.rootH = this.root.clientHeight;
    this.capRatio = this.measureCap();
    const height = this.rootH || 1080;
    const font = this.fontPx !== null ? (this.fontPx * height) / 1080 : stripCapPx(this.settings.size, height) / this.capRatio;
    this.size = Math.max(24, Math.min(150, Math.round(font)));
    this.ctx.h = this.size;
    this.vars("--tfx-size", this.size + "px");
    const canvasW = Math.min(Math.max(this.rootW, 320), this.size * 24);
    const canvasH = this.size * 4.6;
    if (canvasW !== this.canvasW || canvasH !== this.canvasH) {
      this.canvasW = canvasW;
      this.canvasH = canvasH;
      this.fx.resize(canvasW, canvasH, typeof devicePixelRatio === "number" ? devicePixelRatio : 1);
    }
    for (const layer of this.layers) if (layer.len > 0) this.measure(layer);
    const live = this.live ?? this.layers.find((layer) => layer.state === 2) ?? null;
    if (live !== null) this.fitPlate(live);
    this.place();
  }

  private measure(layer: Layer): void {
    layer.width = layer.el.offsetWidth;
    layer.height = layer.el.offsetHeight;
    layer.rowW = layer.row.offsetWidth;
    const rowLeft = layer.row.offsetLeft - layer.width / 2;
    layer.rowY = layer.row.offsetTop + layer.row.offsetHeight / 2;
    layer.baseY = layer.row.offsetTop + layer.marker.offsetTop;
    for (let i = 0; i < layer.len; i += 1) {
      const g = layer.glyph[i]!;
      layer.sx[i] = rowLeft + g.offsetLeft + g.offsetWidth / 2;
    }
    // The canvas centres on the row; its own coordinates for the trace.
    this.canvasEl.style.transform = `translate(${-this.canvasW / 2}px, ${layer.rowY - this.canvasH / 2}px)`;
    const xs = this.scratchX(layer);
    this.fx.setGlyphs(this.layers.indexOf(layer), layer.text, xs, layer.baseY - layer.rowY + this.canvasH / 2, `${this.weight()} ${this.size}px ${this.family()}`);
  }

  private scratch = new Float32Array(48);
  private scratchX(layer: Layer): Float32Array {
    for (let i = 0; i < layer.len; i += 1) this.scratch[i] = layer.sx[i]! + this.canvasW / 2;
    return this.scratch.subarray(0, Math.max(1, layer.len));
  }

  private family(): string {
    return this.el.style.getPropertyValue("--tfx-font") || "sans-serif";
  }

  private weight(): string {
    return this.el.style.getPropertyValue("--tfx-weight") || "800";
  }

  private plateW = 1;
  private plateH = 1;

  private fitPlate(layer: Layer): void {
    const padX = this.size * 0.16;
    const padY = this.size * 0.06;
    this.plateW = layer.width + padX * 2;
    this.plateH = layer.height + padY * 2;
    this.plate.style.width = this.plateW + "px";
    this.plate.style.height = this.plateH + "px";
    this.plate.style.transform = `translate(${-layer.width / 2 - padX}px, ${-padY}px)`;
    if (this.anchorEdge === "bottom") this.place();
    this.badge.style.transform = `translate(${layer.width / 2 - this.size * 0.2}px, ${-this.size * 0.62}px)`;
  }

  // ── The sink: what the driver calls ───────────────────────────────────

  /**
   * A new active word. `mask`: bit i set hides letter i as "_" until it is
   * typed or revealed (a game's missing-letter rule; the strip never decides it).
   */
  setWord(text: string, meaning: string, typed = 0, now: number = this.clock(), mask = 0): void {
    const word = text.slice(0, this.max);
    const busy = this.live;
    // The other layer than the live one; else a hidden one; else the one that started leaving first.
    const [a, b] = this.layers;
    const layer = busy === a ? b : busy === b ? a : a.state === 0 ? a : b.state === 0 ? b : a.t0 <= b.t0 ? a : b;
    // A switch to another word: the old one just fades.
    if (busy !== null && busy !== layer) this.leave(busy, now, -1);
    if (layer.state !== 0) this.hide(layer);
    layer.text = word;
    layer.len = word.length;
    layer.mask = mask & ~((1 << Math.max(0, typed)) - 1);
    for (let i = 0; i < this.max; i += 1) {
      const g = layer.glyph[i]!;
      if (i < layer.len) {
        this.writeChar(layer, i, (layer.mask & (1 << i)) !== 0 ? MASK_CHAR : word[i]!);
        g.style.display = "";
        g.className = "tfx-g" + (i < typed ? " is-typed" : i === typed ? " is-due" : "");
      } else if (g.style.display !== "none") g.style.display = "none";
      layer.fx[i] = 0;
      layer.dirty[i] = 1;
    }
    layer.mean.textContent = meaning;
    layer.typed = Math.max(0, Math.min(typed, layer.len));
    layer.release = 0;
    layer.el.style.transform = "translateX(-50%)";
    layer.el.style.opacity = "";
    this.measure(layer);
    this.live = layer;
    const leaving = this.layers[0] === layer ? this.layers[1] : this.layers[0];
    if (leaving.state === 2 && leaving.release >= 0 && now - leaving.t0 < this.gap) {
      layer.state = 3;
      layer.t0 = leaving.t0 + this.gap;
    } else this.show(layer, now);
  }

  private show(layer: Layer, now: number): void {
    const other = this.layers[0] === layer ? this.layers[1] : this.layers[0];
    if (other.state === 2) this.hide(other);
    layer.state = 1;
    layer.t0 = now;
    layer.el.classList.add("is-on");
    this.fitPlate(layer);
  }

  private hide(layer: Layer): void {
    layer.state = 0;
    layer.el.classList.remove("is-on");
    layer.el.style.transform = "translateX(-50%)";
    layer.el.style.opacity = "";
    for (let i = 0; i < layer.len; i += 1) {
      layer.fx[i] = 0;
      this.writeRest(layer, i);
    }
  }

  key(index: number, now: number = this.clock()): void {
    const layer = this.live;
    if (layer === null || index < 0 || index >= layer.len) return;
    if (layer.state === 3) this.show(layer, now);
    this.stats.keys += 1;
    if ((layer.mask & (1 << index)) !== 0) this.unmask(layer, layer.mask & ~(1 << index));
    const g = layer.glyph[index]!;
    g.className = "tfx-g is-typed";
    const next = layer.glyph[index + 1];
    if (index + 1 < layer.len && next !== undefined) next.className = "tfx-g is-due";
    layer.typed = Math.max(layer.typed, index + 1);
    if (!this.level.fx) return;
    this.serial += 1;
    layer.fx[index] = 1;
    layer.fxAt[index] = now;
    layer.fxPhase[index] = 0;
    layer.fxOwner[index] = this.serial;
    this.lastKeyOwner = this.serial;
    // Frame 0 now: the pose before the next paint, the particles that start at 0 ms.
    this.animateGlyph(layer, index, now);
  }

  /** A wrong key while the letter at `index` was due; `key`: what the player typed (it drops away under the row). */
  wrong(index: number, now: number = this.clock(), key = ""): void {
    const layer = this.live;
    if (layer === null || index < 0 || index >= layer.len) return;
    if (layer.state === 3) this.show(layer, now);
    this.stats.wrongs += 1;
    layer.glyph[index]!.className = "tfx-g is-due is-miss";
    this.warnAt = now;
    if (!this.level.fx) return;
    this.serial += 1;
    layer.fx[index] = 2;
    layer.fxAt[index] = now;
    layer.fxOwner[index] = this.serial;
    this.animateGlyph(layer, index, now);
    if (this.level.particles > 0) {
      this.aim(layer, index, now, this.serial, PRIORITY.key);
      this.ctx.key = key.length > 0 ? key.charCodeAt(0) : 0;
      this.recipe.spawnWrong(this.ctx);
      spawnWrongBeat(this.ctx);
      this.ctx.key = 0;
    }
  }

  /** The game's hidden letters now (a wrong key may reveal one): cleared bits show their letter. */
  mask(hidden: number, now: number = this.clock()): void {
    const layer = this.live;
    void now;
    if (layer !== null && (layer.mask & ~hidden) !== 0) this.unmask(layer, layer.mask & hidden);
  }

  private writeChar(layer: Layer, i: number, ch: string): void {
    layer.base[i]!.textContent = ch;
    layer.hot[i]!.textContent = ch;
    layer.ga[i]!.textContent = ch;
    layer.gb[i]!.textContent = ch;
  }

  /** Shows the real letters of bits leaving the mask, then measures again (a letter is wider than "_"). */
  private unmask(layer: Layer, next: number): void {
    const gone = layer.mask & ~next;
    layer.mask = next;
    for (let i = 0; i < layer.len; i += 1) if ((gone & (1 << i)) !== 0) this.writeChar(layer, i, layer.text[i]!);
    this.measure(layer);
    if (this.live === layer) this.fitPlate(layer);
  }

  /** Bottom centre of letter `index` of the shown word (root px): where a game's own key effect may leave from. */
  glyphPoint(index: number, out: { x: number; y: number }): boolean {
    const layer = this.live ?? (this.layers[0].state === 2 ? this.layers[0] : this.layers[1].state === 2 ? this.layers[1] : null);
    if (layer === null || index < 0 || index >= layer.len) return false;
    out.x = this.originX + layer.sx[index]!;
    out.y = this.originY + layer.rowY + this.size * 0.5;
    return true;
  }

  /** The plate's box now (root px), for a game's keep-out zones (damage numbers never cover the word). */
  rect(): { x: number; y: number; w: number; h: number } {
    const padY = this.size * 0.06;
    return { x: this.originX - this.plateW / 2, y: this.originY - padY, w: this.plateW, h: this.plateH };
  }

  stray(now: number = this.clock()): void {
    this.warnAt = now;
  }

  back(typed: number, now: number = this.clock()): void {
    const layer = this.live;
    if (layer === null) return;
    const keep = Math.max(0, Math.min(typed, layer.len));
    for (let i = keep; i < layer.len; i += 1) {
      layer.glyph[i]!.className = "tfx-g" + (i === keep ? " is-due" : "");
      layer.fx[i] = 0;
      this.writeRest(layer, i);
    }
    layer.typed = keep;
    if (keep === 0) this.leave(layer, now, -1);
  }

  complete(perfect: boolean, combo: number, now: number = this.clock()): void {
    const layer = this.live;
    if (layer === null) return;
    this.stats.words += 1;
    this.combo = Math.max(0, combo | 0);
    const prio = wordPriority(perfect, combo);
    // The word effect replaces the last letter's particles (no double burst).
    if (this.lastKeyOwner >= 0) this.pool.killOwner(this.lastKeyOwner);
    for (let i = 0; i < layer.len; i += 1) layer.glyph[i]!.className = "tfx-g is-typed";
    if (!this.level.fx) {
      this.hide(layer);
      this.live = null;
      return;
    }
    this.rimAt = now;
    this.rimLevel = prio;
    this.rim.classList.toggle("is-gold", prio >= PRIORITY.perfect);
    if (prio === PRIORITY.milestone) {
      this.badge.textContent = combo + " COMBO";
      this.badgeAt = now;
    }
    if (this.level.particles > 0) this.spawnWord(layer, prio, now);
    if (this.level.fly) this.launch(layer, prio, now);
    this.leave(layer, now, prio);
  }

  clear(now: number = this.clock()): void {
    if (this.live !== null) this.leave(this.live, now, -1);
  }

  private leave(layer: Layer, now: number, prio: number): void {
    if (this.live === layer) this.live = null;
    if (layer.state === 0) return;
    if (layer.state === 3) return this.hide(layer);
    // Dropped unfinished: a short fade, no release.
    layer.release = prio < 0 || !this.level.fx ? -1 : prio;
    layer.state = 2;
    layer.t0 = now;
    for (let i = 0; i < layer.len; i += 1) {
      layer.fx[i] = 0;
      layer.dirty[i] = 1;
    }
  }

  // ── Effects ────────────────────────────────────────────────────────────

  /** Points the spawn context at glyph `index` of `layer`. */
  private aim(layer: Layer, index: number, now: number, owner: number, prio: number): void {
    const c = this.ctx;
    c.x = layer.sx[index]! + this.canvasW / 2;
    c.y = this.canvasH / 2;
    c.h = this.size;
    c.glyph = (layer === this.layers[1] ? 64 : 0) + index;
    c.now = now;
    c.owner = owner;
    c.prio = prio;
    c.mult = this.level.particles * comboParticles(this.combo);
    c.size = comboSize(this.combo);
    this.aimLayer = layer;
    this.aimIndex = index;
    this.aimNow = now;
  }

  private word: WordCtx | null = null;

  private spawnWord(layer: Layer, prio: number, now: number): void {
    const pool = this.pool;
    const gold = prio >= PRIORITY.perfect;
    const h = this.size;
    const cx = this.canvasW / 2;
    const cy = this.canvasH / 2;
    this.serial += 1;
    const owner = this.serial;
    const w = (this.word ??= { pool, owner: 0, prio: 0, gold: false, cx: 0, cy: 0, rowW: 0, h: 0, len: 0, sx: layer.sx, now: 0, mult: 1, still: false, random: this.random });
    w.owner = owner;
    w.prio = prio;
    w.gold = gold;
    w.cx = cx;
    w.cy = cy;
    w.rowW = layer.rowW;
    w.h = h;
    w.len = layer.len;
    w.sx = layer.sx;
    w.now = now;
    w.mult = this.level.particles;
    w.still = this.reduced;
    this.recipe.spawnRelease(w);
    const shock = pool.spawn(PK.shock, owner, prio, cx, cy, now, prio === PRIORITY.milestone ? 320 : 240);
    if (shock >= 0) {
      pool.tone[shock] = gold ? TONE.gold : TONE.hot;
      pool.size[shock] = layer.rowW / 2 + 0.3 * h;
      pool.size2[shock] = 0.78 * h;
      pool.rot[shock] = (prio === PRIORITY.milestone ? 0.11 : 0.075) * h;
      pool.aux[shock] = prio === PRIORITY.milestone ? 0.42 : prio === PRIORITY.perfect ? 0.26 : 0.18;
    }
    if (prio === PRIORITY.milestone || this.level.shock) {
      const ring = pool.spawn(PK.ring, owner, prio, cx, cy, now, 340);
      if (ring >= 0) {
        pool.tone[ring] = gold ? TONE.gold : TONE.light;
        pool.size[ring] = layer.rowW / 2;
        pool.size2[ring] = this.reduced ? layer.rowW / 2 : layer.rowW / 2 + 1.5 * h;
        pool.aux[ring] = 0.09 * h;
      }
    }
    const per = (prio === PRIORITY.milestone ? 4 : prio === PRIORITY.perfect ? 3 : 2) * this.level.particles;
    const total = Math.min(prio === PRIORITY.milestone ? 32 : 24, Math.round(per * layer.len));
    for (let k = 0; k < total; k += 1) {
      const index = k % layer.len;
      const i = pool.spawn(PK.spark, owner, prio, layer.sx[index]! + cx, cy, now, 200 + this.random() * 120);
      if (i < 0) break;
      pool.tone[i] = gold ? (k % 2 === 0 ? TONE.gold : TONE.hot) : k % 2 === 0 ? TONE.accent : TONE.hot;
      pool.aux[i] = 0.4 * h;
      pool.size[i] = 0.07 * h;
      const a = ((-90 + (this.random() * 2 - 1) * 70) * Math.PI) / 180;
      if (this.reduced) pool.rot[i] = a;
      else {
        const speed = (18 + this.random() * 14) * h;
        pool.vx[i] = Math.cos(a) * speed;
        pool.vy[i] = Math.sin(a) * speed;
        pool.drag[i] = 8;
      }
    }
  }

  /** Sends the word's letters to the target: a curved flight, slow start, fast arrival; trails behind. */
  private launch(layer: Layer, prio: number, now: number): void {
    const has = this.options.target?.(this.targetPt) ?? false;
    const ax = this.originX;
    const ay = this.originY;
    const trails = this.level.trails;
    const gold = prio >= PRIORITY.perfect;
    // Slots round-robin: a word in flight keeps flying while the next one launches.
    const slots = this.flyEl.length;
    let used = 0;
    for (let i = 0; i < layer.len; i += 1) {
      const x0 = ax + layer.sx[i]!;
      const y0 = ay + layer.rowY;
      const x1 = has ? this.targetPt.x : x0;
      const y1 = has ? this.targetPt.y : y0 - this.size * 2.2;
      // Lift: up and fanned out off the word (first quarter). Then a dive round the plate on the
      // letter's own side (never across the next word), converging on the target.
      const side = (i - (layer.len - 1) / 2) / Math.max(1, (layer.len - 1) / 2);
      const s = side > 0.01 ? 1 : side < -0.01 ? -1 : i % 2 === 0 ? -1 : 1;
      const lx = x0 + side * this.size * 0.9;
      const ly = y0 - this.size * 1.45;
      const around = this.plateW / 2 + this.size * (0.9 + 0.5 * Math.abs(side));
      const c1x = ax + s * around * 1.3;
      const c1y = ly - this.size * 0.3;
      const c2x = ax + s * around * 1.2;
      const c2y = ay + this.plateH + this.size * 0.9;
      const dist = Math.hypot(c1x - lx, c1y - ly) + Math.hypot(c2x - c1x, c2y - c1y) + Math.hypot(x1 - c2x, y1 - c2y);
      const start = now + 24 + i * 12;
      const dur = Math.max(420, Math.min(700, 300 + dist * 0.28));
      for (let k = 0; k <= trails; k += 1) {
        if (used >= slots) break;
        const slot = this.flyCursor;
        this.flyCursor = (this.flyCursor + 1) % slots;
        used += 1;
        this.flyAt[slot] = start;
        this.flyDur[slot] = dur;
        this.flyFrom[slot * 2] = x0;
        this.flyFrom[slot * 2 + 1] = y0;
        this.flyLift[slot * 2] = lx;
        this.flyLift[slot * 2 + 1] = ly;
        this.flyCtl[slot * 2] = c1x;
        this.flyCtl[slot * 2 + 1] = c1y;
        this.flyCtl2[slot * 2] = c2x;
        this.flyCtl2[slot * 2 + 1] = c2y;
        this.flyTo[slot * 2] = x1;
        this.flyTo[slot * 2 + 1] = y1;
        this.flyLag[slot] = k * FLY_TRAIL_LAG;
        this.flyIndex[slot] = i;
        this.flyFlags[slot] = 1 | (k === 0 ? 8 : 0) | (i === layer.len - 1 ? 4 : 0) | (has ? 32 : 0);
        const span = this.flyEl[slot]!;
        span.textContent = layer.text[i]!;
        span.className = gold ? "tfx-f is-gold" : "tfx-f";
        span.style.display = "none";
      }
    }
    this.stats.flyers += layer.len;
  }

  private endFly(slot: number): void {
    this.flyFlags[slot] = 0;
    this.flyEl[slot]!.style.display = "none";
  }

  // ── The frame ──────────────────────────────────────────────────────────

  /**
   * Drops every effect in flight (particles, flying letters, pops); the words stay. For a clock that
   * jumps back (a new run, the Lab's stepped captures); update() does it on its own past a 1 s jump.
   */
  reset(): void {
    this.pool.clear();
    for (let slot = 0; slot < this.flyFlags.length; slot += 1) if (this.flyFlags[slot]! & 1) this.endFly(slot);
    this.hitAt.fill(-1e9);
    this.rimAt = this.warnAt = this.badgeAt = -1e9;
    this.lastKeyOwner = -1;
    for (const layer of this.layers) {
      if (layer.state === 2) this.hide(layer);
      for (let i = 0; i < layer.len; i += 1) {
        layer.fx[i] = 0;
        layer.dirty[i] = 1;
      }
    }
  }

  private lastNow = -Infinity;

  update(now: number = this.clock()): void {
    if (now < this.lastNow - 1000) this.reset();
    this.lastNow = now;
    for (const layer of this.layers) {
      if (layer.state === 3 && now >= layer.t0) this.show(layer, now);
      if (layer.state === 1) {
        for (let i = 0; i < layer.len; i += 1) if (layer.fx[i] !== 0 || layer.dirty[i] !== 0) this.animateGlyph(layer, i, now);
      } else if (layer.state === 2) this.animateLeave(layer, now);
    }
    this.animatePlate(now);
    this.animateFly(now);
    this.pool.expire(now);
    this.stats.maxParticles = Math.max(this.stats.maxParticles, this.pool.count);
    this.fx.draw(this.pool, now, this.reduced);
  }

  private animateGlyph(layer: Layer, i: number, now: number): void {
    const kind = layer.fx[i]!;
    const age = now - layer.fxAt[i]!;
    const m = this.level.motion;
    if (kind === 1) {
      const recipe = this.recipe;
      if (this.level.particles > 0) {
        const phases = recipe.phases;
        while (layer.fxPhase[i]! < phases.length && age >= phases[layer.fxPhase[i]!]!) {
          this.aim(layer, i, layer.fxAt[i]! + phases[layer.fxPhase[i]!]!, layer.fxOwner[i]!, PRIORITY.key);
          recipe.spawnKey(layer.fxPhase[i]!, this.ctx);
          layer.fxPhase[i] = layer.fxPhase[i]! + 1;
        }
      }
      if (age >= recipe.keyMs) {
        layer.fx[i] = 0;
        this.writeRest(layer, i);
        return;
      }
      this.writePose(layer, i, recipe.keyPose(age, m, this.pose));
      return;
    }
    if (kind === 2) {
      if (age >= WRONG_MS) {
        layer.fx[i] = 0;
        this.writeRest(layer, i);
        return;
      }
      this.writePose(layer, i, wrongPose(age, m, this.pose));
      return;
    }
    // At rest: a neighbour's spilled light, else one reset after an effect.
    const litAge = now - layer.litAt[i]!;
    if (litAge >= 0 && litAge < 220 && layer.lit[i]! > 0) {
      layer.hot[i]!.style.opacity = String(layer.lit[i]! * Math.exp(-litAge / 70));
      layer.dirty[i] = 1;
      return;
    }
    if (layer.dirty[i]) this.writeRest(layer, i);
  }

  private writePose(layer: Layer, i: number, p: GlyphPose): void {
    const base = layer.base[i]!.style;
    base.transform =
      p.scale === 1 && p.rot === 0 && p.dx === 0 && p.dy === 0 && p.squash === 0
        ? ""
        : `translate(${p.dx}em,${p.dy}em) rotate(${p.rot}deg) scale(${p.scale * (1 + 0.6 * p.squash)},${p.scale * (1 - p.squash)})`;
    base.opacity = p.alpha === 1 ? "" : String(p.alpha);
    const hot = layer.hot[i]!.style;
    hot.opacity = p.hot > 0.01 ? String(p.hot) : "0";
    hot.transform = base.transform;
    const a = layer.ga[i]!.style;
    if (p.aOn) {
      a.opacity = String(p.aAlpha);
      a.transform = `translate(${p.aDx}em,${p.aDy}em) rotate(${p.aRot}deg) scale(${p.aScale})`;
    } else if (a.opacity !== "0") a.opacity = "0";
    const b = layer.gb[i]!.style;
    if (p.bOn) {
      b.opacity = String(p.bAlpha);
      b.transform = `translate(${p.bDx}em,${p.bDy}em) rotate(${p.bRot}deg) scale(${p.bScale})`;
    } else if (b.opacity !== "0") b.opacity = "0";
    layer.dirty[i] = 1;
  }

  private writeRest(layer: Layer, i: number): void {
    this.writePose(layer, i, restPose(this.pose));
    layer.dirty[i] = 0;
  }

  /** The finished word: every letter flashes, the rim pops, the word squeezes flat (T3, T7). */
  private animateLeave(layer: Layer, now: number): void {
    const age = now - layer.t0;
    if (layer.release < 0) {
      // Dropped: a short fade, no release.
      const a = 1 - age / 120;
      if (a <= 0) return this.hide(layer);
      layer.el.style.opacity = String(a);
      return;
    }
    const end = this.reduced ? 180 : 165;
    if (age >= end) return this.hide(layer);
    const flash = popEnvelope(age, 55) * (layer.release >= PRIORITY.perfect ? 1 : 0.9);
    for (let i = 0; i < layer.len; i += 1) {
      const hot = layer.hot[i]!.style;
      hot.opacity = String(flash);
      hot.transform = "";
      layer.base[i]!.style.transform = "";
      layer.base[i]!.style.opacity = "";
      layer.ga[i]!.style.opacity = "0";
      layer.gb[i]!.style.opacity = "0";
    }
    if (this.reduced || this.level.motion === 0) {
      layer.el.style.opacity = String(Math.max(0, 1 - Math.max(0, age - 60) / 120));
      return;
    }
    const sx = squeeze(age, 60, 100);
    layer.el.style.transform = `translateX(-50%) scale(${sx}, ${1 + (1 - sx) * 0.08})`;
  }

  private animatePlate(now: number): void {
    const anyLive = this.live !== null && this.live.state === 1;
    const leaving = this.layers[0].state === 2 ? this.layers[0] : this.layers[1].state === 2 ? this.layers[1] : null;
    let alpha = anyLive ? 1 : 0;
    if (!anyLive && leaving !== null) {
      const age = now - leaving.t0;
      alpha = leaving.release < 0 ? Math.max(0, 1 - age / 120) : Math.max(0, Math.min(1, 1 - (age - 90) / 90));
    }
    if (alpha !== this.plateAlpha) {
      this.plate.style.opacity = String(alpha);
      this.plateAlpha = alpha;
    }
    // Rim pop (T3): two hot frames, then an exponential fall; overshoot by the release level.
    const rimAge = now - this.rimAt;
    if (rimAge >= 0 && rimAge < 400) {
      const e = popEnvelope(rimAge, 50);
      // T3: the rim stands out past the plate by ~0.2 em on every side (a perfect word 0.27, a milestone 0.36), then hugs it.
      const pad = (this.rimLevel === PRIORITY.milestone ? 0.36 : this.rimLevel === PRIORITY.perfect ? 0.27 : 0.2) * this.size * this.level.rim * (this.reduced ? 0 : e);
      this.rim.style.opacity = String(e);
      this.rim.style.transform = `scale(${1 + (2 * pad) / this.plateW}, ${1 + (2 * pad) / this.plateH})`;
      this.flashEl.style.opacity = String(0.42 * popEnvelope(rimAge, 60));
    } else if (this.rim.style.opacity !== "0") {
      this.rim.style.opacity = "0";
      this.flashEl.style.opacity = "0";
    }
    const warnAge = now - this.warnAt;
    this.warnEl.style.opacity = warnAge >= 0 && warnAge < 200 ? String(0.95 * (1 - warnAge / 200)) : "0";
    const badgeAge = now - this.badgeAt;
    if (badgeAge >= 0 && badgeAge < 900) {
      const pop = badgeAge < 120 ? 1 + 0.6 * (1 - badgeAge / 120) ** 2 : 1;
      this.badge.style.opacity = String(badgeAge < 700 ? 1 : 1 - (badgeAge - 700) / 200);
      this.badge.style.scale = String(this.reduced ? 1 : pop);
    } else if (this.badge.style.opacity !== "0") this.badge.style.opacity = "0";
  }

  private animateFly(now: number): void {
    for (let slot = 0; slot < this.flyEl.length; slot += 1) {
      const flags = this.flyFlags[slot]!;
      if ((flags & 1) === 0) continue;
      const lag = this.flyLag[slot]!;
      const t = (now - this.flyAt[slot]!) / this.flyDur[slot]! - lag;
      const span = this.flyEl[slot]!;
      if (t < 0) {
        if (span.style.display !== "none") span.style.display = "none";
        continue;
      }
      if (t >= 1) {
        if (flags & 8 && (flags & 2) === 0) {
          this.flyFlags[slot] = flags | 2;
          if (flags & 32) this.hit(slot, now, (flags & 4) !== 0);
          this.options.onArrive?.(this.flyIndex[slot]!, (flags & 4) !== 0);
        }
        this.endFly(slot);
        continue;
      }
      let x: number;
      let y: number;
      let scale: number;
      if (t < FLY_LIFT) {
        // Off the word: fast out, slowing at the top, a little bigger (the letter charged).
        const a = t / FLY_LIFT;
        const e = 1 - (1 - a) * (1 - a);
        x = this.flyFrom[slot * 2]! + (this.flyLift[slot * 2]! - this.flyFrom[slot * 2]!) * e;
        y = this.flyFrom[slot * 2 + 1]! + (this.flyLift[slot * 2 + 1]! - this.flyFrom[slot * 2 + 1]!) * e;
        scale = 1 + 0.25 * e;
      } else {
        // The dive: slow start, fast arrival (energy pulled in), shrinking into the target.
        const u = flyEase((t - FLY_LIFT) / (1 - FLY_LIFT));
        const v = 1 - u;
        const b0 = v * v * v;
        const b1 = 3 * v * v * u;
        const b2 = 3 * v * u * u;
        const b3 = u * u * u;
        const k = slot * 2;
        x = b0 * this.flyLift[k]! + b1 * this.flyCtl[k]! + b2 * this.flyCtl2[k]! + b3 * this.flyTo[k]!;
        y = b0 * this.flyLift[k + 1]! + b1 * this.flyCtl[k + 1]! + b2 * this.flyCtl2[k + 1]! + b3 * this.flyTo[k + 1]!;
        scale = 1.25 - 0.85 * u;
      }
      const head = (flags & 8) !== 0;
      const u = t;
      scale *= head ? 1 : 0.85 - lag * 2;
      const alpha = (head ? 1 : 0.5 - lag * 2.5) * ((flags & 32) !== 0 ? 1 : 1 - u);
      if (span.style.display === "none") span.style.display = "block";
      span.style.opacity = String(Math.max(0, alpha));
      span.style.transform = `translate(${x}px,${y}px) translate(-50%,-50%) scale(${scale})`;
    }
    for (let k = 0; k < this.hitEl.length; k += 1) {
      const age = now - this.hitAt[k]!;
      const el = this.hitEl[k]!;
      if (age < 0 || age >= 260) {
        if (el.style.display !== "none") el.style.display = "none";
        continue;
      }
      const t = age / 260;
      const s = 0.3 + 1.5 * (1 - (1 - t) * (1 - t));
      el.style.display = "block";
      el.style.opacity = String(1 - t);
      el.style.transform = `translate(${this.hitXY[k * 2]!}px,${this.hitXY[k * 2 + 1]!}px) translate(-50%,-50%) scale(${s})`;
    }
  }

  /** An impact ring at the target: on the first and the last letter's arrival. */
  private hit(slot: number, now: number, last: boolean): void {
    const index = this.flyIndex[slot]!;
    if (index !== 0 && !last) return;
    let k = 0;
    for (let j = 1; j < this.hitAt.length; j += 1) if (this.hitAt[j]! < this.hitAt[k]!) k = j;
    this.hitAt[k] = now;
    this.hitXY[k * 2] = this.flyTo[slot * 2]!;
    this.hitXY[k * 2 + 1] = this.flyTo[slot * 2 + 1]!;
    this.hitEl[k]!.classList.toggle("is-gold", this.flyEl[slot]!.classList.contains("is-gold"));
  }

  /** What the Lab reads each frame. */
  readout(): { particles: number; cap: number; stolen: number; refused: number; flying: number } {
    let flying = 0;
    for (let slot = 0; slot < this.flyFlags.length; slot += 1) if (this.flyFlags[slot]! & 1 && this.flyFlags[slot]! & 8) flying += 1;
    return { particles: this.pool.count, cap: this.pool.cap, stolen: this.pool.stolen, refused: this.pool.refused, flying };
  }

  /** Is the combo `n` a milestone (exported for games that time their own reaction). */
  static milestone(n: number): boolean {
    return isMilestone(n);
  }

  dispose(): void {
    if (this.frame !== 0) cancelAnimationFrame(this.frame);
    this.observer?.disconnect();
    this.media?.removeEventListener("change", this.onMotion);
    this.el.remove();
    this.flyLayer.remove();
  }
}
