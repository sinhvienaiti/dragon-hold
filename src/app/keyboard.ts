/**
 * Keyboard sounds from Typing Feel (parent docs/games/TYPING_FEEL_SERVICE.md
 * §5.1–5.3): the catalogue and the sets are read at run time from the build's
 * VITE_TYPING_FEEL_ORIGIN, never copied into the game. Startup never waits on
 * that host: the Sound panel opens at once with pendingKeyboardChoices, the
 * catalogue settles the saved choice when it arrives (a host that fails keeps
 * the player's set), and the first run waits at most KEYBOARD_GATE_MS for it.
 * A set that cannot sound this session (unavailable, or its load gave no
 * sample, at startup or picked in the Sound panel) has the game's own
 * Dragonhold sound stand in for it (GameKeyboard `onFail`), unsaved. Startup,
 * typing and the Sound panel load through the same timed fetches
 * (manifestJson, sampleBytes; quick.ts passes them to QuickSettings). The kit
 * owns variants and panel previews.
 */
import {
  KEYBOARD_CATALOG_TIMEOUT_MS, KEYBOARD_DECODE_BATCH_SIZE, KEYBOARD_SAMPLE_TIMEOUT_MS, loadKeyboardCatalog, settleKeyboardChoice, timedBytes, timedJson, typingFeelKeysBase, TypingSounds,
  type KeyboardCatalog, type KeyboardLoad, type KeyboardSettlement, type KeyboardSoundChoice,
} from "../kit/feedback/typing-fx";
import { BUILT_IN_KEYS, DEFAULT_KEYBOARD_SOUND, keyboardLevel, type Settings } from "./settings";

/** `<origin>/v1/keys/` from the build, or null: no origin, so Typing Feel is off (no network; Off and Dragonhold only). */
export const KEYS_BASE: string | null = typingFeelKeysBase(import.meta.env.VITE_TYPING_FEEL_ORIGIN);

/** The game's own key sound (the audio engine's `type.key`), right after Off with no family (so no heading above it). */
export const ORIGINAL_KEYBOARD: KeyboardSoundChoice = { value: BUILT_IN_KEYS, label: "Dragonhold" };

/** The first run waits this long at most for the saved set's first decoded batch, then starts without it (§5.1 step 6, §8.4). */
export const KEYBOARD_GATE_MS = 1500;

/** What the page shows once an origin is set and its catalogue did not load (§5.3). */
export const KEYBOARD_UNAVAILABLE = "Keyboard sounds unavailable";

/** The catalogue revalidates on every load (no-cache) and gives up after 3 s. */
export const catalogueJson = timedJson(KEYBOARD_CATALOG_TIMEOUT_MS);
/** A set manifest's URL is versioned (immutable): the HTTP cache may answer; a hung host fails it after 3 s. */
export const manifestJson = timedJson(KEYBOARD_CATALOG_TIMEOUT_MS, { cache: "default" });
/**
 * Sample and preview bytes, startup, typing and Sound panel alike: a file the
 * host has not delivered in 8 s (the kit's KEYBOARD_SAMPLE_TIMEOUT_MS) is
 * given up and counts as missing, so a set's load always ends (§8.1).
 */
export const sampleBytes = timedBytes(KEYBOARD_SAMPLE_TIMEOUT_MS);

/** A catalogue request started with the page: its base (null: Typing Feel off) and the catalogue it settles to (never rejects). */
export type KeyboardFeed = { readonly base: string | null; readonly catalog: Promise<KeyboardCatalog> };

/**
 * Starts reading the root catalogue; samples and previews stay lazy. Off and
 * Dragonhold come first, then the sets in catalogue order, each with its
 * `family` (the kit's picker draws one heading per family run). No base:
 * nothing is fetched and the catalogue is "missing" (Off and Dragonhold).
 */
export function requestKeyboardCatalogue(base: string | null = KEYS_BASE, fetchJson: (url: string) => Promise<unknown> = catalogueJson): KeyboardFeed {
  return { base, catalog: loadKeyboardCatalog(base, { extra: [ORIGINAL_KEYBOARD], fallback: [], fetchJson }) };
}

/** The save's own keyboard field (`keyboard`), read before the hard default fills it; null when the save has none. */
export function savedKeyboardId(raw: unknown): string | null {
  const id = raw !== null && typeof raw === "object" ? (raw as { keyboard?: unknown }).keyboard : undefined;
  return typeof id === "string" ? id : null;
}

/**
 * The kit's rule (settleKeyboardChoice) with Dragonhold's sounds: a catalogue
 * that loaded without the saved id moves it to the catalogue's default, then
 * Bright Clack, then the first set, then Dragonhold, and asks for a save; one
 * that did not load keeps the saved id ("Saved sound · unavailable").
 */
export function settleKeyboard(saved: string | null, catalog: KeyboardCatalog): KeyboardSettlement {
  return settleKeyboardChoice(saved, catalog, ORIGINAL_KEYBOARD, DEFAULT_KEYBOARD_SOUND);
}

