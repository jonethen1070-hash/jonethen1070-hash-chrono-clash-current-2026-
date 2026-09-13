import { describe, expect, it } from "vitest";
import {
  cloneBoard,
  createSeededRng,
  findAnyValidSwap,
  findMatches,
  generateBoard,
  hasAnyMatch,
  makePiece,
  matchingNeighbors,
  resolveBoard,
  resetIds,
  trySwap,
} from "../src/engine/board";
import { COLS, ROWS } from "../src/engine/types";
import { GameSession, FINALE_MS } from "../src/engine/session";
import { recordMatch } from "../src/engine/progress";
import { EMPTY_PROGRESS } from "../src/engine/types";

describe("board generation", () => {
  it("creates an 8x10 board with no opening matches and a valid swap", () => {
    resetIds();
    const rng = createSeededRng(42);
    const board = generateBoard(rng);
    expect(board).toHaveLength(ROWS);
    expect(board[0]).toHaveLength(COLS);
    expect(findMatches(board)).toHaveLength(0);
    expect(hasAnyMatch(board)).toBe(false);
    expect(findAnyValidSwap(board)).not.toBeNull();
  });

  it("keeps hasAnyMatch aligned with findMatches without cloning boards", () => {
    resetIds();
    const empty = generateBoard(createSeededRng(9));
    expect(hasAnyMatch(empty)).toBe(findMatches(empty).length > 0);
    empty[0]![0]!.color = 1;
    empty[0]![1]!.color = 1;
    empty[0]![2]!.color = 1;
    expect(hasAnyMatch(empty)).toBe(true);
    expect(findMatches(empty).length).toBeGreaterThan(0);
    const before = cloneBoard(empty);
    expect(findAnyValidSwap(empty)).not.toBeNull();
    expect(cloneBoard(empty)).toEqual(before);
  });
});

describe("swapping", () => {
  it("orients line specials with the direction of the four-match", () => {
    resetIds();
    const horizontal = generateBoard(createSeededRng(21));
    for (let c = 0; c < 4; c++) horizontal[0]![c] = makePiece(1);
    expect(findMatches(horizontal).find((group) => group.special)?.special).toBe("lineH");

    const vertical = Array.from({ length: ROWS }, (_, r) =>
      Array.from({ length: COLS }, (_, c) => makePiece(((r * 2 + c) % 6) + 1)),
    );
    for (let r = 0; r < 4; r++) vertical[r]![0] = makePiece(2);
    expect(findMatches(vertical).find((group) => group.special)?.special).toBe("lineV");
  });

  it("offers every adjacent destination when a special is selected", () => {
    resetIds();
    const board = generateBoard(createSeededRng(23));
    board[3]![3] = makePiece(1, "lineH");
    expect(matchingNeighbors(board, { r: 3, c: 3 })).toHaveLength(4);
  });

  it("clears a horizontal match of three and scores", () => {
    resetIds();
    const rng = createSeededRng(7);
    const board = generateBoard(rng);
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        board[r]![c] = makePiece(((r + c) % 6) + 1);
      }
    }
    board[0]![0] = makePiece(1);
    board[0]![1] = makePiece(2);
    board[0]![2] = makePiece(1);
    board[0]![3] = makePiece(1);
    board[1]![1] = makePiece(3);
    const before = cloneBoard(board);
    const result = trySwap(board, { r: 0, c: 0 }, { r: 0, c: 1 }, rng);
    expect(result).not.toBeNull();
    expect(result!.scoreDelta).toBeGreaterThan(0);
    expect(result!.cleared).toBeGreaterThanOrEqual(3);
    expect(before[0]![0]!.id).not.toBe(board[0]![0]!.id);
  });

  it("reverts a swap that creates no match", () => {
    resetIds();
    const rng = createSeededRng(9);
    const board = generateBoard(rng);
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        board[r]![c] = makePiece(((r * 3 + c * 2) % 6) + 1);
      }
    }
    board[0]![0] = makePiece(1);
    board[0]![1] = makePiece(2);
    board[0]![2] = makePiece(3);
    board[1]![0] = makePiece(4);
    board[1]![1] = makePiece(5);
    const a = board[0]![0]!;
    const b = board[0]![1]!;
    const result = trySwap(board, { r: 0, c: 0 }, { r: 0, c: 1 }, rng);
    expect(result).toBeNull();
    expect(board[0]![0]!.id).toBe(a.id);
    expect(board[0]![1]!.id).toBe(b.id);
  });

  it("points matchingNeighbors at a swap that completes a match", () => {
    resetIds();
    const board = generateBoard(createSeededRng(1));
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        board[r]![c] = makePiece(((r + c) % 6) + 1);
      }
    }
    board[0]![0] = makePiece(1);
    board[0]![1] = makePiece(2);
    board[0]![2] = makePiece(1);
    board[0]![3] = makePiece(1);
    const hits = matchingNeighbors(board, { r: 0, c: 0 });
    expect(hits.some((p) => p.r === 0 && p.c === 1)).toBe(true);
  });

  it("resolves consecutive automatic cascade waves before returning", () => {
    resetIds();
    const rng = createSeededRng(4);
    const board = generateBoard(rng);
    const result = trySwap(board, { r: 0, c: 3 }, { r: 0, c: 4 }, rng);

    expect(result).not.toBeNull();
    expect(result!.events.filter((event) => event.type === "clear").map((event) => event.combo)).toEqual([1, 2, 3]);
    expect(findMatches(board)).toHaveLength(0);
    expect(board.flat().filter(Boolean)).toHaveLength(ROWS * COLS);
  });
});

