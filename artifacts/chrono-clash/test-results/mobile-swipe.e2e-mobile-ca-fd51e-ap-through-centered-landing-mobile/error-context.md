# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: mobile-swipe.e2e.spec.ts >> mobile cascade visibility >> keeps a three-row cascade visible from swap through centered landing
- Location: tests/mobile-swipe.e2e.spec.ts:273:3

# Error details

```
Error: expect(received).toBeGreaterThan(expected)

Expected: > 0
Received:   0
```

# Page snapshot

```yaml
- generic [ref=e3]:
  - generic:
    - paragraph: OLIVIA NOVA
    - paragraph: PRESENTS
  - generic [ref=e5]:
    - generic [ref=e7]:
      - button "Chat" [ref=e8] [cursor=pointer]
      - button "Mute audio" [pressed] [ref=e10] [cursor=pointer]: AUDIO OFF
      - button "Settings" [ref=e11] [cursor=pointer]
    - generic [ref=e13]:
      - generic [ref=e14]:
        - generic [ref=e15]: ◈
        - generic [ref=e17]:
          - generic [ref=e18]: YOU
          - generic [ref=e19]: "53"
      - generic [ref=e23]:
        - generic [ref=e24]: VS
        - button "00:58" [ref=e25] [cursor=pointer]
      - generic [ref=e27]:
        - generic [ref=e28]:
          - generic [ref=e29]: RIVAL
          - generic [ref=e30]: "31"
        - generic [ref=e34]: ◆
    - generic [ref=e37]:
      - generic [ref=e38]: ENERGY
      - generic [ref=e41]: 13 / 100
    - generic [ref=e44]:
      - button "ENERGY BURST 40" [disabled] [ref=e45]:
        - generic [ref=e47]: ENERGY BURST
        - generic [ref=e49]: "40"
      - button "MEGA STRIKE 50" [disabled] [ref=e51]:
        - generic [ref=e53]: MEGA STRIKE
        - generic [ref=e55]: "50"
      - button "REWIND 26 ENERGY" [disabled] [ref=e57] [cursor=pointer]:
        - generic [ref=e58]: ↺
        - generic [ref=e59]: REWIND
        - generic [ref=e60]: 26 ENERGY
```

# Test source

