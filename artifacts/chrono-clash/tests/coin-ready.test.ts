import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { GameSession } from "../src/engine/session";
import { coinRoomById, coinRooms } from "../src/engine/rooms";
import { EMPTY_PROGRESS, MATCH_SECONDS, READY_MS, SCORE_TARGET } from "../src/engine/types";
import { withPowerStock } from "../src/engine/economy";
import { coinReadyViewHtml } from "../src/ui/metaViews";

const main = readFileSync(resolve("src/main.ts"), "utf8");
const views = readFileSync(resolve("src/ui/metaViews.ts"), "utf8");

function progress(coins: number) {
  return {
    ...EMPTY_PROGRESS,
    name: "Nova Pulse",
    unlocked: [...EMPTY_PROGRESS.unlocked],
    powersUsed: { ...EMPTY_PROGRESS.powersUsed },
    tutorialDone: true,
    dailyLives: 3,
    winningCoins: coins,
  };
}

function primed(coins: number): GameSession {
  const game = new GameSession();
  game.progress = withPowerStock(progress(coins), { freeze: 5, timeshift: 5 }, coins);
  return game;
}

describe("coin match ready presentation", () => {
  it("renders every room name, entry fee, player, and local opponent", () => {
    const p = progress(8_000);
    for (const room of coinRooms()) {
      const html = coinReadyViewHtml(p, room);
      expect(html).toContain(`data-ready-room="${room.id}"`);
      expect(html).toContain(`data-ready-entry="${room.entryCoins}"`);
      expect(html).toContain(`data-ready-wallet="8000"`);
      expect(html).toContain(`<small>ROOM</small><b>${room.name.toUpperCase()}</b>`);
      expect(html).toContain(`<small>ENTRY</small><b>${room.entryCoins.toLocaleString("en-US")} 🪙</b>`);
      expect(html).toContain("<small>YOU</small>");
      expect(html).toContain("NOVA PULSE");
      expect(html).toContain("BALANCE 8,000 🪙");
      expect(html).toContain("<small>OPPONENT</small>");
      expect(html).toContain("LOCAL RIVAL");
      expect(html).toContain("TEST");
      expect(html).toContain("ready-vs");
    }
    expect(coinRooms().map((room) => [room.name.toUpperCase(), room.entryCoins])).toEqual([
      ["ROOKIE", 500],
      ["PRO", 1_500],
      ["ELITE", 5_000],
      ["MASTER", 15_000],
      ["CHAMPION", 50_000],
    ]);
  });

  it("carries the selected room onto Ready without charging", () => {
    const game = primed(8_000);
    game.selectCoinRoom("master");
    const enter = game.enterCoinRoomMatch("time", "elite", 1_000);
    expect(enter.ok).toBe(true);
    expect(game.screen).toBe("ready");
    expect(game.selectedRoomId).toBe("elite");
    expect(game.pendingCoinRoom()?.id).toBe("elite");
    expect(game.pendingCoinRoom()?.entryCoins).toBe(5_000);
    expect(game.progress.winningCoins).toBe(8_000);
    expect(game.activeCoinRoomMatch()).toBeNull();
  });

  it("holds the coin-room Ready screen until READY and does not auto-deduct", () => {
    const game = primed(8_000);
    game.enterCoinRoomMatch("score", "pro", 2_000);
    expect(game.screen).toBe("ready");
    game.tick(2_000 + READY_MS + 250);
    expect(game.screen).toBe("ready");
    expect(game.progress.winningCoins).toBe(8_000);
    expect(game.pendingCoinRoom()?.id).toBe("pro");
    game.confirmReady(4_000);
    expect(game.screen).toBe("match");
    expect(game.phase).toBe("countdown");
    expect(game.progress.winningCoins).toBe(6_500);
    expect(game.activeCoinRoomMatch()?.charged).toBe(true);
    expect(game.pendingCoinRoom()).toBeNull();
    game.confirmReady(4_100);
    expect(game.progress.winningCoins).toBe(6_500);
  });

  it("still auto-starts free Chrono Time and Score after READY_MS", () => {
    const time = primed(8_000);
    time.selectCoinRoom("champion");
    time.chooseMode("time", 1_000);
    expect(time.pendingCoinRoom()).toBeNull();
    expect(time.progress.winningCoins).toBe(8_000);
    time.tick(1_000 + READY_MS);
    expect(time.screen).toBe("match");
    expect(time.mode).toBe("time");
    expect(time.progress.winningCoins).toBe(8_000);
    expect(time.remainingMs(1_000 + READY_MS + 3_000)).toBe(MATCH_SECONDS * 1000);

    const score = primed(8_000);
    score.setScoreTarget(SCORE_TARGET);
    score.chooseMode("score", 2_000);
    expect(score.pendingCoinRoom()).toBeNull();
    score.tick(2_000 + READY_MS);
    expect(score.screen).toBe("match");
    expect(score.mode).toBe("score");
    expect(score.progress.winningCoins).toBe(8_000);
  });

  it("keeps Step 2 settlement on a coin-room start from Ready", () => {
    const game = primed(2_000);
    const room = coinRoomById("rookie");
    game.enterCoinRoomMatch("time", "rookie", 1_000);
    game.confirmReady(1_000);
    expect(game.progress.winningCoins).toBe(1_500);
    game.tick(4_000);
    expect(game.phase).toBe("playing");
    game.player.score = 9_000;
    game.opponent.score = 10;
    game.tick(4_000 + MATCH_SECONDS * 1000);
    expect(game.result?.coinRoom?.roomId).toBe("rookie");
    expect(game.result?.coinRoom?.payout).toBe(room.rewardCoins);
    expect(game.progress.winningCoins).toBeGreaterThanOrEqual(1_500 + room.rewardCoins);
  });

  it("hooks READY into confirmReady without duplicating economy in the view", () => {
    expect(main).toContain('id="readyClash"');
    expect(main).toContain('id="readyStart">READY');
    expect(main).toContain("coinReadyViewHtml(");
    expect(main).toContain("session.pendingCoinRoom()");
    expect(main).toContain("session.confirmReady()");
    const startClick = main.slice(main.indexOf("ui.readyStart.addEventListener"), main.indexOf("ui.dailyRun.addEventListener"));
    expect(startClick).toContain("session.confirmReady()");
    expect(startClick).not.toContain("spendWinningCoins");
    expect(startClick).not.toContain("enterCoinRoomMatch");
    expect(views).toContain("export function coinReadyViewHtml");
    expect(views.slice(views.indexOf("export function coinReadyViewHtml"), views.indexOf("export function readyPowerStripHtml"))).not.toContain(
      "spendWinningCoins",
    );
  });
});
