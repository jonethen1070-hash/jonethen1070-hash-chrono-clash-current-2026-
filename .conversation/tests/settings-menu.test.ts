import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { READY_MS } from "../src/engine/types";
import { GameSession } from "../src/engine/session";

describe("simplified settings", () => {
  it("keeps sound, music, vibration, and quit in Settings", () => {
    const src = readFileSync("src/main.ts", "utf8");
    const settings = src.slice(src.indexOf('id="settingsScreen"'), src.indexOf('id="match"'));
    expect(settings).toContain('id="sfxToggle"');
    expect(settings).toContain("<span>Sound</span>");
    expect(settings).toContain('id="sfxVolume"');
    expect(settings).toContain('id="musicToggle"');
    expect(settings).toContain("<span>Music</span>");
    expect(settings).toContain('id="musicVolume"');
    expect(settings).toContain('id="hapticsToggle"');
    expect(settings).toContain("<span>Vibration</span>");
    expect(settings).toContain('id="quitGame"');
    expect(settings).toContain("<span>Quit</span>");
    expect(settings).not.toContain("Announcer");
    expect(settings).not.toContain("Effects intensity");
    expect(settings).not.toContain("Animation intensity");
    expect(settings).not.toContain("Tutorial / How to Play");
    expect(settings).not.toContain("Reset local progress");
    expect(settings).not.toContain("Chrono Powers");
  });

  it("keeps Chat and Settings as compact match HUD icons", () => {
    const src = readFileSync("src/main.ts", "utf8");
    const match = src.slice(src.indexOf('id="match"'), src.indexOf('id="sheet"'));
    expect(match).toContain('id="dockChat"');
    expect(match).toContain('id="dockSettings"');
    expect(match).toContain('id="hudMute"');
    expect(match).toContain("match-brand-actions");
    expect(match).toContain('aria-label="Chat"');
    expect(match).toContain('aria-label="Settings"');
    expect(match).not.toContain("match-dock");
    expect(match).not.toContain(">CHAT<");
    expect(match).not.toContain(">SETTINGS<");
    expect(match).not.toContain("LEADER");
    expect(match).not.toContain("HOME");
    expect(match).not.toContain("MISSIONS");
    expect(src).toContain("session.quitToMenu()");
    const studio = readFileSync("src/styles/studio.css", "utf8");
    expect(studio).toContain("#match .hud-icon");
    expect(studio).toContain("grid-template-rows: auto auto auto minmax(0, 1fr) auto");
    expect(studio).not.toContain("#match .match-dock { grid-row: 6");
  });

  it("quits a match back to the menu without resuming it", () => {
    const game = new GameSession();
    game.progress = { ...game.progress, tutorialDone: true };
    game.chooseMode("time", 1_000);
    game.tick(1_000 + READY_MS);
    game.tick(1_000 + READY_MS + 3_000);
    expect(game.screen).toBe("match");
    expect(game.phase).toBe("playing");
    game.openSettings();
    expect(game.screen).toBe("settings");
    game.quitToMenu();
    expect(game.screen).toBe("menu");
  });
});
