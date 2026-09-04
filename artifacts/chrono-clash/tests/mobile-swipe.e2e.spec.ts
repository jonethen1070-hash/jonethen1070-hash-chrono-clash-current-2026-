import { expect, test } from "@playwright/test";

type BoardBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type TouchPoint = {
  x: number;
  y: number;
  id: number;
};

const BOARD_FRAME = 6;
const BOARD_GAP = 1.5;
const BOARD_SIZE = 8;

function cellCenter(board: BoardBox, row: number, col: number): { x: number; y: number } {
  const inner = board.width - BOARD_FRAME * 2;
  const cell = (inner - BOARD_GAP * (BOARD_SIZE + 1)) / BOARD_SIZE;
  const pitch = cell + BOARD_GAP;
  return {
    x: board.x + BOARD_FRAME + BOARD_GAP + col * pitch + cell / 2,
    y: board.y + BOARD_FRAME + BOARD_GAP + row * pitch + cell / 2,
  };
}

async function touchSwipe(
  cdp: { send(method: string, params?: object): Promise<unknown> },
  from: { x: number; y: number },
  to: { x: number; y: number },
  id: number,
): Promise<void> {
  const start: TouchPoint = { x: from.x, y: from.y, id };
  const end: TouchPoint = { x: to.x, y: to.y, id };
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [start],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [end],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "chrono-clash-settings-v2",
      JSON.stringify({
        sfx: false,
        music: false,
        sfxVolume: 0.84,
        musicVolume: 0.72,
        haptics: false,
        effects: "low",
        animation: "low",
        showComboEffects: false,
        scoreTarget: 3000,
        introSeen: true,
      }),
    );
  });
});

