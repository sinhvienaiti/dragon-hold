/**
 * Word tags over foes (01 §3.1, 05 §4.3): DOM, laid out in screen space each
 * frame (push sideways, lift up to 3 rows with a leader line, frames shrink
 * to 85 %; letters never fade or hide); fixed slot ring around the dais;
 * edge chips with arrows for foes off screen; icons per word kind.
 *
 * layoutTags is the pure solver: tags never overlap each other or the
 * avoided panels (learning frame, HUD). The presenter reads the world each
 * frame, writes text only when a word's state changes, measures only then,
 * and moves tags with transforms.
 * Owner: typing-learning (LANES.md).
 */
import type { FrameInfo, Presenter, Projector, ScreenPoint } from "../app/contracts";
import { ENEMIES } from "../content/data/enemies";
import { GENERALS } from "../content/data/generals";
import { DIFFICULTY, FIRE_DRAGON, LEARNING, RINGS } from "../content/rules";
import type { DeckWord, EnemyId, GeneralId, SimEvent, WordKind } from "../content/types";
import { SEMANTIC_COLORS } from "../kit/ui";
import { uToM } from "../sim/fixed";
import { upcomingSeals, type LiveWord } from "../sim/words";
import type { EnemyState, World } from "../sim/world";
import { drawnClusters, drawnWarnings, foeDrawLook, foeDrawnSize, foeHeadM } from "../view/foe-look";
import type { Gloss } from "./learning-frame";
import { shortMeaning, wordLevel } from "./learning-frame";

// ── Pure layout ────────────────────────────────────────────────────────────

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A tag to place: anchored by its bottom centre at (ax, ay), size w × h, higher priority placed first. */
export interface TagBox {
  readonly id: number;
  readonly ax: number;
  readonly ay: number;
  readonly w: number;
  readonly h: number;
  readonly priority: number;
  /** Size with the frame shrunk (measured); default w and h × the shrink factor's half. */
  readonly sw?: number;
  readonly sh?: number;
  /** Where it sat last frame, relative to its anchor (stability, 05 §4.3: hold ≥ 0.5 s); `dy` for a ring spot. */
  readonly prev?: Spot | undefined;
  /** Still inside its 0.5 s hold: the last spot stays while free, even over a foe body, unless it hides more than `bodyFirm` of one. */
  readonly firm?: boolean;
  /** It left a spot for a body less than 0.5 s ago: its spot now stays while free unless it hides `bodyAgain` of a body. */
  readonly yielded?: boolean;
  /** The spot it left less than 0.5 s ago: it goes back there only when nothing else in reach is free (no bounce). */
  readonly back?: Spot | undefined;
  /** Keeps clear of other foes' bodies when it can (default true; edge chips false). */
  readonly clearBodies?: boolean;
  /** Keeps clear of its own foe's body too (ring-slot tags: they stand away from their foe, at a slot round the dais). */
  readonly ownClear?: boolean;
}

/** A spot relative to the anchor: push and rows, or for a ring spot (last resort) its exact drop `dy` below the anchor, px. */
export interface Spot {
  readonly dx: number;
  readonly row: number;
  readonly shrunk: boolean;
  readonly dy?: number | undefined;
}

/** A drawn foe or a live enemy warning on screen (its box) and the tag id of its own word (−1: none): tags keep off it when they can. */
export interface BodyRect extends Rect {
  readonly owner: number;
}

export interface TagPlace {
  readonly id: number;
  /** Top-left corner of the tag. */
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  /** Sideways push (px) and lifted rows from the anchor. */
  readonly dx: number;
  readonly row: number;
  /** The frame is shrunk to 85 % (the letters keep their size). */
  readonly shrunk: boolean;
  /** Far enough from its anchor to need a leader line. */
  readonly leader: boolean;
  /** A ring spot's exact drop below the anchor, px (`row` is only its rounded lift): held as it was drawn. */
  readonly dy?: number | undefined;
  /** Why it left its last spot: "body" (still free, but it hid a body past the limit), "busy" (taken or off the screen); none if it stayed or had none. */
  readonly left?: "body" | "busy" | undefined;
}

export interface LayoutOptions {
  readonly width: number;
  readonly height: number;
  /** Panels tags keep off (learning frame, HUD, boss bar). */
  readonly avoid?: readonly Rect[];
  /** Screen margin, px. */
  readonly margin?: number;
  /** Gap kept between tags, px. */
  readonly gap?: number;
  /** Sideways push at most, px (05 §4.3: 120). */
  readonly maxPush?: number;
  /** Lift per row (05 §4.3: 34 px) and rows at most before shrinking (3). */
  readonly rowStep?: number;
  readonly maxRows?: number;
  /** Shrunk frame: width and height scale (the frame's padding and border only). */
  readonly shrink?: number;
  /** Drawn foe bodies on screen: a tag prefers a spot that covers none of them (but its own foe) by more than `bodyCover`. */
  readonly bodies?: readonly BodyRect[];
  /** Share of a body's box a tag may cover and still count as clear of it (default 0.2). */
  readonly bodyCover?: number;
  /**
   * Share of one body a tag inside its hold may hide and still keep its spot (default 0.3). dh-crowd fails a
   * foe hidden 40 % or more for over 6 frames, on the same exact areas as share(); the hold yields 10 points
   * under that, so a foe that walks in under a held tag is uncovered before it counts. (Until 26/10 the reason
   * given was dh-crowd's 6 × 6 grid, which read 33–34 % as 42 % and 75 % as 33 %; it now measures areas.)
   */
  readonly bodyFirm?: number;
  /** Past `bodyFirm`, a tag leaves its last spot only for one hiding at least this much less of a body (default 0.05). */
  readonly bodyStep?: number;
  /**
   * Share of one body a held tag that already moved for a body in this hold may hide before it moves again
   * (default 0.4, where dh-crowd counts a foe as hidden). Until it did, the limit is `bodyFirm`.
   */
  readonly bodyAgain?: number;
}

const overlaps = (a: Rect, b: Rect, gap: number): boolean =>
  a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;

/**
 * Places every tag without overlap: at its anchor, else pushed sideways up
 * to maxPush, else lifted 1–3 rows, then the same with the frame shrunk,
 * then the nearest free spot anywhere on screen. Tags stay inside the screen.
 * With `bodies` (round 2), a tag first looks for a spot in the same pushes
 * and rows that leaves the other foes' bodies and the live enemy warnings
 * visible (a crowd held at a bridge head stays readable, a wind-up is never
 * hidden); only when none is free does it sit over them, then on the free
 * spot that hides the least of any one body (its last spot unless another
 * hides clearly less; until 25/10 the first free spot, so a wordless foe
 * behind a bridge-head crowd stood 83 % under a tag kept at its ideal spot,
 * dh-crowd 720p seed 5). What a tag hides of a body counts what the tags
 * placed before it hide there: tags never overlap, so the shares add up to
 * what the player sees (two tags at 20 % each hid 42 % of an archer, 1080p).
 * A tag inside its hold keeps its spot (no jumping) while it hides at most
 * `bodyFirm` of one body. Past that it moves once: a foe that spawns or walks
 * in under a held tag, or a tag that grows a meaning line, hid 42–89 % of a
 * foe for up to 0.47 s (dh-crowd 720p seed 1, 26/10), and a hidden foe costs
 * the player more than one jump (a proposal waiting for the owner, 00 D32).
 * After such a move (`yielded`) the spot it took stays while free until it
 * hides `bodyAgain` (40 %) of a body, and it never goes back to the spot it
 * left (`back`) within 0.5 s unless nothing else in reach is free (26/10
 * review: tags moved 216–240 px and back within 100–150 ms; with no second
 * move at all, a foe that walked in under a moved tag stood 90 % hidden for
 * 19 frames, dh-crowd 720p seed 1). Over bodies, a last spot past
 * `bodyFirm` stays unless another hides at least `bodyStep` less. The last
 * resort (rings round the anchor) takes the nearest free spot that keeps off
 * the tag's own foe and hides at most `bodyFirm` of any body within twice the
 * reach, every direction; else the nearest free spot (a ring spot over its
 * own foe hid it 56–67 % for up to 11 frames, dh-crowd 1080p seed 6; until
 * 26/10 it only weighed the bodies above the anchor, so a spot below it hid
 * another foe 56 %). A tag whose best spot in reach still hides 40 % or more
 * of a body (every spot taken or over the crowd) takes such a clean ring spot
 * first (rings three times as coarse; at most 4 such searches a frame,
 * highest priority first, to keep the layout in its budget). A ring spot is
 * held as drawn (`dy`), and the bodies under a tag's last spot count wherever
 * it is (26/10: a held tag stayed over an archer 80 % for 24 frames, dh-crowd
 * 720p 70 WPM seed 1). Ring-slot tags (`ownClear`) keep off bodies too, their
 * own foe's included (26/10 review: they hid foes within 10 m up to 92 % and
 * red wind-ups up to 92 %).
 */
