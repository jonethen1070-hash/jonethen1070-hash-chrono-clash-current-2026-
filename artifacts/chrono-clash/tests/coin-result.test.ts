import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { GameSession } from "../src/engine/session";
import { coinRoomById, coinRooms } from "../src/engine/rooms";
import { EMPTY_PROGRESS, FINALE_MS, MATCH_SECONDS, READY_MS } from "../src/engine/types";
import { withPowerStock } from "../src/engine/economy";
import { coinResultViewHtml } from "../src/ui/metaViews";

const main = readFileSync(resolve("src/main.ts"), "utf8");
const views = readFileSync(resolve("src/ui/metaViews.ts"), "utf8");

function progress(coins: number) {
  return {
    ...EMPTY_PROGRESS,
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

function finishCoinMatch(game: GameSession, roomId: string, win: boolean, now = 1_000): number {
  const enter = game.enterCoinRoomMatch("time", roomId, now);
  expect(enter.ok).toBe(true);
  expect(game.progress.winningCoins).toBe(enter.have);
  game.confirmReady(now);
  now += 3_000;
  game.tick(now);
  expect(game.phase).toBe("playing");
  game.player.score = win ? 9_000 : 40;
  game.opponent.score = win ? 20 : 800;
  game.tick(now + MATCH_SECONDS * 1000);
  expect(game.result?.outcome).toBe(win ? "win" : "loss");
  game.tick(now + MATCH_SECONDS * 1000 + FINALE_MS + 20);
  expect(game.screen).toBe("results");
  return now;
}

describe("coin match result presentation", () => {
  it("shows each room's configured entry, winnings, net, and balance on a win", () => {
    for (const room of coinRooms()) {
      const start = room.entryCoins + 250;
      const html = coinResultViewHtml(
        {
          matchId: `win-${room.id}`,
          roomId: room.id,
          entryCoins: room.entryCoins,
          payout: room.rewardCoins,
          settled: true,
          outcome: "win",
        },
        start - room.entryCoins + room.rewardCoins,
      );
      expect(html).toContain(`data-result-room="${room.id}"`);
      expect(html).toContain(`data-result-entry="${room.entryCoins}"`);
      expect(html).toContain(`data-result-winnings="${room.rewardCoins}"`);
      expect(html).toContain(`data-result-net="${room.rewardCoins - room.entryCoins}"`);
      expect(html).toContain(`<small>ROOM</small><b>${room.name.toUpperCase()}</b>`);
      expect(html).toContain(`<small>ENTRY</small><b>${room.entryCoins.toLocaleString("en-US")} 🪙</b>`);
      expect(html).toContain(`<small>WINNINGS</small><b class="up">+${room.rewardCoins.toLocaleString("en-US")} 🪙</b>`);
      expect(html).toContain(
        `<small>NET</small><b class="up">+${(room.rewardCoins - room.entryCoins).toLocaleString("en-US")} 🪙</b>`,
      );
      expect(html).toContain("BALANCE");
    }
  });

  it("shows zero winnings and a negative net on a loss", () => {
    const room = coinRoomById("elite");
    const html = coinResultViewHtml(
      {
        matchId: "loss-elite",
        roomId: "elite",
        entryCoins: room.entryCoins,
        payout: 0,
        settled: true,
        outcome: "loss",
      },
      3_000,
    );
    expect(html).toContain("<small>ROOM</small><b>ELITE</b>");
    expect(html).toContain("<small>ENTRY</small><b>5,000 🪙</b>");
    expect(html).toContain("<small>WINNINGS</small><b class=\"up\">+0 🪙</b>");
    expect(html).toContain("<small>NET</small><b class=\"down\">-5,000 🪙</b>");
    expect(html).toContain("<small>BALANCE</small><b>3,000 🪙</b>");
    expect(html).toContain('data-result-winnings="0"');
    expect(html).toContain('data-result-net="-5000"');
  });

  it("uses the live settlement on a win without settling twice", () => {
    const room = coinRoomById("pro");
    const game = primed(4_000);
    finishCoinMatch(game, "pro", true);
    const settled = game.result?.coinRoom;
    expect(settled?.roomId).toBe("pro");
    expect(settled?.entryCoins).toBe(room.entryCoins);
    expect(settled?.payout).toBe(room.rewardCoins);
    expect(settled?.settled).toBe(true);
    const after = game.progress.winningCoins;
    expect(after).toBeGreaterThanOrEqual(4_000 - room.entryCoins + room.rewardCoins);
    const html = coinResultViewHtml(settled!, after);
    expect(html).toContain("PRO");
    expect(html).toContain(`ENTRY</small><b>${room.entryCoins.toLocaleString("en-US")} 🪙`);
    expect(html).toContain(`+${room.rewardCoins.toLocaleString("en-US")} 🪙`);
    const again = game.settleActiveCoinRoom("win");
    expect(again?.payout).toBe(0);
    expect(game.progress.winningCoins).toBe(after);
    const rerender = coinResultViewHtml(game.result!.coinRoom!, game.progress.winningCoins);
    expect(rerender).toBe(html);
  });

  it("uses the live settlement on a loss without paying out", () => {
    const room = coinRoomById("master");
    const game = primed(20_000);
    finishCoinMatch(game, "master", false);
    const settled = game.result?.coinRoom;
    expect(settled?.roomId).toBe("master");
    expect(settled?.entryCoins).toBe(15_000);
    expect(settled?.payout).toBe(0);
    const after = game.progress.winningCoins;
    expect(after).toBe(20_000 - room.entryCoins);
    const html = coinResultViewHtml(settled!, after);
    expect(html).toContain("MASTER");
    expect(html).toContain("WINNINGS</small><b class=\"up\">+0 🪙");
    expect(html).toContain("NET</small><b class=\"down\">-15,000 🪙");
    expect(html).toContain(`BALANCE</small><b>${after.toLocaleString("en-US")} 🪙`);
    game.settleActiveCoinRoom("win");
    expect(game.progress.winningCoins).toBe(after);
  });

  it("replays the same room without charging until the next match starts", () => {
    const game = primed(8_000);
    finishCoinMatch(game, "elite", true);
    const afterWin = game.progress.winningCoins;
    const replay = game.replayCoinRoom(80_000);
    expect(replay.ok).toBe(true);
    expect(replay.ok && replay.charged).toBe(0);
    expect(game.screen).toBe("ready");
    expect(game.selectedRoomId).toBe("elite");
    expect(game.pendingCoinRoom()?.id).toBe("elite");
    expect(game.progress.winningCoins).toBe(afterWin);
    game.confirmReady(80_000);
    expect(game.progress.winningCoins).toBe(afterWin - 5_000);
  });

  it("returns to Coin Rooms from results without settling again", () => {
    const game = primed(2_000);
    finishCoinMatch(game, "rookie", false);
    const after = game.progress.winningCoins;
    game.openRooms();
    expect(game.screen).toBe("rooms");
    expect(game.progress.winningCoins).toBe(after);
    game.settleActiveCoinRoom("win");
    expect(game.progress.winningCoins).toBe(after);
  });

  it("leaves Chrono Time and Score on the existing results actions", () => {
    const game = primed(8_000);
    game.chooseMode("time", 1_000);
    game.tick(1_000 + READY_MS);
    expect(game.screen).toBe("match");
    game.tick(1_000 + READY_MS + 3_000);
    expect(game.phase).toBe("playing");
    game.player.score = 50;
    game.opponent.score = 10;
    const endAt = 1_000 + READY_MS + 3_000 + MATCH_SECONDS * 1000;
    game.tick(endAt);
    expect(game.phase).toBe("ended");
    game.tick(endAt + FINALE_MS + 20);
    expect(game.screen).toBe("results");
    expect(game.result?.coinRoom ?? null).toBeNull();
    expect(game.progress.winningCoins).toBeGreaterThanOrEqual(8_000);
    game.playAgain(90_000);
    expect(game.screen).toBe("ready");
    expect(game.pendingCoinRoom()).toBeNull();

    expect(main).toContain('id="resultPlayAgain">PLAY AGAIN');
    expect(main).toContain('id="resultBackRooms">BACK TO ROOMS');
    expect(main).toContain("session.replayCoinRoom()");
    expect(main).toContain("session.openRooms()");
    expect(main).toContain("coinResultViewHtml(coin, session.progress.winningCoins)");
    const retry = main.slice(
      main.indexOf('$("#retryMatch").addEventListener'),
      main.indexOf('$("#resultPlayAgain").addEventListener'),
    );
    expect(retry).toContain("session.playAgain()");
    expect(retry).not.toContain("replayCoinRoom");
    const view = views.slice(views.indexOf("export function coinResultViewHtml"), views.indexOf("export function readyPowerStripHtml"));
    expect(view).not.toContain("spendWinningCoins");
    expect(view).not.toContain("grantWinningCoins");
    expect(view).not.toContain("settleActiveCoinRoom");
  });
});
