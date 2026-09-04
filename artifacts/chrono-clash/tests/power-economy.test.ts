import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createScriptedRewardedAdPort, createUnavailableRewardedAdPort } from "../src/engine/ads";
import {
  buyCharge,
  claimAdReward,
  clampEconomy,
  coinsForOutcome,
  economyFromProgress,
  getCharge,
  grantCharge,
  grantWinningCoins,
  matchCoinPayout,
  spendCharge,
  utcDayKey,
  utcWeekKey,
  WINNING_COINS_DAILY_WIN,
  WINNING_COINS_LOSS,
  WINNING_COINS_TIE,
  WINNING_COINS_WEEKLY_BONUS,
  WINNING_COINS_WIN,
  withPowerStock,
} from "../src/engine/economy";
import { DEFAULT_POWER_MAX, POWER_CATALOG, POWER_CHARGE_COIN_COST, powerById, storefrontPowers } from "../src/engine/powers";
import type { PowerDefinition } from "../src/engine/powers";
import { grantMatchRewards, loadProgress, saveProgress } from "../src/engine/progress";
import { findAnyValidSwap } from "../src/engine/board";
import { GameSession } from "../src/engine/session";
import { EMPTY_PROGRESS, ENERGY_FREEZE } from "../src/engine/types";
import { BATTLE_COUNTDOWN_MS } from "../src/server/battle";
import { ChronoClashServer } from "../src/server/core";
import { ChronoStore } from "../src/server/db";
import { routeServer } from "../src/server/http";
import type { MatchmakingState } from "../src/server/types";
import { powerArmoryHtml } from "../src/ui/metaViews";

function fresh() {
  return {
    ...EMPTY_PROGRESS,
    unlocked: [...EMPTY_PROGRESS.unlocked],
    powersUsed: { freeze: 0, timeshift: 0, rewind: 0 },
    winningCoins: 0,
    powerCharges: {} as Record<string, number>,
    claimedAdReceipts: [] as string[],
  };
}

