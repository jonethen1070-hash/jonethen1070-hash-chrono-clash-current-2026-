export function seatSeed(matchSeed: number, seat: "a" | "b"): number {
  const seed = matchSeed >>> 0;
  return seat === "a" ? seed : (seed ^ 0x9e3779b9) >>> 0;
}

export function seatForPlayer(playerId: string, players: readonly string[]): "a" | "b" {
  return players[0] === playerId ? "a" : "b";
}
