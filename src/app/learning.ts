/**
 * Learning glue (01 §6): loads vocabulary (kit/vocab, /vocabulary/), asks
 * shared learning through the portal bridge (kit/learning, gameId
 * "dragon-hold"), builds the WordDeck (typing/deck.ts), and turns
 * word-complete events into learning events (one scored event per word per
 * run, D14), queued locally when the portal is absent. It also owns the one
 * pronunciation channel (01 §6.4) and Tab replay.
 * Owner: typing-learning (LANES.md).
 */
import { ECONOMY, LEARNING } from "../content/rules";
import type { ActivityType, DeckWord, SimEvent, StageDef, WordDeck } from "../content/types";
import { buildCombatLearningEvent, normalizeLearningEntityId, type LearningBridge, type LearningEvent } from "../kit/learning";
import { createRng, safeLocalStorage } from "../kit/platform";
import { speakEnglish } from "../kit/speech";
import { clearVocabularyRuntimeCache, filterVocabularyEntries, loadVocabularyIndex, loadVocabularyLevel, textHasBlockedWord, type VocabularyEntry } from "../kit/vocab";
import { buildWordDeck, isDeckText, type DeckCandidate } from "../typing/deck";
import type { Gloss } from "../ui/learning-frame";
import { createPortalBridge } from "./portal";

const GAME_ID = LEARNING.gameId;
/** Recall activities: always sent (01 §6.6), and a right answer without a hint counts toward hiding the meaning (01 §6.3). */
const RECALLS: ReadonlySet<string> = new Set(["meaning-recall", "listening", "review-card"]);

/**
 * One rule for "a right recall" (01 §6.3, 00 D14), on this device and in the
 * portal's samples: a right answer in a recall activity with no hint shown.
 * Học trước goes out as `review-card` with hintUsed (its word, IPA and
 * meaning show while it is typed, 01 §6.3, §6.6), so it is never one.
 */
export const isRightRecall = (activityType: unknown, result: unknown, hintUsed: unknown): boolean =>
  RECALLS.has(String(activityType)) && result === "correct" && hintUsed !== true;

const STORE_KEY = GAME_ID + ":words:v1";
const LEVEL_KEY = GAME_ID + ":vocab-level";

/** What the client keeps per word on this device (fallback when the portal cannot be asked, 01 §6.8). */
export interface LocalWordRecord {
  typedRight: number;
  typedWrong: number;
  recalls: number;
  /** ms since epoch of the last meeting. */
  lastSeen: number;
}

/** What the game needs of a shared-learning record (01 §6.1, §6.3). */
export interface WordRecord {
  readonly mastery: number;
  readonly due: boolean;
  readonly recalls: number;
}

/** Pronunciation settings (01 §6.4): off, new words only, new and weak words (default), every word typed. */
export type PronounceMode = "off" | "new" | "new-weak" | "all";

export interface PronounceRequest {
  readonly text: string;
  /** 0 listening, 1 new word, 2 weak word, 3 any other (01 §6.4 order). */
  readonly priority: number;
  readonly at: number;
}

/**
 * The one pronunciation channel (01 §6.4): two playbacks ≥ 2.5 s apart, a
 * queued word older than 2 s is dropped, listening words first, then new,
 * then weak. Tab replays play at once.
 */
export class Pronouncer {
  private queue: PronounceRequest[] = [];
  private lastAt = Number.NEGATIVE_INFINITY;
  /** Off while a boss seal window or a guide line holds the channel. */
  blocked = false;

  constructor(private readonly speak: (text: string) => void, private readonly now: () => number) {}

  request(text: string, priority: number): void {
    if (this.queue.some((item) => item.text === text)) return;
    this.queue.push({ text, priority, at: this.now() });
    this.tick();
  }

  /** Plays `text` now (Tab), resetting the gap. */
  playNow(text: string): void {
    this.queue = this.queue.filter((item) => item.text !== text);
    this.lastAt = this.now();
    this.speak(text);
  }

  tick(): void {
    const now = this.now();
    this.queue = this.queue.filter((item) => now - item.at <= LEARNING.pronounceDropMs);
    if (this.blocked || this.queue.length === 0 || now - this.lastAt < LEARNING.pronounceGapMs) return;
    this.queue.sort((a, b) => a.priority - b.priority || a.at - b.at);
    const next = this.queue.shift()!;
    this.lastAt = now;
    this.speak(next.text);
  }

  get waiting(): number {
    return this.queue.length;
  }
}

