import { existsSync, readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AudioBus } from "../src/audio/bus";
import { AUDIO_ASSETS, MUSIC_FILES, SFX_FILES, sfxVariantIds } from "../src/audio/catalog";
import { bedFromScene, MusicDirector } from "../src/audio/scene";
import { playBattleCue } from "../src/audio/events";
import { DEFAULT_SETTINGS, loadSettings, applyMatchAudioMute } from "../src/engine/settings";

describe("premium chrono clash audio catalog", () => {
  it("ships 48kHz stereo instrumental beds instead of 22kHz sine stand-ins", () => {
    for (const key of ["lobby", "battle"] as const) {
      const path = `public${MUSIC_FILES[key].url}`;
      const buf = readFileSync(path);
      expect(statSync(path).size, path).toBeGreaterThan(2_000_000);
      expect(MUSIC_FILES[key].durationSec).toBeGreaterThanOrEqual(30);
      if (MUSIC_FILES[key].file.endsWith(".wav")) {
        expect(buf.readUInt16LE(22), path).toBe(2);
        expect(buf.readUInt32LE(24), path).toBe(48000);
      } else {
        expect(MUSIC_FILES[key].file).toBe("Arena_Pulse.m4a");
        expect(buf.subarray(4, 8).toString("ascii"), path).toBe("ftyp");
      }
    }
    for (const key of ["victory", "defeat"] as const) {
      const path = `public${MUSIC_FILES[key].url}`;
      const buf = readFileSync(path);
      expect(buf.readUInt16LE(22), path).toBe(2);
      expect(buf.readUInt32LE(24), path).toBe(48000);
      expect(statSync(path).size, path).toBeGreaterThan(2_000_000);
      expect(MUSIC_FILES[key].durationSec).toBeGreaterThanOrEqual(10);
    }
    expect(MUSIC_FILES.battle.durationSec).toBeGreaterThanOrEqual(75);
    expect(MUSIC_FILES.battle.loopStartSec).toBeGreaterThanOrEqual(0);
    expect(MUSIC_FILES.lobby.loop).toBe(true);
    expect(MUSIC_FILES.battle.loop).toBe(true);
    expect(MUSIC_FILES.victory.loop).toBe(false);
    expect(MUSIC_FILES.defeat.loop).toBe(false);
    expect(MUSIC_FILES.draw.loop).toBe(false);
    expect(MUSIC_FILES.victory.file).not.toBe(MUSIC_FILES.defeat.file);
    for (const key of ["lobby", "battle", "victory", "defeat"] as const) {
      const mp3 = `public/audio/music-${key}.mp3`;
      expect(existsSync(mp3), mp3).toBe(true);
      const header = readFileSync(mp3).subarray(0, 3);
      expect(
        header.equals(Buffer.from("ID3")) || (header[0] === 0xff && (header[1]! & 0xe0) === 0xe0),
        mp3,
      ).toBe(true);
    }
    for (const asset of AUDIO_ASSETS) {
      const path = `public${asset.url}`;
      expect(existsSync(path), path).toBe(true);
      expect(statSync(path).size).toBeGreaterThan(4000);
    }
  });

  it("covers the gameplay SFX set with unique identities", () => {
    expect(SFX_FILES.place.file).toBe("sfx-place.wav");
    expect(SFX_FILES.swap.file).toBe("sfx-move.wav");
    const swipe = readFileSync("public/audio/sfx-move.wav");
    expect(swipe.readUInt16LE(22)).toBe(2);
    expect(swipe.readUInt32LE(24)).toBe(48000);
    const frames = swipe.readUInt32LE(40) / 4;
    const first = swipe.subarray(44, 44 + Math.min(frames, 480) * 4);
    let peakEarly = 0;
    for (let i = 0; i + 1 < first.length; i += 2) {
      peakEarly = Math.max(peakEarly, Math.abs(first.readInt16LE(i)));
    }
    expect(peakEarly).toBeGreaterThan(14000);
    expect(peakEarly).toBeLessThan(30000);
    for (const file of ["sfx-move.wav", "sfx-match.wav", "sfx-combo.wav", "sfx-place.wav"] as const) {
      const buf = readFileSync(`public/audio/${file}`);
      expect(buf.readUInt16LE(22), file).toBe(2);
      expect(buf.readUInt32LE(24), file).toBe(48000);
    }
    expect(SFX_FILES.match.file).not.toBe(SFX_FILES.combo.file);
    expect(SFX_FILES.score.file).not.toBe(SFX_FILES.oppscore.file);
    expect(SFX_FILES.warning.file).not.toBe(SFX_FILES.critical.file);
    expect(SFX_FILES.freeze.file).not.toBe(SFX_FILES.timeshift.file);
    expect(SFX_FILES.deny.file).toBe("sfx-deny.wav");
    expect(SFX_FILES.search.file).toBe("sfx-search.wav");
    expect(SFX_FILES.found.file).toBe("sfx-found.wav");
    expect(SFX_FILES.lifelost.file).toBe("sfx-lifelost.wav");
    expect(SFX_FILES.lifead.file).toBe("sfx-lifead.wav");
    expect(SFX_FILES.livesreset.file).toBe("sfx-livesreset.wav");
    expect(SFX_FILES.win.file).not.toBe(SFX_FILES.lose.file);
  });

  it("ships round-robin crystal variants that are not identical copies", () => {
    expect(sfxVariantIds("swap")).toEqual(["sfx-move", "sfx-move-b", "sfx-move-c"]);
    expect(sfxVariantIds("match")).toHaveLength(3);
    expect(sfxVariantIds("combo")).toHaveLength(3);
    expect(sfxVariantIds("highcombo")).toHaveLength(3);
    expect(sfxVariantIds("freeze")).toEqual(["sfx-freeze"]);
    for (const id of ["move", "place", "match", "combo", "highcombo"] as const) {
      const a = readFileSync(`public/audio/sfx-${id}.wav`);
      const b = readFileSync(`public/audio/sfx-${id}-b.wav`);
      expect(a.equals(b), id).toBe(false);
      expect(existsSync(`public/audio/sfx-${id}-c.wav`)).toBe(true);
      expect(existsSync(`public/audio/sfx-${id}-b.mp3`)).toBe(true);
    }
    const match = readFileSync("public/audio/sfx-match.wav");
    const combo = readFileSync("public/audio/sfx-combo.wav");
    const high = readFileSync("public/audio/sfx-highcombo.wav");
    expect(statSync("public/audio/sfx-combo.wav").size).toBeGreaterThan(statSync("public/audio/sfx-match.wav").size);
    expect(statSync("public/audio/sfx-highcombo.wav").size).toBeGreaterThan(statSync("public/audio/sfx-combo.wav").size);
    expect(combo.readUInt32LE(40)).toBeGreaterThan(match.readUInt32LE(40));
    expect(high.readUInt32LE(40)).toBeGreaterThan(combo.readUInt32LE(40));
  });
});

