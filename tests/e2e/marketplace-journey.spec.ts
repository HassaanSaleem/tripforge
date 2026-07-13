import { test, expect, type Page } from "@playwright/test";
import { DRAFT_TIMEOUT_MS, draftParisTrip, signInAgency, signUpAgency, vetAgencyByName } from "./support.js";

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

// KITCHENLOOP-COVERAGE-BEGIN
// [
//   { "feature": "marketplace", "platform": "web", "user_type": "agent-reseller", "result": "pass", "iteration": 3, "tier": "T2", "note": "full two-agency trade loop through the browser: seller drafts and is refused listing while unvetted, operator vets, listing goes live; a second (reseller) agency licenses cross-tenant and receives a receipt with the platform's conserved 10% split; re-licensing refuses benignly; a signed-out visitor sees no marketplace data (INV-024); durable regression coverage since PR #27" }
// ]
// KITCHENLOOP-COVERAGE-END

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
  await draftParisTrip(page, "2026-09-03");

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
  // Seller earnings surface (spec 014 US1): explicit zero before any license.
  await expect(card.getByTestId("listing-earnings")).toHaveText("0 licenses · 0.00 USD earned");

  // Sell-form picker friction fix (ticket 1783795719335319923): the
  // just-listed itinerary drops out of its OWN picker in place (no reload),
  // marked and disabled rather than offered again as if listable. Structural
  // assertion only (option count + suffix, not the model-authored itinerary
  // title the option renders) — same planner-agnostic convention as the
  // picker-refresh assertion below.
  const itineraryOptions = page.getByLabel("Itinerary").locator("option:not([value=''])");
  await expect(itineraryOptions).toHaveCount(1);
  await expect(itineraryOptions.first()).toHaveText(/already listed$/);
  // toBeDisabled() doesn't reliably read <option>'s own disabled attribute
  // (it evaluates against the ancestor <select>, which stays enabled) — the
  // HTML attribute itself is the ground truth.
  await expect(itineraryOptions.first()).toHaveAttribute("disabled", "");

  // Workspace trip list (spec 014 US2): the "Listed" mark carries the fee.
  await page.getByRole("navigation", { name: "Workspace" }).getByRole("link", { name: "Workspace" }).click();
  await expect(page.getByTestId("trip-listed")).toHaveText("Listed · 250.00 USD");
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

  // This fresh agency has nothing to sell yet — the empty sell-form state is
  // the pre-license witness for the picker-refresh assertion below (seed-0016).
  await expect(page.getByTestId("no-itineraries")).toBeVisible();

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

  // The receipt says the copy "is now in your workspace" — the sell-form
  // picker on the SAME page must agree without a reload (seed-0016): the
  // empty state is replaced in place and the copy is pickable. Structural
  // assertions only (option count, not model-authored titles) so the spec
  // stays planner-agnostic.
  await expect(page.getByTestId("no-itineraries")).toHaveCount(0);
  const pickerAfterLicense = page.getByLabel("Itinerary");
  await expect(pickerAfterLicense).toBeVisible();
  await expect(pickerAfterLicense.locator("option")).toHaveCount(2); // placeholder + the new copy

  // Re-license: benign typed refusal, no second charge pretended.
  await card.getByRole("button", { name: /License this trip/i }).click();
  await expect(card.getByText(/already licensed this trip/)).toBeVisible({ timeout: 15_000 });

  // Rate the trip now that this agency holds a license (US3, seed-0009d-a) —
  // the license row IS the permission to rate (FR-013).
  await card.getByLabel("Your rating").selectOption("4");
  await card.getByLabel("Comment (optional)").fill("Smooth booking, would resell again.");
  await card.getByRole("button", { name: /Submit rating/i }).click();
  await expect(card.getByTestId("rate-listing-confirmed")).toBeVisible({ timeout: 15_000 });
  await expect(card.getByText("★ 4.0 (1)")).toBeVisible();
});

test("the seller's own card now shows the license and the exact seller credit (spec 014 US1)", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await signInAgency(page, { email: seller.email, password: seller.password });
  await page.goto("/marketplace");
  const card = page.getByTestId("listing-card").filter({ hasText: listingTitle });
  await expect(card).toHaveCount(1, { timeout: 15_000 });
  // 250.00 USD at the fixed 10% platform take → 225.00 seller credit (same
  // split the L3 suite pins), now visible on the seller's own card.
  await expect(card.getByTestId("listing-earnings")).toHaveText("1 license · 225.00 USD earned");
  // Copy fix (ticket 17837888449248712164): the declared-share badge sits
  // beside the earnings figure, but a caption now makes clear the two are
  // NOT cause-and-effect — the badge governs only a not-yet-wired resale,
  // never this first sale.
  await expect(card.getByTestId("listing-share-note")).toHaveText(
    /applies to future resales.*platform.*fixed take rate, not this share/,
  );
  // The buyer's rating persisted cross-tenant, visible on the seller's own card.
  await expect(card.getByText("★ 4.0 (1)")).toBeVisible();

  // Seller takes the listing off the marketplace (contract §3, seed-0009d-a)
  // — no rate control on your own card, only the deactivate action.
  await expect(card.getByTestId("rate-listing-form")).toHaveCount(0);
  await card.getByTestId("deactivate-listing").click();
  await expect(card).toHaveCount(0, { timeout: 15_000 });
});

test("a signed-out visitor gets the membership prompt, never marketplace data (INV-024)", async ({
  page,
}) => {
  await page.goto("/marketplace");
  await expect(page.getByText(/You need an agency membership to trade/)).toBeVisible();
  await expect(page.getByTestId("marketplace-browse")).toHaveCount(0);
  await expect(page.getByTestId("listing-card")).toHaveCount(0);
});
