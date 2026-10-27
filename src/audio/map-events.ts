/**
 * Sim events → sound cues (05 §5, §7). Pure and allocation-light: one cue
 * pool reused every frame. Word hits are gathered (the first plays at once,
 * hits landing within 45 ms only add weight, three or more add one
 * "many targets" layer); deaths in a frame fold into one sound per class with
 * a rising pentatonic chime; warnings (a foe winding up on Hỏa Long, a
 * general's telegraph) are P1. Times are seconds on the audio clock.
 * Owner: audio (LANES.md).
 */
import type { EntityRef, FoeId, Grade, HouseId, Material, PlaceableId, SimEvent, TrapId, WordGroup } from "../content/types";
import { CLASS_SETS, GENERAL_SETS, foeVoice, type SoundClass, type SoundId } from "./catalog";

export interface Cue {
  id: SoundId;
  /** Event gain 0–1 on top of the catalog level. */
  gain: number;
  /** Pitch factor (size), 1 = as made. */
  rate: number;
  /** Stereo position −1 … 1 from the listener. */
  pan: number;
  /** Letter step (keys), chain step (kill chime). */
  step: number;
  /** How many things it stands for (gathered hits, deaths, trap victims). */
  count: number;
  /** Variant index: impact a/b/c, word grade 0 normal 1 perfect 2 flash. */
  variant: number;
  material: Material | null;
  /** Start this much later, seconds. */
  delayS: number;
}

/** Where the ears are: the camera's ground focus (metres) and heading (0 looks north, −z). */
export interface Listener {
  x: number;
  z: number;
  yaw: number;
}

/** Half the width of the battlefield that spans the stereo field, metres. */
export const PAN_SPAN_M = 22;
export const MAX_PAN = 0.8;
/** Word hits this close together play as one (05 §7 "gom 30–45 ms"). */
export const GATHER_S = 0.045;
/** Kills this close climb the chime scale (kit AudioCues rule). */
export const CHAIN_S = 1;
export const CHAIN_TOP = 12;
/** Hỏa Long below this share of HP is "low" (05 §7 P1, music surge). */
export const LOW_HP_PCT = 35;
/** A wave start within this long of the warning horn does not blow it again. */
const HORN_DEDUP_S = 8;

export function panFor(x: number, z: number, listener: Listener): number {
  const dx = x - listener.x;
  const dz = z - listener.z;
  // Right of a camera heading `yaw` (0: looking north, right is east).
  const right = dx * Math.cos(listener.yaw) - dz * Math.sin(listener.yaw);
  const pan = right / PAN_SPAN_M;
  return pan < -MAX_PAN ? -MAX_PAN : pan > MAX_PAN ? MAX_PAN : pan;
}

/** Far things are a little quieter, never silent. */
export function distanceGain(x: number, z: number, listener: Listener): number {
  const d = Math.hypot(x - listener.x, z - listener.z);
  const t = Math.min(1, Math.max(0, (d - 8) / 40));
  return 1 - 0.35 * t;
}

const TRAP_SOUNDS: Readonly<Record<TrapId, { arm: SoundId; trigger: SoundId }>> = {
  spikes: { arm: "trap.spikes.arm", trigger: "trap.spikes.trigger" },
  "pine-bomb": { arm: "trap.pine-bomb.arm", trigger: "trap.pine-bomb.trigger" },
  "net-launcher": { arm: "trap.net.arm", trigger: "trap.net.trigger" },
};

const HOUSE_SOUNDS: Readonly<Record<HouseId, { place: SoundId; pulse: SoundId }>> = {
  "herb-hut": { place: "house.herb.place", pulse: "house.herb.pulse" },
};

/** The build sound of anything placed in a slot. */
export function placeSound(item: PlaceableId): SoundId {
  if (item in TRAP_SOUNDS) return TRAP_SOUNDS[item as TrapId].arm;
  if (item in HOUSE_SOUNDS) return HOUSE_SOUNDS[item as HouseId].place;
  return "unit.warden.place";
}

const GRADE_VARIANT: Readonly<Record<Grade, number>> = { sloppy: 0, ok: 0, good: 0, perfect: 1, flash: 2 };

interface DeathFold {
  count: number;
  x: number;
  z: number;
  rate: number;
  material: Material;
}

/** Hỏa Long's low-HP alarm (05 §7 P1): one alarm on crossing 35 %, then a soft heartbeat while below. */
export class LowHpAlarm {
  private low = false;
  private nextBeat = 0;
  constructor(readonly beatS = 1.4) {}

