import { shapeBonus } from "./combat";
import {
  Board,
  COLOR_COUNT,
  COLS,
  Coord,
  MatchGroup,
  MatchShape,
  Piece,
  PieceKind,
  ResolveEvent,
  ResolveResult,
  ROWS,
} from "./types";

let nextId = 1;

export function resetIds(start = 1): void {
  nextId = start;
}

export function makePiece(color: number, kind: PieceKind = "normal"): Piece {
  return { id: nextId++, color, kind };
}

export function emptyBoard(): Board {
  return Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => null));
}

export function cloneBoard(board: Board): Board {
  return board.map((row) => row.map((cell) => (cell ? { ...cell } : null)));
}

export function inBounds(r: number, c: number): boolean {
  return r >= 0 && r < ROWS && c >= 0 && c < COLS;
}

export function adjacent(a: Coord, b: Coord): boolean {
  return Math.abs(a.r - b.r) + Math.abs(a.c - b.c) === 1;
}

export function swapCells(board: Board, a: Coord, b: Coord): void {
  const tmp = board[a.r]![a.c] ?? null;
  board[a.r]![a.c] = board[b.r]![b.c] ?? null;
  board[b.r]![b.c] = tmp;
}

function randomColor(rng: () => number): number {
  return 1 + Math.floor(rng() * COLOR_COUNT);
}

function wouldMatchAt(board: Board, r: number, c: number, color: number): boolean {
  if (c >= 2) {
    const a = board[r]![c - 1];
    const b = board[r]![c - 2];
    if (a && b && a.color === color && b.color === color) return true;
  }
  if (r >= 2) {
    const a = board[r - 1]![c];
    const b = board[r - 2]![c];
    if (a && b && a.color === color && b.color === color) return true;
  }
  return false;
}

export function createSeededRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateBoard(rng: () => number): Board {
  for (let attempt = 0; attempt < 80; attempt++) {
    const board = emptyBoard();
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        let color = randomColor(rng);
        let guard = 0;
        while (wouldMatchAt(board, r, c, color) && guard++ < 20) {
          color = randomColor(rng);
        }
        board[r]![c] = makePiece(color);
      }
    }
    if (!hasAnyMatch(board) && findAnyValidSwap(board)) {
      return board;
    }
  }
  return forcePlayableBoard(rng);
}

function forcePlayableBoard(rng: () => number): Board {
  const board = emptyBoard();
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      board[r]![c] = makePiece(((r + c) % COLOR_COUNT) + 1);
    }
  }
  const a = board[0]![0]!;
  const b = board[0]![1]!;
  a.color = 1;
  b.color = 1;
  board[1]![0] = makePiece(1);
  board[0]![2] = makePiece(Math.max(2, randomColor(rng)));
  return board;
}

export function hasAnyMatch(board: Board): boolean {
  for (let r = 0; r < ROWS; r++) {
    let run = 1;
    let prev = board[r]![0]?.color ?? -1;
    for (let c = 1; c < COLS; c++) {
      const color = board[r]![c]?.color ?? -2;
      if (color === prev && color > 0) {
        run += 1;
        if (run >= 3) return true;
      } else {
        run = 1;
        prev = color;
      }
    }
  }
  for (let c = 0; c < COLS; c++) {
    let run = 1;
    let prev = board[0]![c]?.color ?? -1;
    for (let r = 1; r < ROWS; r++) {
      const color = board[r]![c]?.color ?? -2;
      if (color === prev && color > 0) {
        run += 1;
        if (run >= 3) return true;
      } else {
        run = 1;
        prev = color;
      }
    }
  }
  return false;
}

