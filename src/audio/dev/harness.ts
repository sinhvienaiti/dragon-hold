/**
 * Dev-only audio check page (/src/audio/dev/harness.html; never imported by
 * the game). Renders offline: every catalog sound through the real mixer
 * (plays, not silent, never past the guard), a 200-foe flood through the
 * mapper, limiter and engine (no clipping, typing always heard), the
 * pronunciation dips per bus (05 §7.2, scenario dh-audio-duck), and the
 * music crossfading calm → battle. Then a live AudioContext run of
 * createAudio() with a fake world. Results go to window.__audioHarness and
 * are drawn as waveforms for a screenshot.
 * Owner: audio (LANES.md).
 */
import { SynthBank } from "../bank";
import { CHILD_BUSES, SOUNDS, SOUND_IDS, type ChildBus, type SoundId } from "../catalog";
import { AudioEngine } from "../engine";
import { createAudio } from "../index";
import { EventMapper, type Listener } from "../map-events";
import { AudioMix, DEFAULT_VOLUMES, NO_DUCK, gainToDb, type DuckState } from "../mix";
import { GUARD_CEILING, Mixer } from "../mixer";
import { MusicDirector } from "../music";
import { musicTargets } from "../music-plan";
import { PRONUNCIATION_EVENT } from "../../kit/speech";
import type { EnemyRef, FoeId, SimEvent } from "../../content/types";
import type { World } from "../../sim/world";

const RATE = 48_000;
const L: Listener = { x: 0, z: 0, yaw: 0 };

interface Rendered {
  readonly left: Float32Array;
  readonly peak: number;
  readonly rms: number;
}

function analyse(buffer: AudioBuffer): Rendered {
  const left = buffer.getChannelData(0);
  const right = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : left;
  let peak = 0;
  let sum = 0;
  for (let i = 0; i < left.length; i += 1) {
    const a = Math.max(Math.abs(left[i]!), Math.abs(right[i]!));
    peak = Math.max(peak, a);
    sum += left[i]! * left[i]!;
  }
  return { left, peak, rms: Math.sqrt(sum / left.length) };
}

function windowRms(data: Float32Array, from: number, to: number): number {
  let sum = 0;
  const a = Math.floor(from * RATE);
  const b = Math.min(data.length, Math.floor(to * RATE));
  for (let i = a; i < b; i += 1) sum += data[i]! * data[i]!;
  return Math.sqrt(sum / Math.max(1, b - a));
}

function rig(ctx: BaseAudioContext, maxVoices = 32) {
  const mix = new AudioMix();
  const mixer = new Mixer(ctx, mix, DEFAULT_VOLUMES);
  const bank = new SynthBank();
  const engine = new AudioEngine(mixer, bank, { maxVoices });
  return { mix, mixer, bank, engine };
}

// ── 1. Every sound ──────────────────────────────────────────────────────────

interface SoundResult {
  id: SoundId;
  ok: boolean;
  peak: number;
  tailMs: number;
  error?: string;
}

async function renderSound(id: SoundId): Promise<{ result: SoundResult; data: Float32Array }> {
  const def = SOUNDS[id];
  const loop = "loop" in def;
  const seconds = loop ? 2 : Math.min(6, def.lengthMs / 1000 + 1.4);
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * RATE), RATE);
  try {
    const { engine } = rig(ctx);
    let played = true;
    if (loop) engine.bed(id, 1, 0, 0.01);
    else played = engine.play({ id, step: 5, count: 6, variant: 1, material: "leaf" }, 0.02);
    const out = analyse(await ctx.startRendering());
    let last = 0;
    for (let i = out.left.length - 1; i >= 0; i -= 1) {
      if (Math.abs(out.left[i]!) > 0.001) {
        last = i;
        break;
      }
    }
    const ok = played && out.peak > 0.001 && out.peak <= GUARD_CEILING + 1e-3;
    return { result: { id, ok, peak: round(out.peak), tailMs: Math.round((last / RATE) * 1000) }, data: out.left };
  } catch (error) {
    return { result: { id, ok: false, peak: 0, tailMs: 0, error: String(error) }, data: new Float32Array(1) };
  }
}

// ── 2. 200 foes at once ─────────────────────────────────────────────────────

const FOES: readonly FoeId[] = ["moss-grunt", "moss-archer", "blight-wolf", "tusk-boar", "thorn-wasp", "thorn-ant"];

