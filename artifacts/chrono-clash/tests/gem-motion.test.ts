import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BOARD_GAP, liveGemDrawOrigin } from "../src/ui/renderer";
import {
  easeCrystalDie,
  easeCrystalFall,
  easeInOutCubic,
  easeOutCubic,
  gemFallDelay,
  gemTravelDuration,
  gemTravelEase,
} from "../src/ui/gemMotion";
import { COLS, INVALID_RETURN_MS, ROWS } from "../src/engine/types";

describe("crystal gem motion curves", () => {
  it("eases swaps and falls from rest to the target without overshoot", () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5);
    expect(gemTravelEase("swap", 0.125)).toBeGreaterThan(0.3);
    expect(easeCrystalFall(0)).toBe(0);
    expect(easeCrystalFall(1)).toBeCloseTo(1, 5);
    expect(easeCrystalFall(0.2)).toBeLessThan(0.2);
    expect(easeInOutCubic(0.25)).toBeLessThan(0.25);
    expect(easeInOutCubic(0.75)).toBeGreaterThan(0.75);
    expect(gemTravelEase("swap", 0.5)).toBe(easeOutCubic(0.5));
    expect(gemTravelEase("fall", 0.5)).toBe(easeCrystalFall(0.5));
  });

  it("keeps swaps tactile, fast, and staggers cascade columns", () => {
    const swap = gemTravelDuration(40, 40, "swap", "high", false);
    const fallFar = gemTravelDuration(40 * 5, 40, "fall", "high", false);
    expect(swap).toBeGreaterThanOrEqual(0.11);
    expect(swap).toBeLessThanOrEqual(0.14);
    expect(fallFar).toBeLessThan(0.18);
    expect(fallFar).toBeGreaterThan(swap);
    expect(gemFallDelay(0, 3, "high", false)).toBeLessThan(gemFallDelay(7, 3, "high", false));
    expect(gemFallDelay(3, 2, "high", true)).toBe(0);
    expect(INVALID_RETURN_MS).toBeGreaterThanOrEqual(100);
    expect(INVALID_RETURN_MS).toBeLessThanOrEqual(130);
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
  });
});
