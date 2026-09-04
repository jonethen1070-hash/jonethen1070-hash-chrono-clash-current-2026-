import { expect, test } from "@playwright/test";

test("uses Arena Pulse for the live gameplay bed and preserves gameplay SFX", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "chrono-clash-settings-v2",
      JSON.stringify({
        sfx: true,
        music: true,
        announcer: false,
        sfxVolume: 0.84,
        musicVolume: 0.72,
        haptics: false,
        effects: "high",
        animation: "high",
        showComboEffects: true,
        scoreTarget: 3000,
        introSeen: true,
      }),
    );
  });

  await page.goto("/");
  await page.locator("#menu.active").waitFor();
  await page.locator("#menuGuest").click();
  await page.locator("#match.active").waitFor();
  await expect.poll(async () => page.locator("#overlay").evaluate((el) => el.classList.contains("hidden"))).toBe(true);

  const decoded = await page.evaluate(async () => {
    const response = await fetch("/audio/Arena_Pulse_1788563386140.m4a");
    const bytes = await response.arrayBuffer();
    const context = new AudioContext();
    try {
      const buffer = await context.decodeAudioData(bytes.slice(0));
      return { ok: true, duration: buffer.duration, channels: buffer.numberOfChannels };
    } catch (error) {
      return { ok: false, error: String(error) };
    } finally {
      await context.close();
    }
  });
  expect(decoded.ok).toBe(true);
  expect(decoded.duration).toBeGreaterThan(224);
  expect(decoded.channels).toBe(2);

  await expect.poll(async () => page.evaluate(() => window.__chrono?.scene())).toMatchObject({
    musicBed: "battle",
    musicPlayback: "file",
  });
  const scene = await page.evaluate(() => window.__chrono?.scene());
  expect(scene?.sources?.["music-battle"]).toBe("/audio/Arena_Pulse_1788563386140.m4a");
  expect(scene?.loaded).toEqual(expect.arrayContaining(["sfx-move", "sfx-match", "sfx-combo", "sfx-highcombo", "sfx-power"]));

  await page.evaluate(() => window.__chrono?.session?.endMatch(performance.now()));
  await expect.poll(async () => page.evaluate(() => window.__chrono?.scene())).toMatchObject({
    musicBed: expect.not.stringMatching(/^battle$/),
  });
});