async function flood() {
  const seconds = 6;
  const ctx = new OfflineAudioContext(2, seconds * RATE, RATE);
  const { engine } = rig(ctx, 32);
  const mapper = new EventMapper();
  const foes: { ref: EnemyRef; foe: FoeId; alive: boolean }[] = [];
  for (let i = 0; i < 200; i += 1) foes.push({ ref: { slot: i, serial: i + 1 }, foe: i === 0 ? "moss-banner" : FOES[i % FOES.length]!, alive: true });
  let asked = 0;
  let played = 0;
  let keysAsked = 0;
  let keysPlayed = 0;
  let maxVoices = 0;
  for (let frame = 0; frame < seconds * 60 - 30; frame += 1) {
    const t = frame / 60;
    const events: SimEvent[] = [];
    if (frame === 0) for (const f of foes) events.push({ tick: frame, type: "spawn", enemy: f.ref, foe: f.foe, lane: "a", x: (f.ref.slot % 20) - 10, z: -20, elite: false, cluster: -1 });
    for (const f of foes) {
      if (!f.alive) continue;
      const k = (f.ref.slot + frame) % 40;
      const src = { kind: "enemy" as const, slot: f.ref.slot, serial: f.ref.serial };
      if (k === 0) events.push({ tick: frame, type: "attack", source: src, target: { kind: "hero" }, stage: "windup", x: 1, z: -2, tx: 0, tz: 0 });
      if (k === 20) events.push({ tick: frame, type: "attack", source: src, target: { kind: "hero" }, stage: "strike", x: 1, z: -2, tx: 0, tz: 0 });
      if (k === 10) events.push({ tick: frame, type: "hit", target: src, source: { kind: "hero" }, amount: 30, damageType: "word", tier: 2, grade: "good", x: 0, z: -8, hpLeft: 20 });
      if (k === 30) events.push({ tick: frame, type: "hit", target: { kind: "hero" }, source: src, amount: 12, damageType: "physical", tier: 1, grade: null, x: 0, z: 0, hpLeft: 500 });
    }
    if (frame > 60) {
      for (let n = 0; n < 3; n += 1) {
        const f = foes.find((x) => x.alive && x.ref.slot % 3 === n);
        if (f) {
          f.alive = false;
          events.push({ tick: frame, type: "death", enemy: f.ref, foe: f.foe, by: "word", x: 0, z: -6, material: "leaf", tier: 2 });
        }
      }
    }
    if (frame % 30 === 5) events.push({ tick: frame, type: "trap-trigger", slot: 2, trap: "pine-bomb", x: 4, z: -9, count: 8 });
    if (frame % 6 === 0) events.push({ tick: frame, type: "word-progress", word: 1, typed: (frame / 6) % 8, key: "advance", letter: 3 });
    for (const cue of mapper.map(events, t, L)) {
      asked += 1;
      const ok = engine.play(cue, t + 0.02);
      if (ok) played += 1;
      if (cue.id === "type.key") {
        keysAsked += 1;
        if (ok) keysPlayed += 1;
      }
    }
    maxVoices = Math.max(maxVoices, engine.limiter.active(t + 0.02));
  }
  const out = analyse(await ctx.startRendering());
  let loudest = 0;
  for (let t = 0; t < seconds - 0.1; t += 0.1) loudest = Math.max(loudest, windowRms(out.left, t, t + 0.1));
  return {
    data: out.left,
    result: {
      peak: round(out.peak),
      loudest100msRmsDb: round(gainToDb(loudest)),
      cuesAsked: asked,
      cuesPlayed: played,
      keysAsked,
      keysPlayed,
      maxVoices,
      stolen: engine.limiter.stats.stolen,
      rejected: { ...engine.limiter.stats.rejected },
      ok: out.peak <= GUARD_CEILING + 1e-3 && keysPlayed === keysAsked && maxVoices <= 36,
    },
  };
}

// ── 3. Pronunciation dips per bus (dh-audio-duck) ───────────────────────────

async function duckFor(bus: ChildBus) {
  const ctx = new OfflineAudioContext(1, 4 * RATE, RATE);
  const { mix, mixer } = rig(ctx);
  const osc = ctx.createOscillator();
  osc.frequency.value = 330;
  const level = ctx.createGain();
  level.gain.value = 0.05;
  osc.connect(level).connect(mixer.input(bus));
  osc.start(0);
  const on: DuckState = { ...NO_DUCK, pronunciation: true };
  const apply = (state: DuckState, prev: DuckState) => {
    const target = mix.target(bus, state, mixer.duckOf(bus), prev);
    mixer.setDuck(bus, target.duck, target.rampS);
  };
  void ctx.suspend(1).then(() => {
    apply(on, NO_DUCK);
    void ctx.resume();
  });
  void ctx.suspend(2.5).then(() => {
    apply(NO_DUCK, on);
    void ctx.resume();
  });
  const data = (await ctx.startRendering()).getChannelData(0);
  const before = windowRms(data, 0.5, 0.95);
  const during = windowRms(data, 1.6, 2.4);
  const after = windowRms(data, 3.4, 3.9);
  // 80 % of the way down: how long did it take?
  const goal = before * Math.pow(10, gainToDb(mix.duck(bus, on)) * 0.8 / 20);
  let downMs = -1;
  for (let t = 1; t < 1.6; t += 0.005) {
    if (windowRms(data, t, t + 0.01) <= goal + 1e-9) {
      downMs = Math.round((t - 1) * 1000);
      break;
    }
  }
  return { bus, dipDb: round(gainToDb(during / before)), backDb: round(gainToDb(after / before)), downMs };
}

