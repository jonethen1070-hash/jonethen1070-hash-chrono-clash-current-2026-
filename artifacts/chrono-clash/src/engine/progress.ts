import {
  EMPTY_PROGRESS,
  LocalProgress,
  Outcome,
  PowerId,
  XP_PER_LEVEL,
} from "./types";
import { cosmeticsUnlockedAtLevel } from "./catalog";
import { applyEconomy, clampCoinEarn, economyFromProgress, grantWinningCoins, matchCoinPayout } from "./economy";
import { clampDailyRun } from "./dailyRun";
import { clearAvatarPhoto, hasAvatarPhoto } from "./avatarPhoto";

const KEY = "chrono-clash-meta-v2";

export interface Achievement {
  id: string;
  name: string;
  detail: string;
  xp: number;
  unlock?: string;
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: "first_victory", name: "FIRST VICTORY", detail: "Win a match.", xp: 80, unlock: "frame-gold" },
  { id: "combo_master", name: "COMBO MASTER", detail: "Reach COMBO x5 in one match.", xp: 90, unlock: "tile-prism" },
  { id: "time_lord", name: "TIME LORD", detail: "Win a Time Battle.", xp: 70, unlock: "title-time-lord" },
  { id: "chrono_warrior", name: "CHRONO WARRIOR", detail: "Win a Score Battle.", xp: 70, unlock: "board-ember" },
  { id: "perfect_run", name: "PERFECT RUN", detail: "Win with more than double the rival score.", xp: 110, unlock: "frame-nova" },
  { id: "matches_10", name: "10 MATCHES", detail: "Play 10 matches.", xp: 60, unlock: "title-veteran" },
  { id: "streak_5", name: "5 WIN STREAK", detail: "Win 5 matches in a row.", xp: 120, unlock: "title-unbroken" },
  { id: "high_score", name: "HIGH SCORE", detail: "Score 5,000 in one match.", xp: 80, unlock: "tile-ion" },
  { id: "power_user", name: "POWER USER", detail: "Use all three Chrono Powers in one match.", xp: 75, unlock: "board-aurora" },
];

function addUnlock(progress: LocalProgress, bucket: string[], id: string): void {
  if (progress.unlocked.includes(id)) return;
  progress.unlocked.push(id);
  bucket.push(id);
}

export interface RewardGrant {
  xp: number;
  coins: number;
  levelBefore: number;
  levelAfter: number;
  unlocked: string[];
  achievements: Achievement[];
  notes: string[];
}

export function grantHasBounty(grant: RewardGrant | null | undefined): boolean {
  if (!grant) return false;
  return (
    grant.xp > 0 ||
    grant.coins > 0 ||
    grant.notes.length > 0 ||
    grant.achievements.length > 0 ||
    grant.unlocked.length > 0 ||
    grant.levelAfter > grant.levelBefore
  );
}

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function clampProgress(parsed: Partial<LocalProgress>): LocalProgress {
  const base = { ...EMPTY_PROGRESS };
  const economy = economyFromProgress({
    winningCoins: Number(parsed.winningCoins) || 0,
    powerCharges: parsed.powerCharges && typeof parsed.powerCharges === "object" ? parsed.powerCharges : {},
    claimedAdReceipts: Array.isArray(parsed.claimedAdReceipts) ? parsed.claimedAdReceipts : [],
  });
  const earn = clampCoinEarn({
    dailyDay: parsed.coinDailyDay,
    weeklyWeek: parsed.coinWeeklyWeek,
    weeklyWins: parsed.coinWeeklyWins,
  });
  const dailyRun = clampDailyRun({
    utcDay: parsed.dailyRunDay,
    lives: parsed.dailyLives,
    adsUsed: parsed.dailyLifeAdsUsed,
    claimedReceipts: parsed.dailyLifeReceipts,
    clockHighWaterMs: parsed.dailyClockHighWaterMs,
  });
  return {
    ...base,
    ...parsed,
    name: String(parsed.name || base.name).slice(0, 16),
    avatar: Math.max(0, Math.min(5, Number(parsed.avatar) || 0)),
    frame: parsed.frame || base.frame,
    boardTheme: parsed.boardTheme || base.boardTheme,
    tileTheme: parsed.tileTheme || base.tileTheme,
    title: parsed.title || base.title,
    xp: Number(parsed.xp) || 0,
    level: Math.max(1, Number(parsed.level) || 1),
    plays: Number(parsed.plays) || 0,
    wins: Number(parsed.wins) || 0,
    losses: Number(parsed.losses) || 0,
    ties: Number(parsed.ties) || 0,
    bestScore: Number(parsed.bestScore) || 0,
    bestCombo: Number(parsed.bestCombo) || 0,
    totalScore: Number(parsed.totalScore) || 0,
    winStreak: Number(parsed.winStreak) || 0,
    bestStreak: Number(parsed.bestStreak) || 0,
    powersUsed: {
      freeze: Number(parsed.powersUsed?.freeze) || 0,
      timeshift: Number(parsed.powersUsed?.timeshift) || 0,
      rewind: Number(parsed.powersUsed?.rewind) || 0,
      burst: Number(parsed.powersUsed?.burst) || 0,
      megaStrike: Number(parsed.powersUsed?.megaStrike) || 0,
    },
    lastPowers: Array.isArray(parsed.lastPowers) ? parsed.lastPowers : [],
    unlocked: Array.isArray(parsed.unlocked) && parsed.unlocked.length ? parsed.unlocked : [...base.unlocked],
    tutorialDone: Boolean(parsed.tutorialDone),
    matchesSeen: Number(parsed.matchesSeen) || 0,
    lastMode: parsed.lastMode === "score" ? "score" : "time",
    vfxTheme: parsed.vfxTheme || base.vfxTheme,
    winningCoins: economy.winningCoins,
    powerCharges: economy.powerCharges,
    claimedAdReceipts: economy.claimedAdReceipts,
    coinDailyDay: earn.dailyDay,
    coinWeeklyWeek: earn.weeklyWeek,
    coinWeeklyWins: earn.weeklyWins,
    dailyRunDay: dailyRun.utcDay,
    dailyLives: dailyRun.lives,
    dailyLifeAdsUsed: dailyRun.adsUsed,
    dailyLifeReceipts: dailyRun.claimedReceipts,
    dailyClockHighWaterMs: dailyRun.clockHighWaterMs,
    customAvatar: Boolean(parsed.customAvatar) && hasAvatarPhoto(),
    recentMatches: Array.isArray(parsed.recentMatches)
      ? parsed.recentMatches.slice(0, 10).map((m) => ({
          score: Number(m.score) || 0,
          rivalScore: Number(m.rivalScore) || 0,
          outcome: m.outcome === "win" || m.outcome === "loss" || m.outcome === "tie" ? m.outcome : "loss",
          mode: m.mode === "score" ? "score" : "time",
          combo: Number(m.combo) || 0,
        }))
      : [],
  };
}