  update(hpPct: number, now: number): SoundId | null {
    const low = hpPct > 0 && hpPct < LOW_HP_PCT;
    if (low && !this.low) {
      this.low = true;
      this.nextBeat = now + this.beatS;
      return "dragon.low";
    }
    if (!low) {
      this.low = false;
      return null;
    }
    if (now >= this.nextBeat) {
      this.nextBeat = now + this.beatS;
      return "dragon.heartbeat";
    }
    return null;
  }

  get active(): boolean {
    return this.low;
  }
}

export class EventMapper {
  /** Live foes by serial (from `spawn`), so blows and deaths know their class. */
  private readonly foes = new Map<number, FoeId>();
  private readonly generals = new Set<number>();
  private readonly wordGroups = new Map<number, WordGroup>();
  private readonly pool: Cue[] = [];
  private readonly out: Cue[] = [];
  private readonly deaths = new Map<SoundClass, DeathFold>();
  private window = { start: -1e9, count: 0, multi: false };
  private chain = { step: 0, last: -1e9 };
  private impactTurn = 0;
  private lastHorn = -1e9;
  private rageFull = false;
  private warningUntil = -1e9;
  /** Run flow the music reads. */
  phase: string = "prep";
  wave = 0;
  waves = 10;

  /** A general alive on the field (music adds its layer). */
  get generalsAlive(): number {
    return this.generals.size;
  }

  /** A general's telegraph is open: warning duck, no pronunciation (01 §6.4). */
  warningActive(now: number): boolean {
    return now < this.warningUntil;
  }

  /** Forgets the run (new stage, restart). */
  reset(): void {
    this.foes.clear();
    this.generals.clear();
    this.wordGroups.clear();
    this.window = { start: -1e9, count: 0, multi: false };
    this.chain = { step: 0, last: -1e9 };
    this.rageFull = false;
    this.warningUntil = -1e9;
    this.phase = "prep";
    this.wave = 0;
  }

  /** The cues for one frame's events; the array and its cues are reused by the next call. */
  map(events: readonly SimEvent[], now: number, listener: Listener): readonly Cue[] {
    this.out.length = 0;
    this.deaths.clear();
    for (const event of events) this.one(event, now, listener);
    this.foldDeaths(now, listener);
    const w = this.window;
    if (w.count >= 3 && !w.multi && now - w.start < GATHER_S) {
      w.multi = true;
      this.push("impact.multi", { gain: Math.min(1, 0.55 + Math.log2(w.count) * 0.15), count: w.count });
    }
    return this.out;
  }

