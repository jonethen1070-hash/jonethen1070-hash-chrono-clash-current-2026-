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
  gemTravelDuration,
  gemTravelEase,
  SWAP_MAGNET_MS,
  SWAP_PUSH_MS,
  SWAP_TOTAL_MS,
} from "../src/ui/gemMotion";
import { COLS, INVALID_RETURN_MS, ROWS } from "../src/engine/types";
import { cloneBoard, createSeededRng, findMatches, makePiece, resetIds, trySwap } from "../src/engine/board";

const THREE_ROW_CASCADE_FIXTURE = [
  [4, 1, 4, 6, 6, 2, 4, 5],
  [3, 6, 3, 3, 1, 3, 2, 1],
  [3, 1, 3, 5, 2, 2, 1, 3],
  [4, 5, 2, 2, 4, 4, 5, 2],
  [5, 3, 5, 6, 2, 5, 1, 2],
  [3, 2, 1, 5, 4, 1, 2, 1],
  [4, 6, 2, 6, 5, 3, 2, 5],
  [6, 6, 5, 6, 6, 1, 1, 6],
] as const;

function cascadeFixture() {
  resetIds();
  return THREE_ROW_CASCADE_FIXTURE.map((row) => row.map((color) => makePiece(color)));
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
    expect(SWAP_PUSH_MS).toBe(120);
    expect(SWAP_MAGNET_MS).toBe(80);
    expect(SWAP_TOTAL_MS).toBe(200);
    expect(swap).toBe(0.2);
    expect(fallOne).toBeCloseTo(0.22, 5);
    expect(fallThree).toBeGreaterThan(fallOne);
    expect(fallFar).toBeGreaterThan(fallThree);
    expect(fallThree).toBeCloseTo(0.38, 5);
    expect(fallFar).toBeCloseTo(0.56, 5);
    expect(gemTravelDuration(40 * 4, 40, "fall", "high", false)).toBeCloseTo(0.46, 5);
    expect(gemTravelDuration(40 * 8, 40, "fall", "high", false)).toBe(0.6);
    expect(fallFar).toBeGreaterThan(swap);
    expect(gemFallDelay(0, 3, "high", false)).toBeLessThan(gemFallDelay(7, 3, "high", false));
    expect(gemFallDelay(3, 2, "high", true)).toBe(0);
    expect(INVALID_RETURN_MS).toBe(160);
  });

  it("blooms then dissolves matched crystals instead of popping them", () => {
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

describe("landing feedback", () => {
  it("keeps landing feedback renderer-owned and localized", () => {
    const renderer = readFileSync("src/ui/renderer.ts", "utf8");
    expect(renderer).toContain("takeLandingImpacts");
    expect(renderer).toContain("drawSocketPulses");
    expect(renderer).toContain("life: 64");
    expect(renderer).toContain("x: tile.toX + cell / 2");
    expect(renderer).toContain("const lift = sel ? 1.026 : 1");
    expect(renderer).toContain("tile.scale = Math.max(tile.scale, 1.035)");
    expect(renderer).toContain("tile.settleDur = 0.052");
    expect(renderer).toContain("tile.scale = 0.985");
    expect(renderer).toContain("tile.scale = 1.015");
    expect(renderer).toContain("primeSwapPose");
    expect(renderer).toContain("life: 64");
    expect(renderer).toContain("const MATCH_IMPACT_MS = 80");
    expect(renderer).toContain("const MATCH_STAGGER_STEP_MS = 7");
    expect(renderer).toContain("const cascadeHold");
    expect(renderer).toContain("life: 0.13");
    expect(renderer).toContain("const charge =");
    expect(renderer).toContain("branchAngle");
  });
});

describe("match impact VFX", () => {
  it("keeps match resolution crystalline without circular ripple calls", () => {
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
    expect(renderer.slice(burstStart, impactStart)).not.toContain("addShockwave");
    expect(renderer.slice(burstStart, impactStart)).not.toContain("socketPulses.push");
    expect(renderer.slice(burstStart, impactStart)).toContain("spawnCrystalShard");
    expect(renderer.slice(burstStart, impactStart)).toContain("spawnParticle");
  });
});
