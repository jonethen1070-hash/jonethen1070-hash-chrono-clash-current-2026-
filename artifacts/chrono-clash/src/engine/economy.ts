import { LocalProgress } from "./types";
import {
  DEFAULT_POWER_MAX,
  PowerDefinition,
  POWER_CATALOG,
  powerById,
  powerMaxCharges,
} from "./powers";

/** Match win: 5 isolated wins = 50 coins = 1 power charge. */
export const WINNING_COINS_WIN = 10;
export const WINNING_COINS_TIE = 2;
export const WINNING_COINS_LOSS = 0;
/** One-time bonuses when a win streak reaches these lengths. */
export const WINNING_COINS_STREAK: Readonly<Record<number, number>> = { 3: 10, 5: 20, 10: 25 };
/** First win of a UTC day. */
export const WINNING_COINS_DAILY_WIN = 12;
/** Wins required in a UTC ISO week for the weekly bonus. */
export const WINNING_COINS_WEEKLY_WINS = 5;
export const WINNING_COINS_WEEKLY_BONUS = 30;

export interface CoinEarnState {
  dailyDay: string;
  weeklyWeek: string;
  weeklyWins: number;
}

export interface CoinPayout {
  total: number;
  match: number;
  streak: number;
  daily: number;
  weekly: number;
  notes: string[];
  earn: CoinEarnState;
}

export function emptyCoinEarn(): CoinEarnState {
  return { dailyDay: "", weeklyWeek: "", weeklyWins: 0 };
}

