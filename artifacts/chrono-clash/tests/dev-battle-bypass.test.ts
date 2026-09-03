import { afterEach, describe, expect, it } from "vitest";
import {
  applyDailyRunOutcome,
  canStartDailyRun,
  emptyDailyRun,
  refreshDailyRun,
  restoreDailyLifeAd,
  spendDailyLife,
} from "../src/engine/dailyRun";
import {
  canEnterLocalBattle,
  DEV_BATTLE_BYPASS_ALLOWED,
  DEV_BATTLE_QUERY,
  isDevBattleBypassEnabled,
  resolveDevBattleBypass,
  setDevBattleBypassForTests,
} from "../src/engine/devBattleBypass";
import { utcDayKey } from "../src/engine/economy";
import { GameSession } from "../src/engine/session";
import { EMPTY_PROGRESS } from "../src/engine/types";
import { dailyRunHtml, readyPowerStripHtml } from "../src/ui/metaViews";
import { ChronoClashServer } from "../src/server/core";
import { routeServer } from "../src/server/http";

const DAY = Date.UTC(2026, 7, 25, 12, 0, 0);
const originalLocation = (globalThis as { location?: unknown }).location;

afterEach(() => {
  setDevBattleBypassForTests(null);
  if (originalLocation === undefined) Reflect.deleteProperty(globalThis, "location");
  else Object.defineProperty(globalThis, "location", { value: originalLocation, configurable: true });
});

function emptyLivesGame(): GameSession {
  const game = new GameSession();
  game.progress = {
    ...EMPTY_PROGRESS,
    tutorialDone: true,
    dailyLives: 0,
    dailyRunDay: utcDayKey(DAY),
    winningCoins: 40,
    unlocked: [...EMPTY_PROGRESS.unlocked],
    powersUsed: { freeze: 0, timeshift: 0, rewind: 0 },
  };
  game.syncTrustedClock(DAY);
  return game;
}

function finishLocalMatch(game: GameSession, outcome: "win" | "loss", at = 1_000): void {
  game.startMatch(at);
  game.tick(at + 3_200);
  if (outcome === "win") {
    game.player.score = 9_000;
    game.opponent.score = 10;
  } else {
    game.player.score = 10;
    game.opponent.score = 9_000;
  }
  game.tick(at + 3_200 + 60_000);
  expect(game.result?.outcome).toBe(outcome);
}

describe("dev battle bypass flag", () => {
  it("stays off in vitest unless explicitly enabled", () => {
    expect(DEV_BATTLE_BYPASS_ALLOWED).toBe(true);
    expect(isDevBattleBypassEnabled()).toBe(false);
    expect(canEnterLocalBattle(0)).toBe(false);
    expect(canEnterLocalBattle(1)).toBe(true);
    expect(canEnterLocalBattle(3)).toBe(true);
  });

  it("turns on from the test helper or ?devBattle=1", () => {
    setDevBattleBypassForTests(true);
    expect(isDevBattleBypassEnabled()).toBe(true);
    expect(canEnterLocalBattle(0)).toBe(true);
    setDevBattleBypassForTests(false);
    expect(isDevBattleBypassEnabled()).toBe(false);
    setDevBattleBypassForTests(null);
    Object.defineProperty(globalThis, "location", {
      value: { search: `?${DEV_BATTLE_QUERY}=1` },
      configurable: true,
    });
    expect(isDevBattleBypassEnabled()).toBe(true);
    Object.defineProperty(globalThis, "location", {
      value: { search: "" },
      configurable: true,
    });
    expect(isDevBattleBypassEnabled()).toBe(false);
  });

  it("overrides the 0-life mode gate in production-compiled app builds while the developer flag is on", () => {
    expect(resolveDevBattleBypass({ allowed: true, mode: "production", explicit: false })).toBe(true);
    expect(resolveDevBattleBypass({ allowed: true, mode: "development", explicit: false })).toBe(true);
    expect(resolveDevBattleBypass({ allowed: true, mode: "test", explicit: false })).toBe(false);
    expect(resolveDevBattleBypass({ allowed: false, mode: "production", explicit: false })).toBe(false);
    expect(resolveDevBattleBypass({ allowed: false, mode: "production", explicit: true })).toBe(false);
    expect(resolveDevBattleBypass({ allowed: true, mode: "test", explicit: true })).toBe(true);
  });
});

describe("dev battle bypass does not change production lives", () => {
  it("keeps canStartDailyRun, spend, ads, and 3/3 rules intact while bypass is on", () => {
    setDevBattleBypassForTests(true);
    let state = refreshDailyRun(emptyDailyRun(), DAY, true);
    expect(state.lives).toBe(3);
    state = applyDailyRunOutcome(state, "loss", DAY, true);
    state = applyDailyRunOutcome(state, "loss", DAY, true);
    state = applyDailyRunOutcome(state, "loss", DAY, true);
    expect(state.lives).toBe(0);
    expect(canStartDailyRun(state, DAY, true)).toBe(false);
    const blocked = spendDailyLife(state, DAY, true);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.reason).toBe("empty");
    const ad = restoreDailyLifeAd(state, "life-receipt-00000001", DAY, true);
    expect(ad.ok).toBe(true);
    if (!ad.ok) return;
    expect(ad.state.lives).toBe(1);
    expect(ad.state.adsUsed).toBe(1);
  });

  it("still refuses online 1v1 queueing at 0 lives", async () => {
    setDevBattleBypassForTests(true);
    const game = new ChronoClashServer({
      dbPath: ":memory:",
      auth: { allowGuest: true, allowDevAuth: false, sessionTtlMs: 30 * 24 * 60 * 60 * 1000, maxSessions: 8 },
    });
    const auth = await routeServer(game, {
      method: "POST",
      path: "/v1/auth",
      query: {},
      headers: {},
      body: { platform: "web", provider: "guest", token: "bypass-guest", displayName: "bypass" },
    });
    const body = auth.body as { sessionToken: string };
    const now = Date.now();
    game.seedDailyRun(
      body.sessionToken,
      { utcDay: utcDayKey(now), lives: 0, adsUsed: 0, claimedReceipts: [], clockHighWaterMs: now },
      now,
    );
    const blocked = await routeServer(game, {
      method: "POST",
      path: "/v1/match",
      query: {},
      headers: { authorization: `Bearer ${body.sessionToken}` },
      body: {},
    });
    expect(blocked.status).toBe(403);
    expect((blocked.body as { error?: string }).error).toMatch(/no lives remaining/i);
    game.close();
  });
});

