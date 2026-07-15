import { test, expect } from "@playwright/test";
import { signUpAgency } from "./support.js";

// L4 bring-your-own itinerary journey (spec 029). Runs against the BUILT
// compose image (INV-027). Builds a multi-day, multi-item trip by hand (no
// AI planner interaction), confirms it lands in the workspace list with the
// "Self-built" origin badge (distinct from AI-drafted trips), and reopens
// with the entered days/items rendered via the SAME shared day component the
// AI planner's drafted trips use — zero new rendering code.

const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const agent = {
  name: "Manny Manual",
  email: `manny-${runId}@example.test`,
  password: "manual-pass-9",
  agencyName: `Handbuilt Journeys ${runId.slice(-6)}`,
};

test("build a trip by hand, see it in the trips list with the self-built badge, reopen with matching days/items", async ({ page }) => {
  test.setTimeout(90_000);
  await signUpAgency(page, agent);

  await page.goto("/trips");
  await expect(page.getByTestId("trips-panel")).toBeVisible();
  await page.getByTestId("trip-build-manual").click();

  const form = page.getByTestId("manual-itinerary-form");
  await expect(form).toBeVisible();

  await page.fill("#manual-title", "Hand-built Lisbon weekend");
  await page.fill("#manual-currency", "USD");
  await page.fill("#manual-destination", "Lisbon");
  await page.fill("#manual-checkin", "2026-10-01");
  await page.fill("#manual-checkout", "2026-10-04");
  await page.fill("#manual-adults", "2");

  // Day 1 already exists by default — add a stay item to it.
  await page.getByTestId("manual-add-stay-0").click();
  const stayRow = page.getByTestId("manual-item-0-0");
  await stayRow.getByLabel("Title").fill("Boutique hotel in Alfama");
  await stayRow.getByLabel("Check-in").fill("2026-10-01");
  await stayRow.getByLabel("Check-out").fill("2026-10-04");

  // Add a second day with an unpriced activity.
  await page.getByTestId("manual-add-day").click();
  await page.getByTestId("manual-add-activity-1").click();
  const activityRow = page.getByTestId("manual-item-1-0");
  await activityRow.getByLabel("Title").fill("Fado evening");

  await page.getByTestId("manual-submit").click();

  // Submission opens the newly created trip directly.
  await expect(page.getByTestId("opened-trip")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "Hand-built Lisbon weekend" })).toBeVisible();
  await expect(page.getByText("Boutique hotel in Alfama")).toBeVisible();
  await expect(page.getByText("Fado evening")).toBeVisible();

  // Back on the list: the self-built origin badge, distinct from a
  // licensed-copy or AI-drafted badge.
  await page.getByTestId("trips-back").click();
  const row = page.getByTestId("trip-row").filter({ hasText: "Hand-built Lisbon weekend" });
  await expect(row).toHaveCount(1);
  await expect(row.getByTestId("trip-origin")).toHaveText("Self-built");
  await expect(row.getByTestId("trip-licensed-copy")).toHaveCount(0);
});