function playing(stock: Record<string, number> = { freeze: 5, timeshift: 5 }): { game: GameSession; now: number } {
  const game = new GameSession();
  game.progress = withPowerStock(game.progress, stock);
  game.mode = "time";
  let now = 8_000;
  game.startMatch(now);
  now += 3_200;
  game.tick(now);
  expect(game.phase).toBe("playing");
  return { game, now };
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

async function pairGuests(game: ChronoClashServer) {
  const a = await signGuest(game, "econ-sync-a");
  const b = await signGuest(game, "econ-sync-b");
  await routeServer(game, { method: "POST", path: "/v1/match", query: {}, headers: { authorization: `Bearer ${a.token}` }, body: {} });
  const second = await routeServer(game, { method: "POST", path: "/v1/match", query: {}, headers: { authorization: `Bearer ${b.token}` }, body: {} });
  const again = await routeServer(game, { method: "POST", path: "/v1/match", query: {}, headers: { authorization: `Bearer ${a.token}` }, body: {} });
  const ticket = again.body as MatchmakingState;
  expect(ticket.status).toBe("matched");
  expect((second.body as MatchmakingState).matchId).toBe(ticket.matchId);
  return { a, b, matchId: ticket.matchId! };
}

describe("before-match UI", () => {
  it("renders armory quantities, coin refill, and watch-ad controls", () => {
    const main = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
    const views = readFileSync(new URL("../src/ui/metaViews.ts", import.meta.url), "utf8");
    expect(main).toContain('id="powerArmory"');
    expect(main).toContain('id="readyPowers"');
    expect(main).not.toContain('id="freezeQty"');
    expect(main).not.toContain('id="shiftQty"');
    expect(main).toContain("paintArmory");
    expect(views).toContain("WATCH AD +1");
    expect(views).toContain("WINNING COINS");
    expect(views).toContain("DAILY WIN");
    expect(powerArmoryHtml(fresh(), false)).toContain("50 coins = 1 charge");
    expect(powerArmoryHtml(fresh(), false)).toContain("Ads grant +1 charge, not coins");
  });
});

describe("power economy catalog", () => {
  it("lists Freeze Time and Time Shift as storefront inventory powers with max 5", () => {
    const store = storefrontPowers();
    expect(store.map((p) => p.id)).toEqual(["freeze", "timeshift"]);
    expect(store.every((p) => p.maxCharges === DEFAULT_POWER_MAX)).toBe(true);
    expect(store.every((p) => p.coinCost === POWER_CHARGE_COIN_COST)).toBe(true);
    expect(powerById("rewind")?.consumesCharge).toBe(false);
    expect(powerById("rewind")?.storefront).toBe(false);
  });

  it("lets a future power use the same inventory helpers", () => {
    const nova: PowerDefinition = {
      id: "nova-burst",
      displayName: "Nova Burst",
      icon: "✦",
      maxCharges: DEFAULT_POWER_MAX,
      coinCost: 40,
      rewardedAd: true,
      consumesCharge: true,
      storefront: true,
      energyCost: 10,
    };
    const catalog = [...POWER_CATALOG, nova];
    let state = clampEconomy({ winningCoins: 80, powerCharges: {}, claimedAdReceipts: [] }, catalog);
    const bought = buyCharge(state, "nova-burst", catalog);
    expect(bought.ok).toBe(true);
    if (!bought.ok) return;
    state = bought.state;
    expect(getCharge(state, "nova-burst", catalog)).toBe(1);
    const spent = spendCharge(state, "nova-burst", catalog);
    expect(spent.ok).toBe(true);
    if (!spent.ok) return;
    expect(getCharge(spent.state, "nova-burst", catalog)).toBe(0);
  });
});

describe("power charge limits", () => {
  it("earns 0/5 → 1/5 and 4/5 → 5/5, and rejects 5/5", () => {
    let state = clampEconomy({ winningCoins: 0, powerCharges: { freeze: 0 }, claimedAdReceipts: [] });
    const first = grantCharge(state, "freeze", 1);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(getCharge(first.state, "freeze")).toBe(1);
    state = clampEconomy({ ...first.state, powerCharges: { ...first.state.powerCharges, freeze: 4 } });
    const last = grantCharge(state, "freeze", 1);
    expect(last.ok).toBe(true);
    if (!last.ok) return;
    expect(getCharge(last.state, "freeze")).toBe(5);
    const blocked = grantCharge(last.state, "freeze", 1);
    expect(blocked.ok).toBe(false);
    if (blocked.ok) return;
    expect(blocked.reason).toBe("full");
    expect(getCharge(blocked.state, "freeze")).toBe(5);
  });

  it("keeps Freeze and Time Shift inventories independent", () => {
    let state = clampEconomy({ winningCoins: 0, powerCharges: { freeze: 2, timeshift: 4 }, claimedAdReceipts: [] });
    const freeze = grantCharge(state, "freeze", 1);
    expect(freeze.ok).toBe(true);
    if (!freeze.ok) return;
    state = freeze.state;
    expect(getCharge(state, "freeze")).toBe(3);
    expect(getCharge(state, "timeshift")).toBe(4);
    const shift = spendCharge(state, "timeshift");
    expect(shift.ok).toBe(true);
    if (!shift.ok) return;
    expect(getCharge(shift.state, "freeze")).toBe(3);
    expect(getCharge(shift.state, "timeshift")).toBe(3);
  });

  it("clamps illegal quantities on load", () => {
    const state = clampEconomy({
      winningCoins: -40,
      powerCharges: { freeze: 99, timeshift: -3 },
      claimedAdReceipts: ["short", "ok-receipt-16chars"],
    });
    expect(state.winningCoins).toBe(0);
    expect(state.powerCharges.freeze).toBe(5);
    expect(state.powerCharges.timeshift).toBe(0);
  });
});

describe("spending charges in a match", () => {
  it("spends 1 charge and refuses activation at 0/5", () => {
    const { game, now } = playing({ freeze: 1, timeshift: 0 });
    game.player.energy = ENERGY_FREEZE;
    expect(game.powerCharges("freeze")).toBe(1);
    expect(game.usePower("freeze", now)).toBe(true);
    expect(game.powerCharges("freeze")).toBe(0);
    game.player.energy = ENERGY_FREEZE;
    expect(game.canUsePower("freeze", now + 400)).toBe(false);
    expect(game.usePower("freeze", now + 400)).toBe(false);
    expect(game.powerCharges("freeze")).toBe(0);
  });

  it("does not refill charges when a new match starts", () => {
    const { game, now } = playing({ freeze: 2, timeshift: 1 });
    game.player.energy = ENERGY_FREEZE;
    expect(game.usePower("freeze", now)).toBe(true);
    expect(game.powerCharges("freeze")).toBe(1);
    game.startMatch(now + 1_000);
    expect(game.powerCharges("freeze")).toBe(1);
    expect(game.powerCharges("timeshift")).toBe(1);
  });
});

describe("Winning Coins", () => {
  it("buys a charge and deducts coins, and refuses insufficient funds", () => {
    let state = clampEconomy({ winningCoins: 50, powerCharges: { freeze: 0 }, claimedAdReceipts: [] });
    const poor = buyCharge({ ...state, winningCoins: 49 }, "freeze");
    expect(poor.ok).toBe(false);
    if (poor.ok) return;
    expect(poor.reason).toBe("funds");
    expect(poor.state.winningCoins).toBe(49);
    expect(getCharge(poor.state, "freeze")).toBe(0);
    const ok = buyCharge(state, "freeze");
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    expect(ok.state.winningCoins).toBe(0);
    expect(getCharge(ok.state, "freeze")).toBe(1);
  });

  it("grants scarce match coins, not a refill after one win", () => {
    const at = Date.parse("2026-03-02T15:00:00Z");
    const rewarded = grantMatchRewards(fresh(), {
      outcome: "win",
      score: 1200,
      bestCombo: 3,
      mode: "time",
      rivalScore: 100,
      powersThisMatch: [],
      at,
    });
    expect(coinsForOutcome("win")).toBe(WINNING_COINS_WIN);
    expect(coinsForOutcome("tie")).toBe(WINNING_COINS_TIE);
    expect(coinsForOutcome("loss")).toBe(WINNING_COINS_LOSS);
    expect(rewarded.grant.coins).toBe(WINNING_COINS_WIN + WINNING_COINS_DAILY_WIN);
    expect(rewarded.progress.winningCoins).toBe(WINNING_COINS_WIN + WINNING_COINS_DAILY_WIN);
    expect(rewarded.grant.coins).toBeLessThan(POWER_CHARGE_COIN_COST);
    const drained = grantWinningCoins(economyFromProgress(rewarded.progress), 0);
    expect(drained.ok).toBe(false);
  });
});

describe("scarce Winning Coin payouts", () => {
  const monday = Date.parse("2026-03-02T15:00:00Z");

  it("pays 0 on a loss and does not refill from ads", () => {
    const lost = grantMatchRewards(fresh(), {
      outcome: "loss",
      score: 200,
      bestCombo: 1,
      mode: "time",
      rivalScore: 400,
      powersThisMatch: [],
      at: monday,
    });
    expect(lost.grant.coins).toBe(0);
    expect(lost.progress.winningCoins).toBe(0);
    const ads = claimAdReward(clampEconomy({ winningCoins: 0, powerCharges: { freeze: 0 }, claimedAdReceipts: [] }), "freeze", "chrono-ad-receipt01");
    expect(ads.ok).toBe(true);
    if (!ads.ok) return;
    expect(ads.state.winningCoins).toBe(0);
    expect(getCharge(ads.state, "freeze")).toBe(1);
  });

  it("needs five isolated wins for 50 coins after the daily bonus is claimed", () => {
    const day = utcDayKey(monday);
    let progress = { ...fresh(), coinDailyDay: day, coinWeeklyWeek: utcWeekKey(monday), coinWeeklyWins: 5 };
    for (let i = 0; i < 5; i++) {
      const win = grantMatchRewards(progress, {
        outcome: "win",
        score: 800,
        bestCombo: 2,
        mode: "time",
        rivalScore: 100,
        powersThisMatch: [],
        at: monday,
      });
      progress = grantMatchRewards(win.progress, {
        outcome: "loss",
        score: 100,
        bestCombo: 1,
        mode: "time",
        rivalScore: 400,
        powersThisMatch: [],
        at: monday,
      }).progress;
    }
    expect(progress.winningCoins).toBe(50);
    expect(progress.winStreak).toBe(0);
  });

  it("adds controlled streak bonuses at 3, 5, and 10 wins only", () => {
    const earn = { dailyDay: utcDayKey(monday), weeklyWeek: utcWeekKey(monday), weeklyWins: 0 };
    expect(matchCoinPayout({ outcome: "win", streakAfter: 1, earn, now: monday }).streak).toBe(0);
    expect(matchCoinPayout({ outcome: "win", streakAfter: 2, earn, now: monday }).streak).toBe(0);
    expect(matchCoinPayout({ outcome: "win", streakAfter: 3, earn, now: monday }).streak).toBe(10);
    expect(matchCoinPayout({ outcome: "win", streakAfter: 5, earn, now: monday }).streak).toBe(20);
    expect(matchCoinPayout({ outcome: "win", streakAfter: 6, earn, now: monday }).streak).toBe(0);
    expect(matchCoinPayout({ outcome: "win", streakAfter: 10, earn, now: monday }).streak).toBe(25);
  });

  it("grants the daily win bonus once per UTC day", () => {
    const first = matchCoinPayout({
      outcome: "win",
      streakAfter: 1,
      earn: { dailyDay: "", weeklyWeek: "", weeklyWins: 0 },
      now: monday,
    });
    expect(first.daily).toBe(WINNING_COINS_DAILY_WIN);
    const second = matchCoinPayout({
      outcome: "win",
      streakAfter: 1,
      earn: first.earn,
      now: monday,
    });
    expect(second.daily).toBe(0);
    const nextDay = matchCoinPayout({
      outcome: "win",
      streakAfter: 1,
      earn: second.earn,
      now: monday + 24 * 60 * 60 * 1000,
    });
    expect(nextDay.daily).toBe(WINNING_COINS_DAILY_WIN);
  });

  it("grants the weekly 5-win bonus once per UTC week", () => {
    let earn = { dailyDay: utcDayKey(monday), weeklyWeek: utcWeekKey(monday), weeklyWins: 0 };
    let weekly = 0;
    for (let i = 1; i <= 6; i++) {
      const out = matchCoinPayout({ outcome: "win", streakAfter: 1, earn, now: monday });
      earn = out.earn;
      weekly += out.weekly;
    }
    expect(weekly).toBe(WINNING_COINS_WEEKLY_BONUS);
    expect(earn.weeklyWins).toBe(6);
  });

  it("applies scarce payouts on the server without duplicating a match grant", () => {
    const store = new ChronoStore(":memory:");
    const first = store.applyMatchCoins("pilot-a", "match-1", "win", monday);
    expect(first).toBe(WINNING_COINS_WIN + WINNING_COINS_DAILY_WIN);
    expect(store.applyMatchCoins("pilot-a", "match-1", "win", monday)).toBe(0);
    expect(store.applyMatchCoins("pilot-a", "match-2", "loss", monday)).toBe(0);
    expect(store.getEconomy("pilot-a").winningCoins).toBe(WINNING_COINS_WIN + WINNING_COINS_DAILY_WIN);
    store.close();
  });
});

describe("rewarded ads", () => {
  it("grants exactly one charge per completed ad and rejects duplicate receipts", async () => {
    const ads = createScriptedRewardedAdPort();
    const { game } = playing({ freeze: 0, timeshift: 0 });
    const first = await ads.showRewarded("freeze");
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(game.claimPowerAd("freeze", first.receiptId, (id) => ads.redeemReceipt(id)).ok).toBe(true);
    expect(game.powerCharges("freeze")).toBe(1);
    expect(game.progress.winningCoins).toBe(0);
    expect(game.claimPowerAd("freeze", first.receiptId, (id) => ads.redeemReceipt(id)).ok).toBe(false);
    expect(game.powerCharges("freeze")).toBe(1);
    const again = claimAdReward(economyFromProgress(game.progress), "freeze", first.receiptId);
    expect(again.ok).toBe(false);
    if (again.ok) return;
    expect(again.reason).toBe("duplicate");
  });

  it("rejects invented receipts and unavailable ads", async () => {
    const ads = createUnavailableRewardedAdPort();
    expect(ads.isAvailable()).toBe(false);
    const shown = await ads.showRewarded("freeze");
    expect(shown.ok).toBe(false);
    const { game } = playing({ freeze: 0 });
    expect(game.claimPowerAd("freeze", "client-forged-receipt", () => false).ok).toBe(false);
    expect(game.powerCharges("freeze")).toBe(0);
    expect(claimAdReward(economyFromProgress(game.progress), "freeze", "nope").ok).toBe(false);
  });
});

describe("persistence", () => {
  it("reloads charges and coins from storage without duplicating them", () => {
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
    const first = withPowerStock(fresh(), { freeze: 3, timeshift: 1 }, 120);
    saveProgress(first);
    const loaded = loadProgress();
    expect(loaded.winningCoins).toBe(120);
    expect(loaded.powerCharges.freeze).toBe(3);
    expect(loaded.powerCharges.timeshift).toBe(1);
    const loadedAgain = loadProgress();
    expect(loadedAgain.powerCharges.freeze).toBe(3);
    expect(loadedAgain.winningCoins).toBe(120);
  });
});

describe("server-authoritative economy", () => {
  it("buys, refuses a second grant at 5/5, and spends a charge in battle", async () => {
    const game = guestServer();
    const auth = await routeServer(game, {
      method: "POST",
      path: "/v1/auth",
      query: {},
      headers: {},
      body: { platform: "web", provider: "guest", token: "econ-a", displayName: "ECON" },
    });
    const token = (auth.body as { sessionToken: string }).sessionToken;
    const headers = { authorization: `Bearer ${token}` };
    game.seedEconomy(token, { winningCoins: 200, powerCharges: { freeze: 4 }, claimedAdReceipts: [] });
    const buy = await routeServer(game, {
      method: "POST",
      path: "/v1/economy/buy",
      query: {},
      headers,
      body: { powerId: "freeze" },
    });
    expect(buy.status).toBe(200);
    const bought = buy.body as { ok: boolean; economy: { powerCharges: Record<string, number>; winningCoins: number } };
    expect(bought.ok).toBe(true);
    expect(bought.economy.powerCharges.freeze).toBe(5);
    expect(bought.economy.winningCoins).toBe(150);
    const again = await routeServer(game, {
      method: "POST",
      path: "/v1/economy/buy",
      query: {},
      headers,
      body: { powerId: "freeze" },
    });
    expect(again.status).toBe(400);
    expect(game.economy(token).winningCoins).toBe(150);
    const fake = await routeServer(game, {
      method: "POST",
      path: "/v1/economy/ad-reward",
      query: {},
      headers,
      body: { powerId: "freeze", completed: true },
    });
    expect(fake.status).toBe(400);
    expect(game.economy(token).powerCharges.freeze).toBe(5);
  });

  it("refuses a Winning Coin purchase when the player cannot afford it", async () => {
    const game = guestServer();
    const auth = await routeServer(game, {
      method: "POST",
      path: "/v1/auth",
      query: {},
      headers: {},
      body: { platform: "web", provider: "guest", token: "econ-funds", displayName: "FUNDS" },
    });
    const token = (auth.body as { sessionToken: string }).sessionToken;
    game.seedEconomy(token, { winningCoins: 49, powerCharges: { freeze: 0 }, claimedAdReceipts: [] });
    const out = await routeServer(game, {
      method: "POST",
      path: "/v1/economy/buy",
      query: {},
      headers: { authorization: `Bearer ${token}` },
      body: { powerId: "freeze" },
    });
    expect(out.status).toBe(400);
    expect(game.economy(token).winningCoins).toBe(49);
    expect(game.economy(token).powerCharges.freeze || 0).toBe(0);
    game.close();
  });

  it("grants exactly one charge per unique ad receipt and rejects duplicates", async () => {
    const game = guestServer();
    const auth = await routeServer(game, {
      method: "POST",
      path: "/v1/auth",
      query: {},
      headers: {},
      body: { platform: "web", provider: "guest", token: "econ-ad", displayName: "AD" },
    });
    const token = (auth.body as { sessionToken: string }).sessionToken;
    const headers = { authorization: `Bearer ${token}` };
    const receiptId = "chrono-ad-receipt01";
    const first = await routeServer(game, {
      method: "POST",
      path: "/v1/economy/ad-reward",
      query: {},
      headers,
      body: { powerId: "timeshift", receiptId },
    });
    expect(first.status).toBe(200);
    expect((first.body as { economy: { powerCharges: Record<string, number> } }).economy.powerCharges.timeshift).toBe(1);
    const dup = await routeServer(game, {
      method: "POST",
      path: "/v1/economy/ad-reward",
      query: {},
      headers,
      body: { powerId: "timeshift", receiptId },
    });
    expect(dup.status).toBe(400);
    expect(game.economy(token).powerCharges.timeshift).toBe(1);
    expect(game.economy(token).powerCharges.freeze || 0).toBe(0);
    game.close();
  });

  it("clamps a first hydrate so a client cannot import more than 5 charges", async () => {
    const game = guestServer();
    const auth = await routeServer(game, {
      method: "POST",
      path: "/v1/auth",
      query: {},
      headers: {},
      body: { platform: "web", provider: "guest", token: "econ-clamp", displayName: "CLAMP" },
    });
    const token = (auth.body as { sessionToken: string }).sessionToken;
    const out = await routeServer(game, {
      method: "POST",
      path: "/v1/economy/hydrate",
      query: {},
      headers: { authorization: `Bearer ${token}` },
      body: { winningCoins: -9, powerCharges: { freeze: 99, timeshift: 2 }, claimedAdReceipts: [] },
    });
    const economy = (out.body as { economy: { winningCoins: number; powerCharges: Record<string, number> } }).economy;
    expect(economy.winningCoins).toBe(0);
    expect(economy.powerCharges.freeze).toBe(5);
    expect(economy.powerCharges.timeshift).toBe(2);
    game.close();
  });

  it("spends one server charge in battle and refuses a second activation at 0/5", async () => {
    const game = guestServer();
    const { a, b, matchId } = await pairGuests(game);
    game.seedEconomy(a.token, { winningCoins: 0, powerCharges: { freeze: 1, timeshift: 4 }, claimedAdReceipts: [] });
    const t0 = 1_000;
    game.joinBattle(a.token, matchId, t0);
    game.joinBattle(b.token, matchId, t0);
    let now = t0 + BATTLE_COUNTDOWN_MS + 50;
    let seqA = 1;
    let seqB = 1;
    let view = game.battleSync(a.token, matchId, 0, now);
    let safety = 0;
    while (view.you.energy < ENERGY_FREEZE * 2 && safety < 28) {
      const move = findAnyValidSwap(view.you.board);
      expect(move).not.toBeNull();
      now += 40;
      view = game.battleAction(a.token, matchId, { clientSeq: seqA++, type: "swap", a: move!.a, b: move!.b }, now);
      game.battleAction(b.token, matchId, { clientSeq: seqB++, type: "heartbeat" }, now + 5);
      safety += 1;
    }
    expect(view.you.energy).toBeGreaterThanOrEqual(ENERGY_FREEZE * 2);
    now += 40;
    const used = game.battleAction(a.token, matchId, { clientSeq: seqA++, type: "power", id: "freeze" }, now);
    expect(used.events.some((event) => event.type === "power")).toBe(true);
    expect(game.economy(a.token).powerCharges.freeze).toBe(0);
    expect(game.economy(a.token).powerCharges.timeshift).toBe(4);
    now += 400;
    const blocked = game.battleAction(a.token, matchId, { clientSeq: seqA++, type: "power", id: "freeze" }, now);
    expect(blocked.events.filter((event) => event.type === "power")).toHaveLength(1);
    expect(game.economy(a.token).powerCharges.freeze).toBe(0);
    game.close();
  });

  it("does not accept a completed-ad boolean as a grant", async () => {
    const game = guestServer();
    const auth = await routeServer(game, {
      method: "POST",
      path: "/v1/auth",
      query: {},
      headers: {},
      body: { platform: "web", provider: "guest", token: "econ-b", displayName: "ECONB" },
    });
    const token = (auth.body as { sessionToken: string }).sessionToken;
    const out = await routeServer(game, {
      method: "POST",
      path: "/v1/economy/ad-reward",
      query: {},
      headers: { authorization: `Bearer ${token}` },
      body: { powerId: "timeshift", completed: true, receiptId: "" },
    });
    expect(out.status).toBe(400);
    expect(game.economy(token).powerCharges.timeshift || 0).toBe(0);
  });

  it("persists server charges across GET without duplicating them", async () => {
    const game = guestServer();
    const auth = await routeServer(game, {
      method: "POST",
      path: "/v1/auth",
      query: {},
      headers: {},
      body: { platform: "web", provider: "guest", token: "econ-c", displayName: "ECONC" },
    });
    const token = (auth.body as { sessionToken: string }).sessionToken;
    const headers = { authorization: `Bearer ${token}` };
    game.seedEconomy(token, { winningCoins: 15, powerCharges: { freeze: 2, timeshift: 1 }, claimedAdReceipts: [] });
    const first = await routeServer(game, { method: "GET", path: "/v1/economy", query: {}, headers, body: null });
    const second = await routeServer(game, { method: "GET", path: "/v1/economy", query: {}, headers, body: null });
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const a = (first.body as { economy: { winningCoins: number; powerCharges: Record<string, number> } }).economy;
    const b = (second.body as { economy: { winningCoins: number; powerCharges: Record<string, number> } }).economy;
    expect(a.powerCharges.freeze).toBe(2);
    expect(b.powerCharges.freeze).toBe(2);
    expect(a.powerCharges.timeshift).toBe(1);
    expect(a.winningCoins).toBe(15);
    game.close();
  });

  it("hydrates an empty server wallet once and ignores a second import", async () => {
    const game = guestServer();
    const auth = await routeServer(game, {
      method: "POST",
      path: "/v1/auth",
      query: {},
      headers: {},
      body: { platform: "web", provider: "guest", token: "econ-d", displayName: "ECOND" },
    });
    const token = (auth.body as { sessionToken: string }).sessionToken;
    const headers = { authorization: `Bearer ${token}` };
    const first = await routeServer(game, {
      method: "POST",
      path: "/v1/economy/hydrate",
      query: {},
      headers,
      body: { winningCoins: 40, powerCharges: { freeze: 3 }, claimedAdReceipts: [] },
    });
    const again = await routeServer(game, {
      method: "POST",
      path: "/v1/economy/hydrate",
      query: {},
      headers,
      body: { winningCoins: 999, powerCharges: { freeze: 5, timeshift: 5 }, claimedAdReceipts: [] },
    });
    const a = (first.body as { economy: { winningCoins: number; powerCharges: Record<string, number> } }).economy;
    const b = (again.body as { economy: { winningCoins: number; powerCharges: Record<string, number> } }).economy;
    expect(a.powerCharges.freeze).toBe(3);
    expect(a.winningCoins).toBe(40);
    expect(b.powerCharges.freeze).toBe(3);
    expect(b.winningCoins).toBe(40);
    game.close();
  });
});
