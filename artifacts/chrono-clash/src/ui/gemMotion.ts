import { Intensity } from "../engine/types";

/** Legacy occupancy cap. Live gems now travel; kept for settle epsilon. */
export const LIVE_GEM_MAX_IN_CELL_DROP = 0.16;

export type GemMoveKind = "swap" | "fall";

export const SWAP_PUSH_MS = 72;
export const SWAP_MAGNET_MS = 48;
export const SWAP_TOTAL_MS = SWAP_PUSH_MS + SWAP_MAGNET_MS;
/** Seated pulse after the swap seats, before the crystal breaks. */
export const MATCH_ANTICIPATE_MS = 44;

export function matchImpactDelayMs(reduced = false): number {
  return reduced ? 0 : SWAP_TOTAL_MS + MATCH_ANTICIPATE_MS;
}

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
  const approachDistance = 0.84;
  if (x <= magnetStart) {
    return approachDistance * easeInOutCubic(x / magnetStart);
  }
  const pull = (x - magnetStart) / (1 - magnetStart);
  return approachDistance + (1 - approachDistance) * easeOutCubic(pull);
}

/** Accelerate with gravity, then ease into the socket. No bounce. */
export function easeCrystalFall(t: number): number {
  const x = clamp01(t);
  if (x < 0.55) {
    const u = x / 0.55;
    return 0.72 * u * u;
  }
  const u = (x - 0.55) / 0.45;
  return 0.72 + 0.28 * (1 - (1 - u) * (1 - u) * (1 - u));
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
  // Short hops stay punchy; longer drops add a little travel, then cap so
  // deep refill columns never feel sluggish between cascade waves.
  const base = animation === "low" ? 0.11 : animation === "medium" ? 0.115 : 0.12;
  const perCell = animation === "low" ? 0.022 : animation === "medium" ? 0.024 : 0.025;
  return Math.min(0.22, base + Math.max(0, cells - 1) * perCell);
}

export function gemFallDelay(
  col: number,
  cellsFallen: number,
  animation: Intensity,
  reduced: boolean,
): number {
  if (reduced || animation === "low") return 0;
  const spread = animation === "medium" ? 0.001 : 0.0015;
  const lead = animation === "medium" ? 0.003 : 0.004;
  return Math.min(0.016, lead + col * spread + Math.max(0, cellsFallen) * 0.0005);
}

export function gemDieDuration(animation: Intensity, reduced: boolean): number {
  if (reduced) return 0.055;
  if (animation === "low") return 0.1;
  if (animation === "medium") return 0.11;
  return 0.12;
}

/**
 * Match dissolve juice: snap-punch bloom, then a decisive fade.
 * Uniform scale stays fast; squash/stretch is applied in the renderer.
 */
export function easeCrystalDie(t: number): { scale: number; alpha: number; flash: number } {
  const x = clamp01(t);
  if (x < 0.22) {
    const u = x / 0.22;
    const punch = 1 - (1 - u) * (1 - u);
    return { scale: 1 + 0.2 * punch, alpha: 1, flash: 0.55 + 0.45 * punch };
  }
  const u = (x - 0.22) / 0.78;
  const e = 1 - (1 - u) * (1 - u);
  return { scale: 1.2 * (1 - 0.72 * e), alpha: 1 - e, flash: (1 - e) * 0.9 };
}

/** Match-impact squash: compress into the board, then release into the die bloom. */
export function gemMatchImpactStretch(charge: number, combo = 1): { sx: number; sy: number } {
  const c = clamp01(charge);
  const amp = combo >= 3 ? 1.18 : combo >= 2 ? 1.08 : 1;
  return { sx: 1 + 0.12 * c * amp, sy: 1 - 0.17 * c * amp };
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
  return 1.085;
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
