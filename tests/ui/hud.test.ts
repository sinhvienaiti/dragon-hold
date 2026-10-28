import { describe, expect, it } from "vitest";
import {
  callEarlyBonus,
  chainMultiplier,
  clockSeconds,
  consumableSlots,
  levelProgress,
  phaseTicksLeft,
  rejectText,
  skillCooldown,
  ultView,
  upcomingWave,
} from "../../src/ui/hud";
import { keyLabel, viNumber } from "../../src/ui/skin";
import { fakeWorld } from "./fake-world";

describe("ui hud read-outs", () => {
  it("pays 2 gold per whole second left on call-early, at most 40 (00 §4.5)", () => {
    expect(callEarlyBonus(20 * 60)).toBe(40);
    expect(callEarlyBonus(852)).toBe(28);
    expect(callEarlyBonus(59)).toBe(0);
    expect(callEarlyBonus(0)).toBe(0);
  });

  it("counts the phase clock down in whole seconds and waits without an end tick", () => {
    expect(phaseTicksLeft(fakeWorld({ tick: 100, phaseEndsAt: -1 }))).toBeNull();
    expect(phaseTicksLeft(fakeWorld({ tick: 100, phaseEndsAt: 952 }))).toBe(852);
    expect(phaseTicksLeft(fakeWorld({ tick: 1000, phaseEndsAt: 952 }))).toBe(0);
    expect(clockSeconds(852)).toBe(15);
    expect(clockSeconds(60)).toBe(1);
    expect(clockSeconds(0)).toBe(0);
  });

  it("previews the wave after the current or last one, never past the stage", () => {
    expect(upcomingWave(fakeWorld({ wave: 0 }))).toBe(1);
    expect(upcomingWave(fakeWorld({ wave: 4 }))).toBe(5);
    expect(upcomingWave(fakeWorld({ wave: 10 }))).toBe(10);
  });

  it("reads skill cooldowns, rage and Viêm Đế from the combat state", () => {
    const world = fakeWorld({ tick: 1000 });
    world.combat.readyAt.breath = 1000 + 7 * 60;
    expect(skillCooldown(world, "breath")).toEqual({ leftS: 7, frac: 0.5 });
    expect(skillCooldown(world, "skyfire")).toEqual({ leftS: 0, frac: 0 });
    world.combat.rage = 640;
    expect(ultView(world)).toMatchObject({ rage: 64, full: false, active: false });
    world.combat.rage = 1000;
    world.combat.infernoUntil = 1300;
    world.combat.lastUltAt = 1000;
    expect(ultView(world)).toMatchObject({ rage: 100, full: true, active: true, activeS: 5, gapS: 45 });
  });

  it("fills two consumable slots of three each in carry order, with one shared cooldown (03 §6.3)", () => {
    const world = fakeWorld({ tick: 500 });
    expect(consumableSlots(world).map((slot) => slot.item)).toEqual([null, null]);
    world.shop.held["small-potion"] = 4;
    world.shop.consumableReadyAt = 500 + 4 * 60;
    const slots = consumableSlots(world);
    expect(slots.map((slot) => [slot.action, slot.item, slot.count])).toEqual([
      ["consumable-1", "small-potion", 3],
      ["consumable-2", "small-potion", 1],
    ]);
    expect(slots[0]!.cool).toEqual({ leftS: 4, frac: 0.5 });
  });

  it("shows level progress, the chain multiplier and gentle reject texts", () => {
    expect(levelProgress(1, 10)).toBe(0.5);
    expect(levelProgress(2, 35)).toBe(0.5);
    expect(levelProgress(10, 999)).toBe(1);
    expect(chainMultiplier(0)).toBe("");
    expect(chainMultiplier(5)).toBe("×1,04");
    expect(chainMultiplier(40)).toBe("×1,16");
    expect(rejectText("buy", "gold")).toBe("Chưa đủ Gold");
    expect(rejectText("skill", "something-new")).toBe("Chưa dùng được kỹ năng");
    expect(rejectText("consumable", "cooldown")).toBe("Đồ tiêu hao đang hồi");
    expect(rejectText("skill", "cooldown")).toBe("Kỹ năng đang hồi");
    expect(rejectText("start", "phase")).toBe("Ải đã bắt đầu");
    // Never "cần nghỉ": "Nghỉ" is the break between waves.
    expect(rejectText("skill", "ult-gap")).toBe("Tối Thượng: cách lần trước ít nhất 45 s");
    expect(viNumber(1.5)).toBe("1,5");
  });

  it("labels keys from the 00 §6 table per platform (Option on Mac, Shift for digits on Linux)", () => {
    expect(keyLabel("skill-1", "mac")).toBe("⌥1");
    expect(keyLabel("skill-1", "other")).toBe("Alt+1");
    expect(keyLabel("skill-1", "linux")).toBe("Shift+1");
    expect(keyLabel("call-early", "mac")).toBe("⇧↵");
    expect(keyLabel("call-early", "other")).toBe("Shift+Enter");
    expect(keyLabel("enter", "other")).toBe("Enter");
    expect(keyLabel("carry-3", "mac")).toBe("3");
    expect(keyLabel("edit-mode", "mac")).toBe("`");
    expect(keyLabel("no-such-action", "mac")).toBe("");
  });
});