export function layoutTags(boxes: readonly TagBox[], options: LayoutOptions): TagPlace[] {
  const margin = options.margin ?? 8;
  const gap = options.gap ?? 2;
  const maxPush = options.maxPush ?? 120;
  const rowStep = options.rowStep ?? 34;
  const maxRows = options.maxRows ?? 3;
  const shrink = options.shrink ?? 0.85;
  const avoid = options.avoid ?? [];
  const bodies = options.bodies ?? [];
  const bodyCover = options.bodyCover ?? 0.2;
  const bodyFirm = options.bodyFirm ?? 0.3;
  const bodyStep = options.bodyStep ?? 0.05;
  const bodyAgain = options.bodyAgain ?? 0.4;
  /** Over bodies, a tag leaves its last spot only for one hiding at least this much less of a body. */
  const bodyStay = 0.1;
  /** Indices of the bodies near the tag being placed. */
  const near: number[] = [];
  /** Share of each body the tags placed so far hide (they never overlap, so shares add). */
  const hidden = new Float64Array(bodies.length);
  const share = (rect: Rect, body: Rect): number => {
    const ix = Math.min(rect.x + rect.w, body.x + body.w) - Math.max(rect.x, body.x);
    if (ix <= 0) return 0;
    const iy = Math.min(rect.y + rect.h, body.y + body.h) - Math.max(rect.y, body.y);
    return iy > 0 ? (ix * iy) / (body.w * body.h) : 0;
  };
  const placed: Rect[] = [];
  const out: TagPlace[] = [];
  const order = [...boxes].sort((a, b) => b.priority - a.priority || a.id - b.id);
  const pushes: number[] = [0];
  for (let d = 24; d <= maxPush; d += 24) pushes.push(-d, d);
  const sizesOf = (box: TagBox) => [
    { w: box.w, h: box.h, shrunk: false },
    { w: box.sw ?? Math.round(box.w * (1 - (1 - shrink) / 2)), h: box.sh ?? Math.round(box.h * (1 - (1 - shrink) / 2)), shrunk: true },
  ];
  // Inside the screen first: a tag whose anchor sits at an edge starts from the nearest spot that fits.
  const clampX = (x: number, w: number) => Math.min(Math.max(x, margin), options.width - margin - w);
  const clampY = (y: number, h: number) => Math.min(Math.max(y, margin), options.height - margin - h);
  const rectAt = (box: TagBox, size: { w: number; h: number }, dx: number, row: number, dy?: number): Rect => ({
    x: clampX(box.ax - size.w / 2 + dx, size.w),
    y: clampY(dy === undefined ? box.ay - size.h - row * rowStep : box.ay - size.h + dy, size.h),
    w: size.w,
    h: size.h,
  });
  const spotRect = (box: TagBox, spot: Spot): Rect => rectAt(box, sizesOf(box)[spot.shrunk ? 1 : 0]!, spot.dx, spot.row, spot.dy);
  // Spots of tags inside their hold, not placed yet: a tag that moves keeps off them while it has another
  // choice in reach (26/10: most moves inside a hold were a held tag pushed off its spot by a tag re-laid
  // after its own hold, or by another one moving).
  const reserved: { id: number; rect: Rect }[] = [];
  for (const box of order) {
    if (box.firm === true && box.prev) reserved.push({ id: box.id, rect: spotRect(box, box.prev) });
  }
  // Every place has the same fields in the same order (one object shape keeps the layout fast).
  const placeOf = (id: number, rect: Rect, dx: number, row: number, dy: number | undefined, shrunk: boolean, leader: boolean, left?: "body" | "busy"): TagPlace => ({
    id, x: rect.x, y: rect.y, w: rect.w, h: rect.h, dx, row, dy, shrunk, leader, left,
  });
  let current = -1;
  /** Escapes to a clean ring spot left this frame (each searches up to ~140 spots; highest priority first). */
  let escapes = 4;
  /** Tags placed this frame (their reservation is spent: `placed` holds where they went). */
  const done = new Set<number>();
  const free = (rect: Rect, strict = false): boolean => {
    if (rect.x < margin || rect.y < margin || rect.x + rect.w > options.width - margin || rect.y + rect.h > options.height - margin) return false;
    for (const other of placed) if (overlaps(rect, other, gap)) return false;
    for (const zone of avoid) if (overlaps(rect, zone, 0)) return false;
    if (strict) for (const spot of reserved) if (spot.id !== current && !done.has(spot.id) && overlaps(rect, spot.rect, gap)) return false;
    return true;
  };
  for (const box of order) {
    current = box.id;
    const sizes = sizesOf(box);
    const at = (size: { w: number; h: number }, dx: number, row: number, dy?: number): Rect => rectAt(box, size, dx, row, dy);
    // Other foes' bodies within reach of this tag's pushes and rows.
    near.length = 0;
    if (bodies.length > 0 && box.clearBodies !== false) {
      const reach: Rect = { x: box.ax - box.w / 2 - maxPush, y: box.ay - box.h - maxRows * rowStep, w: box.w + 2 * maxPush, h: box.h + maxRows * rowStep };
      // Its last spot and the one it left may lie outside that reach (a ring spot): their bodies count too.
      const last = box.prev ? spotRect(box, box.prev) : null;
      const left = box.back ? spotRect(box, box.back) : null;
      for (let i = 0; i < bodies.length; i += 1) {
        const body = bodies[i]!;
        if (box.ownClear !== true && body.owner === box.id) continue;
        if (overlaps(reach, body, 0) || (last !== null && overlaps(last, body, 0)) || (left !== null && overlaps(left, body, 0))) near.push(i);
      }
    }
    /** The largest share of one body in `list` hidden once the rect is placed (with the tags placed before it), of the bodies it touches. */
    const hides = (rect: Rect, list: readonly number[] = near): number => {
      let most = 0;
      for (const i of list) {
        const part = share(rect, bodies[i]!);
        if (part > 0) most = Math.max(most, hidden[i]! + part);
      }
      return most;
    };
    let found: TagPlace | null = null;
    // The same push and row, frame shrunk or not: on screen the same place.
    const isBack = (dx: number, row: number, dy?: number): boolean => box.back !== undefined && box.back.dx === dx && box.back.row === row && box.back.dy === dy;
    /** Takes the spot when it is free (`strict`: off the held tags' spots too) and hides at most `limit` of any one near body; never the spot it just left unless `back`. */
    const accept = (size: { w: number; h: number; shrunk: boolean }, dx: number, row: number, limit = Infinity, back = false, strict = true, dy?: number): boolean => {
      if (!back && isBack(dx, row, dy)) return false;
      const rect = at(size, dx, row, dy);
      if (!free(rect, strict) || (limit < Infinity && hides(rect) > limit)) return false;
      const leader = row > 0 || dy !== undefined || Math.abs(rect.x + rect.w / 2 - box.ax) > rect.w / 2 || Math.abs(rect.y + rect.h - box.ay) > rowStep;
      found = placeOf(box.id, rect, dx, row, dy, size.shrunk, leader);
      return true;
    };
    const ringSize = sizes[1]!;
    const step = Math.max(12, Math.round(ringSize.h / 2));
    const own = box.clearBodies === false ? undefined : bodies.find((body) => body.owner === box.id);
    const reachClean = 2 * Math.max(maxPush, maxRows * rowStep);
    // Bodies a ring spot within reachClean can touch, every direction (`near` only looks above the anchor); read once, when a ring is searched.
    const around: number[] = [];
    let aroundRead = false;
    const readAround = (): void => {
      aroundRead = true;
      if (box.clearBodies === false) return;
      const zone: Rect = { x: box.ax - reachClean - ringSize.w, y: box.ay - reachClean - ringSize.h, w: 2 * (reachClean + ringSize.w), h: 2 * (reachClean + ringSize.h) };
      for (let i = 0; i < bodies.length; i += 1) if (bodies[i]!.owner !== box.id && overlaps(zone, bodies[i]!, 0)) around.push(i);
    };
    /**
     * Rings round the anchor, shrunk frame: the nearest free spot that keeps off its own foe and hides at most
     * `bodyFirm` of any body (clean) within reachClean; with `any`, else the nearest free spot on the screen.
     * Without `any` (an escape from a spot over a body) the rings step three times as far: about 140 spots.
     */
    /** Hides at most `bodyFirm` of every body around (with the tags placed before it); stops at the first that is hidden more. */
    const clean = (rect: Rect): boolean => {
      for (const i of around) {
        const part = share(rect, bodies[i]!);
        if (part > 0 && hidden[i]! + part > bodyFirm) return false;
      }
      return true;
    };
    const ring = (any: boolean): TagPlace | null => {
      if (!aroundRead) readAround();
      let first: TagPlace | null = null;
      const st = any ? step : 3 * step;
      for (let r = 1; r * st < Math.max(options.width, options.height); r += 1) {
        if ((first !== null || !any) && r * st > reachClean) break;
        for (let k = -r; k <= r; k += 1) {
          for (const [dx, dy] of [[k * st, -r * st], [k * st, r * st], [-r * st, k * st], [r * st, k * st]] as const) {
            const rect = { x: box.ax - ringSize.w / 2 + dx, y: box.ay - ringSize.h + dy, w: ringSize.w, h: ringSize.h };
            const isClean = (own === undefined || !overlaps(rect, own, 0)) && clean(rect);
            // Only the nearest free spot matters past the clean ones: skip the rest unchecked.
            if (!isClean && (!any || first !== null)) continue;
            if (!free(rect) || isBack(dx, Math.max(0, Math.round(-dy / rowStep)), dy)) continue;
            const place = placeOf(box.id, rect, dx, Math.max(0, Math.round(-dy / rowStep)), dy, true, true);
            if (isClean) return place;
            first = place;
          }
        }
      }
      return any ? first : null;
    };
    const prevSize = box.prev?.shrunk ? sizes[1]! : sizes[0]!;
    const prevFree = box.prev !== undefined && free(at(prevSize, box.prev.dx, box.prev.row, box.prev.dy));
    // In its hold: stays while free and under bodyFirm of a body; after a move for a body, under bodyAgain.
    const firmLimit = box.yielded === true ? bodyAgain : bodyFirm;
    if (box.prev) accept(prevSize, box.prev.dx, box.prev.row, near.length === 0 ? Infinity : box.firm === true ? firmLimit : bodyCover, true, false, box.prev.dy);
    if (found === null && near.length > 0) {
      // A spot that leaves the crowd visible, nearest first.
      for (let row = 0; row <= maxRows && found === null; row += 1) {
        for (const dx of pushes) if (found === null) accept(sizes[0]!, dx, row, bodyCover);
      }
      if (found === null) {
        // None: the free spot hiding the least of any one body (ties: nearest, full size first), the last spot unless clearly worse.
        let best: { size: (typeof sizes)[number]; dx: number; row: number } | null = null;
        let least = Infinity;
        for (const size of sizes) {
          for (let row = 0; row <= maxRows; row += 1) {
            for (const dx of pushes) {
              const rect = at(size, dx, row);
              if (!free(rect, true) || isBack(dx, row)) continue;
              const most = hides(rect);
              if (most < least) {
                least = most;
                best = { size, dx, row };
              }
            }
          }
        }
        let stays = false;
        let most = least;
        if (box.prev) {
          const rect = at(prevSize, box.prev.dx, box.prev.row, box.prev.dy);
          const stay = free(rect) ? hides(rect) : Infinity;
          stays = stay <= least + bodyStay && (stay <= bodyFirm || stay <= least + bodyStep);
          if (stays) most = stay;
        }
        // Still 40 % of a body or more (every spot in reach taken or over the crowd): a clean ring spot first
        // (26/10, dh-crowd 720p 70 WPM seed 1: a held tag stayed over an archer 80 % for 24 frames).
        if (most >= bodyAgain && (stays || best !== null) && escapes > 0) {
          escapes -= 1;
          found = ring(false);
        }
        if (found === null && stays && box.prev) accept(prevSize, box.prev.dx, box.prev.row, Infinity, true, false, box.prev.dy);
        if (found === null && best !== null) accept(best.size, best.dx, best.row);
      }
    }
    // Any free spot in reach, off the held tags' spots first; then over one (that tag moves instead). Over
    // bodies: spots under 40 % of any body first, then a clean ring spot, then any. One sweep, nearest first.
    if (found === null) {
      type Cand = { size: (typeof sizes)[number]; dx: number; row: number };
      let lightStrict: Cand | null = null;
      let light: Cand | null = null;
      let anyStrict: Cand | null = null;
      let any: Cand | null = null;
      sweep: for (const size of sizes) {
        for (let row = 0; row <= maxRows; row += 1) {
          for (const dx of pushes) {
            if (isBack(dx, row)) continue;
            const rect = at(size, dx, row);
            if (!free(rect)) continue;
            const strict = free(rect, true);
            const under = near.length === 0 || hides(rect) <= bodyAgain;
            const cand = { size, dx, row };
            if (strict && under && lightStrict === null) lightStrict = cand;
            if (under && light === null) light = cand;
            if (strict && anyStrict === null) anyStrict = cand;
            if (any === null) any = cand;
            if (lightStrict !== null) break sweep;
          }
        }
      }
      const take = (cand: Cand, strict: boolean) => accept(cand.size, cand.dx, cand.row, Infinity, false, strict);
      if (lightStrict !== null) take(lightStrict, true);
      else if (light !== null) take(light, false);
      else {
        if (near.length > 0 && escapes > 0) {
          escapes -= 1;
          found = ring(false);
        }
        if (found === null && anyStrict !== null) take(anyStrict, true);
        else if (found === null && any !== null) take(any, false);
      }
    }
    // Nothing else in reach is free: back to the spot it just left (a bounce beats a jump across the screen).
    if (found === null && box.back !== undefined) accept(box.back.shrunk ? sizes[1]! : sizes[0]!, box.back.dx, box.back.row, Infinity, true, false, box.back.dy);
    // Last resort: the nearest free spot on the screen, in rings around the anchor (never overlap, 05 §4.3).
    if (found === null) found = ring(true);
    if (found === null) found = placeOf(box.id, at(sizes[1]!, 0, maxRows), 0, maxRows, undefined, true, true);
    const spot: TagPlace = found;
    if (box.prev !== undefined && (spot.dx !== box.prev.dx || spot.row !== box.prev.row || spot.shrunk !== box.prev.shrunk || spot.dy !== box.prev.dy)) found = placeOf(spot.id, spot, spot.dx, spot.row, spot.dy, spot.shrunk, spot.leader, prevFree ? "body" : "busy");
    placed.push(found);
    out.push(found);
    done.add(box.id);
    for (let i = 0; i < bodies.length; i += 1) hidden[i] = hidden[i]! + share(found, bodies[i]!);
  }
  return out;
}

