import { test, expect } from "@playwright/test";

// L4 trust-boundary spec (INV-020 / INV-024). Complements tests/e2e/smoke.spec.ts,
// whose "client view carries the agent's brand, not the platform's (INV-020)" test
// only asserts the *heading* is present — it never asserts the NEGATIVE (that platform
// branding is ABSENT), so it would still pass if "TripForge" leaked into the client
// view. That negative is the actual content of INV-020, so it is pinned here.
//
// Runs against the BUILT compose image (playwright.config baseURL, INV-027). NOTE:
// authored in iteration 2 but NOT executed live in that session — the compose stack
// could not boot in the loop runtime (registry image-pull OOM; see the iteration-2
// experience report + OPERATOR-DESK REG-L3-STACK). The execute phase live-verifies it.

test("client view leaks NO platform branding (INV-020 negative)", async ({ page }) => {
  await page.goto("/view");
  // The traveler surface renders — but carries the agent's brand only.
  await expect(page.getByRole("heading", { name: /Your trip/i })).toBeVisible();
  // The platform name must NOT appear anywhere in the client-facing output.
  await expect(page.getByText(/TripForge/i)).toHaveCount(0);
  await expect(page.getByText(/Trellis/i)).toHaveCount(0);
});

test("workspace never leaks into the client view (INV-024 surface separation)", async ({ page }) => {
  await page.goto("/view");
  // Agency-workspace affordances must not appear on the traveler surface.
  await expect(page.getByRole("link", { name: /Agency workspace/i })).toHaveCount(0);
  await expect(page.getByText(/agency membership/i)).toHaveCount(0);
});
