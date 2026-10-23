import { describe, expect, it } from "vitest";
import type { LimitGroup, Priority } from "../../src/audio/catalog";
import { VOICE_CAP, VoiceLimiter } from "../../src/audio/limiter";

const ask = (limiter: VoiceLimiter, sound: string, priority: Priority, now: number, extra: { lengthS?: number; gapS?: number; group?: LimitGroup } = {}) =>
  limiter.admit({ sound, priority, now, lengthS: extra.lengthS ?? 1, ...(extra.gapS !== undefined ? { gapS: extra.gapS } : {}), ...(extra.group ? { group: extra.group } : {}) });

describe("audio voice limiter", () => {
  it("caps voices by quality (05 §8)", () => {
    expect(VOICE_CAP).toEqual({ low: 16, medium: 24, high: 32, ultra: 32 });
  });

  it("lets the same sound start at most 4 times in 100 ms", () => {
    const limiter = new VoiceLimiter();
    const results = [0, 0.01, 0.02, 0.03, 0.04, 0.05].map((t) => ask(limiter, "hit", 4, t).ok);
    expect(results).toEqual([true, true, true, true, false, false]);
    expect(ask(limiter, "hit", 4, 0.101).ok).toBe(true);
    expect(limiter.stats.rejected.rate).toBe(2);
  });

  it("keeps a sound's own gap", () => {
    const limiter = new VoiceLimiter();
    expect(ask(limiter, "horn", 1, 0, { gapS: 6 }).ok).toBe(true);
    expect(ask(limiter, "horn", 1, 5.9, { gapS: 6 }).ok).toBe(false);
    expect(ask(limiter, "horn", 1, 6, { gapS: 6 }).ok).toBe(true);
  });

  it("allows at most 4 blasts in 120 ms across different sounds", () => {
    const limiter = new VoiceLimiter();
    const ok = ["a", "b", "c", "d", "e"].map((sound, i) => ask(limiter, sound, 4, i * 0.01, { group: "blast" }).ok);
    expect(ok).toEqual([true, true, true, true, false]);
    expect(ask(limiter, "f", 4, 0.125, { group: "blast" }).ok).toBe(true);
  });

  it("keeps growls to 2 at once, 0.4 s apart", () => {
    const limiter = new VoiceLimiter();
    expect(ask(limiter, "g1", 5, 0, { group: "growl", lengthS: 2 }).ok).toBe(true);
    expect(ask(limiter, "g2", 5, 0.2, { group: "growl", lengthS: 2 }).ok).toBe(false);
    expect(ask(limiter, "g2", 5, 0.4, { group: "growl", lengthS: 2 }).ok).toBe(true);
    expect(ask(limiter, "g3", 5, 0.9, { group: "growl", lengthS: 2 }).ok).toBe(false);
    expect(ask(limiter, "g3", 5, 2.1, { group: "growl", lengthS: 2 }).ok).toBe(true);
  });

  it("steals the least important voice closest to its end when full", () => {
    const limiter = new VoiceLimiter({ maxVoices: 3 });
    ask(limiter, "step", 5, 0, { lengthS: 5 });
    const near = ask(limiter, "step2", 5, 0, { lengthS: 1 });
    ask(limiter, "blast", 4, 0, { lengthS: 5 });
    const shot = ask(limiter, "shot", 4, 0.5);
    expect(shot.ok).toBe(true);
    expect(shot.ok && shot.steal).toEqual([near.ok ? near.voice : -1]);
    expect(limiter.active(0.5)).toBe(3);
  });

  it("never steals P0 or P1, and never lets P3–P5 mask typing (P2)", () => {
    const limiter = new VoiceLimiter({ maxVoices: 3 });
    ask(limiter, "word", 0, 0, { lengthS: 5 });
    ask(limiter, "warn", 1, 0, { lengthS: 5 });
    ask(limiter, "key", 2, 0, { lengthS: 5 });
    // After the warning's P5 window (0.35 s), so only the cap can refuse.
    for (const priority of [3, 4, 5] as const) expect(ask(limiter, "x" + priority, priority, 0.5).ok).toBe(false);
    expect(limiter.stats.rejected.full).toBe(3);
    // Typing does not steal another typing voice either.
    expect(ask(limiter, "key2", 2, 0.5).ok).toBe(false);
  });

  it("lets warnings run a little over the cap instead of being lost", () => {
    const limiter = new VoiceLimiter({ maxVoices: 2, urgentExtra: 1 });
    ask(limiter, "a", 1, 0, { lengthS: 5 });
    ask(limiter, "b", 1, 0, { lengthS: 5 });
    expect(ask(limiter, "c", 1, 0.1).ok).toBe(true);
    expect(ask(limiter, "d", 0, 0.1).ok).toBe(false);
  });

  it("cuts P5 voices when a P1 warning starts and holds new P5 back briefly", () => {
    const limiter = new VoiceLimiter();
    const steps = [ask(limiter, "s1", 5, 0, { lengthS: 3 }), ask(limiter, "s2", 5, 0, { lengthS: 3 })];
    ask(limiter, "blast", 4, 0, { lengthS: 3 });
    const warn = ask(limiter, "warn", 1, 0.1);
    expect(warn.ok && [...warn.steal].sort()).toEqual(steps.map((s) => (s.ok ? s.voice : -1)).sort());
    expect(ask(limiter, "s3", 5, 0.2).ok).toBe(false);
    expect(limiter.stats.rejected["p1-window"]).toBe(1);
    expect(ask(limiter, "s3", 5, 0.5).ok).toBe(true);
    // blast, warn, s3: the two cut steps are gone.
    expect(limiter.active(0.5)).toBe(3);
  });

  it("keeps 200 foes fighting for 10 s inside the cap and the rate limits", () => {
    const limiter = new VoiceLimiter({ maxVoices: VOICE_CAP.high });
    const sounds = [
      { sound: "enemy.biped.attack", priority: 4 as const, lengthS: 0.24, gapS: 0.06 },
      { sound: "enemy.biped.hit", priority: 4 as const, lengthS: 0.2, gapS: 0.05 },
      { sound: "enemy.biped.death", priority: 4 as const, lengthS: 0.56, gapS: 0.04, group: "death" as const },
      { sound: "enemy.biped.spawn", priority: 5 as const, lengthS: 0.38, gapS: 0.12, group: "growl" as const },
      { sound: "trap.pine-bomb.trigger", priority: 4 as const, lengthS: 1.1, gapS: 0.06, group: "blast" as const },
      { sound: "warn.strike", priority: 1 as const, lengthS: 0.26, gapS: 0.45 },
      { sound: "type.key", priority: 2 as const, lengthS: 0.06, gapS: 0 },
    ];
    const starts = new Map<string, number[]>();
    let peak = 0;
    let keys = 0;
    let keysOk = 0;
    for (let frame = 0; frame < 600; frame += 1) {
      const now = frame / 60;
      // Every foe asks for something every frame: far more than can play.
      for (let foe = 0; foe < 200; foe += 1) {
        const spec = sounds[(foe + frame) % (sounds.length - 1)]!;
        const result = limiter.admit({ ...spec, now });
        if (result.ok) {
          const list = starts.get(spec.sound) ?? [];
          list.push(now);
          starts.set(spec.sound, list);
        }
        peak = Math.max(peak, limiter.active(now));
      }
      // A typist at ~120 WPM: a key every 6 frames must always get through.
      if (frame % 6 === 0) {
        keys += 1;
        if (limiter.admit({ ...sounds[6]!, now }).ok) keysOk += 1;
      }
    }
    expect(peak).toBeLessThanOrEqual(VOICE_CAP.high + 4);
    expect(keysOk).toBe(keys);
    for (const [, list] of starts) {
      for (let i = 4; i < list.length; i += 1) expect(list[i]! - list[i - 4]!).toBeGreaterThanOrEqual(0.1 - 1e-9);
    }
    const blasts = [...(starts.get("trap.pine-bomb.trigger") ?? []), ...(starts.get("enemy.biped.death") ?? [])].sort((a, b) => a - b);
    expect(blasts.length).toBeGreaterThan(0);
    expect(limiter.stats.rejected.rate + limiter.stats.rejected.gap + limiter.stats.rejected.group + limiter.stats.rejected.full).toBeGreaterThan(100_000);
  });
});