test("guest mobile matches survive rapid swipes, cancellation, and layout checks", async ({ page, context }) => {
  await page.goto("/");
  await expect(page.locator("#menu.active")).toBeVisible();

  await page.locator("#menuGuest").click();
  await expect(page.locator("#match.active")).toBeVisible();
  await expect.poll(async () => page.locator("#overlay").evaluate((el) => el.classList.contains("hidden"))).toBe(true);

  const board = page.locator("#playerBoard");
  const boardBox = await board.boundingBox();
  expect(boardBox).not.toBeNull();
  const box = boardBox!;
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  const view = viewport!;

  const geometry = await board.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const canvas = element.querySelector("canvas")?.getBoundingClientRect();
    return {
      width: rect.width,
      height: rect.height,
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
      canvasWidth: canvas?.width ?? 0,
      canvasHeight: canvas?.height ?? 0,
      touchAction: getComputedStyle(element).touchAction,
    };
  });

  expect(geometry.width).toBeGreaterThan(300);
  expect(geometry.width).toBeLessThanOrEqual(view.width);
  expect(geometry.height).toBeCloseTo(geometry.width, 0);
  expect(geometry.left).toBeGreaterThanOrEqual(0);
  expect(geometry.right).toBeLessThanOrEqual(view.width + 1);
  expect(geometry.top).toBeGreaterThanOrEqual(0);
  expect(geometry.bottom).toBeLessThanOrEqual(view.height + 1);
  expect(geometry.canvasWidth).toBeGreaterThan(geometry.width * 0.9);
  expect(geometry.canvasHeight).toBeGreaterThan(geometry.height * 0.9);
  expect(geometry.canvasWidth).toBeLessThanOrEqual(geometry.width);
  expect(geometry.canvasHeight).toBeLessThanOrEqual(geometry.height);
  expect(geometry.touchAction).toBe("none");

  const visiblePowerIds = await page.locator(".powers > button").evaluateAll((buttons) =>
    buttons.map((button) => button.id),
  );
  expect(visiblePowerIds).toEqual(["energyBurstAttack", "megaStrikeAttack", "rewind"]);
  expect(await page.locator(".energy-options").count()).toBe(0);
  expect(await page.locator("#freeze").count()).toBe(0);
  expect(await page.locator("#timeshift").count()).toBe(0);
  expect(geometry.width).toBeGreaterThan(374);

  const actionGeometry = await page.locator(".powers > button").evaluateAll((buttons) =>
    buttons.map((button) => {
      const rect = button.getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right };
    }),
  );
  expect(actionGeometry.every(({ top, bottom, left, right }) => top >= 0 && bottom <= view.height + 1 && left >= 0 && right <= view.width + 1)).toBe(true);
  expect(actionGeometry[0].top).toBeGreaterThan(geometry.bottom);

  const energyHandlerState = await page.evaluate(async () => {
    const button = document.querySelector<HTMLButtonElement>("#energyBurstAttack");
    if (!button) throw new Error("Missing Energy Burst button");
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    return {
      pressed: button.getAttribute("aria-pressed"),
      unavailable: button.classList.contains("unavailable"),
    };
  });
  expect(energyHandlerState.pressed).toBe("false");
  expect(energyHandlerState.unavailable).toBe(true);

  const centers = Array.from({ length: BOARD_SIZE * BOARD_SIZE }, (_, index) =>
    cellCenter(box, Math.floor(index / BOARD_SIZE), index % BOARD_SIZE),
  );
  expect(centers).toHaveLength(64);
  expect(centers.every(({ x, y }) => x > box.x && x < box.x + box.width && y > box.y && y < box.y + box.height)).toBe(true);

  await page.evaluate(() => {
    const boardElement = document.querySelector("#playerBoard");
    if (!boardElement) throw new Error("Missing player board");
    const state = { pointerdown: 0, pointerup: 0, pointercancel: 0, scroll: 0 };
    (window as Window & { __mobileSwipeSmoke?: typeof state }).__mobileSwipeSmoke = state;
    boardElement.addEventListener("pointerdown", () => state.pointerdown++);
    boardElement.addEventListener("pointerup", () => state.pointerup++);
    boardElement.addEventListener("pointercancel", () => state.pointercancel++);
    window.addEventListener("scroll", () => state.scroll++, { passive: true });
    window.scrollTo(0, 0);
  });

  const cdp = await context.newCDPSession(page);
  const swipeFrom = cellCenter(box, 3, 3);
  const swipeRight = cellCenter(box, 3, 4);
  const swipeDown = cellCenter(box, 4, 3);

  const hintSwipe = await page.evaluate(() => {
    const chrono = (window as Window & {
      __chrono?: { session?: { hintCells: (now: number) => Array<{ r: number; c: number }> } };
    }).__chrono;
    const hint = chrono?.session?.hintCells(performance.now()) ?? [];
    return { from: hint[0] ?? { r: 3, c: 3 }, to: hint[1] ?? { r: 3, c: 4 } };
  });
  const hintFrom = cellCenter(box, hintSwipe.from.r, hintSwipe.from.c);
  const hintTo = cellCenter(box, hintSwipe.to.r, hintSwipe.to.c);
  const beforeImmediateSwipe = await page.evaluate(() => {
    const session = (window as Window & {
      __chrono?: { session?: { snapshot: (now: number) => { player: { score: number }; drag: unknown; bounce: unknown } } };
    }).__chrono?.session;
    const snapshot = session?.snapshot(performance.now());
    return { score: snapshot?.player.score ?? 0, dragging: Boolean(snapshot?.drag), bouncing: Boolean(snapshot?.bounce) };
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: hintFrom.x, y: hintFrom.y, id: 7 }],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: hintTo.x, y: hintTo.y, id: 7 }],
  });
  const afterDirectionDetection = await page.evaluate(() => {
    const session = (window as Window & {
      __chrono?: { session?: { snapshot: (now: number) => { player: { score: number }; drag: unknown; bounce: unknown } } };
    }).__chrono?.session;
    const snapshot = session?.snapshot(performance.now());
    return { score: snapshot?.player.score ?? 0, dragging: Boolean(snapshot?.drag), bouncing: Boolean(snapshot?.bounce) };
  });
  expect(beforeImmediateSwipe.dragging).toBe(false);
  expect(afterDirectionDetection.dragging).toBe(false);
  expect(afterDirectionDetection.bouncing).toBe(false);
  expect(afterDirectionDetection.score).toBeGreaterThanOrEqual(beforeImmediateSwipe.score);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });

  await touchSwipe(cdp, swipeFrom, swipeRight, 1);
  await touchSwipe(cdp, swipeRight, swipeFrom, 2);
  await touchSwipe(cdp, swipeFrom, swipeDown, 3);
  await touchSwipe(cdp, swipeDown, swipeFrom, 4);

  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: swipeFrom.x, y: swipeFrom.y, id: 5 }],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: swipeDown.x, y: swipeDown.y, id: 5 }],
  });
  await page.evaluate(() => {
    document.querySelector("#playerBoard")?.dispatchEvent(
      new PointerEvent("pointercancel", {
        bubbles: true,
        pointerId: 5,
        pointerType: "touch",
      }),
    );
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchCancel",
    touchPoints: [],
  });

  await touchSwipe(cdp, swipeFrom, swipeRight, 6);

  const state = await page.evaluate(() => {
    const smoke = (window as Window & {
      __mobileSwipeSmoke?: { pointerdown: number; pointerup: number; pointercancel: number; scroll: number };
    }).__mobileSwipeSmoke;
    return {
      ...smoke,
      scrollY: window.scrollY,
      scrollTop: document.scrollingElement?.scrollTop ?? 0,
    };
  });
  expect(state.pointerdown).toBeGreaterThanOrEqual(6);
  expect(state.pointerup).toBeGreaterThanOrEqual(4);
  expect(state.pointercancel).toBeGreaterThanOrEqual(1);
  expect(state.scroll).toBe(0);
  expect(state.scrollY).toBe(0);
  expect(state.scrollTop).toBe(0);
});

