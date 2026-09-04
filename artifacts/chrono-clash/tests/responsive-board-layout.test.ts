import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { COLS, ROWS } from "../src/engine/types";
import { BOARD_FRAME, BOARD_GAP } from "../src/ui/renderer";

function studioCss(): string {
  return readFileSync("src/styles/studio.css", "utf8");
}

function rivalBoardSlotCss(studio: string): string {
  const start = studio.indexOf("#match .rival-side .board-slot {\n  flex:");
  expect(start).toBeGreaterThan(-1);
  const end = studio.indexOf("#match .player-side .board-slot {", start);
  return studio.slice(start, end);
}

function gemCell(boardSize: number): number {
  const inner = boardSize - BOARD_FRAME * 2;
  return (inner - BOARD_GAP * (COLS + 1)) / COLS;
}

describe("production responsive board layout", () => {
  it("keeps an 8x8 board with square layout math", () => {
    expect(COLS).toBe(8);
    expect(ROWS).toBe(8);
    const renderer = readFileSync("src/ui/renderer.ts", "utf8");
    expect(renderer).toContain("const size = Math.min(w, h)");
    expect(renderer).toContain("const cell = (inner - GAP * (COLS + 1)) / COLS");
    const main = readFileSync("src/main.ts", "utf8");
    expect(main).toContain("const size = Math.min(rect.width, rect.height)");
    expect(main).toContain("cachedCellSize = (inner - BOARD_GAP * (8 + 1)) / 8");
    expect(main).toContain('setProperty("--app-vh"');
  });

  it("sizes the player board to the recovered safe viewport space", () => {
    const css = readFileSync("src/styles/aaa-polish.css", "utf8");
    expect(css).toContain("--game-pad-x: 4px");
    expect(css).toContain("grid-template-rows:");
    expect(css).toContain("var(--energy-height)\n    0px\n    minmax(0, 1fr)");
    expect(css).toContain("width: min(100%, calc(100vw - var(--safe-left) - var(--safe-right) - 2px), 388px)");
    expect(css).toContain("max-width: min(100%, calc(100vw - var(--safe-left) - var(--safe-right) - 2px), 388px)");
    expect(css).toContain("height: auto !important");
    expect(css).toContain("aspect-ratio: 1 / 1 !important");
    expect(css).toContain("margin-top: 0 !important");
  });

  it("packs mobile controls beneath the content-sized square board", () => {
    const css = readFileSync("src/styles/aaa-polish.css", "utf8");
    expect(css).toContain(
      "var(--energy-height)\n      0px\n      max-content\n      calc(var(--control-height) + 6px)",
    );
    expect(css).toContain("margin-top: 6px !important");
    expect(css).toContain("transform: translateZ(2px) !important");
  });

  it("scales gem cells proportionally with board size", () => {
    const narrow = gemCell(316);
    const mid = gemCell(386);
    const wide = gemCell(426);
    expect(wide).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThan(narrow);
    for (const size of [316, 386, 426]) {
      expect(BOARD_FRAME * 2 + BOARD_GAP * (COLS + 1) + gemCell(size) * COLS).toBeCloseTo(size, 10);
    }
    expect(BOARD_FRAME).toBe(6);
    expect(BOARD_GAP).toBe(1.5);
  });

  it("keeps the rival board a smaller responsive square", () => {
    const studio = studioCss();
    const rival = rivalBoardSlotCss(studio);
    expect(rival).toContain("width: min(28vw, 14dvh, 120px)");
    expect(rival).toContain("height: min(28vw, 14dvh, 120px)");
    expect(rival).toContain("aspect-ratio: 1 / 1");
    expect(rival).toMatch(/width:\s*min\(/);
    expect(rival).not.toMatch(/^\s*width:\s*\d+px;\s*$/m);
  });

  it("keeps abilities in the match column and clips match overflow", () => {
    const studio = studioCss();
    expect(studio).toContain("#match.match-screen");
    expect(studio).toContain("overflow: hidden");
    expect(studio).toContain("#match .powers { grid-row: 5;");
    expect(studio).toContain("#match .boards { grid-row: 4;");
    expect(studio).toContain("grid-template-rows: auto auto auto minmax(0, 1fr) auto");
    expect(studio).toContain("--match-board-gap: 12px");
    expect(studio).toContain("container-type: size");
    expect(studio).not.toMatch(/#match\.match-screen[\s\S]{0,400}overflow-y:\s*auto/);
    const main = readFileSync("src/main.ts", "utf8");
    const match = main.slice(main.indexOf('id="match"'), main.indexOf('id="sheet"'));
    expect(match).not.toContain('id="freeze"');
    expect(match).not.toContain('id="timeshift"');
    expect(match).not.toContain('id="freezeQty"');
    expect(match).not.toContain('id="shiftQty"');
    expect(match).toContain('id="rewind"');
    expect(match).toContain('id="energyBurstAttack"');
    expect(match).toContain('id="megaStrikeAttack"');
    expect(match.indexOf('class="powers"')).toBeGreaterThan(match.indexOf('id="playerBoard"'));
    expect(match).toContain('id="stage"');
    expect(match.indexOf('id="stage"')).toBeGreaterThan(match.indexOf('id="playerBoard"'));
    expect(match.indexOf('id="overlay"')).toBeGreaterThan(match.indexOf('id="stage"'));
    expect(match).toContain('id="playerGems"');
    expect(match).toContain('id="oppGems"');
    expect(match.indexOf('id="playerGems"')).toBeGreaterThan(match.indexOf('id="playerBoard"'));
    expect(match.indexOf('id="playerGems"')).toBeLessThan(match.indexOf('id="stage"'));
    expect(match.indexOf('id="oppGems"')).toBeGreaterThan(match.indexOf('id="oppBoard"'));
    expect(match.indexOf('id="oppGems"')).toBeGreaterThan(match.indexOf('id="playerBoard"'));
  });

  it("removes the board label and gives the square board the recovered space", () => {
    const main = readFileSync("src/main.ts", "utf8");
    const match = main.slice(main.indexOf('id="match"'), main.indexOf('id="sheet"'));
    expect(match).not.toContain("YOUR BOARD");
    const css = readFileSync("src/styles/aaa-polish.css", "utf8");
    expect(css).toContain("grid-row: 4 !important");
    expect(css).toContain("grid-row: 5 !important");
    expect(css).toContain("grid-row: 6 !important");
    expect(css).toContain("width: min(100%, calc(100vw - var(--safe-left) - var(--safe-right) - 2px), 388px)");
    expect(css).toContain("388px");
    expect(css).toContain("margin-top: 0 !important");
  });

  it("paints gems on in-slot canvases so Android frames cannot hide them", () => {
    const main = readFileSync("src/main.ts", "utf8");
    const renderer = readFileSync("src/ui/renderer.ts", "utf8");
    const studio = studioCss();
    expect(main).toContain("setBoardLayers");
    expect(main).not.toContain("desynchronized");
    expect(renderer).toContain("setBoardLayers");
    expect(renderer).toContain("paintBoardLayer");
    expect(renderer).toContain("drawProceduralGem");
    expect(studio).toContain("#match .board-slot > canvas.board-canvas");
    expect(studio).toContain("max-height: none");
    expect(main).toContain("--app-vh");
  });
});
