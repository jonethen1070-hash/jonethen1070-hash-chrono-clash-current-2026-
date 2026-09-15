import { beforeEach, describe, expect, it } from "vitest";
import { saveProgress } from "../src/engine/progress";
import { GameSession } from "../src/engine/session";
import { coinRoomById, coinRoomWinnerPayout } from "../src/engine/rooms";
import { EMPTY_PROGRESS, MATCH_SECONDS, SCORE_TARGET } from "../src/engine/types";
import { withPowerStock } from "../src/engine/economy";

function freshProgress(coins: number) {
  return {
    ...EMPTY_PROGRESS,
    unlocked: [...EMPTY_PROGRESS.unlocked],
    powersUsed: { ...EMPTY_PROGRESS.powersUsed },
    tutorialDone: true,
    dailyLives: 3,
    winningCoins: coins,
  };
}

function primed(game: GameSession, coins: number): GameSession {
  game.progress = withPowerStock(freshProgress(coins), { freeze: 5, timeshift: 5 }, coins);
  saveProgress(game.progress);
  return game;
}

function playCoinRoom(game: GameSession, roomId: string, mode: "time" | "score", now: number): number {
  const enter = game.enterCoinRoomMatch(mode, roomId, now);
  expect(enter.ok).toBe(true);
  expect(game.screen).toBe("ready");
  game.confirmReady(now);
  now += 3_000;
  game.tick(now);
  expect(game.phase).toBe("playing");
  return now;
}

