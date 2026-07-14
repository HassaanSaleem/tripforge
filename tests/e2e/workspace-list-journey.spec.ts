import { test, expect } from "@playwright/test";
import { DRAFT_TIMEOUT_MS, draftParisTrip, signInAgency, signUpAgency, vetAgencyByName } from "./support.js";

// L4 workspace trips journey (spec 012, ticket seed-0017; INV-027). Runs
// against the BUILT compose image under either planner — assertions are
// planner-agnostic (structure + formatting classes, never model-authored
// titles: white-label copies are titled after the TRIP, so titles are not
// stable fixtures). Covers: the empty state (US1), draft → row appears
// WITHOUT a reload (US3a) and survives a fresh mount (US1), open/continue
// with the existing booking + share flows (US2), and the licensed copy
// landing in the buyer's workspace list (US3b/FR-007).

const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const owner = {
  name: "Wanda Workspace",
  email: `wanda-${runId}@example.test`,
  password: "workspace-pass-9",
  agencyName: `Gamma Journeys ${runId.slice(-6)}`,
};
const buyer = {
  name: "Cora Copybuyer",
  email: `cora-${runId}@example.test`,
  password: "workspace-pass-9",
  agencyName: `Delta Escapes ${runId.slice(-6)}`,
};
const listingTitle = `Paris list-witness ${runId.slice(-6)}`;

test.describe.configure({ mode: "serial" });

test("trips panel: empty state, draft appears without reload, survives reload, opens for continue-work (US1+US2+US3a)", async ({
  page,
}) => {
  test.setTimeout(DRAFT_TIMEOUT_MS + 90_000);
  await signUpAgency(page, owner);

  // Trips is its own nav destination now (spec 017 research D1) — sign-up
  // lands on the dashboard, so navigate there explicitly.
  await page.goto("/trips");

  // US1: a fresh agency sees the guidance empty state — planner and
  // marketplace both named, never a blank panel (contract §2).
  const panel = page.getByTestId("trips-panel");
  await expect(panel).toBeVisible();
  const empty = page.getByTestId("trips-empty");
  await expect(empty).toBeVisible();
  await expect(empty).toContainText(/planner/i);
  await expect(empty.getByRole("link", { name: /marketplace/i })).toBeVisible();

  // US3a (the seed-0016 staleness lesson): the drafted trip appears in the
  // panel WITHOUT a page reload — click the sidebar's Trips link (a Next.js
  // client-side transition, not a hard navigation) rather than page.goto();
  // the fresh mount fetches current data (spec 017 research D2), which is
  // what previously needed the same-page onDrafted signal.
  await draftParisTrip(page, "2026-09-03");
  // Flights card (spec 026, ticket demo-10-flights-deeplink): capture the
  // draft-time indicative options text so US3 (below) can prove reopening the
  // trip renders the SAME options — deterministic per trip, not re-rolled.
  const draftedFlightsOptions = await page
    .getByTestId("flights-card")
    .getByTestId("flights-options")
    .locator("li")
    .allTextContents();
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Trips" }).click();
  await expect(page).toHaveURL(/\/trips$/);
  const rows = page.getByTestId("trip-row");
  await expect(rows).toHaveCount(1, { timeout: 15_000 });
  await expect(page.getByTestId("trips-empty")).toHaveCount(0);
  await expect(rows.first().locator(".tf-badge")).toHaveText("USD");
  // Human-readable created date (research D6 format), not a raw ISO string.
  await expect(rows.first().locator("time")).toHaveText(/^\d{1,2} [A-Z][a-z]{2} \d{4}$/);

  // US1: a fresh mount serves the same list (the panel is not draft-session
  // state).
  await page.reload();
  await expect(page.getByTestId("trip-row")).toHaveCount(1, { timeout: 15_000 });

  // US2: open → day-by-day plan plus the EXISTING booking and share flows.
  await page.getByTestId("trip-open").click();
  await expect(page.getByTestId("opened-trip")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("heading", { name: /^Day 1/ })).toBeVisible();
  await expect(page.getByTestId("booking-flow")).toBeVisible();
  await expect(page.getByRole("button", { name: "Quote live prices" })).toBeVisible();
  await expect(page.getByTestId("share-control")).toBeVisible();

  // Flights card (spec 026 US3, SC-003): reopening the trip renders the
  // SAME indicative options shown right after drafting it — deterministic
  // across the draft-time and reopen-time render paths, not re-randomized.
  const reopenedFlightsCard = page.getByTestId("flights-card");
  await expect(reopenedFlightsCard).toBeVisible();
  const reopenedFlightsOptions = await reopenedFlightsCard.getByTestId("flights-options").locator("li").allTextContents();
  expect(reopenedFlightsOptions).toEqual(draftedFlightsOptions);
  await expect(page.getByRole("button", { name: "Share with client" })).toBeVisible();

  // Back returns to the intact list (contract §3).
  await page.getByTestId("trips-back").click();
  await expect(page.getByTestId("trips-panel")).toBeVisible();
  await expect(page.getByTestId("trip-row")).toHaveCount(1);
});

