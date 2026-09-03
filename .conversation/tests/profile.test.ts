import { describe, expect, it } from "vitest";
import { cosmeticsOf, GAME_MODES, isOwned } from "../src/engine/catalog";
import { applyXp, grantMatchRewards } from "../src/engine/progress";
import { GameSession } from "../src/engine/session";
import { EMPTY_PROGRESS, SCORE_TARGET } from "../src/engine/types";

const fresh = () => ({
  ...EMPTY_PROGRESS,
  unlocked: [...EMPTY_PROGRESS.unlocked],
  powersUsed: { freeze: 0, timeshift: 0, rewind: 0 },
});

describe("player profile", () => {
  it("stores name, avatar, and identity fields", () => {
    const game = new GameSession();
    game.toMenu();
    game.setName("LUNA");
    game.setAvatar(1);
    expect(game.progress.name).toBe("LUNA");
    expect(game.progress.avatar).toBe(1);
    expect(game.progress.level).toBe(1);
    expect(game.progress.xp).toBe(0);
    expect(game.progress.wins).toBe(0);
    expect(game.progress.losses).toBe(0);
    expect(game.progress.plays).toBe(0);
    expect(game.progress.bestScore).toBe(0);
    expect(game.progress.bestCombo).toBe(0);
    expect(game.progress.winStreak).toBe(0);
  });

  it("blocks locked avatars until they are earned", () => {
    const game = new GameSession();
    game.setAvatar(5);
    expect(game.progress.avatar).toBe(0);
    expect(isOwned(game.progress, "avatar-5")).toBe(false);
  });
});

describe("XP and progression", () => {
  it("levels up from XP and records match identity stats", () => {
    const leveled = applyXp(fresh(), 200);
    expect(leveled.level).toBeGreaterThan(1);
    const rewarded = grantMatchRewards(fresh(), {
      outcome: "win",
      score: 1200,
      bestCombo: 4,
      mode: "time",
      rivalScore: 100,
      powersThisMatch: ["freeze"],
    });
    expect(rewarded.progress.plays).toBe(1);
    expect(rewarded.progress.wins).toBe(1);
    expect(rewarded.progress.winStreak).toBe(1);
    expect(rewarded.progress.bestScore).toBe(1200);
    expect(rewarded.progress.unlocked).toContain("first_victory");
    expect(rewarded.progress.unlocked).toContain("badge-first_victory");
    expect(isOwned(rewarded.progress, "avatar-4")).toBe(true);
    expect(rewarded.grant.xp).toBeGreaterThan(0);
  });
});

describe("game mode selection", () => {
  it("PLAY uses the last selected mode", () => {
    const game = new GameSession();
    game.progress = { ...game.progress, tutorialDone: true };
    game.toMenu();
    game.chooseMode("score", 10);
    expect(game.progress.lastMode).toBe("score");
    expect(game.screen).toBe("ready");
    game.toMenu();
    game.playNow(20);
    expect(game.mode).toBe("score");
    expect(game.screen).toBe("ready");
  });

  it("TIME BATTLE is the 60-second mode and SCORE BATTLE uses the target", () => {
    expect(GAME_MODES.time.name).toBe("TIME BATTLE");
    expect(GAME_MODES.score.name).toBe("SCORE BATTLE");
    expect(GAME_MODES.score.target).toBe(SCORE_TARGET);
  });
});

describe("collection architecture", () => {
  it("starts with starter cosmetics owned and later rewards locked", () => {
    const p = fresh();
    expect(isOwned(p, "void")).toBe(true);
    expect(isOwned(p, "core")).toBe(true);
    expect(isOwned(p, "ember")).toBe(false);
    expect(isOwned(p, "nova-fx")).toBe(false);
    expect(cosmeticsOf("badge").length).toBe(9);
    expect(cosmeticsOf("avatar").length).toBe(6);
  });

  it("unlocks Score Clash cosmetics after a score-mode win", () => {
    const rewarded = grantMatchRewards(fresh(), {
      outcome: "win",
      score: SCORE_TARGET,
      bestCombo: 2,
      mode: "score",
      rivalScore: 100,
      powersThisMatch: [],
    });
    expect(isOwned(rewarded.progress, "ember")).toBe(true);
    expect(isOwned(rewarded.progress, "ember-fx")).toBe(true);
  });
});
