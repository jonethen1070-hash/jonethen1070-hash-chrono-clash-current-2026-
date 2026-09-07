import { expect, test, type Page } from "@playwright/test";
import { LARGE_MATCH_VFX_FIXTURES, type LargeMatchVfxFixtureName } from "./vfxFixtures";

type BoardBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type Rect = {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
};

type TouchPoint = {
  x: number;
  y: number;
  id: number;
};

type Move = {
  from: { r: number; c: number };
  to: { r: number; c: number };
};

type RenderTile = {
  id: number;
  x: number;
  y: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  moveKind: string;
  moveAge: number;
  moveDur: number;
  dying: boolean;
  alpha: number;
  dieAge: number;
  dieStaggerMs: number;
  burstEmitted: boolean;
  settleAge: number;
  settleDur: number;
};

type RenderState = {
  cell: number;
  tiles: RenderTile[];
  moving: RenderTile[];
  dying: RenderTile[];
  visibleEmptySockets: Array<{ r: number; c: number }>;
  powerTargeting: {
    kind: "burst" | "mega";
    target: { r: number; c: number } | null;
  } | null;
  vfx: {
    particleCount: number;
    particleCap: number;
    particleCapHits: number;
    recognitionCount: number;
    fractureCount: number;
    staggerCount: number;
    settleCount: number;
    shardCount: number;
    shockwaveCount: number;
    socketPulseCount: number;
  };
};

type RenderSample = {
  at: number;
  state: RenderState | null;
};

const BOARD_FRAME = 6;
const BOARD_GAP = 1.5;
const BOARD_SIZE = 8;

