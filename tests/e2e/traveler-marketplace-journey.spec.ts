import { test, expect, type Page } from "@playwright/test";
import { DRAFT_TIMEOUT_MS, draftParisTrip, signUpAgency, signUpTraveler, vetAgencyByName } from "./support.js";

// L4 traveler marketplace journey (spec 041; GOAL.md D2.7; INV-027). Runs against
// the BUILT compose image. A vetted agency lists a trip; a TRAVELER (org-less
// consumer, spec 030) browses the consumer marketplace, forks the listing into
// their own copy, lands on the standard trip flow, and finds it in My Trips.
//
// Assertions are planner-agnostic (structure + client-safe formatting, never
// model-authored titles) like planner-journey/marketplace-journey. The INV-020
// negative is the load-bearing check: the traveler marketplace card exposes the
// selling agency + a client "from" price, but NEVER the agent license fee, the
// declared revenue share, net cost, or markup.

// KITCHENLOOP-COVERAGE-BEGIN
// [
//   { "feature": "marketplace", "platform": "web", "user_type": "client", "result": "pass", "iteration": 11, "tier": "T2", "note": "traveler acts on a marketplace itinerary through the browser (spec 041): a vetted agency lists a trip; an org-less traveler browses /view/marketplace (client-safe card — agency name + verified badge + 'from' price, NO license fee / revenue share / net / markup, INV-020 negative asserted on the page body), forks it (Plan & book), lands on the standard /view/[token] self-book|request-agent fork, and the copy appears in My Trips; durable regression coverage of the consumer marketplace fork path" }
// ]
// KITCHENLOOP-COVERAGE-END

const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const seller = {
  name: "Marina Seller",
  email: `marina-mkt-${runId}@example.test`,
  password: "traveler-mkt-pass-9",
  agencyName: `Harbor DMC ${runId.slice(-6)}`,
};
const traveler = {
  name: "Theo Traveler",
  email: `theo-mkt-${runId}@example.test`,
  password: "traveler-mkt-pass-9",
};
const listingTitle = `Marketplace weekender ${runId.slice(-6)}`;
const LICENSE_FEE = "250";
const REVENUE_SHARE = "7.5";

test.describe.configure({ mode: "serial" });

async function listTrip(page: Page): Promise<void> {
  await signUpAgency(page, seller);
  await draftParisTrip(page, "2026-09-03");
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Marketplace" }).click();
  await expect(page).toHaveURL(/\/marketplace$/);
  vetAgencyByName(seller.agencyName);
  await page.getByLabel("Itinerary").selectOption({ index: 1 });
  await page.getByLabel("Listing title").fill(listingTitle);
  await page.getByLabel(/License fee/).fill(LICENSE_FEE);
  await page.getByLabel("License terms").fill("White-label permitted; keep attribution lineage.");
  await page.getByLabel("Revenue share %").fill(REVENUE_SHARE);
  await page.getByRole("button", { name: /List it on the marketplace/i }).click();
  await expect(page.getByTestId("listing-created")).toBeVisible({ timeout: 15_000 });
  // Leave no agency session behind — the traveler sign-up below needs a clean slate.
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
}

test("a traveler browses the marketplace and forks a listing into their own trip", async ({ page }) => {
  test.setTimeout(DRAFT_TIMEOUT_MS + 120_000);

  // ── Arrange: a vetted agency lists a trip ──────────────────────────────────
  await listTrip(page);

  // ── The traveler signs up on the consumer surface ──────────────────────────
  await page.goto("/view");
  await page.getByTestId("welcome-sign-up").click();
  await expect(page).toHaveURL(/\/view\/sign-up$/);
  await signUpTraveler(page, traveler, /\/view$/);

  // ── Browse the marketplace via the consumer nav ────────────────────────────
  await page
    .getByRole("navigation", { name: "Traveler navigation" })
    .getByRole("link", { name: "Marketplace", exact: true })
    .click();
  await expect(page).toHaveURL(/\/view\/marketplace$/);

  const card = page.getByTestId("marketplace-card").filter({ hasText: seller.agencyName });
  await expect(card).toHaveCount(1, { timeout: 15_000 });
  // Client-safe card: the selling agency's name, a verified badge (the agency
  // was vetted), and a "from" price.
  await expect(card.getByText(seller.agencyName)).toBeVisible();
  await expect(card.getByTestId("marketplace-vetted")).toBeVisible();
  await expect(card.getByTestId("marketplace-from-price")).toContainText(/from\s+\d/);

  // INV-020 NEGATIVE (the load-bearing check): the agent-facing listing economics
  // NEVER reach the traveler marketplace — no license fee, declared revenue
  // share, net cost, or markup anywhere on the page, and no platform wordmark.
  const body = page.locator("body");
  await expect(body).not.toContainText(`${REVENUE_SHARE}%`);
  await expect(body).not.toContainText("revenue share");
  await expect(body).not.toContainText("License fee");
  await expect(body).not.toContainText("License terms");
  await expect(body).not.toContainText(/net rate/i);
  await expect(body).not.toContainText(/markup/i);
  await expect(body).not.toContainText(/TripForge|Trellis/i);

  // ── Fork → land on the standard trip flow ──────────────────────────────────
  await card.getByTestId("marketplace-fork").click();
  await expect(page).toHaveURL(/\/view\/[0-9a-f-]{36}$/, { timeout: 15_000 });
  const forkedUrl = page.url();
  // The forked copy opens on the SAME self-book / request-agent fork every
  // shared trip uses (reused verbatim, spec 022/036).
  await expect(page.getByTestId("fork-self-drive")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("fork-handoff")).toBeVisible();

  // ── The forked copy is in My Trips ─────────────────────────────────────────
  await page
    .getByRole("navigation", { name: "Traveler navigation" })
    .getByRole("link", { name: "My Trips", exact: true })
    .click();
  await expect(page).toHaveURL(/\/view\/my-trips$/);
  const myTripRows = page.getByTestId("my-trips-row");
  await expect(myTripRows.first()).toBeVisible({ timeout: 15_000 });
  // At least one linked trip carries the SELLING agency's name (the copy is
  // seller-owned; the traveler sees the agency's brand, INV-020).
  await expect(page.getByTestId("my-trips-list").getByText(seller.agencyName).first()).toBeVisible();

  // Re-opening the copy from My Trips returns to the same trip view.
  await myTripRows.filter({ hasText: seller.agencyName }).first().click();
  await expect(page).toHaveURL(forkedUrl);
});
