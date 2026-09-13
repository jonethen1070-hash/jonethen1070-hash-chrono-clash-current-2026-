import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BOARD_GAP, liveGemDrawOrigin } from "../src/ui/renderer";
import {
  easeCrystalDie,
  easeCrystalFall,
  easeInOutCubic,
  easeInOutSine,
  easeMagneticSwap,
  gemFallDelay,
  gemDieDuration,
  gemTravelDuration,
  gemTravelEase,
  SWAP_MAGNET_MS,
  SWAP_PUSH_MS,
  SWAP_TOTAL_MS,
  MATCH_ANTICIPATE_MS,
  matchImpactDelayMs,
} from "../src/ui/gemMotion";
import { COLS, INVALID_RETURN_MS, ROWS, SWAP_INPUT_LOCK_MS } from "../src/engine/types";
import { cloneBoard, createSeededRng, findMatches, makePiece, resetIds, trySwap } from "../src/engine/board";
import { LARGE_MATCH_VFX_FIXTURES } from "./vfxFixtures";

const THREE_ROW_CASCADE_FIXTURE = [
  [4, 1, 4, 6, 6, 2, 4, 5],
  [3, 6, 3, 3, 1, 3, 2, 1],
  [3, 1, 3, 5, 2, 2, 1, 3],
  [4, 5, 2, 2, 4, 4, 5, 2],
  [5, 3, 5, 6, 2, 5, 1, 2],
  [3, 2, 1, 5, 4, 1, 2, 1],
  [4, 6, 2, 6, 5, 3, 2, 5],
  [6, 6, 5, 6, 6, 1, 1, 6],
  [1, 2, 1, 2, 1, 2, 3, 1],
  [2, 1, 2, 1, 2, 1, 2, 3],
] as const;

function padToLiveRows(colors: readonly (readonly number[])[]): number[][] {
  const rows = colors.map((row) => [...row]);
  while (rows.length < ROWS) {
    const r = rows.length;
    const prev = rows[r - 1]!;
    const prev2 = rows[r - 2] ?? prev;
    const row: number[] = [];
    for (let c = 0; c < COLS; c++) {
      let color = 1 + ((r + c * 2) % 6);
      const left = row[c - 1];
      const left2 = row[c - 2];
      const up = prev[c]!;
      const up2 = prev2[c]!;
      for (let i = 0; i < 8; i++) {
        const tripleH = left != null && left2 != null && color === left && color === left2;
        const tripleV = color === up && color === up2;
        if (!tripleH && !tripleV && color !== up) break;
        color = (color % 6) + 1;
      }
      row.push(color);
    }
    rows.push(row);
  }
  return rows;
}

function cascadeFixture() {
  resetIds();
  return padToLiveRows(THREE_ROW_CASCADE_FIXTURE).map((row) => row.map((color) => makePiece(color)));
}

