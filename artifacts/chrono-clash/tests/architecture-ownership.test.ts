import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(process.cwd());

function read(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

describe("architecture ownership contract", () => {
  it("loads the canonical board frame after the legacy presentation layers", () => {
    const html = read("index.html");
    const game = html.indexOf("/src/styles/game.css");
    const studio = html.indexOf("/src/styles/studio.css");
    const polish = html.indexOf("/src/styles/aaa-polish.css");
    const frame = html.indexOf("/src/styles/match-frame.css");

    expect(game).toBeGreaterThanOrEqual(0);
    expect(studio).toBeGreaterThan(game);
    expect(polish).toBeGreaterThan(studio);
    expect(frame).toBeGreaterThan(polish);

    const frameCss = read("src/styles/match-frame.css");
    for (const selector of [
      ".board-slot",
      ".board-slot::before",
      ".board-slot::after",
      ".board-outer-rail",
      ".board-energy-glass",
      ".board-socket-bed",
      ".board-fastener",
    ]) {
      expect(frameCss).toContain(selector);
    }
  });

  it("keeps targeted power mutation shared by local and online authorities", () => {
    const session = read("src/engine/session.ts");
    const battle = read("src/server/battle.ts");
    const powers = read("src/engine/powers.ts");

    expect(powers).toContain("export function resolveTargetedPower");
    expect(session).toContain("resolveTargetedPower(");
    expect(battle).toContain("resolveTargetedPower(");
    expect(session).not.toContain("const targetPiece =");
    expect(battle).not.toContain("const targetPiece =");
  });

  it("keeps swipe math in the input module", () => {
    const input = read("src/engine/input.ts");
    const main = read("src/main.ts");

    expect(input).toContain("export function neighborFromSwipe");
    expect(input).toContain("export function clampDrag");
    expect(main).toContain("clampDrag(dx, dy, cellSize())");
  });
});