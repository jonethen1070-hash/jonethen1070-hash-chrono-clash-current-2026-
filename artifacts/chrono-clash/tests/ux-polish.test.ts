import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { grantHasBounty } from "../src/engine/progress";
import { COLORS } from "../src/engine/types";

const root = process.cwd();

describe("premium UX polish", () => {
  it("keeps the main menu actions and live cosmic presentation", () => {
    const main = readFileSync(join(root, "src/main.ts"), "utf8");
    expect(main).toContain('id="menuGoogle"');
    expect(main).toContain('id="menuGuest"');
    expect(main).toContain('id="toProfile">PROFILE');
    expect(main).toContain('id="toTrophies">TROPHIES');
    expect(main).toContain('id="toSettings">SETTINGS');
    expect(main).toContain('id="menuEmail"');
    expect(main).toContain('id="menuFacebook"');
    expect(main).toContain("pressUi");
    expect(main).toContain("pulseUxEnter");
    const views = readFileSync(join(root, "src/ui/metaViews.ts"), "utf8");
    expect(views).toContain("pilot-mark");
    expect(views).toContain("lobby-xp");
    const css = readFileSync(join(root, "src/styles/aaa-polish.css"), "utf8");
    expect(css).toContain("ctaSweep");
    expect(css).toContain("pilotRing");
    expect(css).toContain("xpFlow");
  });

  it("keeps rewards actions and presents empty bounty without inventing XP", () => {
    const main = readFileSync(join(root, "src/main.ts"), "utf8");
    expect(main).toContain('id="rewardsContinue">CONTINUE');
    expect(main).toContain('id="again">PLAY AGAIN');
    expect(main).toContain('id="rewProfile">PROFILE');
    expect(main).toContain('id="toMenu">MAIN MENU');
    expect(main).toContain("paintRewards");
    expect(main).toContain("NO MATCH BOUNTY");
    expect(main).toContain("revealRewardXp");
    expect(grantHasBounty(null)).toBe(false);
    expect(
      grantHasBounty({
        xp: 0,
        coins: 0,
        levelBefore: 1,
        levelAfter: 1,
        unlocked: [],
        achievements: [],
        notes: [],
      }),
    ).toBe(false);
    expect(
      grantHasBounty({
        xp: 40,
        coins: 0,
        levelBefore: 1,
        levelAfter: 1,
        unlocked: [],
        achievements: [],
        notes: [],
      }),
    ).toBe(true);
    expect([...COLORS]).toEqual(["#D1166D", "#D38800", "#008F5B", "#1754C7", "#6D25C9", "#008EAA"]);
  });

  it("uses fast cinematic screen motion and tactile buttons without 3D gimmicks", () => {
    const css = readFileSync(join(root, "src/styles/game.css"), "utf8");
    expect(css).toContain("opacity 0.2s cubic-bezier(0.22, 1, 0.36, 1)");
    expect(css).toContain("translateY(1px) scale(0.97)");
    const polish = readFileSync(join(root, "src/styles/aaa-polish.css"), "utf8");
    expect(polish).toContain("uxEnterFlash");
    expect(polish).not.toContain("perspective: 800px");
  });
});