/** One word's meetings in this stage (Sổ Từ Ải, Thẻ Ôn picks; 01 §6.5). */
export interface StageWord {
  readonly text: string;
  readonly isNew: boolean;
  wave: number;
  count: number;
  sloppy: boolean;
  hintUsed: boolean;
  errors: number;
}

/** A Thẻ Ôn question (01 §6.5). */
export interface ReviewItem {
  readonly text: string;
  readonly vi: string;
  readonly ipa: string;
  /** "listen": hear then type; "meaning": read the meaning then type. */
  readonly mode: "listen" | "meaning";
}

export type DeckFailureReason = "load-failed" | "empty" | "too-small";

/** A failed stage deck never reaches world creation. Count is the usable deck size. */
export class DeckBuildError extends Error {
  constructor(readonly reason: DeckFailureReason, readonly count: number) {
    super("dragon-hold: vocabulary " + reason + " (" + count + " words)");
    this.name = "DeckBuildError";
  }
}

export interface LearningClient {
  /** The stage's deck; resolves with a cold-start deck when the portal does not answer in 2 s. */
  buildDeck(stage: StageDef): Promise<WordDeck>;
  readonly gloss: Gloss;
  onEvents(events: readonly SimEvent[]): void;
  /** Sends queued events now (wave end, run end, tab close). */
  flush(): void;
  dispose(): void;
  /** The deck the last buildDeck made (null before). */
  readonly deck: WordDeck | null;
  /**
   * A recall-activity answer (Học trước, Thẻ Ôn), `review-card` unless
   * `activity` says otherwise: always sent (01 §6.6). Học trước passes
   * hintUsed, since its meaning and IPA show while the word is typed
   * (01 §6.3): sent as such, it never counts as a right recall (00 D14: copy
   * typing is not remembering), here or when the portal sends it back.
   */
  recordRecall(text: string, correct: boolean, detail?: { activity?: ActivityType; responseMs?: number; hintUsed?: boolean; userAnswer?: string }): void;
  /** Up to 3 Thẻ Ôn questions from `wave`: Ẩu words, then words typed with a hint, then new words (01 §6.5). */
  reviewItems(wave: number): ReviewItem[];
  /** Every word met this stage, for Sổ Từ Ải. */
  stageWords(): readonly StageWord[];
  /** Tab (action "replay"): hears the locked word, else the last one typed; returns true when it played. */
  handleAction(action: string): boolean;
  /** Plays a word at once (Học trước, Thẻ Ôn, a speaker icon). */
  speak(text: string): void;
  readonly pronouncer: Pronouncer;
  /** Events waiting for the next batch. */
  readonly pending: number;
}

export interface LearningClientOptions {
  readonly bridge?: LearningBridge;
  /** Entries of these vocabulary levels, sensitive words already out (tests pass a fake). */
  readonly loadEntries?: (levels: readonly number[]) => Promise<VocabularyEntry[]>;
  /** Vocabulary level of the stage; default the saved one, else 1. */
  readonly vocabLevel?: number;
  /** Child profile: mature words out too (00 D15). */
  readonly excludeMature?: boolean;
  readonly storage?: { readJson(key: string): unknown; writeJson(key: string, value: unknown): boolean };
  readonly now?: () => number;
  readonly speak?: (text: string) => void;
  readonly pronounce?: PronounceMode;
  /** Batch timer; default window.setInterval every 5 s (none outside a browser). */
  readonly every?: (ms: number, run: () => void) => () => void;
}

