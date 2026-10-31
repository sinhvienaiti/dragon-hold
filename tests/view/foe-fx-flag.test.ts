// The foes' blows (VFX step 3, fd08e01) were paused unjudged: off in play unless asked for.
import { describe, expect, it } from "vitest";
import { FOE_BLOWS_DEFAULT, FoeFx, type FoeFxHost } from "../../src/view/foe-fx";

const host = { heightAt: () => 0 } as unknown as FoeFxHost;

describe("foe blows flag (paused step 3)", () => {
  it("is off by default, so a wind-up or a spawn in play draws nothing", () => {
    expect(FOE_BLOWS_DEFAULT).toBe(false);
    const fx = new FoeFx(host);
    expect(fx.enabled).toBe(false);
    fx.windup(0, 1, "moss-grunt", 10, 0, 0, 0, 600);
    fx.spawn("moss-grunt", 10, 0, 0);
    expect(fx.windupCount).toBe(0);
    expect(fx.spawns).toBe(0);
  });

  it("turned on (the ?bench=foes showcase, dev ?foeblows=1), a wind-up is live", () => {
    const fx = new FoeFx(host, true);
    fx.windup(0, 1, "moss-grunt", 10, 0, 0, 0, 600);
    expect(fx.windupCount).toBe(1);
  });
});
