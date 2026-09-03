export type Platform = "android" | "ios" | "web";
export type AuthProvider = "google" | "facebook" | "apple" | "email" | "guest";
export type AuthMode = "development" | "production";

export const PROVIDERS_BY_PLATFORM: Record<Platform, readonly AuthProvider[]> = {
  android: ["google", "facebook", "email", "guest"],
  ios: ["google", "apple", "facebook", "email", "guest"],
  web: ["google", "facebook", "apple", "email", "guest"],
};

export interface AuthRequest {
  platform: Platform;
  provider: AuthProvider;
  token?: string;
  email?: string;
  password?: string;
  intent?: "sign-in" | "create-account";
  displayName?: string;
}

export interface PublicProviderConfig {
  enabled: boolean;
  clientId?: string;
  appId?: string;
  redirectUri?: string;
}

export interface PublicAuthConfig {
  mode: AuthMode;
  guest: boolean;
  google: PublicProviderConfig;
  apple: PublicProviderConfig;
  facebook: PublicProviderConfig;
  email: PublicProviderConfig;
}

export interface Player {
  playerId: string;
  provider: AuthProvider;
  platform: Platform;
  subject: string;
  name: string;
  sessionToken: string;
  createdAt: number;
}

export type MatchmakingStatus = "searching" | "matched" | "cancelled" | "error";

export interface MatchmakingState {
  status: MatchmakingStatus;
  matchId: string | null;
  playerId: string;
  opponentId: string | null;
  players: string[] | null;
  seed: number | null;
}

/** @deprecated Use MatchmakingState. Kept for older test imports. */
export type OnlineMatchTicket = MatchmakingState;
