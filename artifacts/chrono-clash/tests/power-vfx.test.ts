import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("power ability VFX presentation", () => {
  it("keeps the three hero power stories renderer-owned and bounded", () => {
    const renderer = readFileSync("src/ui/renderer.ts", "utf8");

    expect(renderer).toContain('kind: "burst" | "mega" | "rewind"');
    expect(renderer).toContain("private drawPowerEffects");
    expect(renderer).toContain("private drawPowerWake");
    expect(renderer).toContain("private drawPowerContrast");
    expect(renderer).toContain("private drawTargetCrystalResponse");
    expect(renderer).toContain('const effect = burst ? "burst" : mega ? "mega" : rewind ? "rewind" : null');
    expect(renderer).toContain('rewind ? "#2E9BFF" : mega ? "#00D9FF" : burst ? "#7CF5FF"');
    expect(renderer).toContain("const life = effect.kind === \"rewind\" ? 620 : effect.kind === \"mega\" ? 520 : 380");
    expect(renderer).toContain("const count = Math.min(10, n + (mega ? 2 : 0))");
    expect(renderer).toContain("view.powerEffects.length > 4");
    expect(renderer).toContain("view.powerWake =");
    expect(renderer).toContain("powerFractureDirection");
    expect(renderer).toContain("const peakCenter = effect.kind === \"mega\" ? 146 : 92");
    expect(renderer).toContain("hero = false");
    expect(renderer).toContain("streak: mega ? 0.95 : 0.68");
    expect(renderer).toContain("globalCompositeOperation = \"multiply\"");
    expect(renderer).toContain("targetX: cx");
    expect(renderer).toContain("this.stepParticles(view, dt)");
    expect(renderer).toContain("this.stepCrystalShards(view, dt)");
  });

  it("keeps armed targeting in the existing Canvas renderer", () => {
    const renderer = readFileSync("src/ui/renderer.ts", "utf8");
    const main = readFileSync("src/main.ts", "utf8");
    const styles = readFileSync("src/styles/aaa-polish.css", "utf8");

    expect(renderer).toContain("setPowerTargeting(kind: PowerTargetKind | null");
    expect(renderer).toContain("setPowerCastTarget(at: Coord | null");
    expect(renderer).toContain("drawPowerTargetingAtmosphere");
    expect(renderer).toContain("drawPowerTargetGem");
    expect(renderer).toContain("drawIrregularEnergyArc");
    expect(renderer).toContain("this.playerView.powerTargeting = null");
    expect(renderer).toContain("view.shockwaves.length > 12");
    expect(renderer).toContain("powerImpactImpulse");
    expect(renderer).toContain("born: now + 120");
    expect(renderer).toContain("life: 78");
    expect(renderer).toContain('effect.kind === "mega" ? 150');
    expect(renderer).toContain("const impactStart = mega ? 98 : 44");
    expect(main).toContain("renderer.setPowerTargeting");
    expect(main).toContain("renderer.setPowerTarget(hitPlayer(e)");
    expect(main).toContain("renderer.setPowerCastTarget(target, now)");
    expect(main).toContain('renderer.setPowerTarget(null, performance.now())');
    expect(main).toContain('pressPowerButton(button)');
    expect(styles).toContain("@keyframes cc-power-press-burst");
    expect(styles).toContain("@keyframes cc-power-press-mega");
    expect(styles).toContain("@keyframes cc-power-button-pulse");
    expect(styles).toContain('scale(0.94)');
  });

  it("keeps real power resolution in the session path", () => {
    const session = readFileSync("src/engine/session.ts", "utf8");

    expect(session).toContain("const result = this.applyEnergyAttack(id, target)");
    expect(session).toContain('this.pushFx("power", id === "burst" ? "ENERGY BURST" : "MEGA STRIKE"');
    expect(session).toContain('this.pushFx("rewind", "BOARD RESTORED"');
  });
});