  private one(event: SimEvent, now: number, listener: Listener): void {
    switch (event.type) {
      case "phase":
        this.phase = event.phase;
        this.wave = event.wave;
        if (event.phase === "warning") {
          this.lastHorn = now;
          this.push("wave.horn");
        }
        return;
      case "wave-start":
        this.wave = event.wave;
        this.waves = event.waves;
        this.phase = "wave";
        if (now - this.lastHorn > HORN_DEDUP_S) {
          this.lastHorn = now;
          this.push("wave.horn");
        }
        return;
      case "wave-end":
        this.push("wave.clear");
        return;
      case "victory":
        this.phase = "victory";
        this.push("stinger.victory");
        return;
      case "defeat":
        this.phase = "defeat";
        this.push("dragon.down");
        this.push("stinger.defeat", { delayS: 0.5 });
        return;
      case "spawn": {
        this.foes.set(event.enemy.serial, event.foe);
        const voice = foeVoice(event.foe);
        if (!voice) return;
        if (voice.general) {
          this.generals.add(event.enemy.serial);
          const set = GENERAL_SETS[event.foe];
          if (set) this.at(set.horn, event.x, event.z, listener);
          return;
        }
        this.at(CLASS_SETS[voice.cls].spawn, event.x, event.z, listener, { rate: voice.rate });
        return;
      }
      case "attack": {
        if (event.source.kind !== "enemy") return;
        const voice = this.voiceOf(event.source);
        if (!voice) return;
        const onDragon = event.target.kind === "hero" || event.target.kind === "guide";
        if (event.stage === "windup") {
          if (onDragon) this.push("warn.strike", { pan: panFor(event.x, event.z, listener) });
          this.at(CLASS_SETS[voice.cls].windup, event.x, event.z, listener, { rate: voice.rate });
          return;
        }
        const general = voice.general ? GENERAL_SETS[this.foes.get(event.source.serial) ?? ""] : undefined;
        const set = CLASS_SETS[voice.cls];
        const id = general ? general.attack : voice.attack === "ranged" ? set.shoot : voice.attack === "charge" ? set.charge : set.attack;
        this.at(id, event.x, event.z, listener, { rate: voice.rate });
        return;
      }
      case "telegraph": {
        if (event.owner !== "enemy" || event.source.kind !== "enemy") return;
        const foe = this.foes.get(event.source.serial);
        const set = foe ? GENERAL_SETS[foe] : undefined;
        if (!set) return;
        this.warningUntil = Math.max(this.warningUntil, now + event.durationMs / 1000);
        this.push("warn.telegraph", { pan: panFor(event.x, event.z, listener) });
        this.at(set.skill, event.x, event.z, listener, { delayS: Math.min(2, event.durationMs / 1000) });
        return;
      }
      case "hit":
        this.hit(event, now, listener);
        return;
      case "death":
        this.death(event, now, listener);
        return;
      case "trap-trigger": {
        const sounds = TRAP_SOUNDS[event.trap];
        if (sounds) this.at(sounds.trigger, event.x, event.z, listener, { count: event.count, gain: Math.min(1, 0.7 + Math.log2(1 + event.count) * 0.12) });
        return;
      }
      case "word-assigned":
        this.wordGroups.set(event.word, event.group);
        return;
      case "word-released":
        this.wordGroups.delete(event.word);
        return;
      case "word-progress":
        this.key(event.key, event.typed);
        return;
      case "word-complete": {
        this.push("type.word", { variant: GRADE_VARIANT[event.grade] });
        if (event.target !== null && event.target.kind === "enemy") this.push("fire.cast", { pan: 0 });
        if (event.scored && this.wordGroups.get(event.word) === "new") this.push("learn.new");
        return;
      }
      case "gold":
        if (event.delta > 0 && (event.reason === "review-card" || event.reason === "learn-ahead")) this.push("learn.right");
        else if (event.reason === "wave-end" && event.delta > 0) this.push("ui.gold");
        return;
      case "rage":
        if (event.full && !this.rageFull) this.push("dragon.rage");
        this.rageFull = event.full;
        return;
      case "skill":
        this.skill(event, listener);
        return;
      case "hero-level":
        this.push("dragon.level");
        return;
      case "built":
        this.push(placeSound(event.item));
        return;
      case "upgraded":
      case "bought":
        this.push("ui.confirm");
        return;
      case "sold":
        this.push("ui.gold");
        return;
      case "consumable":
        this.push("dragon.potion");
        return;
      case "rejected":
        this.push("ui.deny");
        return;
      case "unit-down":
        this.at("unit.warden.down", event.x, event.z, listener);
        return;
      case "unit-up":
        this.at("unit.warden.place", event.x, event.z, listener, { gain: 0.6 });
        return;
      case "house-pulse": {
        const sounds = HOUSE_SOUNDS[event.house];
        if (sounds) this.at(sounds.pulse, event.x, event.z, listener);
        return;
      }
      case "heal":
        // A heal beat: the herb pulse, quiet (its 300 ms gap keeps several allies to one sound).
        if (event.source.kind === "house") this.at("house.herb.pulse", event.x, event.z, listener, { gain: 0.35 });
        return;
      case "aura": {
        const foe = this.foes.get(event.enemy.serial);
        const set = foe ? GENERAL_SETS[foe] : undefined;
        if (!set) return;
        this.push(event.on ? set.aura : "general.aura.break");
        return;
      }
      case "move":
      case "status":
      case "grade":
        return;
    }
  }

  private key(result: string, typed: number): void {
    switch (result) {
      case "lock":
      case "advance":
      case "pair":
      case "done":
        this.push("type.key", { step: Math.max(0, typed - 1) });
        return;
      case "switch":
        this.push("type.switch");
        return;
      case "back":
        this.push("type.back");
        return;
      case "wrong":
      case "stray":
        this.push("type.miss");
        return;
      default:
        // "asleep": the router is asleep (phase, hidden words); stay quiet.
        return;
    }
  }

