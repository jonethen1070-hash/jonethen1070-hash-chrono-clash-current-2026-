import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { findAnyValidSwap } from "../src/engine/board";
import { FINALE_MS, READY_MS } from "../src/engine/types";
import { GameSession } from "../src/engine/session";

describe("post-match rewards navigation", () => {
  it("keeps grant data and returns to the main menu from rewards", () => {
    const game = new GameSession();
    game.progress = { ...game.progress, tutorialDone: true, matchesSeen: 4 };
    game.chooseMode("score", 1_000);
    expect(game.screen).toBe("ready");
    game.tick(1_000 + READY_MS);
    expect(game.screen).toBe("match");

    let now = 1_000 + READY_MS + 3_000;
    game.tick(now);
    expect(game.phase).toBe("playing");

    let swaps = 0;
    while (game.phase === "playing" && swaps < 80) {
      now += 350;
      game.tick(now);
      const move = findAnyValidSwap(game.player.board);
      if (move) {
        game.tryPlayerSwap(move.a, move.b, now);
        swaps += 1;
      }
      if (game.player.score < game.scoreTarget) game.player.score = game.scoreTarget;
    }
    game.tick(now + 20);
    expect(game.phase).toBe("ended");
    expect(game.result).not.toBeNull();
    const grant = game.result!.grant;
    expect(grant).not.toBeNull();
    expect(grant!.xp).toBeGreaterThan(0);

    game.tick(now + FINALE_MS + 20);
    expect(game.screen).toBe("results");
    game.goRewards();
    expect(game.screen).toBe("rewards");
    expect(game.result?.grant).toEqual(grant);

    game.toMenu();
    expect(game.screen).toBe("menu");
  });

  it("renders a scrollable rewards body with a CONTINUE home action", () => {
    const src = readFileSync("src/main.ts", "utf8");
    expect(src).toContain('id="rewardsContinue">CONTINUE');
    expect(src).toContain('class="rewards-scroll"');
    expect(src).toContain('class="rewards-footer"');
    expect(src).toContain('id="rewardList"');
    expect(src).toContain('$("#rewardsContinue").addEventListener("click", leaveRewardsToMenu)');

    const css = readFileSync("src/styles/studio.css", "utf8");
    expect(css).toContain("#rewards .rewards-scroll");
    expect(css).toMatch(/#rewards \.rewards-scroll[\s\S]*overflow-y:\s*auto/);
    expect(css).toContain("#rewardsContinue");
  });
});
