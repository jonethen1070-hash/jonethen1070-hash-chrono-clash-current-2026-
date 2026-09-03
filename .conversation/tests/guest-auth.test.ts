import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ChronoClient, isAuthFailure } from "../src/net/client";
import { clearOnlineSession, loadOnlineSession, visibleAuthProviders } from "../src/net/identity";
import { assertProductionAuth, loadAuthConfig, publicAuthConfig } from "../src/server/auth-config";
import { ChronoClashServer } from "../src/server/core";
import { routeServer } from "../src/server/http";
import { listenChronoHttp } from "../src/server/listen";

const WEB_CLIENT_ID = "397661440640-rlaj9s1k3orv17fu5vn8fknls1gakt09.apps.googleusercontent.com";

function installMemoryStorage() {
  const mem = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => (mem.has(key) ? mem.get(key)! : null),
      setItem: (key: string, value: string) => void mem.set(key, value),
      removeItem: (key: string) => void mem.delete(key),
    },
  });
  return mem;
}

function absentProviderEnv(extra: Record<string, string> = {}) {
  return {
    NODE_ENV: "production",
    CHRONO_AUTH_MODE: "development",
    CHRONO_ALLOW_GUEST: "1",
    CHRONO_ALLOW_DEV_AUTH: "0",
    GOOGLE_CLIENT_ID: "",
    GOOGLE_ANDROID_CLIENT_ID: "",
    GOOGLE_IOS_CLIENT_ID: "",
    GOOGLE_REDIRECT_URI: "",
    APPLE_CLIENT_ID: "",
    APPLE_IOS_CLIENT_ID: "",
    APPLE_REDIRECT_URI: "",
    FACEBOOK_APP_ID: "",
    FACEBOOK_APP_SECRET: "",
    ...extra,
  };
}

