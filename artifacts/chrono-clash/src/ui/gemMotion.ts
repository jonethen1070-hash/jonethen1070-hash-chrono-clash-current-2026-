import { Intensity } from "../engine/types";

/** Legacy occupancy cap. Live gems now travel; kept for settle epsilon. */
export const LIVE_GEM_MAX_IN_CELL_DROP = 0.16;

export type GemMoveKind = "swap" | "fall";

export const SWAP_PUSH_MS = 120;
export const SWAP_MAGNET_MS = 80;
export const SWAP_TOTAL_MS = SWAP_PUSH_MS + SWAP_MAGNET_MS;

export function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

export function easeOutCubic(t: number): number {
  const x = clamp01(t);
  return 1 - (1 - x) * (1 - x) * (1 - x);
}

export function easeInOutCubic(t: number): number {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

export function easeInOutSine(t: number): number {
  const x = clamp01(t);
  if (x === 0) return 0;
  return -(Math.cos(Math.PI * x) - 1) / 2;
}

/**
 * Continuous travel with a short precision pull:
 * - the first 86% of distance uses a restrained cubic approach,
 * - the final 14% uses the dedicated magnetic socket phase.
 */
export function easeMagneticSwap(t: number): number {
  const x = clamp01(t);
  const magnetStart = SWAP_PUSH_MS / SWAP_TOTAL_MS;
  const approachDistance = 0.86;
  if (x <= magnetStart) {
    return approachDistance * easeInOutCubic(x / magnetStart);
  }
  const pull = (x - magnetStart) / (1 - magnetStart);
  return approachDistance + (1 - approachDistance) * easeOutCubic(pull);
}

/** Accelerate then settle into the well. No bounce, no linear slot-drop. */
export function easeCrystalFall(t: number): number {
  const x = clamp01(t);
  if (x < 0.4) {
    const u = x / 0.4;
    return 0.34 * u * u;
  }
  const u = (x - 0.4) / 0.6;
  return 0.34 + 0.66 * (1 - (1 - u) * (1 - u) * (1 - u));
}

export function gemTravelEase(kind: GemMoveKind, t: number): number {
  return kind === "swap" ? easeMagneticSwap(t) : easeCrystalFall(t);
}

export function gemTravelDuration(
  dist: number,
  cell: number,
  kind: GemMoveKind,
  animation: Intensity,
  reduced: boolean,
): number {
  if (reduced) return kind === "swap" ? 0.06 : 0.058;
  const cells = Math.max(0.4, dist / Math.max(cell, 1));
  if (kind === "swap") {
    if (animation === "low") return 0.18;
    if (animation === "medium") return 0.2;
    return SWAP_TOTAL_MS / 1000;
  }
  // Keep a one-cell drop quick enough to read as responsive while preserving
  // progressively longer travel for deeper cascades.
  const base = animation === "low" ? 0.2 : animation === "medium" ? 0.21 : 0.22;
  const perCell = animation === "low" ? 0.07 : animation === "medium" ? 0.075 : 0.08;
  return Math.min(0.6, base + Math.max(0, cells - 1) * perCell);
}

export function gemFallDelay(
  col: number,
  cellsFallen: number,
  animation: Intensity,
  reduced: boolean,
): number {
  if (reduced || animation === "low") return 0;
  const spread = animation === "medium" ? 0.007 : 0.01;
  const readablePause = animation === "medium" ? 0.058 : 0.064;
  return Math.min(0.11, readablePause + col * spread + Math.max(0, cellsFallen) * 0.003);
}

export function gemDieDuration(animation: Intensity, reduced: boolean): number {
  if (reduced) return 0.055;
  if (animation === "low") return 0.09;
  if (animation === "medium") return 0.115;
  return 0.132;
}

/** Energy bloom, then a short crystal dissolve. Fast enough for competitive play. */
export function easeCrystalDie(t: number): { scale: number; alpha: number; flash: number } {
  const x = clamp01(t);
  if (x < 0.28) {
    const u = x / 0.28;
    return { scale: 1 + 0.1 * u, alpha: 1, flash: 0.38 + 0.62 * u };
  }
  const u = (x - 0.28) / 0.72;
  const e = 1 - (1 - u) * (1 - u);
  return { scale: 1.1 * (1 - 0.6 * e), alpha: 1 - e, flash: (1 - e) * 0.82 };
}

/**
 * Draw gems at their interpolated travel pose. Dying gems keep a free overlay path.
 * Drag/wobble are applied on top of the visual position, not the rest cell.
 */
export function liveGemDrawOrigin(
  restX: number,
  restY: number,
  tileX: number,
  tileY: number,
  cell: number,
  dying: boolean,
  dragDx = 0,
  dragDy = 0,
  wobble = 0,
  settleDx = 0,
  settleDy = 0,
): { x: number; y: number } {
  if (dying) return { x: tileX + wobble, y: tileY };
  void restX;
  void restY;
  void cell;
  return { x: tileX + wobble + dragDx + settleDx, y: tileY + dragDy + settleDy };
}