describe("crystal gem motion curves", () => {
  it("eases swaps and falls from rest to the target without overshoot", () => {
    expect(easeInOutSine(0)).toBe(0);
    expect(easeInOutSine(1)).toBeCloseTo(1, 5);
    expect(easeInOutSine(0.25)).toBeLessThan(0.5);
    expect(easeInOutSine(0.75)).toBeGreaterThan(0.5);
    expect(easeMagneticSwap(0)).toBe(0);
    expect(easeMagneticSwap(1)).toBe(1);
    expect(easeMagneticSwap(0.25)).toBeLessThan(0.3);
    expect(easeMagneticSwap(0.9)).toBeGreaterThan(0.65);
    expect(gemTravelEase("swap", 0.125)).toBe(easeMagneticSwap(0.125));
    expect(easeCrystalFall(0)).toBe(0);
    expect(easeCrystalFall(1)).toBeCloseTo(1, 5);
    expect(easeCrystalFall(0.2)).toBeLessThan(0.2);
    expect(easeInOutCubic(0.25)).toBeLessThan(0.25);
    expect(easeInOutCubic(0.75)).toBeGreaterThan(0.75);
    expect(gemTravelEase("swap", 0.5)).toBe(easeMagneticSwap(0.5));
    expect(gemTravelEase("fall", 0.5)).toBe(easeCrystalFall(0.5));
  });

  it("keeps swaps tactile, fast, and staggers cascade columns", () => {
    const swap = gemTravelDuration(40, 40, "swap", "high", false);
    const fallOne = gemTravelDuration(40, 40, "fall", "high", false);
    const fallThree = gemTravelDuration(40 * 3, 40, "fall", "high", false);
    const fallFar = gemTravelDuration(40 * 5, 40, "fall", "high", false);
    expect(SWAP_PUSH_MS).toBe(72);
    expect(SWAP_MAGNET_MS).toBe(48);
    expect(SWAP_TOTAL_MS).toBe(120);
    expect(swap).toBe(0.12);
    expect(fallOne).toBeCloseTo(0.12, 5);
    expect(fallThree).toBeGreaterThan(fallOne);
    expect(fallFar).toBeGreaterThan(fallThree);
    expect(fallThree).toBeCloseTo(0.17, 5);
    expect(fallFar).toBeCloseTo(0.22, 5);
    expect(gemTravelDuration(40 * 4, 40, "fall", "high", false)).toBeCloseTo(0.195, 5);
    expect(gemTravelDuration(40 * 8, 40, "fall", "high", false)).toBe(0.22);
    expect(fallFar).toBeGreaterThan(swap);
    expect(gemFallDelay(0, 3, "high", false)).toBeLessThan(gemFallDelay(7, 3, "high", false));
    expect(gemFallDelay(3, 2, "high", true)).toBe(0);
    expect(gemFallDelay(7, 8, "high", false)).toBeLessThanOrEqual(0.016);
    expect(INVALID_RETURN_MS).toBe(110);
    expect(SWAP_INPUT_LOCK_MS).toBe(140);
    expect(MATCH_ANTICIPATE_MS).toBe(44);
    expect(matchImpactDelayMs()).toBe(164);
  });

  it("blooms then dissolves matched crystals instead of popping them", () => {
    expect(gemDieDuration("high", false)).toBe(0.12);
    expect(gemDieDuration("medium", false)).toBe(0.11);
    expect(gemDieDuration("low", false)).toBe(0.1);
    const start = easeCrystalDie(0);
    const bloom = easeCrystalDie(0.15);
    const end = easeCrystalDie(1);
    expect(start.alpha).toBe(1);
    expect(bloom.scale).toBeGreaterThan(start.scale);
    expect(bloom.flash).toBeGreaterThan(start.flash);
    expect(end.alpha).toBeCloseTo(0, 5);
    expect(end.scale).toBeLessThan(1);
  });
});

describe("input and animation timing contracts", () => {
  it("only primes a swap after the session accepts it", () => {
    const main = readFileSync("src/main.ts", "utf8");
    const commitStart = main.indexOf("function commitSwipe(");
    const commitEnd = main.indexOf("\n}\n\nui.playerBoard.addEventListener", commitStart);
    const commit = main.slice(commitStart, commitEnd);
    expect(commit.indexOf("if (session.tryPlayerSwap")).toBeGreaterThan(-1);
    expect(commit.indexOf("renderer.primeSwapPose")).toBeGreaterThan(commit.indexOf("if (session.tryPlayerSwap"));
    expect(commit).not.toContain("renderer.primeSwapPose(from, target, gestureDx, gestureDy, now);\n  if");
  });

  it("keeps renderer gem travel and particle stepping on the capped animation clock", () => {
    const renderer = readFileSync("src/ui/renderer.ts", "utf8");
    expect(renderer).toContain("this.animDt = Math.min(0.033, Math.max(0.008");
    expect(renderer).toContain("tile.moveAge += dt");
    expect(renderer).toContain("tile.dieAge += dt");
    expect(renderer).toContain("this.stepParticles(view, dt)");
    expect(renderer).toContain("this.stepCrystalShards(view, dt)");
  });
});

