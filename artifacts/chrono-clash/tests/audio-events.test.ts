import { describe, expect, it } from "vitest";
import { AudioBus } from "../src/audio/bus";
import {
  battleCuesFromFx,
  isRivalBoardFx,
  playBattleCue,
  playerBoardDestroyCue,
} from "../src/audio/events";
import { GameSession } from "../src/engine/session";
import { matchWaveAsset } from "../src/audio/catalog";

describe("battle audio events", () => {
  it("plays one player glass shatter per resolve and keeps the rival board silent", () => {
    expect(battleCuesFromFx({ kind: "clear", text: "+120", combo: 1 })).toEqual(["matchWave"]);
    expect(battleCuesFromFx({ kind: "clear", text: "+240", combo: 2, side: "player" })).toEqual(["matchWave"]);
    expect(battleCuesFromFx({ kind: "clear", text: "+400", combo: 4, side: "player" })).toEqual(["matchWave"]);
    expect(battleCuesFromFx({ kind: "combo", text: "NICE!", combo: 3, side: "player" })).toEqual([]);
    expect(battleCuesFromFx({ kind: "combo", text: "GREAT!", combo: 4, side: "player" })).toEqual([]);
    expect(
      [
        ...battleCuesFromFx({ kind: "clear", text: "+240", combo: 3, side: "player" }),
        ...battleCuesFromFx({ kind: "combo", text: "NICE!", combo: 3, side: "player" }),
      ],
    ).toEqual(["matchWave"]);
    expect(battleCuesFromFx({ kind: "clear", text: "+80", combo: 1, side: "opponent" })).toEqual([]);
    expect(battleCuesFromFx({ kind: "clear", text: "+240", combo: 3, side: "opponent" })).toEqual([]);
    expect(battleCuesFromFx({ kind: "combo", text: "COMBO x2", combo: 2, side: "opponent" })).toEqual([]);
    expect(isRivalBoardFx({ kind: "clear", text: "+80", side: "opponent" })).toBe(true);
    expect(isRivalBoardFx({ kind: "clear", text: "+80", side: "player" })).toBe(false);
    expect(playerBoardDestroyCue({ kind: "combo", text: "NICE!", combo: 3, side: "player" })).toBe(null);
  });

  it("maps match waves one-to-one and clamps fourth-plus cascades to match_5.wav", () => {
    expect([1, 2, 3, 4, 5, 6].map((wave) => matchWaveAsset(wave).file)).toEqual([
      "match_1.wav",
      "match_2.wav",
      "match_3.wav",
      "match_4.wav",
      "match_5.wav",
      "match_5.wav",
    ]);
  });

  it("routes one match-wave cue per clear event and leaves combo banners without audio", () => {
    const bus = new AudioBus();
    const waves: number[] = [];
    bus.playMatchWave = ((wave: number) => waves.push(wave)) as AudioBus["playMatchWave"];
    const clear = { kind: "clear", text: "+240", combo: 2, side: "player" };
    const banner = { kind: "combo", text: "COMBO x2", combo: 2, side: "player" };
    playBattleCuesForTest(bus, clear);
    playBattleCuesForTest(bus, banner);
    expect(waves).toEqual([2]);
  });

  it("emits no board-destroy cues from opponent resolves in a live session", () => {
    const session = new GameSession();
    session.progress = { ...session.progress, tutorialDone: true, matchesSeen: 8 };
    session.mode = "time";
    session.startMatch(1000);
    for (let t = 1000; t < 28_000; t += 80) session.tick(t);
    const rivalBoard = session.fx.filter((fx) => fx.side === "opponent" && (fx.kind === "clear" || fx.kind === "combo"));
    expect(rivalBoard.flatMap((fx) => battleCuesFromFx(fx))).toEqual([]);
    const playerBoard = session.fx.filter((fx) => fx.side !== "opponent" && fx.kind === "clear");
    for (const fx of playerBoard) {
      const cues = battleCuesFromFx(fx);
      expect(cues.length).toBeLessThanOrEqual(1);
    }
  });

  it("plays attack audio for launched strikes and skips cinematic finales", () => {
    expect(battleCuesFromFx({ kind: "attack", text: "RIVAL PULSE", combo: 2, side: "opponent" })).toEqual(["rivalAttack"]);
    expect(battleCuesFromFx({ kind: "attack", text: "ATTACK!", combo: 2, side: "player" })).toEqual(["attack"]);
    expect(battleCuesFromFx({ kind: "attack", text: "TIME STRIKE", combo: 4, side: "player" })).toEqual(["attack"]);
    expect(battleCuesFromFx({ kind: "attack", text: "RIVAL STRIKE", combo: 5, side: "opponent" })).toEqual(["rivalAttack"]);
    expect(battleCuesFromFx({ kind: "attack", text: "FINAL STRIKE", combo: 5, side: "player" })).toEqual([]);
    expect(battleCuesFromFx({ kind: "attack", text: "RIVAL FINALE", combo: 5, side: "opponent" })).toEqual([]);
    expect(battleCuesFromFx({ kind: "finale", text: "VICTORY" })).toEqual(["victory"]);
    expect(battleCuesFromFx({ kind: "finale", text: "DEFEAT" })).toEqual(["defeat"]);
    expect(battleCuesFromFx({ kind: "finale", text: "DRAW" })).toEqual(["draw"]);
  });

  it("maps powers and final seconds without treating TIME! as a final-seconds cue", () => {
    expect(battleCuesFromFx({ kind: "power", text: "FREEZE" })).toEqual(["freeze"]);
    expect(battleCuesFromFx({ kind: "power", text: "TIME SHIFT" })).toEqual(["timeShift"]);
    expect(battleCuesFromFx({ kind: "power", text: "TEMPO SURGE" })).toEqual(["timeShift"]);
    expect(battleCuesFromFx({ kind: "rewind", text: "BOARD RESTORED" })).toEqual(["rewind"]);
    expect(battleCuesFromFx({ kind: "urgent", text: "FINAL SECONDS" })).toEqual(["finalSeconds"]);
    expect(battleCuesFromFx({ kind: "urgent", text: "TIME!" })).toEqual([]);
    expect(battleCuesFromFx({ kind: "countdown", text: "CLASH!" })).toEqual([]);
  });

  it("plays distinct launch, incoming, impact, and result cues without reusing invalid", () => {
    const bus = new AudioBus();
    const played: string[] = [];
    bus.play = ((cue: string) => {
      played.push(cue);
    }) as AudioBus["play"];
    bus.playLater = ((cue: string, delayMs: number) => {
      played.push(`${cue}@${delayMs}`);
    }) as AudioBus["playLater"];
    bus.playFinale = ((kind: string) => {
      played.push(kind);
      return true;
    }) as AudioBus["playFinale"];
    playBattleCue(bus, "attack", 4, "TIME STRIKE");
    playBattleCue(bus, "rivalAttack", 5, "RIVAL STRIKE");
    playBattleCue(bus, "victory");
    playBattleCue(bus, "defeat");
    playBattleCue(bus, "draw");
    expect(played).toEqual(["launch", "impact@420", "incoming", "impact@420", "win", "lose", "draw"]);
    expect(played).not.toContain("invalid");
  });

  it("stays silent when sfx are muted", () => {
    const bus = new AudioBus();
    bus.configure(false, false, "high");
    expect(bus.sfxOn).toBe(false);
    expect(bus.musicOn).toBe(false);
    expect(() => {
      bus.play("ui");
      bus.play("win");
      bus.play("incoming");
      bus.play("confirm");
    }).not.toThrow();
  });

  it("does not start oscillators for SFX or music while muted, then resumes after unmute", () => {
    let started = 0;
    class FakeParam {
      value = 0;
      setValueAtTime(v: number) {
        this.value = v;
        return this;
      }
      cancelScheduledValues() {}
      linearRampToValueAtTime() {}
      exponentialRampToValueAtTime() {}
    }
    class FakeNode {
      connect() {
        return this;
      }
      disconnect() {}
    }
    class FakeOsc extends FakeNode {
      type = "sine";
      frequency = new FakeParam();
      detune = new FakeParam();
      start() {
        started += 1;
      }
      stop() {}
    }
    class FakeGain extends FakeNode {
      gain = new FakeParam();
    }
    class FakeFilter extends FakeNode {
      type = "lowpass";
      frequency = new FakeParam();
    }
    class FakeCtx {
      currentTime = 0;
      sampleRate = 44100;
      destination = new FakeNode();
      resume() {
        return Promise.resolve();
      }
      close() {
        return Promise.resolve();
      }
      createOscillator() {
        return new FakeOsc();
      }
      createGain() {
        return new FakeGain();
      }
      createBiquadFilter() {
        return new FakeFilter();
      }
    }
    const previous = (globalThis as { AudioContext?: unknown }).AudioContext;
    (globalThis as { AudioContext?: unknown }).AudioContext = FakeCtx;
    try {
      const bus = new AudioBus();
      bus.configure(false, false, "high");
      bus.syncBed("lobby");
      bus.play("match");
      bus.play("combo");
      bus.play("incoming");
      bus.play("freeze");
      bus.play("win");
      expect(started).toBe(0);
      expect(bus.musicNodeCount).toBe(0);
      bus.configure(true, true, "high");
      bus.syncBed("lobby");
      expect(started).toBeGreaterThan(0);
      const afterBed = started;
      bus.play("match");
      expect(started).toBeGreaterThan(afterBed);
      bus.dispose();
    } finally {
      (globalThis as { AudioContext?: unknown }).AudioContext = previous;
    }
  });
});

function playBattleCuesForTest(bus: AudioBus, fx: { kind: string; text: string; combo?: number; side?: string }): void {
  for (const cue of battleCuesFromFx(fx)) playBattleCue(bus, cue, fx.combo ?? 1, fx.text);
}
