/**
 * Voice limiter (05 §7): at most 32 sounds at once (Low 16, Medium 24), the
 * same sound at most 4 times in 100 ms, blasts and deaths at most 4 in
 * 120 ms, growls at most 2 at once and 0.4 s apart. When full, a new sound
 * steals the least important voice that is strictly less important than
 * itself (the one closest to its end); P0 and P1 are never stolen, so P2
 * typing is never masked by P3–P5. A P1 warning cuts the P5 voices and keeps
 * new P5 out for a moment. Pure: times are seconds passed in.
 * Owner: audio (LANES.md).
 */
import type { Quality } from "../app/contracts";
import type { LimitGroup, Priority } from "./catalog";

/** 05 §8 "Tiếng cùng lúc". */
export const VOICE_CAP: Readonly<Record<Quality, number>> = { low: 16, medium: 24, high: 32, ultra: 32 };

export interface LimiterRules {
  readonly maxVoices: number;
  /** Same sound: at most `sameMax` starts in `sameWindowS`. */
  readonly sameMax: number;
  readonly sameWindowS: number;
  /** Blast and death groups: at most `burstMax` starts in `burstWindowS`. */
  readonly burstMax: number;
  readonly burstWindowS: number;
  /** Growls: at most this many at once, this far apart. */
  readonly growlMax: number;
  readonly growlGapS: number;
  /** After a P1 starts, new P5 sounds wait this long. */
  readonly p1ClearS: number;
  /** P0–P1 may go this many voices over the cap rather than be lost. */
  readonly urgentExtra: number;
}

export const DEFAULT_RULES: LimiterRules = {
  maxVoices: VOICE_CAP.high,
  sameMax: 4,
  sameWindowS: 0.1,
  burstMax: 4,
  burstWindowS: 0.12,
  growlMax: 2,
  growlGapS: 0.4,
  p1ClearS: 0.35,
  urgentExtra: 4,
};

export interface VoiceRequest {
  readonly sound: string;
  readonly priority: Priority;
  readonly lengthS: number;
  /** Minimum time since the last start of the same sound. */
  readonly gapS?: number;
  readonly group?: LimitGroup;
  readonly now: number;
}

export type RejectReason = "gap" | "rate" | "group" | "p1-window" | "full";

export type Admission =
  | { readonly ok: true; readonly voice: number; /** Voices to fade out now (valid until the next call). */ readonly steal: readonly number[] }
  | { readonly ok: false; readonly reason: RejectReason };

interface Voice {
  readonly id: number;
  readonly sound: string;
  readonly priority: Priority;
  readonly group: LimitGroup | undefined;
  readonly start: number;
  readonly end: number;
}

export interface LimiterStats {
  admitted: number;
  stolen: number;
  peak: number;
  rejected: Record<RejectReason, number>;
}

export class VoiceLimiter {
  rules: LimiterRules;
  readonly stats: LimiterStats = { admitted: 0, stolen: 0, peak: 0, rejected: { gap: 0, rate: 0, group: 0, "p1-window": 0, full: 0 } };
  private voices: Voice[] = [];
  private nextId = 1;
  private readonly lastStart = new Map<string, number>();
  private readonly recent = new Map<string, number[]>();
  private readonly bursts: Record<"blast" | "death", number[]> = { blast: [], death: [] };
  private lastGrowl = -1e9;
  private p1Until = -1e9;
  private readonly stealBuffer: number[] = [];

  constructor(rules: Partial<LimiterRules> = {}) {
    this.rules = { ...DEFAULT_RULES, ...rules };
  }

  setMaxVoices(max: number): void {
    this.rules = { ...this.rules, maxVoices: Math.max(1, max | 0) };
  }

  /** Voices still sounding at `now`. */
  active(now: number): number {
    this.expire(now);
    return this.voices.length;
  }

  /** Frees a voice the engine stopped early. */
  release(voice: number): void {
    const index = this.voices.findIndex((v) => v.id === voice);
    if (index >= 0) this.voices.splice(index, 1);
  }

  /** Forgets every voice (context closed, run restarted). */
  clear(): void {
    this.voices = [];
    this.lastStart.clear();
    this.recent.clear();
    this.bursts.blast.length = 0;
    this.bursts.death.length = 0;
    this.lastGrowl = -1e9;
    this.p1Until = -1e9;
  }

  admit(request: VoiceRequest): Admission {
    const { now, sound, priority, group } = request;
    const rules = this.rules;
    this.expire(now);
    const steal = this.stealBuffer;
    steal.length = 0;

    if (now - (this.lastStart.get(sound) ?? -1e9) < (request.gapS ?? 0) - 1e-9) return this.reject("gap");

    const starts = this.recent.get(sound);
    if (starts) {
      while (starts.length > 0 && now - starts[0]! >= rules.sameWindowS) starts.shift();
      if (starts.length >= rules.sameMax) return this.reject("rate");
    }

    if (group === "blast" || group === "death") {
      const list = this.bursts[group];
      while (list.length > 0 && now - list[0]! >= rules.burstWindowS) list.shift();
      if (list.length >= rules.burstMax) return this.reject("group");
    } else if (group === "growl") {
      let growling = 0;
      for (const voice of this.voices) if (voice.group === "growl") growling += 1;
      if (growling >= rules.growlMax || now - this.lastGrowl < rules.growlGapS) return this.reject("group");
    }

    if (priority === 5 && now < this.p1Until) return this.reject("p1-window");

    if (this.voices.length >= rules.maxVoices) {
      const victim = this.victim(priority);
      if (victim >= 0) {
        steal.push(this.voices[victim]!.id);
        this.voices.splice(victim, 1);
        this.stats.stolen += 1;
      } else if (priority > 1 || this.voices.length >= rules.maxVoices + rules.urgentExtra) {
        return this.reject("full");
      }
    }

    if (priority === 1) {
      // A warning always plays and clears the small stuff (05 §7 P1).
      for (let index = this.voices.length - 1; index >= 0; index -= 1) {
        const voice = this.voices[index]!;
        if (voice.priority === 5) {
          steal.push(voice.id);
          this.voices.splice(index, 1);
          this.stats.stolen += 1;
        }
      }
      this.p1Until = now + rules.p1ClearS;
    }

    const id = this.nextId++;
    this.voices.push({ id, sound, priority, group, start: now, end: now + Math.max(0.01, request.lengthS) });
    this.lastStart.set(sound, now);
    if (starts) starts.push(now);
    else this.recent.set(sound, [now]);
    if (group === "blast" || group === "death") this.bursts[group].push(now);
    if (group === "growl") this.lastGrowl = now;
    this.stats.admitted += 1;
    this.stats.peak = Math.max(this.stats.peak, this.voices.length);
    return { ok: true, voice: id, steal };
  }

  /** Index of the voice to steal for a sound of `priority`: least important, then closest to its end; −1 when none may go. */
  private victim(priority: Priority): number {
    let best = -1;
    for (let index = 0; index < this.voices.length; index += 1) {
      const voice = this.voices[index]!;
      if (voice.priority <= 1 || voice.priority <= priority) continue;
      const current = best >= 0 ? this.voices[best]! : null;
      if (!current || voice.priority > current.priority || (voice.priority === current.priority && voice.end < current.end)) best = index;
    }
    return best;
  }

  private expire(now: number): void {
    if (this.voices.length === 0) return;
    let write = 0;
    for (const voice of this.voices) if (voice.end > now) this.voices[write++] = voice;
    this.voices.length = write;
  }

  private reject(reason: RejectReason): Admission {
    this.stats.rejected[reason] += 1;
    return { ok: false, reason };
  }
}