/** How a load of the current keyboard sound ended: "playing" (the set sounds), "silent" (a set that cannot sound this session), "other" (Off, Dragonhold, nothing to load yet, or the player moved on). */
export type KeyboardPreload = "playing" | "silent" | "other";

export type GameKeyboardOptions = {
  /** A set manifest; default manifestJson (HTTP-cached, 3 s). */
  readonly fetchJson?: (url: string) => Promise<unknown>;
  /** Sample bytes; default sampleBytes (8 s a file). */
  readonly fetchBytes?: (url: string) => Promise<ArrayBuffer>;
  /**
   * The current keyboard sound `id`, a set, cannot sound this session: it is
   * unavailable (no catalogue, so "Saved sound · unavailable"), or its load
   * gave no sample or failed (here or in the Sound panel, pickFailed). The
   * page stands its own Dragonhold sound in for it, unsaved (§5.1 step 5,
   * §5.3). Once per id until the player picks a keyboard sound again.
   */
  readonly onFail?: (id: string) => void;
};

/** A load of the current set: its first decoded batch (resolves at the latest when the load ends) and how it ended. */
type Loading = { readonly id: string; readonly abort: AbortController; readonly first: Promise<void>; readonly result: Promise<KeyboardPreload> };

/**
 * The kit picker and gameplay share this player; only the current set loads,
 * as soon as the catalogue settles, gesture or not: it decodes on the page's
 * context, which app.ts makes suspended before the first gesture
 * (audio.prepare(), §5.4), so the first key already has its sound. Until
 * setChoices() gives it the settled list it loads nothing: the pending list
 * has no set to load.
 */
export class GameKeyboard {
  readonly sounds: TypingSounds;
  private choices: readonly KeyboardSoundChoice[];
  private settled = false;
  private generation = 0;
  private disposed = false;
  private loading: Loading | null = null;
  /** A set that cannot sound; typing does not refetch it until the player picks again (or the page reloads). */
  private failed: string | null = null;
  /** The set the Sound panel is loading itself (a pick): typing never starts a second load of it until the panel reports. */
  private picked: string | null = null;
  private readonly fetchJson: (url: string) => Promise<unknown>;
  private readonly fetchBytes: (url: string) => Promise<ArrayBuffer>;

  constructor(private readonly settings: () => Settings, choices: readonly KeyboardSoundChoice[], context: () => AudioContext, private readonly options: GameKeyboardOptions = {}) {
    this.sounds = new TypingSounds({ context });
    this.choices = choices;
    this.fetchJson = options.fetchJson ?? manifestJson;
    this.fetchBytes = options.fetchBytes ?? sampleBytes;
    this.refresh();
  }

  /** The settled list (settleKeyboard) once the catalogue is in; the current set can load from then on. */
  setChoices(choices: readonly KeyboardSoundChoice[]): void {
    this.choices = choices;
    this.settled = true;
  }

  refresh(): void {
    const s = this.settings();
    const level = keyboardLevel(s);
    this.sounds.setVolume(level);
    this.sounds.muted = level <= 0;
  }

  /**
   * The player picked a keyboard sound; the kit's picker loads it right after
   * this. Stops our load, forgets a failure and releases the outgoing set
   * here: the picker only releases the set it finds current, so leaving it
   * current-less (use("off")) kept every set picked in a session decoded.
   */
  changed(): void {
    this.generation += 1;
    this.cancel();
    this.failed = null;
    const id = this.settings().keyboard;
    const choice = this.choices.find((p) => p.value === id);
    this.picked = choice?.manifest !== undefined && !choice.disabled ? id : null;
    const old = this.sounds.profile;
    // The same set picked again stays: the picker reuses or reloads it itself.
    if (old && old.id !== id) this.sounds.release(old.id);
    this.refresh();
  }

  /** QuickSettings' onKeyboardLoad: the Sound panel's load of a pick ended; typing may load the set again if it has to. */
  pickLoaded(result: Pick<KeyboardLoad, "id">): void {
    if (this.picked === result.id) this.picked = null;
  }

  /** QuickSettings' onKeyboardFail: the set picked in the Sound panel cannot sound; while it is the current sound (a set, never Off or Dragonhold), it fails (onFail). */
  pickFailed(id: string): void {
    if (this.picked === id) this.picked = null;
    if (!this.disposed && id !== "off" && id !== BUILT_IN_KEYS && this.settings().keyboard === id) this.fail(id);
  }

  /**
   * Loads the current set unless it plays, loads or failed already. Active
   * from the start: the first decoded batch plays while the other variants
   * load. `playable` runs once: when the set's first decoded batch is in, or
   * when there is nothing to wait for (Off, Dragonhold, a set that cannot
   * sound, the catalogue not in). A set that cannot sound
   * fails (onFail) once. Never rejects.
   */
  async preload(playable: () => void = () => {}): Promise<KeyboardPreload> {
    let told = false;
    const tell = (): void => {
      if (told) return;
      told = true;
      playable();
    };
    try {
      const id = this.settings().keyboard;
      if (this.disposed || !this.settled || id === "off" || id === BUILT_IN_KEYS) return "other";
      const loading = this.loading;
      if (loading?.id === id) {
        void loading.first.then(tell);
        return await loading.result;
      }
      if (this.failed === id) return "silent";
      if (this.picked === id) return "other";
      if (this.sounds.profile?.id === id) return "playing";
      const choice = this.choices.find((p) => p.value === id);
      if (choice?.manifest === undefined || choice.disabled) {
        this.fail(id);
        return "silent";
      }
      const started = this.load(id, choice.manifest, choice.label);
      void started.first.then(tell);
      return await started.result;
    } finally {
      tell();
    }
  }

