import { test, expect, type Page } from "@playwright/test";
import { signUpAgency, vetAgencyByName } from "./support.js";

// L4 marketplace journey (spec 011, ticket seed-0009d; INV-027). Runs against
// the BUILT compose image (playwright.config baseURL) under either planner —
// assertions are planner-agnostic (structure + exact money FORMATTING, never
// model-authored text), like planner-journey.spec.ts.
//
// The FULL trade loop with two real agencies (research D10): the seller signs
// up, drafts, and is refused listing while UNVETTED (the who-may-list gate is
// real UX, witnessed here); the operator vets (support.ts arrangement — the
// operator action is not a UI capability); the listing goes live marked "Your
// listing" with NO license action on the owner's own card. A second agency
// then sees the listing cross-tenant, licenses it, and gets the split receipt
// whose numbers are the platform's own integers (fee 250.00 USD at the fixed
// 10% platform take → 225.00 seller credit / 25.00 platform take, the same
// split the L3 suite pins against the ledger). Re-licensing refuses benignly.
// A signed-out visitor never sees marketplace data (INV-024).

const DRAFT_TIMEOUT_MS = 90_000;

const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const seller = {
  name: "Sella Seller",
  email: `sella-${runId}@example.test`,
  password: "marketplace-pass-9",
  agencyName: `Atlas DMC ${runId.slice(-6)}`,
};
const buyer = {
  name: "Bua Buyer",
  email: `bua-${runId}@example.test`,
  password: "marketplace-pass-9",
  agencyName: `Nomad Collective ${runId.slice(-6)}`,
};
const listingTitle = `Paris weekender ${runId.slice(-6)}`;

test.describe.configure({ mode: "serial" });

async function draftTrip(page: Page): Promise<void> {
  await page.getByLabel("Destination").fill("Paris");
  await page.getByLabel("Check-in").fill("2026-09-01");
  await page.getByLabel("Check-out").fill("2026-09-03");
  await page.getByLabel("Adults").fill("2");
  await page.getByLabel("Children").fill("0");
  await page.getByLabel("Trip style").selectOption("balanced");
  await page.getByLabel("Budget", { exact: true }).fill("1000");
  await page.getByLabel("Budget mode").selectOption("hardCap");
  await page.getByLabel("Currency").fill("USD");
  await page.getByRole("button", { name: /Draft itinerary/i }).click();
  await expect(page.getByTestId("draft-result")).toBeVisible({ timeout: DRAFT_TIMEOUT_MS });
}

async function fillListingForm(page: Page): Promise<void> {
  // The picker option carries the itinerary title + currency; one itinerary
  // exists for this fresh agency, so pick by index 1 (0 is the placeholder).
  await page.getByLabel("Itinerary").selectOption({ index: 1 });
  await page.getByLabel("Listing title").fill(listingTitle);
  await page.getByLabel(/License fee/).fill("250");
  await page.getByLabel("License terms").fill("White-label permitted; keep attribution lineage.");
  await page.getByLabel("Revenue share %").fill("7.5");
}

test("a seller lists a drafted trip — refused unvetted, live once vetted (US1+US2)", async ({
  page,
}) => {
  test.setTimeout(DRAFT_TIMEOUT_MS + 60_000);
  await signUpAgency(page, seller);
  await draftTrip(page);

  // To the marketplace via the workspace nav (contract §1).
  await page.getByRole("navigation", { name: "Workspace" }).getByRole("link", { name: "Marketplace" }).click();
  await expect(page).toHaveURL(/\/marketplace$/);
  await expect(page.getByTestId("marketplace-browse")).toBeVisible();

  // UNVETTED listing attempt: the who-may-list gate is real and explained.
  await fillListingForm(page);
  await page.getByRole("button", { name: /List it on the marketplace/i }).click();
  await expect(page.getByText(/isn't vetted for the marketplace yet/)).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByTestId("listing-created")).toHaveCount(0);

  // The operator vets the agency (support.ts arrangement), the SAME form submits.
  vetAgencyByName(seller.agencyName);
  await page.getByRole("button", { name: /List it on the marketplace/i }).click();
  await expect(page.getByTestId("listing-created")).toBeVisible({ timeout: 15_000 });

  // Browse reloaded without a page reload (FR-011): own card, marked, no buy button.
  const card = page.getByTestId("listing-card").filter({ hasText: listingTitle });
  await expect(card).toHaveCount(1);
  await expect(card.getByText("Your listing")).toBeVisible();
  await expect(card.getByRole("button", { name: /License this trip/i })).toHaveCount(0);
  await expect(card.getByText("250.00 USD")).toBeVisible();
  await expect(card.getByText("7.5% revenue share")).toBeVisible();
  await expect(card.getByText("Not yet rated")).toBeVisible();
});

test("another agency licenses it cross-tenant and sees the recorded split (US3)", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await signUpAgency(page, buyer);
  vetAgencyByName(buyer.agencyName);

  await page.goto("/marketplace");
  const card = page.getByTestId("listing-card").filter({ hasText: listingTitle });
  await expect(card).toHaveCount(1, { timeout: 15_000 });
  // Cross-tenant view (SC-002): the seller's brand, not "Your listing".
  await expect(card.getByText(seller.agencyName)).toBeVisible();
  await expect(card.getByText("Your listing")).toHaveCount(0);

  await card.getByRole("button", { name: /License this trip/i }).click();
  const receipt = page.getByTestId("license-receipt");
  await expect(receipt).toBeVisible({ timeout: 15_000 });

  // The recorded split, verbatim platform integers (SC-004): 25_000 minor at
  // the fixed 10% platform take — the exact identity the L3 ledger test pins.
  await expect(receipt.getByText("250.00 USD", { exact: true })).toBeVisible();
  await expect(receipt.getByText("225.00 USD", { exact: true })).toBeVisible();
  await expect(receipt.getByText("25.00 USD", { exact: true })).toBeVisible();
  const copyRef = await receipt.locator("code").innerText();
  expect(copyRef).toMatch(/^[0-9a-f-]{36}$/);

  // Re-license: benign typed refusal, no second charge pretended.
  await card.getByRole("button", { name: /License this trip/i }).click();
  await expect(card.getByText(/already licensed this trip/)).toBeVisible({ timeout: 15_000 });
});

test("a signed-out visitor gets the membership prompt, never marketplace data (INV-024)", async ({
  page,
}) => {
  await page.goto("/marketplace");
  await expect(page.getByText(/You need an agency membership to trade/)).toBeVisible();
  await expect(page.getByTestId("marketplace-browse")).toHaveCount(0);
  await expect(page.getByTestId("listing-card")).toHaveCount(0);
});
