import { AuthError } from "./auth-config";
import { createSeededRng, generateBoard, trySwap } from "../engine/board";
import { fillAttack } from "../engine/combat";
import { seatForPlayer, seatSeed } from "../engine/online";
import { powerConsumesCharge, powerEnergyCost, resolveTargetedPower } from "../engine/powers";
import {
  ATTACK_MAX,
  Board,
  Cell,
  COLS,
  Coord,
  ENERGY_FREEZE,
  ENERGY_MAX,
  ENERGY_REWIND,
  ENERGY_TIMESHIFT,
  FREEZE_MS,
  MATCH_SECONDS,
  PRESSURE_MS,
  PowerId,
  ROWS,
  TIME_STEAL_MS,
} from "../engine/types";

export const BATTLE_COUNTDOWN_MS = 3000;
export const BATTLE_STALE_MS = 8_000;
export const BATTLE_FORFEIT_MS = 20_000;

export type BattlePhase = "waiting" | "countdown" | "playing" | "ended" | "cancelled";
export type BattleActionType = "swap" | "power" | "heartbeat";

export type PowerLedger = {
  spendCharge: (playerId: string, powerId: string) => boolean;
};

export type BattleMatchRef = {
  matchId: string;
  seed: number;
  playerA: string;
  playerB: string;
  status: string;
};

export type BattleActionInput = {
  clientSeq: number;
  type: BattleActionType;
  a?: { r: number; c: number };
  b?: { r: number; c: number };
  target?: Coord;
  id?: PowerId;
};

export type BattleFighterView = {
  playerId: string;
  board: Cell[][];
  score: number;
  combo: number;
  energy: number;
  attack: number;
  lock: number;
  lastClientSeq: number;
};

export type BattleEvent = {
  seq: number;
  at: number;
  actorId: string;
  type: string;
};

export type BattleResult = {
  winnerId: string | null;
  scores: Record<string, number>;
  reason: "time" | "forfeit" | "leave" | "cancelled";
};

export type BattleSync = {
  matchId: string;
  seed: number;
  players: [string, string];
  seq: number;
  phase: BattlePhase;
  remainingMs: number;
  you: BattleFighterView;
  opponent: BattleFighterView;
  events: BattleEvent[];
  result: BattleResult | null;
  opponentConnected: boolean;
  yourLastClientSeq: number;
};

type FighterSlot = {
  playerId: string;
  board: Board;
  rng: () => number;
  score: number;
  combo: number;
  energy: number;
  attack: number;
  lastSnap: Board | null;
  lastSeen: number;
  lastClientSeq: number;
  joined: boolean;
  freezeUntil: number;
  lockUntil: number;
};

type Room = {
  matchId: string;
  seed: number;
  players: [string, string];
  a: FighterSlot;
  b: FighterSlot;
  phase: BattlePhase;
  lastAdvance: number;
  clock: number;
  freezeClock: number;
  countdownUntil: number;
  seq: number;
  events: BattleEvent[];
  result: BattleResult | null;
};

function cloneBoard(board: Board): Board {
  return board.map((row) => row.map((cell) => (cell ? { ...cell } : null)));
}

function makeFighter(playerId: string, seed: number, now: number): FighterSlot {
  const rng = createSeededRng(seed);
  return {
    playerId,
    board: generateBoard(rng),
    rng,
    score: 0,
    combo: 0,
    energy: 0,
    attack: 0,
    lastSnap: null,
    lastSeen: now,
    lastClientSeq: 0,
    joined: false,
    freezeUntil: 0,
    lockUntil: 0,
  };
}

function slotOf(room: Room, playerId: string): FighterSlot | null {
  if (room.a.playerId === playerId) return room.a;
  if (room.b.playerId === playerId) return room.b;
  return null;
}

function otherOf(room: Room, playerId: string): FighterSlot | null {
  if (room.a.playerId === playerId) return room.b;
  if (room.b.playerId === playerId) return room.a;
  return null;
}