export function loadProgress(): LocalProgress {
  try {
    const raw = storage()?.getItem(KEY) || storage()?.getItem("chrono-clash-progress-v1");
    if (!raw) return { ...EMPTY_PROGRESS, unlocked: [...EMPTY_PROGRESS.unlocked] };
    return clampProgress(JSON.parse(raw) as Partial<LocalProgress>);
  } catch {
    return { ...EMPTY_PROGRESS, unlocked: [...EMPTY_PROGRESS.unlocked] };
  }
}

export function saveProgress(progress: LocalProgress): void {
  try {
    storage()?.setItem(KEY, JSON.stringify(progress));
  } catch {
    /* Progress is best-effort when storage is unavailable or full. */
  }
}

export function resetProgress(): LocalProgress {
  clearAvatarPhoto();
  const next = applyEconomy(
    {
      ...EMPTY_PROGRESS,
      unlocked: [...EMPTY_PROGRESS.unlocked],
      powersUsed: { freeze: 0, timeshift: 0, rewind: 0, burst: 0, megaStrike: 0 },
    },
    { winningCoins: 0, powerCharges: {}, claimedAdReceipts: [] },
  );
  saveProgress(next);
  try {
    storage()?.removeItem("chrono-clash-progress-v1");
  } catch {
    /* ignore unavailable storage */
  }
  return next;
}

export function xpToNext(level: number): number {
  return XP_PER_LEVEL + (level - 1) * 40;
}

export function applyXp(progress: LocalProgress, amount: number): LocalProgress {
  let xp = progress.xp + amount;
  let level = progress.level;
  while (xp >= xpToNext(level)) {
    xp -= xpToNext(level);
    level += 1;
  }
  return { ...progress, xp, level };
}

export function favoritePower(progress: LocalProgress): PowerId {
  const used = progress.powersUsed;
  let best: PowerId = "freeze";
  let n = -1;
  (Object.keys(used) as PowerId[]).forEach((id) => {
    if (used[id] > n) {
      n = used[id];
      best = id;
    }
  });
  return best;
}

export function winRate(progress: LocalProgress): number {
  if (!progress.plays) return 0;
  return Math.round((progress.wins / progress.plays) * 100);
}

export interface MatchRecordInput {
  outcome: Outcome;
  score: number;
  bestCombo: number;
  mode: "time" | "score";
  rivalScore: number;
  powersThisMatch: PowerId[];
  at?: number;
}

