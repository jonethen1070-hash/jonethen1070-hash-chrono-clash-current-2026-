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
  if (!["google", "facebook", "apple", "guest"].includes(provider)) throw new AuthError("unknown provider");
  if (!PROVIDERS_BY_PLATFORM[platform].includes(provider)) {
    throw new AuthError(`${provider} sign-in is not available on ${platform}`, 403);
  }
  const token = (req.token || "").trim();
  if (provider === "guest") {
    if (!cfg.allowGuest) throw new AuthError("guest sign-in is disabled", 403);
    if (!token) throw new AuthError("guest requires a device token");
    return { platform, provider, subject: `guest:${token}`, name: clipName(req.displayName, "GUEST PILOT") };
  }
  if (token.startsWith("dev:")) {
    if (!cfg.allowDevAuth) throw new AuthError("development identity tokens are disabled", 401);
    return { platform, provider, subject: `${provider}:${token.slice(4)}`, name: clipName(req.displayName, "PILOT") };
  }
  if (!token) throw new AuthError(`${provider} requires a provider identity token`);
  const verified = await verifyProviderToken(provider, token, cfg);
  return { platform, provider, subject: verified.subject, name: clipName(req.displayName, verified.name) };
}

function clipName(name: string | undefined, fallback: string): string {
  return (name || fallback).trim().slice(0, 16);
}
