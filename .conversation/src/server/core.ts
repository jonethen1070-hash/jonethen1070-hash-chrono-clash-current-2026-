import { AuthError, verifyAuth } from "./auth";
import { AuthRuntimeConfig, loadAuthConfig } from "./auth-config";
import { BattleActionInput, BattleDirector, BattleSync } from "./battle";
import { ChronoStore, StoredMatch } from "./db";
import { fnv1a, playerIdFor, randomToken } from "./ids";
import { AuthRequest, MatchmakingState, Player } from "./types";
import {
  buyCharge,
  claimAdReward,
  EconomyState,
  utcDayKey,
} from "../engine/economy";
import { DailyRunState, publicDailyRun } from "../engine/dailyRun";

export class ChronoClashServer {
  private store: ChronoStore;
  readonly authConfig: AuthRuntimeConfig;
  readonly battles: BattleDirector;

  constructor(opts: { dbPath?: string; auth?: Partial<AuthRuntimeConfig> } = {}) {
    this.store = new ChronoStore(opts.dbPath ?? ":memory:");
    this.authConfig = loadAuthConfig(process.env, opts.auth || {});
    this.battles = new BattleDirector({
      spendCharge: (playerId, powerId) => this.store.spendCharge(playerId, powerId),
    });
  }

  close(): void {
    this.store.close();
  }

  async auth(req: AuthRequest): Promise<{ player: Player; created: boolean }> {
    const ident = await verifyAuth(req, this.authConfig);
    const playerId = playerIdFor(ident.provider, ident.subject);
    const existing = this.store.getPlayer(playerId);
    const token = randomToken(16);
    if (existing) {
      existing.sessionToken = token;
      existing.platform = ident.platform;
      if (req.displayName) existing.name = ident.name;
      this.store.upsertPlayer(existing);
      this.store.putSession(token, playerId, Date.now());
      this.store.pruneSessions(playerId, this.authConfig.maxSessions);
      return { player: { ...existing, sessionToken: token }, created: false };
    }
    const player: Player = {
      playerId,
      provider: ident.provider,
      platform: ident.platform,
      subject: ident.subject,
      name: ident.name,
      sessionToken: token,
      createdAt: Date.now(),
    };
    this.store.upsertPlayer(player);
    this.store.putSession(token, playerId, Date.now());
    this.store.pruneSessions(playerId, this.authConfig.maxSessions);
    return { player: { ...player }, created: true };
  }

  requireSession(token: string, now = Date.now()): Player {
    if (!token.trim()) throw new AuthError("sign in required", 401);
    const session = this.store.getSession(token);
    if (!session) throw new AuthError("invalid session", 401);
    if (now - session.createdAt > this.authConfig.sessionTtlMs) {
      this.store.deleteSession(token);
      throw new AuthError("session expired", 401);
    }
    return { ...session.player };
  }

  me(token: string, now = Date.now()): Player {
    return this.requireSession(token, now);
  }

  economy(token: string, now = Date.now()): EconomyState {
    const player = this.requireSession(token, now);
    return this.store.getEconomy(player.playerId);
  }

  buyPower(token: string, powerId: string, now = Date.now()): { ok: boolean; reason?: string; economy: EconomyState } {
    const player = this.requireSession(token, now);
    return this.store.transaction(() => {
      const current = this.store.getEconomy(player.playerId);
      const result = buyCharge(current, powerId);
      if (!result.ok) return { ok: false, reason: result.reason, economy: current };
      return { ok: true, economy: this.store.putEconomy(player.playerId, result.state, now) };
    });
  }

  claimAdReward(token: string, powerId: string, receiptId: string, now = Date.now()): {
    ok: boolean;
    reason?: string;
    economy: EconomyState;
  } {
    const player = this.requireSession(token, now);
    return this.store.transaction(() => {
      const current = this.store.getEconomy(player.playerId);
      const result = claimAdReward(current, powerId, receiptId);
      if (!result.ok) return { ok: false, reason: result.reason, economy: current };
      return { ok: true, economy: this.store.putEconomy(player.playerId, result.state, now) };
    });
  }