export function utcDayKey(now = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

export function utcWeekKey(now = Date.now()): string {
  const date = new Date(now);
  const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((utc.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

export function clampCoinEarn(raw: Partial<CoinEarnState> | null | undefined): CoinEarnState {
  return {
    dailyDay: String(raw?.dailyDay || "").slice(0, 16),
    weeklyWeek: String(raw?.weeklyWeek || "").slice(0, 16),
    weeklyWins: Math.max(0, Math.min(400, Math.trunc(Number(raw?.weeklyWins) || 0))),
  };
}

export function matchCoinPayout(input: {
  outcome: "win" | "loss" | "tie";
  streakAfter: number;
  earn: CoinEarnState;
  now?: number;
}): CoinPayout {
  const now = input.now ?? Date.now();
  const day = utcDayKey(now);
  const week = utcWeekKey(now);
  const match = coinsForOutcome(input.outcome);
  let { dailyDay, weeklyWeek, weeklyWins } = clampCoinEarn(input.earn);
  if (weeklyWeek !== week) {
    weeklyWeek = week;
    weeklyWins = 0;
  }
  let streak = 0;
  let daily = 0;
  let weekly = 0;
  if (input.outcome === "win") {
    streak = WINNING_COINS_STREAK[input.streakAfter] ?? 0;
    if (dailyDay !== day) {
      daily = WINNING_COINS_DAILY_WIN;
      dailyDay = day;
    }
    weeklyWins += 1;
    if (weeklyWins === WINNING_COINS_WEEKLY_WINS) weekly = WINNING_COINS_WEEKLY_BONUS;
  }
  const notes: string[] = [];
  if (match) notes.push(`Winning Coins +${match}`);
  if (streak) notes.push(`Streak ${input.streakAfter} +${streak}`);
  if (daily) notes.push(`Daily win +${daily}`);
  if (weekly) notes.push(`Weekly ${WINNING_COINS_WEEKLY_WINS} wins +${weekly}`);
  return {
    match,
    streak,
    daily,
    weekly,
    total: match + streak + daily + weekly,
    notes,
    earn: { dailyDay, weeklyWeek, weeklyWins },
  };
}

export interface EconomyState {
  winningCoins: number;
  powerCharges: Record<string, number>;
  claimedAdReceipts: string[];
}

export type EconomyFail =
  | "unknown"
  | "full"
  | "funds"
  | "empty"
  | "receipt"
  | "duplicate"
  | "ad-unavailable";

export type EconomyResult =
  | { ok: true; state: EconomyState; granted?: number; spent?: number }
  | { ok: false; reason: EconomyFail; state: EconomyState };

export function emptyEconomy(): EconomyState {
  return { winningCoins: 0, powerCharges: {}, claimedAdReceipts: [] };
}

export function economyFromProgress(progress: Pick<LocalProgress, "winningCoins" | "powerCharges" | "claimedAdReceipts">): EconomyState {
  return clampEconomy({
    winningCoins: progress.winningCoins,
    powerCharges: progress.powerCharges,
    claimedAdReceipts: progress.claimedAdReceipts,
  });
}

export function applyEconomy(progress: LocalProgress, state: EconomyState): LocalProgress {
  const next = clampEconomy(state);
  return {
    ...progress,
    winningCoins: next.winningCoins,
    powerCharges: next.powerCharges,
    claimedAdReceipts: next.claimedAdReceipts,
  };
}

export function clampEconomy(
  raw: Partial<EconomyState> | null | undefined,
  catalog: readonly PowerDefinition[] = POWER_CATALOG,
): EconomyState {
  const charges: Record<string, number> = {};
  const incoming = raw?.powerCharges && typeof raw.powerCharges === "object" ? raw.powerCharges : {};
  for (const [id, value] of Object.entries(incoming)) {
    const max = powerMaxCharges(id, catalog);
    const n = Math.trunc(Number(value) || 0);
    charges[id] = Math.max(0, Math.min(max, n));
  }
  const receipts = Array.isArray(raw?.claimedAdReceipts)
    ? [...new Set(raw.claimedAdReceipts.map((id) => String(id)).filter((id) => id.length >= 16))]
    : [];
  return {
    winningCoins: Math.max(0, Math.trunc(Number(raw?.winningCoins) || 0)),
    powerCharges: charges,
    claimedAdReceipts: receipts.slice(-400),
  };
}

export function getCharge(
  state: EconomyState,
  id: string,
  catalog: readonly PowerDefinition[] = POWER_CATALOG,
): number {
  const max = powerMaxCharges(id, catalog);
  return Math.max(0, Math.min(max, Math.trunc(Number(state.powerCharges[id]) || 0)));
}

export function canEarnCharge(
  state: EconomyState,
  id: string,
  catalog: readonly PowerDefinition[] = POWER_CATALOG,
): boolean {
  const def = powerById(id, catalog);
  if (!def?.consumesCharge && !def?.storefront) return false;
  if (!def) return false;
  return getCharge(state, id, catalog) < (def.maxCharges || DEFAULT_POWER_MAX);
}

export function grantCharge(
  state: EconomyState,
  id: string,
  amount = 1,
  catalog: readonly PowerDefinition[] = POWER_CATALOG,
): EconomyResult {
  const def = powerById(id, catalog);
  if (!def) return { ok: false, reason: "unknown", state };
  const add = Math.trunc(Number(amount) || 0);
  if (add <= 0) return { ok: false, reason: "unknown", state };
  const current = getCharge(state, id, catalog);
  const room = def.maxCharges - current;
  if (room <= 0) return { ok: false, reason: "full", state };
  const granted = Math.min(room, add);
  return {
    ok: true,
    granted,
    state: {
      ...state,
      powerCharges: { ...state.powerCharges, [id]: current + granted },
    },
  };
}

export function spendCharge(
  state: EconomyState,
  id: string,
  catalog: readonly PowerDefinition[] = POWER_CATALOG,
): EconomyResult {
  const def = powerById(id, catalog);
  if (!def) return { ok: false, reason: "unknown", state };
  if (!def.consumesCharge) return { ok: true, spent: 0, state };
  const current = getCharge(state, id, catalog);
  if (current <= 0) return { ok: false, reason: "empty", state };
  return {
    ok: true,
    spent: 1,
    state: {
      ...state,
      powerCharges: { ...state.powerCharges, [id]: current - 1 },
    },
  };
}

export function buyCharge(
  state: EconomyState,
  id: string,
  catalog: readonly PowerDefinition[] = POWER_CATALOG,
): EconomyResult {
  const def = powerById(id, catalog);
  if (!def?.storefront) return { ok: false, reason: "unknown", state };
  if (state.winningCoins < def.coinCost) return { ok: false, reason: "funds", state };
  const granted = grantCharge(state, id, 1, catalog);
  if (!granted.ok) return granted;
  return {
    ok: true,
    granted: 1,
    state: {
      ...granted.state,
      winningCoins: state.winningCoins - def.coinCost,
    },
  };
}

export function isValidAdReceipt(receiptId: string): boolean {
  return typeof receiptId === "string" && /^[A-Za-z0-9._-]{16,160}$/.test(receiptId);
}

export function claimAdReward(
  state: EconomyState,
  id: string,
  receiptId: string,
  catalog: readonly PowerDefinition[] = POWER_CATALOG,
): EconomyResult {
  const def = powerById(id, catalog);
  if (!def?.storefront || !def.rewardedAd) return { ok: false, reason: "unknown", state };
  if (!isValidAdReceipt(receiptId)) return { ok: false, reason: "receipt", state };
  if (state.claimedAdReceipts.includes(receiptId)) return { ok: false, reason: "duplicate", state };
  const granted = grantCharge(state, id, 1, catalog);
  if (!granted.ok) return granted;
  return {
    ok: true,
    granted: 1,
    state: {
      ...granted.state,
      claimedAdReceipts: [...granted.state.claimedAdReceipts, receiptId],
    },
  };
}

export function grantWinningCoins(state: EconomyState, amount: number): EconomyResult {
  const add = Math.trunc(Number(amount) || 0);
  if (add <= 0) return { ok: false, reason: "unknown", state };
  return {
    ok: true,
    granted: add,
    state: { ...state, winningCoins: state.winningCoins + add },
  };
}

export function spendWinningCoins(state: EconomyState, amount: number): EconomyResult {
  const cost = Math.trunc(Number(amount) || 0);
  if (cost <= 0) return { ok: false, reason: "unknown", state };
  if (state.winningCoins < cost) return { ok: false, reason: "funds", state };
  return {
    ok: true,
    spent: cost,
    state: { ...state, winningCoins: state.winningCoins - cost },
  };
}

export function coinsForOutcome(outcome: "win" | "loss" | "tie"): number {
  if (outcome === "win") return WINNING_COINS_WIN;
  if (outcome === "tie") return WINNING_COINS_TIE;
  return WINNING_COINS_LOSS;
}

export function withPowerStock(
  progress: LocalProgress,
  stock: Record<string, number>,
  coins = progress.winningCoins,
): LocalProgress {
  return applyEconomy(progress, clampEconomy({
    winningCoins: coins,
    powerCharges: { ...progress.powerCharges, ...stock },
    claimedAdReceipts: progress.claimedAdReceipts,
  }));
}