  private hit(event: Extract<SimEvent, { type: "hit" }>, now: number, listener: Listener): void {
    const target = event.target;
    if (target.kind === "hero") {
      // Héo lan (source "hero", every 2 s while foes stand near) is quieter than a blow but grows with the beat:
      // in the last waves it takes 60–110 HP a beat and was nearly silent at 0.25 (test pass 27/10).
      const seep = event.source.kind === "hero";
      this.push("dragon.hurt", { gain: seep ? Math.min(0.85, 0.4 + event.amount / 150) : Math.min(1, 0.55 + event.amount / 120) });
      return;
    }
    if (target.kind === "unit" || target.kind === "trap" || target.kind === "house") {
      this.at("unit.hit", event.x, event.z, listener, { rate: target.kind === "unit" ? 1 : 0.8 });
      return;
    }
    if (target.kind !== "enemy") return;
    if (event.source.kind === "hero" && event.damageType === "word") {
      const w = this.window;
      if (now - w.start < GATHER_S) {
        w.count += 1;
        return;
      }
      this.window = { start: now, count: 1, multi: false };
      const big = event.tier >= 3 || event.grade === "flash" || event.grade === "perfect";
      const variant = big ? 2 : this.impactTurn++ % 2;
      const id: SoundId = variant === 2 ? "fire.impact.c" : variant === 1 ? "fire.impact.b" : "fire.impact.a";
      this.at(id, event.x, event.z, listener, { variant, gain: big ? 1 : 0.85 });
      return;
    }
    if (event.source.kind === "unit") {
      const voice = this.voiceOf(target);
      if (voice) this.at(CLASS_SETS[voice.cls].hit, event.x, event.z, listener, { rate: voice.rate, material: voice.material, gain: 0.6 });
    }
  }

  private death(event: Extract<SimEvent, { type: "death" }>, now: number, listener: Listener): void {
    // Generals sound at once; others fold per class at the end of the frame (foldDeaths).
    this.foes.delete(event.enemy.serial);
    const voice = foeVoice(event.foe);
    if (this.generals.delete(event.enemy.serial) || voice?.general) {
      const set = GENERAL_SETS[event.foe];
      if (set) this.at(set.death, event.x, event.z, listener);
      this.chime(now);
      return;
    }
    if (!voice) return;
    const fold = this.deaths.get(voice.cls);
    if (fold) fold.count += 1;
    else this.deaths.set(voice.cls, { count: 1, x: event.x, z: event.z, rate: voice.rate, material: event.material });
  }

  /** One death sound per class per frame, louder as √N (05 §5 "một vụ nổ cỡ √N"), and one chime. */
  private foldDeaths(now: number, listener: Listener): void {
    if (this.deaths.size === 0) return;
    for (const [cls, fold] of this.deaths) {
      this.at(CLASS_SETS[cls].death, fold.x, fold.z, listener, {
        rate: fold.rate,
        material: fold.material,
        count: fold.count,
        gain: Math.min(1, 0.75 + Math.sqrt(fold.count - 1) * 0.1),
      });
    }
    this.chime(now);
  }

  private chime(now: number): void {
    const c = this.chain;
    c.step = now - c.last < CHAIN_S ? Math.min(CHAIN_TOP, c.step + 1) : 0;
    c.last = now;
    this.push("kill.chime", { step: c.step });
  }

  private skill(event: Extract<SimEvent, { type: "skill" }>, listener: Listener): void {
    if (event.stage === "ready") {
      this.push("dragon.skill-ready");
      return;
    }
    if (event.stage === "cast") {
      const id: SoundId | null =
        event.skill === "breath" ? "dragon.breath" : event.skill === "skyfire" ? "dragon.skyfire.cast" : event.skill === "roar" ? "dragon.roar" : event.skill === "inferno" ? "dragon.inferno" : null;
      if (id) this.push(id);
      return;
    }
    if (event.stage === "impact" && (event.skill === "skyfire" || event.skill === "inferno")) {
      this.at("dragon.skyfire.impact", event.x, event.z, listener, { gain: event.skill === "inferno" ? 1 : 0.9 });
    }
  }

  private voiceOf(ref: EntityRef) {
    if (ref.kind !== "enemy") return null;
    const foe = this.foes.get(ref.serial);
    return foe ? foeVoice(foe) : null;
  }

  private at(id: SoundId, x: number, z: number, listener: Listener, opts: Partial<Omit<Cue, "id">> = {}): void {
    this.push(id, { pan: panFor(x, z, listener), ...opts, gain: (opts.gain ?? 1) * distanceGain(x, z, listener) });
  }

  private push(id: SoundId, opts: Partial<Omit<Cue, "id">> = {}): void {
    const index = this.out.length;
    let cue = this.pool[index];
    if (!cue) {
      cue = { id, gain: 1, rate: 1, pan: 0, step: 0, count: 1, variant: 0, material: null, delayS: 0 };
      this.pool.push(cue);
    }
    cue.id = id;
    cue.gain = opts.gain ?? 1;
    cue.rate = opts.rate ?? 1;
    cue.pan = opts.pan ?? 0;
    cue.step = opts.step ?? 0;
    cue.count = opts.count ?? 1;
    cue.variant = opts.variant ?? 0;
    cue.material = opts.material ?? null;
    cue.delayS = opts.delayS ?? 0;
    this.out.push(cue);
  }
}
