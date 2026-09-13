import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { COLORS } from "../src/engine/types";
import { BOARD_FRAME, BOARD_GAP } from "../src/ui/renderer";
import {
  ARENA_PARALLAX_FAR,
  ARENA_PARALLAX_MID,
  ARENA_PARALLAX_NEAR,
  clampParallax,
  parallaxDisabled,
} from "../src/ui/arenaParallax";

const root = process.cwd();

describe("visual depth polish", () => {
  it("keeps gem identities, board size, and motion contracts", () => {
    expect([...COLORS]).toEqual(["#D1166D", "#D38800", "#008F5B", "#1754C7", "#6D25C9", "#008EAA"]);
    expect(BOARD_GAP).toBe(1.5);
    expect(BOARD_FRAME).toBe(6);
    const motion = readFileSync(join(root, "src/ui/gemMotion.ts"), "utf8");
    expect(motion).toContain("easeCrystalFall");
    expect(motion).toContain("easeCrystalDie");
    expect(motion).toContain("easeInOutSine");
  });

  it("bakes dimensional crystal lighting into cached gem sprites", () => {
    const renderer = readFileSync(join(root, "src/ui/renderer.ts"), "utf8");
    expect(renderer).toContain("|c18");
    expect(renderer).toContain("|hw8");
    const paint = renderer.slice(renderer.indexOf("private paintAtlasGem("), renderer.indexOf("private drawProceduralGem("));
    expect(paint).toContain("ctx.drawImage(atlas");
    expect(paint).toContain("paintCrystalOptics");
    expect(paint).toContain("paintSpeculars");
    expect(paint).toContain("crystal.core");
    expect(paint).toContain("crystal.edge");
    expect(paint).toContain("source-atop");
    expect(paint).toContain("lighter");
    expect(paint).toContain("colorWithAlpha(color, 0.48)");
    expect(paint).toContain("rgba(255,255,255,0.28)");
    const drawGem = renderer.slice(renderer.indexOf("private drawGem("), renderer.indexOf("private drawAtlasGem("));
    expect(drawGem).toContain("ellipse(cx + s * 0.02, cy + s * 0.44");
    expect(drawGem).toContain("travelLift");
    const atlasBranch = drawGem.slice(drawGem.indexOf("if (useAtlas && atlas)"), drawGem.indexOf("} else {"));
    expect(atlasBranch).not.toContain("jewelPath");
    expect(atlasBranch).toContain("this.drawAtlasGem");
  });

  it("recesses both boards with glass wells and quieter rival lighting", () => {
    const renderer = readFileSync(join(root, "src/ui/renderer.ts"), "utf8");
    expect(renderer).toContain("createRadialGradient(");
    expect(renderer).toContain("wy + cell * 0.72");
    expect(renderer).toContain('const slabFace = isPlayer ? "#062B39" : "#32101C"');
    const polish = readFileSync(join(root, "src/styles/aaa-polish.css"), "utf8");
    expect(polish).toContain("#match .player-side .board-slot");
    expect(polish).toContain("#match .rival-side .board-slot");
    expect(polish).toContain("rgba(0, 212, 255, 0.26)");
    expect(polish).toContain("rgba(255, 0, 76, 0.16)");
  });

  it("layers a living arena behind a stable board and HUD", () => {
    const main = readFileSync(join(root, "src/main.ts"), "utf8");
    expect(main).toContain('class="space-far"');
    expect(main).toContain('class="space-mid"');
    expect(main).toContain('class="space-near"');
    expect(main).toContain('class="space-stars"');
    expect(main).toContain('class="space-planet"');
    expect(main).toContain('class="space-clouds"');
    expect(main).toContain("startArenaParallax");
    expect(main.indexOf('class="space-layer"')).toBeLessThan(main.indexOf('class="shell"'));
    const css = readFileSync(join(root, "src/styles/game.css"), "utf8");
    expect(css).toContain("--arena-x");
    expect(css).toContain("--arena-y");
    expect(css).toContain("space-far");
    expect(css).not.toMatch(/canvas#stage[\s\S]{0,80}--arena-x/);
    expect(css).not.toMatch(/\.board-slot[\s\S]{0,120}--arena-x/);
  });

  it("keeps the match perspective floor behind the playable board", () => {
    const polish = readFileSync(join(root, "src/styles/aaa-polish.css"), "utf8");
    const after = polish.slice(polish.lastIndexOf("html body #app #match.active::after"));
    expect(after).toContain("z-index: -1 !important");
    expect(after).toContain("mix-blend-mode: normal !important");
    expect(after).not.toContain("mix-blend-mode: multiply");
  });

  it("keeps arena parallax tiny, CSS-driven, and motion-safe", () => {
    expect(ARENA_PARALLAX_FAR).toBe(5);
    expect(ARENA_PARALLAX_MID).toBe(9);
    expect(ARENA_PARALLAX_NEAR).toBe(12);
    expect(ARENA_PARALLAX_NEAR).toBeLessThan(16);
    expect(clampParallax(-4)).toBe(-1);
    expect(clampParallax(2.4)).toBe(1);
    expect(clampParallax(0.25)).toBe(0.25);
    const app = { classList: { contains: (name: string) => name === "fx-low" } } as HTMLElement;
    expect(parallaxDisabled(app)).toBe(true);
    expect(parallaxDisabled(null)).toBe(true);
    const src = readFileSync(join(root, "src/ui/arenaParallax.ts"), "utf8");
    expect(src).toContain("requestAnimationFrame");
    expect(src).not.toContain("setInterval");
    expect(src).toContain("--arena-x");
  });
});
