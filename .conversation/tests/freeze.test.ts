import { describe, expect, it } from "vitest";
import { findAnyValidSwap } from "../src/engine/board";
import { GameSession } from "../src/engine/session";
import { COLS, ENERGY_FREEZE, FREEZE_MS, MATCH_SECONDS, ROWS } from "../src/engine/types";
import { withPowerStock } from "../src/engine/economy";

function boardKey(game: GameSession, who: "player" | "opponent"): string {
  return JSON.stringify(
    game[who].board.map((row) => row.map((cell) => (cell ? `${cell.id}:${cell.color}` : "-"))),
  );
}

function filledBoard(game: GameSession, who: "player" | "opponent"): boolean {
  return game[who].board.every(
    (row) => row.length === COLS && row.every((cell) => cell !== null),
  ) && game[who].board.length === ROWS;
}

function playingSession(advanceMs = 4_000): { game: GameSession; now: number } {
  const game = new GameSession();
  game.progress = withPowerStock(game.progress, { freeze: 5, timeshift: 5 });
  game.mode = "time";
  let now = 5_000;
  game.startMatch(now);
  now += 3_000;
  game.tick(now);
  const until = now + advanceMs;
  while (now < until) {
    now += 200;
    game.tick(now);
  }
  expect(game.phase).toBe("playing");
  return { game, now };
}

describe("freeze power", () => {
  it("activates only when the player has enough energy", () => {
    const { game, now } = playingSession();
    expect(game.usePower("freeze", now)).toBe(false);
    game.player.energy = ENERGY_FREEZE - 1;
    expect(game.usePower("freeze", now)).toBe(false);
    game.player.energy = ENERGY_FREEZE;
    expect(game.usePower("freeze", now)).toBe(true);
    expect(game.player.energy).toBe(0);
    expect(game.snapshot(now).freezeRemainingMs).toBe(FREEZE_MS);
    expect(game.usePower("freeze", now)).toBe(false);
  });

  it("lasts exactly 5 seconds", () => {
    const { game, now: start } = playingSession();
    game.player.energy = ENERGY_FREEZE;
    expect(FREEZE_MS).toBe(5_000);
    expect(game.usePower("freeze", start)).toBe(true);

    let now = start;
    expect(game.snapshot(now).freezeRemainingMs).toBe(5_000);
    now = start + 2_499;
    game.tick(now);
    expect(game.snapshot(now).freezeRemainingMs).toBe(2_501);
    now = start + 4_999;
    game.tick(now);
    expect(game.snapshot(now).freezeRemainingMs).toBe(1);
    now = start + 5_000;
    game.tick(now);
    expect(game.snapshot(now).freezeRemainingMs).toBe(0);
  });

  it("stops opponent moves and scoring for the full freeze", () => {
    const { game, now: start } = playingSession(6_000);
    const before = game.opponent.score;
    game.player.energy = ENERGY_FREEZE;
    expect(game.usePower("freeze", start)).toBe(true);

    const frozenScore = game.opponent.score;
    const frozenBoard = boardKey(game, "opponent");
    const frozenEnergy = game.opponent.energy;
    let now = start;
    while (now < start + FREEZE_MS) {
      now += 50;
      if (now >= start + FREEZE_MS) now = start + FREEZE_MS - 1;
      game.tick(now);
      expect(game.opponent.score).toBe(frozenScore);
      expect(game.opponent.energy).toBe(frozenEnergy);
      expect(boardKey(game, "opponent")).toBe(frozenBoard);
      expect(game.snapshot(now).freezeRemainingMs).toBeGreaterThan(0);
      if (now === start + FREEZE_MS - 1) break;
    }
    expect(before).toBeGreaterThanOrEqual(0);
  });

  it("keeps the player board playable and the match timer running", () => {
    const { game, now: start } = playingSession();
    game.player.energy = ENERGY_FREEZE;
    const timerAtFreeze = game.remainingMs(start);
    expect(game.usePower("freeze", start)).toBe(true);

    let now = start + 1_200;
    game.tick(now);
    const move = findAnyValidSwap(game.player.board);
    expect(move).not.toBeNull();
    expect(game.tryPlayerSwap(move!.a, move!.b, now)).toBe(true);
    expect(game.phase).toBe("playing");
    expect(game.remainingMs(now)).toBe(timerAtFreeze - 1_200);
    expect(game.remainingMs(now)).toBeLessThan(MATCH_SECONDS * 1000);
    expect(game.remainingMs(now)).toBeGreaterThan(MATCH_SECONDS * 1000 - 20_000);
  });

  it("resumes opponent scoring after 5 seconds without breaking boards", () => {
    const { game, now: start } = playingSession(6_000);
    game.player.energy = ENERGY_FREEZE;
    expect(game.usePower("freeze", start)).toBe(true);

    let now = start + FREEZE_MS - 1;
    game.tick(now);
    expect(game.snapshot(now).freezeRemainingMs).toBe(1);
    const frozenScore = game.opponent.score;

    now = start + FREEZE_MS;
    game.tick(now);
    expect(game.snapshot(now).freezeRemainingMs).toBe(0);
    expect(filledBoard(game, "player")).toBe(true);
    expect(filledBoard(game, "opponent")).toBe(true);
    expect(findAnyValidSwap(game.player.board)).not.toBeNull();
    expect(findAnyValidSwap(game.opponent.board)).not.toBeNull();

    const resumeUntil = now + 12_000;
    while (now < resumeUntil && game.opponent.score === frozenScore) {
      now += 100;
      game.tick(now);
    }
    expect(game.phase).toBe("playing");
    expect(game.snapshot(now).freezeRemainingMs).toBe(0);
    expect(game.opponent.score).toBeGreaterThan(frozenScore);
    expect(filledBoard(game, "player")).toBe(true);
    expect(filledBoard(game, "opponent")).toBe(true);
    expect(findAnyValidSwap(game.player.board)).not.toBeNull();
    expect(findAnyValidSwap(game.opponent.board)).not.toBeNull();
  });
});
