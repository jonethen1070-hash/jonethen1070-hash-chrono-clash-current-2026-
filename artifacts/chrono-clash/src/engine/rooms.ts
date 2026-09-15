/**
 * Virtual coin rooms.
 *
 * Data-driven catalog for a later entry-fee / reward step. Step 1 only loads
 * definitions and remembers the selected room. It does not deduct coins, grant
 * room rewards, matchmake, advertise, or change Chrono Time / Score rules.
 *
 * Wallet: reuse existing `winningCoins`. Do not introduce a second currency.
 */

export const COIN_ROOM_IDS = ["rookie", "pro", "elite", "master", "champion"] as const;
export type CoinRoomId = (typeof COIN_ROOM_IDS)[number];

export interface CoinRoom {
  id: CoinRoomId;
  name: string;
  /** Virtual coins listed for this room. Reserved as the future entry stake. */
  entryCoins: number;
  /**
   * Reserved for a later reward step. Null until that step defines payouts —
   * Step 1 does not invent room reward amounts.
   */
  rewardCoins: number | null;
}

export const DEFAULT_COIN_ROOM_ID: CoinRoomId = "rookie";

export const COIN_ROOMS: readonly CoinRoom[] = [
  { id: "rookie", name: "Rookie", entryCoins: 500, rewardCoins: null },
  { id: "pro", name: "Pro", entryCoins: 1_500, rewardCoins: null },
  { id: "elite", name: "Elite", entryCoins: 5_000, rewardCoins: null },
  { id: "master", name: "Master", entryCoins: 15_000, rewardCoins: null },
  { id: "champion", name: "Champion", entryCoins: 50_000, rewardCoins: null },
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
