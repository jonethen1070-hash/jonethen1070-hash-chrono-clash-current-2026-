import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("2.5D arena presentation", () => {
  it("keeps the environment and board depth in the existing renderer", () => {
    const renderer = readFileSync("src/ui/renderer.ts", "utf8");

    expect(renderer).toContain("private drawArenaEnvironment");
    expect(renderer).toContain("const vanishingX = w * 0.5 + drift * 0.35");
    expect(renderer).toContain("ctx.ellipse(w * 0.5, horizonY");
    expect(renderer).toContain("private drawBoardDepth");
    expect(renderer).toContain("ctx.shadowOffsetY = size * 0.028");
    expect(renderer).toContain("const topRail = ctx.createLinearGradient");
  });

  it("keeps every crystal materially shaded and directionally lit", () => {
    const renderer = readFileSync("src/ui/renderer.ts", "utf8");

    expect(renderer).toContain("private drawGemMaterialLighting");
    expect(renderer).toContain("jewelPath(ctx, cx, cy, s * 0.92, colorIndex)");
    expect(renderer).toContain("const sweepX = cx - s * 0.82 + phase * s * 1.64");
    expect(renderer).toContain('ctx.globalCompositeOperation = "multiply"');
    expect(renderer).toContain("const rim = ctx.createLinearGradient");
  });

  it("keeps socket contact shading cached and HUD materials aligned", () => {
    const renderer = readFileSync("src/ui/renderer.ts", "utf8");
    const styles = readFileSync("src/styles/aaa-polish.css", "utf8");

    expect(renderer).toContain("const contact = g.createRadialGradient");
    expect(renderer).toContain("g.ellipse(wx + cell * 0.52");
    expect(renderer).toContain("const socketRim = g.createLinearGradient");
    expect(styles).toContain("2.5D material pass");
    expect(styles).toContain("html body #app #match .energy-attack");
    expect(styles).toContain("inset 0 -11px 16px");
  });
});