function viewOf(slot: FighterSlot, now: number): BattleFighterView {
  return {
    playerId: slot.playerId,
    board: cloneBoard(slot.board),
    score: slot.score,
    combo: slot.combo,
    energy: slot.energy,
    attack: slot.attack,
    lock: Math.max(0, slot.freezeUntil - now, slot.lockUntil - now),
    lastClientSeq: slot.lastClientSeq,
  };
}

function remainingMs(room: Room): number {
  if (room.phase === "ended" || room.phase === "cancelled") return 0;
  if (room.phase !== "playing") return MATCH_SECONDS * 1000;
  return Math.max(0, MATCH_SECONDS * 1000 - room.clock);
}

function pushEvent(room: Room, now: number, actorId: string, type: string): void {
  room.seq += 1;
  room.events.push({ seq: room.seq, at: now, actorId, type });
  if (room.events.length > 200) room.events.splice(0, room.events.length - 200);
}

function scoresOf(room: Room): Record<string, number> {
  return { [room.a.playerId]: room.a.score, [room.b.playerId]: room.b.score };
}

function finish(room: Room, now: number, winnerId: string | null, reason: BattleResult["reason"]): void {
  if (room.phase === "ended" || room.phase === "cancelled") return;
  room.phase = reason === "cancelled" ? "cancelled" : "ended";
  room.result = { winnerId, scores: scoresOf(room), reason };
  pushEvent(room, now, winnerId ?? "system", reason === "cancelled" ? "cancelled" : "ended");
}

function finishByScore(room: Room, now: number, reason: BattleResult["reason"]): void {
  const winnerId =
    room.a.score === room.b.score ? null : room.a.score > room.b.score ? room.a.playerId : room.b.playerId;
  finish(room, now, winnerId, reason);
}

function applySwap(actor: FighterSlot, other: FighterSlot, action: BattleActionInput, now: number): boolean {
  if (!action.a || !action.b) return false;
  if (now < actor.freezeUntil || now < actor.lockUntil) return false;
  actor.lastSnap = cloneBoard(actor.board);
  const result = trySwap(actor.board, action.a, action.b, actor.rng);
  if (!result || result.cleared <= 0) {
    actor.lastSnap = null;
    return false;
  }
  actor.score += result.scoreDelta;
  actor.combo = result.comboPeak;
  actor.energy = Math.max(0, Math.min(ENERGY_MAX, actor.energy + result.energyDelta));
  const charged = fillAttack(actor.attack, result.comboPeak, result.cleared);
  actor.attack = Math.max(0, Math.min(ATTACK_MAX, charged.meter));
  if (charged.fired && result.comboPeak >= 2) {
    other.lockUntil = Math.max(other.lockUntil, now + PRESSURE_MS);
  }
  return true;
}

function applyPower(
  actor: FighterSlot,
  other: FighterSlot,
  room: Room,
  id: PowerId,
  now: number,
  ledger?: PowerLedger,
  target?: Coord,
): boolean {
  if (id === "burst" || id === "megaStrike") {
    const cost = powerEnergyCost(id);
    if (
      actor.energy < cost ||
      now < actor.lockUntil ||
      !target ||
      target.r < 0 ||
      target.r >= ROWS ||
      target.c < 0 ||
      target.c >= COLS ||
      !actor.board[target.r]?.[target.c]
    ) {
      return false;
    }
    actor.energy -= cost;
    actor.lastSnap = cloneBoard(actor.board);
    const result = resolveTargetedPower(actor.board, actor.rng, id, target);
    if (!result) return false;
    actor.score += result.scoreDelta;
    actor.combo = result.comboPeak;
    actor.energy = Math.max(0, Math.min(ENERGY_MAX, actor.energy + result.energyDelta));
    const charged = fillAttack(actor.attack, result.comboPeak, result.cleared);
    actor.attack = Math.max(0, Math.min(ATTACK_MAX, charged.meter));
    if (charged.fired && result.comboPeak >= 2) {
      other.lockUntil = Math.max(other.lockUntil, now + PRESSURE_MS);
    }
    other.attack = Math.max(0, other.attack - (id === "burst" ? 22 : 48));
    other.lockUntil = Math.max(other.lockUntil, now + (id === "burst" ? PRESSURE_MS : PRESSURE_MS * 2));
    actor.lockUntil = Math.max(actor.lockUntil, now + 620);
    return true;
  }
  if (id === "freeze") {
    if (actor.energy < ENERGY_FREEZE) return false;
    if (powerConsumesCharge(id) && ledger && !ledger.spendCharge(actor.playerId, id)) return false;
    actor.energy -= ENERGY_FREEZE;
    other.freezeUntil = Math.max(other.freezeUntil, now + FREEZE_MS);
    return true;
  }
  if (id === "timeshift") {
    if (actor.energy < ENERGY_TIMESHIFT) return false;
    if (powerConsumesCharge(id) && ledger && !ledger.spendCharge(actor.playerId, id)) return false;
    actor.energy -= ENERGY_TIMESHIFT;
    room.freezeClock += TIME_STEAL_MS;
    return true;
  }
  if (id === "rewind") {
    if (actor.energy < ENERGY_REWIND || !actor.lastSnap) return false;
    actor.energy -= ENERGY_REWIND;
    actor.board = cloneBoard(actor.lastSnap);
    return true;
  }
  return false;
}

