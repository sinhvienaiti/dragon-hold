import { describe, expect, it } from "vitest";
import { EventMapper, GATHER_S, LowHpAlarm, panFor, type Cue, type Listener } from "../../src/audio/map-events";
import type { EnemyRef, FoeId, SimEvent } from "../../src/content/types";

const L: Listener = { x: 0, z: 0, yaw: 0 };
// A foe's own sound with no class sound behind it (fileOnly, VFX step 3) is silent until its file exists: left out here.
const ids = (cues: readonly Cue[]) => cues.filter((cue) => !cue.fileOnly).map((cue) => cue.id);
const snapshot = (cues: readonly Cue[]) => cues.filter((cue) => !cue.fileOnly).map((cue) => ({ ...cue }));
let serial = 0;
const ref = (): EnemyRef => ({ slot: serial % 50, serial: ++serial });
const spawn = (foe: FoeId, enemy = ref(), x = 0, z = -20): SimEvent => ({ tick: 0, type: "spawn", enemy, foe, lane: "a", x, z, elite: false, cluster: -1 });
const enemyRef = (enemy: EnemyRef) => ({ kind: "enemy" as const, slot: enemy.slot, serial: enemy.serial });
const wordHit = (enemy: EnemyRef, tier: 0 | 1 | 2 | 3 = 1): SimEvent => ({
  tick: 0,
  type: "hit",
  target: enemyRef(enemy),
  source: { kind: "hero" },
  amount: 40,
  damageType: "word",
  tier,
  grade: "good",
  x: 0,
  z: -10,
  hpLeft: 10,
});
const death = (enemy: EnemyRef, foe: FoeId): SimEvent => ({ tick: 0, type: "death", enemy, foe, by: "word", x: 2, z: -8, material: "leaf", tier: 2 });

