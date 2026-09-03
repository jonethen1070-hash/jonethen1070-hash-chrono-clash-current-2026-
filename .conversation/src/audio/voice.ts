/**
 * Central announcer catalog.
 *
 * Gameplay code talks in VoiceLineId only. Production VO can be dropped in later
 * by adding files under /voice and listing them in public/voice/manifest.json:
 *
 *   { "combo": "combo.ogg", "victory": "victory.ogg" }
 *
 * Missing assets fall back to the built-in cinematic shout (not speechSynthesis).
 */

export type VoiceLineId =
  | "locked"
  | "combo"
  | "ultimate"
  | "nice"
  | "double_combo"
  | "triple"
  | "four_combo"
  | "amazing"
  | "perfect"
  | "unstoppable"
  | "legendary"
  | "attack"
  | "critical"
  | "massive_hit"
  | "danger"
  | "final_seconds"
  | "freeze"
  | "timeshift"
  | "rewind"
  | "ready"
  | "fight"
  | "time"
  | "victory"
  | "defeat"
  | "draw";

export type VoiceIntensity = "subtle" | "energetic" | "powerful" | "dramatic" | "urgent" | "triumphant";

export interface VoiceLine {
  id: VoiceLineId;
  text: string;
  priority: number;
  intensity: VoiceIntensity;
  durationMs: number;
  cooldownMs: number;
  haptic: number | number[];
}

export const ATTACK_FLIGHT_MS = 430;

export const VOICE: Record<VoiceLineId, VoiceLine> = {
  locked: {
    id: "locked",
    text: "LOCKED.",
    priority: 46,
    intensity: "subtle",
    durationMs: 460,
    cooldownMs: 2200,
    haptic: 18,
  },
  combo: {
    id: "combo",
    text: "COMBO!",
    priority: 20,
    intensity: "energetic",
    durationMs: 420,
    cooldownMs: 3800,
    haptic: 16,
  },
  ultimate: {
    id: "ultimate",
    text: "ULTIMATE!",
    priority: 72,
    intensity: "powerful",
    durationMs: 480,
    cooldownMs: 2400,
    haptic: [24, 40, 36],
  },
  nice: {
    id: "nice",
    text: "NICE!",
    priority: 28,
    intensity: "energetic",
    durationMs: 420,
    cooldownMs: 2400,
    haptic: [14, 32, 22],
  },
  double_combo: {
    id: "double_combo",
    text: "GREAT!",
    priority: 32,
    intensity: "energetic",
    durationMs: 520,
    cooldownMs: 2200,
    haptic: [18, 40, 28],
  },
  triple: {
    id: "triple",
    text: "GREAT!",
    priority: 40,
    intensity: "powerful",
    durationMs: 380,
    cooldownMs: 1800,
    haptic: [22, 40, 36],
  },
  four_combo: {
    id: "four_combo",
    text: "PERFECT!",
    priority: 48,
    intensity: "powerful",
    durationMs: 390,
    cooldownMs: 1600,
    haptic: [24, 45, 40],
  },
  amazing: {
    id: "amazing",
    text: "AMAZING!",
    priority: 54,
    intensity: "powerful",
    durationMs: 380,
    cooldownMs: 1500,
    haptic: [24, 42, 36],
  },
  perfect: {
    id: "perfect",
    text: "PERFECT!",
    priority: 60,
    intensity: "dramatic",
    durationMs: 640,
    cooldownMs: 1400,
    haptic: [28, 48, 40, 70],
  },
  unstoppable: {
    id: "unstoppable",
    text: "UNSTOPPABLE!",
    priority: 62,
    intensity: "dramatic",
    durationMs: 720,
    cooldownMs: 1400,
    haptic: [30, 50, 40, 70],
  },
  legendary: {
    id: "legendary",
    text: "DOMINATING!",
    priority: 74,
    intensity: "dramatic",
    durationMs: 820,
    cooldownMs: 1200,
    haptic: [35, 55, 45, 90],
  },
  attack: {
    id: "attack",
    text: "ATTACK!",
    priority: 28,
    intensity: "energetic",
    durationMs: 380,
    cooldownMs: 2600,
    haptic: 22,
  },
  critical: {
    id: "critical",
    text: "CRITICAL!",
    priority: 58,
    intensity: "powerful",
    durationMs: 520,
    cooldownMs: 1600,
    haptic: [28, 50, 42],
  },
  massive_hit: {
    id: "massive_hit",
    text: "MASSIVE HIT!",
    priority: 68,
    intensity: "dramatic",
    durationMs: 640,
    cooldownMs: 1400,
    haptic: [32, 55, 50, 80],
  },
  danger: {
    id: "danger",
    text: "DANGER!",
    priority: 80,
    intensity: "urgent",
    durationMs: 560,
    cooldownMs: 12_000,
    haptic: [16, 40, 16, 50],
  },
  final_seconds: {
    id: "final_seconds",
    text: "FINAL SECONDS!",
    priority: 88,
    intensity: "urgent",
    durationMs: 700,
    cooldownMs: 20_000,
    haptic: [20, 40, 20, 60],
  },
  freeze: {
    id: "freeze",
    text: "FREEZE!",
    priority: 50,
    intensity: "powerful",
    durationMs: 480,
    cooldownMs: 800,
    haptic: 40,
  },
  timeshift: {
    id: "timeshift",
    text: "TIME SHIFT!",
    priority: 50,
    intensity: "powerful",
    durationMs: 560,
    cooldownMs: 800,
    haptic: 28,
  },
  rewind: {
    id: "rewind",
    text: "REWIND!",
    priority: 50,
    intensity: "powerful",
    durationMs: 500,
    cooldownMs: 800,
    haptic: 28,
  },
  ready: {
    id: "ready",
    text: "READY!",
    priority: 84,
    intensity: "subtle",
    durationMs: 480,
    cooldownMs: 400,
    haptic: 12,
  },
  fight: {
    id: "fight",
    text: "FIGHT!",
    priority: 90,
    intensity: "energetic",
    durationMs: 520,
    cooldownMs: 400,
    haptic: 24,
  },
  time: {
    id: "time",
    text: "TIME!",
    priority: 92,
    intensity: "urgent",
    durationMs: 420,
    cooldownMs: 400,
    haptic: 30,
  },
  victory: {
    id: "victory",
    text: "VICTORY!",
    priority: 100,
    intensity: "triumphant",
    durationMs: 900,
    cooldownMs: 400,
    haptic: [20, 40, 20, 80],
  },
  defeat: {
    id: "defeat",
    text: "DEFEAT!",
    priority: 100,
    intensity: "dramatic",
    durationMs: 820,
    cooldownMs: 400,
    haptic: [40, 80],
  },
  draw: {
    id: "draw",
    text: "DRAW!",
    priority: 96,
    intensity: "powerful",
    durationMs: 640,
    cooldownMs: 400,
    haptic: 24,
  },
};

