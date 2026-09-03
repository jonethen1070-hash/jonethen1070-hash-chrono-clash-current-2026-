/**
 * DEVELOPMENT / TEST-ONLY local battle entry.
 *
 * The real 0-life block is not persisted lives text. It is the GAME MODES
 * gate: paintDailyRun() sets #modeTime / #modeScore disabled + .off, and
 * CSS pointer-events:none plus native disabled buttons swallow taps.
 * chooseMode / startMatch / playAgain also refuse canStartDailyRun().
 *
 * THIS FLAG OVERRIDES THAT GATE in any app build of this branch, including
 * production-compiled Android / WebView / Render hosts. Vitest stays off
 * so production lives tests keep their real 3/3 behavior.
 *
 * Set DEV_BATTLE_BYPASS_ALLOWED to false (or delete this file) before shipping.
 *
 * Does not restore lives, change rewarded ads, grant coins/XP, fake ads,
 * or bypass the online 1v1 lives gate.
 */

/// <reference types="vite/client" />

export const DEV_BATTLE_STORAGE_KEY = "chrono-clash-dev-battle";
export const DEV_BATTLE_QUERY = "devBattle";

/** Instant kill switch. Set false to disable without hunting call sites. */
export const DEV_BATTLE_BYPASS_ALLOWED = true;

let testOverride: boolean | null = null;

type ViteEnv = { DEV?: boolean; MODE?: string };

function viteEnv(): ViteEnv {
  try {
    return (import.meta as ImportMeta & { env?: ViteEnv }).env ?? {};
  } catch {
    return {};
  }
}

function readExplicitFlag(): boolean {
  try {
    const loc = (globalThis as { location?: { search?: string } }).location;
    const params = new URLSearchParams(loc?.search ?? "");
    const query = params.get(DEV_BATTLE_QUERY);
    if (query === "1" || query === "true") return true;
    const store = (globalThis as { localStorage?: Storage }).localStorage;
    if (store?.getItem(DEV_BATTLE_STORAGE_KEY) === "1") return true;
  } catch {
    /* ignore missing DOM / storage */
  }
  return false;
}

export function resolveDevBattleBypass(opts: {
  allowed: boolean;
  mode?: string;
  explicit?: boolean;
  testOverride?: boolean | null;
}): boolean {
  if (opts.testOverride === true) return true;
  if (opts.testOverride === false) return false;
  if (!opts.allowed) return false;
  if (opts.mode === "test") return Boolean(opts.explicit);
  return true;
}

/** Vitest helper. Pass null to restore default (off in test mode). */
export function setDevBattleBypassForTests(enabled: boolean | null): void {
  testOverride = enabled;
}

export function isDevBattleBypassEnabled(): boolean {
  return resolveDevBattleBypass({
    allowed: DEV_BATTLE_BYPASS_ALLOWED,
    mode: viteEnv().MODE,
    explicit: readExplicitFlag(),
    testOverride,
  });
}

export function canEnterLocalBattle(lives: number): boolean {
  if (lives > 0) return true;
  return isDevBattleBypassEnabled();
}
