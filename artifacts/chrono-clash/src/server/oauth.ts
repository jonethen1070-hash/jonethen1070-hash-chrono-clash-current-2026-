import { createPublicKey, verify } from "node:crypto";
import { AuthError, AuthRuntimeConfig, FetchLike } from "./auth-config";
import { AuthProvider } from "./types";

export interface VerifiedIdentity {
  provider: AuthProvider;
  subject: string;
  name: string;
}

interface JwtPayload {
  iss?: string;
  aud?: string | string[];
  exp?: number;
  nbf?: number;
  sub?: string;
  user_id?: string;
  name?: string;
  email?: string;
}

interface Jwk {
  kid?: string;
  kty?: string;
  n?: string;
  e?: string;
}

const jwksCache = new Map<string, { at: number; keys: Jwk[] }>();
const JWKS_TTL_MS = 60 * 60 * 1000;

export function resetJwksCache(): void {
  jwksCache.clear();
}

export async function verifyProviderToken(
  provider: Exclude<AuthProvider, "guest">,
  token: string,
  cfg: AuthRuntimeConfig,
): Promise<VerifiedIdentity> {
  if (provider === "google") return verifyGoogle(token, cfg);
  if (provider === "apple") return verifyApple(token, cfg);
  return verifyFacebook(token, cfg);
}

async function verifyGoogle(token: string, cfg: AuthRuntimeConfig): Promise<VerifiedIdentity> {
  if (!cfg.googleClientIds.length) throw new AuthError("Google Sign-In is not configured", 503);
  const claims = await verifyJwt(token, {
    issuer: ["accounts.google.com", "https://accounts.google.com"],
    audience: cfg.googleClientIds,
    jwksUrl: "https://www.googleapis.com/oauth2/v3/certs",
    fetchImpl: cfg.fetchImpl,
  });
  const sub = claims.sub || claims.user_id;
  if (!sub) throw new AuthError("Google token is missing subject", 401);
  return { provider: "google", subject: `google:${sub}`, name: pickName(claims.name, claims.email, "GOOGLE PILOT") };
}

async function verifyApple(token: string, cfg: AuthRuntimeConfig): Promise<VerifiedIdentity> {
  if (!cfg.appleClientIds.length) throw new AuthError("Apple Sign-In is not configured", 503);
  const claims = await verifyJwt(token, {
    issuer: ["https://appleid.apple.com"],
    audience: cfg.appleClientIds,
    jwksUrl: "https://appleid.apple.com/auth/keys",
    fetchImpl: cfg.fetchImpl,
  });
  if (!claims.sub) throw new AuthError("Apple token is missing subject", 401);
  return { provider: "apple", subject: `apple:${claims.sub}`, name: pickName(claims.name, claims.email, "APPLE PILOT") };
}

async function verifyFacebook(token: string, cfg: AuthRuntimeConfig): Promise<VerifiedIdentity> {
  if (!cfg.facebookAppId || !cfg.facebookAppSecret) throw new AuthError("Facebook Login is not configured", 503);
  const appToken = `${cfg.facebookAppId}|${cfg.facebookAppSecret}`;
  const debugUrl = `https://graph.facebook.com/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(appToken)}`;
  const debug = (await getJson(cfg.fetchImpl, debugUrl)) as {
    data?: { is_valid?: boolean; app_id?: string; user_id?: string };
    error?: { message?: string };
  };
  if (debug.error?.message) throw new AuthError(`Facebook token rejected: ${debug.error.message}`, 401);
  const data = debug.data;
  if (!data?.is_valid || data.app_id !== cfg.facebookAppId || !data.user_id) {
    throw new AuthError("Facebook token is not valid for this app", 401);
  }
  let name = "FACEBOOK PILOT";
  try {
    const me = (await getJson(
      cfg.fetchImpl,
      `https://graph.facebook.com/me?fields=id,name&access_token=${encodeURIComponent(token)}`,
    )) as { name?: string };
    if (me.name) name = me.name;
  } catch {
    /* optional */
  }
  return { provider: "facebook", subject: `facebook:${data.user_id}`, name: name.slice(0, 16) };
}

export async function verifyJwt(
  token: string,
  opts: { issuer: string[]; audience: string[]; jwksUrl: string; fetchImpl: FetchLike; now?: number },
): Promise<JwtPayload> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new AuthError("identity token must be a signed JWT", 401);
  let header: { alg?: string; kid?: string };
  let payload: JwtPayload;
  try {
    header = JSON.parse(utf8(b64urlDecode(parts[0]!))) as typeof header;
    payload = JSON.parse(utf8(b64urlDecode(parts[1]!))) as JwtPayload;
  } catch {
    throw new AuthError("identity token is malformed", 401);
  }
  if (header.alg !== "RS256") throw new AuthError("identity token algorithm is not RS256", 401);
  const keys = await loadJwks(opts.jwksUrl, opts.fetchImpl);
  const jwk = keys.find((key) => !header.kid || key.kid === header.kid) || keys[0];
  if (!jwk?.n || !jwk.e) throw new AuthError("identity token signing key was not found", 401);
  const signed = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
  const signature = b64urlDecode(parts[2]!);
  const key = createPublicKey({ key: { kty: "RSA", n: jwk.n, e: jwk.e }, format: "jwk" });
  if (!verify("RSA-SHA256", signed, key, signature)) throw new AuthError("identity token signature is invalid", 401);
  const now = Math.floor((opts.now ?? Date.now()) / 1000);
  if (payload.exp != null && now > payload.exp + 60) throw new AuthError("identity token has expired", 401);
  if (payload.nbf != null && now + 60 < payload.nbf) throw new AuthError("identity token is not yet valid", 401);
  if (!payload.iss || !opts.issuer.includes(payload.iss)) throw new AuthError("identity token issuer is invalid", 401);
  const audience = Array.isArray(payload.aud) ? payload.aud : payload.aud ? [payload.aud] : [];
  if (!audience.some((aud) => opts.audience.includes(aud))) throw new AuthError("identity token audience is invalid", 401);
  return payload;
}

async function loadJwks(url: string, fetchImpl: FetchLike): Promise<Jwk[]> {
  const hit = jwksCache.get(url);
  if (hit && Date.now() - hit.at < JWKS_TTL_MS) return hit.keys;
  const json = (await getJson(fetchImpl, url)) as { keys?: Jwk[] };
  const keys = json.keys || [];
  if (!keys.length) throw new AuthError("provider signing keys were empty", 502);
  jwksCache.set(url, { at: Date.now(), keys });
  return keys;
}

async function getJson(fetchImpl: FetchLike, url: string): Promise<unknown> {
  let res: { ok: boolean; status: number; json(): Promise<unknown>; text(): Promise<string> };
  try {
    res = await fetchImpl(url);
  } catch {
    throw new AuthError("could not reach identity provider", 502);
  }
  if (!res.ok) throw new AuthError(`identity provider returned ${res.status}`, 502);
  return res.json();
}

function pickName(name: string | undefined, email: string | undefined, fallback: string): string {
  return (name || email || fallback).trim().slice(0, 16);
}

function utf8(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

function b64urlDecode(chunk: string): Uint8Array {
  const pad = chunk.length % 4 === 0 ? "" : "=".repeat(4 - (chunk.length % 4));
  const b64 = chunk.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
