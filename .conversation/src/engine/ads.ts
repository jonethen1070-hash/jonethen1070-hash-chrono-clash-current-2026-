import { isValidAdReceipt } from "./economy";

export type RewardedAdResult =
  | { ok: true; receiptId: string }
  | { ok: false; reason: "unavailable" | "canceled" | "failed" };

export interface RewardedAdPort {
  isAvailable(): boolean;
  showRewarded(powerId: string): Promise<RewardedAdResult>;
  redeemReceipt(receiptId: string): boolean;
}

type SdkShow = (powerId: string) => Promise<{ receiptId?: string } | string | null | undefined>;

function randomReceipt(): string {
  const bytes = new Uint8Array(18);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

class IssuedReceiptGate {
  private readonly issued = new Set<string>();
  private readonly redeemed = new Set<string>();

  register(receiptId: string): boolean {
    if (!isValidAdReceipt(receiptId) || this.redeemed.has(receiptId)) return false;
    this.issued.add(receiptId);
    return true;
  }

  redeem(receiptId: string): boolean {
    if (!this.issued.has(receiptId) || this.redeemed.has(receiptId)) return false;
    this.issued.delete(receiptId);
    this.redeemed.add(receiptId);
    return true;
  }
}

export function createUnavailableRewardedAdPort(): RewardedAdPort {
  return {
    isAvailable: () => false,
    async showRewarded() {
      return { ok: false, reason: "unavailable" };
    },
    redeemReceipt() {
      return false;
    },
  };
}

/** Production hook: only completes when a real `ChronoRewardedAds.show` SDK is present. */
export function createBrowserRewardedAdPort(): RewardedAdPort {
  const gate = new IssuedReceiptGate();
  const sdk = (): { show?: SdkShow } | undefined => {
    const g = globalThis as typeof globalThis & { ChronoRewardedAds?: { show?: SdkShow } };
    return g.ChronoRewardedAds;
  };
  return {
    isAvailable() {
      return typeof sdk()?.show === "function";
    },
    async showRewarded(powerId: string) {
      const show = sdk()?.show;
      if (!show) return { ok: false, reason: "unavailable" };
      try {
        const raw = await show(powerId);
        const receiptId = typeof raw === "string" ? raw : String(raw?.receiptId || "");
        if (!gate.register(receiptId)) return { ok: false, reason: "failed" };
        return { ok: true, receiptId };
      } catch {
        return { ok: false, reason: "failed" };
      }
    },
    redeemReceipt(receiptId: string) {
      return gate.redeem(receiptId);
    },
  };
}

/** Test double: issues one unique receipt per completed show. Not used in production UI. */
export function createScriptedRewardedAdPort(opts: { available?: boolean; failOnce?: boolean } = {}): RewardedAdPort & {
  shows: number;
} {
  const gate = new IssuedReceiptGate();
  const port = {
    shows: 0,
    isAvailable() {
      return opts.available !== false;
    },
    async showRewarded(_powerId: string): Promise<RewardedAdResult> {
      this.shows += 1;
      if (opts.available === false) return { ok: false, reason: "unavailable" };
      if (opts.failOnce) {
        opts.failOnce = false;
        return { ok: false, reason: "failed" };
      }
      const receiptId = randomReceipt();
      gate.register(receiptId);
      return { ok: true, receiptId };
    },
    redeemReceipt(receiptId: string) {
      return gate.redeem(receiptId);
    },
  };
  return port;
}

export function resolveRewardedAdPort(): RewardedAdPort {
  try {
    const browser = createBrowserRewardedAdPort();
    if (browser.isAvailable()) return browser;
  } catch {
    /* ignore */
  }
  return createUnavailableRewardedAdPort();
}