/** Clamps an off-screen point to the screen edge; the arrow points from the screen centre toward it (radians). */
export function edgeChip(x: number, y: number, width: number, height: number, inset: number): { x: number; y: number; angle: number } {
  const cx = width / 2;
  const cy = height / 2;
  let dx = x - cx;
  let dy = y - cy;
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || (dx === 0 && dy === 0)) {
    dx = 0;
    dy = 1;
  }
  const sx = (width / 2 - inset) / Math.max(1e-6, Math.abs(dx));
  const sy = (height / 2 - inset) / Math.max(1e-6, Math.abs(dy));
  const s = Math.min(sx, sy, 1);
  return { x: cx + dx * s, y: cy + dy * s, angle: Math.atan2(dy, dx) };
}

/** Ring slots around the dais (05 §4.3): foes within 10 m tag at 10 fixed angles, nearest free to their bearing. */
export const RING_SLOTS = 10;
export function ringSlot(bearing: number, taken: ReadonlySet<number>): number {
  const step = (Math.PI * 2) / RING_SLOTS;
  const ideal = ((Math.round(bearing / step) % RING_SLOTS) + RING_SLOTS) % RING_SLOTS;
  for (let d = 0; d <= RING_SLOTS / 2; d += 1) {
    for (const slot of [ideal + d, ideal - d]) {
      const s = ((slot % RING_SLOTS) + RING_SLOTS) % RING_SLOTS;
      if (!taken.has(s)) return s;
    }
  }
  return ideal;
}

