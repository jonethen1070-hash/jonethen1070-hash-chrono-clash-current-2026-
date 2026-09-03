import { describe, expect, it } from "vitest";
import { ACHIEVEMENTS, applyXp, grantMatchRewards } from "../src/engine/progress";
import { EMPTY_PROGRESS } from "../src/engine/types";
import { neighborFromSwipe } from "../src/engine/input";

describe("progression", () => {
  it("records wins and grants first victory", () => {
    const rewarded = grantMatchRewards(
      { ...EMPTY_PROGRESS, unlocked: [...EMPTY_PROGRESS.unlocked], powersUsed: { freeze: 0, timeshift: 0, rewind: 0 } },
      {
        outcome: "win",
        score: 1200,
        bestCombo: 4,
        mode: "time",
        rivalScore: 100,
        powersThisMatch: ["freeze"],
      },
    );
    expect(rewarded.progress.plays).toBe(1);
    expect(rewarded.progress.wins).toBe(1);
    expect(rewarded.progress.bestScore).toBe(1200);
    expect(rewarded.progress.unlocked).toContain("first_victory");
    expect(rewarded.grant.xp).toBeGreaterThan(0);
    expect(ACHIEVEMENTS.length).toBe(9);
  });

  it("levels up from XP", () => {
    const leveled = applyXp({ ...EMPTY_PROGRESS }, 200);
    expect(leveled.level).toBeGreaterThan(1);
  });
});

describe("swipe follow", () => {
  it("accepts a modest cardinal drag", () => {
    expect(neighborFromSwipe({ r: 4, c: 4 }, 14, 1, 10)).toEqual({ r: 4, c: 5 });
  });
});