export interface VoiceState {
  current: VoiceLineId | null;
  until: number;
  queued: VoiceLineId | null;
  lastAt: Partial<Record<VoiceLineId, number>>;
  lastComboAt: number;
}

export function freshVoiceState(): VoiceState {
  return { current: null, until: 0, queued: null, lastAt: {}, lastComboAt: -99999 };
}

export type VoiceAction = "play" | "interrupt" | "queue" | "drop";

const FINALE: VoiceLineId[] = ["victory", "defeat", "draw"];

export const ANNOUNCER_HOOKS = [
  "LOCKED.",
  "COMBO!",
  "ULTIMATE!",
  "NICE!",
  "GREAT!",
  "PERFECT!",
  "AMAZING!",
  "DANGER!",
  "FREEZE!",
  "TIME SHIFT!",
  "REWIND!",
  "FINAL SECONDS!",
  "VICTORY!",
  "DEFEAT!",
] as const;

export function comboCall(peak: number): VoiceLineId | null {
  if (peak < 2) return null;
  return "combo";
}

export function attackCall(peak: number): VoiceLineId | null {
  if (peak < 2) return null;
  if (peak <= 3) return "attack";
  if (peak <= 5) return "critical";
  return "massive_hit";
}

export function outcomeCall(outcome: "win" | "loss" | "tie"): VoiceLineId {
  if (outcome === "win") return "victory";
  if (outcome === "loss") return "defeat";
  return "draw";
}

export function powerCall(text: string): VoiceLineId | null {
  const t = text.toUpperCase();
  if (t.includes("RIVAL")) return "locked";
  if (t.includes("FREEZE")) return "freeze";
  if (t.includes("TIME SHIFT") || t.includes("TIMESHIFT") || t.includes("TEMPO")) return "timeshift";
  if (t.includes("REWIND") || t.includes("BOARD RESTORED")) return "rewind";
  return null;
}

export interface VoiceCue {
  id: VoiceLineId;
  delayMs: number;
}

/**
 * Map a gameplay FX event to announcer cues.
 * Locked / Combo / Ultimate are the spoken gameplay callouts.
 * One cascade never stacks those three on top of each other.
 */
