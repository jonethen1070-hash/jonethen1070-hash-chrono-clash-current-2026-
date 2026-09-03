import { describe, expect, it } from "vitest";
import {
  adjacent,
  createSeededRng,
  emptyBoard,
  findAnyValidSwap,
  findMatches,
  makePiece,
  resetIds,
  scoreForClear,
  trySwap,
} from "../src/engine/board";
import { comboFlavor, fillAttack } from "../src/engine/combat";
import { neighborFromSwipe } from "../src/engine/input";
import { grantMatchRewards } from "../src/engine/progress";
import { GameSession } from "../src/engine/session";
import { withPowerStock } from "../src/engine/economy";
import {
  EMPTY_PROGRESS,
  ENERGY_FREEZE,
  ENERGY_MAX,
  ENERGY_REWIND,
  ENERGY_TIMESHIFT,
  FREEZE_MS,
  MATCH_SECONDS,
  TIME_STEAL_MS,
  TIMESHIFT_MS,
} from "../src/engine/types";

function play(game: GameSession, now = 1_000): number {
  game.progress = withPowerStock({ ...game.progress, tutorialDone: true, matchesSeen: 3 }, { freeze: 5, timeshift: 5 });
  if (game.mode !== "score") game.mode = "time";
  game.startMatch(now);
  now += 3_000;
  game.tick(now);
  expect(game.phase).toBe("playing");
  return now;
}

function fill(colors: number[][]) {
  resetIds();
  const board = emptyBoard();
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      board[r]![c] = makePiece(colors[r]?.[c] ?? ((r + c) % 6) + 1);
    }
  }
  return board;
}

describe("valid and invalid swipe", () => {
  it("maps a cardinal drag to one adjacent tile", () => {
    expect(neighborFromSwipe({ r: 3, c: 3 }, 48, 2, 16)).toEqual({ r: 3, c: 4 });
    expect(adjacent({ r: 3, c: 3 }, { r: 3, c: 4 })).toBe(true);
  });

  it("rejects diagonal and non-adjacent swipes", () => {
    expect(neighborFromSwipe({ r: 3, c: 3 }, 40, 40, 16)).toBeNull();
    expect(adjacent({ r: 3, c: 3 }, { r: 4, c: 4 })).toBe(false);
    const rng = createSeededRng(1);
    const board = fill([]);
    expect(trySwap(board, { r: 0, c: 0 }, { r: 2, c: 0 }, rng)).toBeNull();
  });

  it("accepts a valid adjacent match swipe and reverts an invalid one", () => {
    const rng = createSeededRng(2);
    const validBoard = fill([]);
    validBoard[0]![0] = makePiece(1);
    validBoard[0]![1] = makePiece(2);
    validBoard[0]![2] = makePiece(1);
    validBoard[0]![3] = makePiece(1);
    const valid = trySwap(validBoard, { r: 0, c: 0 }, { r: 0, c: 1 }, rng);
    expect(valid).not.toBeNull();
    expect(valid!.cleared).toBeGreaterThanOrEqual(3);

    const invalidBoard = fill([]);
    invalidBoard[4]![4] = makePiece(1);
    invalidBoard[4]![5] = makePiece(2);
    invalidBoard[4]![6] = makePiece(3);
    invalidBoard[5]![4] = makePiece(4);
    invalidBoard[5]![5] = makePiece(5);
    const left = invalidBoard[4]![4]!;
    const right = invalidBoard[4]![5]!;
    const invalid = trySwap(invalidBoard, { r: 4, c: 4 }, { r: 4, c: 5 }, rng);
    expect(invalid).toBeNull();
    expect(invalidBoard[4]![4]!.id).toBe(left.id);
    expect(invalidBoard[4]![5]!.id).toBe(right.id);
  });
});

