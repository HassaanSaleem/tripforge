import { defineConfig, devices } from "@playwright/test";

// INV-027 / ADR-0003 live-verification harness. Runs against the BUILT compose
// image (never a dev server). Browser download + live run is activated by the
// operator wiring `verification.live.*` in the sealed kitchenloop.yaml; until
// then the execute phase records SKIPPED (pre-skeleton).
const baseURL = process.env.BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  // Capped (not left to the CPU-core default): every worker shares the
  // compose stack's single client IP, and Better Auth's real (unmocked)
  // per-endpoint sign-up rate limiter has a fixed budget for that IP — too
  // many concurrent `signUpAgency` calls trip it under default parallelism
  // (ticket e2e-fullyparallel-signup-rate-limit; --workers=2 was the
  // verified-passing witness). Fixed here so no run needs a manual override.
  workers: 2,
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
