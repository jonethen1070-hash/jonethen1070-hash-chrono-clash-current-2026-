import { expect, test } from "@playwright/test";

type Coord = { r: number; c: number };

const BOARD_FRAME = 6;
const BOARD_GAP = 1.5;
const BOARD_COLS = 8;
const BOARD_ROWS = 10;

function cellCenter(box: { x: number; y: number; width: number; height: number }, cell: Coord) {
  const size = Math.min(
    (box.width - BOARD_FRAME * 2 - BOARD_GAP * (BOARD_COLS + 1)) / BOARD_COLS,
    (box.height - BOARD_FRAME * 2 - BOARD_GAP * (BOARD_ROWS + 1)) / BOARD_ROWS,
  );
  const pitch = size + BOARD_GAP;
  return {
    x: box.x + BOARD_FRAME + BOARD_GAP + cell.c * pitch + size / 2,
    y: box.y + BOARD_FRAME + BOARD_GAP + cell.r * pitch + size / 2,
  };
}

test("guest player can navigate, swap, use Mega Strike, recover from cancellation, and replay", async ({ page }) => {
  const runtimeErrors: string[] = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") runtimeErrors.push(message.text());
  });
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

  await page.goto("/");
  await expect(page.locator("#menu.active")).toBeVisible();
  await page.locator("#toSettings").click();
  await expect(page.locator("#settingsScreen.active")).toBeVisible();
  await page.locator("#sfxToggle").click();
  await expect(page.locator("#sfxToggle")).toHaveAttribute("aria-pressed", "true");
  await page.locator("#backMenu").click();
  await expect(page.locator("#menu.active")).toBeVisible();

  await page.locator("#menuGuest").click();
  await expect(page.locator("#match.active")).toBeVisible();
  await expect.poll(async () => page.locator("#overlay").evaluate((el) => el.classList.contains("hidden"))).toBe(true);

  const board = page.locator("#playerBoard");
  const box = (await board.boundingBox())!;
  const hint = await page.evaluate(() => {
    const chrono = (window as Window & {
      __chrono?: { session?: { hintCells: (now: number) => Coord[] } };
    }).__chrono;
    return chrono?.session?.hintCells(performance.now()) ?? [];
  });
  expect(hint).toHaveLength(2);
  const from = cellCenter(box, hint[0]!);
  const to = cellCenter(box, hint[1]!);
  const scoreBefore = await page.evaluate(() => (window as Window & { __chrono?: { session?: { player: { score: number } } } }).__chrono?.session?.player.score ?? 0);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 3 });
  await page.mouse.up();
  await expect.poll(async () => page.evaluate(() => (window as Window & { __chrono?: { session?: { player: { score: number } } } }).__chrono?.session?.player.score ?? 0)).toBeGreaterThan(scoreBefore);

  const megaSetup = await page.evaluate(() => {
    const chrono = (window as Window & { __chrono?: { session?: any } }).__chrono;
    if (!chrono?.session) throw new Error("Missing Chrono session");
    const board = chrono.session.player.board;
    chrono.session.player.energy = 100;
    const target = { r: 0, c: 0 };
    const color = board[target.r][target.c].color;
    const matching = [];
    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 8; c++) {
        if (board[r][c]?.color === color) matching.push({ r, c });
      }
    }
    return { target, color, matching };
  });
  await page.locator("#megaStrikeAttack").click();
  await expect(page.locator("#megaStrikeAttack")).toHaveAttribute("aria-pressed", "true");
  const targetPoint = cellCenter(box, megaSetup.target);
  await page.touchscreen.tap(targetPoint.x, targetPoint.y);
  const megaResult = await page.evaluate(() => {
    const chrono = (window as Window & { __chrono?: { session?: any } }).__chrono;
    const events = chrono?.session?.fx ?? [];
    const clear = [...events]
      .reverse()
      .find((event: { kind: string; side?: string }) => event.kind === "clear" && event.side === "player");
    return { clearCells: clear?.cells ?? [], energy: chrono?.session?.player.energy ?? 100 };
  });
  expect(megaResult.energy).toBeLessThan(100);
  expect(megaResult.clearCells).toEqual(expect.arrayContaining(megaSetup.matching));
  expect(megaResult.clearCells).toHaveLength(megaSetup.matching.length);

  await page.evaluate(() => {
    const button = document.querySelector<HTMLButtonElement>("#energyBurstAttack");
    button?.click();
    document.querySelector("#playerBoard")?.dispatchEvent(new PointerEvent("pointercancel", { bubbles: true }));
  });
  await expect(page.locator("#energyBurstAttack")).toHaveAttribute("aria-pressed", "false");

  await page.locator("#dockSettings").click();
  await expect(page.locator("#settingsScreen.active")).toBeVisible();
  await page.locator("#quitGame").click();
  await expect(page.locator("#menu.active")).toBeVisible();
  await page.locator("#menuGuest").click();
  await expect(page.locator("#match.active")).toBeVisible();
  await expect.poll(async () => page.locator("#overlay").evaluate((el) => el.classList.contains("hidden"))).toBe(true);

  await page.evaluate(() => {
    const session = (window as Window & { __chrono?: { session?: any } }).__chrono?.session;
    if (!session) throw new Error("Missing Chrono session");
    session.mode = "score";
    session.scoreTarget = 1;
    session.player.score = 1;
    session.tick(performance.now());
  });
  await expect(page.locator("#results.active")).toBeVisible({ timeout: 4_000 });
  await page.locator("#retryMatch").click();
  await expect(page.locator("#match.active")).toBeVisible();
  expect(runtimeErrors).toEqual([]);
});