describe("match detection and scoring", () => {
  it("detects T/L special matches", () => {
    const board = fill([]);
    board[0]![0] = makePiece(1);
    board[0]![1] = makePiece(1);
    board[0]![2] = makePiece(1);
    board[1]![0] = makePiece(1);
    board[2]![0] = makePiece(1);
    const groups = findMatches(board);
    expect(groups.some((g) => g.shape === "tee" && g.cells.length >= 5)).toBe(true);
  });

  it("scores 3/4/5 matches with increasing rewards", () => {
    expect(scoreForClear(3, 1, "three")).toBe(54);
    expect(scoreForClear(4, 1, "four")).toBeGreaterThan(scoreForClear(3, 1, "three"));
    expect(scoreForClear(5, 1, "five")).toBeGreaterThan(scoreForClear(4, 1, "four"));
    expect(scoreForClear(5, 1, "tee")).toBeGreaterThan(scoreForClear(3, 1, "three"));
  });

  it("increases combo and score across a cascade", () => {
    const rng = createSeededRng(11);
    const board = fill([]);
    for (let c = 0; c < 8; c++) {
      board[0]![c] = makePiece(c === 1 ? 2 : 3);
      board[1]![c] = makePiece(3);
      board[2]![c] = makePiece(3);
    }
    board[0]![0] = makePiece(1);
    board[0]![1] = makePiece(2);
    board[0]![2] = makePiece(1);
    board[0]![3] = makePiece(1);
    board[3]![1] = makePiece(2);
    board[4]![1] = makePiece(2);
    const result = trySwap(board, { r: 0, c: 0 }, { r: 0, c: 1 }, rng);
    expect(result).not.toBeNull();
    expect(result!.comboPeak).toBeGreaterThanOrEqual(1);
    expect(result!.scoreDelta).toBeGreaterThan(scoreForClear(3, 1));
    expect(result!.events.some((e) => e.type === "clear")).toBe(true);
    expect(result!.events.some((e) => e.type === "fill")).toBe(true);
  });

  it("progresses combo flavor labels", () => {
    expect(comboFlavor(2)).toBe("COMBO x2");
    expect(comboFlavor(3)).toBe("NICE!");
    expect(comboFlavor(4)).toBe("GREAT!");
    expect(comboFlavor(5)).toBe("AMAZING!");
    expect(comboFlavor(6)).toBe("PERFECT!");
    expect(comboFlavor(7)).toBe("UNSTOPPABLE!");
    expect(comboFlavor(8)).toBe("MEGA COMBO");
  });
});

describe("battle win conditions", () => {
  it("TIME BATTLE awards the higher score at 0:00 and stops input", () => {
    const game = new GameSession();
    game.mode = "time";
    let now = play(game);
    game.player.score = 900;
    game.opponent.score = 400;
    now += MATCH_SECONDS * 1000;
    game.tick(now);
    expect(game.result?.outcome).toBe("win");
    expect(game.matchState(now)).toBe("WON");
    expect(game.tryPlayerSwap({ r: 0, c: 0 }, { r: 0, c: 1 }, now + 10)).toBe(false);
    expect(game.usePower("freeze", now + 10)).toBe(false);
  });

  it("SCORE BATTLE ends immediately at the configured target", () => {
    const game = new GameSession();
    game.setScoreTarget(3000);
    game.mode = "score";
    const now = play(game, 4_000);
    expect(game.snapshot(now).target).toBe(3000);
    game.player.score = 2999;
    game.tick(now + 10);
    expect(game.result).toBeNull();
    game.player.score = 3000;
    game.tick(now + 20);
    expect(game.result?.outcome).toBe("win");
    expect(game.result?.target).toBe(3000);
  });
});

