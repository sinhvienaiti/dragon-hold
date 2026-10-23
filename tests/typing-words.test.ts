import { describe, expect, it } from "vitest";
import { GRADE, LETTER_BUDGET, WORDS } from "../src/content/rules";
import type { SimEvent } from "../src/content/types";
import { withinOneEdit } from "../src/kit/typing";
import { msToTicks } from "../src/sim/fixed";
import {
  SOURCE, availableFirstLetters, chainTier, dealWord, isLockProtected, liveSlots, onEnemyGone, releaseLock, releaseWord, threatX1000, typeBackspace, typeKey,
  upcomingSeals, wordSlowPct,
} from "../src/sim/words";
import { hashWorld, type World } from "../src/sim/world";
import { chainAfter, gradeOf, mcPmOf, mqPmOf } from "../src/typing/grading";
import { advance, code, makeDeck, makeWorld, placeFoe, typeText } from "./typing-helpers";

const events = (world: World) => world.events.drain();
const ofType = <T extends SimEvent["type"]>(list: readonly SimEvent[], type: T) => list.filter((event): event is Extract<SimEvent, { type: T }> => event.type === type);

/** Foes in a ring 8–24 m out on the two ground lanes. */
function crowd(world: World, count: number, foe: "moss-grunt" | "blight-wolf" = "moss-grunt") {
  return Array.from({ length: count }, (_, k) => {
    const r = 11 + (k % 13);
    const lane = k % 2;
    return placeFoe(world, foe, lane === 0 ? -r : r, -3 - (k % 5), lane);
  });
}

function liveTexts(world: World): string[] {
  return liveSlots(world).map((slot) => world.words.live[slot]!.text);
}

