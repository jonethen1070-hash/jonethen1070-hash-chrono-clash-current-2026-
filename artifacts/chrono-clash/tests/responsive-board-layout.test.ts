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

function gemCellFromWidth(boardW: number): number {
  const inner = boardW - BOARD_FRAME * 2;
  return (inner - BOARD_GAP * (COLS + 1)) / COLS;
}

function boardHeightForWidth(boardW: number): number {
  const cell = gemCellFromWidth(boardW);
  return BOARD_FRAME * 2 + BOARD_GAP * (ROWS + 1) + cell * ROWS;
}

describe("production responsive board layout", () => {
  it("keeps an 8x10 board with square cell layout math", () => {
    expect(COLS).toBe(8);
    expect(ROWS).toBe(10);
    const renderer = readFileSync("src/ui/renderer.ts", "utf8");
    expect(renderer).toContain("const cellW = (innerW - GAP * (COLS + 1)) / COLS");
    expect(renderer).toContain("const cellH = (innerH - GAP * (ROWS + 1)) / ROWS");
    expect(renderer).toContain("const cell = Math.min(cellW, cellH)");
    const main = readFileSync("src/main.ts", "utf8");
    expect(main).toContain("const cellW = (innerW - BOARD_GAP * (COLS + 1)) / COLS");
    expect(main).toContain("const cellH = (innerH - BOARD_GAP * (ROWS + 1)) / ROWS");
    expect(main).toContain('setProperty("--app-vh"');
  });

  it("sizes the player board as an 8x10 rectangle from the mobile size budget", () => {
    const css = readFileSync("src/styles/aaa-polish.css", "utf8");
    expect(css).toContain("--game-pad-x: 4px");
    expect(css).toContain("grid-template-rows:");
    expect(css).toContain("var(--energy-height)\n    0px\n    minmax(0, 1fr)");
    expect(css).toContain("--mobile-board-side-gutter: 8px");
    expect(css).toContain("--board-after-energy-gap: 6px");
    expect(css).toContain("--board-before-abilities-gap: 8px");
    expect(css).toContain("--mobile-board-inline:");
    expect(css).toContain("--mobile-board-block:");
    expect(css).toContain("--mobile-board-size:");
    expect(css).toContain("--mobile-board-height:");
    expect(css).toContain("box-sizing: border-box !important");
    expect(css).toContain("width: var(--mobile-board-size) !important");
    expect(css).toContain("height: var(--mobile-board-height) !important");
    expect(css).toContain("max-width: var(--mobile-board-size) !important");
    expect(css).toContain("max-height: var(--mobile-board-height) !important");
    expect(css).toContain("aspect-ratio: 8 / 10 !important");
    expect(css).toContain("margin-top: var(--board-after-energy-gap) !important");
    const renderer = readFileSync("src/ui/renderer.ts", "utf8");
    expect(renderer).toContain("rowCell: cell");
    expect(renderer).toContain("boardW");
    expect(renderer).toContain("boardH");
  });

  it("keeps abilities directly below the board with a small intentional gap", () => {
    const css = readFileSync("src/styles/aaa-polish.css", "utf8");
    expect(css).toContain(
      "var(--energy-height)\n      0px\n      max-content\n      auto !important",
    );
    expect(css).toContain("align-content: start !important");
    expect(css).toContain("align-self: start !important");
    expect(css).toContain("margin: var(--board-before-abilities-gap) auto 0 !important");
    expect(css).toContain("transform: translateZ(2px) !important");
  });

  it("scales gem cells proportionally with board width on an 8x10 grid", () => {
    const narrow = gemCellFromWidth(316);
    const mid = gemCellFromWidth(386);
    const wide = gemCellFromWidth(426);
    expect(wide).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThan(narrow);
    for (const width of [316, 386, 426]) {
      const cell = gemCellFromWidth(width);
      expect(BOARD_FRAME * 2 + BOARD_GAP * (COLS + 1) + cell * COLS).toBeCloseTo(width, 10);
      expect(boardHeightForWidth(width) / width).toBeCloseTo(10 / 8, 1);
    }
    expect(BOARD_FRAME).toBe(6);
    expect(BOARD_GAP).toBe(1.5);
  });

  it("keeps the rival board a smaller responsive 8x10 panel", () => {
    const studio = studioCss();
    const rival = rivalBoardSlotCss(studio);
    expect(rival).toContain("aspect-ratio: 8 / 10");
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

  it("removes the board label and gives the 8x10 board the recovered space", () => {
    const main = readFileSync("src/main.ts", "utf8");
    const match = main.slice(main.indexOf('id="match"'), main.indexOf('id="sheet"'));
    expect(match).not.toContain("YOUR BOARD");
    const css = readFileSync("src/styles/aaa-polish.css", "utf8");
    expect(css).toContain("grid-row: 4 !important");
    expect(css).toContain("grid-row: 5 !important");
    expect(css).toContain("grid-row: 6 !important");
    expect(css).toContain("--mobile-board-size:");
    expect(css).toContain("--mobile-board-height:");
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
    expect(studio).toContain("canvas.board-canvas");
    expect(studio).toContain("max-height: none");
    expect(main).toContain("--app-vh");
  });
});