describe("Guest authentication without provider credentials", () => {
  it("enables Guest when CHRONO_ALLOW_GUEST=1 and every provider credential is absent", () => {
    const cfg = loadAuthConfig(absentProviderEnv());
    expect(cfg.mode).toBe("development");
    expect(cfg.allowGuest).toBe(true);
    expect(cfg.googleClientIds).toEqual([]);
    expect(cfg.googleWebClientId).toBe("");
    expect(cfg.appleClientIds).toEqual([]);
    expect(cfg.facebookAppId).toBe("");
    expect(cfg.facebookAppSecret).toBe("");
    expect(() => assertProductionAuth(cfg)).not.toThrow();
    const pub = publicAuthConfig(cfg);
    expect(pub.guest).toBe(true);
    expect(pub.google.enabled).toBe(false);
    expect(pub.apple.enabled).toBe(false);
    expect(pub.facebook.enabled).toBe(false);
    expect(visibleAuthProviders(pub, "web")).toEqual(["guest"]);
    expect(visibleAuthProviders(pub, "ios")).toEqual(["guest"]);
    expect(visibleAuthProviders(pub, "android")).toEqual(["guest"]);
    expect(visibleAuthProviders(null, "web")).toEqual(["guest"]);
  });

  it("keeps Guest available when provider credentials are simply omitted from the environment", () => {
    const cfg = loadAuthConfig({
      NODE_ENV: "production",
      CHRONO_AUTH_MODE: "development",
    });
    expect(cfg.allowGuest).toBe(true);
    expect(visibleAuthProviders(publicAuthConfig(cfg), "web")).toEqual(["guest"]);
  });

  it("still offers Guest in the ONLINE UI when /v1/auth/config cannot be loaded", () => {
    expect(visibleAuthProviders(null, "web")).toContain("guest");
    const src = readFileSync("src/main.ts", "utf8");
    expect(src).not.toContain('Google Sign-In is not configured."');
    expect(src).toContain("Guest sign-in is unavailable.");
  });

  it("does not tell a signed-in guest that FIND MATCH still requires a Player ID", () => {
    const src = readFileSync("src/main.ts", "utf8");
    expect(src).not.toContain("Requires a signed-in Player ID.");
    expect(src).toContain('id="findOnlineMatch"');
    expect(src).toContain("Player ID ${id} is ready.");
    // The signed-out branch is the only place that may still ask for a sign-in.
    expect(src).toContain('ui.onlineIdent.textContent = "Sign in to get a Player ID.";');
  });

  it("signs two guests in over HTTP with no Google, Apple, or Facebook credentials", async () => {
    const cfg = loadAuthConfig(absentProviderEnv());
    const game = new ChronoClashServer({ dbPath: ":memory:", auth: cfg });
    const handle = await listenChronoHttp(game, 0, "127.0.0.1");
    const base = `http://127.0.0.1:${handle.port}`;
    const published = await fetch(`${base}/v1/auth/config`);
    expect(published.status).toBe(200);
    const pub = (await published.json()) as { guest: boolean; google: { enabled: boolean } };
    expect(pub.guest).toBe(true);
    expect(pub.google.enabled).toBe(false);

    const first = await routeServer(game, {
      method: "POST",
      path: "/v1/auth",
      query: {},
      headers: {},
      body: { platform: "web", provider: "guest", token: "phone-a" },
    });
    const second = await routeServer(game, {
      method: "POST",
      path: "/v1/auth",
      query: {},
      headers: {},
      body: { platform: "web", provider: "guest", token: "phone-b" },
    });
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const playerA = (first.body as { player: { playerId: string; provider: string }; sessionToken: string }).player;
    const playerB = (second.body as { player: { playerId: string; provider: string } }).player;
    expect(playerA.provider).toBe("guest");
    expect(playerB.provider).toBe("guest");
    expect(playerA.playerId).not.toBe(playerB.playerId);
    const me = await routeServer(game, {
      method: "GET",
      path: "/v1/me",
      query: {},
      headers: {
        authorization: `Bearer ${(first.body as { sessionToken: string }).sessionToken}`,
      },
      body: null,
    });
    expect(me.status).toBe(200);
    expect((me.body as { player: { playerId: string; provider: string } }).player.playerId).toBe(playerA.playerId);
    await handle.close();
    game.close();
  });

  it("keeps Guest on when CHRONO_ALLOW_GUEST=1 even if a leftover Google client ID is present", () => {
    const cfg = loadAuthConfig(
      absentProviderEnv({
        GOOGLE_CLIENT_ID: WEB_CLIENT_ID,
      }),
    );
    expect(cfg.allowGuest).toBe(true);
    const providers = visibleAuthProviders(publicAuthConfig(cfg), "web");
    expect(providers).toContain("guest");
    expect(providers).toContain("google");
  });

  it("lets CHRONO_ALLOW_GUEST=0 disable Guest even when provider credentials are absent", async () => {
    const cfg = loadAuthConfig(absentProviderEnv({ CHRONO_ALLOW_GUEST: "0" }));
    expect(cfg.allowGuest).toBe(false);
    expect(visibleAuthProviders(publicAuthConfig(cfg), "web")).toEqual([]);
    const game = new ChronoClashServer({ dbPath: ":memory:", auth: cfg });
    const denied = await routeServer(game, {
      method: "POST",
      path: "/v1/auth",
      query: {},
      headers: {},
      body: { platform: "web", provider: "guest", token: "phone-a" },
    });
    expect(denied.status).toBe(403);
    expect((denied.body as { error: string }).error).toMatch(/guest sign-in is disabled/i);
    game.close();
  });

  it("keeps the guest Player ID across a reload in a second browser session", async () => {
    installMemoryStorage();
    const cfg = loadAuthConfig(absentProviderEnv());
    const game = new ChronoClashServer({ dbPath: ":memory:", auth: cfg });
    const handle = await listenChronoHttp(game, 0, "127.0.0.1");
    const base = `http://127.0.0.1:${handle.port}`;

    const phoneA = new ChronoClient(base);
    const signed = await phoneA.signIn({ platform: "web", provider: "guest", token: "phone-a" });
    expect(signed.player.provider).toBe("guest");
    expect(loadOnlineSession()?.playerId).toBe(signed.player.playerId);

    const reloaded = new ChronoClient(base);
    expect(reloaded.restore()?.playerId).toBe(signed.player.playerId);
    expect((await reloaded.me()).playerId).toBe(signed.player.playerId);

    await handle.close();
    game.close();
    clearOnlineSession();
  });

  it("keeps the guest session when /v1/me fails for a reason other than a rejected session", async () => {
    installMemoryStorage();
    const cfg = loadAuthConfig(absentProviderEnv());
    const game = new ChronoClashServer({ dbPath: ":memory:", auth: cfg });
    const handle = await listenChronoHttp(game, 0, "127.0.0.1");
    const base = `http://127.0.0.1:${handle.port}`;
    const client = new ChronoClient(base);
    await client.signIn({ platform: "web", provider: "guest", token: "phone-a" });
    const live = client.token;
    await handle.close();

    // Server unreachable: the client must surface an error that does not clear the Player ID.
    const failure = await client.me().catch((err: unknown) => err);
    expect(isAuthFailure(failure)).toBe(false);
    expect(client.token).toBe(live);
    expect(loadOnlineSession()?.token).toBe(live);

    game.close();
    clearOnlineSession();
  });

  it("treats only an explicit session rejection as an auth failure", async () => {
    const cfg = loadAuthConfig(absentProviderEnv());
    const game = new ChronoClashServer({ dbPath: ":memory:", auth: cfg });
    const handle = await listenChronoHttp(game, 0, "127.0.0.1");
    const client = new ChronoClient(`http://127.0.0.1:${handle.port}`);
    client.token = "not-a-real-session";
    const rejected = await client.me().catch((err: unknown) => err);
    expect((rejected as { status?: number }).status).toBe(401);
    expect(isAuthFailure(rejected)).toBe(true);
    expect(isAuthFailure(new Error("Failed to fetch"))).toBe(false);
    await handle.close();
    game.close();
  });
});
