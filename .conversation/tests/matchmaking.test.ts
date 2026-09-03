import { describe, expect, it } from "vitest";
import { GameSession } from "../src/engine/session";
import { ChronoClashServer } from "../src/server/core";
import { routeServer } from "../src/server/http";
import { MatchmakingState } from "../src/server/types";

function guestGame(ttl = 30 * 24 * 60 * 60 * 1000) {
  return new ChronoClashServer({
    dbPath: ":memory:",
    auth: { allowGuest: true, allowDevAuth: false, sessionTtlMs: ttl, maxSessions: 8 },
  });
}

async function signGuest(game: ChronoClashServer, device: string) {
  const res = await routeServer(game, {
    method: "POST",
    path: "/v1/auth",
    query: {},
    headers: {},
    body: { platform: "web", provider: "guest", token: device, displayName: device.slice(0, 16) },
  });
  expect(res.status).toBe(200);
  const body = res.body as { sessionToken: string; player: { playerId: string } };
  return { token: body.sessionToken, playerId: body.player.playerId };
}

function find(game: ChronoClashServer, token: string) {
  return routeServer(game, {
    method: "POST",
    path: "/v1/match",
    query: {},
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body: {},
  });
}

function cancel(game: ChronoClashServer, token: string) {
  return routeServer(game, {
    method: "POST",
    path: "/v1/match/cancel",
    query: {},
    headers: { authorization: `Bearer ${token}` },
    body: {},
  });
}

function getMatch(game: ChronoClashServer, token: string, matchId: string) {
  return routeServer(game, {
    method: "GET",
    path: `/v1/match/${matchId}`,
    query: {},
    headers: { authorization: `Bearer ${token}` },
    body: null,
  });
}

function logout(game: ChronoClashServer, token: string) {
  return routeServer(game, {
    method: "POST",
    path: "/v1/auth/logout",
    query: {},
    headers: { authorization: `Bearer ${token}` },
    body: {},
  });
}

