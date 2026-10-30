// Kit module feedback/typing-fx: the focus strip (the active word big, a chosen letter-effect style), key sounds and their settings.
export {
  DEFAULT_TYPING_FX, sanitizeTypingFx, stripCapPx, TYPING_FX_CAP, TYPING_FX_FIELD, TYPING_FX_INTENSITIES, TYPING_FX_INTENSITY_NAMES, TYPING_FX_SIZE_NAMES, TYPING_FX_SIZES, TYPING_FX_STYLE_NAMES, TYPING_FX_STYLES,
  type TypingFxIntensity, type TypingFxSettings, type TypingFxSize, type TypingFxStyle,
} from "./settings";
export { comboFactor, comboParticles, comboSize, INTENSITY, isMilestone, levelFor, PRIORITY, wordPriority, type IntensityLevel, type Priority } from "./intensity";
export { ParticlePool, PK, type ParticleKind } from "./pool";
export { kitKind, TypingFxDriver, type TypingFxKind, type TypingFxProgress, type TypingFxSink } from "./driver";
export { FRAME_MS, STYLES, TONE, WRONG_MS, flyEase, popEnvelope, squeeze, wrongPose, type GlyphPose, type SpawnCtx, type StyleRecipe } from "./styles";
export { DEFAULT_PALETTE, FxCanvas, mixHex, toneColors, type TypingFxAtlas, type TypingFxPalette, type TypingFxTextures } from "./draw";
export { injectTypingFxCss, TYPING_FX_CSS } from "./css";
export { FocusStrip, type FocusStripOptions } from "./strip";
export {
  KEYBOARD_DECODE_BATCH_SIZE, KEYBOARD_FIRST_BATCH_SPACES, KEYBOARD_PROFILES, keyboardFiles, profileGaps, TYPING_SOUND_EVENTS, TYPING_SOUND_MAP, TYPING_SOUND_SET, TYPING_SOUND_SETS, TypingSounds, VariantPicker, VoicePool,
  type KeyboardLoad, type SoundStandIn, type TypingSoundEvent, type TypingSoundProfile, type TypingSoundSet, type TypingSoundsOptions,
} from "./audio";

export { loadKeyboardCatalog, KeyboardSoundPreview, keyboardPreviewGain, KEYBOARD_PREVIEW_DELAY_MS, KEYBOARD_PREVIEW_SECONDS, KEYBOARD_PREVIEW_FADE_SECONDS, type KeyboardCatalog, type KeyboardSoundChoice, type KeyboardPreviewLevels } from "./audio";
// Typing Feel data step (TYPING_FEEL_SERVICE.md §4.6): timed catalogue fetch, saved-choice rule, keys base from the build's origin.
export { KEYBOARD_CATALOG_TIMEOUT_MS, pendingKeyboardChoices, settleKeyboardChoice, timedJson, typingFeelKeysBase, type KeyboardSettlement } from "./audio";