// ── Presenter ──────────────────────────────────────────────────────────────

/** Kind → icon and frame class (05 §4.3: a shape per kind, not only a colour). */
const KIND_STYLE: Readonly<Record<WordKind, { readonly icon: string; readonly cls: string; readonly label: string }>> = {
  enemy: { icon: "", cls: "is-enemy", label: "Foe" },
  cluster: { icon: "swarm", cls: "is-cluster", label: "Mob" },
  elite: { icon: "crown", cls: "is-elite", label: "Elite" },
  general: { icon: "badge", cls: "is-general", label: "Gen." },
  seal: { icon: "seal", cls: "is-seal", label: "Seal" },
  flag: { icon: "flag", cls: "is-flag", label: "Flag" },
  interrupt: { icon: "bolt", cls: "is-interrupt", label: "Stop" },
  urgent: { icon: "roar", cls: "is-urgent", label: "Dragon Roar" },
  skill: { icon: "flame", cls: "is-skill", label: "Skill" },
  assist: { icon: "leaf", cls: "is-assist", label: "Aid" },
  trigger: { icon: "gear", cls: "is-trigger", label: "Trigger" },
  "boss-part": { icon: "target", cls: "is-boss", label: "Part" },
  "boss-seal": { icon: "target", cls: "is-boss", label: "Seals" },
  map: { icon: "gear", cls: "is-map", label: "Obj" },
};

/** Small inline icons (24 × 24 paths), drawn in currentColor. */
const ICONS: Readonly<Record<string, string>> = {
  crown: "M3 18h18l-1.5-10-4.5 4-3-7-3 7-4.5-4z",
  badge: "M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z",
  seal: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 4l1.8 3.6 4 .6-2.9 2.8.7 4L12 16.1 8.4 18l.7-4-2.9-2.8 4-.6z",
  flag: "M5 2h2v20H5zM8 3h11l-3 4.5L19 12H8z",
  bolt: "M13 2L4 14h6l-1 8 9-12h-6z",
  roar: "M12 2c1 4 6 5 6 11a6 6 0 0 1-12 0c0-3 2-4 2-7 2 1 3 3 3 5 1-2 1-6 1-9z",
  flame: "M12 2c1 4 6 5 6 11a6 6 0 0 1-12 0c0-3 2-4 2-7 2 1 3 3 3 5 1-2 1-6 1-9z",
  leaf: "M20 4C9 4 4 9 4 16c0 2 1 4 1 4s2-6 9-9c-5 4-6 7-6 7s12 0 12-14z",
  gear: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm9 5v-2l-2.2-.4a7 7 0 0 0-.9-2.1l1.3-1.8-1.4-1.4-1.8 1.3a7 7 0 0 0-2.1-.9L13 3h-2l-.4 2.2a7 7 0 0 0-2.1.9L6.7 4.8 5.3 6.2l1.3 1.8a7 7 0 0 0-.9 2.1L3 11v2l2.2.4c.2.8.5 1.5.9 2.1l-1.3 1.8 1.4 1.4 1.8-1.3c.6.4 1.3.7 2.1.9L11 21h2l.4-2.2c.8-.2 1.5-.5 2.1-.9l1.8 1.3 1.4-1.4-1.3-1.8c.4-.6.7-1.3.9-2.1z",
  target: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 4a6 6 0 1 1 0 12 6 6 0 0 1 0-12zm0 4a2 2 0 1 0 0 4 2 2 0 0 0 0-4z",
  swarm: "M6 9a3 3 0 1 0 0 .1zM18 9a3 3 0 1 0 0 .1zM12 17a3 3 0 1 0 0 .1z",
};

const svgIcon = (name: string): string =>
  name === "" ? "" : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + ICONS[name] + '" fill="currentColor"/></svg>';

const STYLE_ID = "dh-tags-style";
const CSS = `
.dh-tags { position: absolute; inset: 0; pointer-events: none; overflow: hidden; z-index: 20; }
.dh-tags svg.dh-tags__lines { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
.dh-tags__lines line { stroke: rgba(255, 244, 214, 0.55); stroke-width: 1.5; }
.dh-tag { position: absolute; left: 0; top: 0; will-change: transform; font-family: var(--kit-font-battle, "Be Vietnam Pro", system-ui, sans-serif); }
.dh-tag__body {
  display: grid; justify-items: center; gap: 1px; box-sizing: border-box; max-width: 220px;
  padding: 2px 8px 3px; border-radius: 6px; border: 1.5px solid rgba(255, 244, 214, 0.28);
  background: rgba(35, 28, 23, 0.9); color: #FFF4D6; box-shadow: 0 2px 0 rgba(0, 0, 0, 0.55);
  transform-origin: 50% 100%;
}
.dh-tag.is-tight .dh-tag__body { padding: 1px 4px 2px; border-width: 1px; }
.dh-tag__line { display: flex; align-items: center; gap: 4px; white-space: nowrap; }
.dh-tag__icon { display: inline-flex; width: 0.9em; height: 0.9em; }
.dh-tag__icon:empty { display: none; }
.dh-tag__icon svg { width: 100%; height: 100%; }
.dh-tag__word { font-size: var(--dh-tag-font, 20px); font-weight: 700; line-height: 1.15; letter-spacing: 0.02em; }
.dh-tag__word .f { font-weight: 800; text-decoration: underline; text-decoration-thickness: 2px; text-underline-offset: 3px; color: #FFFFFF; }
.dh-tag__word .t { color: ${SEMANTIC_COLORS.typing}; }
.dh-tag__word .p { background: rgba(255, 140, 170, 0.45); border-radius: 2px; }
.dh-tag__word .h { color: #FFE9A8; text-decoration: underline dotted; }
.dh-tag__new { font-size: max(11px, calc(var(--dh-tag-font, 20px) * 0.55)); font-weight: 800; padding: 0 4px; border-radius: 3px; background: #E9F7D4; color: #1F3A12; }
.dh-tag__new:empty, .dh-tag__dots:empty, .dh-tag__mean:empty { display: none; }
.dh-tag__dots { font-size: calc(var(--dh-tag-font, 20px) * 0.5); letter-spacing: 2px; color: #C9C2B0; }
.dh-tag__dots .s { color: #D08A4E; }
.dh-tag__mean { font-size: max(13px, calc(var(--dh-tag-font, 20px) * 0.76)); font-weight: 400; color: #EADFC4; line-height: 1.15; white-space: nowrap; }
.dh-tag__hp { display: block; width: 100%; height: 3px; border-radius: 2px; background: rgba(0, 0, 0, 0.45); overflow: hidden; }
.dh-tag__hp i { display: block; height: 100%; background: #E8D9A8; }
.dh-tag__hp[hidden] { display: none; }
.dh-tag.is-elite .dh-tag__body, .dh-tag.is-seal .dh-tag__body { border-color: #D08A4E; border-width: 2px; }
.dh-tag.is-seal .dh-tag__icon { color: #D08A4E; }
.dh-tag.is-general .dh-tag__body { border-color: #C9CED6; border-width: 2px; border-style: double; border-width: 3px; }
.dh-tag.is-general .dh-tag__icon { color: #C9CED6; }
.dh-tag.is-flag .dh-tag__body { border-color: #C8D24A; border-style: dashed; }
.dh-tag.is-flag .dh-tag__icon { color: #C8D24A; }
.dh-tag.is-urgent .dh-tag__body { border-color: ${SEMANTIC_COLORS.urgent}; border-width: 2px; }
.dh-tag.is-urgent .dh-tag__icon { color: ${SEMANTIC_COLORS.urgent}; }
.dh-tag.is-interrupt .dh-tag__body { border-color: ${SEMANTIC_COLORS.urgent}; }
.dh-tag.is-assist .dh-tag__body { border-color: #6CCB5F; }
.dh-tag.is-boss .dh-tag__body { border-color: #3B2F5C; border-width: 3px; }
.dh-tag.is-cluster .dh-tag__icon { color: #C9C2B0; }
.dh-tag.is-near .dh-tag__word { box-shadow: inset 0 -3px 0 ${SEMANTIC_COLORS.danger}; }
.dh-tag.is-locked { z-index: 5; }
.dh-tag.is-locked .dh-tag__body { transform: scale(1.1); border-color: ${SEMANTIC_COLORS.typing}; box-shadow: 0 0 0 1px rgba(127, 245, 224, 0.35), 0 2px 0 rgba(0, 0, 0, 0.55); }
.dh-tag.is-born .dh-tag__body { animation: dh-tag-pop 150ms ease-out; }
.dh-tag.is-shake .dh-tag__body { animation: dh-tag-shake 180ms linear; border-color: rgba(255, 140, 170, 0.95); }
.dh-tag.is-tick .dh-tag__body { animation: dh-tag-tick 140ms ease-out; }
.dh-tag.is-seep .dh-tag__body { border-color: #B58CFF; box-shadow: 0 0 0 2px rgba(150, 100, 220, 0.6), 0 0 12px rgba(150, 100, 220, 0.75), 0 2px 0 rgba(0, 0, 0, 0.55); }
.dh-tag__word .j { display: inline-block; animation: dh-letter 170ms ease-out; animation-delay: var(--dh-letter-delay, 0ms); }
.dh-tag.is-done .dh-tag__body { animation: dh-tag-done 160ms ease-in forwards; }
.dh-tag.is-fold .dh-tag__body { animation: dh-tag-fold 200ms ease-in forwards; }
.dh-tag.is-gone .dh-tag__body { animation: dh-tag-gone 70ms linear forwards; }
.dh-tag.is-chip .dh-tag__body { border-style: solid; border-color: rgba(255, 244, 214, 0.7); }
.dh-tag__arrow { position: absolute; left: 50%; top: 50%; width: 0; height: 0; border-left: 7px solid #FFF4D6; border-top: 5px solid transparent; border-bottom: 5px solid transparent; }
.dh-tag:not(.is-chip) .dh-tag__arrow { display: none; }
.dh-spark { position: absolute; left: 0; top: 0; font-weight: 800; font-size: calc(var(--dh-tag-font, 20px) * 0.9); color: #7FF5E0; text-shadow: 0 0 6px rgba(127, 245, 224, 0.8), 0 1px 0 #000; pointer-events: none; opacity: 0; }
.dh-spark.is-on { animation: dh-spark 520ms ease-out forwards; }
@keyframes dh-spark { 0% { opacity: 1; translate: 0 0; scale: 1.15; } 100% { opacity: 0; translate: var(--dx) var(--dy); scale: 0.6; } }
@media (prefers-reduced-motion: reduce) { .dh-spark.is-on { animation-duration: 1ms; } }
.dh-still .dh-spark.is-on { animation-duration: 1ms; }
.dh-dot { position: absolute; left: 0; top: 0; width: 6px; height: 6px; margin: -3px 0 0 -3px; border-radius: 50%; background: rgba(255, 244, 214, 0.45); }
@keyframes dh-tag-pop { 0% { transform: scale(0.6); } 70% { transform: scale(1.06); } 100% { transform: scale(1); } }
@keyframes dh-tag-shake { 0%, 100% { translate: 0 0; } 20% { translate: -5px 0; } 50% { translate: 5px 0; } 80% { translate: -3px 0; } }
@keyframes dh-tag-tick { 0% { translate: 0 0; } 35% { translate: 0 -3px; } 100% { translate: 0 0; } }
@keyframes dh-letter { 0% { transform: translateY(0) scale(1); } 35% { transform: translateY(-5px) scale(1.45); text-shadow: 0 0 8px rgba(127, 245, 224, 0.95), 0 0 2px #fff; } 100% { transform: none; } }
@keyframes dh-tag-done { 0% { opacity: 1; } 45% { opacity: 0.3; } 100% { opacity: 0; translate: 0 -14px; } }
@keyframes dh-tag-fold { to { opacity: 0; transform: scale(0.6, 0.2); } }
@keyframes dh-tag-gone { to { opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .dh-tag__body, .dh-tag__word .j { animation: none !important; } }
.dh-still .dh-tag__body, .dh-still .dh-tag__word .j { animation: none !important; }
`;

