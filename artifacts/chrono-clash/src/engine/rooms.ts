/**
 * Virtual coin rooms.
 *
 * Data-driven catalog plus entry/settlement helpers. Wallet: existing
 * `winningCoins` only. Chrono Time / Score stay free unless a match is
 * entered through `enterCoinRoomMatch`.
 *
 * Winner payout is deterministic at the room level: 2× entry (stake returned
 * plus the opposing virtual stake). Step 2 does not change WINNING_COINS_*
 * match bonuses, ads, purchases, or matchmaking.
 */

export const COIN_ROOM_IDS = ["rookie", "pro", "elite", "master", "champion"] as const;
export type CoinRoomId = (typeof COIN_ROOM_IDS)[number];

export interface CoinRoom {
  id: CoinRoomId;
  name: string;
  /** Virtual coins required to start a match in this room. */
  entryCoins: number;
  /** Virtual coins granted once on a player win. Loss / void pay 0. */
  rewardCoins: number;
}

export interface CoinRoomMatchRecord {
  matchId: string;
  roomId: CoinRoomId;
  entryCoins: number;
  rewardCoins: number;
  charged: boolean;
  settled: boolean;
}

export type CoinRoomEnterReason = "funds" | "unavailable";

export type CoinRoomEnterResult =
  | {
      ok: true;
      room: CoinRoom;
      have: number;
      need: number;
      charged: number;
    }
  | {
      ok: false;
      reason: CoinRoomEnterReason;
      room: CoinRoom;
      have: number;
      need: number;
      charged: 0;
    };

export type CoinRoomSettleOutcome = "win" | "loss" | "tie" | "void";

export interface CoinRoomSettlement {
  matchId: string;
  roomId: CoinRoomId;
  entryCoins: number;
  payout: number;
  settled: boolean;
  outcome: CoinRoomSettleOutcome;
}

export const DEFAULT_COIN_ROOM_ID: CoinRoomId = "rookie";

/** Winner takes 2× the virtual entry (own stake back + opponent stake). */
export function coinRoomWinnerPayout(entryCoins: number): number {
  return Math.max(0, Math.trunc(Number(entryCoins) || 0) * 2);
}

export const COIN_ROOMS: readonly CoinRoom[] = [
  { id: "rookie", name: "Rookie", entryCoins: 500, rewardCoins: coinRoomWinnerPayout(500) },
  { id: "pro", name: "Pro", entryCoins: 1_500, rewardCoins: coinRoomWinnerPayout(1_500) },
  { id: "elite", name: "Elite", entryCoins: 5_000, rewardCoins: coinRoomWinnerPayout(5_000) },
  { id: "master", name: "Master", entryCoins: 15_000, rewardCoins: coinRoomWinnerPayout(15_000) },
  { id: "champion", name: "Champion", entryCoins: 50_000, rewardCoins: coinRoomWinnerPayout(50_000) },
];

export function isCoinRoomId(id: string | null | undefined): id is CoinRoomId {
  return (COIN_ROOM_IDS as readonly string[]).includes(String(id ?? ""));
}

export function parseCoinRoomId(id: string | null | undefined): CoinRoomId {
  return isCoinRoomId(id) ? id : DEFAULT_COIN_ROOM_ID;
}

export function coinRoomById(id: string | null | undefined): CoinRoom {
  const parsed = parseCoinRoomId(id);
  return COIN_ROOMS.find((room) => room.id === parsed) ?? COIN_ROOMS[0]!;
}

export function coinRooms(): readonly CoinRoom[] {
  return COIN_ROOMS;
}

export function canAffordCoinRoom(coins: number, room: CoinRoom): boolean {
  return Math.max(0, Math.trunc(Number(coins) || 0)) >= room.entryCoins;
}

export function newCoinRoomMatchId(now = Date.now()): string {
  return `cr-${Math.trunc(now).toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function openCoinRoomRecord(room: CoinRoom, now = Date.now()): CoinRoomMatchRecord {
  return {
    matchId: newCoinRoomMatchId(now),
    roomId: room.id,
    entryCoins: room.entryCoins,
    rewardCoins: room.rewardCoins,
    charged: false,
    settled: false,
  };
}

export function clampCoinRoomMatch(raw: unknown): CoinRoomMatchRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Partial<CoinRoomMatchRecord>;
  const room = coinRoomById(rec.roomId);
  const matchId = String(rec.matchId || "").slice(0, 80);
  if (!matchId) return null;
  return {
    matchId,
    roomId: room.id,
    entryCoins: Math.max(0, Math.trunc(Number(rec.entryCoins) || room.entryCoins)),
    rewardCoins: Math.max(0, Math.trunc(Number(rec.rewardCoins) || room.rewardCoins)),
    charged: Boolean(rec.charged),
    settled: Boolean(rec.settled),
  };
}

export function roomPayoutForOutcome(room: Pick<CoinRoom, "rewardCoins">, outcome: CoinRoomSettleOutcome): number {
  return outcome === "win" ? Math.max(0, Math.trunc(Number(room.rewardCoins) || 0)) : 0;
}

export function markCoinRoomCharged(record: CoinRoomMatchRecord): CoinRoomMatchRecord {
  return { ...record, charged: true };
}

export function markCoinRoomSettled(record: CoinRoomMatchRecord): CoinRoomMatchRecord {
  return { ...record, settled: true };
}
