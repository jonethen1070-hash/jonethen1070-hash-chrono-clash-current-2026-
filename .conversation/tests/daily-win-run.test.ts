import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createScriptedRewardedAdPort } from "../src/engine/ads";
import {
  applyDailyRunOutcome,
  canStartDailyRun,
  clampDailyRun,
  DAILY_LIFE_ADS_MAX,
  DAILY_LIVES_MAX,
  emptyDailyRun,
  refreshDailyRun,
  restoreDailyLifeAd,
  spendDailyLife,
} from "../src/engine/dailyRun";
import { utcDayKey, WINNING_COINS_LOSS, WINNING_COINS_WIN } from "../src/engine/economy";
import { loadProgress, saveProgress } from "../src/engine/progress";
import { GameSession } from "../src/engine/session";
import { EMPTY_PROGRESS } from "../src/engine/types";
import { ChronoClashServer } from "../src/server/core";
import { ChronoStore } from "../src/server/db";
import { routeServer } from "../src/server/http";
import { dailyRunHtml, readyPowerStripHtml } from "../src/ui/metaViews";
import { BATTLE_COUNTDOWN_MS } from "../src/server/battle";
import type { MatchmakingState } from "../src/server/types";

const DAY = Date.UTC(2026, 7, 25, 12, 0, 0);
const NEXT = DAY + 24 * 60 * 60 * 1000;

function receipt(n: number): string {
  return `life-receipt-${String(n).padStart(8, "0")}`;
}

function guestServer() {
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
  const body = res.body as { sessionToken: string; player: { playerId: string } };
  return { token: body.sessionToken, playerId: body.player.playerId };
}

function forceMatch(game: GameSession, outcome: "win" | "loss" | "tie", at = 1_000): void {
  game.progress = { ...game.progress, tutorialDone: true, matchesSeen: 8 };
  game.mode = "time";
  game.startMatch(at);
  game.tick(at + 3_200);
  if (outcome === "win") {
    game.player.score = 9_000;
    game.opponent.score = 10;
  } else if (outcome === "loss") {
    game.player.score = 10;
    game.opponent.score = 9_000;
  } else {
    game.player.score = 100;
    game.opponent.score = 100;
  }
  game.tick(at + 3_200 + 60_000);
  expect(game.result?.outcome).toBe(outcome);
}

