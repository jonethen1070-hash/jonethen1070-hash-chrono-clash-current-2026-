import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { COLORS } from "../src/engine/types";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("arena HUD polish outside the gem board", () => {
  it("keeps gem identities, board mechanics, and match HUD IDs locked", () => {
    expect([...COLORS]).toEqual(["#D1166D", "#D38800", "#008F5B", "#1754C7", "#6D25C9", "#008EAA"]);
    const main = read("src/main.ts");
    const match = main.slice(main.indexOf('id="match"'), main.indexOf('id="sheet"'));
    expect(match).toContain('id="playerGems"');
    expect(match).toContain('id="oppGems"');
    expect(match).not.toContain('id="freeze"');
    expect(match).not.toContain('id="timeshift"');
    expect(match).not.toContain('id="rewind"');
    expect(match).not.toContain('id="energyBurstAttack"');
    expect(match).not.toContain('id="megaStrikeAttack"');
    expect(match).not.toContain('id="energyFill"');
    expect(match).not.toContain('id="energyLabel"');
    expect(match).not.toContain('class="energy-wrap"');
    expect(match).not.toContain('class="powers"');
    expect(match).toContain('class="opponent-render-reserve"');
    expect(match).not.toContain('id="playerAttack"');
    expect(match).not.toContain('id="oppAttack"');
    const studio = read("src/styles/studio.css");
    expect(studio).toContain("min(28vw, 11.2dvh, 96px)");
  });

  it("layers a deeper cosmic arena with foreground debris", () => {
    const main = read("src/main.ts");
    expect(main).toContain('class="space-debris"');
    expect(main.indexOf('class="space-far"')).toBeLessThan(main.indexOf('class="space-mid"'));
    expect(main.indexOf('class="space-mid"')).toBeLessThan(main.indexOf('class="space-near"'));
    expect(main.indexOf('class="space-dust"')).toBeLessThan(main.indexOf('class="space-debris"'));
    const css = read("src/styles/game.css");
    expect(css).toContain(".space-debris");
    expect(css).toContain("debrisDrift");
    const polish = read("src/styles/aaa-polish.css");
    expect(polish).toContain("arenaNebulaDrift");
    expect(polish).toContain("#app:has(#match.active) .space-nebula");
    expect(polish).toContain("#app:has(#match.active) .space-split");
    expect(polish).toContain("#app:has(#match.active) .space-planet");
  });

  it("fits 3+ digit match scores inside the fighter capsules", () => {
    const hud = read("src/styles/hud-redesign.css");
    expect(hud).toContain('.score-rail b[data-digits="3"]');
    expect(hud).toContain('.score-rail b[data-digits="4"]');
    expect(hud).toContain("font-variant-numeric: tabular-nums");
    const main = read("src/main.ts");
    expect(main).toContain('el.id === "playerScore" || el.id === "oppScore"');
    expect(main).toContain("el.dataset.digits");
  });

  it("gives match HUD physical glass/metal depth without touching player board chrome tokens", () => {
    const polish = read("src/styles/aaa-polish.css");
    expect(polish).toContain("Arena HUD 3D");
    expect(polish).toContain("#match .fighter.you");
    expect(polish).toContain("#match .fighter.rival");
    expect(polish).toContain("html #app #match.trailing .fighter.rival");
    expect(polish).toContain("html #app #match.leading .fighter.you");
    expect(polish).toContain("inset 3px 0 0 #00c4dc");
    expect(polish).toContain("inset -3px 0 0 #dc1048");
    expect(polish).toContain("#match .vs-column .timer");
    expect(polish).toContain("#match .attack-meter.you span i");
    expect(polish).toContain("#match .attack-meter.rival span i");
    expect(polish).toContain("arenaEnergyFlow");
    expect(polish).toContain("#match .boards > .energy-wrap");
    expect(polish).toContain("#match #rewind.ready");
    expect(polish).toContain("#match .power:disabled");
    expect(polish).toContain("rgba(0, 212, 255, 0.26)");
    expect(polish).toContain("rgba(255, 0, 76, 0.16)");
  });

  it("does not rewrite gem paint, matching, audio, or power behavior", () => {
    const renderer = read("src/ui/renderer.ts");
    expect(renderer).toContain("paintAtlasGem");
    expect(renderer).toContain("paintDeviceBoard");
    const session = read("src/engine/session.ts");
    expect(session).toContain("ENERGY_FREEZE");
    expect(session).toContain("ENERGY_TIMESHIFT");
    expect(session).toContain("ENERGY_REWIND");
    const bus = read("src/audio/bus.ts");
    expect(bus).toContain("play");
  });
});