function cellCenter(board: BoardBox, row: number, col: number): { x: number; y: number } {
  const inner = board.width - BOARD_FRAME * 2;
  const cell = (inner - BOARD_GAP * (BOARD_SIZE + 1)) / BOARD_SIZE;
  const rowCell = Math.max(
    cell,
    (board.height - BOARD_FRAME * 2 - BOARD_GAP * (BOARD_SIZE + 1)) / BOARD_SIZE,
  );
  const pitch = cell + BOARD_GAP;
  const rowPitch = rowCell + BOARD_GAP;
  return {
    x: board.x + BOARD_FRAME + BOARD_GAP + col * pitch + cell / 2,
    y: board.y + BOARD_FRAME + BOARD_GAP + row * rowPitch + (rowCell - cell) / 2 + cell / 2,
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

async function collectVfxTimeline(page: Page, timeoutMs: number): Promise<RenderSample[]> {
  return page.evaluate((limit) => new Promise<RenderSample[]>((resolve) => {
    const samples: RenderSample[] = [];
    const started = performance.now();
    let quietFrames = 0;
    const step = (at: number) => {
      const chrono = (window as Window & {
        __chrono?: { renderState?: () => RenderState };
      }).__chrono;
      const state = chrono?.renderState?.() ?? null;
      samples.push({ at, state });
      const settled =
        state !== null &&
        state.tiles.length === 64 &&
        state.dying.length === 0 &&
        state.moving.length === 0 &&
        state.vfx.particleCount === 0 &&
        state.vfx.shardCount === 0 &&
        state.vfx.shockwaveCount === 0 &&
        state.vfx.socketPulseCount === 0;
      if (settled) quietFrames += 1;
      else quietFrames = 0;
      if (quietFrames >= 10 || at - started >= limit) {
        resolve(samples);
        return;
      }
      requestAnimationFrame((nextAt) => window.setTimeout(() => step(nextAt), 0));
    };
    requestAnimationFrame((nextAt) => window.setTimeout(() => step(nextAt), 0));
  }), timeoutMs);
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

const MOBILE_BOARD_VIEWPORTS = [
  { name: "short Android", width: 360, height: 640 },
  { name: "short visual viewport", width: 390, height: 727 },
  { name: "standard phone", width: 390, height: 844 },
  { name: "wide tall phone", width: 430, height: 932 },
  { name: "iPhone-style tall", width: 393, height: 852 },
] as const;

test.describe("mobile board clipping regression", () => {
  test.describe.configure({ timeout: 60_000 });

  for (const target of MOBILE_BOARD_VIEWPORTS) {
    test(`${target.name} ${target.width}x${target.height} keeps the board and abilities visible`, async ({ page }) => {
      await page.setViewportSize({ width: target.width, height: target.height });
      await page.goto("/");
      await expect(page.locator("#menu.active")).toBeVisible();

      await page.locator("#menuGuest").click();
      await expect(page.locator("#match.active")).toBeVisible();
      await expect.poll(async () => page.locator("#overlay").evaluate((el) => el.classList.contains("hidden"))).toBe(true);
      await expect(page.locator("#match .match-brand-row")).toHaveCount(0);
      await expect(page.locator("#match .match-brand")).toHaveCount(0);

      const geometry = await page.evaluate(() => {
        const board = document.querySelector<HTMLElement>("#playerBoard");
        const canvas = document.querySelector<HTMLCanvasElement>("#playerGems");
        const visual = window.visualViewport;
        const boardRect = board?.getBoundingClientRect();
        const canvasRect = canvas?.getBoundingClientRect();
        const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>(".powers > button"));
        const abilityParts = [
          {
            id: "energyBurstAttack",
            parts: [
              { name: "icon", selector: ".energy-attack-glyph" },
              { name: "label", selector: ".energy-attack-copy b" },
              { name: "cost", selector: ".energy-attack-cost" },
            ],
          },
          {
            id: "megaStrikeAttack",
            parts: [
              { name: "icon", selector: ".energy-attack-glyph" },
              { name: "label", selector: ".energy-attack-copy b" },
              { name: "cost", selector: ".energy-attack-cost" },
            ],
          },
          {
            id: "rewind",
            parts: [
              { name: "icon", selector: ".glyph" },
              { name: "label", selector: "b" },
              { name: "cost", selector: ".cost" },
            ],
          },
        ] as const;
        const rectData = (element: Element | null): Rect | null => {
          if (!element) return null;
          const rect = element.getBoundingClientRect();
          return {
            left: rect.left,
            right: rect.right,
            top: rect.top,
            bottom: rect.bottom,
            width: rect.width,
            height: rect.height,
          };
        };
        const dynamicViewport = {
          width: visual?.width ?? window.innerWidth,
          height: visual?.height ?? window.innerHeight,
          offsetLeft: visual?.offsetLeft ?? 0,
          offsetTop: visual?.offsetTop ?? 0,
          innerWidth: window.innerWidth,
          innerHeight: window.innerHeight,
        };
        const matchStyle = document.querySelector<HTMLElement>("#match") && getComputedStyle(document.querySelector<HTMLElement>("#match")!);
        const renderState = (window as Window & {
          __chrono?: { renderState?: () => RenderState };
        }).__chrono?.renderState?.();

        return {
          board: boardRect
            ? {
                left: boardRect.left,
                right: boardRect.right,
                top: boardRect.top,
                bottom: boardRect.bottom,
                width: boardRect.width,
                height: boardRect.height,
              }
            : null,
          canvas: canvasRect
            ? {
                left: canvasRect.left,
                right: canvasRect.right,
                top: canvasRect.top,
                bottom: canvasRect.bottom,
                width: canvasRect.width,
                height: canvasRect.height,
                display: getComputedStyle(canvas!).display,
                visibility: getComputedStyle(canvas!).visibility,
                opacity: getComputedStyle(canvas!).opacity,
              }
            : null,
          buttons: buttons.map((button) => {
            const rect = button.getBoundingClientRect();
            return {
              id: button.id,
              left: rect.left,
              right: rect.right,
              top: rect.top,
              bottom: rect.bottom,
              width: rect.width,
              height: rect.height,
              display: getComputedStyle(button).display,
              visibility: getComputedStyle(button).visibility,
            };
          }),
          abilityContent: abilityParts.map(({ id, parts }) => {
            const button = document.getElementById(id);
            return {
              id,
              button: rectData(button),
              parts: parts.map(({ name, selector }) => ({
                name,
                rect: rectData(button?.querySelector(selector) ?? null),
              })),
            };
          }),
          dynamicViewport,
          cssBoardSize: matchStyle?.getPropertyValue("--mobile-board-size").trim() ?? "",
          cssBoardBlock: matchStyle?.getPropertyValue("--mobile-board-block").trim() ?? "",
          canvasCount: board?.querySelectorAll("canvas").length ?? 0,
          renderCell: renderState?.cell ?? 0,
          renderTileCount: renderState?.tiles.length ?? 0,
        };
      });
      const detail = JSON.stringify({ target, ...geometry });
      const viewportLeft = geometry.dynamicViewport.offsetLeft;
      const viewportRight = viewportLeft + geometry.dynamicViewport.width;
      const viewportTop = geometry.dynamicViewport.offsetTop;
      const viewportBottom = viewportTop + geometry.dynamicViewport.height;
      const board = geometry.board;
      const canvas = geometry.canvas;

      console.log(`[mobile-board] ${detail}`);
      expect(board, `Missing transformed board geometry: ${detail}`).not.toBeNull();
      expect(canvas, `Missing player canvas geometry: ${detail}`).not.toBeNull();
      expect(geometry.buttons, `Ability buttons were not rendered: ${detail}`).toHaveLength(3);
      expect(geometry.canvasCount, `Expected an in-board canvas: ${detail}`).toBeGreaterThan(0);
      expect(geometry.renderTileCount, `Expected all 64 board tiles: ${detail}`).toBe(64);
      expect(geometry.renderCell, `Expected a measurable 8x8 cell size: ${detail}`).toBeGreaterThan(0);

      expect(board!.height, `Board should use the available vertical match space: ${detail}`).toBeGreaterThanOrEqual(
        board!.width,
      );
      expect(board!.left, `Board clipped at the left viewport edge: ${detail}`).toBeGreaterThanOrEqual(viewportLeft - 1);
      expect(board!.right, `Board clipped at the right viewport edge: ${detail}`).toBeLessThanOrEqual(viewportRight + 1);
      expect(board!.top, `Board clipped at the top viewport edge: ${detail}`).toBeGreaterThanOrEqual(viewportTop - 1);
      expect(board!.bottom, `Board clipped at the bottom viewport edge: ${detail}`).toBeLessThanOrEqual(viewportBottom + 1);

      expect(canvas!.width, `Canvas has no visible width: ${detail}`).toBeGreaterThan(0);
      expect(canvas!.height, `Canvas has no visible height: ${detail}`).toBeGreaterThan(0);
      expect(canvas!.width, `Canvas is narrower than the board: ${detail}`).toBeLessThanOrEqual(board!.width + 1);
      expect(canvas!.height, `Canvas is shorter than the board: ${detail}`).toBeLessThanOrEqual(board!.height + 1);
      expect(canvas!.left, `Canvas clipped at the left edge of the board: ${detail}`).toBeGreaterThanOrEqual(board!.left - 1);
      expect(canvas!.right, `Canvas clipped at the right edge of the board: ${detail}`).toBeLessThanOrEqual(board!.right + 1);
      expect(canvas!.top, `Canvas clipped at the top edge of the board: ${detail}`).toBeGreaterThanOrEqual(board!.top - 1);
      expect(canvas!.bottom, `Canvas clipped at the bottom edge of the board: ${detail}`).toBeLessThanOrEqual(board!.bottom + 1);
      expect(canvas!.display, `Canvas was display-hidden: ${detail}`).not.toBe("none");
      expect(canvas!.visibility, `Canvas was visibility-hidden: ${detail}`).not.toBe("hidden");

      for (const button of geometry.buttons) {
        expect(button.width, `Ability ${button.id} has no width: ${detail}`).toBeGreaterThan(0);
        expect(button.height, `Ability ${button.id} has no height: ${detail}`).toBeGreaterThan(0);
        expect(button.left, `Ability ${button.id} clipped at the left edge: ${detail}`).toBeGreaterThanOrEqual(viewportLeft - 1);
        expect(button.right, `Ability ${button.id} clipped at the right edge: ${detail}`).toBeLessThanOrEqual(viewportRight + 1);
        expect(button.top, `Ability ${button.id} overlaps the board: ${detail}`).toBeGreaterThanOrEqual(board!.bottom - 1);
        expect(button.bottom, `Ability ${button.id} clipped at the bottom edge: ${detail}`).toBeLessThanOrEqual(viewportBottom + 1);
        expect(button.display, `Ability ${button.id} was display-hidden: ${detail}`).not.toBe("none");
        expect(button.visibility, `Ability ${button.id} was visibility-hidden: ${detail}`).not.toBe("hidden");
      }

      expect(geometry.abilityContent, `Ability content was not rendered: ${detail}`).toHaveLength(3);
      for (const ability of geometry.abilityContent) {
        expect(ability.button, `Missing ${ability.id} button geometry: ${detail}`).not.toBeNull();
        const button = ability.button!;
        for (const part of ability.parts) {
          const partDetail = `${detail} ${ability.id} ${part.name}`;
          expect(part.rect, `Missing ability ${part.name} geometry: ${partDetail}`).not.toBeNull();
          const rect = part.rect!;
          expect(rect.width, `Ability ${part.name} has no width: ${partDetail}`).toBeGreaterThan(0);
          expect(rect.height, `Ability ${part.name} has no height: ${partDetail}`).toBeGreaterThan(0);
          expect(
            rect.left,
            `Ability ${part.name} clipped on the left: ${partDetail}`,
          ).toBeGreaterThanOrEqual(button.left);
          expect(
            rect.right,
            `Ability ${part.name} clipped on the right: ${partDetail}`,
          ).toBeLessThanOrEqual(button.right);
          expect(
            rect.top,
            `Ability ${part.name} clipped at the top: ${partDetail}`,
          ).toBeGreaterThanOrEqual(button.top);
          expect(
            rect.bottom,
            `Ability ${part.name} clipped at the bottom: ${partDetail}`,
          ).toBeLessThanOrEqual(button.bottom);
        }
      }
    });
  }
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
   expect(geometry.height).toBeGreaterThanOrEqual(geometry.width);
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

test("mobile targeted power release outside the board stays unspent and leaves swipes responsive", async ({ page, context }) => {
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

  await page.evaluate(() => {
    const session = (window as Window & { __chrono?: { session?: { player: { energy: number } } } }).__chrono?.session;
    if (!session) throw new Error("Missing Chrono session");
    session.player.energy = 100;
  });
  await page.locator("#energyBurstAttack").click();
  await expect(page.locator("#energyBurstAttack")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#cancelPowerTarget")).toBeVisible();
  await page.locator("#cancelPowerTarget").click();
  await expect(page.locator("#energyBurstAttack")).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("#cancelPowerTarget")).toBeHidden();
  await expect(page.locator("#matchStatus")).toHaveText("Target canceled. Select a gem on the board to use Energy Burst.");
  expect(await page.evaluate(() => (window as Window & { __chrono?: { session?: { player: { energy: number } } } }).__chrono?.session?.player.energy)).toBe(100);
  await page.locator("#energyBurstAttack").click();
  await expect(page.locator("#energyBurstAttack")).toHaveAttribute("aria-pressed", "true");

  const target = await page.evaluate(() => {
    const session = (window as Window & {
      __chrono?: { session?: { hintCells: (now: number) => Array<{ r: number; c: number }> } };
    }).__chrono?.session;
    const hint = session?.hintCells(performance.now()) ?? [];
    return hint[0] ?? { r: 0, c: 0 };
  });
  const targetPoint = cellCenter(box, target.r, target.c);
  const outsidePoint = box.y > 20
    ? { x: box.x + box.width / 2, y: box.y - 12 }
    : { x: 1, y: Math.min(viewport!.height - 1, box.y + box.height / 2) };
  expect(outsidePoint.x < box.x || outsidePoint.x > box.x + box.width || outsidePoint.y < box.y || outsidePoint.y > box.y + box.height).toBe(true);

  const cdp = await context.newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: targetPoint.x, y: targetPoint.y, id: 61 }],
  });
  await expect.poll(async () => page.evaluate(() => {
    const state = (window as Window & { __chrono?: { renderState?: () => RenderState } }).__chrono?.renderState?.();
    return state?.powerTargeting ?? null;
  })).toEqual({ kind: "burst", target });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: outsidePoint.x, y: outsidePoint.y, id: 61 }],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });

  const canceledPower = await page.evaluate(() => {
    const chrono = (window as Window & { __chrono?: { session?: { player: { energy: number }; drag: unknown } } }).__chrono;
    return {
      energy: chrono?.session?.player.energy,
      dragging: chrono?.session?.drag,
    };
  });
  expect(canceledPower.energy).toBe(100);
  expect(canceledPower.dragging).toBeNull();
  await expect(page.locator("#energyBurstAttack")).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("#matchStatus")).toHaveText("Target canceled. Select a gem on the board to use Energy Burst.");
  await expect(page.locator("#callout")).toHaveText("TARGET CANCELED");
  await expect.poll(async () => page.evaluate(() => {
    const state = (window as Window & { __chrono?: { renderState?: () => RenderState } }).__chrono?.renderState?.();
    return state?.powerTargeting ?? null;
  })).toBeNull();

  const move = await page.evaluate(() => {
    const session = (window as Window & {
      __chrono?: { session?: { hintCells: (now: number) => Array<{ r: number; c: number }> } };
    }).__chrono?.session;
    const hint = session?.hintCells(performance.now()) ?? [];
    if (hint.length < 2) throw new Error("Missing valid follow-up swipe");
    return { from: hint[0]!, to: hint[1]! };
  });
  const scoreBefore = await page.evaluate(() => {
    const session = (window as Window & { __chrono?: { session?: { player: { score: number } } } }).__chrono?.session;
    return session?.player.score ?? 0;
  });
  await touchSwipe(cdp, cellCenter(box, move.from.r, move.from.c), cellCenter(box, move.to.r, move.to.c), 62);
  await expect(page.locator("#matchStatus")).toHaveText("");
  await expect.poll(async () => page.evaluate(() => {
    const session = (window as Window & { __chrono?: { session?: { player: { score: number } } } }).__chrono?.session;
    return session?.player.score ?? 0;
  })).toBeGreaterThan(scoreBefore);
});