describe("word assignment (01 §3.2–3.3, 00 §5)", () => {
  it("gives every live word its own first letter and no two within one edit", () => {
    const world = makeWorld();
    crowd(world, 26);
    advance(world, 120);
    const live = liveSlots(world).map((slot) => world.words.live[slot]!);
    expect(live.length).toBeGreaterThanOrEqual(6);
    const tierOne = live.filter((word) => word.tier === 1).map((word) => word.text[0]);
    expect(new Set(tierOne).size).toBe(tierOne.length);
    // Tier 2 is a fallback only when letters run out; the budget keeps it away here.
    expect(world.words.jams.tier2).toBe(0);
    const letters = world.words.session.deck.letters;
    const deck = world.words.session.deck;
    for (const a of liveSlots(world)) {
      for (const b of liveSlots(world)) {
        if (a >= b) continue;
        const wa = world.words.session.words.word[a]!;
        const wb = world.words.session.words.word[b]!;
        expect(withinOneEdit(letters, deck.start[wa]!, deck.len[wa]!, deck.start[wb]!, deck.len[wb]!, 10)).toBe(false);
      }
    }
  });

  it("keeps live words within the letter budget N_max = min(16, A − 3)", () => {
    const world = makeWorld();
    const a = availableFirstLetters(world.words.deck.words, world.words.deck.vocabLevel);
    const budget = world.words.ledger.budget;
    expect(budget.total).toBe(Math.min(LETTER_BUDGET.nMaxCap, a - LETTER_BUDGET.aOffset));
    expect(budget.total).toBeLessThanOrEqual(16);
    expect(budget.enemy).toBeGreaterThanOrEqual(Math.max(LETTER_BUDGET.foesMin, Math.ceil(0.6 * budget.total)));
    crowd(world, 40);
    for (let k = 0; k < 40; k += 1) {
      advance(world, 15);
      // One first letter per live word: at most N_max ≤ 16 on screen.
      expect(liveSlots(world).length).toBeLessThanOrEqual(budget.total);
      expect(world.words.ledger.total).toBe(liveSlots(world).length);
    }
  });

  it("leaves the two urgent slots to foes in the danger ring", () => {
    const world = makeWorld();
    crowd(world, 40);
    advance(world, 60);
    const plain = world.words.ledger.live[SOURCE.enemy]!;
    expect(plain).toBe(world.words.ledger.budget.total - world.words.ledger.budget.urgent);
    const near = placeFoe(world, "moss-grunt", 0, -8, 0);
    advance(world, 16);
    expect(near.word).toBeGreaterThanOrEqual(0);
    expect(world.words.live[near.word]!.source).toBe(SOURCE.urgentFoe);
  });

  it("deals only inside the 26 m Word Zone and keeps a word until its foe dies", () => {
    const world = makeWorld();
    const far = placeFoe(world, "moss-grunt", -30, -5, 0);
    const near = placeFoe(world, "moss-grunt", -15, -5, 0);
    advance(world, 30);
    expect(far.word).toBe(-1);
    expect(near.word).toBeGreaterThanOrEqual(0);
    const text = world.words.live[near.word]!.text;
    advance(world, 600);
    expect(world.words.live[near.word]!.text).toBe(text);
    near.alive = false;
    onEnemyGone(world, near);
    expect(liveTexts(world)).not.toContain(text);
  });

  it("ranks by threat: closer, faster, attacking, casting and marked foes first", () => {
    const slow = threatX1000(20 * 60_000, 2000, 10, false, false, false);
    expect(slow).toBe(1000);
    expect(threatX1000(10 * 60_000, 2000, 10, false, false, false)).toBe(2000);
    expect(threatX1000(20 * 60_000, 2000, 15, false, false, false)).toBe(1500);
    expect(threatX1000(20 * 60_000, 2000, 10, true, true, true) - slow).toBe((WORDS.attackingBonus + WORDS.castingBonus + WORDS.markedBonus) * 1000);
  });

  it("gives a lane with a foe within 20 m its word before the global pass", () => {
    const world = makeWorld();
    // Fill lane 0 with close foes, then one foe on lane 1 at 19 m.
    crowd(world, 0);
    for (let k = 0; k < 30; k += 1) placeFoe(world, "moss-grunt", -9 - (k % 6) * 0.5, -1 - k * 0.1, 0);
    const lone = placeFoe(world, "moss-grunt", 19, -2, 1);
    advance(world, 2);
    expect(lone.word).toBeGreaterThanOrEqual(0);
  });

  it("shares one word per swarm cluster and moves it to a member when its holder dies", () => {
    const world = makeWorld();
    const ants = Array.from({ length: 6 }, (_, k) => placeFoe(world, "thorn-ant", -14 - k * 0.3, -4, 0, 5));
    advance(world, 2);
    const holders = ants.filter((ant) => ant.word >= 0);
    expect(holders).toHaveLength(1);
    const slot = holders[0]!.word;
    expect(world.words.live[slot]!.kind).toBe("cluster");
    holders[0]!.alive = false;
    onEnemyGone(world, holders[0]!);
    const heirs = ants.filter((ant) => ant.alive && ant.word === slot);
    expect(heirs).toHaveLength(1);
    expect(world.words.live[slot]!.target).toEqual({ kind: "enemy", slot: heirs[0]!.slot, serial: heirs[0]!.serial });
  });

  it("puts new words only on slow small or medium foes 14 m out, at most 2 a wave", () => {
    const world = makeWorld();
    crowd(world, 20);
    const flyers = Array.from({ length: 4 }, (_, k) => placeFoe(world, "thorn-wasp", 0 + k, -20, 2));
    advance(world, 60);
    for (const slot of liveSlots(world)) {
      const word = world.words.live[slot]!;
      if (word.group !== "new") continue;
      const foe = world.enemies.list[(word.target as { slot: number }).slot]!;
      expect(foe.foe).toBe("moss-grunt");
      expect(Math.hypot(foe.x, foe.z) / 60_000).toBeGreaterThanOrEqual(14);
      expect(wordSlowPct(world, foe)).toBe(WORDS.newWordSlowPct);
    }
    for (const wasp of flyers) if (wasp.word >= 0) expect(world.words.live[wasp.word]!.group).not.toBe("new");
    expect(world.words.newThisWave).toBeLessThanOrEqual(2);
  });

  it("is deterministic: same seed and setup, same words and hash", () => {
    const run = () => {
      const world = makeWorld({}, 99);
      crowd(world, 18);
      advance(world, 90);
      return { texts: liveTexts(world), hash: hashWorld(world) };
    };
    expect(run()).toEqual(run());
  });
});

