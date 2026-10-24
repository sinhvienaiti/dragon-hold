/**
 * The run's typing pace (BALANCE.md §2, §4.1; 01 §3.4). The speed E a world
 * is built with sets word lengths, the pace k and Héo lan's grace, so it must
 * be the player's, never a silent 35:
 *   - `?wpm=` (scenarios, tests, a portal link) is used as given;
 *   - otherwise the speed card asks before Học trước. It offers the speed
 *     measured in earlier stages first (kit/balance skill profile, key
 *     `dragon-hold.skill`), then presets; the last pick (`dragon-hold.pace`)
 *     or 35 is preselected when nothing was measured.
 * Measuring reads finished words only: wall time from the first key to the
 * last (word-complete `responseMs`), letters and the word's d (00 §4.3), so E
 * is the known-word speed C(E) expects. The profile is updated once a stage
 * ends (BALANCE.md §2: after a stage, never mid-word).
 * Owner: integrator (LANES.md).
 */
import { blendSkill, parseSkill, serializeSkill, skillStorageKey, updateSkill, type SkillSample } from "../kit/balance";
import { GRADE, TEMPO } from "../content/rules";
import type { SimEvent, WordGroup } from "../content/types";

export const PACE_GAME_ID = "dragon-hold";
/** The last speed picked on the card. */
export const PACE_PICK_KEY = "dragon-hold.pace";
/** Speeds the world accepts from the card or the URL (WPM, integers). */
export const WPM_MIN = 10;
export const WPM_MAX = 120;

/** What a world is built with: E, and a and CV in permille when they were measured. */
export interface PaceHeader {
  readonly typistWpm: number;
  readonly accuracyPm?: number;
  readonly cvPm?: number;
  /** Where E came from: the URL, a preset on the card, or the measured profile. */
  readonly source: "url" | "pick" | "measured";
}

export interface PaceOption {
  /** The digit that picks the row: 0 for the measured speed, 1–7 for the presets, the same with or without a measurement. */
  readonly key: number;
  readonly label: string;
  readonly hint: string;
  readonly header: PaceHeader;
}

/** Presets on the card (WPM, hint). 35 is 00 §4.3's reference player. */
export const PACE_PRESETS: readonly { readonly wpm: number; readonly hint: string }[] = [
  { wpm: 15, hint: "Mới tập gõ" },
  { wpm: 20, hint: "Còn nhìn phím" },
  { wpm: 25, hint: "Gõ chậm" },
  { wpm: 30, hint: "Hơi chậm" },
  { wpm: TEMPO.refWpm, hint: "Vừa, người chơi chuẩn" },
  { wpm: 45, hint: "Khá nhanh" },
  { wpm: 60, hint: "Nhanh" },
];

/** A whole WPM inside [WPM_MIN, WPM_MAX]; undefined for a value that is not a number. */
export function clampWpm(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  return Math.min(WPM_MAX, Math.max(WPM_MIN, Math.round(value)));
}

/** Storage the pace reads and writes (kit/platform SafeStorage, or a map in tests). */
export interface PaceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): boolean;
}

export interface MeasuredPace {
  /** Blended E, a (0–1) and CV the kit profile gives. */
  readonly e: number;
  readonly a: number;
  readonly cv: number;
  /** Stages folded in (quits and AFK runs not counted). */
  readonly stages: number;
  /** Confidence of E, 0–1 (words seen / the kit's SKILL_FULL.e). */
  readonly confidence: number;
}

export interface PaceMemory {
  readonly measured: MeasuredPace | null;
  readonly lastPick: number | null;
}

/** The measured profile (only when a stage was measured) and the last pick. */
export function readPaceMemory(storage: PaceStorage): PaceMemory {
  const profile = parseSkill(storage.getItem(skillStorageKey(PACE_GAME_ID)));
  let measured: MeasuredPace | null = null;
  if (profile.measures.e.n > 0) {
    const view = blendSkill(profile);
    measured = { e: view.e, a: view.a, cv: view.cv, stages: profile.trend.stages, confidence: view.confidence.e };
  }
  let lastPick: number | null = null;
  try {
    const raw = JSON.parse(storage.getItem(PACE_PICK_KEY) ?? "null") as { wpm?: unknown } | null;
    const wpm = clampWpm(typeof raw?.wpm === "number" ? raw.wpm : undefined);
    lastPick = wpm ?? null;
  } catch {
    lastPick = null;
  }
  return { measured, lastPick };
}

/** The world header for a measured profile: E, a and CV as the bots pass theirs (scripts/balance/bot.ts). */
export function measuredHeader(measured: MeasuredPace): PaceHeader {
  return {
    typistWpm: clampWpm(measured.e)!,
    accuracyPm: Math.round(Math.min(1, Math.max(0, measured.a)) * 1000),
    cvPm: Math.round(Math.min(1, Math.max(0, measured.cv)) * 1000),
    source: "measured",
  };
}

const percent = (value: number): string => String(Math.round(value * 100));