describe("daily win run engine", () => {
  it("starts at 3/3 and does not spend a life on wins or ties", () => {
    let state = refreshDailyRun(emptyDailyRun(), DAY, true);
    expect(state.lives).toBe(DAILY_LIVES_MAX);
    for (let i = 0; i < 12; i++) state = applyDailyRunOutcome(state, "win", DAY, true);
    expect(state.lives).toBe(3);
    state = applyDailyRunOutcome(state, "tie", DAY, true);
    expect(state.lives).toBe(3);
    expect(canStartDailyRun(state, DAY, true)).toBe(true);
  });

  it("spends exactly one life per loss: 3/3 → 2/3 → 1/3 → 0/3", () => {
    let state = refreshDailyRun(emptyDailyRun(), DAY, true);
    state = applyDailyRunOutcome(state, "loss", DAY, true);
    expect(state.lives).toBe(2);
    state = applyDailyRunOutcome(state, "loss", DAY, true);
    expect(state.lives).toBe(1);
    state = applyDailyRunOutcome(state, "loss", DAY, true);
    expect(state.lives).toBe(0);
    expect(canStartDailyRun(state, DAY, true)).toBe(false);
    const blocked = spendDailyLife(state, DAY, true);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.reason).toBe("empty");
    expect(blocked.state.lives).toBe(0);
  });

  it("lets a player keep winning while lives remain", () => {
    let state = refreshDailyRun(emptyDailyRun(), DAY, true);
    state = applyDailyRunOutcome(state, "loss", DAY, true);
    expect(state.lives).toBe(2);
    for (let i = 0; i < 20; i++) state = applyDailyRunOutcome(state, "win", DAY, true);
    expect(state.lives).toBe(2);
    expect(canStartDailyRun(state, DAY, true)).toBe(true);
  });

  it("restores exactly +1 life per ad, rejects duplicates, and caps ads per UTC day", () => {
    let state = refreshDailyRun(emptyDailyRun(), DAY, true);
    state = applyDailyRunOutcome(state, "loss", DAY, true);
    state = applyDailyRunOutcome(state, "loss", DAY, true);
    state = applyDailyRunOutcome(state, "loss", DAY, true);
    expect(state.lives).toBe(0);
    const first = restoreDailyLifeAd(state, receipt(1), DAY, true);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.state.lives).toBe(1);
    expect(first.state.adsUsed).toBe(1);
    const dup = restoreDailyLifeAd(first.state, receipt(1), DAY, true);
    expect(dup.ok).toBe(false);
    if (dup.ok) return;
    expect(dup.reason).toBe("duplicate");
    expect(dup.state.lives).toBe(1);
    const whileAlive = restoreDailyLifeAd(first.state, receipt(2), DAY, true);
    expect(whileAlive.ok).toBe(false);
    if (whileAlive.ok) return;
    expect(whileAlive.reason).toBe("active");
    state = applyDailyRunOutcome(first.state, "loss", DAY, true);
    expect(state.lives).toBe(0);
    for (let n = 2; n <= DAILY_LIFE_ADS_MAX; n++) {
      const restored = restoreDailyLifeAd(state, receipt(n), DAY, true);
      expect(restored.ok).toBe(true);
      if (!restored.ok) return;
      expect(restored.state.lives).toBe(1);
      state = applyDailyRunOutcome(restored.state, "loss", DAY, true);
    }
    expect(state.lives).toBe(0);
    expect(state.adsUsed).toBe(DAILY_LIFE_ADS_MAX);
    const capped = restoreDailyLifeAd(state, receipt(99), DAY, true);
    expect(capped.ok).toBe(false);
    if (!capped.ok) expect(capped.reason).toBe("ad-cap");
    expect(restoreDailyLifeAd(state, "short", DAY, true).ok).toBe(false);
  });

  it("ignores untrusted device clocks and restores 3 lives on a trusted UTC day change", () => {
    let state = refreshDailyRun(emptyDailyRun(), DAY, true);
    state = applyDailyRunOutcome(state, "loss", DAY, true);
    state = applyDailyRunOutcome(state, "loss", DAY, true);
    state = applyDailyRunOutcome(state, "loss", DAY, true);
    expect(state.lives).toBe(0);
    expect(refreshDailyRun(state, NEXT, false).lives).toBe(0);
    expect(refreshDailyRun(state, DAY - 86_400_000, false).lives).toBe(0);
    expect(refreshDailyRun(state, DAY - 1_000, true).lives).toBe(0);
    const reset = refreshDailyRun(state, NEXT, true);
    expect(reset.lives).toBe(3);
    expect(reset.adsUsed).toBe(0);
    expect(reset.utcDay).toBe(utcDayKey(NEXT));
    expect(reset.claimedReceipts).toEqual(state.claimedReceipts);
  });
});

