import { defineConfig, devices } from "@playwright/test";

/**
 * Browser tests run against the production build in demo mode (no env needed):
 * the app serves the in-memory market, the demo buyer, and simulated payments.
 * The demo buyer handle is locked once the welcome page is used, so the suite
 * calls POST /api/handle before any takeover test (idempotent for same handle).
 */
export default defineConfig({
  testDir: "./tests/browser",
  timeout: 30_000,
  expect: { timeout: 7_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "line" : "list",
  use: {
    baseURL: "http://127.0.0.1:3111",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile",
      use: { ...devices["Pixel 7"] },
    },
  ],
  webServer: {
    command: "npx next start -p 3111",
    url: "http://127.0.0.1:3111/api/market/pulse",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