describe("occupied cells still have a gem pose", () => {
  it("follows interpolated travel instead of snapping to the rest well", () => {
    const restX = 10;
    const restY = 400;
    const cell = 45;
    const flying = liveGemDrawOrigin(restX, restY, restX, restY - cell * 3, cell, false);
    expect(flying.x).toBe(restX);
    expect(flying.y).toBe(restY - cell * 3);
    expect(liveGemDrawOrigin(12, 40, 18, 22, 40, false, 4, -3)).toEqual({ x: 22, y: 19 });
    expect(liveGemDrawOrigin(12, 40, 18, 22, 40, false, 0, 0, 0, 2.5, -1.5)).toEqual({ x: 20.5, y: 20.5 });
  });

  it("lets dying gems keep a free overlay path", () => {
    expect(liveGemDrawOrigin(10, 40, 12, 8, 40, true)).toEqual({ x: 12, y: 8 });
  });

  it("sits on the rest cell once the tween has arrived", () => {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const tx = 6 + BOARD_GAP + c * (40 + BOARD_GAP);
        const ty = 6 + BOARD_GAP + r * (40 + BOARD_GAP);
        expect(liveGemDrawOrigin(tx, ty, tx, ty, 40, false)).toEqual({ x: tx, y: ty });
      }
    }
  });
});

describe("three-row cascade visibility fixture", () => {
  it("creates a valid swap whose first gravity wave moves a gem three rows", () => {
    const board = cascadeFixture();
    expect(findMatches(board)).toHaveLength(0);
    const before = cloneBoard(board);
    const result = trySwap(board, { r: 3, c: 3 }, { r: 3, c: 4 }, createSeededRng(101));

    expect(result).not.toBeNull();
    expect(result!.events.some((event) => event.type === "clear")).toBe(true);

    const originalPositions = new Map(
      before.flatMap((row, r) => row.map((piece, c) => [piece!.id, { r, c }] as const)),
    );
    const falls = board.flatMap((row, r) =>
      row.flatMap((piece, c) => {
        if (!piece) return [];
        const from = originalPositions.get(piece.id);
        return from && from.c === c && r > from.r ? [{ piece, from, to: { r, c } }] : [];
      }),
    );
    const longest = falls.reduce((max, fall) => Math.max(max, fall.to.r - fall.from.r), 0);
    expect(longest).toBeGreaterThanOrEqual(3);
    expect(falls.some((fall) => fall.from.r === 0 && fall.to.r === 3 && fall.to.c === 4)).toBe(true);
  });
});

describe("large-match VFX fixtures", () => {
  it("keeps deterministic 3, 4, and 5+ gem recognition cases", () => {
    for (const [name, fixture] of Object.entries(LARGE_MATCH_VFX_FIXTURES).slice(0, 3)) {
      resetIds();
      const board = padToLiveRows(fixture.board).map((row) => row.map((color) => makePiece(color)));
      expect(findMatches(board), `${name} starts without a match`).toHaveLength(0);
      const result = trySwap(board, fixture.from, fixture.to, createSeededRng(fixture.rngSeed));
      expect(result, `${name} accepts its fixture swap`).not.toBeNull();
      expect(result!.events.find((event) => event.type === "clear")?.cells).toHaveLength(fixture.expectedFirstWave);
      expect(result!.comboPeak).toBe(fixture.expectedComboPeak);
    }
  });

  it("keeps one-wave, multi-wave, and long-fall resolver paths distinct", () => {
    for (const name of ["oneCascade", "multipleCascade", "longFall"] as const) {
      const fixture = LARGE_MATCH_VFX_FIXTURES[name];
      resetIds();
      const before = padToLiveRows(fixture.board).map((row) => row.map((color) => makePiece(color)));
      const originalPositions = new Map(
        before.flatMap((row, r) => row.map((piece, c) => [piece.id, { r, c }] as const)),
      );
      const board = cloneBoard(before);
      const result = trySwap(board, fixture.from, fixture.to, createSeededRng(fixture.rngSeed));
      expect(result, `${name} accepts its fixture swap`).not.toBeNull();
      expect(result!.comboPeak).toBe(fixture.expectedComboPeak);
      const maxFall = board.reduce((max, row, r) =>
        row.reduce((columnMax, piece, c) => {
          const from = piece && originalPositions.get(piece.id);
          return from && from.c === c ? Math.max(columnMax, r - from.r) : columnMax;
        }, max),
      0);
      expect(maxFall).toBeGreaterThanOrEqual(fixture.expectedMaxFall);
    }
  });
});

