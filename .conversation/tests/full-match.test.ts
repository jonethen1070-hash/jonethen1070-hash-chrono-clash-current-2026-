import { describe, expect, it } from "vitest";
import { findAnyValidSwap } from "../src/engine/board";
import { GameSession } from "../src/engine/session";
import { withPowerStock } from "../src/engine/economy";
import { mkdirSync, writeFileSync } from "node:fs";

describe("full 60-second match", () => {
  it("plays swaps for 60s and names the correct winner", () => {
    const lines: string[] = [];
    const game = new GameSession();
    game.progress = withPowerStock(game.progress, { freeze: 5, timeshift: 5 });
    game.mode = "time";
    let now = 10_000;
    game.startMatch(now);
    now += 3_000;
    game.tick(now);
    expect(game.phase).toBe("playing");

    let swaps = 0;
    const playStart = now;
    while (now < playStart + 61_000 && game.phase === "playing") {
      now += 400;
      game.tick(now);
      const move = findAnyValidSwap(game.player.board);
      if (move && game.tryPlayerSwap(move.a, move.b, now)) swaps += 1;
      if (game.player.energy >= 16 && swaps % 10 === 0) game.usePower("freeze", now);
    }
    game.tick(now + 1);
    const result = game.result;
    expect(result).not.toBeNull();
    const expected =
      result!.playerScore > result!.opponentScore
        ? "win"
        : result!.playerScore < result!.opponentScore
          ? "loss"
          : "tie";
    expect(result!.outcome).toBe(expected);
    expect(swaps).toBeGreaterThan(5);
    lines.push(`swaps=${swaps}`);
    lines.push(`player=${result!.playerScore} rival=${result!.opponentScore}`);
    lines.push(`outcome=${result!.outcome}`);
    lines.push(`bestCombo=${result!.playerBestCombo}`);
    lines.push(`plays=${result!.progress.plays} record=${result!.progress.wins}-${result!.progress.losses}-${result!.progress.ties}`);
    lines.push("PASS: complete 60s match produced a correct winner");
    mkdirSync("/opt/cursor/artifacts", { recursive: true });
    writeFileSync("/opt/cursor/artifacts/chrono_clash_match_log.txt", lines.join("\n") + "\n");
  });
});
