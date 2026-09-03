import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { cosmeticsOf, isOwned } from "../src/engine/catalog";
import { ACHIEVEMENTS } from "../src/engine/progress";
import { EMPTY_PROGRESS } from "../src/engine/types";
import { trophiesHtml } from "../src/ui/metaViews";

const polish = readFileSync(resolve("src/styles/aaa-polish.css"), "utf8");
const main = readFileSync(resolve("src/main.ts"), "utf8");
const meta = readFileSync(resolve("src/ui/metaViews.ts"), "utf8");

describe("trophies screen", () => {
  it("keeps the existing trophy names and requirements", () => {
    expect(ACHIEVEMENTS.map((a) => a.id)).toEqual([
      "first_victory",
      "combo_master",
      "time_lord",
      "chrono_warrior",
      "perfect_run",
      "matches_10",
      "streak_5",
      "high_score",
      "power_user",
    ]);
    expect(ACHIEVEMENTS.map((a) => a.name)).toEqual([
      "FIRST VICTORY",
      "COMBO MASTER",
      "TIME LORD",
      "CHRONO WARRIOR",
      "PERFECT RUN",
      "10 MATCHES",
      "5 WIN STREAK",
      "HIGH SCORE",
      "POWER USER",
    ]);
    expect(ACHIEVEMENTS.map((a) => a.detail)).toEqual([
      "Win a match.",
      "Reach COMBO x5 in one match.",
      "Win a Time Battle.",
      "Win a Score Battle.",
      "Win with more than double the rival score.",
      "Play 10 matches.",
      "Win 5 matches in a row.",
      "Score 5,000 in one match.",
      "Use all three Chrono Powers in one match.",
    ]);
    expect(ACHIEVEMENTS.length).toBe(9);
  });

  it("does not change catalog ownership or unlock requirements", () => {
    expect(cosmeticsOf("avatar").map((item) => item.name)).toEqual([
      "Pulse",
      "Ion",
      "Aether",
      "Ember",
      "Nova",
      "Solar",
    ]);
    expect(cosmeticsOf("badge").length).toBe(9);
    expect(isOwned(EMPTY_PROGRESS, "avatar-0")).toBe(true);
    expect(isOwned(EMPTY_PROGRESS, "avatar-3")).toBe(false);
    expect(isOwned(EMPTY_PROGRESS, "ember")).toBe(false);
  });

  it("routes MENU to TROPHIES without Collection categories", () => {
    expect(main).toContain('id="toTrophies">TROPHIES');
    expect(main).toContain(">TROPHIES</h1>");
    expect(main).toContain('id="trophiesBack"');
    expect(main).toContain("session.openTrophies()");
    expect(main).toContain("renderTrophies()");
    expect(main).toContain('id="trophiesList"');
    expect(main).not.toContain("toCollection");
    expect(main).not.toContain("openCollection");
    expect(main).not.toContain("collectionTabs");
    expect(main).not.toContain("collectionGrid");
    expect(main).not.toContain("COLLECTION_TABS");
    expect(main).not.toContain("AVATARS");
    expect(main).not.toContain("BOARDS");
    expect(meta).not.toContain("COLLECTION_TABS");
    expect(meta).not.toContain("collectionHtml");
  });

  it("renders locked and unlocked trophies from existing achievement data", () => {
    const locked = trophiesHtml(EMPTY_PROGRESS);
    expect(locked).toContain('data-id="first_victory"');
    expect(locked).toContain("FIRST VICTORY");
    expect(locked).toContain("Win a match.");
    expect(locked).toContain("trophy-card lock");
    expect(locked).toContain("LOCKED");
    expect(locked).not.toContain("UNLOCKED");
    expect((locked.match(/trophy-card/g) ?? []).length).toBe(9);

    const unlocked = trophiesHtml({ ...EMPTY_PROGRESS, unlocked: [...EMPTY_PROGRESS.unlocked, "first_victory"] });
    expect(unlocked).toContain('class="trophy-card on"');
    expect(unlocked).toContain("UNLOCKED");
    expect(unlocked).toContain("trophy-card lock");
    expect(unlocked).toContain("LOCKED");
    expect(unlocked).toContain("Reach COMBO x5 in one match.");
  });

  it("styles trophies as a premium Chrono Clash screen", () => {
    expect(polish).toContain("html #app #trophies.screen");
    expect(polish).toContain("html #app #trophies .trophy-card.on");
    expect(polish).toContain("html #app #trophies .trophy-card.lock");
    expect(polish).toContain("html #app #trophies #trophiesBack.primary");
    expect(polish).not.toContain("#collection");
    expect(polish).not.toContain("collect-tab");
    expect(polish).not.toContain("collect-card");
    expect(polish).not.toContain("session.equip");
    expect(polish).not.toContain("isOwned(");
  });
});