describe("audio scene transitions", () => {
  it("gives result music priority and restores lobby afterwards", () => {
    const director = new MusicDirector();
    expect(director.setBed("lobby")).toBe("start");
    expect(director.setBed("battle")).toBe("replace");
    expect(director.setBed("victory")).toBe("replace");
    expect(director.setBed("victory")).toBe("keep");
    expect(director.setBed("lobby")).toBe("replace");
    expect(bedFromScene({ screen: "menu", phase: "idle" })).toBe("lobby");
    expect(bedFromScene({ screen: "match", phase: "playing" })).toBe("battle");
    expect(bedFromScene({ screen: "match", phase: "ended", outcome: "loss" })).toBe("defeat");
  });

  it("does not restart a one-shot result bed on keep", () => {
    const bus = new AudioBus();
    bus.configure(true, true, "high");
    bus.syncBed("victory");
    bus.syncBed("victory");
    expect(bus.musicBed).toBe("victory");
    bus.syncBed("lobby");
    expect(bus.musicBed).toBe("lobby");
    bus.syncBed("none");
    expect(bus.musicBed).toBe("none");
    expect(bus.musicNodeCount).toBe(0);
    bus.dispose();
  });
});

describe("independent mix and mute", () => {
  it("keeps music and sfx volumes independent while mute silences both", () => {
    const bus = new AudioBus();
    bus.configure(true, true, "high", 0.2, 0.9);
    expect(bus.sfxLevel).toBeCloseTo(0.2);
    expect(bus.musicLevel).toBeCloseTo(0.9);
    bus.setVolumes(1, 0);
    expect(bus.sfxLevel).toBe(1);
    expect(bus.musicLevel).toBe(0);
    bus.configure(false, false, "high", 1, 1);
    expect(bus.sfxOn).toBe(false);
    expect(bus.musicOn).toBe(false);
    expect(bus.sfxLevel).toBe(0);
    expect(bus.musicLevel).toBe(0);
    bus.dispose();
  });

  it("preserves stored volumes when the HUD mute toggles both buses off", () => {
    const settings = { ...DEFAULT_SETTINGS, sfxVolume: 0.4, musicVolume: 0.6 };
    applyMatchAudioMute(settings, true);
    expect(settings.sfx).toBe(false);
    expect(settings.music).toBe(false);
    expect(settings.sfxVolume).toBe(0.4);
    expect(settings.musicVolume).toBe(0.6);
    applyMatchAudioMute(settings, false);
    expect(settings.sfx).toBe(true);
    expect(settings.music).toBe(true);
    expect(settings.sfxVolume).toBe(0.4);
  });

  it("defaults missing volume fields when loading older settings payloads", () => {
    expect(DEFAULT_SETTINGS.sfxVolume).toBeGreaterThan(0);
    expect(DEFAULT_SETTINGS.musicVolume).toBeGreaterThan(0);
    expect(loadSettings().sfxVolume).toBeGreaterThan(0);
    expect(loadSettings().musicVolume).toBeGreaterThan(0);
  });
});

describe("live game audio wiring", () => {
  it("routes new SFX through the existing AudioBus from main", () => {
    const src = readFileSync("src/main.ts", "utf8");
    expect(src).toContain("playBattleCues(audio, fx, fx.combo || 1, feelDelay)");
    expect(src).not.toContain('audio.play("oppscore")');
    expect(src).toContain("Rival board SFX stay silent");
    expect(src).toContain('audio.play("warning")');
    expect(src).toContain('audio.play("critical")');
    expect(src).toContain('audio.play("search")');
    expect(src).toContain('audio.play("found")');
    expect(src).toContain('audio.play("deny")');
    expect(src).toContain('audio.play("lifelost")');
    expect(src).toContain('audio.play("lifead")');
    expect(src).toContain('audio.play("livesreset")');
    expect(src).toContain("audio.suspend()");
    expect(src).toContain("audio.resume()");
    expect(src).toContain("settings.sfxVolume");
    expect(src).toContain("settings.musicVolume");
    expect(src).toContain("armFirstGestureAudio");
    expect(src).not.toContain('from "./audio/music"');
  });

  it("maps final-seconds FX to the critical timer cue", () => {
    const bus = new AudioBus();
    const played: string[] = [];
    bus.play = ((cue: string) => {
      played.push(cue);
    }) as AudioBus["play"];
    playBattleCue(bus, "finalSeconds");
    expect(played).toEqual(["critical"]);
    bus.dispose();
  });
});