// ── 4. Music: calm, then battle from the next bar ───────────────────────────

async function musicRender() {
  const seconds = 14;
  const ctx = new OfflineAudioContext(2, seconds * RATE, RATE);
  const { mixer, bank } = rig(ctx);
  const director = new MusicDirector(ctx, mixer.input("music"), bank, bank.noiseFor(ctx));
  for (let t = 0; t < seconds - 0.4; t += 0.05) {
    const wave = t >= 6;
    director.update(t, musicTargets({ phase: wave ? "wave" : "prep", wave: wave ? 3 : 0, waves: 10, heroPct: 100, live: wave ? 30 : 0, generals: 0, sharedMusic: false }));
  }
  const out = analyse(await ctx.startRendering());
  return {
    data: out.left,
    result: {
      peak: round(out.peak),
      calmRmsDb: round(gainToDb(windowRms(out.left, 2, 6))),
      battleRmsDb: round(gainToDb(windowRms(out.left, 10, 13.5))),
      ok: out.peak > 0.01 && out.peak <= GUARD_CEILING + 1e-3,
    },
  };
}

// ── 5. Live: createAudio() on a real AudioContext ───────────────────────────

async function live() {
  const audio = createAudio({ autoUnlock: false });
  audio.unlock();
  const list = Array.from({ length: 60 }, (_, i) => ({ alive: true, freed: false, foe: FOES[i % FOES.length]!, x: (i - 30) * 30_000, z: -600_000, slot: i, serial: i + 1 }));
  const world = { phase: "wave", wave: 3, hero: { hp: 300, hpMax: 1000 }, enemies: { list, live: list.length } } as unknown as World;
  const errors: string[] = [];
  let ducked: Record<string, number> = {};
  const started = performance.now();
  let frame = 0;
  await new Promise<void>((resolve) => {
    const tick = () => {
      const elapsed = performance.now() - started;
      try {
        const events: SimEvent[] = [];
        if (frame === 0) for (const e of list) events.push({ tick: 0, type: "spawn", enemy: { slot: e.slot, serial: e.serial }, foe: e.foe, lane: "a", x: e.x / 60_000, z: -10, elite: false, cluster: -1 });
        if (frame % 10 === 3) events.push({ tick: frame, type: "word-progress", word: 1, typed: (frame / 10) % 6, key: "advance", letter: 1 });
        if (frame % 45 === 0 && frame > 0) {
          const e = list[frame % list.length]!;
          events.push({ tick: frame, type: "hit", target: { kind: "enemy", slot: e.slot, serial: e.serial }, source: { kind: "hero" }, amount: 40, damageType: "word", tier: 2, grade: "good", x: e.x / 60_000, z: -8, hpLeft: 0 });
        }
        audio.onEvents(events, world);
        audio.frame(world, { dt: 1 / 60, worldDt: 1 / 60, alpha: 0, now: performance.now() });
        if (frame === 30) window.dispatchEvent(new CustomEvent(PRONUNCIATION_EVENT, { detail: { active: true } }));
        if (elapsed > 1500 && Object.keys(ducked).length === 0) ducked = { ...audio.stats().ducks };
        if (elapsed > 2000) window.dispatchEvent(new CustomEvent(PRONUNCIATION_EVENT, { detail: { active: false } }));
      } catch (error) {
        errors.push(String(error));
      }
      frame += 1;
      if (elapsed < 3000) requestAnimationFrame(tick);
      else resolve();
    };
    requestAnimationFrame(tick);
  });
  const stats = audio.stats();
  audio.dispose();
  return {
    unlocked: stats.unlocked,
    frames: frame,
    admitted: stats.admitted,
    peakVoices: stats.peakVoices,
    music: stats.music,
    duckedMusicDb: round(gainToDb(ducked["music"] ?? 1)),
    duckedLearningDb: round(gainToDb(ducked["learning"] ?? 1)),
    errors,
    ok: errors.length === 0 && stats.admitted > 0,
  };
}

// ── Drawing ─────────────────────────────────────────────────────────────────

