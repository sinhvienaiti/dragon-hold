// Multi-bus Web Audio mixer that plays a game's own sound table, plus the dragon voices.
export { DEFAULT_AUDIO_BASE, audioUrl } from "./util";
export {
  AUDIO_GROUPS,
  AUDIO_GROUP_GAIN,
  BusMix,
  DEFAULT_BUSES,
  PRONUNCIATION_DUCK,
  mixedSfxGain,
  setPronunciationBoost,
  type AudioGroup,
  type BusSpec,
  type BusTable,
} from "./mix";
export {
  DRAGON_SAMPLES,
  SCENE_VOICES,
  bufferStats,
  noiseBuffer,
  recordedVoice,
  synthVoice,
  voiceBus,
  voiceStats,
  type DragonSample,
  type SceneVoice,
} from "./dragon-voice";
export {
  SceneAudio,
  type PlayOptions,
  type PlayCounts,
  type SceneAudioStats,
  type SceneAudioOptions,
  type SoundSpec,
  type SoundTable,
} from "./scene-audio";

export { parseAudioManifest, loadAudioManifest, type AudioManifest, type AudioManifestV1, type AudioManifestV2, type AudioManifestSource, type ManifestSound, type ManifestTrack } from "./manifest";
export { VariantPicker, type VariantOptions } from "./variants";
export { FileBank, LayeredBank, type MissingHook, type FileBankOptions, type FileBankStats, type DurationMismatch, type FileSelection, type LayeredSelection } from "./file-bank";
