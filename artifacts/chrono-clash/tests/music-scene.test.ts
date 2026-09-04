import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { AudioBus } from "../src/audio/bus";
import { bedFromScene, BATTLE_BED, LOBBY_BED, MusicDirector, stingFromOutcome } from "../src/audio/scene";
import { INTRO_TOTAL_MS } from "../src/engine/intro";
import { GameSession } from "../src/engine/session";
import { battleCuesFromFx, playBattleCue } from "../src/audio/events";

describe("music scene director", () => {
  it("maps lobby, battle, and result screens without using fake outcomes", () => {
    expect(bedFromScene({ screen: "menu", phase: "idle" })).toBe("lobby");
    expect(bedFromScene({ screen: "ready", phase: "idle" })).toBe("lobby");
    expect(bedFromScene({ screen: "match", phase: "countdown" })).toBe("battle");
    expect(bedFromScene({ screen: "match", phase: "playing" })).toBe("battle");
    expect(bedFromScene({ screen: "match", phase: "paused" })).toBe("battle");
    expect(bedFromScene({ screen: "match", phase: "ended" })).toBe("none");
    expect(bedFromScene({ screen: "match", phase: "ended", outcome: "win" })).toBe("victory");
    expect(bedFromScene({ screen: "match", phase: "ended", outcome: "loss" })).toBe("defeat");
    expect(bedFromScene({ screen: "results", phase: "ended" })).toBe("none");
    expect(bedFromScene({ screen: "results", phase: "ended", outcome: "win" })).toBe("victory");
    expect(bedFromScene({ screen: "results", phase: "ended", outcome: "loss" })).toBe("defeat");
    expect(bedFromScene({ screen: "results", phase: "ended", outcome: "tie" })).toBe("draw");
    expect(bedFromScene({ screen: "rewards", phase: "ended", outcome: "win" })).toBe("victory");
    expect(bedFromScene({ screen: "splash", phase: "idle" })).toBe("none");
    expect(stingFromOutcome("win")).toBe("win");
    expect(stingFromOutcome("loss")).toBe("lose");
    expect(stingFromOutcome("tie")).toBe("draw");
    expect(LOBBY_BED.freqs).not.toEqual(BATTLE_BED.freqs);
    expect(LOBBY_BED.lfo).toBeLessThan(BATTLE_BED.lfo);
    expect(BATTLE_BED.types).toContain("sawtooth");
    expect(LOBBY_BED.types).not.toContain("sawtooth");
  });

  it("starts lobby music once and replaces it with battle music", () => {
    const director = new MusicDirector();
    expect(director.setBed("lobby")).toBe("start");
    expect(director.setBed("lobby")).toBe("keep");
    expect(director.setBed("lobby")).toBe("keep");
    expect(director.setBed("battle")).toBe("replace");
    expect(director.setBed("battle")).toBe("keep");
    expect(director.bed).toBe("battle");
  });

  it("keeps Olivia Nova splash silent and starts lobby once on the main menu", () => {
    const game = new GameSession();
    game.begin(1000, false);
    expect(bedFromScene({ screen: game.screen, phase: game.phase })).toBe("none");
    game.tick(1000 + INTRO_TOTAL_MS - 1);
    expect(game.screen).toBe("splash");
    expect(bedFromScene({ screen: game.screen, phase: game.phase })).toBe("none");
    game.tick(1000 + INTRO_TOTAL_MS);
    expect(game.screen).toBe("menu");
    expect(bedFromScene({ screen: game.screen, phase: game.phase })).toBe("lobby");

    const director = new MusicDirector();
    expect(director.setBed("none")).toBe("keep");
    expect(director.setBed("lobby")).toBe("start");
    expect(director.setBed("lobby")).toBe("keep");

    const bus = new AudioBus();
    bus.configure(true, true, "high");
    bus.syncBed("none");
    expect(bus.musicBed).toBe("none");
    bus.startMusic();
    expect(bus.musicBed).toBe("none");
    bus.syncBed("lobby");
    expect(bus.musicBed).toBe("lobby");
    bus.syncBed("lobby");
    expect(bus.musicBed).toBe("lobby");
    bus.dispose();

    const src = readFileSync("src/audio/bus.ts", "utf8");
    expect(src).toContain('item.id === "music-lobby"');
    expect(src).toContain("prefetchLobbyThenRest");
    expect(readFileSync("src/main.ts", "utf8")).toContain("session.screen !== \"splash\"");
    expect(readFileSync("src/main.ts", "utf8")).toContain("previous === \"splash\" && screen === \"menu\"");
    expect(readFileSync("src/main.ts", "utf8")).toContain("audio.syncBed(\"lobby\")");
    expect(readFileSync("src/audio/unlock.ts", "utf8")).toContain("startBed");
  });

  it("fires victory, defeat, and draw stingers exactly once until the next match", () => {
    const director = new MusicDirector();
    expect(director.takeSting("start", "clash-1")).toBe(true);
    expect(director.takeSting("start", "clash-1")).toBe(false);
    expect(director.takeSting("win", "final-1")).toBe(true);
    expect(director.takeSting("win", "final-1")).toBe(false);
    expect(director.takeSting("lose", "final-1")).toBe(false);
    expect(director.takeSting("draw", "final-2")).toBe(false);
    director.setBed("battle");
    expect(director.takeSting("lose", "final-3")).toBe(true);
    expect(director.takeSting("lose", "final-3")).toBe(false);
    director.setBed("none");
    director.setBed("battle");
    expect(director.takeSting("draw", "final-4")).toBe(true);
  });

  it("stops music immediately when muted and does not start a bed", () => {
    const director = new MusicDirector();
    director.setBed("lobby");
    director.configure(false);
    expect(director.bed).toBe("none");
    expect(director.setBed("lobby")).toBe("keep");
    expect(director.bed).toBe("none");
  });
});