describe("landing feedback", () => {
  it("keeps landing feedback renderer-owned and localized", () => {
    const renderer = readFileSync("src/ui/renderer.ts", "utf8");
    expect(renderer).toContain("takeLandingImpacts");
    expect(renderer).toContain("drawSocketPulses");
    expect(renderer).toContain("life: 64");
    expect(renderer).toContain("x: tile.toX + cell / 2");
    expect(renderer).toContain("const lift = sel ? 1.026 : 1");
    expect(renderer).toContain("tile.scale = Math.max(tile.scale, 1.035)");
    expect(renderer).toContain("tile.settleDur = 0.068");
    expect(renderer).toContain("tile.scale = 0.985");
    expect(renderer).toContain("tile.scale = 1.015");
    expect(renderer).toContain("primeSwapPose");
    expect(renderer).toContain("life: 64");
    expect(renderer).toContain("const MATCH_IMPACT_MS = 54");
    expect(renderer).toContain("const MATCH_STAGGER_MIN_MS = 8");
    expect(renderer).toContain("const MATCH_STAGGER_STEP_MS = 4");
    expect(renderer).toContain("const cascadeHold");
    expect(renderer).toContain("swapWindowMs + clearLeadMs");
    expect(renderer).toContain("swapWindowMs + MATCH_ANTICIPATE_MS");
    expect(renderer).not.toContain("swapWindowMs + MATCH_IMPACT_MS");
    const session = readFileSync("src/engine/session.ts", "utf8");
    expect(session).toContain("this.busyUntil = now + SWAP_INPUT_LOCK_MS");
    expect(session).not.toContain("132 + result.events.length");
    expect(renderer).toContain("life: megaHero ? 0.28 : burstHero ? 0.23 : 0.18");
    expect(renderer).toContain("const charge =");
    expect(renderer).toContain("branchAngle");
  });
});

describe("match impact VFX", () => {
  it("keeps match resolution crystalline with a localized impact pulse", () => {
    const renderer = readFileSync("src/ui/renderer.ts", "utf8");
    const clearStart = renderer.indexOf('if (fxEvent.kind === "clear")');
    const comboStart = renderer.indexOf('if (fxEvent.kind === "combo")');
    const dieStart = renderer.indexOf("const dieDur = gemDieDuration");
    const burstStart = renderer.indexOf("private burst(");
    const impactStart = renderer.indexOf("private impactSpark(");

    expect(clearStart).toBeGreaterThan(-1);
    expect(comboStart).toBeGreaterThan(clearStart);
    expect(dieStart).toBeGreaterThan(comboStart);
    expect(burstStart).toBeGreaterThan(-1);
    expect(impactStart).toBeGreaterThan(burstStart);
    expect(renderer.slice(clearStart, comboStart)).not.toContain("addShockwave");
    expect(renderer.slice(clearStart, comboStart)).not.toContain("view.flash");
    expect(renderer.slice(comboStart, dieStart)).not.toContain("ringBurst");
    expect(renderer.slice(comboStart, dieStart)).not.toContain("addShockwave");
    expect(renderer.slice(burstStart, impactStart)).not.toContain("socketPulses.push");
    expect(renderer.slice(burstStart, impactStart)).toContain("spawnCrystalShard");
    expect(renderer.slice(burstStart, impactStart)).toContain("spawnParticle");
    expect(renderer.slice(burstStart, impactStart)).toContain("this.addShockwave");
  });
});
