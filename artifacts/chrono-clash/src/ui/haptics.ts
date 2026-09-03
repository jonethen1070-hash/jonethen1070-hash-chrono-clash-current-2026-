import { BattleFx } from "../audio/events";

export type HapticEvent =
  | "tap"
  | "swap"
  | "invalid"
  | "match"
  | "combo"
  | "power"
  | "freeze"
  | "timeshift"
  | "rewind"
  | "countdown"
  | "start"
  | "incoming"
  | "attack"
  | "attackHit"
  | "block"
  | "urgent"
  | "victory"
  | "defeat"
  | "draw";

/** @deprecated alias kept so Phase 5 call sites keep compiling */
export type FeelKind = HapticEvent;

export interface HapticCue {
  kind: HapticEvent;
  combo?: number;
  delayMs?: number;
}

const PRIORITY: Record<HapticEvent, number> = {
  tap: 1,
  invalid: 1,
  swap: 2,
  match: 3,
  countdown: 3,
  combo: 4,
  block: 5,
  incoming: 6,
  urgent: 6,
  power: 7,
  freeze: 7,
  timeshift: 7,
  rewind: 7,
  attack: 8,
  start: 8,
  attackHit: 9,
  draw: 9,
  victory: 10,
  defeat: 10,
};

function vibrateApi(): ((pattern: number | number[]) => boolean) | null {
  if (typeof navigator === "undefined") return null;
  const fn = navigator.vibrate?.bind(navigator);
  return typeof fn === "function" ? fn : null;
}

export function hapticSupported(): boolean {
  return vibrateApi() !== null;
}

export function hapticPattern(kind: HapticEvent, combo = 1): number | number[] {
  if (kind === "tap") return 12;
  if (kind === "invalid") return [10, 20, 14];
  if (kind === "swap") return 12;
  if (kind === "match") return 20;
  if (kind === "countdown") return 40;
  if (kind === "combo") {
    if (combo >= 8) return 62;
    if (combo >= 6) return 50;
    if (combo >= 4) return 42;
    return 32;
  }
  if (kind === "power") return 58;
  if (kind === "freeze") return 24;
  if (kind === "timeshift") return 28;
  if (kind === "rewind") return 30;
  if (kind === "incoming") return 28;
  if (kind === "attack") return 40;
  if (kind === "attackHit") return 48;
  if (kind === "start") return [50, 36, 110];
  if (kind === "block") return 24;
  if (kind === "urgent") return combo >= 2 ? 42 : 32;
  if (kind === "victory") return [24, 28, 44];
  if (kind === "defeat") return 30;
  if (kind === "draw") return 42;
  return 22;
}

export function hapticThrottleMs(kind: HapticEvent): number {
  if (kind === "tap" || kind === "swap" || kind === "invalid") return 100;
  if (kind === "match" || kind === "countdown") return 180;
  if (kind === "combo") return 260;
  if (kind === "incoming") return 360;
  if (kind === "urgent") return 900;
  if (kind === "victory" || kind === "defeat" || kind === "draw" || kind === "start") return 800;
  if (kind === "freeze" || kind === "timeshift" || kind === "rewind" || kind === "power") return 420;
  return 320;
}

/** Gameplay haptics follow the Haptics setting only — independent of announcer/SFX. */
export function gameplayHapticArmed(_announcer: boolean, _sfx: boolean, haptics: boolean): boolean {
  return haptics;
}

export function attackBoltDelayMs(text: string): number {
  return /FINAL|FINALE/i.test(text) ? 720 : 420;
}