/** Shared-learning lookup results in either shape the portal may answer with: { items: [...] }, { records: {...} } or a list. */
export function parseLookup(value: unknown, now: number): Map<string, WordRecord> {
  const out = new Map<string, WordRecord>();
  const object = value !== null && typeof value === "object" ? (value as Record<string, unknown>) : null;
  let rows: unknown[] = [];
  if (Array.isArray(value)) rows = value;
  else if (object && Array.isArray(object["items"])) rows = object["items"] as unknown[];
  else if (object && object["records"] !== null && typeof object["records"] === "object") {
    rows = Object.entries(object["records"] as Record<string, unknown>).map(([entityId, record]) => ({ entityId, ...(record as object) }));
  }
  for (const row of rows) {
    if (row === null || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    const id = record["entityId"] ?? record["wordKey"];
    if (typeof id !== "string") continue;
    const mastery = typeof record["mastery"] === "number" ? Math.max(0, Math.min(100, record["mastery"])) : 0;
    const next = typeof record["nextReviewAt"] === "string" ? Date.parse(record["nextReviewAt"]) : Number.NaN;
    const samples = [record["recentAnswers"], record["recentSamples"]].flatMap((list) => (Array.isArray(list) ? list : []));
    const recalls = samples.filter((sample) => {
      const s = sample as Record<string, unknown> | null;
      return s !== null && typeof s === "object" && isRightRecall(s["activityType"], s["result"], s["hintUsed"]);
    }).length;
    out.set(normalizeLearningEntityId(id), { mastery, due: (Number.isFinite(next) && next <= now) || mastery < LEARNING.weakMastery, recalls });
  }
  return out;
}

/** A device record as a shared-learning record: copy typing never lifts it past 60 (01 §6.8), recalls do. */
export function localRecord(record: LocalWordRecord, now: number): WordRecord {
  const mastery = Math.max(0, Math.min(100, Math.min(60, 25 * record.typedRight) + 15 * record.recalls - 10 * record.typedWrong));
  const stale = now - record.lastSeen > 24 * 3600 * 1000;
  return { mastery, due: mastery < LEARNING.weakMastery || (stale && mastery < LEARNING.knownMastery), recalls: record.recalls };
}

/** Vocabulary entries → deck candidates: one a–z word of 3–10 letters, no blocked word (00 D15), first spelling only. */
export function candidatesFrom(
  entries: readonly (VocabularyEntry & { level?: number })[],
  records: ReadonlyMap<string, WordRecord>,
  excludeMature = false,
): DeckCandidate[] {
  const seen = new Set<string>();
  const out: DeckCandidate[] = [];
  for (const entry of filterVocabularyEntries(entries, { excludeMature })) {
    const text = normalizeLearningEntityId(entry.en);
    if (!isDeckText(text) || seen.has(text) || textHasBlockedWord(text, { excludeMature })) continue;
    seen.add(text);
    const record = records.get(text);
    out.push({ text, level: entry.level ?? 1, isNew: record === undefined, mastery: record?.mastery ?? 0, due: record?.due ?? false, recalls: record?.recalls ?? 0 });
  }
  return out;
}

/** A learning event for a typed word (01 §6.6): correct only with no wrong key. */
export function typedWordEvent(
  event: Extract<SimEvent, { type: "word-complete" }>,
  replayUsed: boolean,
  occurredAt: string,
): LearningEvent {
  const base = buildCombatLearningEvent({ gameId: GAME_ID, entry: { id: event.text, en: event.text, vi: "", ipa: "" }, perfect: event.errors === 0, occurredAt });
  return { ...base, activityType: event.activity, responseMs: Math.max(0, Math.round(event.responseMs)), hintUsed: event.hintUsed, replayUsed };
}

async function defaultEntries(levels: readonly number[], excludeMature: boolean): Promise<VocabularyEntry[]> {
  const index = await loadVocabularyIndex();
  const lists = await Promise.all(
    levels
      .filter((level) => index.levels.some((item) => item.level === level))
      .map(async (level) => {
        try {
          return (await loadVocabularyLevel(level, index, { excludeMature })).map((entry) => ({ ...entry, level }));
        } catch (error) {
          // The kit rejects an empty document; preserve the app's empty-vs-network distinction.
          if (error instanceof Error && error.message === "Vocabulary level " + level + " has no valid entries.") return [];
          throw error;
        }
      }),
  );
  return lists.flat();
}

const browser = typeof window !== "undefined";

export function createLearningClient(options: LearningClientOptions = {}): LearningClient {
  const now = options.now ?? (() => Date.now());
  const storage = options.storage ?? safeLocalStorage;
  const bridge = options.bridge ?? createPortalBridge();
  const excludeMature = options.excludeMature ?? false;
  const mode: PronounceMode = options.pronounce ?? "new-weak";
  const speakNow = options.speak ?? ((text: string) => (browser ? speakEnglish(text, { enabled: true, rate: 0.9, volume: 1 }) : undefined));
  const pronouncer = new Pronouncer((text) => {
    if (mode !== "off") speakNow(text);
  }, now);
  const glossMap = new Map<string, { vi: string; ipa: string }>();
  const local: Record<string, LocalWordRecord> = (() => {
    const raw = storage.readJson(STORE_KEY);
    return raw !== null && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, LocalWordRecord>) : {};
  })();
  const byText = new Map<string, DeckWord>();
  const slots = new Map<number, string>();
  const replayed = new Set<string>();
  const firstLocked = new Set<string>();
  const stage = new Map<string, StageWord>();
  let pending: LearningEvent[] = [];
  let deck: WordDeck | null = null;
  let wave = 0;
  let locked = -1;
  let lastTyped = "";
  let disposed = false;

  const saveLocal = () => storage.writeJson(STORE_KEY, local);
  const touch = (text: string): LocalWordRecord => (local[text] ??= { typedRight: 0, typedWrong: 0, recalls: 0, lastSeen: now() });
  const flush = (): void => {
    if (pending.length === 0) return;
    const batch = pending;
    pending = [];
    for (const event of batch) bridge.sendAttempt(event);
    saveLocal();
  };
  const stop = options.every
    ? options.every(LEARNING.batchMs, flush)
    : browser
      ? (() => {
          const id = window.setInterval(flush, LEARNING.batchMs);
          return () => window.clearInterval(id);
        })()
      : () => {};
  const onHide = () => flush();
  if (browser) window.addEventListener("pagehide", onHide);

  /** Weak: mastery under 40 (01 §6.4). */
  const isWeak = (text: string) => (byText.get(text)?.mastery ?? 0) < LEARNING.weakMastery;
  const isNewWord = (text: string) => byText.get(text)?.group === "new";

  /** New words when first locked and when typed; weak words when typed; every typed word in "all" (01 §6.4). */
  const autoPronounce = (text: string, typed: boolean) => {
    if (mode === "off") return;
    if (isNewWord(text)) pronouncer.request(text, 1);
    else if (!typed) return;
    else if (mode !== "new" && isWeak(text)) pronouncer.request(text, 2);
    else if (mode === "all") pronouncer.request(text, 3);
  };

  const client: LearningClient = {
    get deck() {
      return deck;
    },
    get pending() {
      return pending.length;
    },
    pronouncer,
    gloss: (text) => glossMap.get(text) ?? null,

    async buildDeck(stageDef: StageDef): Promise<WordDeck> {
      const saved = Number(storage.readJson(LEVEL_KEY));
      const level = Math.max(1, Math.round(options.vocabLevel ?? (Number.isFinite(saved) && saved > 0 ? saved : 1)));
      const levels = [level, level + 1];
      let entries: (VocabularyEntry & { level?: number })[] = [];
      try {
        entries = await (options.loadEntries ? options.loadEntries(levels) : defaultEntries(levels, excludeMature));
      } catch (error) {
        deck = null;
        if (!options.loadEntries) clearVocabularyRuntimeCache();
        console.warn("dragon-hold: vocabulary did not load", error);
        throw new DeckBuildError("load-failed", 0);
      }
      if (entries.length === 0) {
        deck = null;
        if (!options.loadEntries) clearVocabularyRuntimeCache();
        const error = new DeckBuildError("empty", 0);
        console.warn("dragon-hold: vocabulary did not load", error);
        throw error;
      }
      for (const entry of entries) {
        const text = normalizeLearningEntityId(entry.en);
        if (!glossMap.has(text)) glossMap.set(text, { vi: entry.vi, ipa: entry.ipa });
      }
      const texts = [...new Set(entries.map((entry) => normalizeLearningEntityId(entry.en)).filter(isDeckText))];
      let records = new Map<string, WordRecord>();
      try {
        records = parseLookup(await bridge.lookup(texts.slice(0, 200)), now());
      } catch {
        // No portal, or it did not answer in 2 s: this device's records stand in (01 §6.1, §6.8).
        for (const text of texts) if (local[text]) records.set(text, localRecord(local[text]!, now()));
      }
      // Recalls counted on this device add to what the portal knows (its lookup may lack recent samples).
      for (const [text, record] of records) {
        const mine = local[text]?.recalls ?? 0;
        if (mine > record.recalls) records.set(text, { ...record, recalls: mine });
      }
      const rng = createRng((stageDef.seed ^ 0x5eed) >>> 0);
      deck = buildWordDeck(candidatesFrom(entries, records, excludeMature), level, (min, max) => rng.words.int(min, max), {
        newMax: stageDef.type === "boss" ? LEARNING.newPerBossStage : LEARNING.newPerStage,
      });
      if (deck.words.length < LEARNING.deckSize[0]) {
        const error = new DeckBuildError("too-small", deck.words.length);
        deck = null;
        // A repaired server response must be fetched again by Retry, including successful short loads.
        if (!options.loadEntries) clearVocabularyRuntimeCache();
        console.warn("dragon-hold: vocabulary did not load", error);
        throw error;
      }
      byText.clear();
      for (const word of deck.words) byText.set(word.text, word);
      stage.clear();
      firstLocked.clear();
      replayed.clear();
      return deck;
    },

    onEvents(events: readonly SimEvent[]): void {
      for (const event of events) {
        switch (event.type) {
          case "wave-start":
            wave = event.wave;
            break;
          case "word-assigned":
            slots.set(event.word, event.text);
            break;
          case "word-progress": {
            if (event.word < 0 || event.key === "pair" || (event.key === "switch" && event.typed === 0)) break;
            if (event.key === "back" && event.typed === 0) {
              if (locked === event.word) locked = -1;
              break;
            }
            if (locked === event.word) break;
            locked = event.word;
            const text = slots.get(event.word);
            // A new word is heard when first locked in the stage (01 §6.4).
            if (text !== undefined && isNewWord(text) && !firstLocked.has(text)) {
              firstLocked.add(text);
              autoPronounce(text, false);
            }
            break;
          }
          case "word-released":
            slots.delete(event.word);
            if (locked === event.word) locked = -1;
            break;
          case "word-complete": {
            lastTyped = event.text;
            const record = touch(event.text);
            record.lastSeen = now();
            if (event.errors === 0) record.typedRight += 1;
            else record.typedWrong += 1;
            const entry = stage.get(event.text) ?? { text: event.text, isNew: isNewWord(event.text), wave, count: 0, sloppy: false, hintUsed: false, errors: 0 };
            entry.wave = wave;
            entry.count += 1;
            entry.sloppy ||= event.grade === "sloppy";
            entry.hintUsed ||= event.hintUsed;
            entry.errors += event.errors;
            stage.set(event.text, entry);
            if (event.scored) pending.push(typedWordEvent(event, replayed.has(event.text), new Date(now()).toISOString()));
            autoPronounce(event.text, true);
            break;
          }
          case "wave-end":
          case "victory":
          case "defeat":
            flush();
            break;
          default:
            break;
        }
      }
      pronouncer.tick();
    },

    flush,

    recordRecall(text, correct, detail = {}) {
      const record = touch(text);
      record.lastSeen = now();
      const activityType: ActivityType = detail.activity ?? "review-card";
      const hintUsed = detail.hintUsed ?? false;
      // Only a real recall hides the meaning later (01 §6.3, D14); a copy with the answer shown does not.
      if (isRightRecall(activityType, correct ? "correct" : "wrong", hintUsed)) record.recalls += 1;
      const base = buildCombatLearningEvent({ gameId: GAME_ID, entry: { id: text, en: text, vi: "", ipa: "" }, perfect: correct, occurredAt: new Date(now()).toISOString() });
      pending.push({
        ...base,
        activityType,
        responseMs: Math.max(0, Math.round(detail.responseMs ?? 0)),
        hintUsed,
        replayUsed: replayed.has(text),
        ...(detail.userAnswer !== undefined ? { userAnswer: detail.userAnswer } : {}),
      });
    },

    reviewItems(forWave: number): ReviewItem[] {
      const words = [...stage.values()].filter((word) => word.wave === forWave);
      const ranked = [
        ...words.filter((word) => word.sloppy),
        ...words.filter((word) => !word.sloppy && word.hintUsed),
        ...words.filter((word) => !word.sloppy && !word.hintUsed && word.isNew),
      ];
      return ranked.slice(0, ECONOMY.reviewCardQuestions).map((word, index) => {
        const gloss = glossMap.get(word.text);
        return { text: word.text, vi: gloss?.vi ?? "", ipa: gloss?.ipa ?? "", mode: index % 2 === 0 ? "listen" : "meaning" };
      });
    },

    stageWords: () => [...stage.values()],

    handleAction(action: string): boolean {
      if (action !== "replay") return false;
      const text = (locked >= 0 ? slots.get(locked) : undefined) ?? lastTyped;
      if (text === "") return false;
      replayed.add(text);
      pronouncer.playNow(text);
      return true;
    },

    speak(text: string): void {
      pronouncer.playNow(text);
    },

    dispose(): void {
      if (disposed) return;
      disposed = true;
      flush();
      stop();
      if (browser) window.removeEventListener("pagehide", onHide);
      bridge.dispose();
    },
  };
  return client;
}

/** Saves the player's vocabulary level for the next deck. */
export function saveVocabLevel(level: number, storage: { writeJson(key: string, value: unknown): boolean } = safeLocalStorage): void {
  storage.writeJson(LEVEL_KEY, Math.max(1, Math.round(level)));
}
