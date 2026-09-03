import { AuthProvider, Platform, PROVIDERS_BY_PLATFORM, PublicAuthConfig } from "../server/types";

const GUEST_KEY = "chrono-clash-guest-token";
const SESSION_KEY = "chrono-clash-online-session";

export function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "web";
  const ua = navigator.userAgent || "";
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "web";
}

export function guestDeviceToken(): string {
  try {
    const store = localStorage;
    const hit = store.getItem(GUEST_KEY);
    if (hit) return hit;
    const next = `dev-${crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`}`;
    store.setItem(GUEST_KEY, next);
    return next;
  } catch {
    return `dev-${Date.now()}`;
  }
}

export function saveOnlineSession(token: string, playerId: string): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ token, playerId }));
  } catch {
    /* ignore */
  }
}

export function loadOnlineSession(): { token: string; playerId: string } | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { token?: string; playerId?: string };
    if (!parsed.token || !parsed.playerId) return null;
    return { token: parsed.token, playerId: parsed.playerId };
  } catch {
    return null;
  }
}

export function clearOnlineSession(): void {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

export function visibleAuthProviders(config: PublicAuthConfig | null, platform: Platform): AuthProvider[] {
  const allowed = PROVIDERS_BY_PLATFORM[platform] || PROVIDERS_BY_PLATFORM.web;
  const out: AuthProvider[] = [];
  if (config?.google.enabled && allowed.includes("google")) out.push("google");
  if (config?.apple.enabled && allowed.includes("apple")) out.push("apple");
  if (config?.facebook.enabled && allowed.includes("facebook")) out.push("facebook");
  if ((!config || config.guest) && allowed.includes("guest")) out.push("guest");
  return out;
}