describe("authoritative ONLINE 1v1 matchmaking", () => {
  it("rejects an unauthenticated player", async () => {
    const game = guestGame();
    const res = await find(game, "");
    expect(res.status).toBe(401);
    game.close();
  });

  it("queues the first player as searching", async () => {
    const game = guestGame();
    const a = await signGuest(game, "device-a");
    const res = await find(game, a.token);
    expect(res.status).toBe(200);
    const state = res.body as MatchmakingState;
    expect(state.status).toBe("searching");
    expect(state.matchId).toBeNull();
    expect(state.playerId).toBe(a.playerId);
    expect(state.opponentId).toBeNull();
    expect(state.players).toBeNull();
    expect(JSON.stringify(state)).not.toMatch(/sessionToken|Bearer|secret/i);
    game.close();
  });

  it("matches a second player and returns the same match after the first player polls", async () => {
    const game = guestGame();
    const a = await signGuest(game, "device-a");
    const b = await signGuest(game, "device-b");
    const first = (await find(game, a.token)).body as MatchmakingState;
    expect(first.status).toBe("searching");
    const second = (await find(game, b.token)).body as MatchmakingState;
    expect(second.status).toBe("matched");
    expect(second.matchId).toMatch(/^m_/);
    expect(second.players).toHaveLength(2);
    expect(new Set(second.players)).toEqual(new Set([a.playerId, b.playerId]));
    expect(second.opponentId).toBe(a.playerId);
    expect(second.seed).toEqual(expect.any(Number));

    const refresh = (await find(game, a.token)).body as MatchmakingState;
    expect(refresh.status).toBe("matched");
    expect(refresh.matchId).toBe(second.matchId);
    expect(refresh.opponentId).toBe(b.playerId);
    expect(refresh.players).toEqual(second.players);
    expect(refresh.seed).toBe(second.seed);

    const fromA = (await getMatch(game, a.token, second.matchId!)).body as MatchmakingState;
    const fromB = (await getMatch(game, b.token, second.matchId!)).body as MatchmakingState;
    expect(fromA.matchId).toBe(fromB.matchId);
    expect(fromA.players).toEqual(fromB.players);
    expect(fromA.players).toHaveLength(2);
    expect(JSON.stringify(fromA)).not.toMatch(/sessionToken|Bearer/i);
    game.close();
  });

  it("never matches a player with themselves and treats duplicate FIND MATCH as idempotent", async () => {
    const game = guestGame();
    const a = await signGuest(game, "solo-device");
    const one = (await find(game, a.token)).body as MatchmakingState;
    const two = (await find(game, a.token)).body as MatchmakingState;
    expect(one.status).toBe("searching");
    expect(two.status).toBe("searching");
    expect(two.matchId).toBeNull();
    expect(game.matchCount()).toBe(0);
    game.close();
  });

  it("pairs concurrent FIND MATCH requests into a single two-player match", async () => {
    const game = guestGame();
    const a = await signGuest(game, "race-a");
    const b = await signGuest(game, "race-b");
    const [left, right] = await Promise.all([find(game, a.token), find(game, b.token)]);
    expect(left.status).toBe(200);
    expect(right.status).toBe(200);
    const againA = (await find(game, a.token)).body as MatchmakingState;
    const againB = (await find(game, b.token)).body as MatchmakingState;
    expect(againA.status).toBe("matched");
    expect(againB.status).toBe("matched");
    expect(againA.matchId).toBe(againB.matchId);
    expect(againA.players).toHaveLength(2);
    expect(game.matchCount()).toBe(1);
    game.close();
  });

  it("cancels a searching player and lets the next opponent wait", async () => {
    const game = guestGame();
    const a = await signGuest(game, "cancel-a");
    const b = await signGuest(game, "cancel-b");
    expect(((await find(game, a.token)).body as MatchmakingState).status).toBe("searching");
    const stopped = (await cancel(game, a.token)).body as MatchmakingState;
    expect(stopped.status).toBe("cancelled");
    expect(stopped.matchId).toBeNull();
    const waiting = (await find(game, b.token)).body as MatchmakingState;
    expect(waiting.status).toBe("searching");
    expect(game.matchCount()).toBe(0);
    game.close();
  });

  it("removes queued state on sign out and rejects the old session", async () => {
    const game = guestGame();
    const a = await signGuest(game, "out-a");
    const b = await signGuest(game, "out-b");
    expect(((await find(game, a.token)).body as MatchmakingState).status).toBe("searching");
    expect((await logout(game, a.token)).status).toBe(200);
    expect((await find(game, a.token)).status).toBe(401);
    const waiting = (await find(game, b.token)).body as MatchmakingState;
    expect(waiting.status).toBe("searching");
    game.close();
  });

  it("rejects invalid and expired sessions for matchmaking", async () => {
    const game = guestGame(20);
    const a = await signGuest(game, "exp-a");
    expect((await find(game, "not-a-session")).status).toBe(401);
    expect((await find(game, a.token)).status).toBe(200);
    expect(() => game.findMatch(a.token, Date.now() + 50)).toThrow(/session expired|invalid session/i);
    game.close();
  });

  it("never puts more than two players in one match", async () => {
    const game = guestGame();
    const a = await signGuest(game, "cap-a");
    const b = await signGuest(game, "cap-b");
    const c = await signGuest(game, "cap-c");
    const d = await signGuest(game, "cap-d");
    await find(game, a.token);
    const first = (await find(game, b.token)).body as MatchmakingState;
    expect(first.status).toBe("matched");
    expect(first.players).toHaveLength(2);
    const third = (await find(game, c.token)).body as MatchmakingState;
    expect(third.status).toBe("searching");
    const fourth = (await find(game, d.token)).body as MatchmakingState;
    expect(fourth.status).toBe("matched");
    expect(fourth.matchId).not.toBe(first.matchId);
    expect(fourth.players).toHaveLength(2);
    expect(fourth.players).not.toContain(a.playerId);
    const outsider = await getMatch(game, c.token, first.matchId!);
    expect(outsider.status).toBe(403);
    game.close();
  });

  it("starts the existing Time Battle session from a matched ticket", () => {
    const session = new GameSession();
    session.beginOnlineTimeBattle({ matchId: "m_test", opponentId: "cc_rival", seed: 42 }, 1000);
    expect(session.onlineMatchId).toBe("m_test");
    expect(session.onlineRivalId).toBe("cc_rival");
    expect(session.mode).toBe("time");
    expect(session.screen).toBe("ready");
    session.startMatch(1400);
    expect(session.screen).toBe("match");
    expect(session.onlineRivalId).toBe("cc_rival");
  });
});
