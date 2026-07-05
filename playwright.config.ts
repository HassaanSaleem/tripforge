import { defineConfig, devices } from "@playwright/test";

// INV-027 / ADR-0003 live-verification harness. Runs against the BUILT compose
// image (never a dev server). Browser download + live run is activated by the
// operator wiring `verification.live.*` in the sealed kitchenloop.yaml; until
// then the execute phase records SKIPPED (pre-skeleton).
const baseURL = process.env.BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { outputFolder: ".kitchenloop/evidence/playwright-report", open: "never" }]],
  outputDir: ".kitchenloop/evidence/test-results",
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