/** Word font size at this viewport (01 §3.1: 20 px at 1080p, at least 16 px at 720p), times the player's 80–150 %. */
export function tagFontPx(height: number, userPct = 100): number {
  return Math.round(Math.min(26, Math.max(16, (20 * height) / 1080)) * (userPct / 100) * 10) / 10;
}

const POOL = 24;
const DOTS = 40;
/** Letter sparks a finished word throws out (05 §4.3, §6.1: 6–10 letters burst from the tag). */
const SPARKS = 30;
const SPARKS_PER_WORD = 8;
/**
 * shake: a wrong key (05 §4.3 ±3 px 120 ms; ±5 px 180 ms with a pink frame since the 26/10 test pass: it read as
 * nothing); pink: the next letter's pink lasts at least this, and until that letter is typed; tick: a right key's
 * bump and letter pop; leave: a finished tag fades (160 ms: a fading tag hid the next foe up to 10 frames, 1080p).
 */
const MS = { shake: 180, pink: 150, tick: 170, leave: 160, hold: 500 } as const;

interface Tag {
  readonly el: HTMLElement;
  readonly body: HTMLElement;
  readonly icon: HTMLElement;
  readonly word: HTMLElement;
  readonly badge: HTMLElement;
  readonly dots: HTMLElement;
  readonly mean: HTMLElement;
  readonly hp: HTMLElement;
  readonly hpFill: HTMLElement;
  readonly arrow: HTMLElement;
  readonly line: SVGLineElement;
  /** Word slot it shows (−1 free), and the word's birth tick (a slot is reused). */
  slot: number;
  born: number;
  /** performance.now() when it was bound (the pop plays 150 ms). */
  bornAt: number;
  key: string;
  w: number;
  h: number;
  sw: number;
  sh: number;
  x: number;
  y: number;
  ax: number;
  ay: number;
  leaving: "" | "done" | "fold" | "gone";
  leaveAt: number;
  shakeUntil: number;
  pinkUntil: number;
  /** The letter a wrong key landed on (pink until it is typed; −1 none). */
  pinkAt: number;
  /** A right key: when, and which letter popped. */
  tickAt: number;
  tickIndex: number;
  /** Héo lan seeped from this tag's foe: the frame flashes until then. */
  seepUntil: number;
  prev: Spot | undefined;
  movedAt: number;
  /** The spot it left at its last move, and when; when it last left a spot for a body (one such move per hold). */
  back: Spot | undefined;
  backAt: number;
  yieldAt: number;
  ring: number;
  seen: number;
}

export interface TagsOptions {
  /** Meaning and IPA (the learning client's gloss); no meaning lines without it. */
  readonly gloss?: Gloss;
  /** Panels the tags keep off; default: every element with [data-dh-avoid] (learning frame, panels) or [data-keepout] (HUD), read every 0.5 s. */
  readonly avoid?: () => readonly Rect[];
  /** Player's tag size, 80–150 % (01 §3.1). */
  readonly sizePct?: number;
  /**
   * True while a learning card asks for a word (Thẻ Ôn, Học trước): the layer hides, and leaving
   * tags and letter sparks end at once, so a word just typed never shows its answer under the card.
   */
  readonly quiet?: () => boolean;
}

/** Head height of a foe's tag anchor, metres: top of its body as drawn (view/foe-look.ts) + 0.4 m (05 §4.3). */
function headM(enemy: EnemyState): number {
  const show = enemy.general ? GENERALS[enemy.foe as GeneralId].show : ENEMIES[enemy.foe as EnemyId].show;
  return foeHeadM(enemy.foe, Math.max(uToM(enemy.y), show.placeholder.hoverM)) + 0.4;
}

const RING_RADIUS_M = 6.5;
const RING_HEIGHT_M = 3.6;

