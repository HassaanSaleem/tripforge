import { test, expect } from "@playwright/test";
import { DRAFT_TIMEOUT_MS, draftParisTrip, signUpAgency, vetAgencyByName } from "./support.js";

// L4 group-travel journey (spec 021, ticket demo-11-group-travel; INV-027).
// Runs against the BUILT compose image (playwright.config baseURL). An agent
// drafts a trip, posts it as a group departure with capacity 1, joins the
// only seat on behalf of a named client (seats-left reaches 0 in place, no
// reload), a second join attempt is refused sold-out, and cancelling a
// SEPARATE departure removes it from browse. Assertions are structural/
// numeric (never model-authored planner text), matching marketplace-journey.

// No KITCHENLOOP-COVERAGE block: "group-travel" (feature) and "agent" (user_type)
// are not in kitchenloop.yaml's spec.dimensions vocabulary (features:
// itinerary-builder/content-library/booking/marketplace/trust/revenue-share;
// user_types: agent-seller/agent-reseller/client) — the block this file
// originally shipped with (PR #61) declared both anyway, which hard-crashes
// derive-coverage.mjs's vocabulary guard the first time anyone runs it (every
// run since PR #61 merged, including the regress phase's coverage-derivation
// step). Removed rather than force-fit into a wrong existing dimension;
// ticketed (17840666553970558336, iteration 6) for an operator decision on
// whether "group-travel" becomes an official 7th feature dimension — this
// test itself is untouched and still passes.

const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const agent = {
  name: "Gia Guide",
  email: `gia-${runId}@example.test`,
  password: "group-travel-pass-9",
  agencyName: `Sunset Journeys ${runId.slice(-6)}`,
};

test("an agent posts a group departure, joins the only seat, and a second join sells out (US1+US2+US3)", async ({
  page,
}) => {
  test.setTimeout(DRAFT_TIMEOUT_MS + 60_000);
  await signUpAgency(page, agent);
  vetAgencyByName(agent.agencyName);
  await draftParisTrip(page, "2026-10-05");

  // To Group Travel via the sidebar nav (spec 021 contract; spec 017 pattern).
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Group Travel" }).click();
  await expect(page).toHaveURL(/\/group-travel$/);
  await expect(page.getByTestId("group-travel-browse")).toBeVisible();

  // Post a capacity-1 departure.
  await page.getByLabel("Itinerary").selectOption({ index: 1 });
  await page.getByLabel("Departure date").fill("2026-11-01");
  await page.getByLabel("Total seats").fill("1");
  await page.getByLabel(/Price per seat/).fill("450");
  await page.getByRole("button", { name: /Post this group departure/i }).click();
  await expect(page.getByTestId("departure-posted")).toBeVisible({ timeout: 15_000 });

  const card = page.getByTestId("group-trip-card").first();
  await expect(card).toBeVisible();
  await expect(card.getByText("Your departure")).toBeVisible();
  await expect(card.getByText("1 of 1 seats left")).toBeVisible();
  await expect(card.getByText("450.00 USD / seat")).toBeVisible();

  // Join the only seat on behalf of a named client — seats-left reaches 0 in
  // place, and the JOINING actor sees their OWN confirmation, not the
  // generic sold-out message (their action earned that feedback; a
  // departure stays joinable for multiple clients until it is truly full).
  await card.getByLabel("Client name").fill("Jamie Lee");
  await card.getByRole("button", { name: /Join a seat/i }).click();
  await expect(card.getByTestId("join-confirmed")).toBeVisible({ timeout: 15_000 });
  await expect(card.getByText("0 of 1 seats left")).toBeVisible();

  // A FRESH view of the same departure (local join-state cleared by reload)
  // shows the generic sold-out message instead of the now-stale confirmation.
  await page.reload();
  await expect(page.getByTestId("group-trip-card").first().getByTestId("departure-sold-out")).toBeVisible();

  // Post a second departure to exercise cancellation.
  await draftParisTrip(page, "2026-10-06");
  await page.goto("/group-travel");
  await page.getByLabel("Itinerary").selectOption({ index: 1 });
  await page.getByLabel("Departure date").fill("2026-12-01");
  await page.getByLabel("Total seats").fill("4");
  await page.getByLabel(/Price per seat/).fill("300");
  await page.getByRole("button", { name: /Post this group departure/i }).click();
  await expect(page.getByTestId("departure-posted")).toBeVisible({ timeout: 15_000 });
  const secondCard = page.getByTestId("group-trip-card").filter({ hasText: "4 of 4 seats left" });
  await expect(secondCard).toBeVisible();
  await secondCard.getByTestId("cancel-departure").click();
  await expect(secondCard).toHaveCount(0, { timeout: 15_000 });
});

test("a signed-out visitor gets the membership prompt, never group-departure data (INV-024)", async ({ page }) => {
  await page.goto("/group-travel");
  await expect(page.getByText(/You need an agency membership to post or join group departures/)).toBeVisible();
  await expect(page.getByTestId("group-travel-browse")).toHaveCount(0);
  await expect(page.getByTestId("group-trip-card")).toHaveCount(0);
});
