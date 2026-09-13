import { describe, expect, it } from "vitest";
import { battleCuesFromFx, playerBoardDestroyCue } from "../src/audio/events";
import { comboBurstClass, rewardScoreFloat, rewardTier } from "../src/ui/feel";
import { hapticCuesFromFx, hapticPattern } from "../src/ui/haptics";
import { gemMatchImpactStretch, gemSelectPop, SWAP_TOTAL_MS } from "../src/ui/gemMotion";

describe("reward feel ladder", () => {
  it("ranks match, large match, cascade, and jackpot without new systems", () => {
    expect(rewardTier(1, 3)).toBe("match");
    expect(rewardTier(1, 5)).toBe("largeMatch");
    expect(rewardTier(2, 3)).toBe("cascade");
    expect(rewardTier(3, 3)).toBe("jackpot");
    expect(rewardTier(5, 8)).toBe("jackpot");
    expect(comboBurstClass(1)).toBe("mid");
    expect(comboBurstClass(2)).toBe("big");
    expect(comboBurstClass(3)).toBe("epic");
    expect(comboBurstClass(5)).toBe("mega");
  });

  it("keeps swap duration and makes the press pop readable", () => {
    expect(SWAP_TOTAL_MS).toBe(120);
    expect(gemSelectPop()).toBeGreaterThan(1.06);
    expect(gemSelectPop()).toBeLessThan(1.1);
    const first = gemMatchImpactStretch(1, 1);
    const jackpot = gemMatchImpactStretch(1, 3);
    expect(jackpot.sy).toBeLessThan(first.sy);
    expect(first.sx).toBeGreaterThan(1);
  });

  it("escalates existing board-destroy cues: shatter → cascade → jackpot", () => {
    expect(playerBoardDestroyCue({ kind: "clear", text: "+80", combo: 1, side: "player" })).toBe("matchWave");
    expect(playerBoardDestroyCue({ kind: "clear", text: "+160", combo: 2, side: "player" })).toBe("cascade");
    expect(playerBoardDestroyCue({ kind: "clear", text: "+240", combo: 3, side: "player" })).toBe("bigCombo");
    expect(battleCuesFromFx({ kind: "combo", text: "NICE!", combo: 3, side: "player" })).toEqual([]);
  });

  it("keeps haptics short and ranked", () => {
    expect(hapticPattern("match")).toBeLessThan(hapticPattern("match", 3));
    expect(hapticPattern("match", 3)).toBeLessThan(hapticPattern("combo", 2));
    expect(hapticPattern("combo", 2)).toBeLessThan(hapticPattern("combo", 5));
    expect(hapticPattern("power")).toBeGreaterThan(hapticPattern("match"));
    expect(hapticPattern("power")).toBeLessThan(80);
    expect(hapticCuesFromFx({ kind: "clear", text: "+40", combo: 1, side: "player" })).toEqual([{ kind: "match" }]);
    expect(
      hapticCuesFromFx({
        kind: "clear",
        text: "+200",
        combo: 1,
        side: "player",
        cells: [{}, {}, {}, {}, {}],
      }),
    ).toEqual([{ kind: "match", combo: 3 }]);
  });

  it("makes later cascade score pops bigger than the first wave", () => {
    const first = rewardScoreFloat(1, 80, true);
    const cascade = rewardScoreFloat(2, 160, true);
    const jackpot = rewardScoreFloat(3, 240, true);
    expect(cascade.size).toBeGreaterThan(first.size);
    expect(jackpot.size).toBeGreaterThan(cascade.size);
    expect(jackpot.rise).toBeGreaterThan(cascade.rise);
  });
});
