import { isValidAdReceipt, utcDayKey } from "./economy";
import { LocalProgress } from "./types";

export const DAILY_LIVES_MAX = 3;
export const DAILY_LIFE_ADS_MAX = 3;
export const DAILY_LIFE_AD_PLACEMENT = "daily-life";

export type DailyRunFail = "empty" | "full" | "active" | "ad-cap" | "receipt" | "duplicate";

export interface DailyRunState {
  utcDay: string;
  lives: number;
  adsUsed: number;
  claimedReceipts: string[];
  clockHighWaterMs: number;
}

export type DailyRunResult =
  | { ok: true; state: DailyRunState }
  | { ok: false; reason: DailyRunFail; state: DailyRunState };

export function emptyDailyRun(): DailyRunState {
  return { utcDay: "", lives: DAILY_LIVES_MAX, adsUsed: 0, claimedReceipts: [], clockHighWaterMs: 0 };
}

export function clampDailyRun(raw: Partial<DailyRunState> | null | undefined): DailyRunState {
  const receipts = Array.isArray(raw?.claimedReceipts)
    ? [...new Set(raw.claimedReceipts.map((id) => String(id)).filter((id) => isValidAdReceipt(id)))]
    : [];
  const hasLives = raw?.lives != null;
  return {
    utcDay: String(raw?.utcDay || "").slice(0, 16),
    lives: Math.max(0, Math.min(DAILY_LIVES_MAX, hasLives ? Math.trunc(Number(raw?.lives) || 0) : DAILY_LIVES_MAX)),
    adsUsed: Math.max(0, Math.min(DAILY_LIFE_ADS_MAX, Math.trunc(Number(raw?.adsUsed) || 0))),
    claimedReceipts: receipts.slice(-400),
    clockHighWaterMs: Math.max(0, Math.trunc(Number(raw?.clockHighWaterMs) || 0)),
  };
}

export function dailyRunFromProgress(progress: LocalProgress): DailyRunState {
  return clampDailyRun({
    utcDay: progress.dailyRunDay,
    lives: progress.dailyLives,
    adsUsed: progress.dailyLifeAdsUsed,
    claimedReceipts: progress.dailyLifeReceipts,
    clockHighWaterMs: progress.dailyClockHighWaterMs,
  });
}

export function applyDailyRun(progress: LocalProgress, state: DailyRunState): LocalProgress {
  const next = clampDailyRun(state);
  return {
    ...progress,
    dailyRunDay: next.utcDay,
    dailyLives: next.lives,
    dailyLifeAdsUsed: next.adsUsed,
    dailyLifeReceipts: next.claimedReceipts,
    dailyClockHighWaterMs: next.clockHighWaterMs,
  };
}

function freshDay(day: string, nowMs: number, receipts: string[]): DailyRunState {
  return clampDailyRun({
    utcDay: day,
    lives: DAILY_LIVES_MAX,
    adsUsed: 0,
    claimedReceipts: receipts,
    clockHighWaterMs: nowMs,
  });
}

/**
 * Trusted=true uses a server (or test) clock.
 * Untrusted device clocks cannot assign a UTC day or restore lives.
 */
export function refreshDailyRun(state: DailyRunState, nowMs: number, trusted: boolean): DailyRunState {
  const current = clampDailyRun(state);
  if (!trusted) return current;
  const now = Math.max(0, Math.trunc(Number(nowMs) || 0));
  const day = utcDayKey(now);
  if (!current.utcDay) return { ...current, utcDay: day, clockHighWaterMs: now };
  if (now < current.clockHighWaterMs) return current;
  if (day === current.utcDay) return { ...current, clockHighWaterMs: now };
  return freshDay(day, now, current.claimedReceipts);
}

export function nextUtcDayMs(nowMs: number): number {
  const date = new Date(Math.max(0, Math.trunc(Number(nowMs) || 0)));
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1);
}

export function canStartDailyRun(state: DailyRunState, nowMs: number, trusted: boolean): boolean {
  return refreshDailyRun(state, nowMs, trusted).lives > 0;
}

export function spendDailyLife(state: DailyRunState, nowMs: number, trusted: boolean): DailyRunResult {
  const refreshed = refreshDailyRun(state, nowMs, trusted);
  if (refreshed.lives <= 0) return { ok: false, reason: "empty", state: refreshed };
  return { ok: true, state: { ...refreshed, lives: refreshed.lives - 1 } };
}

export function applyDailyRunOutcome(
  state: DailyRunState,
  outcome: "win" | "loss" | "tie",
  nowMs: number,
  trusted: boolean,
): DailyRunState {
  const refreshed = refreshDailyRun(state, nowMs, trusted);
  if (outcome !== "loss") return refreshed;
  const spent = spendDailyLife(refreshed, nowMs, trusted);
  return spent.state;
}

export function restoreDailyLifeAd(
  state: DailyRunState,
  receiptId: string,
  nowMs: number,
  trusted: boolean,
): DailyRunResult {
  const refreshed = refreshDailyRun(state, nowMs, trusted);
  if (!isValidAdReceipt(receiptId)) return { ok: false, reason: "receipt", state: refreshed };
  if (refreshed.claimedReceipts.includes(receiptId)) return { ok: false, reason: "duplicate", state: refreshed };
  if (refreshed.lives >= DAILY_LIVES_MAX) return { ok: false, reason: "full", state: refreshed };
  if (refreshed.lives > 0) return { ok: false, reason: "active", state: refreshed };
  if (refreshed.adsUsed >= DAILY_LIFE_ADS_MAX) return { ok: false, reason: "ad-cap", state: refreshed };
  return {
    ok: true,
    state: {
      ...refreshed,
      lives: refreshed.lives + 1,
      adsUsed: refreshed.adsUsed + 1,
      claimedReceipts: [...refreshed.claimedReceipts, receiptId],
    },
  };
}

export function publicDailyRun(state: DailyRunState, nowMs: number): DailyRunState & {
  utcMs: number;
  maxLives: number;
  adsMax: number;
} {
  const next = refreshDailyRun(state, nowMs, true);
  return {
    ...next,
    utcMs: Math.max(0, Math.trunc(Number(nowMs) || 0)),
    maxLives: DAILY_LIVES_MAX,
    adsMax: DAILY_LIFE_ADS_MAX,
  };
}