export function findMatches(board: Board): MatchGroup[] {
  const groups: MatchGroup[] = [];

  for (let r = 0; r < ROWS; r++) {
    let run = 1;
    for (let c = 1; c <= COLS; c++) {
      const cur = c < COLS ? board[r]![c] : null;
      const prev = board[r]![c - 1];
      if (cur && prev && cur.color === prev.color) {
        run++;
      } else {
        if (run >= 3 && prev) {
          const cells: Coord[] = [];
          for (let k = 0; k < run; k++) {
            cells.push({ r, c: c - 1 - k });
          }
          groups.push({ cells, color: prev.color });
        }
        run = 1;
      }
    }
  }

  for (let c = 0; c < COLS; c++) {
    let run = 1;
    for (let r = 1; r <= ROWS; r++) {
      const cur = r < ROWS ? board[r]![c] : null;
      const prev = board[r - 1]![c];
      if (cur && prev && cur.color === prev.color) {
        run++;
      } else {
        if (run >= 3 && prev) {
          const cells: Coord[] = [];
          for (let k = 0; k < run; k++) {
            cells.push({ r: r - 1 - k, c });
          }
          groups.push({ cells, color: prev.color });
        }
        run = 1;
      }
    }
  }

  return mergeOverlapping(groups);
}

function mergeOverlapping(groups: MatchGroup[]): MatchGroup[] {
  if (groups.length <= 1) return groups.map(decorateSpecial);
  const used = new Set<number>();
  const merged: MatchGroup[] = [];
  for (let i = 0; i < groups.length; i++) {
    if (used.has(i)) continue;
    const cells = [...groups[i]!.cells];
    const keys = new Set(cells.map(keyOf));
    let color = groups[i]!.color;
    let changed = true;
    while (changed) {
      changed = false;
      for (let j = i + 1; j < groups.length; j++) {
        if (used.has(j)) continue;
        if (groups[j]!.color !== color) continue;
        if (groups[j]!.cells.some((p) => keys.has(keyOf(p)))) {
          used.add(j);
          for (const p of groups[j]!.cells) {
            if (!keys.has(keyOf(p))) {
              keys.add(keyOf(p));
              cells.push(p);
            }
          }
          changed = true;
        }
      }
    }
    merged.push({ cells, color });
  }
  return merged.map(decorateSpecial);
}

function keyOf(p: Coord): string {
  return `${p.r},${p.c}`;
}

function decorateSpecial(group: MatchGroup): MatchGroup {
  const rows = new Map<number, number>();
  const cols = new Map<number, number>();
  for (const p of group.cells) {
    rows.set(p.r, (rows.get(p.r) ?? 0) + 1);
    cols.set(p.c, (cols.get(p.c) ?? 0) + 1);
  }
  const maxRow = Math.max(...rows.values());
  const maxCol = Math.max(...cols.values());
  const hasRow4 = [...rows.values()].some((n) => n >= 4);
  const hasCol4 = [...cols.values()].some((n) => n >= 4);
  const hasRow5 = [...rows.values()].some((n) => n >= 5);
  const hasCol5 = [...cols.values()].some((n) => n >= 5);
  const isLT = maxRow >= 3 && maxCol >= 3;

  let special: PieceKind | undefined;
  let shape: MatchShape = "three";
  if (isLT) {
    special = "bomb";
    shape = "tee";
  } else if (hasRow5 || hasCol5) {
    special = "bomb";
    shape = "five";
  } else if (hasRow4) {
    special = "lineH";
    shape = "four";
  } else if (hasCol4) {
    special = "lineV";
    shape = "four";
  }

  const specialAt = special
    ? group.cells.reduce((best, p) => (p.r + p.c < best.r + best.c ? p : best), group.cells[0]!)
    : undefined;
  return { ...group, special, specialAt, shape };
}

export function matchingNeighbors(board: Board, a: Coord): Coord[] {
  const dirs: Coord[] = [
    { r: a.r - 1, c: a.c },
    { r: a.r + 1, c: a.c },
    { r: a.r, c: a.c - 1 },
    { r: a.r, c: a.c + 1 },
  ];
  if (board[a.r]?.[a.c]?.kind !== "normal") {
    return dirs.filter((p) => inBounds(p.r, p.c));
  }
  const hits: Coord[] = [];
  for (const b of dirs) {
    if (!inBounds(b.r, b.c)) continue;
    swapCells(board, a, b);
    const hit = hasAnyMatch(board);
    swapCells(board, a, b);
    if (hit) hits.push(b);
  }
  return hits;
}

