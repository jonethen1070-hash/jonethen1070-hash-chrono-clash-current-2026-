import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, statSync } from "node:fs";
import { AudioBus } from "../src/audio/bus";
import { VOICE_FILES } from "../src/audio/catalog";
import {
  VOICE,
  arbitrate,
  comboCall,
  cuesFromFx,
  cuesFromFxBatch,
  flushQueue,
  freshVoiceState,
  outcomeCall,
} from "../src/audio/voice";
import { GameSession } from "../src/engine/session";
import { SCORE_TARGET } from "../src/engine/types";
import { readFileSync as readSource } from "node:fs";

describe("announcer catalog", () => {
  it("does not submit gameplay FX to the spoken announcer on the live match screen", () => {
    const source = readSource("src/main.ts", "utf8");
    const scheduleStart = source.indexOf("if (session.screen !== \"match\")");
    const scheduleEnd = source.indexOf("let burst:", scheduleStart);

    expect(scheduleStart).toBeGreaterThan(-1);
    expect(scheduleEnd).toBeGreaterThan(scheduleStart);
    expect(source.slice(scheduleStart, scheduleEnd)).toContain("announcer.schedule");
    expect(source.slice(scheduleStart, scheduleEnd)).toContain("cuesFromFxBatch");
    expect(source.slice(scheduleStart, scheduleEnd)).toContain("displayCallout(cue.id)");
    expect(source).toContain("playBattleCues(audio, fx");
  });

  it("maps every player combo peak to the short Combo callout", () => {
    expect(comboCall(1)).toBeNull();
    expect(comboCall(2)).toBe("combo");
    expect(comboCall(3)).toBe("combo");
    expect(comboCall(8)).toBe("combo");
    expect(VOICE.combo.text).toBe("COMBO!");
    expect(VOICE.locked.text).toBe("LOCKED.");
    expect(VOICE.ultimate.text).toBe("ULTIMATE!");
  });

  it("does not announce every clear or opponent combos", () => {
    expect(cuesFromFx({ kind: "clear", text: "+120", combo: 1, side: "player" }, 1000, 0)).toEqual([]);
    expect(cuesFromFx({ kind: "combo", text: "COMBO!", combo: 3, side: "opponent" }, 1000, 0)).toEqual([]);
    expect(cuesFromFx({ kind: "countdown", text: "2" }, 1000, 0)).toEqual([]);
    expect(cuesFromFx({ kind: "attack", text: "ATTACK!", combo: 2, side: "player" }, 1000, 0)).toEqual([]);
    expect(cuesFromFx({ kind: "pressure", text: "PRESSURE", side: "opponent" }, 1000, 0)).toEqual([]);
  });

  it("announces Locked, Combo, and Ultimate only on their intended events", () => {
    expect(cuesFromFx({ kind: "combo", text: "NICE!", combo: 3, side: "player" }, 5000, 0)[0]?.id).toBe("combo");
    expect(cuesFromFx({ kind: "combo", text: "PERFECT!", combo: 6, side: "player" }, 5000, 0)[0]?.id).toBe("combo");
    expect(cuesFromFx({ kind: "pressure", text: "RIVAL PRESSURE", side: "player" }, 5000, 0)[0]?.id).toBe("locked");
    expect(cuesFromFx({ kind: "power", text: "RIVAL FREEZE" }, 5000, 0)[0]?.id).toBe("locked");
    expect(cuesFromFx({ kind: "power", text: "RIVAL SHIFT" }, 5000, 0)[0]?.id).toBe("locked");
    expect(cuesFromFx({ kind: "attack", text: "TIME STRIKE", combo: 4, side: "player" }, 5000, 0)[0]?.id).toBe(
      "ultimate",
    );
    expect(cuesFromFx({ kind: "power", text: "FREEZE" }, 5000, 0)[0]?.id).toBe("freeze");
    expect(cuesFromFx({ kind: "rewind", text: "BOARD RESTORED" }, 5000, 0)[0]?.id).toBe("rewind");
    expect(cuesFromFx({ kind: "countdown", text: "CLASH!" }, 5000, 0)[0]?.id).toBe("fight");
    expect(cuesFromFx({ kind: "urgent", text: "DANGER" }, 5000, 0)[0]?.id).toBe("danger");
    expect(cuesFromFx({ kind: "urgent", text: "FINAL SECONDS" }, 5000, 0)[0]?.id).toBe("final_seconds");
    expect(cuesFromFx({ kind: "urgent", text: "TIME!" }, 5000, 0)[0]?.id).toBe("time");
    expect(cuesFromFx({ kind: "finale", text: "VICTORY" }, 5000, 0)[0]?.id).toBe("victory");
    expect(outcomeCall("loss")).toBe("defeat");
  });

  it("skips small combo repeats so the announcer is not constant", () => {
    const first = cuesFromFx({ kind: "combo", text: "COMBO!", combo: 2, side: "player" }, 8000, 0);
    expect(first[0]?.id).toBe("combo");
    const again = cuesFromFx({ kind: "combo", text: "COMBO!", combo: 2, side: "player" }, 8500, 8000);
    expect(again).toEqual([]);
  });

  it("keeps one lead callout when combo and ultimate land together", () => {
    const batch = cuesFromFxBatch(
      [
        { kind: "combo", text: "COMBO x2", combo: 2, side: "player" },
        { kind: "attack", text: "ATTACK!", combo: 2, side: "player" },
        { kind: "attack", text: "TIME STRIKE", combo: 4, side: "player" },
      ],
      20_000,
      0,
    );
    expect(batch.map((cue) => cue.id)).toEqual(["ultimate"]);
  });
});

