import { describe, expect, it } from "vitest";
import { cloneBoard, createSeededRng, generateBoard, resetIds } from "../src/engine/board";
import { resolveTargetedPower, targetedPowerCells } from "../src/engine/powers";
import { COLS, ROWS } from "../src/engine/types";

describe("targeted powers", () => {
  it("selects a clipped 3x3 burst area at a corner", () => {
    const board = generateBoard(createSeededRng(11));
    const cells = targetedPowerCells(board, "burst", { r: 0, c: 0 });

    expect(cells).toHaveLength(4);
    expect(cells).toEqual(
      expect.arrayContaining([
        { r: 0, c: 0 },
        { r: 0, c: 1 },
        { r: 1, c: 0 },
        { r: 1, c: 1 },
      ]),
    );
  });

  it("selects every board cell with the dynamically clicked gem color", () => {
    const board = generateBoard(createSeededRng(12));
    const colors = [...new Set(board.flat().map((piece) => piece!.color))].slice(0, 4);

    expect(colors.length).toBeGreaterThanOrEqual(3);
    for (const color of colors) {
      const target = board
        .flatMap((row, r) => row.map((piece, c) => (piece?.color === color ? { r, c } : null)))
        .find(Boolean)!;
      const expected = board.flatMap((row, r) =>
        row.flatMap((piece, c) => (piece?.color === color ? [{ r, c }] : [])),
      );

      expect(targetedPowerCells(board, "megaStrike", target)).toEqual(expected);
    }
  });

  it("clears every matching color and leaves every other gem unchanged", () => {
    resetIds();
    const original = generateBoard(createSeededRng(21));
    const colors = [...new Set(original.flat().map((piece) => piece!.color))].slice(0, 4);

    for (const [index, color] of colors.entries()) {
      const board = cloneBoard(original);
      const before = cloneBoard(board);
      const target = board
        .flatMap((row, r) => row.map((piece, c) => (piece?.color === color ? { r, c } : null)))
        .find(Boolean)!;
      const matching = targetedPowerCells(board, "megaStrike", target)!;
      const result = resolveTargetedPower(board, createSeededRng(100 + index), "megaStrike", target);

      expect(result).not.toBeNull();
      expect(result!.cleared).toBe(matching.length);
      expect(result!.comboPeak).toBe(1);
      expect(result!.events).toEqual([
        {
          type: "clear",
          combo: 1,
          score: result!.scoreDelta,
          cells: matching,
        },
        { type: "fill", combo: 1, score: 0, cells: matching },
      ]);
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          if (before[r]![c]!.color === color) {
            expect(board[r]![c]!.id).not.toBe(before[r]![c]!.id);
          } else {
            expect(board[r]![c]).toEqual(before[r]![c]);
          }
        }
      }
    }
  });

  it("shares invalid-target behavior for local and server callers", () => {
    const board = generateBoard(createSeededRng(13));
    const before = cloneBoard(board);

    expect(resolveTargetedPower(board, createSeededRng(14), "burst", { r: ROWS, c: COLS })).toBeNull();
    expect(board).toEqual(before);
  });

  it("resolves a valid targeted power through the normal cascade and refill path", () => {
    resetIds();
    const board = generateBoard(createSeededRng(15));
    const result = resolveTargetedPower(board, createSeededRng(16), "burst", { r: 4, c: 4 });

    expect(result).not.toBeNull();
    expect(result!.cleared).toBeGreaterThanOrEqual(9);
    expect(board.every((row) => row.every(Boolean))).toBe(true);
    expect(board).toHaveLength(ROWS);
    expect(board[0]).toHaveLength(COLS);
  });
});