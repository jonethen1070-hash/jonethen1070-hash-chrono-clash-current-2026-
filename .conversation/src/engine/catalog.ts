import { GameMode, LocalProgress, SCORE_TARGET } from "./types";

export type CosmeticKind = "avatar" | "frame" | "board" | "tile" | "title" | "badge" | "vfx";

export type UnlockRule =
  | { type: "default" }
  | { type: "achievement"; id: string }
  | { type: "level"; level: number };

export interface Cosmetic {
  id: string;
  kind: CosmeticKind;
  name: string;
  detail: string;
  glyph?: string;
  index?: number;
  unlock: UnlockRule;
}

export const AVATAR_GLYPHS = ["◈", "◇", "◆", "✦", "✧", "★"] as const;

export const CATALOG: Cosmetic[] = [
  { id: "avatar-0", kind: "avatar", name: "Pulse", detail: "Starter mark.", glyph: "◈", index: 0, unlock: { type: "default" } },
  { id: "avatar-1", kind: "avatar", name: "Ion", detail: "Starter mark.", glyph: "◇", index: 1, unlock: { type: "default" } },
  { id: "avatar-2", kind: "avatar", name: "Aether", detail: "Starter mark.", glyph: "◆", index: 2, unlock: { type: "default" } },
  { id: "avatar-3", kind: "avatar", name: "Ember", detail: "Reach level 2.", glyph: "✦", index: 3, unlock: { type: "level", level: 2 } },
  { id: "avatar-4", kind: "avatar", name: "Nova", detail: "Win a match.", glyph: "✧", index: 4, unlock: { type: "achievement", id: "first_victory" } },
  { id: "avatar-5", kind: "avatar", name: "Solar", detail: "Reach COMBO x5.", glyph: "★", index: 5, unlock: { type: "achievement", id: "combo_master" } },

  { id: "frame-pulse", kind: "frame", name: "Pulse Ring", detail: "Starter frame.", unlock: { type: "default" } },
  { id: "frame-gold", kind: "frame", name: "Gold Halo", detail: "First victory.", unlock: { type: "achievement", id: "first_victory" } },
  { id: "frame-nova", kind: "frame", name: "Nova Frame", detail: "Win by double score.", unlock: { type: "achievement", id: "perfect_run" } },

  { id: "void", kind: "board", name: "Void Glass", detail: "Starter board.", unlock: { type: "default" } },
  { id: "ember", kind: "board", name: "Ember Grid", detail: "Win a Score Clash.", unlock: { type: "achievement", id: "chrono_warrior" } },
  { id: "aurora", kind: "board", name: "Aurora Plate", detail: "Use every Chrono Power.", unlock: { type: "achievement", id: "power_user" } },

  { id: "lumen", kind: "tile", name: "Lumen Gems", detail: "Starter gems.", unlock: { type: "default" } },
  { id: "prism", kind: "tile", name: "Prism Gems", detail: "Reach COMBO x5.", unlock: { type: "achievement", id: "combo_master" } },
  { id: "ion", kind: "tile", name: "Ion Gems", detail: "Score 5,000 in one match.", unlock: { type: "achievement", id: "high_score" } },

  { id: "NEWCOMER", kind: "title", name: "NEWCOMER", detail: "Starter title.", unlock: { type: "default" } },
  { id: "TIME LORD", kind: "title", name: "TIME LORD", detail: "Win a Time Clash.", unlock: { type: "achievement", id: "time_lord" } },
  { id: "VETERAN", kind: "title", name: "VETERAN", detail: "Play 10 matches.", unlock: { type: "achievement", id: "matches_10" } },
  { id: "UNBROKEN", kind: "title", name: "UNBROKEN", detail: "Win 5 in a row.", unlock: { type: "achievement", id: "streak_5" } },
  { id: "ACE", kind: "title", name: "ACE", detail: "Reach level 5.", unlock: { type: "level", level: 5 } },

  { id: "core", kind: "vfx", name: "Core Sparks", detail: "Starter impact FX.", unlock: { type: "default" } },
  { id: "ember-fx", kind: "vfx", name: "Ember Burst", detail: "Win a Score Clash.", unlock: { type: "achievement", id: "chrono_warrior" } },
  { id: "aurora-fx", kind: "vfx", name: "Aurora Wake", detail: "Use every Chrono Power.", unlock: { type: "achievement", id: "power_user" } },
  { id: "nova-fx", kind: "vfx", name: "Nova Flare", detail: "Reach level 4.", unlock: { type: "level", level: 4 } },

  { id: "badge-first_victory", kind: "badge", name: "First Victory", detail: "Won a match.", unlock: { type: "achievement", id: "first_victory" } },
  { id: "badge-combo_master", kind: "badge", name: "Combo Master", detail: "Hit COMBO x5.", unlock: { type: "achievement", id: "combo_master" } },
  { id: "badge-time_lord", kind: "badge", name: "Time Lord", detail: "Won Time Clash.", unlock: { type: "achievement", id: "time_lord" } },
  { id: "badge-chrono_warrior", kind: "badge", name: "Chrono Warrior", detail: "Won Score Clash.", unlock: { type: "achievement", id: "chrono_warrior" } },
  { id: "badge-perfect_run", kind: "badge", name: "Perfect Run", detail: "Won by double score.", unlock: { type: "achievement", id: "perfect_run" } },
  { id: "badge-matches_10", kind: "badge", name: "Ten Matches", detail: "Played 10 battles.", unlock: { type: "achievement", id: "matches_10" } },
  { id: "badge-streak_5", kind: "badge", name: "Unbroken", detail: "5-win streak.", unlock: { type: "achievement", id: "streak_5" } },
  { id: "badge-high_score", kind: "badge", name: "High Score", detail: "Scored 5,000.", unlock: { type: "achievement", id: "high_score" } },
  { id: "badge-power_user", kind: "badge", name: "Power User", detail: "Used all Chrono Powers.", unlock: { type: "achievement", id: "power_user" } },
];