describe("daily win run session", () => {
  it("consumes a life only on local losses and blocks play at 0/3", () => {
    const game = new GameSession();
    game.progress = {
      ...EMPTY_PROGRESS,
      tutorialDone: true,
      unlocked: [...EMPTY_PROGRESS.unlocked],
      powersUsed: { freeze: 0, timeshift: 0, rewind: 0 },
    };
    game.syncTrustedClock(DAY);
    expect(game.dailyLives()).toBe(3);
    forceMatch(game, "win");
    expect(game.dailyLives()).toBe(3);
    expect(game.progress.winningCoins).toBeGreaterThan(0);
    const coinsAfterWin = game.progress.winningCoins;
    forceMatch(game, "loss", 80_000);
    expect(game.dailyLives()).toBe(2);
    forceMatch(game, "loss", 160_000);
    expect(game.dailyLives()).toBe(1);
    forceMatch(game, "loss", 240_000);
    expect(game.dailyLives()).toBe(0);
    expect(game.progress.winningCoins).toBe(coinsAfterWin);
    game.playAgain(300_000);
    expect(game.screen).toBe("modes");
    game.chooseMode("time", 301_000);
    expect(game.screen).toBe("modes");
    game.startMatch(302_000);
    expect(game.screen).toBe("modes");
    expect(game.phase).not.toBe("countdown");
  });

  it("claims a unique ad receipt for +1 life without granting Winning Coins", async () => {
    const ads = createScriptedRewardedAdPort();
    const game = new GameSession();
    game.syncTrustedClock(DAY);
    game.progress = { ...game.progress, winningCoins: 40, dailyLives: 0, dailyRunDay: utcDayKey(DAY) };
    const coins = game.progress.winningCoins;
    const shown = await ads.showRewarded("daily-life");
    expect(shown.ok).toBe(true);
    if (!shown.ok) return;
    expect(game.claimLifeAd(shown.receiptId, (id) => ads.redeemReceipt(id)).ok).toBe(true);
    expect(game.dailyLives()).toBe(1);
    expect(game.progress.winningCoins).toBe(coins);
    expect(game.claimLifeAd(shown.receiptId, (id) => ads.redeemReceipt(id)).ok).toBe(false);
    expect(game.dailyLives()).toBe(1);
  });

  it("reloads lives from storage after a new session", () => {
    const mem = new Map<string, string>();
    const ls = {
      getItem: (key: string) => mem.get(key) ?? null,
      setItem: (key: string, value: string) => {
        mem.set(key, value);
      },
      removeItem: (key: string) => {
        mem.delete(key);
      },
      clear: () => mem.clear(),
      key: () => null,
      length: 0,
    };
    Object.defineProperty(globalThis, "localStorage", { value: ls, configurable: true });
    const game = new GameSession();
    game.syncTrustedClock(DAY);
    forceMatch(game, "loss");
    expect(game.dailyLives()).toBe(2);
    saveProgress(game.progress);
    const loaded = loadProgress();
    expect(loaded.dailyLives).toBe(2);
    const again = new GameSession();
    again.syncTrustedClock(DAY);
    expect(again.dailyLives()).toBe(2);
  });
});

describe("daily win run UI", () => {
  it("renders lives, the 0/3 ad choice, and keeps Winning Coins separate", () => {
    const main = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
    const views = readFileSync(new URL("../src/ui/metaViews.ts", import.meta.url), "utf8");
    expect(main).toContain('id="dailyRun"');
    expect(main).toContain("data-life-ad");
    expect(main).toContain("DAILY_LIFE_AD_PLACEMENT");
    expect(main).not.toMatch(/3 matches per day/i);
    expect(views).toContain("DAILY WIN RUN");
    expect(views).toContain("WATCH AD +1 LIFE");
    const empty = dailyRunHtml({ ...EMPTY_PROGRESS, dailyLives: 0, dailyRunDay: utcDayKey(DAY) }, true);
    expect(empty).toContain("0/3 LIVES");
    expect(empty).toContain("WATCH AD +1 LIFE");
    expect(empty).toContain("wait until the next UTC day");
    expect(readyPowerStripHtml({ ...EMPTY_PROGRESS, dailyLives: 2 }).includes("2/3 LIVES")).toBe(true);
    expect(dailyRunHtml({ ...EMPTY_PROGRESS, dailyLives: 3 }, true)).not.toContain("WATCH AD +1 LIFE");
  });
});