export function recordMatch(
  progress: LocalProgress,
  outcome: Outcome | MatchRecordInput,
  score = 0,
  bestCombo = 0,
): LocalProgress {
  const input: MatchRecordInput =
    typeof outcome === "string"
      ? { outcome, score, bestCombo, mode: "time", rivalScore: 0, powersThisMatch: [] }
      : outcome;

  let streak = progress.winStreak;
  if (input.outcome === "win") streak += 1;
  else if (input.outcome === "loss") streak = 0;

  const powersUsed = { ...progress.powersUsed };
  for (const id of input.powersThisMatch) powersUsed[id] += 1;

  let next: LocalProgress = {
    ...progress,
    plays: progress.plays + 1,
    wins: progress.wins + (input.outcome === "win" ? 1 : 0),
    losses: progress.losses + (input.outcome === "loss" ? 1 : 0),
    ties: progress.ties + (input.outcome === "tie" ? 1 : 0),
    bestScore: Math.max(progress.bestScore, input.score),
    bestCombo: Math.max(progress.bestCombo, input.bestCombo),
    totalScore: progress.totalScore + input.score,
    winStreak: streak,
    bestStreak: Math.max(progress.bestStreak, streak),
    powersUsed,
    lastPowers: input.powersThisMatch,
    matchesSeen: progress.matchesSeen + 1,
    recentMatches: [
      {
        score: input.score,
        rivalScore: input.rivalScore,
        outcome: input.outcome,
        mode: input.mode,
        combo: input.bestCombo,
      },
      ...(progress.recentMatches || []),
    ].slice(0, 10),
  };
  saveProgress(next);
  return next;
}

export function grantMatchRewards(progress: LocalProgress, input: MatchRecordInput): { progress: LocalProgress; grant: RewardGrant } {
  const recorded = recordMatch(progress, input);
  const levelBefore = recorded.level;
  const notes: string[] = [];
  let xp = input.outcome === "win" ? 90 : input.outcome === "tie" ? 50 : 35;
  xp += Math.min(40, Math.floor(input.score / 400));
  if (input.bestCombo >= 3) {
    xp += 15;
    notes.push(`Combo x${input.bestCombo}`);
  }
  if (input.outcome === "win") notes.push("Match victory");
  else notes.push("Match complete");

  let next = applyXp(recorded, xp);
  const unlocked: string[] = [];
  const achievements: Achievement[] = [];

  const earn = (id: string) => {
    const ach = ACHIEVEMENTS.find((a) => a.id === id);
    if (!ach || next.unlocked.includes(id)) return;
    next = { ...next, unlocked: [...next.unlocked, id] };
    if (ach.unlock && !next.unlocked.includes(ach.unlock)) {
      next.unlocked = [...next.unlocked, ach.unlock];
      unlocked.push(ach.unlock);
    }
    const badge = `badge-${id}`;
    if (!next.unlocked.includes(badge)) {
      next.unlocked = [...next.unlocked, badge];
      unlocked.push(badge);
    }
    if (id === "first_victory") addUnlock(next, unlocked, "avatar-4");
    if (id === "combo_master") addUnlock(next, unlocked, "avatar-5");
    if (id === "chrono_warrior") {
      addUnlock(next, unlocked, "ember");
      addUnlock(next, unlocked, "ember-fx");
    }
    if (id === "power_user") {
      addUnlock(next, unlocked, "aurora");
      addUnlock(next, unlocked, "aurora-fx");
    }
    next = applyXp(next, ach.xp);
    achievements.push(ach);
  };

  if (input.outcome === "win") earn("first_victory");
  if (input.bestCombo >= 5) earn("combo_master");
  if (input.outcome === "win" && input.mode === "time") earn("time_lord");
  if (input.outcome === "win" && input.mode === "score") earn("chrono_warrior");
  if (input.outcome === "win" && input.rivalScore > 0 && input.score >= input.rivalScore * 2) earn("perfect_run");
  if (next.plays >= 10) earn("matches_10");
  if (next.winStreak >= 5) earn("streak_5");
  if (input.score >= 5000) earn("high_score");
  if (new Set(input.powersThisMatch).size >= 3) earn("power_user");

  if (next.unlocked.includes("title-time-lord") && next.title === "NEWCOMER") next = { ...next, title: "TIME LORD" };
  if (next.unlocked.includes("title-veteran")) next = { ...next, title: next.title === "NEWCOMER" ? "VETERAN" : next.title };
  if (next.unlocked.includes("title-unbroken")) next = { ...next, title: "UNBROKEN" };
  for (const id of cosmeticsUnlockedAtLevel(next.level)) addUnlock(next, unlocked, id);
  if (next.level >= 5 && (next.title === "NEWCOMER" || next.title === "ACE")) next = { ...next, title: next.title === "NEWCOMER" ? "ACE" : next.title };

  const payout = matchCoinPayout({
    outcome: input.outcome,
    streakAfter: next.winStreak,
    earn: {
      dailyDay: next.coinDailyDay,
      weeklyWeek: next.coinWeeklyWeek,
      weeklyWins: next.coinWeeklyWins,
    },
    now: input.at,
  });
  const coinGrant = grantWinningCoins(economyFromProgress(next), payout.total);
  if (coinGrant.ok) {
    next = applyEconomy(next, coinGrant.state);
    notes.push(...payout.notes);
  }
  next = {
    ...next,
    coinDailyDay: payout.earn.dailyDay,
    coinWeeklyWeek: payout.earn.weeklyWeek,
    coinWeeklyWins: payout.earn.weeklyWins,
  };

  saveProgress(next);
  return {
    progress: next,
    grant: {
      xp,
      coins: coinGrant.ok ? coinGrant.granted ?? 0 : 0,
      levelBefore,
      levelAfter: next.level,
      unlocked,
      achievements,
      notes,
    },
  };
}