  private load(id: string, manifest: string, label: string): Loading {
    const generation = ++this.generation;
    this.cancel();
    const abort = new AbortController();
    let firstIn = (): void => {};
    const first = new Promise<void>((resolve) => { firstIn = resolve; });
    let requested = 0;
    // The kit asks for the second batch only once the first has settled with a
    // sample decoded (it stops otherwise), so the first request past one batch
    // means a batch is in.
    const counted = (url: string): Promise<ArrayBuffer> => {
      if (requested++ === KEYBOARD_DECODE_BATCH_SIZE) firstIn();
      return this.fetchBytes(url);
    };
    const result = (async (): Promise<KeyboardPreload> => {
      let state: KeyboardLoad["state"] | "error" = "error";
      try {
        state = (await this.sounds.loadKeyboardManifest(manifest, id, label, this.fetchJson, counted, true, abort.signal)).state;
      } catch { /* No audio: silent, like missing files. */ }
      finally { firstIn(); }
      // Superseded (a pick, another load) or disposed: the newer owner has the player.
      if (this.disposed || generation !== this.generation) return "other";
      this.loading = null;
      if (this.settings().keyboard !== id) return "other";
      if (state === "pending" || state === "error") {
        // Nothing fetched or decoded: silent, and never refetched on each key.
        this.sounds.use("off");
        this.fail(id);
        return "silent";
      }
      this.sounds.use(id);
      return "playing";
    })();
    const loading: Loading = { id, abort, first, result };
    this.loading = loading;
    return loading;
  }

  private fail(id: string): void {
    if (this.failed === id) return;
    this.failed = id;
    this.options.onFail?.(id);
  }

  /** Stops a load; the kit releases what it decoded, so a superseded set never stays in memory. */
  private cancel(): void {
    this.loading?.abort.abort();
    this.loading = null;
  }

  type(kind: "key" | "space"): void {
    if (this.disposed) return;
    this.refresh();
    if (this.sounds.muted) return;
    void this.preload();
    if (kind === "space") this.sounds.space();
    else this.sounds.key(0);
  }

  dispose(): void {
    this.disposed = true;
    this.generation += 1;
    this.cancel();
    this.sounds.dispose();
  }
}

/** What startKeyboard asks of the page. */
export type KeyboardHost = {
  /** The page's keyboard id now (settings.keyboard). */
  current(): string;
  /** The catalogue settled the choice: take `id`; `save` only when it repaired the save. */
  choose(id: string, save: boolean): void;
  /** The Sound panel's keyboard row takes the settled list (QuickSettings.setChoiceOptions), open or not. */
  list(options: readonly KeyboardSoundChoice[]): void;
  /** An origin is set and its catalogue did not load (404, HTML, no answer in 3 s, CORS, no usable set). */
  unavailable(): void;
  /** Once, when the first run may start. */
  playable(): void;
};

/**
 * Settles the saved choice once `feed`'s catalogue is in, hands the list to
 * the player and the Sound panel, then loads the current set at once (no
 * gesture needed: it decodes on the page's suspended context); the page
 * never waits on it. `saved` is the save's own field (savedKeyboardId). A choice
 * the player made while the catalogue loaded (Off or Dragonhold: the pending
 * list has nothing else; `signal` aborted) stands and is not saved again
 * here. host.playable() runs once: when the set's first batch is in, when
 * there is nothing to wait for, or `gateMs` (KEYBOARD_GATE_MS) after this
 * call, whichever comes first. A set that cannot sound reaches the page
 * through the keyboard's `onFail`. Never rejects.
 */
export async function startKeyboard(
  keyboard: GameKeyboard,
  feed: KeyboardFeed,
  saved: string | null,
  host: KeyboardHost,
  options: { readonly gateMs?: number; readonly signal?: AbortSignal } = {},
): Promise<void> {
  const pending = host.current();
  let told = false;
  const tell = (): void => {
    if (told) return;
    told = true;
    host.playable();
  };
  const timer = setTimeout(tell, options.gateMs ?? KEYBOARD_GATE_MS);
  try {
    const catalog = await feed.catalog;
    const now = host.current();
    const picked = options.signal?.aborted === true || now !== pending;
    const settled = settleKeyboard(picked ? now : saved, catalog);
    host.choose(settled.id, settled.repaired);
    keyboard.setChoices(settled.options);
    host.list(settled.options);
    if (feed.base !== null && catalog.state !== "ready") host.unavailable();
    await keyboard.preload(tell);
  } catch { /* A hook threw: the run starts; typing loads the set as before. */ }
  finally {
    clearTimeout(timer);
    tell();
  }
}
