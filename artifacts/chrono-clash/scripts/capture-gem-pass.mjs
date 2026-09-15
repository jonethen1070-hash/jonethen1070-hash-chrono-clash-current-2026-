import { chromium } from "@playwright/test";

const out = process.argv[2] ?? "/tmp/gem_pass.png";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/usr/local/bin/google-chrome",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
page.setDefaultTimeout(30000);

await page.addInitScript(() => {
  localStorage.setItem(
    "chrono-clash-settings-v2",
    JSON.stringify({
      sfx: false,
      music: false,
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

await page.goto("http://127.0.0.1:5173/", { waitUntil: "networkidle" });
await page.locator("#menu.active").waitFor();
await page.locator("#menuGuest").click();
await page.locator("#match.active").waitFor();
await page.waitForFunction(() => document.querySelector("#overlay")?.classList.contains("hidden"));
await page.waitForTimeout(2200);

await page.screenshot({ path: out, fullPage: false });
const board = await page.locator("#playerBoard").boundingBox();
if (board) {
  await page.screenshot({
    path: out.replace(/\.png$/, "-boardzoom.png"),
    clip: { x: board.x, y: board.y, width: board.width, height: Math.min(board.height, 210) },
  });
}
await browser.close();
console.log(`screenshot=${out}`);
