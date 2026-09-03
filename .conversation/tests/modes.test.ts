import { describe, expect, it } from "vitest";
import { findAnyValidSwap } from "../src/engine/board";
import { GameSession } from "../src/engine/session";
import { withPowerStock } from "../src/engine/economy";
import {
  ENERGY_REWIND,
  ENERGY_TIMESHIFT,
  MATCH_SECONDS,
  SCORE_TARGET,
  TIMESHIFT_MS,
} from "../src/engine/types";

function play(game: GameSession, now: number): number {
  if (!game.mode) game.mode = "time";
  game.progress = withPowerStock(game.progress, { freeze: 5, timeshift: 5 });
  game.startMatch(now);
  now += 3_000;
  game.tick(now);
  expect(game.phase).toBe("playing");
  return now;
}

describe("game modes", () => {
  it("TIME BATTLE lasts 60 seconds", () => {
    const game = new GameSession();
    game.mode = "time";
    let now = play(game, 1_000);
    expect(game.remainingMs(now)).toBe(MATCH_SECONDS * 1000);
    now += 60_000;
    game.tick(now);
    expect(game.result).not.toBeNull();
  });

  it("SCORE BATTLE ends when the player hits the target", () => {
    const game = new GameSession();
    game.mode = "score";
    game.setScoreTarget(SCORE_TARGET);
    const now = play(game, 2_000);
    expect(game.remainingMs(now)).toBe(0);
    game.player.score = SCORE_TARGET;
    game.tick(now + 50);
    expect(game.result).not.toBeNull();
    expect(game.result!.outcome).toBe("win");
    expect(game.result!.mode).toBe("score");
  });

  it("TIME SHIFT freezes the match clock while the player can still swap", () => {
    const game = new GameSession();
    const now0 = play(game, 4_000);
    game.player.energy = ENERGY_TIMESHIFT;
    const left = game.remainingMs(now0);
    expect(game.usePower("timeshift", now0)).toBe(true);
    const later = now0 + TIMESHIFT_MS - 200;
    game.tick(later);
    expect(game.snapshot(later).timeshiftRemainingMs).toBeGreaterThan(0);
    expect(game.remainingMs(later)).toBe(left);
    const move = findAnyValidSwap(game.player.board);
    expect(move).not.toBeNull();
    expect(game.tryPlayerSwap(move!.a, move!.b, later)).toBe(true);
  });

  it("REWIND restores the previous board and score", () => {
    const game = new GameSession();
    const now = play(game, 8_000);
    const move = findAnyValidSwap(game.player.board);
    expect(move).not.toBeNull();
    const before = JSON.stringify(game.player.board.map((row) => row.map((c) => c?.id)));
    const scoreBefore = game.player.score;
    expect(game.tryPlayerSwap(move!.a, move!.b, now)).toBe(true);
    expect(game.player.score).toBeGreaterThanOrEqual(scoreBefore);
    game.player.energy = ENERGY_REWIND;
    expect(game.usePower("rewind", now + 20)).toBe(true);
    const after = JSON.stringify(game.player.board.map((row) => row.map((c) => c?.id)));
    expect(after).toBe(before);
    expect(game.player.score).toBe(scoreBefore);
  });
});
