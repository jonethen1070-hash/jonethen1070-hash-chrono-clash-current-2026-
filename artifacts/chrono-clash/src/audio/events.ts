import { AudioBus } from "./bus";

export type BattleCue =
  | "tileSwap"
  | "match"
  | "matchWave"
  | "cascade"
  | "combo"
  | "bigCombo"
  | "powerUse"
  | "attack"
  | "rivalAttack"
  | "freeze"
  | "timeShift"
  | "rewind"
  | "finalSeconds"
  | "victory"
  | "defeat"
  | "draw";

function attackImpactDelayMs(text: string): number {
  return /FINAL|FINALE/i.test(text) ? 720 : 420;
}

export interface BattleFx {
  kind: string;
  text: string;
  combo?: number;
  side?: string;
}

/** Local gem match / break / clear / cascade on a board. Not combat, UI, or music. */
export function isBoardDestroyFx(fx: BattleFx): boolean {
  return fx.kind === "clear" || fx.kind === "combo";
}

export function isRivalBoardFx(fx: BattleFx): boolean {
  return fx.side === "opponent" && isBoardDestroyFx(fx);
}

export function isPlayerBoardFx(fx: BattleFx): boolean {
  return fx.side !== "opponent" && isBoardDestroyFx(fx);
}

/** First-wave shatter, then cascade cues. Combo banners must not fire a second shatter. */
export function playerBoardDestroyCue(fx: BattleFx): BattleCue | null {
  if (isRivalBoardFx(fx)) return null;
  if (fx.kind !== "clear" || fx.side === "opponent") return null;
  return (fx.combo ?? 1) >= 2 ? "cascade" : "matchWave";
}

export function battleCuesFromFx(fx: BattleFx): BattleCue[] {
  if (isBoardDestroyFx(fx)) {
    const cue = playerBoardDestroyCue(fx);
    return cue ? [cue] : [];
  }
  if (fx.kind === "attack") {
    if (fx.text === "FINAL STRIKE" || fx.text === "RIVAL FINALE") return [];
    return fx.side === "opponent" ? ["rivalAttack"] : ["attack"];
  }
  if (fx.kind === "power") {
    const t = fx.text.toUpperCase();
    if (t.includes("FREEZE")) return ["freeze"];
    if (t.includes("TIME") || t.includes("TEMPO") || t.includes("SHIFT")) return ["timeShift"];
    return ["powerUse"];
  }
  if (fx.kind === "rewind") return ["rewind"];
  if (fx.kind === "urgent" && fx.text.includes("FINAL")) return ["finalSeconds"];
  if (fx.kind === "finale") {
    if (fx.text === "VICTORY") return ["victory"];
    if (fx.text === "DEFEAT") return ["defeat"];
    if (fx.text === "DRAW") return ["draw"];
  }
  return [];
}

export function playBattleCues(bus: AudioBus, fx: BattleFx, combo?: number, delayMs = 0): void {
  const peak = combo ?? fx.combo ?? 1;
  for (const cue of battleCuesFromFx(fx)) {
    if (delayMs > 0 && cue === "matchWave") {
      bus.playMatchWaveLater(peak, delayMs);
      continue;
    }
    if (delayMs > 0 && (cue === "cascade" || cue === "combo" || cue === "bigCombo")) {
      bus.playLater(cue === "bigCombo" ? "highcombo" : "combo", delayMs, peak);
      continue;
    }
    playBattleCue(bus, cue, peak, fx.text);
  }
}

export function playBattleCue(bus: AudioBus, cue: BattleCue, combo = 1, text = ""): void {
  switch (cue) {
    case "tileSwap":
      bus.play("swap");
      break;
    case "match":
      bus.play("match", combo);
      break;
    case "matchWave":
      bus.playMatchWave(combo);
      break;
    case "cascade":
      bus.play("combo", combo);
      break;
    case "combo":
      bus.play("combo", combo);
      break;
    case "bigCombo":
      bus.play("highcombo", combo);
      break;
    case "powerUse":
      bus.play("power");
      break;
    case "attack":
      bus.play("launch");
      bus.playLater("impact", attackImpactDelayMs(text));
      break;
    case "rivalAttack":
      bus.play("incoming");
      bus.playLater("impact", attackImpactDelayMs(text));
      break;
    case "freeze":
      bus.play("freeze");
      break;
    case "timeShift":
      bus.play("timeshift");
      break;
    case "rewind":
      bus.play("rewind");
      break;
    case "finalSeconds":
      bus.play("critical");
      break;
    case "victory":
      bus.playFinale("win");
      break;
    case "defeat":
      bus.playFinale("lose");
      break;
    case "draw":
      bus.playFinale("draw");
      break;
  }
}