  seedEconomy(token: string, state: EconomyState, now = Date.now()): EconomyState {
    const player = this.requireSession(token, now);
    return this.store.putEconomy(player.playerId, state, now);
  }

  hydrateEconomy(token: string, state: EconomyState, now = Date.now()): EconomyState {
    const player = this.requireSession(token, now);
    return this.store.transaction(() => {
      const current = this.store.getEconomy(player.playerId);
      const empty =
        current.winningCoins === 0 &&
        current.claimedAdReceipts.length === 0 &&
        Object.values(current.powerCharges).every((n) => !n);
      if (!empty) return current;
      return this.store.putEconomy(player.playerId, state, now);
    });
  }

  clock(now = Date.now()): { utcMs: number; utcDay: string } {
    const utcMs = Math.max(0, Math.trunc(Number(now) || 0));
    return { utcMs, utcDay: utcDayKey(utcMs) };
  }

  dailyRun(token: string, now = Date.now()) {
    const player = this.requireSession(token, now);
    return publicDailyRun(this.store.dailyRun(player.playerId, now), now);
  }

  hydrateDailyRun(token: string, state: Partial<DailyRunState>, now = Date.now()) {
    const player = this.requireSession(token, now);
    return publicDailyRun(this.store.hydrateDailyRun(player.playerId, state, now), now);
  }

  seedDailyRun(token: string, state: DailyRunState, now = Date.now()) {
    const player = this.requireSession(token, now);
    return publicDailyRun(this.store.putDailyRun(player.playerId, state), now);
  }

  claimLifeAd(token: string, receiptId: string, now = Date.now()): {
    ok: boolean;
    reason?: string;
    daily: ReturnType<typeof publicDailyRun>;
  } {
    const player = this.requireSession(token, now);
    const result = this.store.restoreLifeAd(player.playerId, receiptId, now);
    const daily = publicDailyRun(result.state, now);
    if (!result.ok) return { ok: false, reason: result.reason, daily };
    return { ok: true, daily };
  }

  signOut(token: string): void {
    if (!token.trim()) return;
    const session = this.store.getSession(token);
    if (session) this.leaveMatchmaking(session.player.playerId);
    this.store.deleteSession(token);
  }

  joinBattle(token: string, matchId: string, now = Date.now()): BattleSync {
    const player = this.requireSession(token, now);
    const match = this.store.getMatch(matchId);
    if (!match) throw new AuthError("match not found", 404);
    return this.afterBattle(this.battles.join(match, player.playerId, now));
  }

  battleAction(token: string, matchId: string, input: BattleActionInput, now = Date.now()): BattleSync {
    const player = this.requireSession(token, now);
    return this.afterBattle(this.battles.action(matchId, player.playerId, input, now));
  }

  battleSync(token: string, matchId: string, afterSeq = 0, now = Date.now()): BattleSync {
    const player = this.requireSession(token, now);
    return this.afterBattle(this.battles.sync(matchId, player.playerId, afterSeq, now));
  }

  leaveBattle(token: string, matchId: string, now = Date.now()): BattleSync {
    const player = this.requireSession(token, now);
    return this.afterBattle(this.battles.leave(matchId, player.playerId, now));
  }

  findMatch(token: string, now = Date.now()): MatchmakingState {
    const player = this.requireSession(token, now);
    return this.store.transaction(() => this.pairOrQueue(player.playerId, now));
  }

  startAuthenticatedMatch(token: string, now = Date.now()): MatchmakingState {
    return this.findMatch(token, now);
  }

  getMatch(token: string, matchId: string, now = Date.now()): MatchmakingState {
    const player = this.requireSession(token, now);
    const match = this.store.getMatch(matchId);
    if (!match) throw new AuthError("match not found", 404);
    if (match.playerA !== player.playerId && match.playerB !== player.playerId) {
      throw new AuthError("not in this match", 403);
    }
    return this.viewMatch(player.playerId, match);
  }

