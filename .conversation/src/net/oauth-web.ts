import { AuthProvider, PublicAuthConfig } from "../server/types";

const OAUTH_MSG = "chrono-clash-oauth";
const GOOGLE_ID_TOKEN_KEY = "chrono-clash-google-id-token";

export async function obtainProviderCredential(
  provider: Exclude<AuthProvider, "guest">,
  config: PublicAuthConfig,
): Promise<string> {
  if (provider === "google") return googleCredential(config);
  if (provider === "apple") return appleCredential(config);
  return facebookCredential(config);
}

export function takeRedirectIdToken(): string | null {
  if (typeof window === "undefined") return null;
  let token = new URLSearchParams(window.location.hash.replace(/^#/, "")).get("id_token");
  if (token) {
    history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
  } else {
    try {
      token = sessionStorage.getItem(GOOGLE_ID_TOKEN_KEY);
    } catch {
      token = null;
    }
  }
  if (!token) return null;
  try {
    sessionStorage.removeItem(GOOGLE_ID_TOKEN_KEY);
  } catch {
    /* ignore */
  }
  return token;
}

export function consumeOAuthRedirect(): boolean {
  if (typeof window === "undefined") return false;
  const token = new URLSearchParams(window.location.hash.replace(/^#/, "")).get("id_token");
  if (!token || !window.opener || window.opener === window) return false;
  window.opener.postMessage({ type: OAUTH_MSG, provider: "google", token }, window.location.origin);
  window.close();
  return true;
}

export function googleAuthorizeUrl(clientId: string, redirectUri: string): string {
  const nonce = crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`;
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "id_token");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("nonce", nonce);
  url.searchParams.set("prompt", "select_account");
  return url.toString();
}

async function googleCredential(config: PublicAuthConfig): Promise<string> {
  const clientId = config.google.clientId || "";
  if (!config.google.enabled || !clientId) {
    throw new Error("Google Sign-In is not configured. Set GOOGLE_CLIENT_ID on the server.");
  }
  const redirectUri = config.google.redirectUri || window.location.origin;
  const ua = navigator.userAgent || "";
  const iPhone = /iPhone|iPad|iPod/i.test(ua);
  const onRedirectOrigin = Boolean(config.google.redirectUri) && window.location.origin === config.google.redirectUri;
  if (iPhone || onRedirectOrigin) {
    window.location.assign(googleAuthorizeUrl(clientId, redirectUri));
    return new Promise(() => undefined);
  }
  await loadScript("https://accounts.google.com/gsi/client", () => Boolean(window.google?.accounts?.id));
  try {
    return await googleOneTap(clientId);
  } catch {
    try {
      return await googlePopupIdToken(clientId, redirectUri);
    } catch (error) {
      if (error instanceof Error && /popup was blocked/i.test(error.message)) {
        window.location.assign(googleAuthorizeUrl(clientId, redirectUri));
        return new Promise(() => undefined);
      }
      throw error;
    }
  }
}

function googleOneTap(clientId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const gis = window.google?.accounts?.id;
    if (!gis) {
      reject(new Error("Google Identity Services failed to load."));
      return;
    }
    let settled = false;
    gis.initialize({
      client_id: clientId,
      callback: (response) => {
        if (settled) return;
        settled = true;
        if (response.credential) resolve(response.credential);
        else reject(new Error("Google did not return an ID token."));
      },
      auto_select: false,
      cancel_on_tap_outside: true,
    });
    gis.prompt((notification) => {
      if (settled) return;
      if (notification.isNotDisplayed() || notification.isSkippedMoment() || notification.isDismissedMoment()) {
        settled = true;
        reject(new Error("Google Sign-In was cancelled or blocked by the browser."));
      }
    });
  });
}

function googlePopupIdToken(clientId: string, redirectUri: string): Promise<string> {
  const popup = window.open(googleAuthorizeUrl(clientId, redirectUri), "chrono-google", "width=480,height=640");
  if (!popup) throw new Error("Google Sign-In popup was blocked. Allow popups for this site.");
  return new Promise((resolve, reject) => {
    const timer = window.setInterval(() => {
      if (popup.closed) {
        cleanup();
        reject(new Error("Google Sign-In was cancelled."));
      }
    }, 400);
    const onMsg = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data as { type?: string; token?: string };
      if (data?.type !== OAUTH_MSG || !data.token) return;
      cleanup();
      popup.close();
      resolve(data.token);
    };
    const cleanup = () => {
      window.clearInterval(timer);
      window.removeEventListener("message", onMsg);
    };
    window.addEventListener("message", onMsg);
  });
}

async function appleCredential(config: PublicAuthConfig): Promise<string> {
  if (!config.apple.enabled || !config.apple.clientId) {
    throw new Error("Apple Sign-In is not configured.");
  }
  throw new Error("Apple Sign-In needs APPLE_CLIENT_ID and APPLE_REDIRECT_URI on the server.");
}

async function facebookCredential(config: PublicAuthConfig): Promise<string> {
  if (!config.facebook.enabled) {
    throw new Error("Facebook Login is not configured.");
  }
  throw new Error("Facebook Login needs FACEBOOK_APP_ID and FACEBOOK_APP_SECRET on the server.");
}

function loadScript(src: string, ready: () => boolean): Promise<void> {
  if (ready()) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`failed to load ${src}`));
    document.head.appendChild(script);
  });
}

declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: {
          initialize(opts: {
            client_id: string;
            callback: (response: { credential?: string }) => void;
            auto_select?: boolean;
            cancel_on_tap_outside?: boolean;
          }): void;
          prompt(cb?: (notification: {
            isNotDisplayed(): boolean;
            isSkippedMoment(): boolean;
            isDismissedMoment(): boolean;
          }) => void): void;
        };
      };
    };
  }
}
