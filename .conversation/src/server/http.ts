import { AuthError } from "./auth";
import { publicAuthConfig } from "./auth-config";
import { ChronoClashServer } from "./core";
import { AuthRequest } from "./types";
import { DailyRunState } from "../engine/dailyRun";

export interface HttpRequest {
  method: string;
  path: string;
  query: Record<string, string>;
  headers: Record<string, string>;
  body: unknown;
}

export interface HttpResponse {
  status: number;
  body: unknown;
}

export async function routeServer(game: ChronoClashServer, req: HttpRequest): Promise<HttpResponse> {
  try {
    return await dispatch(game, req);
  } catch (err) {
    if (err instanceof AuthError) return { status: err.status, body: { error: err.message } };
    return { status: 500, body: { error: err instanceof Error ? err.message : "server error" } };
  }
}

async function dispatch(game: ChronoClashServer, req: HttpRequest): Promise<HttpResponse> {
  const { method, path } = req;
  if (method === "GET" && path === "/v1/health") {
    const clock = game.clock();
    return { status: 200, body: { ok: true, service: "chrono-clash", auth: publicAuthConfig(game.authConfig), utcMs: clock.utcMs, utcDay: clock.utcDay } };
  }
  if (method === "GET" && path === "/v1/auth/config") {
    return { status: 200, body: publicAuthConfig(game.authConfig) };
  }
  if (method === "POST" && path === "/v1/auth") {
    const out = await game.auth((req.body ?? {}) as AuthRequest);
    return {
      status: 200,
      body: {
        player: publicPlayer(out.player),
        created: out.created,
        sessionToken: out.player.sessionToken,
      },
    };
  }
  const token = bearer(req.headers);
  if (method === "GET" && path === "/v1/me") {
    return { status: 200, body: { player: publicPlayer(game.me(token)) } };
  }
  if (method === "GET" && path === "/v1/economy") {
    return { status: 200, body: { economy: game.economy(token) } };
  }
  if (method === "POST" && path === "/v1/economy/buy") {
    const powerId = String((req.body as { powerId?: string } | null)?.powerId || "");
    const out = game.buyPower(token, powerId);
    return { status: out.ok ? 200 : 400, body: out };
  }
  if (method === "POST" && path === "/v1/economy/hydrate") {
    const body = (req.body ?? {}) as { winningCoins?: number; powerCharges?: Record<string, number>; claimedAdReceipts?: string[] };
    return { status: 200, body: { economy: game.hydrateEconomy(token, {
      winningCoins: Number(body.winningCoins) || 0,
      powerCharges: body.powerCharges && typeof body.powerCharges === "object" ? body.powerCharges : {},
      claimedAdReceipts: Array.isArray(body.claimedAdReceipts) ? body.claimedAdReceipts : [],
    }) } };
  }
  if (method === "POST" && path === "/v1/economy/ad-reward") {
    const body = (req.body ?? {}) as { powerId?: string; receiptId?: string; completed?: unknown };
    if (body.completed) {
      return { status: 400, body: { ok: false, reason: "receipt", error: "completed callbacks are not accepted" } };
    }
    const out = game.claimAdReward(token, String(body.powerId || ""), String(body.receiptId || ""));
    return { status: out.ok ? 200 : 400, body: out };
  }
  if (method === "GET" && path === "/v1/daily-run") {
    return { status: 200, body: { daily: game.dailyRun(token) } };
  }
  if (method === "POST" && path === "/v1/daily-run/hydrate") {
    const body = (req.body ?? {}) as Partial<DailyRunState>;
    return { status: 200, body: { daily: game.hydrateDailyRun(token, body) } };
  }
  if (method === "POST" && path === "/v1/daily-run/ad-reward") {
    const body = (req.body ?? {}) as { receiptId?: string; completed?: unknown };
    if (body.completed) {
      return { status: 400, body: { ok: false, reason: "receipt", error: "completed callbacks are not accepted" } };
    }
    const out = game.claimLifeAd(token, String(body.receiptId || ""));
    return { status: out.ok ? 200 : 400, body: out };
  }
  if (method === "POST" && path === "/v1/auth/logout") {
    game.signOut(token);
    return { status: 200, body: { ok: true } };
  }
  if (method === "POST" && path === "/v1/match") {
    return { status: 200, body: game.findMatch(token) };
  }
  if (method === "POST" && path === "/v1/match/cancel") {
    return { status: 200, body: game.cancelQueue(token) };
  }
  const matchRoute = parseMatchPath(path);
  if (matchRoute) {
    const { matchId, sub } = matchRoute;
    if (method === "POST" && sub === "join") {
      return { status: 200, body: game.joinBattle(token, matchId) };
    }
    if (method === "POST" && sub === "action") {
      return { status: 200, body: game.battleAction(token, matchId, (req.body ?? {}) as { clientSeq: number; type: "swap" | "power" | "heartbeat" }) };
    }
    if (method === "POST" && sub === "leave") {
      return { status: 200, body: game.leaveBattle(token, matchId) };
    }
    if (method === "GET" && sub === "sync") {
      const after = Number.parseInt(req.query.after || "0", 10);
      return { status: 200, body: game.battleSync(token, matchId, Number.isFinite(after) ? after : 0) };
    }
    if (method === "GET" && !sub) {
      return { status: 200, body: game.getMatch(token, matchId) };
    }
  }
  return { status: 404, body: { error: "not found" } };
}

function parseMatchPath(path: string): { matchId: string; sub: string | null } | null {
  if (!path.startsWith("/v1/match/")) return null;
  const rest = path.slice("/v1/match/".length);
  if (!rest || rest === "cancel") return null;
  const parts = rest.split("/").filter(Boolean).map((part) => decodeURIComponent(part));
  if (parts.length === 0 || parts.length > 2) return null;
  return { matchId: parts[0]!, sub: parts[1] ?? null };
}

function bearer(headers: Record<string, string>): string {
  const raw = headers.authorization || headers.Authorization || "";
  return raw.replace(/^Bearer\s+/i, "").trim();
}

function publicPlayer(player: { playerId: string; name: string; provider: string; platform: string }) {
  return {
    playerId: player.playerId,
    name: player.name,
    provider: player.provider,
    platform: player.platform,
  };
}