describe("keys, locks and lock protection (01 §3.3)", () => {
  it("locks on the first letter, soft-switches after one letter without an error", () => {
    const world = makeWorld();
    crowd(world, 8);
    advance(world, 2);
    const [a, b] = liveSlots(world).map((slot) => world.words.live[slot]!);
    events(world);
    typeKey(world, code(a!.text[0]!), 0);
    expect(world.words.lock).toBe(liveSlots(world).find((slot) => world.words.live[slot] === a));
    typeKey(world, code(b!.text[0]!), 100);
    expect(world.words.live[world.words.lock]).toBe(b);
    expect(a!.typed).toBe(0);
    expect(a!.errors).toBe(0);
    const progress = ofType(events(world), "word-progress");
    expect(progress.map((event) => event.key)).toEqual(["lock", "switch", "switch"]);
  });

  it("counts a wrong key on the locked word; Backspace takes one letter back; Esc lets go", () => {
    const world = makeWorld();
    crowd(world, 4);
    advance(world, 2);
    const word = world.words.live[liveSlots(world)[0]!]!;
    typeKey(world, code(word.text[0]!));
    typeKey(world, code(word.text[1]!));
    // A key that is no live word's first letter and not the next letter: an error.
    const used = new Set(liveTexts(world).map((text) => text[0]));
    const wrong = [..."abcdefghijklmnopqrstuvwxyz"].find((letter) => !used.has(letter) && letter !== word.text[2])!;
    typeKey(world, code(wrong));
    expect(word.errors).toBe(1);
    expect(world.stats.wrongKeys).toBe(1);
    typeBackspace(world);
    expect(word.typed).toBe(1);
    releaseLock(world);
    expect(world.words.lock).toBe(-1);
    expect(word.typed).toBe(0);
    expect(word.errors).toBe(0);
  });

  it("protects a locked foe with a letter in for 1.2 s from the first lethal blow, then lets it go unpunished", () => {
    const world = makeWorld();
    const foe = placeFoe(world, "moss-grunt", -15, -4, 0);
    advance(world, 2);
    const word = world.words.live[foe.word]!;
    expect(isLockProtected(world, foe)).toBe(false);
    typeKey(world, code(word.text[0]!));
    world.tick += 10;
    expect(isLockProtected(world, foe)).toBe(true);
    const opened = world.tick;
    expect(foe.protectedUntil).toBe(opened + msToTicks(WORDS.lockProtectMs));
    world.tick = opened + msToTicks(WORDS.lockProtectMs) - 1;
    expect(isLockProtected(world, foe)).toBe(true);
    world.tick += 1;
    expect(isLockProtected(world, foe)).toBe(false);
    // Another source kills it now: the lock is lost, counted, and the next stray key is forgiven.
    foe.alive = false;
    onEnemyGone(world, foe);
    expect(world.stats.locksLost).toBe(1);
    expect(world.words.lock).toBe(-1);
    events(world);
    typeKey(world, code("q"));
    expect(world.stats.strayKeys).toBe(0);
    expect(ofType(events(world), "word-progress")).toHaveLength(0);
  });

  it("finishing a word queues no learning for a lost lock and frees the letter for 1 s", () => {
    const world = makeWorld();
    const foe = placeFoe(world, "moss-grunt", -15, -4, 0);
    advance(world, 2);
    const text = world.words.live[foe.word]!.text;
    events(world);
    typeText(world, text);
    const list = events(world);
    expect(ofType(list, "word-complete")).toHaveLength(1);
    expect(ofType(list, "word-released")[0]!.reason).toBe("done");
    const letter = code(text[0]!);
    expect(world.words.session.letters.owner[letter]).toBe(-1);
    expect(world.words.session.letters.freeAt[letter]).toBe(world.tick - 1 + msToTicks(WORDS.letterRestMs));
  });

  it("deals the foe's next word 0.25 s later, soft-locked", () => {
    const world = makeWorld();
    const foe = placeFoe(world, "moss-grunt", -15, -4, 0);
    advance(world, 2);
    typeText(world, world.words.live[foe.word]!.text);
    expect(foe.word).toBe(-1);
    advance(world, msToTicks(WORDS.nextWordMs) + 1);
    expect(foe.word).toBeGreaterThanOrEqual(0);
    expect(world.words.lock).toBe(foe.word);
    // The soft lock goes on with its first letter.
    const next = world.words.live[foe.word]!;
    typeKey(world, code(next.text[0]!));
    expect(next.typed).toBe(1);
    expect(next.errors).toBe(0);
  });
});