describe("announcer priority", () => {
  it("holds cooldown after a line ends so repeats do not stack", () => {
    let state = freshVoiceState();
    state = arbitrate(state, "locked", 100).state;
    const mid = arbitrate(state, "locked", 700);
    expect(mid.action).toBe("drop");
    expect(mid.state.current).toBe("locked");
    const ready = arbitrate(state, "locked", 100 + VOICE.locked.cooldownMs + 10);
    expect(ready.action).toBe("play");
  });

  it("lets important lines interrupt lesser ones and never overlaps two currents", () => {
    let state = freshVoiceState();
    const a = arbitrate(state, "combo", 100);
    expect(a.action).toBe("play");
    state = a.state;
    const again = arbitrate(state, "combo", 120);
    expect(again.action).toBe("drop");
    const c = arbitrate(state, "locked", 140);
    expect(c.action).toBe("interrupt");
    expect(c.state.current).toBe("locked");
    expect(c.state.queued).toBeNull();
    const u = arbitrate(c.state, "ultimate", 150);
    expect(u.action).toBe("interrupt");
    expect(u.state.current).toBe("ultimate");
  });

  it("queues VICTORY after TIME so the two lines do not overlap", () => {
    let state = freshVoiceState();
    const a = arbitrate(state, "time", 1000);
    expect(a.action).toBe("play");
    state = a.state;
    const b = arbitrate(state, "victory", 1010);
    expect(b.action).toBe("queue");
    expect(b.state.current).toBe("time");
    expect(b.state.queued).toBe("victory");
    const flushed = flushQueue(b.state, b.state.until);
    expect(flushed.play).toBe("victory");
    expect(flushed.state.queued).toBeNull();
  });

  it("drops a weaker line while a finale line is speaking", () => {
    let state = freshVoiceState();
    state = arbitrate(state, "victory", 50).state;
    const next = arbitrate(state, "combo", 80);
    expect(next.action).toBe("drop");
    expect(next.state.current).toBe("victory");
  });
});

describe("match danger and final seconds", () => {
  function play(now: number): { game: GameSession; now: number } {
    const game = new GameSession();
    game.mode = "time";
    game.scoreTarget = SCORE_TARGET;
    game.startMatch(now);
    now += 3000;
    game.tick(now);
    expect(game.phase).toBe("playing");
    return { game, now };
  }

  it("shouts FINAL SECONDS once when the clock hits 10s", () => {
    const { game, now } = play(1000);
    const later = now + 50_000;
    game.tick(later);
    const snap = game.snapshot(later);
    expect(snap.last10).toBe(true);
    expect(snap.fx.some((f) => f.text === "FINAL SECONDS")).toBe(true);
    game.tick(later + 200);
    expect(game.snapshot(later + 200).fx.filter((f) => f.text === "FINAL SECONDS")).toHaveLength(1);
  });

  it("marks danger when the rival closes in on the score target", () => {
    const { game, now } = play(2000);
    game.mode = "score";
    game.scoreTarget = SCORE_TARGET;
    game.opponent.score = Math.round(SCORE_TARGET * 0.8);
    game.player.score = 1000;
    game.tick(now + 50);
    const snap = game.snapshot(now + 50);
    expect(snap.danger).toBe(true);
    expect(snap.fx.some((f) => f.text === "DANGER")).toBe(true);
  });

  it("says TIME then VICTORY when the clock expires", () => {
    const { game, now } = play(3000);
    game.player.score = 9000;
    game.opponent.score = 1000;
    game.tick(now + 60_000);
    const texts = game.fx.map((f) => f.text);
    expect(texts).toContain("TIME!");
    expect(texts).toContain("VICTORY");
    expect(texts.indexOf("TIME!")).toBeLessThan(texts.indexOf("VICTORY"));
  });
});

describe("premium voice masters", () => {
  it("ships short 48kHz stereo human callouts for locked, combo, and ultimate", () => {
    for (const id of ["locked", "combo", "ultimate"] as const) {
      const path = `public${VOICE_FILES[id].url}`;
      expect(existsSync(path), path).toBe(true);
      const buf = readFileSync(path);
      expect(buf.readUInt16LE(22), path).toBe(2);
      expect(buf.readUInt32LE(24), path).toBe(48000);
      expect(statSync(path).size, path).toBeGreaterThan(20_000);
      expect(VOICE_FILES[id].durationSec).toBeLessThan(1.2);
      const mp3 = `public/audio/voice-${id}.mp3`;
      expect(existsSync(mp3), mp3).toBe(true);
    }
  });

  it("refuses to play callouts when SFX are muted", () => {
    const bus = new AudioBus();
    bus.configure(false, true, "high");
    expect(bus.playVoice("combo")).toBe(false);
    expect(bus.playVoice("locked")).toBe(false);
    expect(bus.playVoice("ultimate")).toBe(false);
    bus.dispose();
  });
});
