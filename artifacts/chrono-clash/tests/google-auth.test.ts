import { createPublicKey, createSign, generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ChronoClashServer } from "../src/server/core";
import { routeServer } from "../src/server/http";
import { loadAuthConfig, publicAuthConfig } from "../src/server/auth-config";
import { verifyAuth } from "../src/server/auth";
import { resetJwksCache, verifyJwt } from "../src/server/oauth";
import { googleAuthorizeUrl } from "../src/net/oauth-web";

const WEB_CLIENT_ID = "397661440640-rlaj9s1k3orv17fu5vn8fknls1gakt09.apps.googleusercontent.com";
const PREVIEW_ORIGIN = "https://situations-tone-geo-samba.trycloudflare.com";

function b64url(data: Buffer | string): string {
  return Buffer.from(data).toString("base64url");
}

function signRs256(privateKey: string, payload: Record<string, unknown>, kid = "test-google"): string {
  const header = b64url(JSON.stringify({ alg: "RS256", kid, typ: "JWT" }));
  const body = b64url(JSON.stringify(payload));
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${body}`);
  return `${header}.${body}.${signer.sign(privateKey).toString("base64url")}`;
}

function rsaJwk(publicKeyPem: string, kid = "test-google") {
  const jwk = createPublicKey(publicKeyPem).export({ format: "jwk" }) as { n?: string; e?: string };
  return { kid, kty: "RSA", n: jwk.n, e: jwk.e, alg: "RS256", use: "sig" };
}

describe("Chrono Clash Google Web client", () => {
  it("publishes only the existing Web client ID and no client secret", () => {
    const cfg = loadAuthConfig({
      CHRONO_AUTH_MODE: "development",
      GOOGLE_CLIENT_ID: WEB_CLIENT_ID,
      GOOGLE_REDIRECT_URI: PREVIEW_ORIGIN,
    });
    const pub = publicAuthConfig(cfg);
    expect(cfg.googleClientIds).toEqual([WEB_CLIENT_ID]);
    expect(pub.google.enabled).toBe(true);
    expect(pub.google.clientId).toBe(WEB_CLIENT_ID);
    expect(pub.google.redirectUri).toBe(PREVIEW_ORIGIN);
    expect(JSON.stringify(pub)).not.toMatch(/secret/i);
    expect(JSON.stringify(pub)).not.toMatch(/CLIENT_SECRET/);
  });

  it("builds the implicit Google authorize URL for the saved Web client", () => {
    const url = new URL(googleAuthorizeUrl(WEB_CLIENT_ID, PREVIEW_ORIGIN));
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("client_id")).toBe(WEB_CLIENT_ID);
    expect(url.searchParams.get("redirect_uri")).toBe(PREVIEW_ORIGIN);
    expect(url.searchParams.get("response_type")).toBe("id_token");
    expect(url.searchParams.get("scope")).toBe("openid email profile");
    expect(url.searchParams.get("nonce")).toBeTruthy();
  });

  it("rejects a fake Google token against the real Web client ID", async () => {
    const cfg = loadAuthConfig({
      GOOGLE_CLIENT_ID: WEB_CLIENT_ID,
      CHRONO_ALLOW_DEV_AUTH: "0",
    });
    await expect(
      verifyAuth({ platform: "web", provider: "google", token: "not-a-jwt" }, cfg),
    ).rejects.toThrow(/signed JWT|malformed|identity token/i);
  });

  it("verifies an RS256 Google ID token whose aud is the existing Web client ID", async () => {
    resetJwksCache();
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const pemPriv = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const pemPub = publicKey.export({ type: "spki", format: "pem" }).toString();
    const now = Math.floor(Date.now() / 1000);
    const token = signRs256(pemPriv, {
      iss: "https://accounts.google.com",
      aud: WEB_CLIENT_ID,
      exp: now + 3600,
      sub: "google-user-123",
      name: "Nova Pilot",
      email: "nova@example.com",
    });
    const claims = await verifyJwt(token, {
      issuer: ["accounts.google.com", "https://accounts.google.com"],
      audience: [WEB_CLIENT_ID],
      jwksUrl: "https://www.googleapis.com/oauth2/v3/certs",
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        json: async () => ({ keys: [rsaJwk(pemPub)] }),
        text: async () => "",
      }),
    });
    expect(claims.sub).toBe("google-user-123");
    expect(claims.aud).toBe(WEB_CLIENT_ID);
  });

  it("creates a session from a verified Google token for the existing Web client", async () => {
    resetJwksCache();
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const pemPriv = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const pemPub = publicKey.export({ type: "spki", format: "pem" }).toString();
    const now = Math.floor(Date.now() / 1000);
    const token = signRs256(pemPriv, {
      iss: "accounts.google.com",
      aud: WEB_CLIENT_ID,
      exp: now + 3600,
      sub: "live-google-sub",
      name: "Google Pilot",
    });
    const game = new ChronoClashServer({
      dbPath: ":memory:",
      auth: {
        googleClientIds: [WEB_CLIENT_ID],
        googleWebClientId: WEB_CLIENT_ID,
        googleRedirectUri: PREVIEW_ORIGIN,
        allowDevAuth: false,
        fetchImpl: async () => ({
          ok: true,
          status: 200,
          json: async () => ({ keys: [rsaJwk(pemPub)] }),
          text: async () => "",
        }),
      },
    });
    const created = await routeServer(game, {
      method: "POST",
      path: "/v1/auth",
      query: {},
      headers: {},
      body: { platform: "ios", provider: "google", token, displayName: "CHRONO PILOT" },
    });
    expect(created.status).toBe(200);
    const body = created.body as {
      sessionToken: string;
      player: { provider: string; platform: string; playerId: string };
    };
    expect(body.player.provider).toBe("google");
    expect(body.player.platform).toBe("ios");
    expect(body.player.playerId.startsWith("cc_")).toBe(true);
    const me = await routeServer(game, {
      method: "GET",
      path: "/v1/me",
      query: {},
      headers: { authorization: `Bearer ${body.sessionToken}` },
      body: null,
    });
    expect(me.status).toBe(200);
    game.close();
  });

  it("keeps Google available on iOS, Android, and web", async () => {
    const cfg = loadAuthConfig({
      GOOGLE_CLIENT_ID: WEB_CLIENT_ID,
      CHRONO_ALLOW_DEV_AUTH: "0",
    });
    for (const platform of ["ios", "android", "web"] as const) {
      await expect(
        verifyAuth({ platform, provider: "google", token: "" }, cfg),
      ).rejects.toThrow(/requires a provider identity token/i);
    }
  });

  it("live preview publishes the saved Web client and no secret", async () => {
    const res = await fetch("http://127.0.0.1:5173/v1/auth/config");
    expect(res.ok).toBe(true);
    const json = (await res.json()) as {
      google: { enabled: boolean; clientId: string; redirectUri: string };
    };
    expect(json.google.enabled).toBe(true);
    expect(json.google.clientId).toBe(WEB_CLIENT_ID);
    expect(json.google.redirectUri).toBe(PREVIEW_ORIGIN);
    expect(JSON.stringify(json)).not.toMatch(/secret/i);
  });

  it("Google accepts the live authorize URL for the saved Web client", async () => {
    const url = googleAuthorizeUrl(WEB_CLIENT_ID, PREVIEW_ORIGIN);
    const res = await fetch(url, { redirect: "manual" });
    const location = res.headers.get("location") || "";
    expect(res.status).toBe(302);
    expect(location).toContain("accounts.google.com");
    expect(location).toContain("client_id=" + WEB_CLIENT_ID);
    expect(location).not.toMatch(/redirect_uri_mismatch|invalid_client|Error 400/i);
  });
});
