import { Intensity, SCORE_TARGET } from "./types";
import { clampScoreTarget } from "./combat";

export interface GameSettings {
  sfx: boolean;
  music: boolean;
  sfxVolume: number;
  musicVolume: number;
  announcer: boolean;
  haptics: boolean;
  effects: Intensity;
  animation: Intensity;
  showComboEffects: boolean;
  scoreTarget: number;
  introSeen: boolean;
}

export const DEFAULT_SFX_VOLUME = 0.84;
export const DEFAULT_MUSIC_VOLUME = 0.72;

export const DEFAULT_SETTINGS: GameSettings = {
  sfx: true,
  music: true,
  sfxVolume: DEFAULT_SFX_VOLUME,
  musicVolume: DEFAULT_MUSIC_VOLUME,
  announcer: true,
  haptics: true,
  effects: "high",
  animation: "high",
  showComboEffects: true,
  scoreTarget: SCORE_TARGET,
  introSeen: false,
};

const KEY = "chrono-clash-settings-v2";
export const APP_VERSION = "1.0.0";

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function loadSettings(): GameSettings {
  try {
    const raw = storage()?.getItem(KEY) || storage()?.getItem("chrono-clash-settings-v1");
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<GameSettings> & { effectsQuality?: string };
    const effects: Intensity =
      parsed.effects === "low" || parsed.effects === "medium" || parsed.effects === "high"
        ? parsed.effects
        : parsed.effectsQuality === "low"
          ? "low"
          : "high";
    return {
      sfx: parsed.sfx !== false,
      music: parsed.music !== false,
      sfxVolume: clampVolume(parsed.sfxVolume, DEFAULT_SFX_VOLUME),
      musicVolume: clampVolume(parsed.musicVolume, DEFAULT_MUSIC_VOLUME),
      announcer: parsed.announcer !== false,
      haptics: parsed.haptics !== false,
      effects,
      animation:
        parsed.animation === "low" || parsed.animation === "medium" || parsed.animation === "high"
          ? parsed.animation
          : effects,
      showComboEffects: parsed.showComboEffects !== false,
      scoreTarget: clampScoreTarget(Number(parsed.scoreTarget) || SCORE_TARGET, SCORE_TARGET),
      introSeen: parsed.introSeen === true,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: GameSettings): void {
  storage()?.setItem(KEY, JSON.stringify(settings));
}

export function isMatchAudioMuted(settings: GameSettings): boolean {
  return !settings.sfx && !settings.music;
}

export function applyMatchAudioMute(settings: GameSettings, muted: boolean): GameSettings {
  settings.sfx = !muted;
  settings.music = !muted;
  return settings;
}

function clampVolume(value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}
