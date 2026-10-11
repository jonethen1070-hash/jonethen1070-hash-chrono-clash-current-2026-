import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { COLOR_COUNT, COLORS } from "../src/engine/types";
import {
  gemReadabilityGrade,
  hexHueSat,
  recolorCrystalPixels,
} from "../src/ui/gemMaterial";

describe("six-gem color clarity", () => {
  it("keeps exactly six palette IDs and only remaps pink and blue", () => {
    expect(COLORS).toHaveLength(6);
    expect(COLOR_COUNT).toBe(6);
    expect(COLORS[1]).toBe("#D38800");
    expect(COLORS[2]).toBe("#008F5B");
    expect(COLORS[4]).toBe("#6D25C9");
    expect(COLORS[5]).toBe("#008EAA");
    expect(gemReadabilityGrade(1)).not.toBeNull();
    expect(gemReadabilityGrade(4)).not.toBeNull();
    expect(gemReadabilityGrade(2)).toBeNull();
    expect(gemReadabilityGrade(3)).toBeNull();
    expect(gemReadabilityGrade(5)).toBeNull();
    expect(gemReadabilityGrade(6)).toBeNull();
  });

  it("moves the pink ID toward ruby and darkens blue away from cyan", () => {
    const ruby = hexHueSat(COLORS[0]!);
    const blue = hexHueSat(COLORS[3]!);
    const cyan = hexHueSat(COLORS[5]!);
    const purple = hexHueSat(COLORS[4]!);
    expect(ruby.hue < 0.06 || ruby.hue > 0.93).toBe(true);
    expect(ruby.sat).toBeGreaterThan(0.75);
    expect(blue.hue).toBeGreaterThan(0.55);
    expect(blue.hue).toBeLessThan(0.72);
    expect(Math.abs(blue.hue - cyan.hue)).toBeGreaterThan(0.06);
    expect(Math.abs(ruby.hue - purple.hue)).toBeGreaterThan(0.12);

    const pink = new Uint8ClampedArray([209, 22, 109, 255]);
    recolorCrystalPixels(pink, 1, 0, 0, 1, COLORS[0]!, gemReadabilityGrade(1)!);
    expect(pink[0] ?? 0).toBeGreaterThan(pink[2] ?? 0);
    expect(pink[2] ?? 0).toBeLessThan(80);

    const icy = new Uint8ClampedArray([78, 200, 255, 255]);
    recolorCrystalPixels(icy, 1, 0, 0, 1, COLORS[3]!, gemReadabilityGrade(4)!);
    const before = 78 + 200 + 255;
    const after = (icy[0] ?? 0) + (icy[1] ?? 0) + (icy[2] ?? 0);
    expect(after).toBeLessThan(before);
    expect(icy[2] ?? 0).toBeGreaterThan(icy[1] ?? 0);
  });

  it("applies the palette remap on the atlas load path only", () => {
    const atlas = readFileSync("src/ui/gemAtlas.ts", "utf8");
    expect(atlas).toContain("applyPaletteReadability(data)");
    expect(atlas).toContain("recolorCrystalCell");
    expect(atlas).toContain("gemReadabilityGrade");
    const renderer = readFileSync("src/ui/renderer.ts", "utf8");
    expect(renderer).toContain('core: "#FF2E48"');
    expect(renderer).toContain('core: "#2F5BFF"');
    expect(renderer).toContain('bloom: "#C4142E55"');
    expect(renderer).toContain('bloom: "#0B2A8C55"');
    expect(renderer).not.toContain("#FF4EAD");
    expect(renderer).not.toContain("#4EC8FF");
  });
});