export function cuesFromFx(
  fx: { kind: string; text: string; combo?: number; side?: string },
  now: number,
  lastComboAt: number,
): VoiceCue[] {
  if (fx.kind === "countdown") {
    if (fx.text === "CLASH!") return [{ id: "fight", delayMs: 0 }];
    return [];
  }
  if (fx.kind === "pressure") {
    if (fx.side === "player" || /RIVAL/.test(fx.text.toUpperCase())) return [{ id: "locked", delayMs: 0 }];
    return [];
  }
  if (fx.kind === "power" || fx.kind === "rewind") {
    const id = powerCall(fx.text);
    return id ? [{ id, delayMs: 0 }] : [];
  }
  if (fx.kind === "urgent") {
    if (fx.text.includes("FINAL")) return [{ id: "final_seconds", delayMs: 0 }];
    if (fx.text.includes("DANGER")) return [{ id: "danger", delayMs: 0 }];
    if (fx.text === "TIME!" || fx.text === "TIME") return [{ id: "time", delayMs: 0 }];
    return [];
  }
  if (fx.kind === "finale") {
    if (fx.text === "VICTORY") return [{ id: "victory", delayMs: 0 }];
    if (fx.text === "DEFEAT") return [{ id: "defeat", delayMs: 0 }];
    if (fx.text === "DRAW") return [{ id: "draw", delayMs: 0 }];
    return [];
  }
  if (fx.kind === "attack" && fx.text === "TIME STRIKE" && fx.side !== "opponent") {
    return [{ id: "ultimate", delayMs: 0 }];
  }
  if (fx.side === "opponent") return [];
  const peak = fx.combo ?? 0;
  if (fx.kind === "combo") {
    const id = comboCall(peak);
    if (!id) return [];
    if (now - lastComboAt < VOICE.combo.cooldownMs) return [];
    return [{ id, delayMs: 0 }];
  }
  return [];
}

/** Keep a single lead callout when several gameplay FX land on the same frame. */
export function cuesFromFxBatch(
  events: { kind: string; text: string; combo?: number; side?: string }[],
  now: number,
  lastComboAt: number,
): VoiceCue[] {
  const cues = events.flatMap((fx) => cuesFromFx(fx, now, lastComboAt));
  if (cues.length <= 1) return cues;
  const seen = new Set<VoiceLineId>();
  const unique: VoiceCue[] = [];
  for (const cue of cues) {
    if (seen.has(cue.id)) continue;
    seen.add(cue.id);
    unique.push(cue);
  }
  const immediate = unique.filter((cue) => cue.delayMs <= 0);
  const delayed = unique.filter((cue) => cue.delayMs > 0);
  immediate.sort((a, b) => VOICE[b.id].priority - VOICE[a.id].priority);
  const lead = immediate[0];
  const picked = lead ? [lead] : [];
  const leadUntil = lead ? VOICE[lead.id].durationMs : 0;
  for (const cue of delayed) {
    if (cue.delayMs >= leadUntil - 40) picked.push(cue);
  }
  return picked;
}

export function arbitrate(state: VoiceState, id: VoiceLineId, now: number): { state: VoiceState; action: VoiceAction } {
  const line = VOICE[id];
  const last = state.lastAt[id] ?? -99999;
  if (now - last < line.cooldownMs) {
    return { state, action: "drop" };
  }
  const speaking = state.current && now < state.until;
  if (!speaking) {
    const next = state.queued && state.queued !== id ? state.queued : null;
    return {
      state: {
        ...state,
        current: id,
        until: now + line.durationMs,
        queued: next && next !== id ? next : null,
        lastAt: { ...state.lastAt, [id]: now },
        lastComboAt: isComboId(id) ? now : state.lastComboAt,
      },
      action: "play",
    };
  }
  const cur = VOICE[state.current!];
  if (FINALE.includes(id) && state.current === "time") {
    return { state: { ...state, queued: id }, action: "queue" };
  }
  if (line.priority > cur.priority) {
    return {
      state: {
        ...state,
        current: id,
        until: now + line.durationMs,
        queued: null,
        lastAt: { ...state.lastAt, [id]: now },
        lastComboAt: isComboId(id) ? now : state.lastComboAt,
      },
      action: "interrupt",
    };
  }
  return { state, action: "drop" };
}

export function flushQueue(state: VoiceState, now: number): { state: VoiceState; play: VoiceLineId | null } {
  if (state.current && now < state.until) return { state, play: null };
  if (!state.queued) {
    return { state: { ...state, current: null }, play: null };
  }
  const id = state.queued;
  const line = VOICE[id];
  return {
    state: {
      ...state,
      current: id,
      until: now + line.durationMs,
      queued: null,
      lastAt: { ...state.lastAt, [id]: now },
    },
    play: id,
  };
}

function isComboId(id: VoiceLineId): boolean {
  return (
    id === "combo" ||
    id === "nice" ||
    id === "double_combo" ||
    id === "triple" ||
    id === "four_combo" ||
    id === "amazing" ||
    id === "perfect" ||
    id === "unstoppable" ||
    id === "legendary"
  );
}
