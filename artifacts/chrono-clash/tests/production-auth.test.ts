import { createPublicKey, createSign, generateKeyPairSync } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { ChronoClient } from "../src/net/client";
import { clearOnlineSession, loadOnlineSession, visibleAuthProviders } from "../src/net/identity";
import { assertProductionAuth, loadAuthConfig, publicAuthConfig } from "../src/server/auth-config";
import { ChronoClashServer } from "../src/server/core";
import { routeServer } from "../src/server/http";
import { listenChronoHttp } from "../src/server/listen";
import { resetJwksCache } from "../src/server/oauth";

const WEB_CLIENT_ID = "397661440640-rlaj9s1k3orv17fu5vn8fknls1gakt09.apps.googleusercontent.com";
const PREVIEW_ORIGIN = "https://situations-tone-geo-samba.trycloudflare.com";

function b64url(data: Buffer | string): string {
  return Buffer.from(data).toString("base64url");
}

function signRs256(privateKey: string, payload: Record<string, unknown>): string {
  const header = b64url(JSON.stringify({ alg: "RS256", kid: "prod-google", typ: "JWT" }));
  const body = b64url(JSON.stringify(payload));
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${body}`);
  return `${header}.${body}.${signer.sign(privateKey).toString("base64url")}`;
}

function rsaJwk(publicKeyPem: string) {
  const jwk = createPublicKey(publicKeyPem).export({ format: "jwk" }) as { n?: string; e?: string };
  return { kid: "prod-google", kty: "RSA", n: jwk.n, e: jwk.e, alg: "RS256", use: "sig" };
}

function installMemoryStorage() {
  const mem = new Map<string, string>();
  const storage = {
    getItem(key: string) {
      return mem.has(key) ? mem.get(key)! : null;
    },
    setItem(key: string, value: string) {
      mem.set(key, value);
    },
    removeItem(key: string) {
      mem.delete(key);
    },
  };
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });
  return mem;
}

function googleGame(ttl = 30 * 24 * 60 * 60 * 1000) {
  resetJwksCache();
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const pemPriv = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const pemPub = publicKey.export({ type: "spki", format: "pem" }).toString();
  const now = Math.floor(Date.now() / 1000);
  const token = signRs256(pemPriv, {
    iss: "https://accounts.google.com",
    aud: WEB_CLIENT_ID,
    exp: now + 3600,
    sub: "prod-google-sub",
    name: "Google Pilot",
  });
  const game = new ChronoClashServer({
    dbPath: ":memory:",
    auth: {
      mode: "production",
      allowGuest: false,
      allowDevAuth: false,
      sessionTtlMs: ttl,
      googleClientIds: [WEB_CLIENT_ID],
      googleWebClientId: WEB_CLIENT_ID,
      googleRedirectUri: PREVIEW_ORIGIN,
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        json: async () => ({ keys: [rsaJwk(pemPub)] }),
        text: async () => "",
      }),
    },
  });
  return { game, token };
}

describe("production authentication readiness", () => {
  afterEach(() => {
    clearOnlineSession();
  });

  it("loads production from env vars and never publishes secrets", () => {
    const cfg = loadAuthConfig({
      CHRONO_AUTH_MODE: "production",
      GOOGLE_CLIENT_ID: WEB_CLIENT_ID,
      GOOGLE_REDIRECT_URI: PREVIEW_ORIGIN,
      GOOGLE_CLIENT_SECRET: "must-never-leak",
      FACEBOOK_APP_SECRET: "facebook-secret",
    });
    expect(cfg.mode).toBe("production");
    expect(cfg.allowGuest).toBe(false);
    expect(cfg.allowDevAuth).toBe(false);
    expect(cfg.googleWebClientId).toBe(WEB_CLIENT_ID);
    expect(cfg.googleRedirectUri).toBe(PREVIEW_ORIGIN);
    const pub = publicAuthConfig(cfg);
    expect(pub.google.clientId).toBe(WEB_CLIENT_ID);
    expect(pub.google.redirectUri).toBe(PREVIEW_ORIGIN);
    expect(pub.guest).toBe(false);
    expect(JSON.stringify(pub)).not.toContain("must-never-leak");
    expect(JSON.stringify(pub)).not.toContain("facebook-secret");
    expect(JSON.stringify(pub)).not.toMatch(/CLIENT_SECRET|client_secret|appSecret/);
    expect(visibleAuthProviders(pub, "ios")).toEqual(["google"]);
    expect(() => assertProductionAuth(cfg)).not.toThrow();
  });

  it("refuses to start production without the existing Web client ID", () => {
    const cfg = loadAuthConfig({ CHRONO_AUTH_MODE: "production" });
    expect(() => assertProductionAuth(cfg)).toThrow(/GOOGLE_CLIENT_ID/);
  });

  it("starts the Render guest test without GOOGLE_CLIENT_ID when NODE_ENV is production", () => {
    const cfg = loadAuthConfig({
      NODE_ENV: "production",
      CHRONO_AUTH_MODE: "development",
      CHRONO_ALLOW_GUEST: "1",
    });
    expect(cfg.mode).toBe("development");
    expect(cfg.allowGuest).toBe(true);
    expect(cfg.googleClientIds).toEqual([]);
    expect(cfg.googleWebClientId).toBe("");
    expect(() => assertProductionAuth(cfg)).not.toThrow();
    const pub = publicAuthConfig(cfg);
    expect(pub.guest).toBe(true);
    expect(pub.google.enabled).toBe(false);
  });

  it("restores Player ID after a refresh via /v1/me", async () => {
    installMemoryStorage();
    const { game, token } = googleGame();
    const handle = await listenChronoHttp(game, 0, "127.0.0.1");
    const client = new ChronoClient(`http://127.0.0.1:${handle.port}`);
    const signed = await client.signIn({ platform: "web", provider: "google", token });
    expect(signed.player.playerId.startsWith("cc_")).toBe(true);
    const saved = loadOnlineSession();
    expect(saved?.playerId).toBe(signed.player.playerId);

    const refreshed = new ChronoClient(`http://127.0.0.1:${handle.port}`);
    expect(refreshed.restore()?.playerId).toBe(signed.player.playerId);
    const me = await refreshed.me();
    expect(me.playerId).toBe(signed.player.playerId);
    expect(me.provider).toBe("google");
    await handle.close();
    game.close();
  });

  it("SIGN OUT revokes the server session and clears local storage", async () => {
    installMemoryStorage();
    const { game, token } = googleGame();
    const created = await routeServer(game, {
      method: "POST",
      path: "/v1/auth",
      query: {},
      headers: {},
      body: { platform: "ios", provider: "google", token },
    });
    const sessionToken = (created.body as { sessionToken: string }).sessionToken;
    const handle = await listenChronoHttp(game, 0, "127.0.0.1");
    const client = new ChronoClient(`http://127.0.0.1:${handle.port}`);
    client.token = sessionToken;
    const playerId = (created.body as { player: { playerId: string } }).player.playerId;
    const { saveOnlineSession } = await import("../src/net/identity");
    saveOnlineSession(sessionToken, playerId);
    await client.signOut();
    expect(client.token).toBe("");
    expect(client.player).toBeNull();
    expect(loadOnlineSession()).toBeNull();
    const me = await routeServer(game, {
      method: "GET",
      path: "/v1/me",
      query: {},
      headers: { authorization: `Bearer ${sessionToken}` },
      body: null,
    });
    expect(me.status).toBe(401);
    await handle.close();
    game.close();
  });

  it("rejects missing, invalid, and expired sessions for /v1/me and ONLINE 1v1 match start", async () => {
    const { game, token } = googleGame(25);
    const created = await routeServer(game, {
      method: "POST",
      path: "/v1/auth",
      query: {},
      headers: {},
      body: { platform: "web", provider: "google", token },
    });
    const sessionToken = (created.body as { sessionToken: string }).sessionToken;
    const playerId = (created.body as { player: { playerId: string } }).player.playerId;

    const missing = await routeServer(game, {
      method: "POST",
      path: "/v1/match",
      query: {},
      headers: {},
      body: {},
    });
    expect(missing.status).toBe(401);
    expect((missing.body as { error: string }).error).toMatch(/sign in required/i);

    const invalid = await routeServer(game, {
      method: "POST",
      path: "/v1/match",
      query: {},
      headers: { authorization: "Bearer not-a-session" },
      body: {},
    });
    expect(invalid.status).toBe(401);
    expect((invalid.body as { error: string }).error).toMatch(/invalid session/i);

    const queued = await routeServer(game, {
      method: "POST",
      path: "/v1/match",
      query: {},
      headers: { authorization: `Bearer ${sessionToken}` },
      body: {},
    });
    expect(queued.status).toBe(200);
    const ticket = queued.body as { matchId: string | null; playerId: string; status: string };
    expect(ticket.playerId).toBe(playerId);
    expect(ticket.status).toBe("searching");
    expect(ticket.matchId).toBeNull();

    expect(() => game.me(sessionToken, Date.now() + 50)).toThrow(/session expired/i);
    expect(() => game.startAuthenticatedMatch(sessionToken, Date.now() + 50)).toThrow(
      /session expired|invalid session/i,
    );
    game.close();
  });

  it("client refuses to start an ONLINE 1v1 match without a local session", async () => {
    const client = new ChronoClient("http://127.0.0.1:9");
    await expect(client.startMatch()).rejects.toThrow(/sign in to start an ONLINE 1v1 match/i);
  });
});
