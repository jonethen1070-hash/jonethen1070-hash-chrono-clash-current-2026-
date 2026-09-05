import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("power ability VFX presentation", () => {
  it("keeps the three hero power stories renderer-owned and bounded", () => {
    const renderer = readFileSync("src/ui/renderer.ts", "utf8");

    expect(renderer).toContain('kind: "burst" | "mega" | "rewind"');
    expect(renderer).toContain("private drawPowerEffects");
    expect(renderer).toContain('const effect = burst ? "burst" : mega ? "mega" : rewind ? "rewind" : null');
    expect(renderer).toContain('rewind ? "#2E9BFF" : mega ? "#00D9FF" : burst ? "#7CF5FF"');
    expect(renderer).toContain("const life = effect.kind === \"rewind\" ? 620 : effect.kind === \"mega\" ? 430 : 320");
    expect(renderer).toContain("const count = Math.min(10, n + (mega ? 2 : 0))");
    expect(renderer).toContain("view.powerEffects.length > 4");
    expect(renderer).toContain("this.stepParticles(view, dt)");
    expect(renderer).toContain("this.stepCrystalShards(view, dt)");
  });

  it("keeps real power resolution in the session path", () => {
    const session = readFileSync("src/engine/session.ts", "utf8");

    expect(session).toContain("const result = this.applyEnergyAttack(id, target)");
    expect(session).toContain('this.pushFx("power", id === "burst" ? "ENERGY BURST" : "MEGA STRIKE"');
    expect(session).toContain('this.pushFx("rewind", "BOARD RESTORED"');
  });
});