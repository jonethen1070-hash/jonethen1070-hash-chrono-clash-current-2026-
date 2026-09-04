import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PLAYWRIGHT_PORT ?? 4174);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${port}`;
const chromiumPath = process.env.CHROMIUM_PATH ?? "/repl/tools/bin/chromium";

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.e2e.spec.ts",
  timeout: 30_000,
  expect: {
    timeout: 8_000,
  },
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: {
      executablePath: chromiumPath,
    },
  },
  projects: [
    {
      name: "mobile",
      use: {
        ...devices["Pixel 5"],
      },
    },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: `PORT=${port} BASE_PATH=/ pnpm run dev`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});