import { describe, expect, it } from "vitest";
import { INTRO_TOTAL_MS, STUDIO_MS, TITLE_MS, canSkipIntro, introBeat, shouldPlayIntro } from "../src/engine/intro";
import { DEFAULT_SETTINGS, loadSettings } from "../src/engine/settings";
import { GameSession } from "../src/engine/session";

describe("olivia nova intro", () => {
  it("plays a 3-5 second studio then title sequence", () => {
    expect(STUDIO_MS + TITLE_MS).toBe(INTRO_TOTAL_MS);
    expect(INTRO_TOTAL_MS).toBeGreaterThanOrEqual(3000);
    expect(INTRO_TOTAL_MS).toBeLessThanOrEqual(5000);
    expect(introBeat(0)).toBe("studio");
    expect(introBeat(STUDIO_MS - 1)).toBe("studio");
    expect(introBeat(STUDIO_MS)).toBe("title");
    expect(introBeat(INTRO_TOTAL_MS - 1)).toBe("title");
    expect(introBeat(INTRO_TOTAL_MS)).toBe("done");
  });

  it("is not skippable until after the first viewing", () => {
    expect(shouldPlayIntro(false)).toBe(true);
    expect(canSkipIntro(false)).toBe(false);
    expect(shouldPlayIntro(true)).toBe(false);
    expect(canSkipIntro(true)).toBe(true);
    expect(DEFAULT_SETTINGS.introSeen).toBe(false);
  });

  it("holds splash through the cinematic then lands on the menu", () => {
    const game = new GameSession();
    game.begin(1000, false);
    expect(game.screen).toBe("splash");
    game.tick(1000 + STUDIO_MS + 100);
    expect(game.screen).toBe("splash");
    expect(game.snapshot(1000 + STUDIO_MS + 100).introBeat).toBe("title");
    expect(game.skipIntro(false)).toBe(false);
    expect(game.screen).toBe("splash");
    game.tick(1000 + INTRO_TOTAL_MS - 1);
    expect(game.screen).toBe("splash");
    game.tick(1000 + INTRO_TOTAL_MS);
    expect(game.screen).toBe("menu");
  });

  it("skips the intro on later launches and still reaches play", () => {
    const game = new GameSession();
    game.begin(50, true);
    expect(game.screen).toBe("menu");
    game.progress = { ...game.progress, tutorialDone: true };
    game.playNow(80);
    expect(game.screen).toBe("ready");
  });
});

describe("settings intro persistence", () => {
  it("defaults introSeen off so the first launch plays the cinematic", () => {
    expect(loadSettings().introSeen === true || loadSettings().introSeen === false).toBe(true);
    expect(DEFAULT_SETTINGS.introSeen).toBe(false);
  });
});