describe("grades and chain (01 §3.7–3.8, 00 §4.2)", () => {
  // t_exp at E 35, d 1.0 for 5 letters: 12 × 4 / 35 s = 82.3 ticks; Chớp at ≤ 0.85 of it.
  it("grades Chớp, Hoàn hảo, Tốt, Vừa, Ẩu with no randomness", () => {
    expect(gradeOf(5, 0, 60, 35, "known", "enemy")).toBe("flash");
    expect(gradeOf(5, 0, 80, 35, "known", "enemy")).toBe("perfect");
    expect(gradeOf(6, 1, 50, 35, "known", "enemy")).toBe("good");
    expect(gradeOf(5, 1, 50, 35, "known", "enemy")).toBe("ok");
    expect(gradeOf(7, 2, 50, 35, "known", "enemy")).toBe("sloppy");
    expect(gradeOf(7, 2, 50, 35, "known", "boss-seal")).toBe("good");
    // New words get more time (d 0.70): the same keys are a Chớp.
    expect(gradeOf(5, 0, 80, 35, "new", "enemy")).toBe("flash");
  });

  it("multiplies by M_q ×1.25 / 1.10 / 1.00 / 0.90 / 0.60 and M_c up to ×1.16", () => {
    expect(["flash", "perfect", "good", "ok", "sloppy"].map((grade) => mqPmOf(grade as never))).toEqual([1250, 1100, 1000, 900, 600]);
    expect([0, 4, 5, 9, 10, 19, 20, 39, 40, 400].map(mcPmOf)).toEqual([1000, 1000, 1040, 1040, 1080, 1080, 1120, 1120, 1160, 1160]);
    expect([0, 5, 10, 20, 40].map(chainTier)).toEqual([0, 1, 2, 3, 4]);
  });

  it("moves the chain: +1, special +2, Vừa keeps, Ẩu halves", () => {
    expect(chainAfter(7, "perfect", "enemy")).toBe(8);
    expect(chainAfter(7, "flash", "seal")).toBe(7 + GRADE.specialChainStep);
    expect(chainAfter(7, "ok", "enemy")).toBe(7);
    expect(chainAfter(7, "sloppy", "enemy")).toBe(3);
  });

  it("emits grade and word-complete; the chain counts in the run", () => {
    const world = makeWorld();
    const foe = placeFoe(world, "moss-grunt", -15, -4, 0);
    advance(world, 2);
    const text = world.words.live[foe.word]!.text;
    events(world);
    typeText(world, text);
    const list = events(world);
    const [grade] = ofType(list, "grade");
    const [done] = ofType(list, "word-complete");
    expect(grade!.grade).toBe(done!.grade);
    expect(done!.errors).toBe(0);
    expect(done!.keyTicks).toBe(text.length - 1);
    expect(done!.responseMs).toBe((text.length - 1) * 150);
    expect(done!.activity).toBe("typing-enemy");
    expect(world.words.chain).toBe(1);
    expect(world.stats.words).toBe(1);
  });
});

