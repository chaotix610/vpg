import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:4173";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    trace: "retain-on-failure",
  },
  webServer: process.env.PLAYWRIGHT_BASE_URL ? undefined : {
    command: "npm run dev -- --host 127.0.0.1 --port 4173 --strictPort",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: "persistence", testMatch: "persistence/**/*.spec.ts" },
    { name: "combat", testMatch: "combat/**/*.spec.ts" },
  ],
});
