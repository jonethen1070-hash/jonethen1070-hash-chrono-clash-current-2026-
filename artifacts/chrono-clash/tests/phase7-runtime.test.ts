import { describe, expect, it } from "vitest";
import { findAnyValidSwap } from "../src/engine/board";
import { GameSession } from "../src/engine/session";
import { ENERGY_FREEZE, ENERGY_TIMESHIFT } from "../src/engine/types";
import { withPowerStock } from "../src/engine/economy";

describe("phase 7 runtime gameplay remains intact", () => {
  it("uses freeze, timeshift, and rewind during a live match", () => {
    const game = new GameSession();
    game.progress = withPowerStock({ ...game.progress, tutorialDone: true, matchesSeen: 8 }, { freeze: 5, timeshift: 5 });
    game.mode = "time";
    let now = 20_000;
    game.startMatch(now);
    now += 3200;
    game.tick(now);
    expect(game.phase).toBe("playing");

    game.player.energy = 100;
    expect(game.canUsePower("freeze", now)).toBe(true);
    expect(game.usePower("freeze", now)).toBe(true);
    expect(game.player.energy).toBe(100 - ENERGY_FREEZE);
    expect(game.fx.some((f) => f.kind === "power" && f.text.toUpperCase().includes("FREEZE"))).toBe(true);

    now += 400;
    game.tick(now);
    game.player.energy = 100;
    expect(game.usePower("timeshift", now)).toBe(true);
    expect(game.player.energy).toBe(100 - ENERGY_TIMESHIFT);
    expect(game.fx.some((f) => f.kind === "power" && /TIME|TEMPO|SHIFT/i.test(f.text))).toBe(true);

    now += 200;
    game.tick(now);
    const move = findAnyValidSwap(game.player.board);
    expect(move).toBeTruthy();
    expect(game.tryPlayerSwap(move!.a, move!.b, now)).toBe(true);
    now += 80;
    game.tick(now);
    game.player.energy = 100;
    expect(game.canUsePower("rewind", now)).toBe(true);
    expect(game.usePower("rewind", now)).toBe(true);
    expect(game.fx.some((f) => f.kind === "rewind")).toBe(true);
  });

  it("still fires attack fx and can finish in victory or defeat", () => {
    const win = new GameSession();
    win.progress = { ...win.progress, tutorialDone: true, matchesSeen: 8 };
    win.mode = "time";
    win.startMatch(1000);
    win.tick(4200);
    win.player.score = 8800;
    win.opponent.score = 200;
    win.tick(4200 + 60_000);
    expect(win.result?.outcome).toBe("win");
    expect(win.fx.some((f) => f.kind === "finale" && f.text === "VICTORY")).toBe(true);
    expect(win.fx.some((f) => f.kind === "attack")).toBe(true);

    const loss = new GameSession();
    loss.progress = { ...loss.progress, tutorialDone: true, matchesSeen: 8 };
    loss.mode = "time";
    loss.startMatch(1000);
    loss.tick(4200);
    loss.player.score = 40;
    loss.opponent.score = 9000;
    loss.tick(4200 + 60_000);
    expect(loss.result?.outcome).toBe("loss");
    expect(loss.fx.some((f) => f.kind === "finale" && f.text === "DEFEAT")).toBe(true);
    loss.playAgain(70_000);
    expect(loss.screen).toBe("ready");
  });

  it("drops overlapping swaps while the first resolve is still settling", () => {
    const game = new GameSession();
    game.progress = { ...game.progress, tutorialDone: true, matchesSeen: 8 };
    game.mode = "time";
    const start = 1_000;
    game.startMatch(start);
    game.tick(start + 3_200);
    const move = findAnyValidSwap(game.player.board);
    expect(move).not.toBeNull();
    expect(game.tryPlayerSwap(move!.a, move!.b, start + 3_200)).toBe(true);
    expect(game.isInteractive(start + 3_210)).toBe(false);
    expect(game.isInteractive(start + 4_000)).toBe(true);
  });
});