describe("one scored learning event per word per run (00 D14)", () => {
  it("flags only the first completion of a word as scored", () => {
    // Four short words: the foe's bag repeats after four. Long known words keep A (and the budget) at a real size.
    const long = (
      "kitchen kingdom kangaroo monster mineral morning sunshine silence station teacher thunder triangle weather welcome wardrobe " +
      "balloon blanket butterfly fortune freedom factory giraffe grammar gallery holiday history husband library laundry lettuce " +
      "network nothing notebook painter picture pyramid railway rainbow reading"
    ).split(" ");
    const words = ["cat", "dog", "pig", "hen", ...long];
    const deck = makeDeck(words, 0);
    const small = { ...deck, words: deck.words.map((word, index) => ({ ...word, group: index < 4 ? ("learning" as const) : ("known" as const) })) };
    const world = makeWorld({ deck: small });
    const foe = placeFoe(world, "moss-grunt", -12, -3, 0);
    advance(world, 2);
    const scored: [string, boolean][] = [];
    for (let k = 0; k < 6; k += 1) {
      expect(foe.word).toBeGreaterThanOrEqual(0);
      typeText(world, world.words.live[foe.word]!.text);
      for (const event of ofType(events(world), "word-complete")) scored.push([event.text, event.scored]);
      advance(world, msToTicks(WORDS.nextWordMs) + 1);
    }
    const firsts = new Set<string>();
    for (const [text, flag] of scored) {
      expect(flag).toBe(!firsts.has(text));
      firsts.add(text);
    }
    expect(scored.length).toBe(6);
    expect(firsts.size).toBeLessThan(6);
  });
});

describe("special words (01 §3.5–3.6)", () => {
  it("deals the urgent word once a wave when 3 foes reach the melee ring", () => {
    const world = makeWorld();
    for (let k = 0; k < 3; k += 1) placeFoe(world, "moss-grunt", -4 - k * 0.5, -1, 0);
    advance(world, 2);
    const urgent = liveSlots(world).filter((slot) => world.words.live[slot]!.kind === "urgent");
    expect(urgent).toHaveLength(1);
    expect(world.words.live[urgent[0]!]!.target).toEqual({ kind: "hero" });
    expect(world.words.live[urgent[0]!]!.text.length).toBeGreaterThanOrEqual(6);
    expect(dealWord(world, "urgent", { kind: "hero" })).toBe(-1);
    typeText(world, world.words.live[urgent[0]!]!.text);
    expect(dealWord(world, "urgent", { kind: "hero" })).toBe(-1);
    world.wave = 2;
    expect(dealWord(world, "urgent", { kind: "hero" })).toBeGreaterThanOrEqual(0);
  });

  it("deals a banner word with no foe and takes it off when the banner goes", () => {
    const world = makeWorld();
    placeFoe(world, "moss-grunt", -15, -4, 0);
    advance(world, 2);
    const slot = dealWord(world, "flag", null);
    expect(slot).toBeGreaterThanOrEqual(0);
    const word = world.words.live[slot]!;
    expect(word.kind).toBe("flag");
    expect(word.source).toBe(SOURCE.urgentFoe);
    expect(word.text.length).toBeLessThanOrEqual(5);
    events(world);
    releaseWord(world, slot);
    expect(world.words.live[slot]).toBeNull();
    expect(ofType(events(world), "word-released")[0]).toMatchObject({ word: slot, reason: "target-gone" });
  });

  it("makes every third word of G01's chain an Ấn Phá", () => {
    const world = makeWorld();
    const general = placeFoe(world, "moss-grunt", -16, -3, 0);
    general.foe = "moss-banner";
    general.general = true;
    advance(world, 2);
    const kinds: string[] = [];
    for (let k = 0; k < 6; k += 1) {
      const word = world.words.live[general.word]!;
      kinds.push(word.kind);
      if (k === 0) expect(upcomingSeals(world, general)).toEqual([false, true]);
      typeText(world, word.text);
      advance(world, msToTicks(WORDS.nextWordMs) + 1);
    }
    expect(kinds).toEqual(["general", "general", "seal", "general", "general", "seal"]);
  });
});