describe("dev battle bypass local entry", () => {
  it("lets Time and Score battles start at 0 lives without coins, XP, or life changes", () => {
    setDevBattleBypassForTests(true);
    const game = emptyLivesGame();
    const coins = game.progress.winningCoins;
    const xp = game.progress.xp;
    const plays = game.progress.plays;
    expect(game.canStartDailyRun()).toBe(false);
    expect(game.canEnterLocalBattle()).toBe(true);

    game.chooseMode("time", 1_000);
    expect(game.screen).toBe("ready");
    finishLocalMatch(game, "win", 1_000);
    expect(game.inspectionMatch).toBe(true);
    expect(game.result?.inspection).toBe(true);
    expect(game.result?.grant).toBeNull();
    expect(game.dailyLives()).toBe(0);
    expect(game.progress.winningCoins).toBe(coins);
    expect(game.progress.xp).toBe(xp);
    expect(game.progress.plays).toBe(plays);

    game.playAgain(80_000);
    expect(game.screen).toBe("ready");
    game.chooseMode("score", 81_000);
    expect(game.screen).toBe("ready");
    finishLocalMatch(game, "loss", 82_000);
    expect(game.dailyLives()).toBe(0);
    expect(game.progress.winningCoins).toBe(coins);
    expect(game.progress.xp).toBe(xp);
  });

  it("does not open an online 1v1 from the local bypass", () => {
    setDevBattleBypassForTests(true);
    const game = emptyLivesGame();
    game.beginOnlineTimeBattle({ matchId: "m1", opponentId: "rival", seed: 1, playerId: "me" }, 1_000);
    expect(game.onlineMatchId).toBeNull();
    expect(game.onlineRemote).toBe(false);
    expect(game.screen).toBe("modes");
    expect(game.screen).not.toBe("match");
    expect(game.screen).not.toBe("ready");
  });

  it("still blocks local entry at 0 lives when the bypass is off", () => {
    setDevBattleBypassForTests(false);
    const game = emptyLivesGame();
    expect(game.canEnterLocalBattle()).toBe(false);
    game.chooseMode("time", 1_000);
    expect(game.screen).toBe("modes");
    game.startMatch(2_000);
    expect(game.screen).toBe("modes");
    expect(game.inspectionMatch).toBe(false);
  });

  it("does not treat a real 3-life match as an inspection match", () => {
    setDevBattleBypassForTests(true);
    const game = new GameSession();
    game.progress = {
      ...EMPTY_PROGRESS,
      tutorialDone: true,
      dailyLives: 3,
      dailyRunDay: utcDayKey(DAY),
      unlocked: [...EMPTY_PROGRESS.unlocked],
      powersUsed: { freeze: 0, timeshift: 0, rewind: 0 },
    };
    game.syncTrustedClock(DAY);
    finishLocalMatch(game, "win", 1_000);
    expect(game.inspectionMatch).toBe(false);
    expect(game.result?.inspection).toBeFalsy();
    expect(game.result?.grant?.coins).toBeGreaterThan(0);
    expect(game.dailyLives()).toBe(3);
  });

  it("keeps the ad CTA and 0/3 copy, and labels the DEV path", () => {
    setDevBattleBypassForTests(false);
    const empty = dailyRunHtml({ ...EMPTY_PROGRESS, dailyLives: 0, dailyRunDay: utcDayKey(DAY) }, true);
    expect(empty).toContain("0/3 LIVES");
    expect(empty).toContain("WATCH AD +1 LIFE");
    expect(empty).not.toContain("DEV TEST");
    const adsOff = dailyRunHtml({ ...EMPTY_PROGRESS, dailyLives: 0, dailyRunDay: utcDayKey(DAY) }, false);
    expect(adsOff).toContain("AD UNAVAILABLE");
    expect(adsOff).toContain('disabled');
    setDevBattleBypassForTests(true);
    const bypassed = dailyRunHtml({ ...EMPTY_PROGRESS, dailyLives: 0, dailyRunDay: utcDayKey(DAY) }, false);
    expect(bypassed).toContain("AD UNAVAILABLE");
    expect(bypassed).toContain("DEV TEST");
    expect(bypassed).toContain('disabled');
    const bypassedAdsOn = dailyRunHtml({ ...EMPTY_PROGRESS, dailyLives: 0, dailyRunDay: utcDayKey(DAY) }, true);
    expect(bypassedAdsOn).toContain("WATCH AD +1 LIFE");
    expect(bypassedAdsOn).toContain("DEV TEST");
    expect(readyPowerStripHtml({ ...EMPTY_PROGRESS, dailyLives: 0 }).includes("0/3 LIVES · DEV")).toBe(true);
  });
});