  cancelQueue(token: string, now = Date.now()): MatchmakingState {
    const player = this.requireSession(token, now);
    return this.store.transaction(() => {
      const activeId = this.store.getActiveMatchId(player.playerId);
      if (activeId) {
        const match = this.store.getMatch(activeId);
        if (match) return this.viewMatch(player.playerId, match);
      }
      this.store.dequeuePlayer(player.playerId);
      return {
        status: "cancelled",
        matchId: null,
        playerId: player.playerId,
        opponentId: null,
        players: null,
        seed: null,
      };
    });
  }

  matchCount(): number {
    return this.store.countMatches();
  }

  private leaveMatchmaking(playerId: string): void {
    this.battles.leaveAllForPlayer(playerId);
    this.store.transaction(() => {
      this.store.dequeuePlayer(playerId);
      const activeId = this.store.getActiveMatchId(playerId);
      if (activeId) this.store.cancelMatch(activeId);
    });
  }

  private afterBattle(snap: BattleSync): BattleSync {
    if (snap.phase === "cancelled" || snap.result?.reason === "leave" || snap.result?.reason === "forfeit") {
      this.store.cancelMatch(snap.matchId);
      if (snap.result && snap.players.length === 2) this.applyBattleDailyRun(snap);
    } else if (snap.phase === "ended") {
      this.store.clearPlayerMatch(snap.players[0]);
      this.store.clearPlayerMatch(snap.players[1]);
      if (snap.result && snap.result.reason !== "cancelled") {
        const winnerId = snap.result.winnerId;
        for (const playerId of snap.players) {
          const outcome = !winnerId ? "tie" : winnerId === playerId ? "win" : "loss";
          this.store.applyMatchCoins(playerId, snap.matchId, outcome);
        }
        this.applyBattleDailyRun(snap);
      }
    }
    return snap;
  }

  private applyBattleDailyRun(snap: BattleSync): void {
    if (!snap.result || snap.players.length !== 2) return;
    const winnerId = snap.result.winnerId;
    for (const playerId of snap.players) {
      const outcome = !winnerId ? "tie" : winnerId === playerId ? "win" : "loss";
      this.store.applyDailyRunOutcomeOnce(playerId, snap.matchId, outcome);
    }
  }

  private pairOrQueue(playerId: string, now: number): MatchmakingState {
    const activeId = this.store.getActiveMatchId(playerId);
    if (activeId) {
      const existing = this.store.getMatch(activeId);
      if (existing && existing.status === "matched") return this.viewMatch(playerId, existing);
      this.store.clearPlayerMatch(playerId);
    }

    if (this.store.dailyRun(playerId, now).lives <= 0) {
      throw new AuthError("no lives remaining", 403);
    }

    const opponentId = this.store.nextQueuedOpponent(playerId);
    if (opponentId && opponentId !== playerId) {
      this.store.dequeuePlayer(opponentId);
      this.store.dequeuePlayer(playerId);
      const matchId = `m_${randomToken(8)}`;
      const pair = [playerId, opponentId].sort();
      const match: StoredMatch = {
        matchId,
        playerA: pair[0] as string,
        playerB: pair[1] as string,
        seed: Number.parseInt(fnv1a(matchId), 16) >>> 0,
        status: "matched",
        createdAt: now,
      };
      this.store.createMatch(match);
      return this.viewMatch(playerId, match);
    }

    this.store.enqueuePlayer(playerId, now);
    return {
      status: "searching",
      matchId: null,
      playerId,
      opponentId: null,
      players: null,
      seed: null,
    };
  }

  private viewMatch(playerId: string, match: StoredMatch): MatchmakingState {
    const players = [match.playerA, match.playerB];
    if (players.length !== 2 || new Set(players).size !== 2) {
      return {
        status: "error",
        matchId: match.matchId,
        playerId,
        opponentId: null,
        players: null,
        seed: null,
      };
    }
    return {
      status: match.status === "cancelled" ? "cancelled" : "matched",
      matchId: match.matchId,
      playerId,
      opponentId: match.playerA === playerId ? match.playerB : match.playerA,
      players,
      seed: match.seed,
    };
  }
}
