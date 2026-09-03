import { COLS, Coord, ROWS } from "./types";

export const SWIPE_AXIS_BIAS = 1.08;

export function neighborFromSwipe(
  start: Coord,
  dx: number,
  dy: number,
  minDist: number,
): Coord | null {
  const dist = Math.hypot(dx, dy);
  if (dist < minDist) return null;
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);
  if (adx >= ady * SWIPE_AXIS_BIAS) {
    const c = start.c + (dx > 0 ? 1 : -1);
    if (c < 0 || c >= COLS) return null;
    return { r: start.r, c };
  }
  if (ady >= adx * SWIPE_AXIS_BIAS) {
    const r = start.r + (dy > 0 ? 1 : -1);
    if (r < 0 || r >= ROWS) return null;
    return { r, c: start.c };
  }
  return null;
}

export function clampDrag(dx: number, dy: number, cell: number): { dx: number; dy: number } {
  const limit = cell * 0.92;
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);
  if (adx >= ady) return { dx: Math.max(-limit, Math.min(limit, dx)), dy: 0 };
  return { dx: 0, dy: Math.max(-limit, Math.min(limit, dy)) };
}
