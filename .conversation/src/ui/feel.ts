import { Intensity } from "../engine/types";
export type { FeelKind, HapticEvent } from "./haptics";
export { hapticPattern, gameplayHapticArmed } from "./haptics";

export function scoreTickerRate(animation: Intensity, reducedMotion: boolean): number {
  if (reducedMotion) return 1;
  if (animation === "low") return 0.72;
  if (animation === "medium") return 0.28;
  return 0.13;
}

export function comboBurstClass(combo: number): "mid" | "big" | "epic" | "mega" {
  if (combo >= 8) return "mega";
  if (combo >= 6) return "epic";
  if (combo >= 4) return "big";
  return "mid";
}

export function resultHeadline(outcome: string): string {
  if (outcome === "win") return "VICTORY";
  if (outcome === "loss") return "DEFEATED";
  return "DRAW";
}

export function particleBudget(quality: Intensity, reducedMotion: boolean): number {
  if (reducedMotion || quality === "low") return 0;
  if (quality === "medium") return 4;
  return 8;
}

export function feelMul(quality: Intensity, reducedMotion: boolean): number {
  if (reducedMotion) return 0.12;
  if (quality === "low") return 0.22;
  if (quality === "medium") return 0.55;
  return 1;
}