describe("AudioBus music safety", () => {
  it("keeps mute, finale-once, and cleanup without throwing in node", () => {
    const bus = new AudioBus();
    bus.configure(true, true, "high");
    bus.syncBed("lobby");
    bus.syncBed("lobby");
    expect(bus.musicBed).toBe("lobby");
    bus.syncBed("battle");
    expect(bus.musicBed).toBe("battle");
    expect(bus.playFinale("win")).toBe(true);
    expect(bus.playFinale("win")).toBe(false);
    expect(bus.playFinale("lose")).toBe(false);
    expect(bus.musicBed).toBe("victory");
    bus.configure(false, false, "high");
    expect(bus.musicBed).toBe("none");
    expect(bus.musicNodeCount).toBe(0);
    bus.play("match");
    bus.play("incoming");
    bus.stopMusic();
    bus.dispose();
  });

  it("wires scene music to the live GameSession render loop", () => {
    const src = readFileSync("src/main.ts", "utf8");
    expect(src).toContain("audio.syncBed(bedFromScene");
    expect(src).toContain("outcome: session.result?.outcome");
    expect(src).toContain("audio.playMatchStart");
    expect(src).toContain('audio.play("score")');
    expect(src).toContain("audio.dispose()");
    expect(src).toContain("playBattleCues(audio, fx");
    expect(src).toContain("pressUi");
    expect(src).toContain('feelHaptic("tap")');
  });

  it("keeps gem touch and drag paths silent", () => {
    const src = readFileSync("src/main.ts", "utf8");
    const commitStart = src.indexOf("function commitSwipe");
    const pointerDownStart = src.indexOf('ui.playerBoard.addEventListener(\n  "pointerdown"');
    const pointerMoveStart = src.indexOf('ui.playerBoard.addEventListener(\n  "pointermove"');
    const pointerUpStart = src.indexOf('ui.playerBoard.addEventListener(\n  "pointerup"');
    const pointerEnd = src.indexOf('ui.playerBoard.addEventListener("pointercancel"', pointerUpStart);
    const landingStart = src.indexOf("if (renderer.takeLandingImpacts()");
    const landingEnd = src.indexOf("drawStageBackdrop", landingStart);

    expect(commitStart).toBeGreaterThan(-1);
    expect(pointerDownStart).toBeGreaterThan(commitStart);
    expect(pointerMoveStart).toBeGreaterThan(pointerDownStart);
    expect(pointerUpStart).toBeGreaterThan(pointerMoveStart);
    expect(pointerEnd).toBeGreaterThan(pointerUpStart);
    expect(landingStart).toBeGreaterThan(pointerEnd);
    expect(landingEnd).toBeGreaterThan(landingStart);

    const commitPath = src.slice(commitStart, pointerDownStart);
    expect(commitPath).toContain('audio.play("swap")');
    expect(commitPath).not.toContain('audio.play("invalid")');
    expect(src.slice(pointerDownStart, pointerEnd)).not.toContain("audio.play(");
    expect(src.slice(landingStart, landingEnd)).not.toContain("audio.play(");
    expect(src).toContain("playBattleCues(audio, fx");
  });

  it("plays a real GameSession finale sting once for victory, defeat, and draw", () => {
    const win = new GameSession();
    win.progress = { ...win.progress, tutorialDone: true, matchesSeen: 8 };
    win.mode = "time";
    win.startMatch(1000);
    win.tick(4200);
    win.player.score = 8800;
    win.opponent.score = 200;
    win.tick(64_200);
    const winFx = win.fx.find((f) => f.kind === "finale");
    expect(winFx?.text).toBe("VICTORY");
    expect(battleCuesFromFx(winFx!)).toEqual(["victory"]);

    const bus = new AudioBus();
    playBattleCue(bus, "victory");
    expect(bus.playFinale("win")).toBe(false);
    expect(bus.playFinale("lose")).toBe(false);

    const loss = new GameSession();
    loss.progress = { ...loss.progress, tutorialDone: true, matchesSeen: 8 };
    loss.mode = "time";
    loss.startMatch(1000);
    loss.tick(4200);
    loss.player.score = 40;
    loss.opponent.score = 9000;
    loss.tick(64_200);
    expect(battleCuesFromFx(loss.fx.find((f) => f.kind === "finale")!)).toEqual(["defeat"]);

    const draw = new GameSession();
    draw.progress = { ...draw.progress, tutorialDone: true, matchesSeen: 8 };
    draw.mode = "time";
    draw.startMatch(1000);
    draw.tick(4200);
    draw.player.score = 500;
    draw.opponent.score = 500;
    draw.tick(64_200);
    expect(draw.result?.outcome).toBe("tie");
    expect(battleCuesFromFx(draw.fx.find((f) => f.kind === "finale")!)).toEqual(["draw"]);
  });

  it("disposes the previous bed immediately on stopMusic so lobby cannot stack a silent bed", () => {
    const src = readFileSync("src/audio/bus.ts", "utf8");
    expect(src).toMatch(/stopMusic\(\): void \{[\s\S]*?this\.stopBed\(false\);[\s\S]*?this\.clearTimers\(\);/);

    let started = 0;
    let stopped = 0;
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
      stop() {
        stopped += 1;
      }
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
      bus.configure(true, true, "high");
      bus.syncBed("battle");
      expect(started).toBe(6);
      expect(stopped).toBe(0);
      bus.stopMusic();
      expect(stopped).toBe(6);
      expect(bus.musicNodeCount).toBe(0);
      bus.syncBed("lobby");
      expect(started - stopped).toBe(5);
      expect(bus.musicNodeCount).toBe(5);
      bus.dispose();
    } finally {
      (globalThis as { AudioContext?: unknown }).AudioContext = previous;
    }
  });
});