```ts
  281 |         __chrono?: { session?: { phase?: string }; renderState?: () => { tiles: unknown[] } };
  282 |       }).__chrono;
  283 |       return chrono?.session?.phase === "playing" && (chrono.renderState?.().tiles.length ?? 0) >= 64;
  284 |     })).toBe(true);
  285 | 
  286 |     const fixtureColors = [
  287 |       [4, 1, 4, 6, 6, 2, 4, 5],
  288 |       [3, 6, 3, 3, 1, 3, 2, 1],
  289 |       [3, 1, 3, 5, 2, 2, 1, 3],
  290 |       [4, 5, 2, 2, 4, 4, 5, 2],
  291 |       [5, 3, 5, 6, 2, 5, 1, 2],
  292 |       [3, 2, 1, 5, 4, 1, 2, 1],
  293 |       [4, 6, 2, 6, 5, 3, 2, 5],
  294 |       [6, 6, 5, 6, 6, 1, 1, 6],
  295 |     ];
  296 |     const fixture = await page.evaluate((colors) => {
  297 |       const chrono = (window as Window & {
  298 |         __chrono?: {
  299 |           session?: {
  300 |             player: { board: Array<Array<{ id: number; color: number; kind: string }>> };
  301 |           };
  302 |         };
  303 |       }).__chrono;
  304 |       const board = chrono?.session?.player.board;
  305 |       if (!board) throw new Error("Missing live session board");
  306 |       colors.forEach((row, r) => row.forEach((color, c) => {
  307 |         const piece = board[r]?.[c];
  308 |         if (!piece) throw new Error(`Missing fixture cell ${r},${c}`);
  309 |         piece.color = color;
  310 |         piece.kind = "normal";
  311 |       }));
  312 |       return { fallingId: board[0]![4]!.id };
  313 |     }, fixtureColors);
  314 | 
  315 |     const board = page.locator("#playerBoard");
  316 |     const box = await board.boundingBox();
  317 |     expect(box).not.toBeNull();
  318 |     const accepted = await page.evaluate(({ fromRow, fromCol, toRow, toCol }) => {
  319 |       const session = (window as Window & {
  320 |         __chrono?: {
  321 |           session?: { tryPlayerSwap: (a: { r: number; c: number }, b: { r: number; c: number }, now: number) => boolean };
  322 |           flashSwap?: (a: { r: number; c: number }, b: { r: number; c: number }) => void;
  323 |         };
  324 |       }).__chrono?.session;
  325 |       return session?.tryPlayerSwap({ r: fromRow, c: fromCol }, { r: toRow, c: toCol }, performance.now()) ?? false;
  326 |     }, { fromRow: 3, fromCol: 3, toRow: 3, toCol: 4 });
  327 |     expect(accepted).toBe(true);
  328 |     await page.evaluate(() => {
  329 |       const chrono = (window as Window & {
  330 |         __chrono?: { flashSwap?: (a: { r: number; c: number }, b: { r: number; c: number }) => void };
  331 |       }).__chrono;
  332 |       chrono?.flashSwap?.({ r: 3, c: 3 }, { r: 3, c: 4 });
  333 |     });
  334 | 
  335 |     const state = () => page.evaluate(() => {
  336 |       const renderState = (window as Window & {
  337 |         __chrono?: { renderState?: () => {
  338 |           cell: number;
  339 |           tiles: Array<{
  340 |             id: number;
  341 |             x: number;
  342 |             y: number;
  343 |             fromX: number;
  344 |             fromY: number;
  345 |             toX: number;
  346 |             toY: number;
  347 |             moveKind: string;
  348 |             dying: boolean;
  349 |             settleAge: number;
  350 |             settleDur: number;
  351 |           }>;
  352 |           moving: unknown[];
  353 |           dying: unknown[];
  354 |           visibleEmptySockets: Array<{ r: number; c: number }>;
  355 |         } };
  356 |       }).__chrono?.renderState;
  357 |       return renderState?.() ?? null;
  358 |     });
  359 |     const transientPoll = { intervals: [10, 20, 40, 80], timeout: 1_500 };
  360 |     let observedSwapFrame: Awaited<ReturnType<typeof state>> = null;
  361 | 
  362 |     await expect.poll(async () => {
  363 |       const snapshot = await state();
  364 |       return snapshot?.tiles.some((tile) => tile.moveKind === "swap") ?? false;
  365 |     }, transientPoll).toBe(true);
  366 |     await expect.poll(async () => {
  367 |       const snapshot = await state();
  368 |       if (!snapshot) return false;
  369 |       const swapTiles = snapshot.tiles.filter((tile) => tile.moveKind === "swap");
  370 |       if (swapTiles.length > 0) observedSwapFrame = snapshot;
  371 |       return swapTiles.length > 0 && swapTiles.every((tile) => Math.abs(tile.x - tile.fromX) > snapshot.cell * 0.08);
  372 |     }, transientPoll).toBe(true);
  373 |     const swapFrame = observedSwapFrame ?? (await state());
  374 |     expect(swapFrame).not.toBeNull();
  375 |     const swapTiles = swapFrame!.tiles.filter((tile) => tile.moveKind === "swap");
  376 |     expect(swapTiles.length).toBeGreaterThanOrEqual(1);
  377 |     expect(swapTiles.filter((tile) => Math.abs(tile.x - tile.fromX) > swapFrame!.cell * 0.08)).toHaveLength(swapTiles.length);
  378 | 
  379 |     await expect.poll(async () => (await state())?.visibleEmptySockets.length ?? 0, transientPoll).toBeGreaterThan(0);
  380 |     const impactFrame = await state();
> 381 |     expect(impactFrame!.dying.length).toBeGreaterThan(0);
      |                                       ^ Error: expect(received).toBeGreaterThan(expected)
  382 |     expect(impactFrame!.visibleEmptySockets.some((cell) => cell.r === 2 && cell.c === 4)).toBe(true);
  383 | 
  384 |     await expect.poll(async () => {
  385 |       const snapshot = await state();
  386 |       return snapshot?.tiles.some((tile) =>
  387 |         tile.id === fixture.fallingId &&
  388 |         tile.moveKind === "fall" &&
  389 |         tile.fromY < tile.y &&
  390 |         tile.y < tile.toY,
  391 |       ) ?? false;
  392 |     }, transientPoll).toBe(true);
  393 |     const fallFrame = await state();
  394 |     const fallingTile = fallFrame!.tiles.find((tile) => tile.id === fixture.fallingId);
  395 |     expect(fallingTile).toMatchObject({ moveKind: "fall", dying: false });
  396 |     expect(fallingTile!.fromY).toBeLessThan(fallingTile!.toY);
  397 |     expect(fallingTile!.y).toBeGreaterThan(fallingTile!.fromY);
  398 |     expect(fallingTile!.y).toBeLessThan(fallingTile!.toY);
  399 | 
  400 |     await expect.poll(async () => {
  401 |       const tile = (await state())?.tiles.find((candidate) => candidate.id === fixture.fallingId);
  402 |       return tile?.moveKind === "idle" && Math.abs(tile.x - tile.toX) < 1 && Math.abs(tile.y - tile.toY) < 1;
  403 |     }, transientPoll).toBe(true);
  404 |     const landingFrame = await state();
  405 |     const landed = landingFrame!.tiles.find((tile) => tile.id === fixture.fallingId);
  406 |     expect(landed).toMatchObject({ moveKind: "idle", settleDur: expect.any(Number) });
  407 |     expect(Math.abs(landed!.x - landed!.toX)).toBeLessThan(1);
  408 |     expect(Math.abs(landed!.y - landed!.toY)).toBeLessThan(1);
  409 |   });
  410 | });
```