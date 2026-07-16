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
    // Bound every navigation and action (ticket e2e-traveler-trip-history-signout-hang).
    // Playwright's defaults are 0 = "no per-step limit", so a server render that wedges
    // (e.g. the DB-pool-exhaustion hang this ticket fixes) used to block a single
    // `page.goto`/`click` until the whole test's 10-minute budget expired — an opaque,
    // silent stall. A bounded per-step timeout turns any such stall into a FAST, clearly
    // located failure ("Timeout … exceeded … navigating to /view/…") instead. This never
    // weakens an assertion: it only caps how long one stuck step may hang; explicit
    // longer waits (draft/rate-limit retries in tests/e2e/support.ts) pass their own
    // larger timeout and are unaffected.
    navigationTimeout: 45_000,
    actionTimeout: 30_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