export class BattleDirector {
  private readonly rooms = new Map<string, Room>();
  private readonly ledger?: PowerLedger;

  constructor(ledger?: PowerLedger) {
    this.ledger = ledger;
  }

  openFromMatch(match: BattleMatchRef, now = Date.now()): Room {
    const existing = this.rooms.get(match.matchId);
    if (existing) return existing;
    const players: [string, string] = [match.playerA, match.playerB];
    const room: Room = {
      matchId: match.matchId,
      seed: match.seed,
      players,
      a: makeFighter(match.playerA, seatSeed(match.seed, "a"), now),
      b: makeFighter(match.playerB, seatSeed(match.seed, "b"), now),
      phase: "waiting",
      lastAdvance: now,
      clock: 0,
      freezeClock: 0,
      countdownUntil: 0,
      seq: 0,
      events: [],
      result: null,
    };
    this.rooms.set(match.matchId, room);
    return room;
  }

  get(matchId: string): Room | undefined {
    return this.rooms.get(matchId);
  }

  private roomOrThrow(matchId: string): Room {
    const room = this.rooms.get(matchId);
    if (!room) throw new AuthError("match not found", 404);
    return room;
  }

  private requireSeat(room: Room, playerId: string): FighterSlot {
    const slot = slotOf(room, playerId);
    if (!slot) throw new AuthError("You are not in this match.", 403);
    return slot;
  }

  advance(room: Room, now = Date.now()): void {
    const dt = Math.max(0, now - room.lastAdvance);
    room.lastAdvance = now;
    if (room.phase === "countdown" && now >= room.countdownUntil) {
      room.phase = "playing";
      room.clock = 0;
      pushEvent(room, now, "system", "playing");
    }
    if (room.phase !== "playing" || room.result) return;
    if (room.freezeClock > 0) {
      room.freezeClock = Math.max(0, room.freezeClock - dt);
    } else {
      room.clock += dt;
    }
    if (room.clock >= MATCH_SECONDS * 1000) {
      finishByScore(room, now, "time");
      return;
    }
    for (const slot of [room.a, room.b]) {
      if (slot.joined && now - slot.lastSeen >= BATTLE_FORFEIT_MS) {
        const winner = otherOf(room, slot.playerId);
        finish(room, now, winner?.playerId ?? null, "forfeit");
        return;
      }
    }
  }

  snapshot(room: Room, playerId: string, afterSeq = 0, now = Date.now()): BattleSync {
    this.advance(room, now);
    const you = this.requireSeat(room, playerId);
    const opponent = otherOf(room, playerId)!;
    return {
      matchId: room.matchId,
      seed: room.seed,
      players: room.players,
      seq: room.seq,
      phase: room.phase,
      remainingMs: remainingMs(room),
      you: viewOf(you, now),
      opponent: viewOf(opponent, now),
      events: room.events.filter((event) => event.seq > afterSeq),
      result: room.result,
      opponentConnected: now - opponent.lastSeen < BATTLE_STALE_MS,
      yourLastClientSeq: you.lastClientSeq,
    };
  }

