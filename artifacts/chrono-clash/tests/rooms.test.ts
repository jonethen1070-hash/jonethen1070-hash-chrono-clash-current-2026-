import { describe, expect, it } from "vitest";
import {
  COIN_ROOMS,
  coinRoomById,
  coinRooms,
  DEFAULT_COIN_ROOM_ID,
  parseCoinRoomId,
} from "../src/engine/rooms";
import { GameSession } from "../src/engine/session";
import { MATCH_SECONDS, SCORE_TARGET } from "../src/engine/types";
import { withPowerStock } from "../src/engine/economy";

function startPlaying(game: GameSession, mode: "time" | "score", now: number): number {
  game.progress = {
    ...withPowerStock(game.progress, { freeze: 5, timeshift: 5 }),
    tutorialDone: true,
  };
  game.chooseMode(mode, now);
  expect(game.screen).toBe("ready");
  game.confirmReady(now);
  now += 3_000;
  game.tick(now);
  expect(game.phase).toBe("playing");
  return now;
}

describe("virtual coin rooms", () => {
  it("loads all five data-driven room definitions", () => {
    const rooms = coinRooms();
    expect(rooms).toHaveLength(5);
    expect(rooms.map((room) => room.id)).toEqual(["rookie", "pro", "elite", "master", "champion"]);
    expect(rooms.map((room) => room.entryCoins)).toEqual([500, 1_500, 5_000, 15_000, 50_000]);
    expect(rooms.map((room) => room.name)).toEqual(["Rookie", "Pro", "Elite", "Master", "Champion"]);
    for (const room of rooms) {
      expect(room.rewardCoins).toBeNull();
      expect(coinRoomById(room.id)).toEqual(room);
    }
    expect(COIN_ROOMS).toBe(rooms);
  });

  it("clamps unknown room ids to Rookie without inventing rooms", () => {
    expect(parseCoinRoomId(undefined)).toBe(DEFAULT_COIN_ROOM_ID);
    expect(parseCoinRoomId("not-a-room")).toBe("rookie");
    expect(coinRoomById("champion").entryCoins).toBe(50_000);
  });

  it("selects a room without charging the existing wallet", () => {
    const game = new GameSession();
    game.progress = { ...game.progress, winningCoins: 80, tutorialDone: true };
    const before = game.progress.winningCoins;
    const room = game.selectCoinRoom("elite");
    expect(room.id).toBe("elite");
    expect(room.entryCoins).toBe(5_000);
    expect(game.selectedRoomId).toBe("elite");
    expect(game.coinRoom().name).toBe("Elite");
    expect(game.progress.winningCoins).toBe(before);
    expect(game.progress.lastCoinRoomId).toBe("elite");
    expect(game.snapshot(1).coinRoomId).toBe("elite");
    expect(game.selectCoinRoom("nope").id).toBe("rookie");
  });

  it("still starts Chrono Time with the selected room attached", () => {
    const game = new GameSession();
    game.selectCoinRoom("pro");
    const coins = game.progress.winningCoins;
    const now = startPlaying(game, "time", 1_000);
    expect(game.mode).toBe("time");
    expect(game.remainingMs(now)).toBe(MATCH_SECONDS * 1000);
    expect(game.selectedRoomId).toBe("pro");
    expect(game.progress.winningCoins).toBe(coins);
    expect(game.snapshot(now).coinRoomId).toBe("pro");
  });

  it("still starts Score mode with the selected room attached", () => {
    const game = new GameSession();
    game.setScoreTarget(SCORE_TARGET);
    game.selectCoinRoom("master");
    const coins = game.progress.winningCoins;
    const now = startPlaying(game, "score", 2_000);
    expect(game.mode).toBe("score");
    expect(game.remainingMs(now)).toBe(0);
    expect(game.selectedRoomId).toBe("master");
    expect(game.progress.winningCoins).toBe(coins);
    game.player.score = SCORE_TARGET;
    game.tick(now + 50);
    expect(game.result).not.toBeNull();
    expect(game.result!.mode).toBe("score");
  });
});