export function createTags(root: HTMLElement, project: Projector, options: TagsOptions = {}): Presenter {
  const doc = root.ownerDocument;
  if (doc.getElementById(STYLE_ID) === null) {
    const style = doc.createElement("style");
    style.id = STYLE_ID;
    style.textContent = CSS;
    doc.head.append(style);
  }
  const layer = doc.createElement("div");
  layer.className = "dh-tags";
  layer.setAttribute("aria-hidden", "true");
  const svgNs = "http://www.w3.org/2000/svg";
  const lines = doc.createElementNS(svgNs, "svg");
  lines.setAttribute("class", "dh-tags__lines");
  layer.append(lines);
  root.append(layer);

  const tags: Tag[] = Array.from({ length: POOL }, () => {
    const el = doc.createElement("div");
    el.className = "dh-tag";
    el.style.opacity = "0";
    el.innerHTML =
      '<div class="dh-tag__body"><div class="dh-tag__line"><i class="dh-tag__icon"></i><span class="dh-tag__word"></span><span class="dh-tag__new"></span><span class="dh-tag__dots"></span></div>' +
      '<small class="dh-tag__mean"></small><b class="dh-tag__hp" hidden><i></i></b></div><i class="dh-tag__arrow"></i>';
    layer.append(el);
    const body = el.firstElementChild as HTMLElement;
    const line = doc.createElementNS(svgNs, "line");
    line.style.display = "none";
    lines.append(line);
    return {
      el, body, icon: body.querySelector(".dh-tag__icon")!, word: body.querySelector(".dh-tag__word")!, badge: body.querySelector(".dh-tag__new")!,
      dots: body.querySelector(".dh-tag__dots")!, mean: body.querySelector(".dh-tag__mean")!, hp: body.querySelector(".dh-tag__hp")!,
      hpFill: body.querySelector(".dh-tag__hp i")!, arrow: el.querySelector(".dh-tag__arrow")!, line,
      slot: -1, born: -1, bornAt: 0, key: "", w: 0, h: 0, sw: 0, sh: 0, x: 0, y: 0, ax: 0, ay: 0, leaving: "", leaveAt: 0, shakeUntil: 0, pinkUntil: 0, pinkAt: -1, tickAt: -1e9, tickIndex: -1, seepUntil: 0, prev: undefined, movedAt: 0, back: undefined, backAt: -1e9, yieldAt: -1e9, ring: -1, seen: 0,
    };
  });
  const dots: HTMLElement[] = Array.from({ length: DOTS }, () => {
    const dot = doc.createElement("i");
    dot.className = "dh-dot";
    dot.style.display = "none";
    layer.append(dot);
    return dot;
  });
  const sparks: HTMLElement[] = Array.from({ length: SPARKS }, () => {
    const spark = doc.createElement("b");
    spark.className = "dh-spark";
    layer.append(spark);
    return spark;
  });
  let nextSpark = 0;
  /** A finished word's letters fly out from its tag and fade (pooled spans, CSS animation). */
  const burst = (tag: Tag, text: string): void => {
    if (text === "") return;
    const cx = tag.x + tag.w / 2;
    const cy = tag.y + tag.h / 2;
    const n = Math.min(SPARKS_PER_WORD, Math.max(6, text.length));
    for (let k = 0; k < n; k += 1) {
      const spark = sparks[nextSpark]!;
      nextSpark = (nextSpark + 1) % SPARKS;
      const angle = (k / n) * Math.PI * 2 + 0.3;
      spark.textContent = text[k % text.length]!;
      spark.style.transform = "translate(" + cx.toFixed(1) + "px," + cy.toFixed(1) + "px)";
      spark.style.setProperty("--dx", (Math.cos(angle) * 46).toFixed(0) + "px");
      spark.style.setProperty("--dy", (Math.sin(angle) * 30 - 18).toFixed(0) + "px");
      spark.classList.remove("is-on");
      void spark.offsetWidth;
      spark.classList.add("is-on");
    }
  };
  const textOf = new Map<number, string>();
  const bySlot = new Map<number, Tag>();
  const ringOf = new Map<number, number>();
  const point: ScreenPoint = { x: 0, y: 0, visible: false };
  let width = 0;
  let height = 0;
  let avoid: readonly Rect[] = [];
  let avoidReadAt = -1e9;
  let frameNo = 0;
  let hushed = false;
  // Drawn foe boxes and live enemy warnings on screen this frame (round 2): tags keep off them and stand above their own foe.
  const bodyPool: { x: number; y: number; w: number; h: number; owner: number }[] = [];
  const bodies: BodyRect[] = [];
  const bodyOfFoe = new Map<number, (typeof bodyPool)[number]>();
  const bodyOfCluster = new Map<number, (typeof bodyPool)[number]>();
  const corner: ScreenPoint = { x: 0, y: 0, visible: false };
  /** Screen box of a body r metres round (x, z), from `low` to `high` metres up; false when behind the camera or off screen. */
  const screenBox = (x: number, z: number, low: number, high: number, r: number, out: { x: number; y: number; w: number; h: number }): boolean => {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (let k = 0; k < 8; k += 1) {
      project(x + (k & 1 ? r : -r), k & 4 ? high : low, z + (k & 2 ? r : -r), corner);
      if (!corner.visible && corner.x <= -1e4 && corner.y <= -1e4) return false;
      if (corner.x < x0) x0 = corner.x;
      if (corner.x > x1) x1 = corner.x;
      if (corner.y < y0) y0 = corner.y;
      if (corner.y > y1) y1 = corner.y;
    }
    if (x1 < 0 || y1 < 0 || x0 > width || y0 > height) return false;
    out.x = x0;
    out.y = y0;
    out.w = x1 - x0;
    out.h = y1 - y0;
    return true;
  };
  /** Every live foe's drawn box (a swarm cluster as one box round its ring), owned by its word's tag. */
  const readBodies = (world: World): void => {
    bodies.length = 0;
    bodyOfFoe.clear();
    bodyOfCluster.clear();
    for (const enemy of world.enemies.list) {
      if (!enemy.alive || enemy.freed) continue;
      const look = foeDrawLook(enemy.foe);
      const ring = enemy.cluster >= 0 && look.gait === "swarm" ? drawnClusters.get(enemy.cluster) : undefined;
      let body = ring !== undefined ? bodyOfCluster.get(enemy.cluster) : undefined;
      if (body === undefined) {
        const [w, h, l] = foeDrawnSize(enemy.foe);
        const low = Math.max(uToM(enemy.y), look.placeholder.hoverM);
        const next = bodyPool[bodies.length] ?? { x: 0, y: 0, w: 0, h: 0, owner: -1 };
        bodyPool[bodies.length] = next;
        const seen = ring !== undefined
          ? screenBox(ring.x, ring.z, low, low + h, ring.radius, next)
          : screenBox(uToM(enemy.x), uToM(enemy.z), low, low + h, Math.max(w, l) / 2, next);
        if (!seen) continue;
        next.owner = -1;
        bodies.push(next);
        body = next;
        if (ring !== undefined) bodyOfCluster.set(enemy.cluster, next);
      }
      if (enemy.word >= 0) body.owner = enemy.word;
      bodyOfFoe.set(enemy.slot, body);
    }
    // Live enemy warnings (view/telegraphs.ts): no tag hides a wind-up when another spot is free.
    for (const warning of drawnWarnings) {
      const next = bodyPool[bodies.length] ?? { x: 0, y: 0, w: 0, h: 0, owner: -1 };
      bodyPool[bodies.length] = next;
      if (!screenBox(warning.x, warning.z, warning.y, warning.y + 0.2, warning.radius, next)) continue;
      next.owner = -1;
      bodies.push(next);
    }
  };

  // A web font that lands after the first measure changes every width: measure again.
  const remeasure = () => {
    for (const tag of tags) tag.key = "";
  };
  doc.fonts?.addEventListener("loadingdone", remeasure);

  const readAvoid = (now: number) => {
    if (now - avoidReadAt < 500) return;
    avoidReadAt = now;
    if (options.avoid) {
      avoid = options.avoid();
      return;
    }
    const base = layer.getBoundingClientRect();
    avoid = [...doc.querySelectorAll<HTMLElement>("[data-dh-avoid], [data-keepout]")]
      .map((el) => el.getBoundingClientRect())
      .filter((r) => r.width > 0 && r.height > 0)
      .map((r) => ({ x: r.left - base.left, y: r.top - base.top, w: r.width, h: r.height }));
  };

  /** Which live words show a meaning line: allowed by 01 §6.3, at most 4, new words first, then the nearest. */
  const meaningSlots = (world: World): Set<number> => {
    const out = new Set<number>();
    if (!options.gloss) return out;
    const meaning = DIFFICULTY[world.difficulty].meaning;
    const ranked: { slot: number; key: number }[] = [];
    world.words.live.forEach((word, slot) => {
      if (word === null) return;
      const deckWord = world.words.deck.words[word.index];
      if (!deckWord) return;
      const level = wordLevel(deckWord);
      const allowed = meaning === "always" || (meaning === "first" ? level === "new" : level === "new" || level === "unremembered") || word.errors >= 3;
      if (!allowed) return;
      const foe = targetFoe(world, word);
      const d = foe ? Math.hypot(foe.x, foe.z) : 1e12;
      ranked.push({ slot, key: (level === "new" ? 0 : 1e13) + d });
    });
    ranked.sort((a, b) => a.key - b.key);
    for (const item of ranked.slice(0, LEARNING.meaningTagsMax)) out.add(item.slot);
    return out;
  };

  const targetFoe = (world: World, word: LiveWord): EnemyState | null => {
    if (word.target === null || word.target.kind !== "enemy") return null;
    const enemy = world.enemies.list[word.target.slot];
    return enemy && enemy.alive && enemy.serial === word.target.serial ? enemy : null;
  };

  /** Anchor world point (metres) of a word, or null when it has nothing to stand on. */
  const anchorOf = (world: World, slot: number, word: LiveWord): [number, number, number, number] | null => {
    const foe = targetFoe(world, word);
    if (foe) {
      const x = uToM(foe.x);
      const z = uToM(foe.z);
      const r = Math.hypot(x, z);
      if (r * 1000 <= RINGS.dangerMm && word.kind !== "urgent") {
        // Fixed ring slot around the dais (05 §4.3), kept while the foe stays inside.
        let ring = ringOf.get(slot);
        if (ring === undefined) {
          const taken = new Set(ringOf.values());
          ring = ringSlot(Math.atan2(z, x), taken);
          ringOf.set(slot, ring);
        }
        const angle = (ring * Math.PI * 2) / RING_SLOTS;
        return [Math.cos(angle) * RING_RADIUS_M, RING_HEIGHT_M, Math.sin(angle) * RING_RADIUS_M, 1];
      }
      ringOf.delete(slot);
      return [x, headM(foe), z, 0];
    }
    ringOf.delete(slot);
    if (word.target !== null && word.target.kind === "hero") return [0, FIRE_DRAGON.hoverMm / 1000 + 2.2, 0, 0];
    if (word.kind === "flag") {
      const banner = world.boss.banners.find((b) => b.word === slot);
      if (banner) return [uToM(banner.x), 3, uToM(banner.z), 0];
    }
    return null;
  };

  const render = (tag: Tag, world: World, slot: number, word: LiveWord, showMeaning: boolean, now: number): void => {
    const style = KIND_STYLE[word.kind];
    const deckWord: DeckWord | undefined = world.words.deck.words[word.index];
    const isNew = deckWord?.group === "new";
    const foe = targetFoe(world, word);
    const near = foe !== null && Math.hypot(uToM(foe.x), uToM(foe.z)) * 1000 <= RINGS.dangerMm;
    const pink = now < tag.pinkUntil || tag.pinkAt === word.typed;
    const ticking = now - tag.tickAt < MS.tick;
    const seals = foe && foe.general ? upcomingSeals(world, foe) : null;
    const meaning = showMeaning && options.gloss ? shortMeaning(options.gloss(word.text)?.vi ?? "") : "";
    const key = [word.text, word.typed, word.tier, word.kind, pink, isNew, meaning, seals?.join(), near, now < tag.seepUntil].join("|");
    if (key === tag.key) return;
    tag.key = key;
    let html = "";
    for (let k = 0; k < word.text.length; k += 1) {
      // "j": the letter just typed pops up and glows once (05 §4.3 "nảy"; test passes 26–27/10: only its colour changed).
      const popping = ticking && k === tag.tickIndex;
      const cls = (k < word.typed ? "t " : "") + (k < word.tier ? "f " : "") + (pink && k === word.typed ? "p " : "") + (word.errors >= 3 && k === word.typed ? "h " : "") + (popping ? "j" : "");
      // A pink/meaning change replaces the span: resume the same pop at its elapsed time.
      const delay = popping ? ' style="--dh-letter-delay:' + (-Math.max(0, now - tag.tickAt)).toFixed(1) + 'ms"' : "";
      html += cls === "" ? word.text[k] : '<span class="' + cls.trim() + '"' + delay + ">" + word.text[k] + "</span>";
    }
    tag.word.innerHTML = html;
    tag.icon.innerHTML = svgIcon(style.icon);
    tag.icon.title = style.label;
    tag.badge.textContent = isNew ? "NEW" : "";
    tag.dots.innerHTML = seals ? seals.map((seal) => (seal ? '<span class="s">◆</span>' : "●")).join("") : "";
    tag.mean.textContent = meaning;
    tag.el.className =
      "dh-tag " + style.cls + (near ? " is-near" : "") + (world.words.lock === slot ? " is-locked" : "") + (now - tag.bornAt < 150 ? " is-born" : "") + (now < tag.shakeUntil ? " is-shake" : "") +
      (ticking ? " is-tick" : "") + (now < tag.seepUntil ? " is-seep" : "");
    tag.el.dataset.word = word.text;
    tag.el.dataset.kind = word.kind;
    // Both sizes measured once per change: the solver may shrink the frame (padding and border only).
    tag.w = tag.el.offsetWidth;
    tag.h = tag.el.offsetHeight;
    tag.el.classList.add("is-tight");
    tag.sw = tag.el.offsetWidth;
    tag.sh = tag.el.offsetHeight;
    tag.el.classList.remove("is-tight");
  };

  // "gone": the word's foe died (VFX round 9: under Sky Fire's blast the 200 ms fold sat over the damage number).
  const leave = (tag: Tag, how: "done" | "fold" | "gone", now: number) => {
    if (tag.slot < 0) return;
    bySlot.delete(tag.slot);
    ringOf.delete(tag.slot);
    tag.slot = -1;
    tag.leaving = how;
    tag.leaveAt = now;
    tag.el.classList.add(how === "done" ? "is-done" : how === "gone" ? "is-gone" : "is-fold");
    tag.line.style.display = "none";
  };

  return {
    onEvents(events: readonly SimEvent[], world: World): void {
      const now = performance.now();
      for (const event of events) {
        if (event.type === "word-progress" && event.key === "wrong") {
          const tag = bySlot.get(event.word);
          if (tag) {
            tag.shakeUntil = now + MS.shake;
            tag.pinkUntil = now + MS.pink;
            tag.pinkAt = event.typed;
            tag.el.classList.remove("is-shake");
            void tag.el.offsetWidth;
            tag.el.classList.add("is-shake");
          }
        } else if (event.type === "word-progress" && (event.key === "advance" || event.key === "lock" || event.key === "done")) {
          const tag = bySlot.get(event.word);
          if (tag) {
            tag.tickAt = now;
            tag.tickIndex = event.typed - 1;
            tag.pinkAt = -1;
            tag.el.classList.remove("is-tick");
            void tag.el.offsetWidth;
            tag.el.classList.add("is-tick");
          }
        } else if (event.type === "blight") {
          // Héo lan seeps from these foes: their tags flash so the player sees which words cost HP (test pass 27/10).
          for (const [x, z] of event.from) {
            for (const [slot, tag] of bySlot) {
              const live = world.words.live[slot];
              const foe = live ? targetFoe(world, live) : null;
              if (foe !== null && Math.abs(uToM(foe.x) - x) < 0.6 && Math.abs(uToM(foe.z) - z) < 0.6) tag.seepUntil = now + 520;
            }
          }
        } else if (event.type === "word-assigned") {
          textOf.set(event.word, event.text);
        } else if (event.type === "word-released") {
          const tag = bySlot.get(event.word);
          if (tag && event.reason === "done") burst(tag, textOf.get(event.word) ?? "");
          textOf.delete(event.word);
          if (tag) leave(tag, event.reason === "done" ? "done" : event.reason === "target-gone" ? "gone" : "fold", now);
        }
      }
      void world;
    },

    frame(world: World, info: FrameInfo): void {
      const now = info.now;
      frameNo += 1;
      const quiet = options.quiet?.() === true;
      if (quiet !== hushed) {
        hushed = quiet;
        layer.style.visibility = quiet ? "hidden" : "";
        if (quiet) {
          for (const tag of tags) if (tag.leaving !== "") tag.leaveAt = -Infinity;
          for (const spark of sparks) spark.classList.remove("is-on");
        }
      }
      const rect = layer.getBoundingClientRect();
      if (rect.width !== width || rect.height !== height) {
        width = rect.width;
        height = rect.height;
        layer.style.setProperty("--dh-tag-font", tagFontPx(height, options.sizePct ?? 100) + "px");
        for (const tag of tags) tag.key = "";
      }
      readAvoid(now);
      readBodies(world);
      const meanings = meaningSlots(world);
      const boxes: TagBox[] = [];
      const anchors = new Map<number, { x: number; y: number; ring: boolean; chip: boolean; angle: number; fx: number; fy: number }>();
      const lock = world.words.lock;
      // 1. Bind and render (text writes and measuring happen only on change).
      world.words.live.forEach((word, slot) => {
        if (word === null) return;
        let tag = bySlot.get(slot);
        if (tag && tag.born !== word.bornTick) {
          leave(tag, "fold", now);
          tag = undefined;
        }
        if (!tag) {
          tag = tags.find((free) => free.slot < 0 && free.leaving === "");
          if (!tag) return;
          tag.slot = slot;
          tag.born = word.bornTick;
          tag.bornAt = now;
          tag.key = "";
          tag.prev = undefined;
          tag.back = undefined;
          tag.yieldAt = -1e9;
          tag.pinkAt = -1;
          tag.tickAt = -1e9;
          tag.tickIndex = -1;
          tag.seepUntil = 0;
          tag.el.className = "dh-tag is-born";
          tag.el.style.opacity = "1";
          bySlot.set(slot, tag);
        }
        tag.seen = frameNo;
        render(tag, world, slot, word, meanings.has(slot), now);
        tag.el.classList.toggle("is-locked", lock === slot);
        if (now - tag.bornAt >= 150 && tag.el.classList.contains("is-born")) tag.el.classList.remove("is-born");
        // HP bar (01 §3.1): medium and up always, small ones once hurt.
        const foe = targetFoe(world, word);
        if (foe) {
          const small = !foe.general && ENEMIES[foe.foe as EnemyId].tier !== "medium" && ENEMIES[foe.foe as EnemyId].tier !== "heavy" && ENEMIES[foe.foe as EnemyId].tier !== "giant";
          const show = !small || foe.hp < foe.hpMax;
          if (tag.hp.hidden === show) tag.hp.hidden = !show;
          if (show) tag.hpFill.style.width = Math.round((100 * Math.max(0, foe.hp)) / Math.max(1, foe.hpMax)) + "%";
        } else if (!tag.hp.hidden) tag.hp.hidden = true;
        const anchor = anchorOf(world, slot, word);
        if (anchor === null) {
          anchors.set(slot, { x: width / 2, y: 96, ring: false, chip: false, angle: 0, fx: width / 2, fy: 96 });
        } else {
          project(anchor[0], anchor[1], anchor[2], point);
          let x = point.x;
          let y = point.y;
          const inside = point.visible && x >= 0 && y >= 0 && x <= width && y <= height;
          let fx = x;
          let fy = y;
          let chip = false;
          let angle = 0;
          if (anchor[3] === 1 && foe) {
            project(uToM(foe.x), headM(foe), uToM(foe.z), point);
            fx = point.x;
            fy = point.y;
          } else if (inside && foe) {
            // Above the foe's whole drawn box: a long, low body (boar, wolf) or a spread swarm reaches higher on screen than its head.
            const own = bodyOfFoe.get(foe.slot);
            if (own !== undefined && own.y - 3 < y) y = own.y - 3;
          }
          if (!inside) {
            const edge = edgeChip(x, y, width, height, 40);
            x = edge.x;
            y = edge.y + 16;
            angle = edge.angle;
            chip = true;
          }
          anchors.set(slot, { x, y, ring: anchor[3] === 1, chip, angle, fx, fy });
        }
        const a = anchors.get(slot)!;
        const word0 = world.words.deck.words[word.index];
        // Locked first, then special words, new words, ring tags, then lower on screen (nearer the camera).
        const priority = (lock === slot ? 1e9 : 0) + (word.kind === "urgent" || word.kind === "seal" || word.kind === "general" ? 1e6 : 0) + (word0?.group === "new" ? 1e5 : 0) + (a.ring ? 5e4 : 0) + a.y;
        // A moved tag holds its spot ≥ 0.5 s (05 §4.3); one at its ideal spot stays there while it is free.
        const ideal = tag.prev !== undefined && tag.prev.dx === 0 && tag.prev.row === 0 && !tag.prev.shrunk && tag.prev.dy === undefined;
        const held = now - tag.movedAt < MS.hold;
        const prev = tag.prev && (ideal || held) ? tag.prev : undefined;
        // The locked tag shows at 110 % and a new one pops to 106 %: reserve that room (scaled about its bottom centre).
        const grow = lock === slot ? 1.1 : now - tag.bornAt < 150 ? 1.06 : 1;
        // Ring-slot tags keep off bodies too, their own foe's included (26/10 review); edge chips sit at the screen's edge.
        boxes.push({
          id: slot, ax: a.x, ay: a.y, w: Math.ceil(tag.w * grow), h: Math.ceil(tag.h * grow), sw: Math.ceil(tag.sw * grow), sh: Math.ceil(tag.sh * grow), priority, prev,
          firm: held, yielded: held && now - tag.yieldAt < MS.hold, back: now - tag.backAt < MS.hold ? tag.back : undefined, clearBodies: !a.chip, ownClear: a.ring && !a.chip,
        });
      });
      // 2. Lay out (pure) and move.
      const places = layoutTags(boxes, { width, height, avoid, bodies, rowStep: Math.round(34 * (height / 1080 > 0.8 ? height / 1080 : 0.8)) });
      for (const place of places) {
        const tag = bySlot.get(place.id)!;
        const a = anchors.get(place.id)!;
        if (!tag.prev || tag.prev.dx !== place.dx || tag.prev.row !== place.row || tag.prev.shrunk !== place.shrunk || tag.prev.dy !== place.dy) {
          tag.movedAt = now;
          tag.back = tag.prev;
          tag.backAt = now;
          if (place.left === "body") tag.yieldAt = now;
          // Why it moved ("body", "busy"; "" a new layout once its hold ended): read by dh-crowd's jump count.
          tag.el.dataset.left = place.left ?? "";
        }
        tag.prev = { dx: place.dx, row: place.row, shrunk: place.shrunk, dy: place.dy };
        // The element keeps its own size; centred on the reserved rect's bottom, its scaled body fills the rect.
        const baseW = place.shrunk ? tag.sw : tag.w;
        const baseH = place.shrunk ? tag.sh : tag.h;
        tag.x = place.x + (place.w - baseW) / 2;
        tag.y = place.y + place.h - baseH;
        tag.el.style.transform = "translate(" + tag.x.toFixed(1) + "px," + tag.y.toFixed(1) + "px)";
        tag.el.classList.toggle("is-tight", place.shrunk);
        tag.el.classList.toggle("is-chip", a.chip);
        // A ring-slot tag (foe within 10 m): no style of its own, read by dh-crowd.
        tag.el.classList.toggle("is-ring", a.ring && !a.chip);
        if (a.chip) tag.arrow.style.transform = "translate(-50%,-50%) rotate(" + a.angle.toFixed(3) + "rad) translate(" + (tag.w / 2 + 6).toFixed(0) + "px,0)";
        const lead = (place.leader || a.ring) && !a.chip;
        tag.line.style.display = lead ? "" : "none";
        if (lead) {
          tag.line.setAttribute("x1", (place.x + place.w / 2).toFixed(1));
          tag.line.setAttribute("y1", (place.y + place.h).toFixed(1));
          tag.line.setAttribute("x2", a.fx.toFixed(1));
          tag.line.setAttribute("y2", a.fy.toFixed(1));
        }
      }
      // 3. Tags whose word went without an event (a reset run) fold; leaving tags free their element.
      for (const tag of tags) {
        if (tag.slot >= 0 && tag.seen !== frameNo) leave(tag, "fold", now);
        if (tag.leaving !== "" && now - tag.leaveAt >= MS.leave) {
          tag.leaving = "";
          tag.el.style.opacity = "0";
          tag.el.className = "dh-tag";
          tag.key = "";
        }
      }
      // 4. A faint dot over each foe without a word (05 §4.3).
      let used = 0;
      for (const enemy of world.enemies.list) {
        if (used >= DOTS) break;
        if (!enemy.alive || enemy.freed || enemy.word >= 0) continue;
        project(uToM(enemy.x), headM(enemy), uToM(enemy.z), point);
        if (!point.visible || point.x < 0 || point.y < 0 || point.x > width || point.y > height) continue;
        const dot = dots[used++]!;
        dot.style.display = "";
        dot.style.transform = "translate(" + point.x.toFixed(1) + "px," + point.y.toFixed(1) + "px)";
      }
      for (let k = used; k < DOTS; k += 1) if (dots[k]!.style.display !== "none") dots[k]!.style.display = "none";
    },

    dispose(): void {
      doc.fonts?.removeEventListener("loadingdone", remeasure);
      layer.remove();
    },
  };
}