test.describe("mobile cascade visibility", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
  });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const settings = JSON.parse(localStorage.getItem("chrono-clash-settings-v2") ?? "{}");
      localStorage.setItem("chrono-clash-settings-v2", JSON.stringify({ ...settings, animation: "high", effects: "high" }));
    });
  });

  test("keeps a three-row cascade visible from swap through centered landing", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#menu.active")).toBeVisible();
    await page.locator("#menuGuest").click();
    await expect(page.locator("#match.active")).toBeVisible();
    await expect.poll(async () => page.locator("#overlay").evaluate((el) => el.classList.contains("hidden"))).toBe(true);
    await expect.poll(async () => page.evaluate(() => {
      const chrono = (window as Window & {
        __chrono?: { session?: { phase?: string }; renderState?: () => { tiles: unknown[] } };
      }).__chrono;
      return chrono?.session?.phase === "playing" && (chrono.renderState?.().tiles.length ?? 0) >= 64;
    })).toBe(true);

    const fixtureColors = [
      [4, 1, 4, 6, 6, 2, 4, 5],
      [3, 6, 3, 3, 1, 3, 2, 1],
      [3, 1, 3, 5, 2, 2, 1, 3],
      [4, 5, 2, 2, 4, 4, 5, 2],
      [5, 3, 5, 6, 2, 5, 1, 2],
      [3, 2, 1, 5, 4, 1, 2, 1],
      [4, 6, 2, 6, 5, 3, 2, 5],
      [6, 6, 5, 6, 6, 1, 1, 6],
    ];
    const fixture = await page.evaluate((colors) => {
      const chrono = (window as Window & {
        __chrono?: {
          session?: {
            player: { board: Array<Array<{ id: number; color: number; kind: string }>> };
          };
        };
      }).__chrono;
      const board = chrono?.session?.player.board;
      if (!board) throw new Error("Missing live session board");
      colors.forEach((row, r) => row.forEach((color, c) => {
        const piece = board[r]?.[c];
        if (!piece) throw new Error(`Missing fixture cell ${r},${c}`);
        piece.color = color;
        piece.kind = "normal";
      }));
      return { fallingId: board[0]![4]!.id };
    }, fixtureColors);

    const board = page.locator("#playerBoard");
    const box = await board.boundingBox();
    expect(box).not.toBeNull();
    const accepted = await page.evaluate(({ fromRow, fromCol, toRow, toCol }) => {
      const session = (window as Window & {
        __chrono?: { session?: { tryPlayerSwap: (a: { r: number; c: number }, b: { r: number; c: number }, now: number) => boolean } };
      }).__chrono?.session;
      return session?.tryPlayerSwap({ r: fromRow, c: fromCol }, { r: toRow, c: toCol }, performance.now()) ?? false;
    }, { fromRow: 3, fromCol: 3, toRow: 3, toCol: 4 });
    expect(accepted).toBe(true);

    const state = () => page.evaluate(() => {
      const renderState = (window as Window & {
        __chrono?: { renderState?: () => {
          cell: number;
          tiles: Array<{
            id: number;
            x: number;
            y: number;
            fromX: number;
            fromY: number;
            toX: number;
            toY: number;
            moveKind: string;
            dying: boolean;
            settleAge: number;
            settleDur: number;
          }>;
          moving: unknown[];
          dying: unknown[];
          visibleEmptySockets: Array<{ r: number; c: number }>;
        } };
      }).__chrono?.renderState;
      return renderState?.() ?? null;
    });
    const transientPoll = { intervals: [10, 20, 40, 80], timeout: 1_500 };

    await expect.poll(async () => {
      const snapshot = await state();
      return snapshot?.tiles.some((tile) => tile.moveKind === "swap") ?? false;
    }, transientPoll).toBe(true);
    const swapFrame = await state();
    expect(swapFrame).not.toBeNull();
    const swapTiles = swapFrame!.tiles.filter((tile) => tile.moveKind === "swap");
    expect(swapTiles.length).toBeGreaterThanOrEqual(1);
    expect(swapTiles.filter((tile) => Math.abs(tile.x - tile.fromX) > swapFrame!.cell * 0.08)).toHaveLength(swapTiles.length);

    await expect.poll(async () => (await state())?.visibleEmptySockets.length ?? 0, transientPoll).toBeGreaterThan(0);
    const impactFrame = await state();
    expect(impactFrame!.dying.length).toBeGreaterThan(0);
    expect(impactFrame!.visibleEmptySockets.some((cell) => cell.r === 2 && cell.c === 4)).toBe(true);

    await expect.poll(async () => {
      const snapshot = await state();
      return snapshot?.tiles.some((tile) =>
        tile.id === fixture.fallingId &&
        tile.moveKind === "fall" &&
        tile.fromY < tile.y &&
        tile.y < tile.toY,
      ) ?? false;
    }, transientPoll).toBe(true);
    const fallFrame = await state();
    const fallingTile = fallFrame!.tiles.find((tile) => tile.id === fixture.fallingId);
    expect(fallingTile).toMatchObject({ moveKind: "fall", dying: false });
    expect(fallingTile!.fromY).toBeLessThan(fallingTile!.toY);
    expect(fallingTile!.y).toBeGreaterThan(fallingTile!.fromY);
    expect(fallingTile!.y).toBeLessThan(fallingTile!.toY);

    await expect.poll(async () => {
      const tile = (await state())?.tiles.find((candidate) => candidate.id === fixture.fallingId);
      return tile?.moveKind === "idle" && Math.abs(tile.x - tile.toX) < 1 && Math.abs(tile.y - tile.toY) < 1;
    }, transientPoll).toBe(true);
    const landingFrame = await state();
    const landed = landingFrame!.tiles.find((tile) => tile.id === fixture.fallingId);
    expect(landed).toMatchObject({ moveKind: "idle", settleDur: expect.any(Number) });
    expect(Math.abs(landed!.x - landed!.toX)).toBeLessThan(1);
    expect(Math.abs(landed!.y - landed!.toY)).toBeLessThan(1);
  });
});