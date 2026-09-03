import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { liveGemDrawOrigin } from "../src/ui/renderer";

describe("occupied board cells always render a gem", () => {
  it("spawns refill gems at full alpha and eases them into the well", () => {
    const renderer = readFileSync("src/ui/renderer.ts", "utf8");
    expect(renderer).not.toContain("ty - cell * (r + 1.2)");
    expect(renderer).not.toMatch(/alpha:\s*0,/);
    expect(renderer).toContain("alpha: 1");
    expect(renderer).toContain("tile.alpha = 1");
    expect(renderer).toContain("liveGemDrawOrigin(");
    expect(renderer).toContain("gemTravelEase");
    expect(renderer).not.toContain("tile.y = Math.min(tile.y + tile.vy, ty)");
  });

  it("does not clamp live travel to a tiny in-cell drop", () => {
    const cell = 45;
    const restY = 400;
    const origin = liveGemDrawOrigin(10, restY, 10, restY - cell * 8, cell, false);
    expect(origin.y).toBe(restY - cell * 8);
  });
});