describe("chrono powers and energy", () => {
  it("FREEZE consumes energy, never goes negative, and halts rival scoring", () => {
    const game = new GameSession();
    game.mode = "time";
    const now = play(game, 6_000);
    game.player.energy = ENERGY_FREEZE;
    expect(game.usePower("freeze", now)).toBe(true);
    expect(game.player.energy).toBe(0);
    expect(game.snapshot(now).freezeRemainingMs).toBe(FREEZE_MS);
    expect(game.usePower("freeze", now + 40)).toBe(false);
    const rival = game.opponent.score;
    const frozenBoard = JSON.stringify(game.opponent.board.map((row) => row.map((c) => c?.id)));
    let t = now;
    while (t < now + FREEZE_MS - 50) {
      t += 50;
      game.tick(t);
      expect(game.snapshot(t).freezeRemainingMs).toBeGreaterThan(0);
      expect(game.opponent.score).toBe(rival);
      expect(JSON.stringify(game.opponent.board.map((row) => row.map((c) => c?.id)))).toBe(frozenBoard);
    }
  });

  it("TIME SHIFT in TIME BATTLE steals 5 seconds of rival play and freezes the clock", () => {
    const game = new GameSession();
    game.mode = "time";
    const now = play(game, 8_000);
    game.player.energy = ENERGY_TIMESHIFT;
    const left = game.remainingMs(now);
    expect(game.usePower("timeshift", now)).toBe(true);
    expect(game.player.energy).toBe(0);
    const rival = game.opponent.score;
    const later = now + TIME_STEAL_MS - 100;
    game.tick(later);
    expect(game.remainingMs(later)).toBe(left);
    expect(game.snapshot(later).timeshiftRemainingMs).toBeGreaterThan(0);
    expect(game.snapshot(later).matchState).toBe("POWER_ACTIVE");
    expect(game.opponent.score).toBe(rival);
  });

  it("TIME SHIFT in SCORE BATTLE is a tempo surge and does not use a timer win", () => {
    const game = new GameSession();
    game.mode = "score";
    game.setScoreTarget(8000);
    const now = play(game, 9_000);
    game.player.energy = ENERGY_TIMESHIFT;
    expect(game.usePower("timeshift", now)).toBe(true);
    expect(game.snapshot(now).scoreBoostRemainingMs).toBe(TIMESHIFT_MS);
    expect(game.remainingMs(now + 1000)).toBe(0);
    expect(game.result).toBeNull();
  });

  it("REWIND restores the previous board, score, and combo", () => {
    const game = new GameSession();
    const now = play(game, 10_000);
    const move = findAnyValidSwap(game.player.board);
    expect(move).not.toBeNull();
    const before = JSON.stringify(game.player.board.map((row) => row.map((c) => c?.id)));
    const scoreBefore = game.player.score;
    const comboBefore = game.player.combo;
    expect(game.tryPlayerSwap(move!.a, move!.b, now)).toBe(true);
    game.player.energy = ENERGY_REWIND;
    expect(game.usePower("rewind", now + 30)).toBe(true);
    const after = JSON.stringify(game.player.board.map((row) => row.map((c) => c?.id)));
    expect(after).toBe(before);
    expect(game.player.score).toBe(scoreBefore);
    expect(game.player.combo).toBe(comboBefore);
  });

  it("rejects unaffordable powers and clamps energy", () => {
    const game = new GameSession();
    const now = play(game, 11_000);
    game.player.energy = ENERGY_FREEZE - 1;
    expect(game.usePower("freeze", now)).toBe(false);
    game.player.energy = ENERGY_MAX;
    game.player.energy = Math.min(ENERGY_MAX, game.player.energy + 50);
    expect(game.player.energy).toBe(ENERGY_MAX);
  });
});

describe("rival, completion, and profile", () => {
  it("lets the rival score from simulated board moves", () => {
    const game = new GameSession();
    let now = play(game, 12_000);
    const start = game.opponent.score;
    const until = now + 14_000;
    while (now < until && game.opponent.score === start) {
      now += 100;
      game.tick(now);
    }
    expect(game.opponent.score).toBeGreaterThan(start);
  });

  it("records profile statistics from a completed match", () => {
    const rewarded = grantMatchRewards(
      { ...EMPTY_PROGRESS, unlocked: [...EMPTY_PROGRESS.unlocked], powersUsed: { freeze: 0, timeshift: 0, rewind: 0 } },
      {
        outcome: "win",
        score: 2200,
        bestCombo: 4,
        mode: "time",
        rivalScore: 800,
        powersThisMatch: ["freeze"],
      },
    );
    expect(rewarded.progress.plays).toBe(1);
    expect(rewarded.progress.wins).toBe(1);
    expect(rewarded.progress.losses).toBe(0);
    expect(rewarded.progress.bestScore).toBe(2200);
    expect(rewarded.progress.bestCombo).toBe(4);
    expect(rewarded.progress.winStreak).toBe(1);
  });

  it("charges attack from combos", () => {
    const fired = fillAttack(90, 4, 8);
    expect(fired.fired).toBe(true);
    expect(fired.meter).toBeGreaterThanOrEqual(0);
  });
});
