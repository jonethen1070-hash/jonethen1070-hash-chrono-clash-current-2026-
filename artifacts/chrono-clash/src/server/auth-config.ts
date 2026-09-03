import { readFileSync } from "node:fs";
import { AuthMode, PublicAuthConfig } from "./types";

export class AuthError extends Error {
  status = 400;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export type FetchLike = (url: string, init?: { headers?: Record<string, string> }) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
}>;

export interface AuthRuntimeConfig {
  mode: AuthMode;
  allowGuest: boolean;
  allowDevAuth: boolean;
  sessionTtlMs: number;
  maxSessions: number;
  googleClientIds: string[];
  googleWebClientId: string;
  googleRedirectUri: string;
  appleClientIds: string[];
  appleWebClientId: string;
  appleRedirectUri: string;
  facebookAppId: string;
  facebookAppSecret: string;
  fetchImpl: FetchLike;
}

export const DEFAULT_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const DEFAULT_MAX_SESSIONS = 8;

type EnvMap = Record<string, string | undefined>;

function flag(env: EnvMap, name: string, fallback: boolean): boolean {
  const raw = env[name];
  if (raw === "1" || raw === "true") return true;
  if (raw === "0" || raw === "false") return false;
  return fallback;
}

function num(env: EnvMap, name: string, fallback: number): number {
  const raw = Number(env[name]);
  return Number.isFinite(raw) && raw > 0 ? raw : fallback;
}

function csv(env: EnvMap, ...names: string[]): string[] {
  const out: string[] = [];
  for (const name of names) {
    const raw = (env[name] || "").trim();
    if (!raw) continue;
    for (const part of raw.split(",")) {
      const id = part.trim();
      if (id && !out.includes(id)) out.push(id);
    }
  }
  return out;
}

export function loadAuthConfig(env: EnvMap = process.env, overrides: Partial<AuthRuntimeConfig> = {}): AuthRuntimeConfig {
  const production = env.CHRONO_AUTH_MODE === "production";
  const mode: AuthMode = overrides.mode || (production ? "production" : "development");
  const testRun = env.VITEST === "true" || env.NODE_ENV === "test";
  const allowDevAuth = mode === "production" ? false : overrides.allowDevAuth ?? flag(env, "CHRONO_ALLOW_DEV_AUTH", testRun);
  const googleClientIds = overrides.googleClientIds ?? csv(env, "GOOGLE_CLIENT_ID", "GOOGLE_ANDROID_CLIENT_ID", "GOOGLE_IOS_CLIENT_ID");
  const appleClientIds = overrides.appleClientIds ?? csv(env, "APPLE_CLIENT_ID", "APPLE_IOS_CLIENT_ID");
  const facebookAppId = overrides.facebookAppId ?? (env.FACEBOOK_APP_ID || "").trim();
  const facebookAppSecret = overrides.facebookAppSecret ?? (env.FACEBOOK_APP_SECRET || "").trim();
  const hasProviderCreds =
    googleClientIds.length > 0 || appleClientIds.length > 0 || Boolean(facebookAppId && facebookAppSecret);
  const allowGuest = overrides.allowGuest ?? flag(env, "CHRONO_ALLOW_GUEST", !hasProviderCreds || mode !== "production");
  return {
    mode,
    allowGuest,
    allowDevAuth,
    sessionTtlMs: overrides.sessionTtlMs ?? num(env, "CHRONO_SESSION_TTL_MS", DEFAULT_SESSION_TTL_MS),
    maxSessions: overrides.maxSessions ?? Math.max(1, Math.floor(num(env, "CHRONO_MAX_SESSIONS", DEFAULT_MAX_SESSIONS))),
    googleClientIds,
    googleWebClientId:
      overrides.googleWebClientId ?? ((env.GOOGLE_CLIENT_ID || "").trim() || (overrides.googleClientIds?.[0] ?? "")),
    googleRedirectUri: overrides.googleRedirectUri ?? (env.GOOGLE_REDIRECT_URI || "").trim(),
    appleClientIds,
    appleWebClientId:
      overrides.appleWebClientId ?? ((env.APPLE_CLIENT_ID || "").trim() || (overrides.appleClientIds?.[0] ?? "")),
    appleRedirectUri: overrides.appleRedirectUri ?? (env.APPLE_REDIRECT_URI || "").trim(),
    facebookAppId,
    facebookAppSecret,
    fetchImpl: overrides.fetchImpl ?? ((url, init) => fetch(url, init)),
  };
}

export function publicAuthConfig(cfg: AuthRuntimeConfig): PublicAuthConfig {
  return {
    mode: cfg.mode,
    guest: cfg.allowGuest,
    google: {
      enabled: Boolean(cfg.googleWebClientId) || cfg.googleClientIds.length > 0,
      clientId: cfg.googleWebClientId,
      redirectUri: cfg.googleRedirectUri,
    },
    apple: {
      enabled: Boolean(cfg.appleWebClientId) || cfg.appleClientIds.length > 0,
      clientId: cfg.appleWebClientId,
      redirectUri: cfg.appleRedirectUri,
    },
    facebook: { enabled: Boolean(cfg.facebookAppId && cfg.facebookAppSecret), appId: cfg.facebookAppId },
  };
}

export function authStatusLine(cfg: AuthRuntimeConfig): string {
  return `auth mode=${cfg.mode} guest=${cfg.allowGuest ? "on" : "off"} google=${cfg.googleClientIds.length ? "on" : "off"} apple=${cfg.appleClientIds.length ? "on" : "off"} facebook=${cfg.facebookAppId && cfg.facebookAppSecret ? "on" : "off"}`;
}

export function assertProductionAuth(cfg: AuthRuntimeConfig): void {
  if (cfg.mode !== "production") return;
  if (!cfg.googleWebClientId && cfg.googleClientIds.length === 0) {
    throw new Error("Production authentication requires GOOGLE_CLIENT_ID.");
  }
}

export function applyDotEnv(path = ".env", env: EnvMap = process.env): void {
  let text = "";
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return;
  }
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (env[key] === undefined) env[key] = value;
  }
}
