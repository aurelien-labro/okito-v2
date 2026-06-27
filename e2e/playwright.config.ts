import { defineConfig, devices } from "@playwright/test";

/**
 * Config Playwright OKITO V2.
 *
 * Lance automatiquement l'API (port 3001) et le dashboard (port 3000) via
 * `webServer` avant de tourner les tests. CI = headless ; en local on peut
 * lancer `pnpm test:ui` pour le mode interactif.
 *
 * Pré-requis première fois :
 *   cd e2e && pnpm install:browsers
 */
export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "pnpm --filter @okito/api dev",
      cwd: "..",
      url: "http://localhost:3001/health",
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: "pnpm --filter @okito/dashboard dev",
      cwd: "..",
      url: "http://localhost:3000",
      reuseExistingServer: !process.env.CI,
      timeout: 90_000,
    },
  ],
});
