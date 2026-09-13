import { describe, expect, it } from "vitest";
import { comboBurstText, comboFlavor } from "../src/engine/combat";
import { GameSession } from "../src/engine/session";
import { comboBurstClass, resultHeadline } from "../src/ui/feel";

describe("phase 7 visual presentation helpers", () => {
  it("keeps combo scoring copy while adding MEGA COMBO presentation", () => {
    expect(comboFlavor(3)).toBe("NICE!");
    expect(comboBurstText(3)).toBe("COMBO x3\nNICE!");
    expect(comboBurstText(5)).toBe("COMBO x5\nAMAZING!");
    expect(comboBurstClass(3)).toBe("epic");
    expect(comboBurstClass(5)).toBe("mega");
    expect(comboBurstClass(8)).toBe("mega");
    expect(comboFlavor(8)).toBe("MEGA COMBO");
    expect(comboBurstText(8)).toBe("COMBO x8\nMEGA COMBO");
  });

  it("shows DEFEATED on the results headline without changing finale audio keys", () => {
    expect(resultHeadline("win")).toBe("VICTORY");
    expect(resultHeadline("loss")).toBe("DEFEATED");
    expect(resultHeadline("draw")).toBe("DRAW");
  });

  it("retries from results without changing match rules", () => {
    const game = new GameSession();
    game.progress = { ...game.progress, tutorialDone: true, matchesSeen: 4 };
    game.chooseMode("time");
    game.startMatch(1000);
    game.tick(4200);
    expect(game.phase).toBe("playing");
    game.player.score = 40;
    game.opponent.score = 900;
    game.tick(4200 + 60_000);
    expect(game.result?.outcome).toBe("loss");
    game.playAgain(70_000);
    expect(game.screen).toBe("ready");
    expect(game.result).toBeNull();
  });
});
