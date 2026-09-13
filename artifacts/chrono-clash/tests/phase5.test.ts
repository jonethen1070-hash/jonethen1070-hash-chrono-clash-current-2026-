import { describe, expect, it } from "vitest";
import { AudioBus } from "../src/audio/bus";
import { battleCuesFromFx } from "../src/audio/events";
import { ANNOUNCER_HOOKS, VOICE, comboCall, cuesFromFx } from "../src/audio/voice";
import { comboBurstText, comboFlavor } from "../src/engine/combat";
import {
  comboBurstClass,
  feelMul,
  gameplayHapticArmed,
  hapticPattern,
  particleBudget,
  scoreTickerRate,
} from "../src/ui/feel";

describe("phase 5 juice helpers", () => {
  it("escalates combo copy and burst class", () => {
    expect(comboFlavor(2)).toBe("COMBO x2");
    expect(comboFlavor(3)).toBe("NICE!");
    expect(comboFlavor(4)).toBe("GREAT!");
    expect(comboFlavor(5)).toBe("AMAZING!");
    expect(comboFlavor(6)).toBe("PERFECT!");
    expect(comboBurstText(4)).toBe("COMBO x4\nGREAT!");
    expect(comboBurstClass(2)).toBe("big");
    expect(comboBurstClass(4)).toBe("epic");
    expect(comboBurstClass(6)).toBe("mega");
    expect(comboBurstClass(8)).toBe("mega");
    expect(comboBurstText(8)).toBe("COMBO x8\nMEGA COMBO");
  });

  it("maps announcer hooks without requiring voice files", () => {
    expect(comboCall(3)).toBe("combo");
    expect(comboCall(6)).toBe("combo");
    expect(VOICE.combo.text).toBe("COMBO!");
    expect(VOICE.locked.text).toBe("LOCKED.");
    expect(VOICE.ultimate.text).toBe("ULTIMATE!");
    expect(VOICE.danger.text).toBe("DANGER!");
    expect(VOICE.freeze.text).toBe("FREEZE!");
    expect(VOICE.timeshift.text).toBe("TIME SHIFT!");
    expect(VOICE.rewind.text).toBe("REWIND!");
    expect(VOICE.final_seconds.text).toBe("FINAL SECONDS!");
    expect(VOICE.victory.text).toBe("VICTORY!");
    expect(VOICE.defeat.text).toBe("DEFEAT!");
    expect([...ANNOUNCER_HOOKS]).toEqual(expect.arrayContaining(["NICE!", "PERFECT!", "FREEZE!"]));
  });

  it("scales tickers, particles, and haptics by intensity", () => {
    expect(scoreTickerRate("high", false)).toBeLessThan(scoreTickerRate("low", false));
    expect(scoreTickerRate("high", true)).toBe(1);
    expect(particleBudget("high", false)).toBeGreaterThan(particleBudget("medium", false));
    expect(particleBudget("low", false)).toBe(0);
    expect(particleBudget("high", true)).toBe(0);
    expect(feelMul("high", false)).toBeGreaterThan(feelMul("medium", false));
    expect(hapticPattern("swap")).toBe(12);
    expect(Array.isArray(hapticPattern("power"))).toBe(false);
    expect(Array.isArray(hapticPattern("combo", 6))).toBe(false);
  });

  it("lets settings mute sound, music, announcer, and vibration independently", () => {
    const bus = new AudioBus();
    bus.configure(false, true, "high");
    expect(bus.sfxOn).toBe(false);
    expect(bus.musicOn).toBe(true);
    bus.configure(true, false, "medium");
    expect(bus.sfxOn).toBe(true);
    expect(bus.musicOn).toBe(false);
    expect(bus.intensity).toBe("medium");
    expect(gameplayHapticArmed(true, true, true)).toBe(true);
    expect(gameplayHapticArmed(true, false, true)).toBe(true);
    expect(gameplayHapticArmed(false, true, true)).toBe(true);
    expect(gameplayHapticArmed(false, true, false)).toBe(false);
  });

  it("wires announcer and audio hooks to existing gameplay events", () => {
    expect(cuesFromFx({ kind: "combo", text: "NICE!", combo: 3, side: "player" }, 9000, 0)[0]?.id).toBe("combo");
    expect(cuesFromFx({ kind: "power", text: "TIME SHIFT" }, 9000, 0)[0]?.id).toBe("timeshift");
    expect(cuesFromFx({ kind: "urgent", text: "FINAL SECONDS" }, 9000, 0)[0]?.id).toBe("final_seconds");
    expect(cuesFromFx({ kind: "finale", text: "DEFEAT" }, 9000, 0)[0]?.id).toBe("defeat");
    expect(battleCuesFromFx({ kind: "power", text: "FREEZE" })).toEqual(["freeze"]);
    expect(battleCuesFromFx({ kind: "rewind", text: "BOARD RESTORED" })).toEqual(["rewind"]);
    expect(battleCuesFromFx({ kind: "finale", text: "VICTORY" })).toEqual(["victory"]);
  });
});