export function findAnyValidSwap(board: Board): { a: Coord; b: Coord } | null {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const a = { r, c };
      const neighbors = [
        { r, c: c + 1 },
        { r: r + 1, c },
      ];
      for (const b of neighbors) {
        if (!inBounds(b.r, b.c)) continue;
        swapCells(board, a, b);
        const ok = hasAnyMatch(board) || involvesSpecial(board, a, b);
        swapCells(board, a, b);
        if (ok) return { a, b };
      }
    }
  }
  return null;
}

function involvesSpecial(board: Board, a: Coord, b: Coord): boolean {
  const pa = board[a.r]![a.c];
  const pb = board[b.r]![b.c];
  return Boolean((pa && pa.kind !== "normal") || (pb && pb.kind !== "normal"));
}

function specialBlast(origin: Coord, kind: PieceKind): Coord[] {
  const cells: Coord[] = [origin];
  if (kind === "lineH") {
    for (let c = 0; c < COLS; c++) cells.push({ r: origin.r, c });
  } else if (kind === "lineV") {
    for (let r = 0; r < ROWS; r++) cells.push({ r, c: origin.c });
  } else if (kind === "bomb") {
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const r = origin.r + dr;
        const c = origin.c + dc;
        if (inBounds(r, c)) cells.push({ r, c });
      }
    }
  }
  return cells;
}

function collectClears(board: Board, extra: Coord[] = []): Coord[] {
  const keys = new Set<string>();
  const cells: Coord[] = [];
  const add = (p: Coord) => {
    const k = keyOf(p);
    if (keys.has(k) || !inBounds(p.r, p.c)) return;
    keys.add(k);
    cells.push(p);
  };
  for (const p of extra) add(p);
  for (const group of findMatches(board)) {
    for (const p of group.cells) add(p);
    if (group.specialAt) add(group.specialAt);
  }
  let i = 0;
  while (i < cells.length) {
    const p = cells[i++]!;
    const piece = board[p.r]![p.c];
    if (piece && piece.kind !== "normal") {
      for (const q of specialBlast(p, piece.kind)) add(q);
    }
  }
  return cells;
}

export function scoreForClear(count: number, combo: number, shape: MatchShape = "three"): number {
  const base = count * 18 + Math.max(0, count - 3) * 22 + shapeBonus(shape);
  return Math.round(base * combo);
}

function energyForClear(count: number, combo: number): number {
  return 8 + count + combo * 2;
}

export function applyGravity(board: Board, rng: () => number): { moved: boolean; filled: Coord[] } {
  let moved = false;
  const filled: Coord[] = [];
  for (let c = 0; c < COLS; c++) {
    let write = ROWS - 1;
    for (let r = ROWS - 1; r >= 0; r--) {
      const piece = board[r]![c];
      if (piece) {
        if (write !== r) {
          board[write]![c] = piece;
          board[r]![c] = null;
          moved = true;
        }
        write--;
      }
    }
    for (let r = write; r >= 0; r--) {
      board[r]![c] = makePiece(randomColor(rng));
      filled.push({ r, c });
      moved = true;
    }
  }
  return { moved, filled };
}

/**
 * Estimate the renderer's real presentation window for a resolved board.
 *
 * The resolver mutates the board synchronously, while the renderer presents
 * the committed swap, crystal impact, fall, and landing over elapsed time.
 * Input must remain closed until the longest surviving/new gem has landed;
 * otherwise a fast second swap starts a second pose/VFX sequence on top of
 * the first one.
 */
