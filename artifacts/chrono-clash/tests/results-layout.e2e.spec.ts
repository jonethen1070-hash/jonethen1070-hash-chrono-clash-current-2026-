import { expect, test } from "@playwright/test";

const RESULT_VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 390, height: 727 },
] as const;

test("defeat results stay layered and tappable on short phones", async ({ page }) => {
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

  for (const viewport of RESULT_VIEWPORTS) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await page.locator("#menuGuest").click();
    await page.waitForSelector("#match.active");
    await page.waitForFunction(() => document.querySelector("#overlay")?.classList.contains("hidden"));

    await page.evaluate(() => {
      const session = (window as Window & { __chrono?: { session?: any } }).__chrono?.session;
      if (!session) throw new Error("Missing Chrono session");
      session.mode = "score";
      session.scoreTarget = 1;
      session.player.score = 0;
      session.opponent.score = 1;
      session.tick(performance.now());
    });
    await page.waitForSelector("#results.active");
    await page.waitForTimeout(700);

    const metrics = await page.evaluate(() => {
      const rect = (selector: string) => {
        const element = document.querySelector<HTMLElement>(selector);
        if (!element) throw new Error(`Missing ${selector}`);
        const box = element.getBoundingClientRect();
        return { left: box.left, top: box.top, right: box.right, bottom: box.bottom };
      };
      const results = document.querySelector<HTMLElement>("#results");
      if (!results) throw new Error("Missing #results");
      const pointTarget = document.elementFromPoint(innerWidth / 2, 20);
      return {
        zIndex: getComputedStyle(results).zIndex,
        activeScreens: [...document.querySelectorAll(".screen.active")].map((element) => element.id),
        title: rect("#resultTitle"),
        actions: rect("#results .result-actions"),
        buttons: [...document.querySelectorAll<HTMLElement>("#results button")].map((button) => ({
          id: button.id,
          ...rect(`#${button.id}`),
        })),
        pointInsideResults: pointTarget?.closest("#results")?.id === "results",
        documentSize: { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight },
      };
    });

    expect(metrics.zIndex).toBe("20");
    expect(metrics.activeScreens).toEqual(["match", "results"]);
    expect(metrics.pointInsideResults).toBe(true);
    expect(metrics.documentSize).toEqual(viewport);
    for (const element of [metrics.title, metrics.actions, ...metrics.buttons]) {
      expect(element.left).toBeGreaterThanOrEqual(0);
      expect(element.top).toBeGreaterThanOrEqual(0);
      expect(element.right).toBeLessThanOrEqual(viewport.width);
      expect(element.bottom).toBeLessThanOrEqual(viewport.height);
    }
  }
});