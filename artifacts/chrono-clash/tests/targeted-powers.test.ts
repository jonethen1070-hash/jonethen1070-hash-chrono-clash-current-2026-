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

  it("selects only the exact mega-strike target cell", () => {
    const board = generateBoard(createSeededRng(12));
    const target = { r: 3, c: 4 };
    const cells = targetedPowerCells(board, "megaStrike", target)!;

    expect(cells).toEqual([target]);
  });

  it("removes and refills only the clicked mega-strike socket", () => {
    for (const [seed, target] of [
      [21, { r: 0, c: 0 }],
      [22, { r: 3, c: 4 }],
      [23, { r: 7, c: 7 }],
    ] as const) {
      resetIds();
      const board = generateBoard(createSeededRng(seed));
      const before = cloneBoard(board);
      const clickedId = board[target.r]![target.c]!.id;
      const result = resolveTargetedPower(board, createSeededRng(seed + 100), "megaStrike", target);

      expect(result).not.toBeNull();
      expect(result!.cleared).toBe(1);
      expect(result!.comboPeak).toBe(1);
      expect(result!.events).toEqual([
        { type: "clear", combo: 1, score: 18, cells: [target] },
        { type: "fill", combo: 1, score: 0, cells: [target] },
      ]);
      expect(board[target.r]![target.c]!.id).not.toBe(clickedId);
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          if (r === target.r && c === target.c) continue;
          expect(board[r]![c]).toEqual(before[r]![c]);
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