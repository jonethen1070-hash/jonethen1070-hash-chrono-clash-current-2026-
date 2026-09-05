import { makePiece, resolveBoard, scoreForClear } from "./board";
import {
  Board,
  COLOR_COUNT,
  COLS,
  Coord,
  ENERGY_BURST,
  ENERGY_FREEZE,
  ENERGY_MEGA_STRIKE,
  ENERGY_REWIND,
  ENERGY_TIMESHIFT,
  PowerId,
  ResolveResult,
  ROWS,
} from "./types";

export const DEFAULT_POWER_MAX = 5;
export const POWER_CHARGE_COIN_COST = 50;

export interface PowerDefinition {
  id: string;
  displayName: string;
  icon: string;
  maxCharges: number;
  coinCost: number;
  rewardedAd: boolean;
  consumesCharge: boolean;
  storefront: boolean;
  energyCost: number;
}

export const POWER_CATALOG: readonly PowerDefinition[] = [
  {
    id: "freeze",
    displayName: "Freeze Time",
    icon: "❄",
    maxCharges: DEFAULT_POWER_MAX,
    coinCost: POWER_CHARGE_COIN_COST,
    rewardedAd: true,
    consumesCharge: true,
    storefront: true,
    energyCost: ENERGY_FREEZE,
  },
  {
    id: "timeshift",
    displayName: "Time Shift",
    icon: "⏱",
    maxCharges: DEFAULT_POWER_MAX,
    coinCost: POWER_CHARGE_COIN_COST,
    rewardedAd: true,
    consumesCharge: true,
    storefront: true,
    energyCost: ENERGY_TIMESHIFT,
  },
  {
    id: "rewind",
    displayName: "Rewind",
    icon: "↺",
    maxCharges: DEFAULT_POWER_MAX,
    coinCost: 90,
    rewardedAd: false,
    consumesCharge: false,
    storefront: false,
    energyCost: ENERGY_REWIND,
  },
];

const byId = new Map(POWER_CATALOG.map((power) => [power.id, power]));

export function powerById(id: string, catalog: readonly PowerDefinition[] = POWER_CATALOG): PowerDefinition | undefined {
  if (catalog === POWER_CATALOG) return byId.get(id);
  return catalog.find((power) => power.id === id);
}

export function storefrontPowers(catalog: readonly PowerDefinition[] = POWER_CATALOG): PowerDefinition[] {
  return catalog.filter((power) => power.storefront);
}

export function powerConsumesCharge(id: string, catalog: readonly PowerDefinition[] = POWER_CATALOG): boolean {
  return Boolean(powerById(id, catalog)?.consumesCharge);
}

export function powerMaxCharges(id: string, catalog: readonly PowerDefinition[] = POWER_CATALOG): number {
  return powerById(id, catalog)?.maxCharges ?? DEFAULT_POWER_MAX;
}

export function isKnownPowerId(id: string): id is PowerId {
  return id === "freeze" || id === "timeshift" || id === "rewind" || id === "burst" || id === "megaStrike";
}

export type TargetedPowerId = "burst" | "megaStrike";

export function powerEnergyCost(id: PowerId): number {
  switch (id) {
    case "burst":
      return ENERGY_BURST;
    case "megaStrike":
      return ENERGY_MEGA_STRIKE;
    case "freeze":
      return ENERGY_FREEZE;
    case "timeshift":
      return ENERGY_TIMESHIFT;
    case "rewind":
      return ENERGY_REWIND;
  }
}

function validTarget(board: Board, target: Coord): boolean {
  return (
    target.r >= 0 &&
    target.r < ROWS &&
    target.c >= 0 &&
    target.c < COLS &&
    Boolean(board[target.r]?.[target.c])
  );
}

export function targetedPowerCells(board: Board, id: TargetedPowerId, target: Coord): Coord[] | null {
  if (!validTarget(board, target)) return null;
  const cells: Coord[] = [];
  if (id === "burst") {
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const r = target.r + dr;
        const c = target.c + dc;
        if (r >= 0 && r < ROWS && c >= 0 && c < COLS) cells.push({ r, c });
      }
    }
    return cells;
  }

  const selectedColor = board[target.r]![target.c]!.color;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (board[r]![c]?.color === selectedColor) cells.push({ r, c });
    }
  }
  return cells;
}

function formsMatchAt(board: Board, target: Coord, color: number): boolean {
  const countDirection = (dr: number, dc: number): number => {
    let count = 0;
    let r = target.r + dr;
    let c = target.c + dc;
    while (r >= 0 && r < ROWS && c >= 0 && c < COLS && board[r]![c]?.color === color) {
      count += 1;
      r += dr;
      c += dc;
    }
    return count;
  };

  return (
    countDirection(0, -1) + countDirection(0, 1) >= 2 ||
    countDirection(-1, 0) + countDirection(1, 0) >= 2
  );
}

function replacementColor(board: Board, target: Coord, rng: () => number, excludedColor: number): number {
  const start = Math.floor(rng() * COLOR_COUNT);
  for (let offset = 0; offset < COLOR_COUNT; offset++) {
    const color = ((start + offset) % COLOR_COUNT) + 1;
    if (color !== excludedColor && !formsMatchAt(board, target, color)) return color;
  }
  return excludedColor === 1 ? 2 : 1;
}

function resolveMegaStrike(board: Board, rng: () => number, target: Coord): ResolveResult | null {
  const cells = targetedPowerCells(board, "megaStrike", target);
  if (!cells) return null;

  const selectedColor = board[target.r]![target.c]!.color;
  // Clear every piece with the selected model color, then refill only those
  // sockets. Non-matching pieces stay in place and cannot enter a cascade.
  for (const cell of cells) board[cell.r]![cell.c] = null;
  for (const cell of cells) {
    board[cell.r]![cell.c] = makePiece(replacementColor(board, cell, rng, selectedColor));
  }
  const score = scoreForClear(cells.length, 1, "three");

  return {
    board,
    scoreDelta: score,
    comboPeak: 1,
    energyDelta: 8 + cells.length + 2,
    cleared: cells.length,
    events: [
      { type: "clear", combo: 1, score, cells },
      { type: "fill", combo: 1, score: 0, cells },
    ],
  };
}

export function resolveTargetedPower(
  board: Board,
  rng: () => number,
  id: TargetedPowerId,
  target: Coord,
): ResolveResult | null {
  if (id === "megaStrike") return resolveMegaStrike(board, rng, target);
  const cells = targetedPowerCells(board, id, target);
  return cells ? resolveBoard(board, rng, cells) : null;
}
