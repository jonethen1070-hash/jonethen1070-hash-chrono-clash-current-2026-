import { describe, expect, it } from "vitest";
import { comboBurstText, comboFlavor } from "../src/engine/combat";
import { grantMatchRewards } from "../src/engine/progress";
import { GameSession } from "../src/engine/session";
import { EMPTY_PROGRESS } from "../src/engine/types";
import { chatHtml, leaderboardHtml, missionsHtml } from "../src/ui/metaViews";

describe("phase 4 cinematic battle wiring", () => {
  it("escalates combo copy without changing scoring rules", () => {
    expect(comboFlavor(2)).toBe("COMBO x2");
    expect(comboBurstText(2)).toBe("COMBO x2");
    expect(comboBurstText(3)).toBe("COMBO x3\nNICE!");
    expect(comboBurstText(5)).toBe("COMBO x5\nAMAZING!");
    expect(comboBurstText(6)).toBe("COMBO x6\nPERFECT!");
    expect(comboBurstText(7)).toBe("COMBO x7\nUNSTOPPABLE!");
  });

  it("pauses a live match when opening settings and resumes only if it paused for settings", () => {
    const game = new GameSession();
    game.progress = { ...game.progress, tutorialDone: true, matchesSeen: 3 };
    game.startMatch(1000);
    game.tick(4200);
    expect(game.phase).toBe("playing");
    game.openSettings();
    expect(game.screen).toBe("settings");
    expect(game.phase).toBe("paused");
    game.closeSettings(4500);
    expect(game.screen).toBe("match");
    expect(game.phase).toBe("playing");

    game.pause(4600);
    game.openSettings();
    game.closeSettings(4700);
    expect(game.screen).toBe("match");
    expect(game.phase).toBe("paused");
  });

  it("records recent matches for the local leaderboard and updates profile stats", () => {
    const rewarded = grantMatchRewards(
      { ...EMPTY_PROGRESS, unlocked: [...EMPTY_PROGRESS.unlocked], powersUsed: { freeze: 0, timeshift: 0, rewind: 0 } },
      {
        outcome: "win",
        score: 2400,
        bestCombo: 5,
        mode: "score",
        rivalScore: 900,
        powersThisMatch: ["freeze"],
      },
    );
    expect(rewarded.progress.plays).toBe(1);
    expect(rewarded.progress.wins).toBe(1);
    expect(rewarded.progress.bestScore).toBe(2400);
    expect(rewarded.progress.bestCombo).toBe(5);
    expect(rewarded.progress.recentMatches[0]).toEqual({
      score: 2400,
      rivalScore: 900,
      outcome: "win",
      mode: "score",
      combo: 5,
    });
    const board = leaderboardHtml(rewarded.progress);
    expect(board).toContain("BEST SCORE");
    expect(board).toContain("2,400");
    expect(board).toContain("WIN · SCORE");
    expect(missionsHtml(rewarded.progress)).toContain("COMPLETE");
    expect(chatHtml(["FREEZE", "COMBO x3"])).toContain("FREEZE");
    expect(chatHtml([])).toContain("BATTLE EVENTS WILL APPEAR HERE");
  });
});