export function hapticCuesFromFx(fx: BattleFx): HapticCue[] {
  if (fx.kind === "clear" && fx.side !== "opponent" && (fx.combo ?? 1) < 2) {
    return [{ kind: "match" }];
  }
  if (fx.kind === "combo" && fx.side !== "opponent" && (fx.combo ?? 0) >= 2) {
    return [{ kind: "combo", combo: fx.combo }];
  }
  if (fx.kind === "power") {
    if (/RIVAL/i.test(fx.text)) return [{ kind: "block" }];
    const t = fx.text.toUpperCase();
    if (t.includes("FREEZE")) return [{ kind: "freeze" }];
    if (t.includes("TIME") || t.includes("TEMPO") || t.includes("SHIFT")) return [{ kind: "timeshift" }];
    if (t.includes("ENERGY BURST") || t.includes("MEGA STRIKE")) return [{ kind: "power" }];
    return [];
  }
  if (fx.kind === "rewind") return [{ kind: "rewind" }];
  if (fx.kind === "attack") {
    return [];
  }
  if (fx.kind === "urgent") {
    return [{ kind: "urgent", combo: /FINAL|TIME/i.test(fx.text) ? 2 : 1 }];
  }
  if (fx.kind === "finale") {
    if (fx.text === "VICTORY") return [{ kind: "victory" }];
    if (fx.text === "DEFEAT") return [{ kind: "defeat" }];
    if (fx.text === "DRAW") return [{ kind: "draw" }];
  }
  if (fx.kind === "countdown") {
    return [{ kind: fx.text === "CLASH!" ? "start" : "countdown" }];
  }
  return [];
}

type VibrateFn = (pattern: number | number[]) => boolean;

export class HapticBus {
  enabled = true;
  private lastAt = 0;
  private lastKind: HapticEvent | "" = "";
  private pending = new Set<ReturnType<typeof setTimeout>>();
  private vibrate: VibrateFn | null;
  private resultPlayed = false;

  constructor(vibrate: VibrateFn | null = vibrateApi()) {
    this.vibrate = vibrate;
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!on) this.cancel();
  }

  play(kind: HapticEvent, combo = 1, now = typeof performance !== "undefined" ? performance.now() : 0): boolean {
    if (!this.enabled) return false;
    if (!this.vibrate) return false;
    if (kind === "start" || kind === "countdown") this.resultPlayed = false;
    if (kind === "victory" || kind === "defeat" || kind === "draw") {
      if (this.resultPlayed) return false;
      this.resultPlayed = true;
      this.clearPending();
    }
    const gap = hapticThrottleMs(kind);
    const allowInterrupt = PRIORITY[kind] > (this.lastKind ? PRIORITY[this.lastKind] : 0);
    const minGap = allowInterrupt ? 0 : gap;
    if (this.lastAt && now - this.lastAt < minGap) return false;
    this.lastAt = now;
    this.lastKind = kind;
    try {
      this.vibrate(hapticPattern(kind, combo));
      return true;
    } catch {
      return false;
    }
  }

  playDelayed(kind: HapticEvent, delayMs: number, combo = 1): void {
    if (!this.enabled || delayMs <= 0) {
      this.play(kind, combo);
      return;
    }
    if (this.pending.size >= 4) return;
    const id = setTimeout(() => {
      this.pending.delete(id);
      this.play(kind, combo);
    }, delayMs);
    this.pending.add(id);
  }

  dispatch(cues: HapticCue[], now?: number): void {
    for (const cue of cues) {
      if (cue.delayMs && cue.delayMs > 0) this.playDelayed(cue.kind, cue.delayMs, cue.combo ?? 1);
      else this.defer(cue.kind, cue.combo ?? 1, now);
    }
  }

  private clearPending(): void {
    for (const id of this.pending) clearTimeout(id);
    this.pending.clear();
  }

  /** Queue a vibration outside the animation-frame call stack. */
  defer(kind: HapticEvent, combo = 1, _now?: number): void {
    if (!this.enabled || this.pending.size >= 4) return;
    const id = setTimeout(() => {
      this.pending.delete(id);
      this.play(kind, combo);
    }, 0);
    this.pending.add(id);
  }

  cancel(): void {
    this.clearPending();
    try {
      this.vibrate?.(0);
    } catch {
      /* ignore unsupported vibrate(0) */
    }
  }
}