describe("match session", () => {
  it("runs a complete 60s match and reports a correct winner", () => {
    const game = new GameSession();
    game.mode = "time";
    let now = 1_000;
    game.startMatch(now);
    expect(game.screen).toBe("match");
    expect(game.phase).toBe("countdown");

    now += 3_000;
    game.tick(now);
    expect(game.phase).toBe("playing");
    expect(game.remainingMs(now)).toBe(60_000);

    const move = findAnyValidSwap(game.player.board);
    expect(move).not.toBeNull();
    game.tryPlayerSwap(move!.a, move!.b, now + 10);

    now += 20_000;
    game.tick(now);
    expect(game.remainingMs(now)).toBe(40_000);
    game.pause(now);
    expect(game.phase).toBe("paused");
    now += 5_000;
    game.resume(now);
    expect(game.remainingMs(now)).toBe(40_000);

    now += 40_000;
    game.tick(now);
    expect(game.result).not.toBeNull();
    now += FINALE_MS;
    game.tick(now);
    expect(game.screen).toBe("results");
    const r = game.result!;
    if (r.playerScore > r.opponentScore) expect(r.outcome).toBe("win");
    else if (r.playerScore < r.opponentScore) expect(r.outcome).toBe("loss");
    else expect(r.outcome).toBe("tie");
  });

  it("records local progression", () => {
    const next = recordMatch({ ...EMPTY_PROGRESS }, "win", 1200, 4);
    expect(next.plays).toBe(1);
    expect(next.wins).toBe(1);
    expect(next.bestScore).toBe(1200);
    expect(next.bestCombo).toBe(4);
  });

  it("publishes each automatic clear wave for escalating player feedback", () => {
    const game = new GameSession();
    game.progress = { ...game.progress, tutorialDone: true };
    game.startMatch(1_000);
    game.phase = "playing";
    const rng = createSeededRng(4);
    game.player.board = generateBoard(rng);
    (game as unknown as { rng: () => number }).rng = rng;

    expect(game.tryPlayerSwap({ r: 0, c: 3 }, { r: 0, c: 4 }, 1_000)).toBe(true);
    expect(game.fx.filter((event) => event.kind === "clear" && event.side === "player").map((event) => event.combo)).toEqual([1, 2, 3]);
    expect(game.fx.filter((event) => event.kind === "combo" && event.side === "player").map((event) => event.combo)).toEqual([2, 3]);
    expect(game.player.board.flat().filter(Boolean)).toHaveLength(ROWS * COLS);
  });
});
