import type { Coord } from "../src/engine/types";

export type LargeMatchVfxFixtureName =
  | "threeGem"
  | "fourGem"
  | "fivePlusGem"
  | "oneCascade"
  | "multipleCascade"
  | "longFall";

export type LargeMatchVfxFixture = {
  board: number[][];
  from: Coord;
  to: Coord;
  rngSeed: number;
  expectedFirstWave: number;
  expectedComboPeak: number;
  expectedMaxFall: number;
};

/**
 * These matrices are generated from match-free boards and verified through the
 * real resolver. Keep the IDs out of the fixture so the browser can reuse a
 * live session's pieces without changing renderer identity tracking.
 */
export const LARGE_MATCH_VFX_FIXTURES: Record<LargeMatchVfxFixtureName, LargeMatchVfxFixture> = {
  threeGem: {
    board: [
      [4, 1, 4, 6, 6, 2, 4, 5],
      [3, 6, 3, 3, 1, 3, 2, 1],
      [3, 1, 3, 5, 2, 2, 1, 3],
      [4, 5, 2, 2, 4, 4, 5, 2],
      [5, 3, 5, 6, 2, 5, 1, 2],
      [3, 2, 1, 5, 4, 1, 2, 1],
      [4, 6, 2, 6, 5, 3, 2, 5],
      [6, 6, 5, 6, 6, 1, 1, 6],
    ],
    from: { r: 1, c: 0 },
    to: { r: 1, c: 1 },
    rngSeed: 8016,
    expectedFirstWave: 3,
    expectedComboPeak: 1,
    expectedMaxFall: 1,
  },
  fourGem: {
    board: [
      [5, 2, 2, 4, 6, 4, 3, 3],
      [5, 1, 5, 2, 3, 6, 4, 1],
      [3, 6, 1, 6, 1, 1, 2, 1],
      [6, 3, 4, 6, 2, 3, 3, 4],
      [1, 1, 6, 5, 1, 6, 1, 6],
      [4, 2, 5, 1, 5, 6, 5, 3],
      [6, 1, 5, 6, 6, 4, 4, 1],
      [6, 6, 4, 2, 6, 6, 3, 3],
    ],
    from: { r: 6, c: 4 },
    to: { r: 6, c: 5 },
    rngSeed: 16472,
    expectedFirstWave: 4,
    expectedComboPeak: 1,
    expectedMaxFall: 3,
  },
  fivePlusGem: {
    board: [
      [5, 5, 2, 4, 1, 4, 5, 3],
      [6, 2, 5, 5, 4, 1, 3, 2],
      [6, 2, 5, 5, 2, 1, 5, 2],
      [2, 1, 3, 6, 2, 6, 2, 3],
      [6, 2, 3, 2, 6, 5, 6, 4],
      [5, 4, 1, 4, 4, 2, 5, 4],
      [1, 6, 3, 3, 6, 2, 2, 6],
      [2, 6, 1, 3, 5, 4, 1, 1],
    ],
    from: { r: 0, c: 1 },
    to: { r: 0, c: 2 },
    rngSeed: 39608,
    expectedFirstWave: 6,
    expectedComboPeak: 1,
    expectedMaxFall: 0,
  },
  oneCascade: {
    board: [
      [4, 1, 4, 6, 6, 2, 4, 5],
      [3, 6, 3, 3, 1, 3, 2, 1],
      [3, 1, 3, 5, 2, 2, 1, 3],
      [4, 5, 2, 2, 4, 4, 5, 2],
      [5, 3, 5, 6, 2, 5, 1, 2],
      [3, 2, 1, 5, 4, 1, 2, 1],
      [4, 6, 2, 6, 5, 3, 2, 5],
      [6, 6, 5, 6, 6, 1, 1, 6],
    ],
    from: { r: 1, c: 0 },
    to: { r: 1, c: 1 },
    rngSeed: 8016,
    expectedFirstWave: 3,
    expectedComboPeak: 1,
    expectedMaxFall: 1,
  },
  multipleCascade: {
    board: [
      [4, 1, 4, 6, 6, 2, 4, 5],
      [3, 6, 3, 3, 1, 3, 2, 1],
      [3, 1, 3, 5, 2, 2, 1, 3],
      [4, 5, 2, 2, 4, 4, 5, 2],
      [5, 3, 5, 6, 2, 5, 1, 2],
      [3, 2, 1, 5, 4, 1, 2, 1],
      [4, 6, 2, 6, 5, 3, 2, 5],
      [6, 6, 5, 6, 6, 1, 1, 6],
    ],
    from: { r: 4, c: 6 },
    to: { r: 4, c: 7 },
    rngSeed: 8385,
    expectedFirstWave: 3,
    expectedComboPeak: 3,
    expectedMaxFall: 4,
  },
  longFall: {
    board: [
      [4, 6, 5, 5, 3, 3, 2, 1],
      [1, 6, 6, 1, 3, 3, 6, 2],
      [5, 1, 3, 5, 4, 2, 3, 3],
      [4, 1, 4, 1, 1, 2, 1, 1],
      [1, 5, 3, 3, 4, 5, 1, 3],
      [6, 2, 5, 5, 1, 4, 6, 4],
      [1, 5, 5, 4, 5, 4, 3, 2],
      [5, 1, 3, 2, 1, 6, 3, 3],
    ],
    from: { r: 5, c: 1 },
    to: { r: 5, c: 2 },
    rngSeed: 79688,
    expectedFirstWave: 3,
    expectedComboPeak: 3,
    expectedMaxFall: 6,
  },
};