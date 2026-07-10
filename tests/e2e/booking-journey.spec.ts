import { test, expect, type Page } from "@playwright/test";
import { DRAFT_TIMEOUT_MS, draftParisTrip, signUpAgency } from "./support.js";

// L4 booking journey (spec 009, ticket seed-0009b; INV-027). Runs against the
// BUILT compose image under EITHER planner — the deterministic fake (INV-019,
// keyless stack) or the real Haiku tool loop (keyed stack) — so draft-side
// assertions stay planner-agnostic (structure and exact money FORMATTING, never
// model-authored text). The quote/book side is deterministic (sandbox supply
// engine) on both stacks. Exact per-failure message strings are pinned by the
// booking-flow L1 unit tests; this journey pins the rendered contract (§2).
//
// Serial journey: self-serve sign-up → draft the L3-proven trip → quote with
// the default markup and review held prices (US1) → book all holds and see the
// confirmation with supplier references (US2) → re-quote reports every item
// already booked with no book action (FR-008/research D10) → sign out → a
// signed-out visitor sees no booking controls (US4). Existing planner/sign-in
// negatives are NOT touched.

const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const agentName = "Bo Booker";
const agencyName = `Bo Voyages ${runId.slice(-6)}`;
const email = `bo-${runId}@example.test`;
const password = "booking-pass-9";

test.describe.configure({ mode: "serial" });

async function signUp(page: Page): Promise<void> {
  // Rate-limit-aware shared helper (support.ts) — same landing assertion.
  await signUpAgency(page, { name: agentName, email, password, agencyName });
}

test("an agent quotes with markup, books the holds, and a re-quote reports them booked (US1+US2, FR-008)", async ({
  page,
}) => {
  test.setTimeout(DRAFT_TIMEOUT_MS + 90_000);
  await signUp(page);
  await draftParisTrip(page);

  // Booking controls render only inside the drafted plan (FR-001): markup
  // control pre-filled with the platform default.
  await expect(page.getByLabel("Markup %")).toHaveValue("15");

  // Shape the network so the pending state is observable (FR-004): hold the
  // quote call briefly — no response or assertion is altered.
  await page.route("**/api/trpc/workspace.booking.quote*", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 700));
    await route.continue();
  });
  await page.getByRole("button", { name: "Quote live prices" }).click();
  await expect(page.getByRole("button", { name: "Quoting…" })).toBeDisabled();

  // Review (US1, contract §2.1): held rows carry net + sell prices in the trip
  // currency, the applied markup, the hold expiry, and a checked selection box.
  const review = page.getByTestId("quote-review");
  await expect(review).toBeVisible({ timeout: 15_000 });
  await expect(review.getByText(/[\d,]+\.\d{2} USD/).first()).toBeVisible();
  await expect(review.getByText("15%").first()).toBeVisible();
  await expect(review.getByText(/Held until /).first()).toBeVisible();
  const checkboxes = review.getByRole("checkbox");
  const heldCount = await checkboxes.count();
  expect(heldCount).toBeGreaterThan(0);
  for (let i = 0; i < heldCount; i += 1) {
    await expect(checkboxes.nth(i)).toBeChecked();
  }

  // Book (US2, contract §2.2): pending state, then the confirmation with the
  // booking reference and one confirmed line per component.
  await page.route("**/api/trpc/workspace.booking.book*", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 700));
    await route.continue();
  });
  await page.getByRole("button", { name: "Book selected items" }).click();
  await expect(page.getByRole("button", { name: "Booking…" })).toBeDisabled();

  const confirmation = page.getByTestId("booking-confirmation");
  await expect(confirmation).toBeVisible({ timeout: 15_000 });
  await expect(confirmation.getByRole("heading", { name: "Booking confirmed" })).toBeVisible();
  await expect(confirmation.getByText(/Booking reference:/)).toBeVisible();
  const confirmedLines = confirmation.getByText(/supplier ref/);
  expect(await confirmedLines.count()).toBe(heldCount);
  await expect(confirmation.getByText(/[\d,]+\.\d{2} USD/).first()).toBeVisible();

  // Re-quote (FR-008, research D10): booked items are reported by the PLATFORM
  // as already booked — nothing selectable, no book action enabled.
  await page.getByRole("button", { name: "Quote live prices" }).click();
  await expect(review).toBeVisible({ timeout: 15_000 });
  await expect(
    review.getByText("Already booked — this item is covered by an existing booking.").first(),
  ).toBeVisible();
  await expect(review.getByText(/No items could be held at live prices/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Book selected items" })).toHaveCount(0);
  await expect(page.getByTestId("booking-confirmation")).toHaveCount(0);

  // Leave no session behind for the guardrail test (and pin sign-out still works).
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
});

test("a signed-out visitor sees no booking controls anywhere (US4)", async ({ page }) => {
  await page.goto("/workspace");
  await expect(page.getByText(/agency membership/i)).toBeVisible();
  await expect(page.getByLabel("Markup %")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Quote live prices" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Book selected items" })).toHaveCount(0);
  await expect(page.getByTestId("booking-flow")).toHaveCount(0);
});