describe("daily win run server", () => {
  it("publishes a trusted UTC clock on unauthenticated health", async () => {
    const game = guestServer();
    const res = await routeServer(game, { method: "GET", path: "/v1/health", query: {}, headers: {}, body: null });
    expect(res.status).toBe(200);
    const body = res.body as { utcMs: number; utcDay: string; ok: boolean };
    expect(body.ok).toBe(true);
    expect(body.utcMs).toBeGreaterThan(0);
    expect(body.utcDay).toBe(utcDayKey(body.utcMs));
    game.close();
  });

  it("spends a life once per match and refuses a duplicate grant", () => {
    const store = new ChronoStore(":memory:");
    const first = store.applyDailyRunOutcomeOnce("pilot-a", "match-1", "loss", DAY);
    expect(first.lives).toBe(2);
    expect(store.applyDailyRunOutcomeOnce("pilot-a", "match-1", "loss", DAY).lives).toBe(2);
    expect(store.applyDailyRunOutcomeOnce("pilot-a", "match-2", "win", DAY).lives).toBe(2);
    expect(store.applyDailyRunOutcomeOnce("pilot-a", "match-3", "loss", DAY).lives).toBe(1);
    expect(store.dailyRun("pilot-a", NEXT).lives).toBe(3);
    store.close();
  });

  it("rejects queueing at 0/3, restores +1 from a unique ad, and keeps coins untouched", async () => {
    const game = guestServer();
    const a = await signGuest(game, "life-a");
    const b = await signGuest(game, "life-b");
    const headers = { authorization: `Bearer ${a.token}` };
    const now = Date.now();
    const day = utcDayKey(now);
    game.seedDailyRun(a.token, clampDailyRun({ utcDay: day, lives: 0, adsUsed: 0, claimedReceipts: [], clockHighWaterMs: now }), now);
    const blocked = await routeServer(game, {
      method: "POST",
      path: "/v1/match",
      query: {},
      headers,
      body: {},
    });
    expect(blocked.status).toBe(403);
    expect((blocked.body as { error?: string }).error).toMatch(/no lives remaining/i);
    const forged = await routeServer(game, {
      method: "POST",
      path: "/v1/daily-run/ad-reward",
      query: {},
      headers,
      body: { completed: true },
    });
    expect(forged.status).toBe(400);
    const coinsBefore = game.economy(a.token).winningCoins;
    const ad = await routeServer(game, {
      method: "POST",
      path: "/v1/daily-run/ad-reward",
      query: {},
      headers,
      body: { receiptId: receipt(1) },
    });
    expect(ad.status).toBe(200);
    expect((ad.body as { daily: { lives: number } }).daily.lives).toBe(1);
    expect(game.economy(a.token).winningCoins).toBe(coinsBefore);
    const dup = await routeServer(game, {
      method: "POST",
      path: "/v1/daily-run/ad-reward",
      query: {},
      headers,
      body: { receiptId: receipt(1) },
    });
    expect(dup.status).toBe(400);
    expect(game.dailyRun(a.token).lives).toBe(1);
    const queued = await routeServer(game, {
      method: "POST",
      path: "/v1/match",
      query: {},
      headers,
      body: {},
    });
    expect(queued.status).toBe(200);
    expect((queued.body as MatchmakingState).status).toBe("searching");
    await routeServer(game, {
      method: "POST",
      path: "/v1/match/cancel",
      query: {},
      headers,
      body: {},
    });
    expect(game.dailyRun(b.token).lives).toBe(3);
    game.close();
  });

  it("treats a leave as a loss for the leaving player only", async () => {
    const game = guestServer();
    const a = await signGuest(game, "leave-a");
    const b = await signGuest(game, "leave-b");
    await routeServer(game, { method: "POST", path: "/v1/match", query: {}, headers: { authorization: `Bearer ${a.token}` }, body: {} });
    const second = await routeServer(game, { method: "POST", path: "/v1/match", query: {}, headers: { authorization: `Bearer ${b.token}` }, body: {} });
    const matchId = (second.body as MatchmakingState).matchId!;
    const t0 = 1_000;
    game.joinBattle(a.token, matchId, t0);
    game.joinBattle(b.token, matchId, t0);
    const live = t0 + BATTLE_COUNTDOWN_MS + 50;
    game.leaveBattle(a.token, matchId, live);
    expect(game.dailyRun(a.token).lives).toBe(2);
    expect(game.dailyRun(b.token).lives).toBe(3);
    expect(game.economy(a.token).winningCoins).toBe(0);
    game.close();
  });
});

describe("winning coins stay separate", () => {
  it("does not change scarce coin constants or grant coins for a life ad", () => {
    expect(WINNING_COINS_WIN).toBe(10);
    expect(WINNING_COINS_LOSS).toBe(0);
    const store = new ChronoStore(":memory:");
    store.applyDailyRunOutcomeOnce("pilot-a", "m-loss", "loss", DAY);
    expect(store.getEconomy("pilot-a").winningCoins).toBe(0);
    const restored = store.restoreLifeAd("pilot-a", receipt(1), DAY);
    expect(restored.ok).toBe(false);
    store.applyDailyRunOutcomeOnce("pilot-a", "m-loss-2", "loss", DAY);
    store.applyDailyRunOutcomeOnce("pilot-a", "m-loss-3", "loss", DAY);
    expect(store.restoreLifeAd("pilot-a", receipt(1), DAY).ok).toBe(true);
    expect(store.getEconomy("pilot-a").winningCoins).toBe(0);
    store.close();
  });
});