test("mobile targeted power cancellation keeps reduced-motion status and clears targeting", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator("#menu.active")).toBeVisible();

  await page.locator("#menuGuest").click();
  await expect(page.locator("#match.active")).toBeVisible();
  await expect.poll(async () => page.locator("#overlay").evaluate((el) => el.classList.contains("hidden"))).toBe(true);

  const board = page.locator("#playerBoard");
  const boardBox = await board.boundingBox();
  expect(boardBox).not.toBeNull();
  const box = boardBox!;
  const target = await page.evaluate(() => {
    const session = (window as Window & {
      __chrono?: { session?: { hintCells: (now: number) => Array<{ r: number; c: number }> } };
    }).__chrono?.session;
    return session?.hintCells(performance.now())[0] ?? { r: 0, c: 0 };
  });
  const targetPoint = cellCenter(box, target.r, target.c);

  await page.evaluate(() => {
    const session = (window as Window & { __chrono?: { session?: { player: { energy: number } } } }).__chrono?.session;
    if (!session) throw new Error("Missing Chrono session");
    session.player.energy = 100;
  });
  await page.locator("#energyBurstAttack").click();
  await expect(page.locator("#energyBurstAttack")).toHaveAttribute("aria-pressed", "true");

  await page.mouse.move(targetPoint.x, targetPoint.y);
  await page.mouse.down();
  await expect.poll(async () => page.evaluate(() => {
    const state = (window as Window & { __chrono?: { renderState?: () => RenderState } }).__chrono?.renderState?.();
    return state?.powerTargeting ?? null;
  })).toEqual({ kind: "burst", target });
  await page.evaluate(() => {
    document.querySelector("#playerBoard")?.dispatchEvent(new PointerEvent("pointercancel", {
      bubbles: true,
      pointerId: 1,
      pointerType: "mouse",
    }));
  });

  await expect(page.locator("#energyBurstAttack")).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("#matchStatus")).toHaveText("Target canceled. Select a gem on the board to use Energy Burst.");
  await expect(page.locator("#callout")).toHaveText("TARGET CANCELED");
  await expect.poll(async () => page.evaluate(() => {
    const state = (window as Window & { __chrono?: { renderState?: () => RenderState } }).__chrono?.renderState?.();
    return state?.powerTargeting ?? null;
  })).toBeNull();
  await page.mouse.up();
});

