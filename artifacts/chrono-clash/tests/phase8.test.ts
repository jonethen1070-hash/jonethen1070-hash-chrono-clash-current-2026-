import { describe, expect, it, vi } from "vitest";
import { GameSession } from "../src/engine/session";
import { battleCuesFromFx } from "../src/audio/events";
import {
  HapticBus,
  attackBoltDelayMs,
  gameplayHapticArmed,
  hapticCuesFromFx,
  hapticPattern,
  hapticThrottleMs,
} from "../src/ui/haptics";

describe("phase 8 event haptics", () => {
  it("uses restrained patterns for input, matches, abilities, and outcomes", () => {
    expect(hapticPattern("swap")).toBe(12);
    expect(hapticPattern("tap")).toBe(12);
    expect(hapticPattern("invalid")).toEqual([10, 20, 14]);
    expect(hapticPattern("match")).toBe(20);
    expect(hapticPattern("combo", 2)).toBe(32);
    expect(hapticPattern("combo", 5)).toBe(42);
    expect(hapticPattern("combo", 8)).toBe(62);
    expect(hapticPattern("power")).toBe(58);
    expect(hapticPattern("freeze")).toBe(24);
    expect(hapticPattern("timeshift")).toBe(28);
    expect(hapticPattern("rewind")).toBe(30);
    expect(hapticPattern("incoming")).toBe(28);
    expect(hapticPattern("start")).toEqual([50, 36, 110]);
    expect(hapticPattern("draw")).toBe(42);
    expect(hapticPattern("attack")).toBe(40);
    expect(hapticPattern("attackHit")).toBe(48);
    expect(hapticPattern("block")).toBe(24);
    expect(hapticPattern("victory")).toEqual([24, 28, 44]);
    expect(hapticPattern("defeat")).toBe(30);
    expect(hapticPattern("combo", 8)).not.toEqual(hapticPattern("combo", 2));
    expect(hapticPattern("attack")).not.toEqual(hapticPattern("incoming"));
    expect(hapticPattern("freeze")).not.toEqual(hapticPattern("timeshift"));
    expect(hapticPattern("timeshift")).not.toEqual(hapticPattern("rewind"));
    expect(hapticPattern("victory")).not.toEqual(hapticPattern("draw"));
    expect(hapticPattern("defeat")).not.toEqual(hapticPattern("draw"));
    expect(hapticPattern("combo", 8)).not.toEqual(hapticPattern("match"));
  });

  it("maps gameplay fx to event haptics without per-frame pulses", () => {
    expect(hapticCuesFromFx({ kind: "clear", text: "+40", combo: 1, side: "player" })).toEqual([{ kind: "match" }]);
    expect(hapticCuesFromFx({ kind: "combo", text: "NICE!", combo: 3, side: "player" })).toEqual([
      { kind: "combo", combo: 3 },
    ]);
    expect(hapticCuesFromFx({ kind: "combo", text: "COMBO x2", combo: 2, side: "opponent" })).toEqual([]);
    expect(hapticCuesFromFx({ kind: "power", text: "FREEZE" })).toEqual([{ kind: "freeze" }]);
    expect(hapticCuesFromFx({ kind: "power", text: "TIME SHIFT" })).toEqual([{ kind: "timeshift" }]);
    expect(hapticCuesFromFx({ kind: "rewind", text: "BOARD RESTORED" })).toEqual([{ kind: "rewind" }]);
    expect(hapticCuesFromFx({ kind: "power", text: "RIVAL FREEZE" })).toEqual([{ kind: "block" }]);
    expect(hapticCuesFromFx({ kind: "power", text: "ENERGY BURST" })).toEqual([{ kind: "power" }]);
    expect(hapticCuesFromFx({ kind: "power", text: "MEGA STRIKE" })).toEqual([{ kind: "power" }]);
    expect(hapticCuesFromFx({ kind: "attack", text: "ATTACK!", side: "player", combo: 3 })).toEqual([
      { kind: "attackHit", combo: 3, delayMs: 420 },
    ]);
    expect(hapticCuesFromFx({ kind: "attack", text: "RIVAL PULSE", side: "opponent", combo: 2 })).toEqual([
      { kind: "incoming", combo: 2 },
    ]);
    expect(hapticCuesFromFx({ kind: "attack", text: "TIME STRIKE", side: "player", combo: 5 })).toEqual([
      { kind: "attackHit", combo: 5, delayMs: 420 },
    ]);
    expect(hapticCuesFromFx({ kind: "attack", text: "FINAL STRIKE", side: "player", combo: 5 })).toEqual([
      { kind: "attackHit", combo: 5, delayMs: 720 },
    ]);
    expect(hapticCuesFromFx({ kind: "attack", text: "RIVAL FINALE", side: "opponent", combo: 5 })).toEqual([
      { kind: "incoming", combo: 5 },
    ]);
    expect(hapticCuesFromFx({ kind: "finale", text: "VICTORY" })).toEqual([{ kind: "victory" }]);
    expect(hapticCuesFromFx({ kind: "finale", text: "DEFEAT" })).toEqual([{ kind: "defeat" }]);
    expect(hapticCuesFromFx({ kind: "finale", text: "DRAW" })).toEqual([{ kind: "draw" }]);
    expect(hapticCuesFromFx({ kind: "countdown", text: "3" })).toEqual([{ kind: "countdown" }]);
    expect(hapticCuesFromFx({ kind: "countdown", text: "CLASH!" })).toEqual([{ kind: "start" }]);
    expect(hapticCuesFromFx({ kind: "urgent", text: "FINAL SECONDS" })).toEqual([{ kind: "urgent", combo: 2 }]);
    expect(attackBoltDelayMs("ATTACK!")).toBe(420);
  });

  it("stays off when haptics are disabled and throttles repeats", () => {
    const vibrate = vi.fn(() => true);
    const bus = new HapticBus(vibrate);
    bus.setEnabled(false);
    vibrate.mockClear();
    expect(bus.play("match", 1, 1000)).toBe(false);
    expect(vibrate).not.toHaveBeenCalled();

    bus.setEnabled(true);
    expect(bus.play("swap", 1, 2000)).toBe(true);
    expect(bus.play("swap", 1, 2000 + 20)).toBe(false);
    expect(bus.play("attack", 1, 2000 + 50)).toBe(true);
    expect(vibrate).toHaveBeenCalledTimes(2);
    expect(gameplayHapticArmed(true, true, true)).toBe(true);
    expect(gameplayHapticArmed(true, true, false)).toBe(false);
    expect(hapticThrottleMs("tap")).toBeLessThan(hapticThrottleMs("combo"));
  });

  it("does not keep delayed attack hits after cancel", () => {
    vi.useFakeTimers();
    const vibrate = vi.fn(() => true);
    const bus = new HapticBus(vibrate);
    bus.dispatch([{ kind: "attack" }, { kind: "attackHit", delayMs: 420 }], 10);
    expect(vibrate).toHaveBeenCalledTimes(0);
    vi.advanceTimersByTime(0);
    expect(vibrate).toHaveBeenCalledTimes(1);
    bus.cancel();
    const afterCancel = vibrate.mock.calls.length;
    vi.advanceTimersByTime(500);
    expect(vibrate.mock.calls.length).toBe(afterCancel);
    vi.useRealTimers();
  });

  it("lets victory and defeat interrupt same-tick TIME and cancel leftover attack hits", () => {
    vi.useFakeTimers();
    const vibrate = vi.fn(() => true);
    const bus = new HapticBus(vibrate);
    bus.dispatch([{ kind: "incoming", combo: 5 }, { kind: "attackHit", combo: 5, delayMs: 420 }], 8000);
    vi.advanceTimersByTime(0);
    expect(bus.play("urgent", 2, 9000)).toBe(true);
    expect(bus.play("defeat", 1, 9000)).toBe(true);
    expect(vibrate).toHaveBeenLastCalledWith(30);
    expect(bus.play("incoming", 5, 9000)).toBe(false);
    const afterDefeat = vibrate.mock.calls.length;
    vi.advanceTimersByTime(500);
    expect(vibrate.mock.calls.length).toBe(afterDefeat);

    expect(bus.play("start", 1, 11900)).toBe(true);
    expect(bus.play("victory", 1, 12000)).toBe(true);
    expect(vibrate).toHaveBeenLastCalledWith([24, 28, 44]);
    expect(bus.play("victory", 1, 12100)).toBe(false);
    expect(bus.play("start", 1, 14800)).toBe(true);
    expect(bus.play("draw", 1, 15000)).toBe(true);
    expect(vibrate).toHaveBeenLastCalledWith(42);
    vi.useRealTimers();
  });

  it("plays the match-end sting for a real session finale, not the cinematic attack", () => {
    vi.useFakeTimers();
    const vibrate = vi.fn(() => true);
    const bus = new HapticBus(vibrate);
    const loss = new GameSession();
    loss.progress = { ...loss.progress, tutorialDone: true, matchesSeen: 8 };
    loss.mode = "time";
    loss.startMatch(1000);
    loss.tick(4200);
    loss.player.score = 40;
    loss.opponent.score = 9000;
    loss.tick(64_200);
    const endBorn = loss.fx.find((f) => f.kind === "finale")?.born ?? 0;
    const endFx = loss.fx.filter((f) => f.born === endBorn);
    const audio = endFx.flatMap((fx) => battleCuesFromFx(fx));
    expect(audio).toContain("defeat");
    expect(audio).not.toContain("rivalAttack");
    expect(audio).not.toContain("attack");
    for (const fx of endFx) bus.dispatch(hapticCuesFromFx(fx), endBorn);
    vi.advanceTimersByTime(0);
    expect(vibrate.mock.calls.some((call) => call[0] === 30)).toBe(true);

    const draw = new GameSession();
    draw.progress = { ...draw.progress, tutorialDone: true, matchesSeen: 8 };
    draw.mode = "time";
    draw.startMatch(1000);
    draw.tick(4200);
    draw.player.score = 500;
    draw.opponent.score = 500;
    draw.tick(64_200);
    expect(battleCuesFromFx(draw.fx.find((f) => f.kind === "finale")!)).toEqual(["draw"]);
    expect(hapticCuesFromFx(draw.fx.find((f) => f.kind === "finale")!)).toEqual([{ kind: "draw" }]);
    vi.useRealTimers();
  });
});