function wave(g: CanvasRenderingContext2D, data: Float32Array, x: number, y: number, w: number, h: number, color: string): void {
  g.strokeStyle = color;
  g.beginPath();
  const per = Math.max(1, Math.floor(data.length / w));
  for (let px = 0; px < w; px += 1) {
    let max = 0;
    for (let i = px * per; i < Math.min(data.length, (px + 1) * per); i += 1) max = Math.max(max, Math.abs(data[i]!));
    const a = Math.min(1, max) * (h / 2);
    g.moveTo(x + px + 0.5, y + h / 2 - a);
    g.lineTo(x + px + 0.5, y + h / 2 + a);
  }
  g.stroke();
  g.strokeStyle = "#3a463b";
  g.strokeRect(x + 0.5, y + 0.5, w, h);
  // The guard ceiling.
  g.strokeStyle = "#7a3b2e";
  g.beginPath();
  g.moveTo(x, y + h / 2 - GUARD_CEILING * (h / 2));
  g.lineTo(x + w, y + h / 2 - GUARD_CEILING * (h / 2));
  g.stroke();
}

const round = (v: number) => Math.round(v * 1000) / 1000;

async function main(): Promise<void> {
  const status = document.getElementById("status")!;
  const report = document.getElementById("report")!;
  const canvas = document.getElementById("view") as HTMLCanvasElement;
  const g = canvas.getContext("2d")!;
  g.fillStyle = "#0d110e";
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.font = "11px ui-monospace, Menlo, monospace";

  const sounds: SoundResult[] = [];
  const cols = 10;
  const cellW = 156;
  const cellH = 58;
  for (let index = 0; index < SOUND_IDS.length; index += 1) {
    const id = SOUND_IDS[index]!;
    status.textContent = "Âm " + (index + 1) + "/" + SOUND_IDS.length + ": " + id;
    const { result, data } = await renderSound(id);
    sounds.push(result);
    const x = 4 + (index % cols) * (cellW + 4);
    const y = 4 + Math.floor(index / cols) * (cellH + 16);
    g.fillStyle = result.ok ? "#cfc6ab" : "#ff7a6b";
    g.fillText(id, x, y + 10);
    wave(g, data, x, y + 14, cellW, cellH, result.ok ? "#8fd18a" : "#ff7a6b");
  }

  status.textContent = "Bầy 200 quái…";
  const crowd = await flood();
  const rowY = 4 + Math.ceil(SOUND_IDS.length / cols) * (cellH + 16) + 8;
  g.fillStyle = "#cfc6ab";
  g.fillText("200 quái, 6 s: đỉnh " + crowd.result.peak + " · tiếng tối đa " + crowd.result.maxVoices + " · phím " + crowd.result.keysPlayed + "/" + crowd.result.keysAsked, 4, rowY);
  wave(g, crowd.data, 4, rowY + 6, 1590, 70, "#e3b05a");

  status.textContent = "Nhường tiếng…";
  const ducks = [];
  for (const bus of ["music", "enemies", "traps", "dragon", "ambience", "typing", "learning"] as const) ducks.push(await duckFor(bus));

  status.textContent = "Nhạc…";
  const music = await musicRender();
  g.fillStyle = "#cfc6ab";
  g.fillText("Nhạc 14 s: Rừng 0–6 s, thêm Đợt từ ô nhịp kế · đỉnh " + music.result.peak + " · " + music.result.calmRmsDb + " dB → " + music.result.battleRmsDb + " dB", 4, rowY + 92);
  wave(g, music.data, 4, rowY + 98, 1590, 70, "#7fb7e0");
  g.fillStyle = "#cfc6ab";
  g.fillText("Phát âm từ: " + ducks.map((d) => d.bus + " " + d.dipDb + " dB (" + d.downMs + " ms)").join(" · "), 4, rowY + 186);

  status.textContent = "Chạy thật (AudioContext)…";
  const liveResult = await live();
  g.fillText("createAudio thật: " + liveResult.frames + " khung, " + liveResult.admitted + " tiếng, nhạc " + JSON.stringify(liveResult.music) + ", lỗi " + liveResult.errors.length, 4, rowY + 204);

  const failures = sounds.filter((s) => !s.ok).map((s) => s.id);
  const results = {
    done: true,
    sounds: sounds.length,
    failures,
    soundDetails: sounds,
    flood: crowd.result,
    ducks,
    music: music.result,
    live: liveResult,
    buses: CHILD_BUSES.length + 1,
  };
  (window as unknown as { __audioHarness: unknown }).__audioHarness = results;
  status.textContent = failures.length === 0 && crowd.result.ok && music.result.ok && liveResult.ok ? "Xong: đạt" : "Xong: có lỗi";
  report.textContent = JSON.stringify({ ...results, soundDetails: undefined }, null, 2);
}

void main();
