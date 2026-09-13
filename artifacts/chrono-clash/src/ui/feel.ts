import { Intensity } from "../engine/types";
export type { FeelKind, HapticEvent } from "./haptics";
export { hapticPattern, gameplayHapticArmed } from "./haptics";

export type RewardTier = "match" | "largeMatch" | "cascade" | "jackpot" | "power";

/** Readable reward ladder: match < large match < cascade x2 < jackpot x3+ < power. */
export function rewardTier(combo = 1, cleared = 0): RewardTier {
  if (combo >= 3) return "jackpot";
  if (combo >= 2) return "cascade";
  if (cleared >= 5) return "largeMatch";
  return "match";
}

export function scoreTickerRate(animation: Intensity, reducedMotion: boolean): number {
  if (reducedMotion) return 1;
  if (animation === "low") return 0.8;
  if (animation === "medium") return 0.5;
  return 0.42;
}

export function comboBurstClass(combo: number): "mid" | "big" | "epic" | "mega" {
  if (combo >= 5) return "mega";
  if (combo >= 3) return "epic";
  if (combo >= 2) return "big";
  return "mid";
}

export function rewardScoreFloat(
  combo: number,
  pts: number,
  isPlayer: boolean,
): { color: string; size: number; rise: number; life: number } {
  const tier = rewardTier(combo);
  const jackpot = tier === "jackpot";
  const cascade = tier === "cascade";
  return {
    color: jackpot
      ? isPlayer
        ? "#EAFBFF"
        : "#FFD6E2"
      : cascade
        ? isPlayer
          ? "#C8F6FF"
          : "#FFD6E2"
        : "#F3FAFF",
    size: 14 + (jackpot ? 9 : cascade ? 5 : 2) + Math.min(12, Math.log10(pts + 12) * 5),
    rise: 24 + (jackpot ? 16 : cascade ? 9 : 4) + Math.min(14, pts / 90),
    life: 640 + (jackpot ? 200 : cascade ? 100 : 40),
  };
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
