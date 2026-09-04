import { Intensity } from "../engine/types";

/** Legacy occupancy cap. Live gems now travel; kept for settle epsilon. */
export const LIVE_GEM_MAX_IN_CELL_DROP = 0.16;

export type GemMoveKind = "swap" | "fall";

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
  return kind === "swap" ? easeInOutCubic(t) : easeCrystalFall(t);
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
    if (animation === "low") return 0.11;
    if (animation === "medium") return 0.115;
    return 0.125;
  }
  const base = animation === "low" ? 0.078 : animation === "medium" ? 0.09 : 0.1;
  return Math.min(0.16, base + Math.max(0, cells - 1) * 0.024);
}

export function gemFallDelay(
  col: number,
  cellsFallen: number,
  animation: Intensity,
  reduced: boolean,
): number {
  if (reduced || animation === "low") return 0;
  const spread = animation === "medium" ? 0.007 : 0.01;
  return Math.min(0.042, col * spread + Math.max(0, cellsFallen) * 0.003);
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
