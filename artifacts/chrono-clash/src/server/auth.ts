import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { AuthError, AuthRuntimeConfig, loadAuthConfig } from "./auth-config";
import { verifyProviderToken } from "./oauth";
import { AuthProvider, AuthRequest, Platform, PROVIDERS_BY_PLATFORM } from "./types";

export { AuthError };

export async function verifyAuth(
  req: AuthRequest,
  cfg: AuthRuntimeConfig = loadAuthConfig(),
): Promise<{ platform: Platform; provider: AuthProvider; subject: string; name: string }> {
  const platform = req.platform;
  const provider = req.provider;
  if (!PROVIDERS_BY_PLATFORM[platform]) throw new AuthError("unknown platform");
  if (!["google", "facebook", "apple", "email", "guest"].includes(provider)) throw new AuthError("unknown provider");
  if (!PROVIDERS_BY_PLATFORM[platform].includes(provider)) {
    throw new AuthError(`${provider} sign-in is not available on ${platform}`, 403);
  }
  const token = (req.token || "").trim();
  if (provider === "guest") {
    if (!cfg.allowGuest) throw new AuthError("guest sign-in is disabled", 403);
    if (!token) throw new AuthError("guest requires a device token");
    return { platform, provider, subject: `guest:${token}`, name: clipName(req.displayName, "GUEST PILOT") };
  }
  if (provider === "email") {
    if (!cfg.allowEmail) throw new AuthError("email sign-in is unavailable right now", 503);
    const { email } = validateEmailCredentials(req);
    return {
      platform,
      provider,
      subject: `email:${email}`,
      name: clipName(req.displayName, email.split("@")[0] || "EMAIL PILOT"),
    };
  }
  if (token.startsWith("dev:")) {
    if (!cfg.allowDevAuth) throw new AuthError("development identity tokens are disabled", 401);
    return { platform, provider, subject: `${provider}:${token.slice(4)}`, name: clipName(req.displayName, "PILOT") };
  }
  if (!token) throw new AuthError(`${provider} requires a provider identity token`);
  const verified = await verifyProviderToken(provider, token, cfg);
  return { platform, provider, subject: verified.subject, name: clipName(req.displayName, verified.name) };
}

export function normalizeEmail(email: string | undefined): string {
  return (typeof email === "string" ? email : "").trim().toLowerCase();
}

export function validateEmailCredentials(req: AuthRequest): { email: string; password: string } {
  const email = normalizeEmail(req.email);
  const password = typeof req.password === "string" ? req.password : "";
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    throw new AuthError("enter a valid email address");
  }
  if (password.length < 8) throw new AuthError("password must be at least 8 characters");
  if (password.length > 128) throw new AuthError("password must be 128 characters or fewer");
  return { email, password };
}

export function hashEmailPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `${salt.toString("base64url")}:${hash.toString("base64url")}`;
}

export function verifyEmailPassword(password: string, encoded: string): boolean {
  const [saltEncoded, hashEncoded] = encoded.split(":");
  if (!saltEncoded || !hashEncoded) return false;
  try {
    const salt = Buffer.from(saltEncoded, "base64url");
    const expected = Buffer.from(hashEncoded, "base64url");
    const actual = scryptSync(password, salt, expected.length);
    return expected.length > 0 && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

function clipName(name: string | undefined, fallback: string): string {
  return (name || fallback).trim().slice(0, 16);
}
