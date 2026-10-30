import { loadKeyboardCatalog, TypingSounds, type KeyboardLoad, type KeyboardSoundChoice } from "../kit/feedback/typing-fx";
import { BUILT_IN_KEYS, keyboardLevel, type Settings } from "./settings";

export const KEYS_BASE = `${import.meta.env.BASE_URL}assets/dragon-hold/audio/keys/`;
export const ORIGINAL_KEYBOARD: KeyboardSoundChoice = { value: BUILT_IN_KEYS, label: "Dragonhold" };

export function loadGameKeyboards(): ReturnType<typeof loadKeyboardCatalog> {
  return loadKeyboardCatalog(KEYS_BASE, { fallback: [], extra: [ORIGINAL_KEYBOARD] });
}

/** The kit picker and gameplay share this player; only the saved pack preloads. */
export class GameKeyboard {
  readonly sounds: TypingSounds;
  private generation = 0;
  private disposed = false;
  private pending: string | null = null;
  private abort: AbortController | null = null;
  /** A set that could not be fetched or decoded; typing does not refetch it until the player picks again (or the page reloads). */
  private failed: string | null = null;

  constructor(private readonly settings: () => Settings, private readonly choices: readonly KeyboardSoundChoice[], context: () => AudioContext) {
    this.sounds = new TypingSounds({ context });
    this.refresh();
  }

  refresh(): void {
    const s = this.settings();
    const level = keyboardLevel(s);
    this.sounds.setVolume(level);
    this.sounds.muted = level <= 0;
  }

  /**
   * The player picked a set; the kit's picker loads it right after this. Stops our load, forgets a
   * failure and releases the outgoing set here: the picker only releases the set it finds current,
   * so leaving it current-less (use("off")) kept every set picked in a session decoded.
   */
  changed(): void {
    this.generation += 1;
    this.cancel();
    this.failed = null;
    const old = this.sounds.profile;
    // The same set picked again stays: the picker reuses or reloads it itself.
    if (old && old.id !== this.settings().keyboard) this.sounds.release(old.id);
    this.refresh();
  }

  async preload(): Promise<void> {
    const id = this.settings().keyboard;
    const choice = this.choices.find((p) => p.value === id);
    if (this.disposed || !choice?.manifest || this.failed === id || this.pending === id || this.sounds.profile?.id === id) return;
    const generation = ++this.generation;
    this.cancel();
    const abort = new AbortController();
    this.abort = abort;
    this.pending = id;
    let state: KeyboardLoad["state"] | "error" = "error";
    try {
      // Active from the start: the first decoded batch plays while the other variants load.
      const result = await this.sounds.loadKeyboardManifest(choice.manifest, id, choice.label, undefined, undefined, true, abort.signal);
      state = result.state;
      if (!this.disposed && generation === this.generation && this.settings().keyboard === id) this.sounds.use(result.state === "pending" ? "off" : id);
    } catch { /* No audio: silent, like missing files. */ }
    finally {
      if (generation === this.generation) {
        this.pending = null;
        this.abort = null;
        // Nothing fetched or decoded: stay silent rather than refetch the manifest and every sample on each key.
        if (state === "pending" || state === "error") this.failed = id;
      }
    }
  }

  /** Stops a startup load and releases what it decoded, so a superseded set never stays in memory. */
  private cancel(): void {
    this.abort?.abort();
    this.abort = null;
    this.pending = null;
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