test("mobile Mega Strike release outside the board stays unspent and leaves swipes responsive", async ({ page, context }) => {
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

  await page.evaluate(() => {
    const session = (window as Window & { __chrono?: { session?: { player: { energy: number } } } }).__chrono?.session;
    if (!session) throw new Error("Missing Chrono session");
    session.player.energy = 100;
  });
  await page.locator("#megaStrikeAttack").click();
  await expect(page.locator("#megaStrikeAttack")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#cancelPowerTarget")).toBeVisible();
  await page.locator("#cancelPowerTarget").click();
  await expect(page.locator("#megaStrikeAttack")).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("#cancelPowerTarget")).toBeHidden();
  await expect(page.locator("#matchStatus")).toHaveText("Target canceled. Select a gem on the board to use Mega Strike.");
  expect(await page.evaluate(() => (window as Window & { __chrono?: { session?: { player: { energy: number } } } }).__chrono?.session?.player.energy)).toBe(100);
  await page.locator("#megaStrikeAttack").click();
  await expect(page.locator("#megaStrikeAttack")).toHaveAttribute("aria-pressed", "true");

  const target = await page.evaluate(() => {
    const session = (window as Window & {
      __chrono?: { session?: { hintCells: (now: number) => Array<{ r: number; c: number }> } };
    }).__chrono?.session;
    const hint = session?.hintCells(performance.now()) ?? [];
    return hint[0] ?? { r: 0, c: 0 };
  });
  const targetPoint = cellCenter(box, target.r, target.c);
  const outsidePoint = box.y > 20
    ? { x: box.x + box.width / 2, y: box.y - 12 }
    : { x: 1, y: Math.min(viewport!.height - 1, box.y + box.height / 2) };
  expect(outsidePoint.x < box.x || outsidePoint.x > box.x + box.width || outsidePoint.y < box.y || outsidePoint.y > box.y + box.height).toBe(true);

  const cdp = await context.newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: targetPoint.x, y: targetPoint.y, id: 63 }],
  });
  await expect.poll(async () => page.evaluate(() => {
    const state = (window as Window & { __chrono?: { renderState?: () => RenderState } }).__chrono?.renderState?.();
    return state?.powerTargeting ?? null;
  })).toEqual({ kind: "mega", target });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: outsidePoint.x, y: outsidePoint.y, id: 63 }],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });

  const canceledPower = await page.evaluate(() => {
    const chrono = (window as Window & { __chrono?: { session?: { player: { energy: number }; drag: unknown } } }).__chrono;
    return {
      energy: chrono?.session?.player.energy,
      dragging: chrono?.session?.drag,
    };
  });
  expect(canceledPower.energy).toBe(100);
  expect(canceledPower.dragging).toBeNull();
  await expect(page.locator("#megaStrikeAttack")).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("#matchStatus")).toHaveText("Target canceled. Select a gem on the board to use Mega Strike.");
  await expect(page.locator("#callout")).toHaveText("TARGET CANCELED");
  await expect.poll(async () => page.evaluate(() => {
    const state = (window as Window & { __chrono?: { renderState?: () => RenderState } }).__chrono?.renderState?.();
    return state?.powerTargeting ?? null;
  })).toBeNull();

  const move = await page.evaluate(() => {
    const session = (window as Window & {
      __chrono?: { session?: { hintCells: (now: number) => Array<{ r: number; c: number }> } };
    }).__chrono?.session;
    const hint = session?.hintCells(performance.now()) ?? [];
    if (hint.length < 2) throw new Error("Missing valid follow-up swipe");
    return { from: hint[0]!, to: hint[1]! };
  });
  const scoreBefore = await page.evaluate(() => {
    const session = (window as Window & { __chrono?: { session?: { player: { score: number } } } }).__chrono?.session;
    return session?.player.score ?? 0;
  });
  await touchSwipe(cdp, cellCenter(box, move.from.r, move.from.c), cellCenter(box, move.to.r, move.to.c), 64);
  await expect(page.locator("#matchStatus")).toHaveText("");
  await expect.poll(async () => page.evaluate(() => {
    const session = (window as Window & { __chrono?: { session?: { player: { score: number } } } }).__chrono?.session;
    return session?.player.score ?? 0;
  })).toBeGreaterThan(scoreBefore);
});

