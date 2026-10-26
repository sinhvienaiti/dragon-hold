import { describe, expect, it } from "vitest";
import { layoutTags, type BodyRect, type Rect, type TagBox } from "../../src/ui/tags";

const overlap = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const covered = (tag: Rect, body: Rect) => {
  const ix = Math.min(tag.x + tag.w, body.x + body.w) - Math.max(tag.x, body.x);
  const iy = Math.min(tag.y + tag.h, body.y + body.h) - Math.max(tag.y, body.y);
  return ix > 0 && iy > 0 ? (ix * iy) / (body.w * body.h) : 0;
};

describe("word tags keep the crowd and its warnings visible (round 2)", () => {
  const view = { width: 1280, height: 720 };

  it("moves off another foe's body standing right where the tag would sit", () => {
    // A foe behind (higher on screen) the tagged one, under the tag's ideal spot.
    const behind: BodyRect = { x: 480, y: 262, w: 40, h: 34, owner: -1 };
    const [place] = layoutTags([{ id: 1, ax: 500, ay: 300, w: 80, h: 30, priority: 1 }], { ...view, bodies: [behind] });
    expect(covered(place!, behind)).toBeLessThanOrEqual(0.2);
    expect(Math.abs(place!.dx)).toBeLessThanOrEqual(120);
    expect(place!.row).toBeLessThanOrEqual(3);
  });

  it("never moves for its own foe's body", () => {
    const own: BodyRect = { x: 480, y: 262, w: 40, h: 34, owner: 1 };
    const [place] = layoutTags([{ id: 1, ax: 500, ay: 300, w: 80, h: 30, priority: 1 }], { ...view, bodies: [own] });
    expect(place).toMatchObject({ dx: 0, row: 0, leader: false });
  });

  it("sits over bodies only when no clear spot is free, and still never overlaps another tag", () => {
    // A wall of foes over every push and row: no clear spot anywhere in reach.
    const wall: BodyRect[] = [];
    for (let x = 300; x < 760; x += 40) for (let y = 150; y < 320; y += 30) wall.push({ x, y, w: 38, h: 28, owner: -1 });
    const tags: TagBox[] = Array.from({ length: 6 }, (_, k) => ({ id: k, ax: 520, ay: 300, w: 80, h: 30, priority: 6 - k }));
    const places = layoutTags(tags, { ...view, bodies: wall });
    expect(places).toHaveLength(6);
    for (let i = 0; i < places.length; i += 1) for (let j = i + 1; j < places.length; j += 1) expect(overlap(places[i]!, places[j]!)).toBe(false);
    // The first tag takes the spot hiding the least of any one body: no more than its ideal spot would.
    const worst = (rect: Rect) => Math.max(...wall.map((body) => covered(rect, body)));
    const first = places.find((p) => p.id === 0)!;
    expect(worst(first)).toBeLessThanOrEqual(worst({ x: 520 - 40, y: 300 - 30, w: 80, h: 30 }));
    expect(Math.abs(first.dx)).toBeLessThanOrEqual(120);
    expect(first.row).toBeLessThanOrEqual(3);
  });

  it("over bodies, takes the free spot that hides the least of one, not the first (dh-crowd 720p seed 5: a wordless foe 83 % under a tag)", () => {
    // A bridge-head crowd at 720p: a wordless foe (24 × 46) right above the tagged one, where its tag would sit;
    // the foes either side fill every clear push and row, so no spot hides ≤ 20 % of every body.
    const behind: BodyRect = { x: 488, y: 230, w: 24, h: 46, owner: -1 };
    const crowd: BodyRect[] = [behind];
    for (let x = 300; x <= 700; x += 34) for (let y = 120; y <= 280; y += 40) if (Math.abs(x + 12 - 500) > 30 || y < 200) crowd.push({ x, y, w: 24, h: 46, owner: -1 });
    const tag: TagBox = { id: 1, ax: 500, ay: 300, w: 104, h: 44, priority: 1, prev: { dx: 0, row: 0, shrunk: false } };
    const [place] = layoutTags([tag], { ...view, bodies: crowd });
    const worst = (rect: Rect) => Math.max(...crowd.map((body) => covered(rect, body)));
    const ideal = { x: 500 - 52, y: 300 - 44, w: 104, h: 44 };
    // The ideal spot hides most of the foe behind; the old fallback kept the tag there.
    expect(worst(ideal)).toBeGreaterThanOrEqual(0.4);
    expect(worst(place!)).toBeLessThan(0.4);
    expect(worst(place!)).toBeLessThanOrEqual(worst(ideal) - 0.1);
  });

  it("over bodies, keeps its last spot unless another hides clearly less (no jitter)", () => {
    // Panels leave two spots free: the ideal one (row 0) and row 3. Row 0 hides 30 % of A, row 3 (shrunk) 21.6 % of B.
    const avoid: Rect[] = [
      { x: 0, y: 0, w: 459, h: 720 },
      { x: 541, y: 0, w: 739, h: 720 },
      { x: 460, y: 199, w: 80, h: 70 },
      { x: 460, y: 0, w: 80, h: 167 },
      { x: 460, y: 301, w: 80, h: 419 },
    ];
    const a: BodyRect = { x: 460, y: 270, w: 40, h: 100, owner: -1 };
    const b: BodyRect = { x: 460, y: 168, w: 40, h: 120, owner: -1 };
    const base: TagBox = { id: 1, ax: 500, ay: 300, w: 80, h: 30, priority: 1 };
    expect(covered({ x: 460, y: 270, w: 80, h: 30 }, a)).toBeCloseTo(0.3, 6);
    // No last spot: the least hiding one.
    const [fresh] = layoutTags([base], { ...view, avoid, bodies: [a, b] });
    expect(fresh).toMatchObject({ dx: 0, row: 3, shrunk: true });
    // Its last spot hides 8.4 points more, under the 10-point margin: it stays.
    const [kept] = layoutTags([{ ...base, prev: { dx: 0, row: 0, shrunk: false } }], { ...view, avoid, bodies: [a, b] });
    expect(kept).toMatchObject({ dx: 0, row: 0, shrunk: false });
  });

  it("counts what tags placed before it hide of a body: two tags never add up past the clear share (1080p: 42 % of an archer under two tags)", () => {
    // A body between two anchors: alone, each tag's ideal spot is clear (13.3 % and 18 %); together they hide 31.3 %.
    const archer: BodyRect = { x: 490, y: 240, w: 40, h: 75, owner: -1 };
    const tags: TagBox[] = [
      { id: 1, ax: 470, ay: 260, w: 80, h: 30, priority: 2 },
      { id: 2, ax: 552, ay: 300, w: 80, h: 30, priority: 1 },
    ];
    expect(covered({ x: 430, y: 230, w: 80, h: 30 }, archer)).toBeCloseTo((20 * 20) / (40 * 75), 6);
    expect(covered({ x: 512, y: 270, w: 80, h: 30 }, archer)).toBeCloseTo((18 * 30) / (40 * 75), 6);
    const places = layoutTags(tags, { ...view, bodies: [archer] });
    const union = places.reduce((sum, p) => sum + covered(p, archer), 0);
    expect(union).toBeLessThanOrEqual(0.2 + 1e-9);
    for (let i = 0; i < places.length; i += 1) for (let j = i + 1; j < places.length; j += 1) expect(overlap(places[i]!, places[j]!)).toBe(false);
  });

  it("keeps its spot over a body inside its hold (no jumping), leaves it once the hold is over", () => {
    // The ideal spot hides 25 % of the foe behind: over the clear share, under the hold's limit.
    const behind: BodyRect = { x: 480, y: 262, w: 40, h: 120, owner: -1 };
    const base = { id: 1, ax: 500, ay: 300, w: 80, h: 30, priority: 1, prev: { dx: 0, row: 0, shrunk: false } };
    expect(covered({ x: 460, y: 270, w: 80, h: 30 }, behind)).toBeCloseTo(0.25, 6);
    const [held] = layoutTags([{ ...base, firm: true }], { ...view, bodies: [behind] });
    expect(held).toMatchObject({ dx: 0, row: 0 });
    const [moved] = layoutTags([{ ...base, firm: false }], { ...view, bodies: [behind] });
    expect(covered(moved!, behind)).toBeLessThanOrEqual(0.2);
  });

  it("leaves its spot inside its hold when a foe arrives under it past the hold's limit (dh-crowd 720p seed 1: a wordless foe 83 % under a held tag)", () => {
    // A foe spawned under a held tag at the top of the lane: the tag's spot hides 76 % of it.
    const arrived: BodyRect = { x: 480, y: 262, w: 40, h: 34, owner: -1 };
    const base = { id: 1, ax: 500, ay: 300, w: 80, h: 30, priority: 1, prev: { dx: 0, row: 0, shrunk: false }, firm: true };
    expect(covered({ x: 460, y: 270, w: 80, h: 30 }, arrived)).toBeGreaterThan(0.3);
    const [place] = layoutTags([base], { ...view, bodies: [arrived] });
    expect(covered(place!, arrived)).toBeLessThanOrEqual(0.2);
    // The limit is an option: at 0.8 the same tag holds.
    const [held] = layoutTags([base], { ...view, bodies: [arrived], bodyFirm: 0.8 });
    expect(held).toMatchObject({ dx: 0, row: 0 });
    // A third of a body is past the default 30 % (10 points under dh-crowd's 40 %, on the same exact areas).
    const third: BodyRect = { x: 480, y: 262, w: 40, h: 90, owner: -1 };
    expect(covered({ x: 460, y: 270, w: 80, h: 30 }, third)).toBeCloseTo(1 / 3, 6);
    const [left] = layoutTags([base], { ...view, bodies: [third] });
    expect(covered(left!, third)).toBeLessThanOrEqual(0.2);
  });

  it("a held tag that grew (a meaning line) leaves a spot that now hides a body past the limit", () => {
    // The word gained its meaning line: the same spot, 30 px taller, now covers the foe above it.
    const above: BodyRect = { x: 480, y: 230, w: 40, h: 50, owner: -1 };
    const small = { id: 1, ax: 500, ay: 300, w: 80, h: 30, priority: 1, prev: { dx: 0, row: 0, shrunk: false }, firm: true };
    expect(covered({ x: 460, y: 270, w: 80, h: 30 }, above)).toBeCloseTo(0.2, 6);
    expect(layoutTags([small], { ...view, bodies: [above] })[0]).toMatchObject({ dx: 0, row: 0 });
    const grown = { ...small, w: 140, h: 60 };
    expect(covered({ x: 430, y: 240, w: 140, h: 60 }, above)).toBeCloseTo(0.8, 6);
    const [place] = layoutTags([grown], { ...view, bodies: [above] });
    expect(covered(place!, above)).toBeLessThanOrEqual(0.3);
  });

  it("over bodies, does not stay on a last spot past the hold's limit when another hides less", () => {
    // Two spots free (row 0 and row 3): row 0 hides 40 % of A, row 3 (shrunk) 32.4 % of B. Within the 10-point
    // stay margin (the rule before 26/10 kept row 0), but row 0 is past the 30 % limit: the tag moves.
    const avoid: Rect[] = [
      { x: 0, y: 0, w: 459, h: 720 },
      { x: 541, y: 0, w: 739, h: 720 },
      { x: 460, y: 199, w: 80, h: 70 },
      { x: 460, y: 0, w: 80, h: 167 },
      { x: 460, y: 301, w: 80, h: 419 },
    ];
    const a: BodyRect = { x: 460, y: 270, w: 40, h: 75, owner: -1 };
    const b: BodyRect = { x: 460, y: 168, w: 40, h: 80, owner: -1 };
    const share = (rect: Rect) => Math.max(covered(rect, a), covered(rect, b));
    expect(covered({ x: 460, y: 270, w: 80, h: 30 }, a)).toBeCloseTo(0.4, 6);
    const tag: TagBox = { id: 1, ax: 500, ay: 300, w: 80, h: 30, priority: 1, prev: { dx: 0, row: 0, shrunk: false } };
    const [fresh] = layoutTags([{ ...tag, prev: undefined }], { ...view, avoid, bodies: [a, b] });
    const [place] = layoutTags([tag], { ...view, avoid, bodies: [a, b] });
    expect(fresh).toMatchObject({ dx: 0, row: 3, shrunk: true });
    expect(share(fresh!)).toBeCloseTo(1036 / 3200, 6);
    expect(place).toMatchObject({ dx: 0, row: 3, shrunk: true });
  });

  it("the last resort (rings round the anchor) keeps off its own foe (dh-crowd 1080p seed 6: a ring spot hid its own foe 56 %)", () => {
    // Panels fill every push and row; the first free ring spots, just under the anchor, lie over the tag's own foe.
    const own: BodyRect = { x: 480, y: 300, w: 40, h: 60, owner: 1 };
    const avoid: Rect[] = [{ x: 330, y: 160, w: 340, h: 141 }];
    const [place] = layoutTags([{ id: 1, ax: 500, ay: 300, w: 80, h: 30, priority: 1 }], { ...view, avoid, bodies: [own] });
    for (const zone of avoid) expect(overlap(place!, zone)).toBe(false);
    expect(overlap(place!, own)).toBe(false);
    expect(place!.leader).toBe(true);
    // With no clean spot within twice the reach, it still takes the nearest free one (never overlap another tag or a panel).
    const wide: Rect[] = [{ x: 0, y: 0, w: 1280, h: 301 }, { x: 0, y: 301, w: 470, h: 419 }, { x: 530, y: 301, w: 750, h: 419 }];
    const [squeezed] = layoutTags([{ id: 1, ax: 500, ay: 300, w: 40, h: 30, sw: 40, sh: 30, priority: 1 }], { ...view, avoid: wide, bodies: [own] });
    for (const zone of wide) expect(overlap(squeezed!, zone)).toBe(false);
  });

  it("the last resort weighs every body round the anchor, below it too (26/10 review: a ring spot under the anchor hid another foe 56 %)", () => {
    // Panels fill every push and row; the tag's own foe stands under the anchor and a wordless foe just below-left,
    // outside the pushes' reach (`near` only looks above the anchor), where the nearest ring spot fell.
    const own: BodyRect = { x: 480, y: 300, w: 40, h: 60, owner: 1 };
    const other: BodyRect = { x: 400, y: 330, w: 40, h: 50, owner: -1 };
    const avoid: Rect[] = [{ x: 330, y: 160, w: 340, h: 141 }];
    expect(covered({ x: 393, y: 342, w: 74, h: 28 }, other)).toBeCloseTo(0.56, 6);
    const [place] = layoutTags([{ id: 1, ax: 500, ay: 300, w: 80, h: 30, priority: 1 }], { ...view, avoid, bodies: [own, other] });
    for (const zone of avoid) expect(overlap(place!, zone)).toBe(false);
    expect(overlap(place!, own)).toBe(false);
    expect(covered(place!, other)).toBeLessThanOrEqual(0.3);
    // Within twice the reach (2 × max(120 px, 3 rows × 34 px)) of the anchor, each way.
    expect(Math.abs(place!.x + place!.w / 2 - 500)).toBeLessThanOrEqual(240);
    expect(Math.abs(place!.y + place!.h - 300)).toBeLessThanOrEqual(240);
  });

  it("ring-slot tags keep off bodies, their own foe's too; edge chips ignore them (26/10 review: ring tags hid foes within 10 m up to 92 %)", () => {
    // A slot's anchor right over a foe walking in (another's) and over the tag's own foe.
    const walker: BodyRect = { x: 480, y: 262, w: 40, h: 34, owner: -1 };
    const ownFoe: BodyRect = { x: 480, y: 262, w: 40, h: 34, owner: 1 };
    const ring: TagBox = { id: 1, ax: 500, ay: 300, w: 80, h: 30, priority: 1, ownClear: true };
    const [a] = layoutTags([ring], { ...view, bodies: [walker] });
    expect(covered(a!, walker)).toBeLessThanOrEqual(0.2);
    const [b] = layoutTags([ring], { ...view, bodies: [ownFoe] });
    expect(covered(b!, ownFoe)).toBeLessThanOrEqual(0.2);
    // A tag over its own foe's head still stands there (it is the anchor's point).
    const [head] = layoutTags([{ ...ring, ownClear: false }], { ...view, bodies: [ownFoe] });
    expect(head).toMatchObject({ dx: 0, row: 0 });
    // Edge chips sit at the screen's edge whatever is under them.
    const [chip] = layoutTags([{ id: 1, ax: 500, ay: 300, w: 80, h: 30, priority: 1, clearBodies: false }], { ...view, bodies: [walker] });
    expect(chip).toMatchObject({ dx: 0, row: 0 });
  });

  it("after a move for a body inside its hold, moves again only for a foe 40 % hidden (26/10 review: tags jumped again inside the hold)", () => {
    const arrived: BodyRect = { x: 480, y: 262, w: 40, h: 34, owner: -1 };
    const third: BodyRect = { x: 480, y: 262, w: 40, h: 90, owner: -1 };
    const base: TagBox = { id: 1, ax: 500, ay: 300, w: 80, h: 30, priority: 1, prev: { dx: 0, row: 0, shrunk: false }, firm: true };
    const [first] = layoutTags([base], { ...view, bodies: [third] });
    expect(first!.left).toBe("body");
    expect(covered(first!, third)).toBeLessThanOrEqual(0.2);
    // It moved for a body less than 0.5 s ago: a third of a foe under its new spot does not move it again.
    const [held] = layoutTags([{ ...base, yielded: true }], { ...view, bodies: [third] });
    expect(held).toMatchObject({ dx: 0, row: 0 });
    expect(held!.left).toBeUndefined();
    // A foe 76 % under it does.
    const [again] = layoutTags([{ ...base, yielded: true }], { ...view, bodies: [arrived] });
    expect(again!.left).toBe("body");
    expect(covered(again!, arrived)).toBeLessThanOrEqual(0.2);
  });

  it("inside its hold it never goes back to the spot it just left while another is free; with none, it does (26/10 review: 216–240 px and back in 100–150 ms)", () => {
    // It left its ideal spot (back) for dx −24; now a higher tag holding its own spot (it grew a line) covers dx −24,
    // and the ideal spot is free again.
    const blocker: TagBox = { id: 2, ax: 476, ay: 300, w: 80, h: 30, priority: 9, prev: { dx: 0, row: 0, shrunk: false }, firm: true };
    const tag: TagBox = { id: 1, ax: 500, ay: 300, w: 80, h: 30, priority: 1, prev: { dx: -24, row: 0, shrunk: false }, firm: true, back: { dx: 0, row: 0, shrunk: false } };
    const places = layoutTags([blocker, tag], view);
    const moved = places.find((p) => p.id === 1)!;
    expect(moved.left).toBe("busy");
    expect([moved.dx, moved.row, moved.shrunk]).not.toEqual([0, 0, false]);
    for (const p of places) if (p.id !== 1) expect(overlap(p, moved)).toBe(false);
    // Panels leave only the spot it left free in reach: it goes back there, not across the screen.
    const avoid: Rect[] = [{ x: 0, y: 0, w: 1280, h: 269 }, { x: 0, y: 301, w: 1280, h: 419 }, { x: 0, y: 269, w: 459, h: 32 }, { x: 541, y: 269, w: 739, h: 32 }];
    const [home] = layoutTags([{ ...tag, prev: { dx: 24, row: 0, shrunk: false } }], { ...view, avoid });
    expect(home).toMatchObject({ dx: 0, row: 0, shrunk: false });
  });

  it("a tag laid out afresh keeps off a held tag's spot while another is free (26/10: most moves inside a hold were held tags pushed off)", () => {
    // A higher tag whose hold ended is laid out again: its ideal spot covers a lower tag's held spot.
    const fresh: TagBox = { id: 2, ax: 476, ay: 300, w: 80, h: 30, priority: 9 };
    const held: TagBox = { id: 1, ax: 500, ay: 300, w: 80, h: 30, priority: 1, prev: { dx: -24, row: 0, shrunk: false }, firm: true };
    const places = layoutTags([fresh, held], view);
    const kept = places.find((p) => p.id === 1)!;
    expect(kept).toMatchObject({ dx: -24, row: 0 });
    expect(kept.left).toBeUndefined();
    expect(overlap(places.find((p) => p.id === 2)!, kept)).toBe(false);
    // With no other spot in reach for it, the higher tag still takes it (the held tag moves).
    const avoid: Rect[] = [{ x: 0, y: 0, w: 1280, h: 269 }, { x: 0, y: 301, w: 1280, h: 419 }, { x: 0, y: 269, w: 435, h: 32 }, { x: 517, y: 269, w: 763, h: 32 }];
    const squeezed = layoutTags([fresh, held], { ...view, avoid });
    expect(squeezed.find((p) => p.id === 2)).toMatchObject({ dx: 0, row: 0 });
    expect(squeezed.find((p) => p.id === 1)!.left).toBe("busy");
  });

  it("over bodies, a last spot past the hold's limit stays unless another hides at least 5 points less (no jump for a point or two)", () => {
    // Two spots free (row 0 and row 3): row 0 hides 34 % of A, row 3 (shrunk) 32.4 % of B: 1.6 points less, it stays.
    const avoid: Rect[] = [
      { x: 0, y: 0, w: 459, h: 720 },
      { x: 541, y: 0, w: 739, h: 720 },
      { x: 460, y: 199, w: 80, h: 70 },
      { x: 460, y: 0, w: 80, h: 167 },
      { x: 460, y: 301, w: 80, h: 419 },
    ];
    const a: BodyRect = { x: 460, y: 270, w: 40, h: 88.24, owner: -1 };
    const b: BodyRect = { x: 460, y: 168, w: 40, h: 80, owner: -1 };
    expect(covered({ x: 460, y: 270, w: 80, h: 30 }, a)).toBeCloseTo(0.34, 3);
    const tag: TagBox = { id: 1, ax: 500, ay: 300, w: 80, h: 30, priority: 1, prev: { dx: 0, row: 0, shrunk: false } };
    const [kept] = layoutTags([tag], { ...view, avoid, bodies: [a, b] });
    expect(kept).toMatchObject({ dx: 0, row: 0, shrunk: false });
  });

  it("lays out 20 tags among 40 bodies within the frame budget", () => {
    const tags: TagBox[] = Array.from({ length: 20 }, (_, k) => ({ id: k, ax: 300 + (k % 5) * 40, ay: 300 + Math.floor(k / 5) * 20, w: 60 + (k % 8) * 14, h: k % 3 === 0 ? 46 : 30, priority: 20 - k }));
    const bodies: BodyRect[] = Array.from({ length: 40 }, (_, k) => ({ x: 260 + (k % 8) * 30, y: 220 + Math.floor(k / 8) * 26, w: 22, h: 30, owner: k < 20 ? k : -1 }));
    for (let k = 0; k < 50; k += 1) layoutTags(tags, { width: 1920, height: 1080, bodies });
    // Best of 5 batches: a busy machine (other workers, a browser) must not fail it.
    let ms = Infinity;
    for (let batch = 0; batch < 5; batch += 1) {
      const start = performance.now();
      const runs = 40;
      for (let k = 0; k < runs; k += 1) layoutTags(tags, { width: 1920, height: 1080, bodies });
      ms = Math.min(ms, (performance.now() - start) / runs);
    }
    expect(ms).toBeLessThan(1);
  });
});
