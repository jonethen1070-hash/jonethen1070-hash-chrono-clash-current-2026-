import { Intensity } from "../engine/types";

/** Legacy occupancy cap. Live gems now travel; kept for settle epsilon. */
export const LIVE_GEM_MAX_IN_CELL_DROP = 0.16;

export type GemMoveKind = "swap" | "fall";

export const SWAP_PUSH_MS = 72;
export const SWAP_MAGNET_MS = 48;
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
  // Controlled acceleration into the socket, then a short soft settle.
  if (x < 0.42) {
    const u = x / 0.42;
    return 0.36 * u * u * u;
  }
  const u = (x - 0.42) / 0.58;
  return 0.36 + 0.64 * (1 - (1 - u) * (1 - u) * (1 - u));
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
    if (animation === "low") return 0.14;
    if (animation === "medium") return 0.15;
    return SWAP_TOTAL_MS / 1000;
  }
  // Keep the first cell punchy, then give deeper drops just enough extra
  // travel to read as physical without putting dead time between cascades.
  const base = animation === "low" ? 0.09 : animation === "medium" ? 0.095 : 0.1;
  const perCell = animation === "low" ? 0.035 : animation === "medium" ? 0.038 : 0.04;
  return Math.min(0.28, base + Math.max(0, cells - 1) * perCell);
}

export function gemFallDelay(
  col: number,
  cellsFallen: number,
  animation: Intensity,
  reduced: boolean,
): number {
  if (reduced || animation === "low") return 0;
  const spread = animation === "medium" ? 0.002 : 0.003;
  const lead = animation === "medium" ? 0.006 : 0.008;
  return Math.min(0.045, lead + col * spread + Math.max(0, cellsFallen) * 0.001);
}

export function gemDieDuration(animation: Intensity, reduced: boolean): number {
  if (reduced) return 0.055;
  if (animation === "low") return 0.1;
  if (animation === "medium") return 0.11;
  return 0.12;
}

/**
 * Match dissolve juice: brief energy bloom → controlled dissolve.
 * Uniform scale stays competitive-fast; non-uniform squash/stretch is applied in the renderer.
 */
export function easeCrystalDie(t: number): { scale: number; alpha: number; flash: number } {
  const x = clamp01(t);
  if (x < 0.28) {
    const u = x / 0.28;
    // Bloom crest reads as a bright core pop before the crystal dissolves.
    return { scale: 1 + 0.12 * u, alpha: 1, flash: 0.42 + 0.58 * u };
  }
  const u = (x - 0.28) / 0.72;
  const e = 1 - (1 - u) * (1 - u);
  return { scale: 1.12 * (1 - 0.62 * e), alpha: 1 - e, flash: (1 - e) * 0.86 };
}

/** Match-impact squash: compress into the board, then release into the die bloom. */
export function gemMatchImpactStretch(charge: number): { sx: number; sy: number } {
  const c = clamp01(charge);
  return { sx: 1 + 0.07 * c, sy: 1 - 0.11 * c };
}

/** Drag stretch along velocity — restrained, mobile-readable. */
export function gemDragStretch(vx: number, vy: number): { sx: number; sy: number; angle: number } {
  const speed = Math.hypot(vx, vy);
  if (speed < 40) return { sx: 1, sy: 1, angle: 0 };
  const amount = Math.min(0.11, (speed - 40) / 1600);
  return {
    sx: 1 + amount,
    sy: 1 - amount * 0.55,
    angle: Math.atan2(vy, vx),
  };
}

/** Select / press settle: tiny scale-up then ease back via tile.scale spring. */
export function gemSelectPop(): number {
  return 1.045;
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
