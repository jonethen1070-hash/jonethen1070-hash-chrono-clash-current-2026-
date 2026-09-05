import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AudioBus } from "../src/audio/bus";
import { unlockGameAudio } from "../src/audio/unlock";
import { applyMatchAudioMute, DEFAULT_SETTINGS, isMatchAudioMuted } from "../src/engine/settings";

describe("main menu Sign In / Guest and match HUD audio", () => {
  it("adds Sign In and Continue as Guest to the existing main menu without a second auth system", () => {
    const src = readFileSync("src/main.ts", "utf8");
    expect(src).toContain('id="menuGoogle"');
    expect(src).toContain('id="menuGuest"');
    expect(src).toContain('id="menuEmail"');
    expect(src).toContain('id="battleRandom"');
    expect(src).toContain('signInWith("google")');
    expect(src).toContain("unlockGameAudio(audio, settings.music)");
    expect(src).toContain("armFirstGestureAudio");
    expect(src).toContain("audio.prefetch()");
    expect(src).toContain("session.screen !== \"splash\"");
    expect(src).toContain("audio.syncBed(\"lobby\")");
    expect(src).toContain("audio.status()");
    expect(src).toContain("session.openOnline()");
    expect(src.match(/new ChronoClient\(/g)?.length).toBe(1);
  });

  it("keeps Guest available on ONLINE when provider credentials are absent", () => {
    const identity = readFileSync("src/net/identity.ts", "utf8");
    expect(identity).toContain("if ((!config || config.guest) && allowed.includes(\"guest\"))");
    const src = readFileSync("src/main.ts", "utf8");
    expect(src).toContain("Guest pilot · Player ID ready.");
    expect(src).toContain("guestDeviceToken()");
  });

  it("toggles the existing sfx and music settings from the match HUD mute control", () => {
    const settings = { ...DEFAULT_SETTINGS };
    expect(isMatchAudioMuted(settings)).toBe(false);
    applyMatchAudioMute(settings, true);
    expect(settings.sfx).toBe(false);
    expect(settings.music).toBe(false);
    expect(isMatchAudioMuted(settings)).toBe(true);
    applyMatchAudioMute(settings, false);
    expect(settings.sfx).toBe(true);
    expect(settings.music).toBe(true);
    const src = readFileSync("src/main.ts", "utf8");
    expect(src).toContain('id="hudMute"');
    expect(src).toContain("applyMatchAudioMute(settings, muted)");
    expect(src).toContain("audio.startMusic()");
    expect(src).toContain("audio.stopMusic()");
    expect(src).toContain("AUDIO ON");
    expect(src).toContain("AUDIO OFF");
  });

  it("starts and stops the existing AudioBus after an unlock gesture without a second engine", () => {
    const bus = new AudioBus();
    bus.configure(true, true, "high");
    expect(() => unlockGameAudio(bus, true)).not.toThrow();
    expect(() => bus.startMusic()).not.toThrow();
    expect(() => bus.stopMusic()).not.toThrow();
    expect(bus.sfxOn).toBe(true);
    expect(bus.musicOn).toBe(true);
    const src = readFileSync("src/main.ts", "utf8");
    expect(src).toContain('from "./audio/unlock"');
    expect(src).not.toContain('from "./audio/music"');
  });
});
