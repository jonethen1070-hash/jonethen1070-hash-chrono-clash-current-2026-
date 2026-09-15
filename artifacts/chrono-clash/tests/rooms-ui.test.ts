import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { GameSession } from "../src/engine/session";
import { coinRooms } from "../src/engine/rooms";
import { EMPTY_PROGRESS } from "../src/engine/types";
import { withPowerStock } from "../src/engine/economy";
import { roomsViewHtml } from "../src/ui/metaViews";

const main = readFileSync(resolve("src/main.ts"), "utf8");
const views = readFileSync(resolve("src/ui/metaViews.ts"), "utf8");

function progress(coins: number, lives = 3) {
  return {
    ...EMPTY_PROGRESS,
    unlocked: [...EMPTY_PROGRESS.unlocked],
    powersUsed: { ...EMPTY_PROGRESS.powersUsed },
    tutorialDone: true,
    dailyLives: lives,
    winningCoins: coins,
  };
}

describe("coin room selection screen", () => {
  it("lists all five rooms with the catalog entry fees and current balance", () => {
    const html = roomsViewHtml(progress(8_000), "elite", "time", true);
    expect(html).toContain("data-wallet=\"8000\"");
    expect(html).toContain("WINNING COINS");
    expect(html).toContain("8,000 🪙");
    expect(html).toContain("YOUR BALANCE 8,000 🪙");
    expect(html).toContain("ROOKIE — 500 🪙");
    expect(html).toContain("PRO — 1,500 🪙");
    expect(html).toContain("ELITE — 5,000 🪙");
    expect(html).toContain("MASTER — 15,000 🪙");
    expect(html).toContain("CHAMPION — 50,000 🪙");
    expect(coinRooms().map((room) => room.id)).toEqual(["rookie", "pro", "elite", "master", "champion"]);
    for (const room of coinRooms()) {
      expect(html).toContain(`data-room="${room.id}"`);
      expect(html).toContain(`data-enter="${room.id}"`);
    }
  });

  it("enables ENTER on affordable rooms and locks unaffordable rooms", () => {
    const html = roomsViewHtml(progress(8_000), "pro", "time", true);
    const enter = (id: string) => {
      const match = html.match(new RegExp(`data-enter="${id}"([^>]*)>`));
      return match?.[1] ?? "";
    };
    expect(enter("rookie")).not.toContain("disabled");
    expect(enter("pro")).not.toContain("disabled");
    expect(enter("elite")).not.toContain("disabled");
    expect(enter("master")).toContain("disabled");
    expect(enter("champion")).toContain("disabled");
    expect(html).toContain("NEED 7,000 🪙");
    expect(html).toContain("NEED 42,000 🪙");
    expect(html).toContain("ENTRY OPEN");
    expect(html).toContain(">LOCKED<");
    expect(html).toContain(">ENTER<");
    expect(html).toContain("room-pro on open");
    expect(html).toContain("room-master locked");
    expect(html).toContain('aria-selected="true"');
  });

  it("blocks every room when the daily run has no lives", () => {
    const html = roomsViewHtml(progress(50_000, 0), "rookie", "score", false);
    expect(html).toContain("NO LIVES LEFT");
    expect(html.match(/data-enter="[^"]+" disabled/g)?.length).toBe(5);
    expect(html).toContain("data-rooms-mode=\"score\"");
    expect(html).toContain("chip on");
  });

  it("does not deduct coins when selecting a room", () => {
    const game = new GameSession();
    game.progress = progress(8_000);
    const before = game.progress.winningCoins;
    game.selectCoinRoom("champion");
    expect(game.progress.winningCoins).toBe(before);
    expect(game.selectedRoomId).toBe("champion");
    expect(game.screen).not.toBe("ready");
    expect(game.screen).not.toBe("match");
  });

  it("opens the rooms lobby from modes and returns without charging", () => {
    const game = new GameSession();
    game.progress = progress(8_000);
    game.screen = "menu";
    game.openModes();
    expect(game.screen).toBe("modes");
    const coins = game.progress.winningCoins;
    game.openRooms();
    expect(game.screen).toBe("rooms");
    expect(game.progress.winningCoins).toBe(coins);
    game.openModes();
    expect(game.screen).toBe("modes");
    expect(game.progress.winningCoins).toBe(coins);
  });

  it("enters an affordable room through the Step 2 path and still charges only on start", () => {
    const game = new GameSession();
    game.progress = withPowerStock(progress(8_000), { freeze: 5, timeshift: 5 }, 8_000);
    game.screen = "modes";
    game.openRooms();
    game.selectCoinRoom("elite");
    expect(game.progress.winningCoins).toBe(8_000);
    const enter = game.enterCoinRoomMatch("time", "elite", 1_000);
    expect(enter.ok).toBe(true);
    expect(enter.ok && enter.charged).toBe(0);
    expect(game.screen).toBe("ready");
    expect(game.progress.winningCoins).toBe(8_000);
    game.confirmReady(1_000);
    expect(game.progress.winningCoins).toBe(3_000);
    expect(game.activeCoinRoomMatch()?.charged).toBe(true);
  });

  it("rejects unaffordable entry without leaving the rooms flow charged", () => {
    const game = new GameSession();
    game.progress = progress(800);
    game.screen = "rooms";
    const enter = game.enterCoinRoomMatch("time", "pro", 1_000);
    expect(enter.ok).toBe(false);
    if (!enter.ok) expect(enter.reason).toBe("funds");
    expect(game.screen).toBe("rooms");
    expect(game.progress.winningCoins).toBe(800);
    expect(game.activeCoinRoomMatch()).toBeNull();
  });

  it("leaves Chrono Time and Score on the existing uncharged chooseMode path", () => {
    const time = main.slice(main.indexOf('$("#modeTime").addEventListener'), main.indexOf('$("#modeScore").addEventListener'));
    const score = main.slice(main.indexOf('$("#modeScore").addEventListener'), main.indexOf('$("#modeRooms").addEventListener'));
    const rooms = main.slice(main.indexOf('$("#modeRooms").addEventListener'), main.indexOf('$("#roomsBack").addEventListener'));
    expect(time).toContain('session.chooseMode("time")');
    expect(time).not.toContain("enterCoinRoomMatch");
    expect(score).toContain('session.chooseMode("score")');
    expect(score).not.toContain("enterCoinRoomMatch");
    expect(rooms).toContain("session.openRooms()");
    expect(rooms).not.toContain("enterCoinRoomMatch");
    expect(main).toContain("session.enterCoinRoomMatch(roomsBattleMode");
    expect(main).toContain("session.selectCoinRoom(card.dataset.room)");
  });

  it("hooks the rooms screen into the existing lobby architecture", () => {
    expect(main).toContain('id="rooms"');
    expect(main).toContain('id="roomsView"');
    expect(main).toContain('id="modeRooms"');
    expect(main).toContain(">COIN ROOMS<");
    expect(main).toContain("[ui.rooms, \"rooms\"]");
    expect(main).toContain("roomsViewHtml(");
    expect(views).toContain("canAffordCoinRoom(");
    expect(views).not.toContain("spendWinningCoins");
    expect(views).not.toContain("grantWinningCoins");
  });
});
