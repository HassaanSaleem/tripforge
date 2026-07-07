import { test, expect } from "@playwright/test";

// L4 live-verification smoke (INV-027, ADR-0003). Runs against the BUILT compose
// image (playwright.config baseURL). Activated once the operator wires the sealed
// verification.live.* commands in kitchenloop.yaml; until then the execute phase
// records SKIPPED (pre-skeleton). The journey: land on the app, reach the workspace
// surface, confirm the client-view is white-labeled (no platform branding).

test("home page loads and links both surfaces", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "TripForge" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Agency workspace/i })).toBeVisible();
});

test("workspace surface prompts sign-in for an anonymous visitor", async ({ page }) => {
  await page.goto("/workspace");
  await expect(page.getByRole("heading", { name: /Agency workspace/i })).toBeVisible();
  // Anonymous visitor is not an agent → sees the membership prompt (INV-024).
  await expect(page.getByText(/agency membership/i)).toBeVisible();
});

test("client view carries the agent's brand, not the platform's (INV-020)", async ({ page }) => {
  await page.goto("/view");
  await expect(page.getByRole("heading", { name: /Your trip/i })).toBeVisible();
  // INV-020 is a NEGATIVE guarantee: the white-labeled client view must expose the
  // agent's brand and NOT the platform's. Without these absence assertions this test
  // could not fail for its stated reason (a "TripForge"/"Trellis" leak would slip by).
  await expect(page.getByText(/TripForge/i)).toHaveCount(0);
  await expect(page.getByText(/Trellis/i)).toHaveCount(0);
});
