import { test, expect } from "@playwright/test";
import { DRAFT_TIMEOUT_MS, draftParisTrip, signUpAgency, vetAgencyByName } from "./support.js";

// L4 declared-terms integrity (ticket seed-0009d-b; Constitution VI). Runs
// against the BUILT compose image; assertions are planner-agnostic.
//
// The recovered seed-0009d UAT run witnessed a seller's declared revenue
// share (7.5) silently SNAP BACK to the 10 default after a refused
// submission, so the retry listed at terms the seller never declared. The
// trigger is any input path that sets a field's DOM value without the events
// a controlled React input needs to commit state (autofill, password
// managers, some automation fills): the refusal re-render restores the stale
// state value over what the seller sees. marketplace-journey.spec.ts already
// covers the committed-events path (Playwright fill()); THIS spec pins the
// uncommitted path by setting the DOM value directly, exactly the class of
// fill that produced the live failure.

const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const seller = {
  name: "Tera Terms",
  email: `tera-${runId}@example.test`,
  password: "terms-integrity-9",
  agencyName: `Terra Trails ${runId.slice(-6)}`,
};
const listingTitle = `Paris keeper ${runId.slice(-6)}`;

test("a declared revenue share survives a refused submission even when the fill never commits to state (seed-0009d-b)", async ({
  page,
}) => {
  test.setTimeout(DRAFT_TIMEOUT_MS + 90_000);
  await signUpAgency(page, seller);
  await draftParisTrip(page);

  await page.goto("/marketplace");
  await expect(page.getByLabel("Itinerary")).toBeVisible();

  // Pre-pick, the fee field must say what currency it prices in (seed-0020):
  // the hint reads until an itinerary is picked, then the label's currency
  // suffix takes over and the hint leaves.
  await expect(page.getByText(/Priced in the picked itinerary/)).toBeVisible();
  await expect(page.getByText(/License fee \(USD\)/)).toHaveCount(0);

  // Fill the form; the SHARE field gets its value straight on the DOM node —
  // no input/change events, so React state still holds the "10" default while
  // the seller sees 7.5. This mirrors autofill/password-manager behavior and
  // the fill technique of the UAT run that caught the bug.
  await page.getByLabel("Itinerary").selectOption({ index: 1 });
  await expect(page.getByText(/License fee \(USD\)/)).toBeVisible(); // drafted trip is USD
  await expect(page.getByText(/Priced in the picked itinerary/)).toHaveCount(0);
  await page.getByLabel("Listing title").fill(listingTitle);
  await page.getByLabel(/License fee/).fill("300");
  await page.getByLabel("License terms").fill("White-label permitted; keep attribution lineage.");
  await page.getByLabel("Revenue share %").evaluate((field) => {
    (field as HTMLInputElement).value = "7.5";
  });
  await expect(page.getByLabel("Revenue share %")).toHaveValue("7.5");

  // Unvetted submission is refused — and the declared share MUST NOT snap
  // back to the default on the refusal re-render.
  await page.getByRole("button", { name: /List it on the marketplace/i }).click();
  await expect(page.getByText(/isn't vetted for the marketplace yet/)).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByLabel("Revenue share %")).toHaveValue("7.5");

  // Vetted retry (operator-side arrangement) lists at the DECLARED terms.
  vetAgencyByName(seller.agencyName);
  await page.getByRole("button", { name: /List it on the marketplace/i }).click();
  await expect(page.getByTestId("listing-created")).toBeVisible({ timeout: 15_000 });

  const card = page.getByTestId("listing-card").filter({ hasText: listingTitle });
  await expect(card).toHaveCount(1);
  await expect(card.getByText("7.5% revenue share")).toBeVisible();
  await expect(card.getByText("300.00 USD")).toBeVisible();
});