describe("coin room entry and settlement", () => {
  beforeEach(() => {
    saveProgress(freshProgress(0));
  });

  it("starts a coin-room match when the player can afford the entry fee", () => {
    const game = primed(new GameSession(), 2_000);
    const room = coinRoomById("rookie");
    const enter = game.enterCoinRoomMatch("time", "rookie", 1_000);
    expect(enter.ok).toBe(true);
    if (enter.ok) expect(enter.charged).toBe(0);
    expect(game.progress.winningCoins).toBe(2_000);
    game.confirmReady(1_000);
    expect(game.screen).toBe("match");
    expect(game.lastCoinRoomEnter?.ok).toBe(true);
    expect(game.lastCoinRoomEnter && enter.ok && game.lastCoinRoomEnter.ok ? game.lastCoinRoomEnter.charged : 0).toBe(
      room.entryCoins,
    );
    expect(game.progress.winningCoins).toBe(2_000 - room.entryCoins);
    expect(game.activeCoinRoomMatch()?.charged).toBe(true);
    expect(game.activeCoinRoomMatch()?.settled).toBe(false);
  });

  it("rejects entry and does not start when coins are insufficient", () => {
    const game = primed(new GameSession(), 100);
    const enter = game.enterCoinRoomMatch("time", "rookie", 1_000);
    expect(enter.ok).toBe(false);
    if (!enter.ok) {
      expect(enter.reason).toBe("funds");
      expect(enter.need).toBe(500);
      expect(enter.have).toBe(100);
      expect(enter.charged).toBe(0);
    }
    expect(game.screen).not.toBe("ready");
    expect(game.screen).not.toBe("match");
    expect(game.progress.winningCoins).toBe(100);
    expect(game.activeCoinRoomMatch()).toBeNull();
  });

  it("deducts the entry fee exactly once on a successful start", () => {
    const game = primed(new GameSession(), 4_000);
    playCoinRoom(game, "pro", "time", 2_000);
    expect(game.progress.winningCoins).toBe(4_000 - 1_500);
    game.confirmReady(5_000);
    expect(game.progress.winningCoins).toBe(2_500);
  });

  it("awards the room winner payout exactly once", () => {
    const game = primed(new GameSession(), 2_000);
    const room = coinRoomById("rookie");
    let now = playCoinRoom(game, "rookie", "time", 1_000);
    const afterEntry = 2_000 - room.entryCoins;
    expect(game.progress.winningCoins).toBe(afterEntry);
    game.player.score = 900;
    game.opponent.score = 100;
    game.tick(now + MATCH_SECONDS * 1000);
    expect(game.result?.outcome).toBe("win");
    expect(game.result?.coinRoom?.payout).toBe(room.rewardCoins);
    expect(room.rewardCoins).toBe(coinRoomWinnerPayout(room.entryCoins));
    const afterWin = game.progress.winningCoins;
    expect(afterWin).toBeGreaterThanOrEqual(afterEntry + room.rewardCoins);
    const again = game.settleActiveCoinRoom("win");
    expect(again?.payout).toBe(0);
    expect(game.progress.winningCoins).toBe(afterWin);
  });

  it("awards no room payout on a player loss", () => {
    const game = primed(new GameSession(), 2_000);
    const room = coinRoomById("rookie");
    let now = playCoinRoom(game, "rookie", "time", 1_000);
    const afterEntry = 2_000 - room.entryCoins;
    game.player.score = 50;
    game.opponent.score = 400;
    game.tick(now + MATCH_SECONDS * 1000);
    expect(game.result?.outcome).toBe("loss");
    expect(game.result?.coinRoom?.payout).toBe(0);
    expect(game.progress.winningCoins).toBe(afterEntry);
  });

  it("does not deduct coins when the match never starts", () => {
    const game = primed(new GameSession(), 2_000);
    game.progress = { ...game.progress, dailyLives: 0 };
    saveProgress(game.progress);
    const enter = game.enterCoinRoomMatch("time", "rookie", 1_000);
    expect(enter.ok).toBe(false);
    if (!enter.ok) expect(enter.reason).toBe("unavailable");
    expect(game.progress.winningCoins).toBe(2_000);
    expect(game.screen).not.toBe("match");
  });

  it("does not duplicate settlement or deduction", () => {
    const game = primed(new GameSession(), 2_000);
    const room = coinRoomById("rookie");
    let now = playCoinRoom(game, "rookie", "time", 1_000);
    expect(game.progress.winningCoins).toBe(1_500);
    game.player.score = 800;
    game.opponent.score = 10;
    game.tick(now + MATCH_SECONDS * 1000);
    const once = game.progress.winningCoins;
    expect(game.result?.coinRoom?.payout).toBe(room.rewardCoins);
    game.settleActiveCoinRoom("win");
    game.settleActiveCoinRoom("win");
    expect(game.progress.winningCoins).toBe(once);
    expect(game.progress.coinRoomMatch?.settled).toBe(true);
    expect(game.progress.coinRoomMatch?.charged).toBe(true);
  });

  it("settles an abandoned in-flight stake as no-payout on reload", () => {
    const game = primed(new GameSession(), 2_000);
    playCoinRoom(game, "rookie", "time", 1_000);
    expect(game.progress.winningCoins).toBe(1_500);
    expect(game.progress.coinRoomMatch?.charged).toBe(true);
    expect(game.progress.coinRoomMatch?.settled).toBe(false);
    const persisted = JSON.parse(JSON.stringify(game.progress)) as typeof game.progress;
    const reloaded = new GameSession();
    reloaded.progress = persisted;
    const closed = reloaded.settleActiveCoinRoom("void");
    expect(closed?.payout).toBe(0);
    expect(closed?.settled).toBe(true);
    expect(reloaded.progress.coinRoomMatch?.charged).toBe(true);
    expect(reloaded.progress.coinRoomMatch?.settled).toBe(true);
    expect(reloaded.progress.winningCoins).toBe(1_500);
    reloaded.settleActiveCoinRoom("win");
    expect(reloaded.progress.winningCoins).toBe(1_500);
  });

  it("leaves existing Chrono Time free when not entered through a coin room", () => {
    const game = primed(new GameSession(), 2_000);
    game.selectCoinRoom("champion");
    game.chooseMode("time", 1_000);
    expect(game.screen).toBe("ready");
    game.confirmReady(1_000);
    game.tick(4_000);
    expect(game.mode).toBe("time");
    expect(game.phase).toBe("playing");
    expect(game.remainingMs(4_000)).toBe(MATCH_SECONDS * 1000);
    expect(game.progress.winningCoins).toBe(2_000);
    expect(game.activeCoinRoomMatch()).toBeNull();
  });

  it("leaves existing Score free when not entered through a coin room", () => {
    const game = primed(new GameSession(), 2_000);
    game.setScoreTarget(SCORE_TARGET);
    game.selectCoinRoom("elite");
    game.chooseMode("score", 2_000);
    game.confirmReady(2_000);
    game.tick(5_000);
    expect(game.mode).toBe("score");
    expect(game.phase).toBe("playing");
    expect(game.progress.winningCoins).toBe(2_000);
    game.player.score = SCORE_TARGET;
    game.tick(5_050);
    expect(game.result?.outcome).toBe("win");
    expect(game.result?.coinRoom ?? null).toBeNull();
    expect(game.progress.winningCoins).toBeGreaterThanOrEqual(2_000);
  });
});