/**
 * The card's rows (the measured speed first when there is one, on key 0) and
 * the row to preselect. Presets keep keys 1–7 either way, so "35 is key 5"
 * holds before and after the first measured stage (review 2 minor 4).
 */
export function paceOptions(memory: PaceMemory): { options: PaceOption[]; selected: number } {
  const options: PaceOption[] = [];
  if (memory.measured !== null) {
    const header = measuredHeader(memory.measured);
    const stages = memory.measured.stages;
    options.push({
      key: 0,
      label: "Số đo: " + header.typistWpm + " WPM",
      hint: "Đúng " + percent(memory.measured.a) + " % phím" + (stages > 0 ? ", đo qua " + stages + " ải" : ""),
      header,
    });
  }
  PACE_PRESETS.forEach((preset, index) => options.push({ key: index + 1, label: preset.wpm + " WPM", hint: preset.hint, header: { typistWpm: preset.wpm, source: "pick" } }));
  let selected = 0;
  if (memory.measured === null) {
    const want = memory.lastPick ?? TEMPO.refWpm;
    let best = Infinity;
    options.forEach((option, index) => {
      const gap = Math.abs(option.header.typistWpm - want);
      if (gap < best) {
        best = gap;
        selected = index;
      }
    });
  }
  return { options, selected };
}

/** Remembers the pick for the next visit (the card preselects it). */
export function rememberPick(storage: PaceStorage, header: PaceHeader): void {
  storage.setItem(PACE_PICK_KEY, JSON.stringify({ wpm: header.typistWpm, source: header.source }));
}

/** Short text for menus and logs: "35 WPM (đã chọn)". */
export function paceLabel(header: PaceHeader): string {
  const from = header.source === "measured" ? "theo số đo" : header.source === "url" ? "theo đường dẫn" : "đã chọn";
  return header.typistWpm + " WPM (" + from + ")";
}

/** Fewer finished words than this: a stage tells nothing about speed (the kit also asks for 8). */
const MIN_WORDS = 8;

/**
 * Word timings of one run, read from its events: per finished word its
 * letters, wall time first key to last, d of its group, errors and grade.
 */
export class PaceMeter {
  private readonly groups = new Map<number, WordGroup>();
  /** Σ (ℓ − 1) / 5 and Σ t × d (minutes): E = their ratio. */
  private strokes = 0;
  private minutesD = 0;
  /** Per-letter times × d (ms), for CV. */
  private readonly perLetter: number[] = [];
  words = 0;
  cleanWords = 0;
  sloppyWords = 0;

  onEvents(events: readonly SimEvent[]): void {
    for (const event of events) {
      if (event.type === "word-assigned") this.groups.set(event.word, event.group);
      else if (event.type === "word-complete") {
        const group = this.groups.get(event.word) ?? "known";
        const letters = event.text.length;
        this.words += 1;
        if (event.errors === 0) this.cleanWords += 1;
        if (event.grade === "sloppy") this.sloppyWords += 1;
        if (letters < 2 || !(event.responseMs > 0)) continue;
        const d = GRADE.dPm[group] / 1000;
        this.strokes += (letters - 1) / 5;
        this.minutesD += (event.responseMs * d) / 60_000;
        this.perLetter.push((event.responseMs * d) / (letters - 1));
      }
    }
  }

  /** E measured so far (known-word WPM), or 0. */
  get wpm(): number {
    return this.minutesD > 0 ? this.strokes / this.minutesD : 0;
  }

  /** Coefficient of variation of the per-letter times, or undefined with too few words. */
  get cv(): number | undefined {
    const n = this.perLetter.length;
    if (n < MIN_WORDS) return undefined;
    const mean = this.perLetter.reduce((sum, value) => sum + value, 0) / n;
    if (!(mean > 0)) return undefined;
    const variance = this.perLetter.reduce((sum, value) => sum + (value - mean) * (value - mean), 0) / n;
    return Math.sqrt(variance) / mean;
  }

  /** The kit sample for a finished stage; null when too few words were typed. */
  sample(outcome: "won" | "lost", keys: { keys: number; wrongKeys: number; strayKeys: number }, safety: number): SkillSample | null {
    if (this.words < MIN_WORDS || !(this.wpm > 0)) return null;
    const correct = Math.max(0, keys.keys - keys.wrongKeys - keys.strayKeys);
    const cv = this.cv;
    return {
      outcome,
      words: this.words,
      wpm: this.wpm,
      keys: keys.keys,
      correctKeys: correct,
      cleanWords: this.cleanWords,
      sloppyWords: this.sloppyWords,
      ...(cv === undefined ? {} : { cv }),
      safety: Math.min(1, Math.max(0, safety)),
    };
  }
}

/** Folds a finished stage into the stored profile; returns the speed it now gives, or null when nothing was kept. */
export function recordStage(storage: PaceStorage, sample: SkillSample | null): MeasuredPace | null {
  if (sample === null) return null;
  const key = skillStorageKey(PACE_GAME_ID);
  const update = updateSkill(parseSkill(storage.getItem(key)), sample);
  storage.setItem(key, serializeSkill(update.profile));
  return update.accepted ? readPaceMemory(storage).measured : null;
}