test("online Mega Strike cancellation stays local and the next valid swap reaches transport", async ({ page, context }) => {
  const sentActions: Array<{ type?: string; id?: string; target?: { r: number; c: number } }> = [];
  await page.route("**/v1/match/m_online/action", async (route) => {
    const payload = JSON.parse(route.request().postData() ?? "{}") as {
      type?: string;
      id?: string;
      target?: { r: number; c: number };
    };
    sentActions.push(payload);

    const snapshot = await page.evaluate(() => {
      const chrono = (window as Window & {
        __chrono?: {
          session?: {
            pendingClientSeq: number;
            player: {
              board: unknown[][];
              score: number;
              combo: number;
              energy: number;
              attack: number;
            };
            opponent: {
              board: unknown[][];
              score: number;
              combo: number;
              energy: number;
              attack: number;
            };
          };
        };
      }).__chrono;
      const session = chrono?.session;
      if (!session) throw new Error("Missing Chrono session");
      return {
        matchId: "m_online",
        seed: 7,
        players: ["cc_a", "cc_b"],
        seq: 1,
        phase: "playing",
        remainingMs: 59_000,
        you: {
          playerId: "cc_a",
          board: session.player.board,
          score: session.player.score,
          combo: session.player.combo,
          energy: session.player.energy,
          attack: session.player.attack,
          lock: 0,
          lastClientSeq: session.pendingClientSeq,
        },
        opponent: {
          playerId: "cc_b",
          board: session.opponent.board,
          score: session.opponent.score,
          combo: session.opponent.combo,
          energy: session.opponent.energy,
          attack: session.opponent.attack,
          lock: 0,
        },
        events: [],
        result: null,
        opponentConnected: true,
        yourLastClientSeq: session.pendingClientSeq,
      };
    });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(snapshot),
    });
  });
  await page.addInitScript(() => {
    localStorage.setItem(
      "chrono-clash-online-session",
      JSON.stringify({ token: "transport-test-token", playerId: "cc_a" }),
    );
  });

  await page.goto("/");
  await expect(page.locator("#menu.active")).toBeVisible();
  await page.evaluate(() => {
    const session = (window as Window & {
      __chrono?: {
        session?: {
          beginOnlineTimeBattle: (input: {
            matchId: string;
            opponentId: string;
            seed: number;
            playerId: string;
            players: string[];
          }) => void;
          screen: string;
          phase: string;
          onlinePhase: string;
          player: { energy: number };
        };
      };
    }).__chrono?.session;
    if (!session) throw new Error("Missing Chrono session");
    session.beginOnlineTimeBattle({
      matchId: "m_online",
      opponentId: "cc_b",
      seed: 7,
      playerId: "cc_a",
      players: ["cc_a", "cc_b"],
    });
    session.screen = "match";
    session.phase = "playing";
    session.onlinePhase = "playing";
    session.player.energy = 100;
  });
  await expect(page.locator("#match.active")).toBeVisible();
  await expect.poll(async () => page.locator("#megaStrikeAttack").isEnabled()).toBe(true);

  const board = page.locator("#playerBoard");
  const boardBox = await board.boundingBox();
  expect(boardBox).not.toBeNull();
  const box = boardBox!;
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  const target = await page.evaluate(() => {
    const session = (window as Window & {
      __chrono?: { session?: { hintCells: (now: number) => Array<{ r: number; c: number }> } };
    }).__chrono?.session;
    return session?.hintCells(performance.now())[0] ?? { r: 0, c: 0 };
  });
  const targetPoint = cellCenter(box, target.r, target.c);
  const outsidePoint = box.y > 20
    ? { x: box.x + box.width / 2, y: box.y - 12 }
    : { x: 1, y: Math.min(viewport!.height - 1, box.y + box.height / 2) };
  const cdp = await context.newCDPSession(page);

  await page.locator("#megaStrikeAttack").click();
  await expect(page.locator("#megaStrikeAttack")).toHaveAttribute("aria-pressed", "true");
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: targetPoint.x, y: targetPoint.y, id: 67 }],
  });
  await expect.poll(async () => page.evaluate(() => {
    const state = (window as Window & { __chrono?: { renderState?: () => RenderState } }).__chrono?.renderState?.();
    return state?.powerTargeting ?? null;
  })).toEqual({ kind: "mega", target });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: outsidePoint.x, y: outsidePoint.y, id: 67 }],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });

  const canceled = await page.evaluate(() => {
    const chrono = (window as Window & {
      __chrono?: {
        session?: {
          player: { energy: number };
          pendingClientSeq: number;
        };
      };
    }).__chrono;
    return {
      energy: chrono?.session?.player.energy,
      pendingClientSeq: chrono?.session?.pendingClientSeq,
    };
  });
  expect(canceled).toEqual({ energy: 100, pendingClientSeq: 0 });
  expect(sentActions).toEqual([]);
  await expect(page.locator("#megaStrikeAttack")).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("#matchStatus")).toHaveText("Target canceled. Select a gem on the board to use Mega Strike.");
  await expect.poll(async () => page.evaluate(() => {
    const state = (window as Window & { __chrono?: { renderState?: () => RenderState } }).__chrono?.renderState?.();
    return state?.powerTargeting ?? null;
  })).toBeNull();

  const move = await page.evaluate(() => {
    const session = (window as Window & {
      __chrono?: { session?: { hintCells: (now: number) => Array<{ r: number; c: number }> } };
    }).__chrono?.session;
    const hint = session?.hintCells(performance.now()) ?? [];
    if (hint.length < 2) throw new Error("Missing valid follow-up swipe");
    return { from: hint[0]!, to: hint[1]! };
  });
  await touchSwipe(cdp, cellCenter(box, move.from.r, move.from.c), cellCenter(box, move.to.r, move.to.c), 68);
  await expect.poll(() => sentActions).toHaveLength(1);
  expect(sentActions[0]).toMatchObject({ type: "swap" });
  expect(sentActions[0]?.id).toBeUndefined();
  expect(sentActions[0]?.target).toBeUndefined();
});

test("mobile Mega Strike valid touch charges once and clears only the selected color", async ({ page, context }) => {
  await page.goto("/");
  await expect(page.locator("#menu.active")).toBeVisible();

  await page.locator("#menuGuest").click();
  await expect(page.locator("#match.active")).toBeVisible();
  await expect.poll(async () => page.locator("#overlay").evaluate((el) => el.classList.contains("hidden"))).toBe(true);

  const board = page.locator("#playerBoard");
  const boardBox = await board.boundingBox();
  expect(boardBox).not.toBeNull();
  const box = boardBox!;
  const target = { r: 3, c: 3 };
  const intendedCells = [
    target,
    { r: 0, c: 0 },
    { r: 2, c: 5 },
    { r: 6, c: 1 },
  ];

  await page.evaluate((cells) => {
    const session = (window as Window & {
      __chrono?: {
        session?: {
          player: {
            board: Array<Array<{ color: number; kind: string } | null>>;
            energy: number;
          };
        };
      };
    }).__chrono?.session;
    if (!session) throw new Error("Missing Chrono session");
    const selected = new Set(cells.map(({ r, c }) => `${r},${c}`));
    session.player.board.forEach((row, r) => row.forEach((piece, c) => {
      if (!piece) throw new Error(`Missing fixture cell ${r},${c}`);
      piece.color = selected.has(`${r},${c}`) ? 5 : 2;
      piece.kind = "normal";
    }));
    session.player.energy = 100;
  }, intendedCells);

  const megaButton = page.locator("#megaStrikeAttack");
  await expect(megaButton).toBeEnabled();
  await megaButton.click();
  await expect(megaButton).toHaveAttribute("aria-pressed", "true");

  const targetPoint = cellCenter(box, target.r, target.c);
  const cdp = await context.newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: targetPoint.x, y: targetPoint.y, id: 65 }],
  });
  await expect.poll(async () => page.evaluate(() => {
    const state = (window as Window & { __chrono?: { renderState?: () => RenderState } }).__chrono?.renderState?.();
    return state?.powerTargeting ?? null;
  })).toEqual({ kind: "mega", target });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: targetPoint.x + 2, y: targetPoint.y + 1, id: 65 }],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });

  const megaResult = await page.evaluate(() => {
    const chrono = (window as Window & {
      __chrono?: {
        session?: {
          player: { energy: number };
          fx: Array<{ kind: string; side?: string; cells?: Array<{ r: number; c: number }> }>;
        };
      };
    }).__chrono;
    const events = chrono?.session?.fx ?? [];
    const clearEvents = events.filter((event) => event.kind === "clear" && event.side === "player");
    return {
      energy: chrono?.session?.player.energy,
      clearEvents: clearEvents.map((event) => event.cells ?? []),
    };
  });

  expect(megaResult.energy).toBe(64);
  expect(megaResult.clearEvents).toHaveLength(1);
  expect(megaResult.clearEvents[0]).toEqual(expect.arrayContaining(intendedCells));
  expect(megaResult.clearEvents[0]).toHaveLength(intendedCells.length);
  await expect(megaButton).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("#cancelPowerTarget")).toBeHidden();
  await expect.poll(async () => page.evaluate(() => {
    const state = (window as Window & { __chrono?: { renderState?: () => RenderState } }).__chrono?.renderState?.();
    return state?.powerTargeting ?? null;
  })).toBeNull();
});

