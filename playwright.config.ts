import { defineConfig } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 90000,
  use: {
    baseURL,
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
    launchOptions: {
      executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
      args: [
        "--no-sandbox",
        "--use-gl=angle",
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
      ],
    },
    screenshot: "only-on-failure",
    trace: { mode: "retain-on-failure", screenshots: false },
  },
  webServer: {
    command: process.env.E2E_SERVER_COMMAND || "npm run dev",
    url: baseURL,
    reuseExistingServer: true,
    timeout: 120000,
  },
});
