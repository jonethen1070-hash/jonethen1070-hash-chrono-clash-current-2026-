import { DatabaseSync } from "node:sqlite";
import { AuthProvider, Platform, Player } from "./types";
import { clampEconomy, CoinEarnState, EconomyState, emptyCoinEarn, emptyEconomy, matchCoinPayout, spendCharge as spendEconomyCharge } from "../engine/economy";
import {
  applyDailyRunOutcome,
  clampDailyRun,
  DailyRunResult,
  DailyRunState,
  emptyDailyRun,
  refreshDailyRun,
  restoreDailyLifeAd,
} from "../engine/dailyRun";

export class ChronoStore {
  private db: DatabaseSync;

  constructor(path = ":memory:") {
    this.db = new DatabaseSync(path);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS players (
        player_id TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        platform TEXT NOT NULL,
        subject TEXT NOT NULL,
        name TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_players_subject ON players(subject);
      CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        player_id TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS match_queue (
        player_id TEXT PRIMARY KEY,
        queued_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS matches (
        match_id TEXT PRIMARY KEY,
        player_a TEXT NOT NULL,
        player_b TEXT NOT NULL,
        seed INTEGER NOT NULL,
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS player_match (
        player_id TEXT PRIMARY KEY,
        match_id TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS player_economy (
        player_id TEXT PRIMARY KEY,
        winning_coins INTEGER NOT NULL DEFAULT 0,
        charges_json TEXT NOT NULL DEFAULT '{}',
        receipts_json TEXT NOT NULL DEFAULT '[]',
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS coin_grants (
        player_id TEXT NOT NULL,
        grant_key TEXT NOT NULL,
        amount INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (player_id, grant_key)
      );
      CREATE TABLE IF NOT EXISTS player_coin_earn (
        player_id TEXT PRIMARY KEY,
        win_streak INTEGER NOT NULL DEFAULT 0,
        daily_day TEXT NOT NULL DEFAULT '',
        weekly_week TEXT NOT NULL DEFAULT '',
        weekly_wins INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS player_daily_run (
        player_id TEXT PRIMARY KEY,
        utc_day TEXT NOT NULL DEFAULT '',
        lives INTEGER NOT NULL DEFAULT 3,
        ads_used INTEGER NOT NULL DEFAULT 0,
        receipts_json TEXT NOT NULL DEFAULT '[]',
        clock_high_water INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS daily_run_match (
        player_id TEXT NOT NULL,
        match_id TEXT NOT NULL,
        outcome TEXT NOT NULL,
        PRIMARY KEY (player_id, match_id)
      );
    `);
  }

  transaction<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const out = fn();
      this.db.exec("COMMIT");
      return out;
    } catch (error) {
      try {
        this.db.exec("ROLLBACK");
      } catch {
        /* ignore */
      }
      throw error;
    }
  }

  close(): void {
    this.db.close();
  }

  getPlayer(playerId: string): Player | null {
    const row = this.db.prepare("SELECT * FROM players WHERE player_id = ?").get(playerId) as Record<string, unknown> | undefined;
    return row ? mapPlayer(row, "") : null;
  }

  getPlayerByToken(token: string): Player | null {
    return this.getSession(token)?.player ?? null;
  }

  getSession(token: string): { player: Player; createdAt: number } | null {
    const row = this.db
      .prepare(
        `SELECT p.*, s.token AS session_token, s.created_at AS session_created_at
         FROM sessions s JOIN players p ON p.player_id = s.player_id
         WHERE s.token = ?`,
      )
      .get(token) as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      player: mapPlayer(row, String(row.session_token || token)),
      createdAt: Number(row.session_created_at || 0),
    };
  }

  deleteSession(token: string): void {
    this.db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
  }

  pruneSessions(playerId: string, max: number): void {
    const row = this.db.prepare("SELECT COUNT(*) AS n FROM sessions WHERE player_id = ?").get(playerId) as
      | { n?: number }
      | undefined;
    const extra = Number(row?.n || 0) - max;
    if (extra <= 0) return;
    this.db
      .prepare(
        `DELETE FROM sessions WHERE token IN (
           SELECT token FROM sessions WHERE player_id = ? ORDER BY created_at ASC LIMIT ?
         )`,
      )
      .run(playerId, extra);
  }

  upsertPlayer(player: Player): void {
    this.db
      .prepare(
        `INSERT INTO players (player_id, provider, platform, subject, name, created_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(player_id) DO UPDATE SET
           provider=excluded.provider,
           platform=excluded.platform,
           subject=excluded.subject,
           name=excluded.name`,
      )
      .run(player.playerId, player.provider, player.platform, player.subject, player.name, player.createdAt);
  }

  putSession(token: string, playerId: string, now: number): void {
    this.db.prepare("INSERT INTO sessions (token, player_id, created_at) VALUES (?, ?, ?)").run(token, playerId, now);
  }

  enqueuePlayer(playerId: string, now: number): void {
    this.db
      .prepare("INSERT INTO match_queue (player_id, queued_at) VALUES (?, ?) ON CONFLICT(player_id) DO NOTHING")
      .run(playerId, now);
  }

  dequeuePlayer(playerId: string): void {
    this.db.prepare("DELETE FROM match_queue WHERE player_id = ?").run(playerId);
  }

  isQueued(playerId: string): boolean {
    const row = this.db.prepare("SELECT player_id FROM match_queue WHERE player_id = ?").get(playerId);
    return Boolean(row);
  }

  nextQueuedOpponent(playerId: string): string | null {
    const row = this.db
      .prepare("SELECT player_id FROM match_queue WHERE player_id != ? ORDER BY queued_at ASC LIMIT 1")
      .get(playerId) as { player_id?: string } | undefined;
    return row?.player_id ? String(row.player_id) : null;
  }

  getActiveMatchId(playerId: string): string | null {
    const row = this.db.prepare("SELECT match_id FROM player_match WHERE player_id = ?").get(playerId) as
      | { match_id?: string }
      | undefined;
    return row?.match_id ? String(row.match_id) : null;
  }

  getMatch(matchId: string): StoredMatch | null {
    const row = this.db.prepare("SELECT * FROM matches WHERE match_id = ?").get(matchId) as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      matchId: String(row.match_id),
      playerA: String(row.player_a),
      playerB: String(row.player_b),
      seed: Number(row.seed),
      status: String(row.status) === "cancelled" ? "cancelled" : "matched",
      createdAt: Number(row.created_at),
    };
  }

  createMatch(match: StoredMatch): void {
    this.db
      .prepare(
        `INSERT INTO matches (match_id, player_a, player_b, seed, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(match.matchId, match.playerA, match.playerB, match.seed, match.status, match.createdAt);
    this.db.prepare("INSERT OR REPLACE INTO player_match (player_id, match_id) VALUES (?, ?)").run(match.playerA, match.matchId);
    this.db.prepare("INSERT OR REPLACE INTO player_match (player_id, match_id) VALUES (?, ?)").run(match.playerB, match.matchId);
  }

  cancelMatch(matchId: string): void {
    this.db.prepare("UPDATE matches SET status = 'cancelled' WHERE match_id = ?").run(matchId);
    this.db.prepare("DELETE FROM player_match WHERE match_id = ?").run(matchId);
  }

  clearPlayerMatch(playerId: string): void {
    this.db.prepare("DELETE FROM player_match WHERE player_id = ?").run(playerId);
  }

  countMatches(): number {
    const row = this.db.prepare("SELECT COUNT(*) AS n FROM matches").get() as { n?: number } | undefined;
    return Number(row?.n || 0);
  }

  getEconomy(playerId: string): EconomyState {
    const row = this.db.prepare("SELECT winning_coins, charges_json, receipts_json FROM player_economy WHERE player_id = ?").get(playerId) as
      | { winning_coins?: number; charges_json?: string; receipts_json?: string }
      | undefined;
    if (!row) return emptyEconomy();
    return clampEconomy({
      winningCoins: Number(row.winning_coins) || 0,
      powerCharges: parseJson(row.charges_json, {}),
      claimedAdReceipts: parseJson(row.receipts_json, []),
    });
  }

  putEconomy(playerId: string, state: EconomyState, now = Date.now()): EconomyState {
    const next = clampEconomy(state);
    this.db
      .prepare(
        `INSERT INTO player_economy (player_id, winning_coins, charges_json, receipts_json, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(player_id) DO UPDATE SET
           winning_coins=excluded.winning_coins,
           charges_json=excluded.charges_json,
           receipts_json=excluded.receipts_json,
           updated_at=excluded.updated_at`,
      )
      .run(playerId, next.winningCoins, JSON.stringify(next.powerCharges), JSON.stringify(next.claimedAdReceipts), now);
    return next;
  }

  spendCharge(playerId: string, powerId: string): boolean {
    const current = this.getEconomy(playerId);
    const spent = spendEconomyCharge(current, powerId);
    if (!spent.ok) return false;
    this.putEconomy(playerId, spent.state);
    return true;
  }

  grantCoinsOnce(playerId: string, grantKey: string, amount: number, now = Date.now()): number {
    const add = Math.max(0, Math.trunc(amount) || 0);
    if (!add || !grantKey) return 0;
    const exists = this.db.prepare("SELECT amount FROM coin_grants WHERE player_id = ? AND grant_key = ?").get(playerId, grantKey);
    if (exists) return 0;
    this.db.prepare("INSERT INTO coin_grants (player_id, grant_key, amount, created_at) VALUES (?, ?, ?, ?)").run(playerId, grantKey, add, now);
    const current = this.getEconomy(playerId);
    this.putEconomy(playerId, { ...current, winningCoins: current.winningCoins + add }, now);
    return add;
  }

  getCoinEarn(playerId: string): CoinEarnState & { winStreak: number } {
    const row = this.db
      .prepare("SELECT win_streak, daily_day, weekly_week, weekly_wins FROM player_coin_earn WHERE player_id = ?")
      .get(playerId) as
      | { win_streak?: number; daily_day?: string; weekly_week?: string; weekly_wins?: number }
      | undefined;
    if (!row) return { ...emptyCoinEarn(), winStreak: 0 };
    return {
      ...emptyCoinEarn(),
      dailyDay: String(row.daily_day || ""),
      weeklyWeek: String(row.weekly_week || ""),
      weeklyWins: Number(row.weekly_wins) || 0,
      winStreak: Math.max(0, Math.trunc(Number(row.win_streak) || 0)),
    };
  }

  putCoinEarn(playerId: string, earn: CoinEarnState & { winStreak: number }): void {
    this.db
      .prepare(
        `INSERT INTO player_coin_earn (player_id, win_streak, daily_day, weekly_week, weekly_wins)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(player_id) DO UPDATE SET
           win_streak=excluded.win_streak,
           daily_day=excluded.daily_day,
           weekly_week=excluded.weekly_week,
           weekly_wins=excluded.weekly_wins`,
      )
      .run(playerId, Math.max(0, Math.trunc(earn.winStreak) || 0), earn.dailyDay, earn.weeklyWeek, earn.weeklyWins);
  }

  applyMatchCoins(playerId: string, matchId: string, outcome: "win" | "loss" | "tie", now = Date.now()): number {
    return this.transaction(() => {
      const current = this.getCoinEarn(playerId);
      const winStreak = outcome === "win" ? current.winStreak + 1 : 0;
      const payout = matchCoinPayout({
        outcome,
        streakAfter: winStreak,
        earn: current,
        now,
      });
      this.putCoinEarn(playerId, { ...payout.earn, winStreak });
      let granted = 0;
      granted += this.grantCoinsOnce(playerId, `match:${matchId}`, payout.match, now);
      if (payout.streak) granted += this.grantCoinsOnce(playerId, `match:${matchId}:streak`, payout.streak, now);
      if (payout.daily) granted += this.grantCoinsOnce(playerId, `daily:${payout.earn.dailyDay}`, payout.daily, now);
      if (payout.weekly) granted += this.grantCoinsOnce(playerId, `weekly:${payout.earn.weeklyWeek}`, payout.weekly, now);
      return granted;
    });
  }

  hasDailyRun(playerId: string): boolean {
    const row = this.db.prepare("SELECT 1 AS ok FROM player_daily_run WHERE player_id = ?").get(playerId) as
      | { ok?: number }
      | undefined;
    return Boolean(row);
  }

  readDailyRun(playerId: string): DailyRunState {
    const row = this.db
      .prepare(
        `SELECT utc_day, lives, ads_used, receipts_json, clock_high_water FROM player_daily_run WHERE player_id = ?`,
      )
      .get(playerId) as
      | {
          utc_day: string;
          lives: number;
          ads_used: number;
          receipts_json: string;
          clock_high_water: number;
        }
      | undefined;
    if (!row) return emptyDailyRun();
    return clampDailyRun({
      utcDay: row.utc_day,
      lives: row.lives,
      adsUsed: row.ads_used,
      claimedReceipts: parseJson<string[]>(row.receipts_json, []),
      clockHighWaterMs: row.clock_high_water,
    });
  }

  putDailyRun(playerId: string, state: DailyRunState): DailyRunState {
    const next = clampDailyRun(state);
    this.db
      .prepare(
        `INSERT INTO player_daily_run (player_id, utc_day, lives, ads_used, receipts_json, clock_high_water)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(player_id) DO UPDATE SET
           utc_day=excluded.utc_day,
           lives=excluded.lives,
           ads_used=excluded.ads_used,
           receipts_json=excluded.receipts_json,
           clock_high_water=excluded.clock_high_water`,
      )
      .run(playerId, next.utcDay, next.lives, next.adsUsed, JSON.stringify(next.claimedReceipts), next.clockHighWaterMs);
    return next;
  }

  dailyRun(playerId: string, now = Date.now()): DailyRunState {
    const next = refreshDailyRun(this.readDailyRun(playerId), now, true);
    return this.putDailyRun(playerId, next);
  }

  hydrateDailyRun(playerId: string, incoming: Partial<DailyRunState>, now = Date.now()): DailyRunState {
    if (this.hasDailyRun(playerId)) return this.dailyRun(playerId, now);
    const seeded = refreshDailyRun(clampDailyRun(incoming), now, true);
    return this.putDailyRun(playerId, seeded);
  }

  applyDailyRunOutcomeOnce(
    playerId: string,
    matchId: string,
    outcome: "win" | "loss" | "tie",
    now = Date.now(),
  ): DailyRunState {
    return this.transaction(() => {
      const existing = this.db
        .prepare(`SELECT outcome FROM daily_run_match WHERE player_id = ? AND match_id = ?`)
        .get(playerId, matchId) as { outcome?: string } | undefined;
      const current = this.dailyRun(playerId, now);
      if (existing) return current;
      this.db
        .prepare(`INSERT INTO daily_run_match (player_id, match_id, outcome) VALUES (?, ?, ?)`)
        .run(playerId, matchId, outcome);
      return this.putDailyRun(playerId, applyDailyRunOutcome(current, outcome, now, true));
    });
  }

  restoreLifeAd(playerId: string, receiptId: string, now = Date.now()): DailyRunResult {
    return this.transaction(() => {
      const current = this.dailyRun(playerId, now);
      const result = restoreDailyLifeAd(current, receiptId, now, true);
      if (!result.ok) return result;
      return { ok: true as const, state: this.putDailyRun(playerId, result.state) };
    });
  }
}

export interface StoredMatch {
  matchId: string;
  playerA: string;
  playerB: string;
  seed: number;
  status: "matched" | "cancelled";
  createdAt: number;
}

function parseJson<T>(raw: string | undefined, fallback: T): T {
  try {
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function mapPlayer(row: Record<string, unknown>, sessionToken: string): Player {
  return {
    playerId: String(row.player_id),
    provider: row.provider as AuthProvider,
    platform: row.platform as Platform,
    subject: String(row.subject),
    name: String(row.name),
    sessionToken,
    createdAt: Number(row.created_at),
  };
}