test("arrangement: the owner lists the drafted trip on the marketplace", async ({ page }) => {
  test.setTimeout(120_000);
  await signInAgency(page, { email: owner.email, password: owner.password });
  vetAgencyByName(owner.agencyName);

  await page.goto("/marketplace");
  await page.getByLabel("Itinerary").selectOption({ index: 1 });
  await page.getByLabel("Listing title").fill(listingTitle);
  await page.getByLabel(/License fee/).fill("250");
  await page.getByLabel("License terms").fill("White-label permitted; keep attribution lineage.");
  await page.getByLabel("Revenue share %").fill("7.5");
  await page.getByRole("button", { name: /List it on the marketplace/i }).click();
  await expect(page.getByTestId("listing-created")).toBeVisible({ timeout: 15_000 });

  // Listed mark (spec 014 US2): the owner's Trips list now carries the
  // listing's fee/currency alongside the row, no reload needed.
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Trips" }).click();
  await expect(page).toHaveURL(/\/trips$/);
  await expect(page.getByTestId("trip-listed")).toHaveText("Listed · 250.00 USD");
});

test("a licensed white-label copy lands in the buyer's workspace list and opens (US3b/FR-007)", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await signUpAgency(page, buyer);
  vetAgencyByName(buyer.agencyName);

  // The buyer's Trips destination starts empty — the pre-license witness.
  await page.goto("/trips");
  await expect(page.getByTestId("trips-panel")).toBeVisible();
  await expect(page.getByTestId("trips-empty")).toBeVisible();

  // License the owner's listing cross-tenant.
  await page.goto("/marketplace");
  const card = page.getByTestId("listing-card").filter({ hasText: listingTitle });
  await expect(card).toHaveCount(1, { timeout: 15_000 });
  await card.getByRole("button", { name: /License this trip/i }).click();
  await expect(page.getByTestId("license-receipt")).toBeVisible({ timeout: 15_000 });

  // Back on Trips, the white-label copy IS the buyer's one trip — structural
  // assertions only (count + badge), never the copy's title (copies are
  // titled after the trip, a planner-authored string).
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Trips" }).click();
  await expect(page).toHaveURL(/\/trips$/);
  const rows = page.getByTestId("trip-row");
  await expect(rows).toHaveCount(1, { timeout: 15_000 });
  await expect(page.getByTestId("trips-empty")).toHaveCount(0);
  await expect(rows.first().locator(".tf-badge").filter({ hasText: "USD" })).toHaveText("USD");

  // Licensed-copy marker (spec 024 FR-001/FR-002): attributed to the
  // original author, distinguishing the copy from a self-authored draft.
  await expect(rows.first().getByTestId("trip-licensed-copy")).toHaveText(
    `Licensed copy · original by ${owner.agencyName}`,
  );

  // Continue-work works on a licensed copy exactly as on an own draft (US2).
  await page.getByTestId("trip-open").click();
  await expect(page.getByTestId("opened-trip")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("heading", { name: /^Day 1/ })).toBeVisible();
  await expect(page.getByTestId("booking-flow")).toBeVisible();
  await expect(page.getByTestId("share-control")).toBeVisible();
});