describe("audio event mapping", () => {
  it("gives each gait its class set and generals their horn", () => {
    const mapper = new EventMapper();
    const cues = mapper.map([spawn("moss-grunt"), spawn("blight-wolf"), spawn("thorn-wasp"), spawn("thorn-ant"), spawn("moss-banner")], 0, L);
    expect(ids(cues)).toEqual(["enemy.biped.spawn", "enemy.quadruped.spawn", "enemy.flyer.spawn", "enemy.swarm.spawn", "general.g01.horn"]);
    expect(mapper.generalsAlive).toBe(1);
    // Small things sound higher.
    expect(cues[3]!.rate).toBeGreaterThan(cues[0]!.rate);
  });

  it("warns (P1) when a foe winds up on Hỏa Long and picks the blow by attack kind", () => {
    const mapper = new EventMapper();
    const grunt = ref();
    const archer = ref();
    const boar = ref();
    mapper.map([spawn("moss-grunt", grunt), spawn("moss-archer", archer), spawn("tusk-boar", boar)], 0, L);
    const at = (enemy: EnemyRef, stage: "windup" | "strike", target: "hero" | "unit"): SimEvent => ({
      tick: 1,
      type: "attack",
      source: enemyRef(enemy),
      target: target === "hero" ? { kind: "hero" } : { kind: "unit", slot: 0 },
      stage,
      x: 1,
      z: -3,
      tx: 0,
      tz: 0,
    });
    expect(ids(mapper.map([at(grunt, "windup", "hero")], 1, L))).toEqual(["warn.strike", "enemy.biped.windup"]);
    expect(ids(mapper.map([at(grunt, "windup", "unit")], 1, L))).toEqual(["enemy.biped.windup"]);
    expect(ids(mapper.map([at(grunt, "strike", "hero"), at(archer, "strike", "hero"), at(boar, "strike", "unit")], 1, L))).toEqual([
      "enemy.biped.attack",
      "enemy.biped.shoot",
      "enemy.quadruped.charge",
    ]);
  });

  it("turns keys into wood ticks that climb a step a letter, misses into a dull knock", () => {
    const mapper = new EventMapper();
    const progress = (typed: number, key: string): SimEvent => ({ tick: 0, type: "word-progress", word: 1, typed, key: key as never, letter: 0 });
    const cues = snapshot(mapper.map([progress(1, "lock"), progress(2, "advance"), progress(3, "advance"), progress(3, "wrong"), progress(2, "back"), progress(0, "switch"), progress(0, "asleep")], 0, L));
    expect(cues.map((c) => c.id)).toEqual(["type.key", "type.key", "type.key", "type.miss", "type.back", "type.switch"]);
    expect(cues.slice(0, 3).map((c) => c.step)).toEqual([0, 1, 2]);
  });

  it("casts fire on a finished word and rings the learning bell for a scored new word", () => {
    const mapper = new EventMapper();
    const enemy = ref();
    mapper.map([{ tick: 0, type: "word-assigned", word: 4, text: "river", kind: "enemy", group: "new", target: enemyRef(enemy), firstTier: 1 }], 0, L);
    const complete = (grade: "good" | "perfect" | "flash", scored: boolean): SimEvent => ({
      tick: 2,
      type: "word-complete",
      word: 4,
      text: "river",
      kind: "enemy",
      grade,
      errors: 0,
      keyTicks: 40,
      responseMs: 900,
      target: enemyRef(enemy),
      activity: "typing-enemy",
      scored,
      hintUsed: false,
    });
    const first = snapshot(mapper.map([complete("perfect", true)], 1, L));
    expect(first.map((c) => c.id)).toEqual(["type.word", "fire.cast", "learn.new"]);
    expect(first[0]!.variant).toBe(1);
    expect(ids(mapper.map([complete("good", false)], 2, L))).toEqual(["type.word", "fire.cast"]);
    mapper.map([{ tick: 3, type: "word-released", word: 4, reason: "done" }], 3, L);
    expect(ids(mapper.map([complete("flash", true)], 4, L))).toEqual(["type.word", "fire.cast"]);
  });

  it("gathers word hits: one impact at once, a many-targets layer for 3+, nothing new within 45 ms", () => {
    const mapper = new EventMapper();
    const foes = Array.from({ length: 6 }, () => ref());
    mapper.map(foes.map((foe) => spawn("moss-grunt", foe)), 0, L);
    const burst = snapshot(mapper.map(foes.slice(0, 5).map((foe) => wordHit(foe)), 1, L));
    expect(burst.map((c) => c.id)).toEqual(["fire.impact.a", "impact.multi"]);
    expect(burst[1]!.count).toBe(5);
    expect(ids(mapper.map([wordHit(foes[5]!)], 1 + GATHER_S / 2, L))).toEqual([]);
    expect(ids(mapper.map([wordHit(foes[5]!)], 1 + GATHER_S + 0.001, L))).toEqual(["fire.impact.b"]);
    expect(ids(mapper.map([wordHit(foes[5]!, 3)], 2, L))).toEqual(["fire.impact.c"]);
  });

  it("folds a frame's deaths into one sound per class and climbs the kill chime", () => {
    const mapper = new EventMapper();
    const grunts = Array.from({ length: 30 }, () => ref());
    const ants = Array.from({ length: 4 }, () => ref());
    mapper.map([...grunts.map((g) => spawn("moss-grunt", g)), ...ants.map((a) => spawn("thorn-ant", a))], 0, L);
    const cues = snapshot(mapper.map([...grunts.map((g) => death(g, "moss-grunt")), ...ants.map((a) => death(a, "thorn-ant"))], 1, L));
    expect(cues.map((c) => c.id)).toEqual(["enemy.biped.death", "enemy.swarm.death", "kill.chime"]);
    expect(cues[0]!.count).toBe(30);
    expect(cues[0]!.material).toBe("leaf");
    const steps: number[] = [];
    for (const t of [1.5, 2, 2.4, 4]) {
      const foe = ref();
      mapper.map([spawn("moss-grunt", foe)], t, L);
      steps.push(snapshot(mapper.map([death(foe, "moss-grunt")], t, L)).find((c) => c.id === "kill.chime")!.step);
    }
    expect(steps).toEqual([1, 2, 3, 0]);
  });

  it("plays our side: trap triggers with their count, builds, supports, shop and refusals", () => {
    const mapper = new EventMapper();
    const cues = snapshot(
      mapper.map(
        [
          { tick: 0, type: "built", slot: 1, item: "spikes", level: 1 },
          { tick: 0, type: "built", slot: 2, item: "pine-bomb", level: 1 },
          { tick: 0, type: "built", slot: 3, item: "net-launcher", level: 1 },
          { tick: 0, type: "built", slot: 4, item: "herb-hut", level: 1 },
          { tick: 0, type: "built", slot: 5, item: "moss-warden", level: 1 },
          { tick: 0, type: "trap-trigger", slot: 2, trap: "pine-bomb", x: 3, z: -6, count: 7 },
          { tick: 0, type: "trap-trigger", slot: 1, trap: "spikes", x: 3, z: -6, count: 1 },
          { tick: 0, type: "trap-trigger", slot: 3, trap: "net-launcher", x: 3, z: -6, count: 1 },
          { tick: 0, type: "house-pulse", slot: 4, house: "herb-hut", x: 0, z: 2 },
          { tick: 0, type: "unit-down", unit: 0, x: 1, z: -2 },
          { tick: 0, type: "unit-up", unit: 0, x: 1, z: -2 },
          { tick: 0, type: "bought", item: "small-potion", count: 1 },
          { tick: 0, type: "upgraded", slot: 1, item: "spikes", level: 2 },
          { tick: 0, type: "sold", slot: 1, item: "spikes", refund: 20 },
          { tick: 0, type: "consumable", item: "small-potion", x: 0, z: 0 },
          { tick: 0, type: "rejected", command: "buy", reason: "gold" },
        ],
        0,
        L,
      ),
    );
    expect(cues.map((c) => c.id)).toEqual([
      "trap.spikes.arm",
      "trap.pine-bomb.arm",
      "trap.net.arm",
      "house.herb.place",
      "unit.warden.place",
      "trap.pine-bomb.trigger",
      "trap.spikes.trigger",
      "trap.net.trigger",
      "house.herb.pulse",
      "unit.warden.down",
      "unit.warden.place",
      "ui.confirm",
      "ui.confirm",
      "ui.gold",
      "dragon.potion",
      "ui.deny",
    ]);
    expect(cues[5]!.count).toBe(7);
    expect(cues[5]!.gain).toBeGreaterThan(cues[6]!.gain);
  });

  it("blows the wave horn once per warning, then stingers for the end", () => {
    const mapper = new EventMapper();
    expect(ids(mapper.map([{ tick: 0, type: "phase", phase: "warning", wave: 1, endsAtTick: 360 }], 0, L))).toEqual(["wave.horn"]);
    expect(ids(mapper.map([{ tick: 360, type: "wave-start", wave: 1, waves: 10, lanes: ["a"], generals: [] }], 6, L))).toEqual([]);
    expect(ids(mapper.map([{ tick: 900, type: "wave-start", wave: 2, waves: 10, lanes: ["a"], generals: [] }], 20, L))).toEqual(["wave.horn"]);
    expect(mapper.waves).toBe(10);
    expect(ids(mapper.map([{ tick: 999, type: "wave-end", wave: 2, bonusGold: 10 }], 30, L))).toEqual(["wave.clear"]);
    expect(ids(mapper.map([{ tick: 1000, type: "victory", stars: 3 }], 40, L))).toEqual(["stinger.victory"]);
    const defeat = snapshot(new EventMapper().map([{ tick: 5, type: "defeat", wave: 4 }], 0, L));
    expect(defeat.map((c) => c.id)).toEqual(["dragon.down", "stinger.defeat"]);
    expect(defeat[1]!.delayS).toBeGreaterThan(0);
  });

  it("treats a general's telegraph as a warning window and plays its aura drum and break", () => {
    const mapper = new EventMapper();
    const general = ref();
    mapper.map([spawn("moss-banner", general)], 0, L);
    const cues = snapshot(
      mapper.map(
        [
          {
            tick: 1,
            type: "telegraph",
            id: 1,
            owner: "enemy",
            shape: "circle",
            x: 0,
            z: -10,
            toX: 0,
            toZ: -10,
            radiusM: 5,
            widthM: 0,
            durationMs: 1000,
            source: enemyRef(general),
          },
        ],
        10,
        L,
      ),
    );
    expect(cues.map((c) => c.id)).toEqual(["warn.telegraph", "general.g01.skill"]);
    expect(cues[1]!.delayS).toBeCloseTo(1, 5);
    expect(mapper.warningActive(10.5)).toBe(true);
    expect(mapper.warningActive(11.1)).toBe(false);
    expect(ids(mapper.map([{ tick: 2, type: "aura", enemy: general, aura: "speed", on: true, radiusM: 6 }], 12, L))).toEqual(["general.g01.aura"]);
    expect(ids(mapper.map([{ tick: 3, type: "aura", enemy: general, aura: "speed", on: false, radiusM: 6 }], 13, L))).toEqual(["general.aura.break"]);
    expect(ids(mapper.map([death(general, "moss-banner")], 14, L))).toEqual(["general.g01.death", "kill.chime"]);
    expect(mapper.generalsAlive).toBe(0);
  });

  it("maps Hỏa Long's skills, rage, level and hurt", () => {
    const mapper = new EventMapper();
    const skill = (skill: "breath" | "skyfire" | "roar" | "inferno", stage: "ready" | "cast" | "impact" | "end"): SimEvent => ({ tick: 0, type: "skill", skill, stage, x: 4, z: -12 });
    expect(
      ids(
        mapper.map(
          [skill("breath", "ready"), skill("breath", "cast"), skill("skyfire", "cast"), skill("skyfire", "impact"), skill("roar", "cast"), skill("inferno", "cast"), skill("breath", "end")],
          0,
          L,
        ),
      ),
    ).toEqual(["dragon.skill-ready", "dragon.breath", "dragon.skyfire.cast", "dragon.skyfire.impact", "dragon.roar", "dragon.inferno"]);
    expect(ids(mapper.map([{ tick: 0, type: "rage", value: 100, full: true }, { tick: 1, type: "rage", value: 100, full: true }], 1, L))).toEqual(["dragon.rage"]);
    expect(ids(mapper.map([{ tick: 0, type: "hero-level", level: 2 }], 2, L))).toEqual(["dragon.level"]);
    const hurt: SimEvent = { tick: 0, type: "hit", target: { kind: "hero" }, source: { kind: "enemy", slot: 0, serial: 1 }, amount: 30, damageType: "physical", tier: 1, grade: null, x: 0, z: 0, hpLeft: 900 };
    expect(ids(mapper.map([hurt], 3, L))).toEqual(["dragon.hurt"]);
  });

  it("places sounds left and right of the camera", () => {
    expect(panFor(10, 0, L)).toBeGreaterThan(0);
    expect(panFor(-10, 0, L)).toBeLessThan(0);
    expect(panFor(1000, 0, L)).toBe(0.8);
    // Camera turned around (looking south): east is now on the left.
    expect(panFor(10, 0, { x: 0, z: 0, yaw: Math.PI })).toBeLessThan(0);
  });

  it("handles every event type without throwing", () => {
    const mapper = new EventMapper();
    const enemy = ref();
    const all: SimEvent[] = [
      spawn("moss-grunt", enemy),
      { tick: 0, type: "move", enemy, mode: "walk", x: 0, z: 0 },
      { tick: 0, type: "status", target: enemyRef(enemy), status: "slow", on: true, durationMs: 1000, x: 0, z: 0 },
      { tick: 0, type: "grade", word: 1, grade: "good", mqPm: 900, chain: 2, chainTier: 0 },
      { tick: 0, type: "gold", delta: 5, total: 50, reason: "kill" },
      { tick: 0, type: "gold", delta: 5, total: 55, reason: "review-card" },
      { tick: 0, type: "gold", delta: 20, total: 75, reason: "wave-end" },
      { tick: 0, type: "hit", target: { kind: "unit", slot: 0 }, source: enemyRef(enemy), amount: 5, damageType: "physical", tier: 1, grade: null, x: 0, z: 0, hpLeft: 50 },
      { tick: 0, type: "hit", target: enemyRef(enemy), source: { kind: "unit", slot: 0 }, amount: 5, damageType: "physical", tier: 1, grade: null, x: 0, z: 0, hpLeft: 50 },
      { tick: 0, type: "hit", target: enemyRef(enemy), source: { kind: "trap", slot: 0 }, amount: 5, damageType: "physical", tier: 1, grade: null, x: 0, z: 0, hpLeft: 45 },
    ];
    expect(ids(mapper.map(all, 0, L))).toEqual(["enemy.biped.spawn", "learn.right", "ui.gold", "unit.hit", "enemy.biped.hit"]);
  });
});

describe("low-HP alarm", () => {
  it("alarms once on crossing 35 %, beats while low, resets above", () => {
    const alarm = new LowHpAlarm(1.4);
    expect(alarm.update(80, 0)).toBeNull();
    expect(alarm.update(34, 1)).toBe("dragon.low");
    expect(alarm.update(30, 2)).toBeNull();
    expect(alarm.update(30, 2.4)).toBe("dragon.heartbeat");
    expect(alarm.update(30, 3)).toBeNull();
    expect(alarm.update(30, 3.8)).toBe("dragon.heartbeat");
    expect(alarm.update(50, 4)).toBeNull();
    expect(alarm.active).toBe(false);
    expect(alarm.update(20, 5)).toBe("dragon.low");
    expect(alarm.update(0, 6)).toBeNull();
  });
});
