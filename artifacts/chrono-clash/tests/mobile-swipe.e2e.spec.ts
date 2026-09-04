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