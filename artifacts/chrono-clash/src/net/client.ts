import type { BattleActionInput, BattleSync } from "../server/battle";
import { AuthProvider, MatchmakingState, Platform, Player, PublicAuthConfig } from "../server/types";
import { clearOnlineSession, loadOnlineSession, saveOnlineSession } from "./identity";
import type { EconomyState } from "../engine/economy";
import type { DailyRunState } from "../engine/dailyRun";

export class ChronoClient {
  base: string;
  token = "";
  player: Player | null = null;

  constructor(base = "") {
    this.base = base.replace(/\/$/, "");
  }

  restore(): { token: string; playerId: string } | null {
    const saved = loadOnlineSession();
    if (saved) this.token = saved.token;
    return saved;
  }

  async authConfig() {
    return this.request<PublicAuthConfig>("GET", "/v1/auth/config", undefined, false);
  }

  async signIn(input: {
    platform: Platform;
    provider: AuthProvider;
    token: string;
    displayName?: string;
  }) {
    const res = await this.request<{ player: Player; sessionToken: string }>("POST", "/v1/auth", input, false);
    this.token = res.sessionToken;
    this.player = res.player;
    saveOnlineSession(this.token, res.player.playerId);
    return { token: this.token, player: res.player };
  }

  async signOut(): Promise<void> {
    const token = this.token;
    this.token = "";
    this.player = null;
    clearOnlineSession();
    if (!token) return;
    try {
      await fetch(`${this.base}/v1/auth/logout`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
      });
    } catch {
      /* local session is already cleared */
    }
  }

  async me(): Promise<Player> {
    const res = await this.request<{ player: Player }>("GET", "/v1/me");
    this.player = res.player;
    return res.player;
  }

  async economy(): Promise<EconomyState> {
    const res = await this.request<{ economy: EconomyState }>("GET", "/v1/economy");
    return res.economy;
  }

  async buyPower(powerId: string): Promise<{ ok: boolean; reason?: string; economy: EconomyState }> {
    return this.request("POST", "/v1/economy/buy", { powerId });
  }

  async claimAdReward(powerId: string, receiptId: string): Promise<{ ok: boolean; reason?: string; economy: EconomyState }> {
    return this.request("POST", "/v1/economy/ad-reward", { powerId, receiptId });
  }

  async hydrateEconomy(state: EconomyState): Promise<EconomyState> {
    const res = await this.request<{ economy: EconomyState }>("POST", "/v1/economy/hydrate", state);
    return res.economy;
  }

  async health(): Promise<{ ok: boolean; utcMs: number; utcDay: string }> {
    return this.request("GET", "/v1/health", undefined, false);
  }

  async dailyRun(): Promise<DailyRunState> {
    const res = await this.request<{ daily: DailyRunState }>("GET", "/v1/daily-run");
    return res.daily;
  }

  async hydrateDailyRun(state: DailyRunState): Promise<DailyRunState> {
    const res = await this.request<{ daily: DailyRunState }>("POST", "/v1/daily-run/hydrate", state);
    return res.daily;
  }

  async claimLifeAd(receiptId: string): Promise<{ ok: boolean; reason?: string; daily: DailyRunState }> {
    return this.request("POST", "/v1/daily-run/ad-reward", { receiptId });
  }

  async startMatch(): Promise<MatchmakingState> {
    return this.findMatch();
  }

  async findMatch(): Promise<MatchmakingState> {
    if (!this.token) throw new Error("Sign in to start an ONLINE 1v1 match.");
    return this.request<MatchmakingState>("POST", "/v1/match");
  }

  async getMatch(matchId: string): Promise<MatchmakingState> {
    if (!this.token) throw new Error("Sign in to start an ONLINE 1v1 match.");
    return this.request<MatchmakingState>("GET", `/v1/match/${encodeURIComponent(matchId)}`);
  }

  async cancelMatch(): Promise<MatchmakingState> {
    if (!this.token) throw new Error("Sign in to start an ONLINE 1v1 match.");
    return this.request<MatchmakingState>("POST", "/v1/match/cancel");
  }

  async joinBattle(matchId: string): Promise<BattleSync> {
    if (!this.token) throw new Error("Sign in to start an ONLINE 1v1 match.");
    return this.request<BattleSync>("POST", `/v1/match/${encodeURIComponent(matchId)}/join`);
  }

  async sendBattleAction(matchId: string, action: BattleActionInput): Promise<BattleSync> {
    if (!this.token) throw new Error("Sign in to start an ONLINE 1v1 match.");
    return this.request<BattleSync>("POST", `/v1/match/${encodeURIComponent(matchId)}/action`, action);
  }

  async syncBattle(matchId: string, afterSeq = 0): Promise<BattleSync> {
    if (!this.token) throw new Error("Sign in to start an ONLINE 1v1 match.");
    return this.request<BattleSync>("GET", `/v1/match/${encodeURIComponent(matchId)}/sync?after=${encodeURIComponent(String(afterSeq))}`);
  }

  async leaveBattle(matchId: string): Promise<BattleSync> {
    if (!this.token) throw new Error("Sign in to start an ONLINE 1v1 match.");
    return this.request<BattleSync>("POST", `/v1/match/${encodeURIComponent(matchId)}/leave`);
  }

  private async request<T>(method: string, path: string, body?: unknown, auth = true): Promise<T> {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (auth && this.token) headers.authorization = `Bearer ${this.token}`;
    const res = await fetch(`${this.base}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const raw = await res.text();
    let json: (T & { error?: string }) | null = null;
    try {
      json = raw ? (JSON.parse(raw) as T & { error?: string }) : null;
    } catch {
      json = null;
    }
    if (!res.ok) {
      throw netError(json?.error || `request failed ${res.status}`, res.status);
    }
    // A proxy or static host can answer 200 with HTML; that is a transport fault, not a bad session.
    if (!json) throw netError(`unreadable response from ${path}`, 0);
    return json;
  }
}

function netError(message: string, status: number): Error & { status: number } {
  const error = new Error(message) as Error & { status: number };
  error.status = status;
  return error;
}

/** True only when the server explicitly rejected the session, so local state may be cleared. */
export function isAuthFailure(err: unknown): boolean {
  const status = (err as { status?: number } | null)?.status;
  if (status === 401 || status === 403) return true;
  if (status !== undefined) return false;
  const message = err instanceof Error ? err.message : "";
  return /invalid session|session expired|sign in required/i.test(message);
}
