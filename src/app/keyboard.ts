import { loadKeyboardCatalog, TypingSounds, type KeyboardSoundChoice } from "../kit/feedback/typing-fx";
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

  /** Invalidates startup loads when the picker takes ownership of a selection. */
  changed(): void {
    this.generation += 1;
    this.cancel();
    this.sounds.use("off");
    this.refresh();
  }

  async preload(): Promise<void> {
    const id = this.settings().keyboard;
    const choice = this.choices.find((p) => p.value === id);
    if (this.disposed || !choice?.manifest || this.pending === id || this.sounds.profile?.id === id) return;
    const generation = ++this.generation;
    this.cancel();
    const abort = new AbortController();
    this.abort = abort;
    this.pending = id;
    try {
      // Active from the start: the first decoded batch plays while the other variants load.
      const result = await this.sounds.loadKeyboardManifest(choice.manifest, id, choice.label, undefined, undefined, true, abort.signal);
      if (!this.disposed && generation === this.generation && this.settings().keyboard === id) this.sounds.use(result.state === "pending" ? "off" : id);
    } catch { /* An unavailable file stays silent; a later gesture can retry. */ }
    finally { if (generation === this.generation) { this.pending = null; this.abort = null; } }
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
