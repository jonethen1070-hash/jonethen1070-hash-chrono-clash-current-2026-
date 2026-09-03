import { ATTACK_MAX, MatchShape } from "./types";

export function comboLine(peak: number): string {
  return `COMBO x${Math.max(1, peak)}`;
}

export function comboFlavor(peak: number): string {
  if (peak >= 8) return "MEGA COMBO";
  if (peak >= 7) return "UNSTOPPABLE!";
  if (peak >= 6) return "PERFECT!";
  if (peak >= 5) return "AMAZING!";
  if (peak >= 4) return "GREAT!";
  if (peak === 3) return "NICE!";
  if (peak === 2) return "COMBO x2";
  return comboLine(peak);
}

export function comboBurstText(peak: number): string {
  if (peak >= 8) return `COMBO x${peak}\nMEGA COMBO`;
  const flavor = comboFlavor(peak);
  if (peak >= 3) return `COMBO x${peak}\n${flavor}`;
  return flavor;
}

export function attackBanner(peak: number): string {
  if (peak >= 6) return "MASSIVE HIT!";
  if (peak >= 4) return "CRITICAL!";
  return "ATTACK!";
}

export function attackCharge(combo: number, cleared: number): number {
  if (combo <= 1) return Math.min(8, Math.max(0, Math.round(cleared * 0.35)));
  return 12 + combo * 10 + (combo >= 4 ? 18 : 0) + Math.min(12, Math.floor(cleared / 3));
}

export function fillAttack(current: number, combo: number, cleared: number): { meter: number; fired: boolean } {
  const next = Math.min(ATTACK_MAX * 2, current + attackCharge(combo, cleared));
  if (next >= ATTACK_MAX) {
    return { meter: next - ATTACK_MAX, fired: true };
  }
  return { meter: next, fired: false };
}

export function shapeBonus(shape: MatchShape | undefined): number {
  if (shape === "five") return 90;
  if (shape === "tee") return 70;
  if (shape === "four") return 40;
  return 0;
}

export function clampScoreTarget(value: number, fallback = 5000): number {
  if (value === 3000 || value === 5000 || value === 8000 || value === 10000) return value;
  return fallback;
}
