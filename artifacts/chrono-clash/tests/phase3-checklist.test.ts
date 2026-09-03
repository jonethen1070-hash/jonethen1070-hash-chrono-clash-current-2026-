import { mkdirSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { findAnyValidSwap } from "../src/engine/board";
import { GameSession } from "../src/engine/session";
import { withPowerStock } from "../src/engine/economy";
import {
  ENERGY_FREEZE,
  ENERGY_REWIND,
  ENERGY_TIMESHIFT,
  FREEZE_MS,
  MATCH_SECONDS,
} from "../src/engine/types";

describe("phase 3 verification checklist", () => {
  it("walks the required TIME and SCORE battle behaviors", () => {
    const lines: string[] = [];
    const log = (msg: string) => lines.push(msg);

    function play(game: GameSession, now = 1000, mode: "time" | "score" = "time"): number {
      game.progress = withPowerStock({ ...game.progress, tutorialDone: true, matchesSeen: 4 }, { freeze: 5, timeshift: 5 });
      game.mode = mode;
      game.startMatch(now);
      now += 3000;
      game.tick(now);
      expect(game.phase).toBe("playing");
      return now;
    }

    function swapOnce(game: GameSession, now: number): boolean {
      const move = findAnyValidSwap(game.player.board);
      if (!move) return false;
      return game.tryPlayerSwap(move.a, move.b, now);
    }

    const game = new GameSession();
    let now = play(game, 2000, "time");
    log("1. TIME BATTLE started: " + game.matchState(now));
    const swiped = swapOnce(game, now + 20);
    log("2-3. swipe/match: " + swiped + " score=" + game.player.score + " combo=" + game.player.combo);
    expect(swiped).toBe(true);
    log("4. board refilled: " + game.player.board.every((row) => row.every((c) => c)));
    now += 200;
    game.tick(now);
    log("5-6. combo after move: x" + game.player.combo + " score=" + game.player.score);
    expect(game.player.score).toBeGreaterThan(0);

    const rivalStart = game.opponent.score;
    const until = now + 10000;
    while (now < until && game.opponent.score === rivalStart) {
      now += 100;
      game.tick(now);
    }
    log("8. rival scored via simulated moves: " + rivalStart + " -> " + game.opponent.score);
    expect(game.opponent.score).toBeGreaterThan(rivalStart);

    game.player.energy = ENERGY_FREEZE;
    const frozenScore = game.opponent.score;
    expect(game.usePower("freeze", now)).toBe(true);
    log("9. FREEZE activated, energy=" + game.player.energy);
    now += FREEZE_MS - 80;
    game.tick(now);
    expect(game.opponent.score).toBe(frozenScore);
    log("10. rival halted for 5s: score stayed " + frozenScore);

    now += 200;
    game.tick(now);
    game.player.energy = ENERGY_TIMESHIFT;
    const left = game.remainingMs(now);
    expect(game.usePower("timeshift", now)).toBe(true);
    game.tick(now + 1200);
    expect(game.remainingMs(now + 1200)).toBe(left);
    log("11-12. TIME SHIFT held clock at " + left + "ms while rival halted");

    now += 1300;
    const before = JSON.stringify(game.player.board.map((r) => r.map((c) => c?.id)));
    const scoreBefore = game.player.score;
    const comboBefore = game.player.combo;
    expect(swapOnce(game, now)).toBe(true);
    log("13. another move scored " + scoreBefore + " -> " + game.player.score);
    game.player.energy = ENERGY_REWIND;
    expect(game.usePower("rewind", now + 40)).toBe(true);
    const after = JSON.stringify(game.player.board.map((r) => r.map((c) => c?.id)));
    expect(after).toBe(before);
    expect(game.player.score).toBe(scoreBefore);
    expect(game.player.combo).toBe(comboBefore);
    log("14-15. REWIND restored board, score, and combo");

    now = MATCH_SECONDS * 1000 + 5000;
    game.tick(now);
    expect(game.result).not.toBeNull();
    log("16-17. TIME BATTLE ended: " + game.result!.outcome + " you=" + game.result!.playerScore + " rival=" + game.result!.opponentScore);
    expect(game.tryPlayerSwap({ r: 0, c: 0 }, { r: 0, c: 1 }, now + 10)).toBe(false);

    const scoreGame = new GameSession();
    scoreGame.setScoreTarget(5000);
    now = play(scoreGame, 8000, "score");
    log("18-19. SCORE BATTLE target=" + scoreGame.snapshot(now).target);
    expect(scoreGame.snapshot(now).target).toBe(5000);
    scoreGame.player.score = 5000;
    scoreGame.tick(now + 30);
    expect(scoreGame.result).not.toBeNull();
    log("20. reached target, ended immediately: " + scoreGame.result!.outcome);
    log("21. profile plays=" + scoreGame.progress.plays + " wins=" + scoreGame.progress.wins + " best=" + scoreGame.progress.bestScore);
    log("22. settings scoreTarget persisted via setScoreTarget: " + scoreGame.scoreTarget);
    log("23. checklist simulation PASS");

    mkdirSync("/opt/cursor/artifacts", { recursive: true });
    writeFileSync("/opt/cursor/artifacts/phase3_checklist_log.txt", lines.join("\n") + "\n");
  });
});
