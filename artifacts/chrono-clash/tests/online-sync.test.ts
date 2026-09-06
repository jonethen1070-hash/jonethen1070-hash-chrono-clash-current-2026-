import { describe, expect, it } from "vitest";
import { findAnyValidSwap } from "../src/engine/board";
import { GameSession } from "../src/engine/session";
import { BATTLE_COUNTDOWN_MS, BATTLE_FORFEIT_MS, BattleSync } from "../src/server/battle";
import { ChronoClashServer } from "../src/server/core";
import { routeServer } from "../src/server/http";
import { MATCH_SECONDS } from "../src/engine/types";
import { MatchmakingState } from "../src/server/types";

function guestGame() {
  return new ChronoClashServer({
    dbPath: ":memory:",
    auth: { allowGuest: true, allowDevAuth: false, sessionTtlMs: 30 * 24 * 60 * 60 * 1000, maxSessions: 8 },
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

function auth(token: string) {
  return { authorization: `Bearer ${token}` };
}

async function pair(game: ChronoClashServer) {
  const a = await signGuest(game, "sync-a");
  const b = await signGuest(game, "sync-b");
  const first = await routeServer(game, { method: "POST", path: "/v1/match", query: {}, headers: auth(a.token), body: {} });
  const second = await routeServer(game, { method: "POST", path: "/v1/match", query: {}, headers: auth(b.token), body: {} });
  expect(first.status).toBe(200);
  expect(second.status).toBe(200);
  const ticketA = first.body as MatchmakingState;
  const ticketB = second.body as MatchmakingState;
  expect(ticketA.status).toBe("searching");
  expect(ticketB.status).toBe("matched");
  const again = await routeServer(game, { method: "POST", path: "/v1/match", query: {}, headers: auth(a.token), body: {} });
  const matchedA = again.body as MatchmakingState;
  expect(matchedA.status).toBe("matched");
  expect(matchedA.matchId).toBe(ticketB.matchId);
  expect(matchedA.seed).toBe(ticketB.seed);
  expect(matchedA.players).toEqual(ticketB.players);
  return { a, b, ticketA: matchedA, ticketB };
}

async function httpJoin(game: ChronoClashServer, token: string, matchId: string) {
  return routeServer(game, {
    method: "POST",
    path: `/v1/match/${matchId}/join`,
    query: {},
    headers: auth(token),
    body: {},
  });
}

async function httpAction(game: ChronoClashServer, token: string, matchId: string, body: unknown) {
  return routeServer(game, {
    method: "POST",
    path: `/v1/match/${matchId}/action`,
    query: {},
    headers: auth(token),
    body,
  });
}

async function httpSync(game: ChronoClashServer, token: string, matchId: string, after = 0) {
  return routeServer(game, {
    method: "GET",
    path: `/v1/match/${matchId}/sync`,
    query: { after: String(after) },
    headers: auth(token),
    body: null,
  });
}

function playTime(now: number) {
  return now + BATTLE_COUNTDOWN_MS + 50;
}

function firstSwap(board: BattleSync["you"]["board"]) {
  const move = findAnyValidSwap(board);
  expect(move).not.toBeNull();
  return move!;
}

describe("online battle synchronization", () => {
  it("lets two different players join the same match with a shared matchId and seed", async () => {
    const game = guestGame();
    const { a, b, ticketA, ticketB } = await pair(game);
    const joinA = await httpJoin(game, a.token, ticketA.matchId!);
    const joinB = await httpJoin(game, b.token, ticketB.matchId!);
    expect(joinA.status).toBe(200);
    expect(joinB.status).toBe(200);
    const snapA = joinA.body as BattleSync;
    const snapB = joinB.body as BattleSync;
    expect(snapA.matchId).toBe(snapB.matchId);
    expect(snapA.seed).toBe(snapB.seed);
    expect(snapA.seed).toBe(ticketA.seed);
    expect(snapA.you.playerId).toBe(a.playerId);
    expect(snapA.opponent.playerId).toBe(b.playerId);
    expect(snapB.you.playerId).toBe(b.playerId);
    expect(snapB.opponent.playerId).toBe(a.playerId);
    expect(snapA.players).toEqual(snapB.players);
    game.close();
  });

  it("delivers Player A actions to Player B and Player B actions to Player A", async () => {
    const game = guestGame();
    const { a, b, ticketA } = await pair(game);
    const t0 = 1_000;
    game.joinBattle(a.token, ticketA.matchId!, t0);
    game.joinBattle(b.token, ticketA.matchId!, t0);
    const live = playTime(t0);
    const viewA = game.battleSync(a.token, ticketA.matchId!, 0, live);
    const moveA = firstSwap(viewA.you.board);
    const afterA = game.battleAction(
      a.token,
      ticketA.matchId!,
      { clientSeq: 1, type: "swap", a: moveA.a, b: moveA.b },
      live + 10,
    );
    expect(afterA.you.score).toBeGreaterThan(0);
    const seenByB = game.battleSync(b.token, ticketA.matchId!, 0, live + 20);
    expect(seenByB.opponent.score).toBe(afterA.you.score);
    expect(seenByB.opponent.board).toEqual(afterA.you.board);
    expect(seenByB.events.some((event) => event.actorId === a.playerId && event.type === "swap")).toBe(true);

    const moveB = firstSwap(seenByB.you.board);
    const afterB = game.battleAction(
      b.token,
      ticketA.matchId!,
      { clientSeq: 1, type: "swap", a: moveB.a, b: moveB.b },
      live + 30,
    );
    expect(afterB.you.score).toBeGreaterThan(0);
    const seenByA = game.battleSync(a.token, ticketA.matchId!, 0, live + 40);
    expect(seenByA.opponent.score).toBe(afterB.you.score);
    expect(seenByA.opponent.board).toEqual(afterB.you.board);
    expect(seenByA.you.score).toBe(afterA.you.score);
    game.close();
  });

  it("rejects an invalid player id and an unknown match", async () => {
    const game = guestGame();
    const { a, ticketA } = await pair(game);
    const outsider = await signGuest(game, "sync-outsider");
    const join = await httpJoin(game, outsider.token, ticketA.matchId!);
    expect(join.status).toBe(403);
    const action = await httpAction(game, outsider.token, ticketA.matchId!, { clientSeq: 1, type: "heartbeat" });
    expect(action.status).toBe(403);
    const sync = await httpSync(game, outsider.token, ticketA.matchId!);
    expect(sync.status).toBe(403);
    const missing = await httpJoin(game, a.token, "m_does_not_exist");
    expect(missing.status).toBe(404);
    await httpJoin(game, a.token, ticketA.matchId!);
    const claim = await httpAction(game, a.token, ticketA.matchId!, { clientSeq: 1, type: "win" });
    expect(claim.status).toBe(400);
    game.close();
  });

  it("handles a disconnected player as a forfeit for the remaining player", async () => {
    const game = guestGame();
    const { a, b, ticketA } = await pair(game);
    const t0 = 5_000;
    game.joinBattle(a.token, ticketA.matchId!, t0);
    game.joinBattle(b.token, ticketA.matchId!, t0);
    const live = playTime(t0);
    game.battleSync(a.token, ticketA.matchId!, 0, live);
    const later = live + BATTLE_FORFEIT_MS + 25;
    const snap = game.battleSync(a.token, ticketA.matchId!, 0, later);
    expect(snap.phase).toBe("ended");
    expect(snap.result?.reason).toBe("forfeit");
    expect(snap.result?.winnerId).toBe(a.playerId);
    expect(snap.opponentConnected).toBe(false);
    game.close();
  });

  it("ignores duplicate and stale clientSeq values without applying them twice", async () => {
    const game = guestGame();
    const { a, b, ticketA } = await pair(game);
    const t0 = 8_000;
    game.joinBattle(a.token, ticketA.matchId!, t0);
    game.joinBattle(b.token, ticketA.matchId!, t0);
    const live = playTime(t0);
    const viewA = game.battleSync(a.token, ticketA.matchId!, 0, live);
    const move = firstSwap(viewA.you.board);
    const first = game.battleAction(
      a.token,
      ticketA.matchId!,
      { clientSeq: 2, type: "swap", a: move.a, b: move.b },
      live + 10,
    );
    const score = first.you.score;
    expect(score).toBeGreaterThan(0);
    const dup = game.battleAction(
      a.token,
      ticketA.matchId!,
      { clientSeq: 2, type: "swap", a: move.a, b: move.b },
      live + 20,
    );
    expect(dup.you.score).toBe(score);
    const stale = game.battleAction(
      a.token,
      ticketA.matchId!,
      { clientSeq: 1, type: "swap", a: move.a, b: move.b },
      live + 30,
    );
    expect(stale.you.score).toBe(score);
    expect(stale.yourLastClientSeq).toBe(2);
    game.close();
  });

  it("rewinds the online fighter state, not only its board", async () => {
    const game = guestGame();
    const { a, b, ticketA } = await pair(game);
    const t0 = 9_000;
    game.joinBattle(a.token, ticketA.matchId!, t0);
    game.joinBattle(b.token, ticketA.matchId!, t0);
    let now = playTime(t0);
    let seq = 1;
    let beforeLast: BattleSync["you"] | null = null;
    let latest = game.battleSync(a.token, ticketA.matchId!, 0, now);

    for (let i = 0; i < 12 && latest.you.energy < 26; i++) {
      const move = firstSwap(latest.you.board);
      beforeLast = latest.you;
      latest = game.battleAction(
        a.token,
        ticketA.matchId!,
        { clientSeq: seq++, type: "swap", a: move.a, b: move.b },
        now + 10,
      );
      now += 1_000;
      latest = game.battleSync(a.token, ticketA.matchId!, 0, now);
    }

    expect(beforeLast).not.toBeNull();
    expect(latest.you.energy).toBeGreaterThanOrEqual(26);
    const rewound = game.battleAction(
      a.token,
      ticketA.matchId!,
      { clientSeq: seq, type: "power", id: "rewind" },
      now + 10,
    );
    expect(rewound.you.board).toEqual(beforeLast!.board);
    expect(rewound.you.score).toBe(beforeLast!.score);
    expect(rewound.you.combo).toBe(beforeLast!.combo);
    expect(rewound.you.attack).toBe(beforeLast!.attack);
    expect(rewound.you.energy).toBe(Math.max(0, beforeLast!.energy - 26));
    game.close();
  });

  it("ends the match from the server clock and does not accept a client-declared winner", async () => {
    const game = guestGame();
    const { a, b, ticketA } = await pair(game);
    const t0 = 20_000;
    game.joinBattle(a.token, ticketA.matchId!, t0);
    game.joinBattle(b.token, ticketA.matchId!, t0);
    const live = playTime(t0);
    const viewA = game.battleSync(a.token, ticketA.matchId!, 0, live);
    const move = firstSwap(viewA.you.board);
    const scored = game.battleAction(
      a.token,
      ticketA.matchId!,
      { clientSeq: 1, type: "swap", a: move.a, b: move.b },
      live + 10,
    );
    game.battleAction(b.token, ticketA.matchId!, { clientSeq: 1, type: "heartbeat" }, live + 15);
    const finished = game.battleSync(a.token, ticketA.matchId!, 0, live + MATCH_SECONDS * 1000 + 80);
    expect(finished.phase).toBe("ended");
    expect(finished.result?.reason).toBe("time");
    expect(finished.result?.winnerId).toBe(scored.you.score > 0 ? a.playerId : null);
    expect(finished.result?.scores[a.playerId]).toBe(scored.you.score);
    const seenB = game.battleSync(b.token, ticketA.matchId!, 0, live + MATCH_SECONDS * 1000 + 90);
    expect(seenB.phase).toBe("ended");
    expect(seenB.result?.winnerId).toBe(finished.result?.winnerId);
    game.close();
  });

  it("treats a player leaving as a win for the opponent", async () => {
    const game = guestGame();
    const { a, b, ticketA } = await pair(game);
    const t0 = 40_000;
    game.joinBattle(a.token, ticketA.matchId!, t0);
    game.joinBattle(b.token, ticketA.matchId!, t0);
    const live = playTime(t0);
    const left = game.leaveBattle(a.token, ticketA.matchId!, live);
    expect(left.phase).toBe("ended");
    expect(left.result?.reason).toBe("leave");
    expect(left.result?.winnerId).toBe(b.playerId);
    const seenB = game.battleSync(b.token, ticketA.matchId!, 0, live + 10);
    expect(seenB.result?.winnerId).toBe(b.playerId);
    game.close();
  });

  it("applies a remote snapshot onto the existing Time Battle rival board", () => {
    const local = new GameSession();
    local.beginOnlineTimeBattle(
      { matchId: "m_sync", opponentId: "cc_b", seed: 99, playerId: "cc_a", players: ["cc_a", "cc_b"] },
      100,
    );
    local.startMatch(200);
    const before = local.opponent.score;
    local.applyBattleSnapshot(
      {
        matchId: "m_sync",
        seed: 99,
        seq: 4,
        phase: "playing",
        remainingMs: 54_000,
        you: {
          playerId: "cc_a",
          board: local.player.board,
          score: local.player.score,
          combo: 0,
          energy: 0,
          attack: 0,
          lock: 0,
          lastClientSeq: 0,
        },
        opponent: {
          playerId: "cc_b",
          board: local.opponent.board,
          score: 420,
          combo: 3,
          energy: 12,
          attack: 40,
          lock: 0,
        },
        result: null,
        yourLastClientSeq: 0,
      },
      800,
    );
    expect(local.onlineRemote).toBe(true);
    expect(local.opponent.score).toBe(420);
    expect(local.opponent.score).not.toBe(before);
    expect(local.opponent.energy).toBe(12);
    expect(local.phase).toBe("playing");
    expect(local.remainingMs(800)).toBe(54_000);
  });

  it("rejects older snapshots and advances the remote clock between polls", () => {
    const local = new GameSession();
    local.beginOnlineTimeBattle(
      { matchId: "m_ordered", opponentId: "cc_b", seed: 100, playerId: "cc_a", players: ["cc_a", "cc_b"] },
      100,
    );
    local.startMatch(200);
    const snapshot = (seq: number, score: number, remainingMs: number) => ({
      matchId: "m_ordered",
      seed: 100,
      seq,
      phase: "playing" as const,
      remainingMs,
      you: {
        playerId: "cc_a",
        board: local.player.board,
        score: 0,
        combo: 0,
        energy: 0,
        attack: 0,
        lock: 0,
        lastClientSeq: 0,
      },
      opponent: {
        playerId: "cc_b",
        board: local.opponent.board,
        score,
        combo: 0,
        energy: 0,
        attack: 0,
        lock: 0,
      },
      result: null,
      yourLastClientSeq: 0,
    });

    local.applyBattleSnapshot(snapshot(8, 500, 50_000), 1_000);
    expect(local.remainingMs(2_000)).toBe(49_000);
    local.applyBattleSnapshot(snapshot(7, 9999, 1_000), 1_100);
    expect(local.opponent.score).toBe(500);
    expect(local.remainingMs(2_000)).toBe(49_000);
  });
});
