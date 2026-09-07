import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GEM_ATLAS_SIZE, GEM_CELL, GEM_COLS, GEM_ORDER, gemCellOrigin } from "../src/ui/gemAtlas";

const ASSETS = join(process.cwd(), "public", "assets");
const FILES = [
  "chrono-clash-logo.png",
  "chrono-clash-gems.png",
  "chrono-clash-ui-metal-background.jpg",
  "chrono-clash-battle-arena.jpg",
  "chrono-clash-energy-arena.jpg",
  "chrono-clash-red-arena.jpg",
  "chrono-clash-space-arena.jpg",
] as const;

describe("GameUI reskin assets", () => {
  it("keeps all seven GameUI binaries in public/assets", () => {
    for (const file of FILES) {
      expect(existsSync(join(ASSETS, file)), file).toBe(true);
    }
  });

  it("preserves the 3x2 gem atlas contract", () => {
    expect(GEM_COLS).toBe(3);
    expect(GEM_CELL).toBe(256);
    expect(GEM_ATLAS_SIZE).toBe(768);
    expect([...GEM_ORDER]).toEqual([4, 2, 1, 5, 3, 0]);
    expect(gemCellOrigin(1)).toEqual({ sx: 256, sy: 256 });
    expect(gemCellOrigin(2)).toEqual({ sx: 512, sy: 0 });
    expect(gemCellOrigin(3)).toEqual({ sx: 256, sy: 0 });
    expect(gemCellOrigin(4)).toEqual({ sx: 512, sy: 256 });
    expect(gemCellOrigin(5)).toEqual({ sx: 0, sy: 256 });
    expect(gemCellOrigin(6)).toEqual({ sx: 0, sy: 0 });
  });

  it("wires logo, arenas, and metal through existing screens", () => {
    const main = readFileSync(join(process.cwd(), "src/main.ts"), "utf8");
    const css = readFileSync(join(process.cwd(), "src/styles/game.css"), "utf8");
    const renderer = readFileSync(join(process.cwd(), "src/ui/renderer.ts"), "utf8");
    expect(main).toContain('src="/assets/chrono-clash-logo.png"');
    expect(main).toContain("id=\"titleMark\"");
    expect(css).toContain("--art-battle");
    expect(css).toContain("--art-energy");
    expect(css).toContain("--art-red");
    expect(css).toContain("--art-space");
    expect(css).toContain("--art-metal");
    expect(css).toContain("#app:has(#match.active)");
    expect(css).toContain("#app:has(#results.active.win)");
    expect(css).toContain("#app:has(#results.active.loss)");
    expect(readFileSync(join(process.cwd(), "index.html"), "utf8")).toContain("aaa-polish.css");
    expect(renderer).toContain("flashSwap");
    expect(renderer).toContain("impactSpark");
    expect(renderer).toContain("drawAtlasGem");
    expect(renderer).toContain("drawProceduralGem");
  });

  it("draws atlas gems without the old jewelPath silhouette overlay", () => {
    const renderer = readFileSync(join(process.cwd(), "src/ui/renderer.ts"), "utf8");
    const drawGem = renderer.slice(renderer.indexOf("private drawGem("), renderer.indexOf("private drawAtlasGem("));
    expect(drawGem).toContain("this.drawAtlasGem(");
    expect(drawGem).toContain("this.drawProceduralGem(");
    expect(drawGem).toMatch(/if \(useAtlas && atlas\) \{\s*this\.drawAtlasGem/);
    const atlasBranch = drawGem.slice(drawGem.indexOf("if (useAtlas && atlas)"), drawGem.indexOf("} else {"));
    expect(atlasBranch).not.toContain("jewelPath");
    expect(atlasBranch).not.toContain("drawProceduralGem");
    expect(drawGem).toContain("roundRect(ctx, x + 0.8, y + 0.8, size - 1.6, size - 1.6");
    expect(drawGem).not.toMatch(/if \(selected \|\| hinted\)[\s\S]*jewelPath/);
  });

  it("keeps atlas artwork and adds per-type silhouette, rim, and marker in the sprite bake", () => {
    const renderer = readFileSync(join(process.cwd(), "src/ui/renderer.ts"), "utf8");
    const paint = renderer.slice(renderer.indexOf("private paintAtlasGem("), renderer.indexOf("private drawProceduralGem("));
    expect(paint).toContain("ctx.drawImage(atlas");
    expect(paint).toContain("jewelPath(ctx, cx, cy, s, colorIndex)");
    expect(paint).toContain("ctx.clip()");
    expect(paint).toContain("drawGemIcon(ctx, cx, cy, s, colorIndex, color)");
    expect(paint).toContain("crystal.edge");
    expect(paint).not.toContain("ellipse(cx - s * 0.16");
  });

  it("keeps normal atlas gems free of static cyan-white arc overlays", () => {
    const renderer = readFileSync(join(process.cwd(), "src/ui/renderer.ts"), "utf8");
    const paint = renderer.slice(renderer.indexOf("private paintAtlasGem("), renderer.indexOf("private drawProceduralGem("));
    const targetResponse = renderer.slice(
      renderer.indexOf("private drawPowerTargetGem("),
      renderer.indexOf("private drawCrystalFracture("),
    );
    expect(paint).not.toContain('ctx.arc(cx - s * 0.1, cy - s * 0.14');
    expect(targetResponse).toContain("drawIrregularEnergyArc");
  });

  it("isolates one atlas gem per 256 cell instead of drawing the sheet split", () => {
    const atlas = readFileSync(join(process.cwd(), "src/ui/gemAtlas.ts"), "utf8");
    expect(atlas).toContain("isolateAtlasGems");
    expect(atlas).toContain("comps.slice(0, 6)");
  });

  it("keeps match HUD overlays out of document flow", () => {
    const studio = readFileSync(join(process.cwd(), "src/styles/studio.css"), "utf8");
    const css = readFileSync(join(process.cwd(), "src/styles/game.css"), "utf8");
    const main = readFileSync(join(process.cwd(), "src/main.ts"), "utf8");
    expect(main).toContain('class="match-stage"');
    expect(studio).toContain("#match .match-stage");
    expect(studio).toContain("#match .incoming-banner");
    expect(studio).toContain("position: absolute");
    expect(studio).toContain("contain: layout");
    expect(css).toMatch(/\.you-meta \{[\s\S]*flex-wrap: nowrap/);
    expect(css).not.toMatch(/\.you-meta \{\s*flex-wrap: wrap/);
  });

  it("keeps the rival board a compact square below the HUD and above energy", () => {
    const studio = readFileSync(join(process.cwd(), "src/styles/studio.css"), "utf8");
    const polish = readFileSync(join(process.cwd(), "src/styles/aaa-polish.css"), "utf8");
    const main = readFileSync(join(process.cwd(), "src/main.ts"), "utf8");
    const boards = main.slice(main.indexOf('class="boards"'), main.indexOf('class="powers"'));
    expect(boards.indexOf('id="oppBoard"')).toBeLessThan(boards.indexOf('class="energy-wrap"'));
    expect(boards.indexOf('class="energy-wrap"')).toBeLessThan(boards.indexOf('id="playerBoard"'));
    expect(studio).toContain("grid-template-rows: max-content max-content minmax(0, 1fr)");
    expect(studio).toContain("#match .rival-side .board-slot");
    expect(studio).toContain("min(28vw, 14dvh, 120px)");
    expect(polish).toContain("width: min(100%, calc(100vw - var(--safe-left) - var(--safe-right) - 2px), 388px)");
    expect(studio).toContain("aspect-ratio: 1 / 1");
    expect(studio).toContain("#rewind .glyph");
    expect(studio).toContain("rgba(251,113,133,0.6)");
    expect(studio).toContain("background: transparent");
    expect(studio).toMatch(/#match \.power \{[\s\S]*min-height: 48px/);
    expect(studio).not.toMatch(/@media \(max-height: 740px\) \{[\s\S]*?\.match-brand \{ display: none/);
  });
});