export const GAME_MODES: Record<
  GameMode,
  { id: GameMode; name: string; tag: string; detail: string; target: number }
> = {
  time: {
    id: "time",
    name: "TIME BATTLE",
    tag: "60 SECONDS",
    detail: "Both players play at once. Highest score when time reaches zero wins.",
    target: 60,
  },
  score: {
    id: "score",
    name: "SCORE BATTLE",
    tag: `FIRST TO ${SCORE_TARGET.toLocaleString()}`,
    detail: "Both players play at once. First to the target score wins immediately.",
    target: SCORE_TARGET,
  },
};

export function cosmeticById(id: string): Cosmetic | undefined {
  return CATALOG.find((c) => c.id === id);
}

export function cosmeticsOf(kind: CosmeticKind): Cosmetic[] {
  return CATALOG.filter((c) => c.kind === kind);
}

export function isOwned(progress: LocalProgress, id: string): boolean {
  const item = cosmeticById(id);
  if (!item) return progress.unlocked.includes(id);
  if (item.unlock.type === "default") return true;
  if (progress.unlocked.includes(id)) return true;
  if (item.unlock.type === "level") return progress.level >= item.unlock.level;
  if (item.unlock.type === "achievement") {
    return progress.unlocked.includes(item.unlock.id) || progress.unlocked.includes(`badge-${item.unlock.id}`);
  }
  return false;
}

export function cosmeticsUnlockedAtLevel(level: number): string[] {
  return CATALOG.filter((c) => c.unlock.type === "level" && level >= c.unlock.level).map((c) => c.id);
}

export function avatarGlyph(index: number): string {
  return AVATAR_GLYPHS[index] ?? AVATAR_GLYPHS[0];
}

export function modeInfo(mode: GameMode, target = SCORE_TARGET) {
  if (mode === "score") {
    return {
      ...GAME_MODES.score,
      tag: `FIRST TO ${target.toLocaleString()}`,
      target,
    };
  }
  return GAME_MODES.time;
}