  join(match: BattleMatchRef, playerId: string, now = Date.now()): BattleSync {
    if (match.status === "cancelled") throw new AuthError("Match was cancelled.", 409);
    if (match.status !== "matched") throw new AuthError("Match is not ready.", 409);
    const room = this.openFromMatch(match, now);
    const you = this.requireSeat(room, playerId);
    you.joined = true;
    you.lastSeen = now;
    this.advance(room, now);
    if (room.phase === "waiting" && room.a.joined && room.b.joined) {
      room.phase = "countdown";
      room.countdownUntil = now + BATTLE_COUNTDOWN_MS;
      pushEvent(room, now, "system", "countdown");
    }
    return this.snapshot(room, playerId, 0, now);
  }

  action(matchId: string, playerId: string, input: BattleActionInput, now = Date.now()): BattleSync {
    const room = this.roomOrThrow(matchId);
    const you = this.requireSeat(room, playerId);
    const other = otherOf(room, playerId)!;
    you.lastSeen = now;
    this.advance(room, now);
    const clientSeq = Math.trunc(Number(input.clientSeq));
    if (!Number.isFinite(clientSeq) || clientSeq <= 0) throw new AuthError("clientSeq is required.", 400);
    if (input.type !== "swap" && input.type !== "power" && input.type !== "heartbeat") {
      throw new AuthError("Unknown action.", 400);
    }
    if (
      input.type === "power" &&
      input.id !== "freeze" &&
      input.id !== "timeshift" &&
      input.id !== "rewind" &&
      input.id !== "burst" &&
      input.id !== "megaStrike"
    ) {
      throw new AuthError("Unknown power.", 400);
    }
    if (clientSeq <= you.lastClientSeq) {
      return this.snapshot(room, playerId, 0, now);
    }
    if (input.type === "heartbeat") {
      you.lastClientSeq = clientSeq;
      return this.snapshot(room, playerId, 0, now);
    }
    if (room.phase !== "playing" || room.result) {
      you.lastClientSeq = clientSeq;
      return this.snapshot(room, playerId, 0, now);
    }
    let applied = false;
    if (input.type === "swap") {
      applied = applySwap(you, other, input, now);
    } else {
      applied = applyPower(you, other, room, input.id!, now, this.ledger, input.target);
    }
    you.lastClientSeq = clientSeq;
    if (applied) pushEvent(room, now, playerId, input.type);
    return this.snapshot(room, playerId, 0, now);
  }

  sync(matchId: string, playerId: string, afterSeq = 0, now = Date.now()): BattleSync {
    const room = this.roomOrThrow(matchId);
    const you = this.requireSeat(room, playerId);
    you.lastSeen = now;
    return this.snapshot(room, playerId, afterSeq, now);
  }

  leave(matchId: string, playerId: string, now = Date.now()): BattleSync {
    const room = this.roomOrThrow(matchId);
    const you = this.requireSeat(room, playerId);
    you.lastSeen = now;
    this.advance(room, now);
    const other = otherOf(room, playerId)!;
    if (room.phase === "playing") {
      finish(room, now, other.playerId, "leave");
    } else if (room.phase === "waiting" || room.phase === "countdown") {
      finish(room, now, null, "cancelled");
    }
    return this.snapshot(room, playerId, 0, now);
  }

  leaveAllForPlayer(playerId: string, now = Date.now()): void {
    for (const room of this.rooms.values()) {
      if (room.a.playerId !== playerId && room.b.playerId !== playerId) continue;
      if (room.phase === "ended" || room.phase === "cancelled") continue;
      this.leave(room.matchId, playerId, now);
    }
  }

  seatOf(playerId: string, players: readonly string[]): "a" | "b" {
    return seatForPlayer(playerId, players);
  }
}