test("real touch gestures play only the committed swap WAV progression", async ({ page, context }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "chrono-clash-settings-v2",
      JSON.stringify({
        sfx: true,
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

    const probe = { starts: [] as number[] };
    (window as Window & { __swapAudioProbe?: typeof probe }).__swapAudioProbe = probe;

    const contextPrototype = AudioContext.prototype;
    const originalCreateBufferSource = contextPrototype.createBufferSource;
    contextPrototype.createBufferSource = function () {
      const source = originalCreateBufferSource.call(this);
      const originalStart = source.start.bind(source);
      source.start = ((...args: any[]) => {
        const duration = source.buffer?.duration;
        if (typeof duration === "number") probe.starts.push(Math.round(duration * 1000));
        return originalStart(...args);
      }) as typeof source.start;
      return source;
    };
  });

  await page.goto("/");
  await expect(page.locator("#menu.active")).toBeVisible();
  await page.locator("#menuGuest").click();
  await expect(page.locator("#match.active")).toBeVisible();
  await expect.poll(async () => page.locator("#overlay").evaluate((el) => el.classList.contains("hidden"))).toBe(true);

  await page.evaluate(async () => {
    const chrono = (window as Window & {
      __chrono?: { audioReady?: () => Promise<unknown> };
    }).__chrono;
    if (!chrono?.audioReady) throw new Error("Missing Chrono audio probe");
    await chrono.audioReady();
  });

  const board = page.locator("#playerBoard");
  const boardBox = await board.boundingBox();
  expect(boardBox).not.toBeNull();
  const box = boardBox!;
  const cdp = await context.newCDPSession(page);
  const baselineStarts = await page.evaluate(() => {
    const probe = (window as Window & { __swapAudioProbe?: { starts: number[] } }).__swapAudioProbe;
    if (!probe) throw new Error("Missing swap audio probe");
    return probe.starts.length;
  });

  const startsSinceBaseline = () => page.evaluate((start) => {
    const probe = (window as Window & { __swapAudioProbe?: { starts: number[] } }).__swapAudioProbe;
    if (!probe) throw new Error("Missing swap audio probe");
    return probe.starts.slice(start);
  }, baselineStarts);
  const swapStartsSinceBaseline = async () => {
    const starts = await startsSinceBaseline();
    return starts.filter((duration) => [100, 105].includes(duration));
  };

  const nextValidMove = async (): Promise<Move> => {
    const handle = await page.waitForFunction(() => {
      const session = (window as Window & {
        __chrono?: {
          session?: {
            isInteractive: (now: number) => boolean;
            hintCells: (now: number) => Array<{ r: number; c: number }>;
          };
        };
      }).__chrono?.session;
      if (!session?.isInteractive(performance.now())) return false;
      const hint = session.hintCells(performance.now());
      const from = hint[0];
      const to = hint[1];
      return from && to ? { from, to } : false;
    });
    const move = (await handle.jsonValue()) as Move;
    await handle.dispose();
    return move;
  };

  for (let index = 0; index < 6; index += 1) {
    const move = await nextValidMove();
    await touchSwipe(
      cdp,
      cellCenter(box, move.from.r, move.from.c),
      cellCenter(box, move.to.r, move.to.c),
      20 + index,
    );
    await expect.poll(swapStartsSinceBaseline).toHaveLength(index + 1);
  }

  const swapStarts = await startsSinceBaseline();
  expect(swapStarts.filter((duration) => [100, 105].includes(duration))).toEqual([
    105,
    100,
    105,
    100,
    105,
    105,
  ]);
  expect(swapStarts.filter((duration) => [245, 250, 255, 260, 265].includes(duration)).length).toBeGreaterThan(0);

  const invalidMove = await page.waitForFunction(() => {
    const session = (window as Window & {
      __chrono?: {
        session?: {
          isInteractive: (now: number) => boolean;
          player: { board: Array<Array<{ color: number; kind: string } | null>> };
        };
      };
    }).__chrono?.session;
    if (!session?.isInteractive(performance.now())) return false;
    const board = session.player.board.map((row) => row.map((piece) => (piece ? { ...piece } : null)));
    const hasMatch = (cells: Array<Array<{ color: number } | null>>): boolean => {
      for (let r = 0; r < 8; r += 1) {
        for (let c = 0; c < 8; c += 1) {
          const color = cells[r]?.[c]?.color;
          if (color == null) continue;
          if (
            c >= 2 &&
            cells[r]?.[c - 1]?.color === color &&
            cells[r]?.[c - 2]?.color === color
          ) return true;
          if (
            r >= 2 &&
            cells[r - 1]?.[c]?.color === color &&
            cells[r - 2]?.[c]?.color === color
          ) return true;
        }
      }
      return false;
    };
    for (let r = 0; r < 8; r += 1) {
      for (let c = 0; c < 8; c += 1) {
        for (const [dr, dc] of [[0, 1], [1, 0]]) {
          const nr = r + dr;
          const nc = c + dc;
          const from = board[r]?.[c];
          const to = board[nr]?.[nc];
          if (!from || !to || from.kind !== "normal" || to.kind !== "normal") continue;
          [board[r]![c], board[nr]![nc]] = [to, from];
          const invalid = !hasMatch(board);
          [board[r]![c], board[nr]![nc]] = [from, to];
          if (invalid) return { from: { r, c }, to: { r: nr, c: nc } };
        }
      }
    }
    return false;
  });
  const invalid = (await invalidMove.jsonValue()) as Move;
  await invalidMove.dispose();
  const beforeInvalid = (await swapStartsSinceBaseline()).length;
  await touchSwipe(
    cdp,
    cellCenter(box, invalid.from.r, invalid.from.c),
    cellCenter(box, invalid.to.r, invalid.to.c),
    40,
  );
  await expect.poll(async () => (await swapStartsSinceBaseline()).length).toBe(beforeInvalid);

  const quietMove = await nextValidMove();
  const quietStart = cellCenter(box, quietMove.from.r, quietMove.from.c);
  await touchSwipe(cdp, quietStart, { x: quietStart.x + 2, y: quietStart.y }, 41);
  await expect.poll(async () => (await swapStartsSinceBaseline()).length).toBe(beforeInvalid);

  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ ...quietStart, id: 42 }],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchCancel",
    touchPoints: [],
  });
  await expect.poll(async () => (await swapStartsSinceBaseline()).length).toBe(beforeInvalid);

  const firstMatchStarts = await startsSinceBaseline();
  const matchWaveDurations = [245, 250, 255, 260, 265];
  const swapWaveDurations = [100, 105];
  expect(firstMatchStarts.filter((duration) => swapWaveDurations.includes(duration))).toEqual([
    105,
    100,
    105,
    100,
    105,
    105,
  ]);
  expect(firstMatchStarts.some((duration) => matchWaveDurations.includes(duration))).toBe(true);
  expect(firstMatchStarts.filter((duration) => matchWaveDurations.includes(duration)).every((duration) => !swapWaveDurations.includes(duration))).toBe(true);

  await page.evaluate(() => {
    const session = (window as Window & { __chrono?: { session?: { toMenu: () => void } } }).__chrono?.session;
    if (!session) throw new Error("Missing Chrono session");
    session.toMenu();
  });
  await expect(page.locator("#menu.active")).toBeVisible();

  const secondMatchBaseline = await page.evaluate(() => {
    const probe = (window as Window & { __swapAudioProbe?: { starts: number[] } }).__swapAudioProbe;
    if (!probe) throw new Error("Missing swap audio probe");
    return probe.starts.length;
  });
  await page.locator("#menuGuest").click();
  await expect(page.locator("#match.active")).toBeVisible();
  await expect.poll(async () => page.locator("#overlay").evaluate((el) => el.classList.contains("hidden"))).toBe(true);
  await page.evaluate(async () => {
    const chrono = (window as Window & { __chrono?: { audioReady?: () => Promise<unknown> } }).__chrono;
    if (!chrono?.audioReady) throw new Error("Missing Chrono audio probe");
    await chrono.audioReady();
  });

  const secondBoard = page.locator("#playerBoard");
  const secondBoardBox = await secondBoard.boundingBox();
  expect(secondBoardBox).not.toBeNull();
  const secondMove = await nextValidMove();
  await touchSwipe(
    cdp,
    cellCenter(secondBoardBox!, secondMove.from.r, secondMove.from.c),
    cellCenter(secondBoardBox!, secondMove.to.r, secondMove.to.c),
    50,
  );
  await expect.poll(async () => {
    const starts = await page.evaluate((start) => {
      const probe = (window as Window & { __swapAudioProbe?: { starts: number[] } }).__swapAudioProbe;
      if (!probe) throw new Error("Missing swap audio probe");
      return probe.starts.slice(start);
    }, secondMatchBaseline);
    return starts.filter((duration) => swapWaveDurations.includes(duration));
  }).toEqual([105]);

  const secondMatchStarts = await page.evaluate((start) => {
    const probe = (window as Window & { __swapAudioProbe?: { starts: number[] } }).__swapAudioProbe;
    if (!probe) throw new Error("Missing swap audio probe");
    return probe.starts.slice(start);
  }, secondMatchBaseline);
  expect(secondMatchStarts.some((duration) => matchWaveDurations.includes(duration))).toBe(true);
  expect(secondMatchStarts.filter((duration) => swapWaveDurations.includes(duration))).toEqual([105]);
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
        __chrono?: {
          session?: { tryPlayerSwap: (a: { r: number; c: number }, b: { r: number; c: number }, now: number) => boolean };
          flashSwap?: (a: { r: number; c: number }, b: { r: number; c: number }) => void;
        };
      }).__chrono?.session;
      return session?.tryPlayerSwap({ r: fromRow, c: fromCol }, { r: toRow, c: toCol }, performance.now()) ?? false;
    }, { fromRow: 3, fromCol: 3, toRow: 3, toCol: 4 });
    expect(accepted).toBe(true);
    await page.evaluate(() => {
      const chrono = (window as Window & {
        __chrono?: { flashSwap?: (a: { r: number; c: number }, b: { r: number; c: number }) => void };
      }).__chrono;
      chrono?.flashSwap?.({ r: 3, c: 3 }, { r: 3, c: 4 });
    });

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
    let observedSwapFrame: Awaited<ReturnType<typeof state>> = null;

    await expect.poll(async () => {
      const snapshot = await state();
      return snapshot?.tiles.some((tile) => tile.moveKind === "swap") ?? false;
    }, transientPoll).toBe(true);
    await expect.poll(async () => {
      const snapshot = await state();
      if (!snapshot) return false;
      const swapTiles = snapshot.tiles.filter((tile) => tile.moveKind === "swap");
      if (swapTiles.length > 0) observedSwapFrame = snapshot;
      return swapTiles.length > 0 && swapTiles.every((tile) => Math.abs(tile.x - tile.fromX) > snapshot.cell * 0.08);
    }, transientPoll).toBe(true);
    const swapFrame = observedSwapFrame ?? (await state());
    expect(swapFrame).not.toBeNull();
    const swapTiles = swapFrame!.tiles.filter((tile) => tile.moveKind === "swap");
    expect(swapTiles.length).toBeGreaterThanOrEqual(1);
    expect(swapTiles.filter((tile) => Math.abs(tile.x - tile.fromX) > swapFrame!.cell * 0.08)).toHaveLength(swapTiles.length);

    let observedImpactFrame: Awaited<ReturnType<typeof state>> = null;
    await expect.poll(async () => {
      const snapshot = await state();
      if (snapshot?.visibleEmptySockets.length && snapshot.dying.length > 0) {
        observedImpactFrame = snapshot;
        return true;
      }
      return false;
    }, transientPoll).toBe(true);
    const impactFrame = observedImpactFrame ?? (await state());
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

  test("captures deterministic large-match VFX timing without locking the mobile board", async ({ page }) => {
    test.setTimeout(60_000);
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await page.addInitScript(() => {
      Object.defineProperty(navigator, "vibrate", {
        configurable: true,
        value: () => true,
      });
    });
    await page.goto("/");
    await expect(page.locator("#menu.active")).toBeVisible();
    await page.locator("#menuGuest").click();
    await expect(page.locator("#match.active")).toBeVisible();
    await expect.poll(async () => page.locator("#overlay").evaluate((el) => el.classList.contains("hidden"))).toBe(true);
    await expect.poll(async () => page.evaluate(() => {
      const chrono = (window as Window & {
        __chrono?: { session?: { phase?: string }; renderState?: () => RenderState };
      }).__chrono;
      return chrono?.session?.phase === "playing" && (chrono.renderState?.().tiles.length ?? 0) >= 64;
    })).toBe(true);

    const board = page.locator("#playerBoard");
    const boardBox = await board.boundingBox();
    expect(boardBox).not.toBeNull();
    const box = boardBox!;

    const fixtureNames: LargeMatchVfxFixtureName[] = [
      "threeGem",
      "fourGem",
      "fivePlusGem",
      "oneCascade",
      "multipleCascade",
      "longFall",
    ];
    const completed: Array<{ name: LargeMatchVfxFixtureName; samples: number }> = [];
    let staggerObserved = false;
    let particleCapObserved = false;

    for (const name of fixtureNames) {
      const fixture = LARGE_MATCH_VFX_FIXTURES[name];
      await expect.poll(async () => page.evaluate(() => {
        const session = (window as Window & {
          __chrono?: { session?: { isInteractive: (now: number) => boolean } };
        }).__chrono?.session;
        return session?.isInteractive(performance.now()) ?? false;
      }), { timeout: 5_000 }).toBe(true);

      const baselineVfx = await page.evaluate(() => {
        const chrono = (window as Window & { __chrono?: { renderState?: () => RenderState } }).__chrono;
        return chrono?.renderState?.().vfx ?? null;
      });
      expect(baselineVfx).not.toBeNull();
      const trigger = await page.evaluate((fixture) => {
        const chrono = (window as Window & {
          __chrono?: {
            session?: {
              player: { board: Array<Array<{ color: number; kind: string }>> };
              rng: () => number;
              tryPlayerSwap: (a: { r: number; c: number }, b: { r: number; c: number }, now: number) => boolean;
              snapshot: (now: number) => {
                player: { combo: number };
                fx: Array<{ kind: string; side?: string; born: number; cells?: Array<{ r: number; c: number }> }>;
              };
            };
          };
        }).__chrono;
        const session = chrono?.session;
        if (!session) throw new Error("Missing live Chrono session");
        fixture.board.forEach((row, r) => row.forEach((color, c) => {
          const piece = session.player.board[r]?.[c];
          if (!piece) throw new Error(`Missing fixture cell ${r},${c}`);
          piece.color = color;
          piece.kind = "normal";
        }));
        let seed = fixture.rngSeed >>> 0;
        session.rng = () => {
          seed = (seed + 0x6d2b79f5) >>> 0;
          let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
          value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
          return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
        };
        const triggerAt = performance.now();
        const accepted = session.tryPlayerSwap(fixture.from, fixture.to, triggerAt);
        const snapshot = session.snapshot(triggerAt);
        const clear = snapshot.fx.find(
          (event) => event.kind === "clear" && event.side === "player" && event.born >= triggerAt,
        );
        if (!clear) throw new Error("Missing fixture clear event");
        clear.born = triggerAt;
        return {
          accepted,
          clearCount: clear?.cells?.length ?? 0,
          combo: snapshot.player.combo,
        };
      }, fixture);
      expect(trigger.accepted, `${name} fixture swap accepted`).toBe(true);
      expect(trigger.clearCount, `${name} first clear wave`).toBe(fixture.expectedFirstWave);
      expect(trigger.combo, `${name} combo peak`).toBe(fixture.expectedComboPeak);

      const samples = await collectVfxTimeline(page, name === "multipleCascade" || name === "longFall" ? 4_000 : 2_400);
      const states = samples.flatMap((sample) => sample.state ? [sample.state] : []);
      expect(states.length, `${name} produced renderer samples`).toBeGreaterThan(0);
      expect(states.some((state) => state.dying.length >= fixture.expectedFirstWave), `${name} showed match recognition`).toBe(true);
      const recognitionSample = samples.find((sample) =>
        (sample.state?.vfx.recognitionCount ?? 0) > baselineVfx!.recognitionCount,
      );
      const fractureSample = samples.find((sample) =>
        (sample.state?.vfx.fractureCount ?? 0) > baselineVfx!.fractureCount,
      );
      expect(recognitionSample, `${name} recorded match recognition timing`).toBeDefined();
      expect(fractureSample, `${name} recorded fracture timing`).toBeDefined();
      expect(recognitionSample!.at).toBeLessThanOrEqual(fractureSample!.at);
      staggerObserved ||= states.some((state) => state.vfx.staggerCount > baselineVfx!.staggerCount);
      expect(states.some((state) => state.vfx.settleCount > baselineVfx!.settleCount), `${name} recorded landing settle`).toBe(true);
      expect(states.some((state) => state.vfx.shardCount > 0), `${name} showed crystal shards`).toBe(true);
      expect(states.some((state) => state.vfx.particleCount > 0), `${name} showed particles`).toBe(true);
      expect(states.every((state) => state.vfx.particleCount <= state.vfx.particleCap), `${name} respected particle cap`).toBe(true);
      particleCapObserved ||= states.some((state) => state.vfx.particleCapHits > baselineVfx!.particleCapHits);

      await expect.poll(async () => page.evaluate(() => {
        const chrono = (window as Window & { __chrono?: { renderState?: () => RenderState } }).__chrono;
        const state = chrono?.renderState?.();
        return Boolean(
          state &&
          state.tiles.length === 64 &&
          state.dying.length === 0 &&
          state.moving.length === 0 &&
          state.vfx.particleCount === 0 &&
          state.vfx.shardCount === 0 &&
          state.vfx.shockwaveCount === 0 &&
          state.vfx.socketPulseCount === 0,
        );
      }), { timeout: 4_000, intervals: [16, 32, 64] }).toBe(true);
      const final = await page.evaluate(() => {
        const chrono = (window as Window & { __chrono?: { renderState?: () => RenderState } }).__chrono;
        return chrono?.renderState?.() ?? null;
      });
      expect(final).not.toBeNull();
      expect(final.tiles).toHaveLength(64);
      expect(final.dying).toHaveLength(0);
      expect(final.moving).toHaveLength(0);
      expect(final.vfx, `${name} cleaned permanent VFX`).toMatchObject({
        particleCount: 0,
        shardCount: 0,
        shockwaveCount: 0,
        socketPulseCount: 0,
      });
      expect(final.tiles.every((tile) =>
        [tile.x, tile.y, tile.fromX, tile.fromY, tile.toX, tile.toY, tile.alpha].every(Number.isFinite),
      ), `${name} board remained readable`).toBe(true);

      completed.push({ name, samples: samples.length });
    }

    expect(completed).toHaveLength(fixtureNames.length);
    expect(staggerObserved, "large-match fixtures recorded stagger timing").toBe(true);
    expect(particleCapObserved, "large-match fixtures recorded particle-cap timing").toBe(true);
    expect(await page.locator("#overlay").evaluate((el) => ({
      hidden: el.classList.contains("hidden"),
      text: el.textContent?.trim() ?? "",
    }))).toMatchObject({ hidden: true });
    expect(await page.locator("#overlay").textContent()).not.toContain("LOCKED");
    expect(page.viewportSize()?.width).toBe(390);
    expect(box.width).toBeGreaterThan(300);
    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
});