export function resolvePresentationLockMs(before: Board, after: Board, events: ResolveEvent[]): number {
  const previous = new Map<number, { r: number; c: number }>();
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const piece = before[r]![c];
      if (piece) previous.set(piece.id, { r, c });
    }
  }

  let maxTravelCells = 1;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const piece = after[r]![c];
      if (!piece) continue;
      const from = previous.get(piece.id);
      const travel = from ? Math.abs(r - from.r) : r + 1.15;
      maxTravelCells = Math.max(maxTravelCells, travel);
    }
  }

  const hasClear = events.some((event) => event.type === "clear");
  const fallMs = Math.min(520, 160 + Math.max(0, maxTravelCells - 1) * 65);
  const swapMs = 175;
  // The renderer keeps the clear presentation behind the committed swap
  // window before gravity starts: swap travel + the crystal impact pulse.
  const impactMs = hasClear ? swapMs + 54 : 0;
  const landingMs = maxTravelCells > 1 ? 60 : 0;
  const dieMs = hasClear ? 120 + 16 : 0;

  return Math.max(swapMs, impactMs + Math.max(fallMs + landingMs, dieMs));
}

export function resolveBoard(
  board: Board,
  rng: () => number,
  extraClears: Coord[] = [],
): ResolveResult {
  let combo = 0;
  let scoreDelta = 0;
  let energyDelta = 0;
  let cleared = 0;
  let comboPeak = 0;
  const events: ResolveEvent[] = [];
  const working = board;

  while (true) {
    const matches = findMatches(working);
    const toClear = collectClears(working, combo === 0 ? extraClears : []);
    extraClears = [];
    if (toClear.length === 0) break;
    combo += 1;
    comboPeak = Math.max(comboPeak, combo);
    const specialSpawns: { at: Coord; kind: PieceKind; color: number }[] = [];
    for (const group of matches) {
      if (group.special && group.specialAt) {
        specialSpawns.push({ at: group.specialAt, kind: group.special, color: group.color });
      }
    }
    const waveShape: MatchShape = matches.reduce<MatchShape>((best, group) => {
      const shape = group.shape ?? "three";
      const rank = { three: 0, four: 1, tee: 2, five: 3 };
      return rank[shape] > rank[best] ? shape : best;
    }, "three");
    const score = scoreForClear(toClear.length, combo, waveShape);
    const energy = energyForClear(toClear.length, combo);
    scoreDelta += score;
    energyDelta += energy;
    cleared += toClear.length;
    events.push({ type: "clear", combo, score, cells: toClear });

    for (const p of toClear) {
      working[p.r]![p.c] = null;
    }
    for (const spawn of specialSpawns) {
      working[spawn.at.r]![spawn.at.c] = makePiece(spawn.color, spawn.kind);
      events.push({
        type: "spawnSpecial",
        combo,
        score: 0,
        cells: [spawn.at],
        special: spawn.kind,
      });
    }
    const fall = applyGravity(working, rng);
    if (fall.moved) {
      events.push({ type: "fall", combo, score: 0 });
    }
    if (fall.filled.length) {
      events.push({ type: "fill", combo, score: 0, cells: fall.filled });
    }
  }

  if (!findAnyValidSwap(working)) {
    const reshuffled = generateBoard(rng);
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        working[r]![c] = reshuffled[r]![c] ?? null;
      }
    }
    events.push({ type: "fill", combo: comboPeak, score: 0 });
  }

  return { board: working, scoreDelta, comboPeak, energyDelta, cleared, events };
}

export function trySwap(
  board: Board,
  a: Coord,
  b: Coord,
  rng: () => number,
): ResolveResult | null {
  if (!adjacent(a, b)) return null;
  const pa = board[a.r]![a.c];
  const pb = board[b.r]![b.c];
  if (!pa || !pb) return null;

  swapCells(board, a, b);
  const extra: Coord[] = [];
  if (pa.kind !== "normal") extra.push(b);
  if (pb.kind !== "normal") extra.push(a);
  const matches = findMatches(board);
  if (matches.length === 0 && extra.length === 0) {
    swapCells(board, a, b);
    return null;
  }
  return resolveBoard(board, rng, extra);
}

export function snapshotBoard(board: Board): Board {
  return cloneBoard(board);
}
