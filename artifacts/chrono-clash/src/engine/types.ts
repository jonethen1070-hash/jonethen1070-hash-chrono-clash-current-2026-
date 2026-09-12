export const COLS = 8;
export const ROWS = 10;
export const COLOR_COUNT = 6;
export const MATCH_SECONDS = 60;
export const SCORE_FALLBACK_SECONDS = 90;
export const SCORE_TARGET = 5_000;
export const SCORE_TARGETS = [3_000, 5_000, 8_000, 10_000] as const;
export const COUNTDOWN_SECONDS = 3;
export const READY_MS = 1600;
// Keep only a brief handoff for the final impact; cosmetic VFX must not gate results.
export const FINALE_MS = 180;

export const ENERGY_MAX = 100;
export const ENERGY_FREEZE = 12;
export const ENERGY_TIMESHIFT = 18;
export const ENERGY_REWIND = 26;
export const ENERGY_BURST = 40;
export const ENERGY_MEGA_STRIKE = 50;

export const FREEZE_MS = 5000;
export const TIMESHIFT_MS = 5000;
export const TIME_STEAL_MS = 5000;
export const SCORE_SURGE_MS = 5000;
export const REWIND_HISTORY = 8;
export const ATTACK_MAX = 100;
export const PRESSURE_MS = 1200;
export const POWER_LOCK_MS = 280;
export const COMBO_HOLD_MS = 900;
export const INVALID_RETURN_MS = 160;
export const RIVAL_FREEZE_MS = 2500;

export const XP_PER_LEVEL = 120;
export const APP_VERSION = "1.0.0";

export const COLORS = [
  "#D1166D",
  "#D38800",
  "#008F5B",
  "#1754C7",
  "#6D25C9",
  "#008EAA",
] as const;

export type PieceKind = "normal" | "lineH" | "lineV" | "bomb";
export type MatchShape = "three" | "four" | "five" | "tee";
export type GameMode = "time" | "score";
export type PowerId = "freeze" | "timeshift" | "rewind" | "burst" | "megaStrike";
export type Outcome = "win" | "loss" | "tie";
export type Intensity = "high" | "medium" | "low";
export type MatchState =
  | "READY"
  | "COUNTDOWN"
  | "PLAYING"
  | "PAUSED"
  | "POWER_ACTIVE"
  | "FINAL_SECONDS"
  | "WON"
  | "LOST"
  | "DRAW";

export interface Piece {
  id: number;
  color: number;
  kind: PieceKind;
}

export type Cell = Piece | null;
export type Board = Cell[][];

export interface Coord {
  r: number;
  c: number;
}

export interface MatchGroup {
  cells: Coord[];
  color: number;
  special?: PieceKind;
  specialAt?: Coord;
  shape?: MatchShape;
}

export interface ResolveEvent {
  type: "clear" | "spawnSpecial" | "fall" | "fill";
  combo: number;
  score: number;
  cells?: Coord[];
  special?: PieceKind;
}

export interface ResolveResult {
  board: Board;
  scoreDelta: number;
  comboPeak: number;
  energyDelta: number;
  events: ResolveEvent[];
  cleared: number;
}

export interface LocalProgress {
  name: string;
  avatar: number;
  frame: string;
  boardTheme: string;
  tileTheme: string;
  title: string;
  xp: number;
  level: number;
  plays: number;
  wins: number;
  losses: number;
  ties: number;
  bestScore: number;
  bestCombo: number;
  totalScore: number;
  winStreak: number;
  bestStreak: number;
  powersUsed: Record<PowerId, number>;
  lastPowers: PowerId[];
  unlocked: string[];
  tutorialDone: boolean;
  matchesSeen: number;
  lastMode: GameMode;
  vfxTheme: string;
  recentMatches: RecentMatch[];
  winningCoins: number;
  powerCharges: Record<string, number>;
  claimedAdReceipts: string[];
  coinDailyDay: string;
  coinWeeklyWeek: string;
  coinWeeklyWins: number;
  dailyRunDay: string;
  dailyLives: number;
  dailyLifeAdsUsed: number;
  dailyLifeReceipts: string[];
  dailyClockHighWaterMs: number;
  customAvatar: boolean;
}

export interface RecentMatch {
  score: number;
  rivalScore: number;
  outcome: Outcome;
  mode: GameMode;
  combo: number;
}

export const EMPTY_PROGRESS: LocalProgress = {
  name: "CHRONO PILOT",
  avatar: 0,
  frame: "frame-pulse",
  boardTheme: "void",
  tileTheme: "lumen",
  title: "NEWCOMER",
  xp: 0,
  level: 1,
  plays: 0,
  wins: 0,
  losses: 0,
  ties: 0,
  bestScore: 0,
  bestCombo: 0,
  totalScore: 0,
  winStreak: 0,
  bestStreak: 0,
  powersUsed: { freeze: 0, timeshift: 0, rewind: 0, burst: 0, megaStrike: 0 },
  lastPowers: [],
  unlocked: ["frame-pulse", "board-void", "tile-lumen", "title-newcomer", "void", "lumen", "NEWCOMER", "core", "avatar-0", "avatar-1", "avatar-2"],
  tutorialDone: false,
  matchesSeen: 0,
  lastMode: "time",
  vfxTheme: "core",
  recentMatches: [],
  winningCoins: 0,
  powerCharges: {},
  claimedAdReceipts: [],
  coinDailyDay: "",
  coinWeeklyWeek: "",
  coinWeeklyWins: 0,
  dailyRunDay: "",
  dailyLives: 3,
  dailyLifeAdsUsed: 0,
  dailyLifeReceipts: [],
  dailyClockHighWaterMs: 0,
  customAvatar: false,
};
