import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { COLORS, COLS, ROWS } from "../src/engine/types";
import { BOARD_FRAME, BOARD_GAP } from "../src/ui/renderer";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("match screen graphics-only polish", () => {
  it("keeps gem identities, board math, and Chrono Power wiring locked", () => {
    expect([...COLORS]).toEqual(["#D1166D", "#D38800", "#008F5B", "#1754C7", "#6D25C9", "#008EAA"]);
    expect(COLS).toBe(8);
    expect(ROWS).toBe(10);
    expect(BOARD_FRAME).toBe(6);
    expect(BOARD_GAP).toBe(1.5);
    const main = read("src/main.ts");
    expect(main).not.toContain('id="freeze"');
    expect(main).not.toContain('id="timeshift"');
    expect(main).toContain('id="rewind"');
    expect(main).toContain(">REWIND<");
    expect(main).toContain('id="energyBurstAttack"');
    expect(main).toContain('id="megaStrikeAttack"');
    expect(main).toContain('id="playerGems"');
    expect(main).toContain('id="oppGems"');
    expect(main).toContain('id="energyFill"');
    expect(main).toContain('id="timer"');
  });

  it("does not rewrite the board-fit layout tokens", () => {
    const studio = read("src/styles/studio.css");
    expect(studio).toContain("--board-inline:");
    expect(studio).toContain("width: min(100%, var(--board-inline), 42dvh, 480px)");
    expect(studio).toContain("container-type: size");
    expect(studio).toContain("--match-board-gap: 12px");
    const polish = read("src/styles/aaa-polish.css");
    const pass = polish.slice(polish.indexOf("Match arena graphics pass"));
    expect(pass).toContain("html #app #match .player-side .board-slot");
    expect(pass).not.toMatch(/--board-block/);
    expect(pass).not.toMatch(/container-type/);
  });

  it("quiets cell rims and keeps the holographic board object", () => {
    const renderer = read("src/ui/renderer.ts");
    expect(renderer).toContain("paintDeviceBoard");
    expect(renderer).toContain("wy + cell * 0.72");
    expect(renderer).toContain('const slabFace = isPlayer ? "#062B39" : "#32101C"');
    expect(renderer).toContain("|hw8");
    expect(renderer).toContain('isPlayer ? "#061321" : "#300D1C"');
    expect(renderer).toContain('isPlayer ? "#005B7847" : "#8A123538"');
    expect(renderer).toContain("paintCrystalOptics");
    expect(renderer).toContain("paintSpeculars");
    expect(renderer).toContain("crystal.core");
    expect(renderer).toContain("crystal.edge");
  });

  it("keeps HUD chrome tokens while refining glass/metal depth", () => {
    const polish = read("src/styles/aaa-polish.css");
    expect(polish).toContain("Match arena graphics pass");
    expect(polish).toContain("rgba(0, 212, 255, 0.26)");
    expect(polish).toContain("rgba(255, 0, 76, 0.16)");
    expect(polish).toContain("inset 3px 0 0 #00c4dc");
    expect(polish).toContain("inset -3px 0 0 #dc1048");
    expect(polish).toContain("html #app #match .vs-column .timer");
    expect(polish).toContain("html #app #match .boards > .energy-wrap");
    expect(polish).toContain("html #app #match #rewind.ready");
    expect(polish).toContain("html #app #match .power:disabled");
  });
});
