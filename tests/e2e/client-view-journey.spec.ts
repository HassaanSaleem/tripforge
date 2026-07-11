import { test, expect, type Page, type Browser } from "@playwright/test";
import { DRAFT_TIMEOUT_MS, draftParisTrip, signUpAgency } from "./support.js";

// L4 client-view share journey (spec 010, ticket seed-0009c; INV-027). Runs
// against the BUILT compose image under either planner (deterministic fake or
// real Haiku) — assertions are planner-agnostic (structure, branding, money
// FORMATTING; never model-authored text).
//
// Serial journey: self-serve sign-up → draft → "Share with client" mints the
// durable link (US2) → the SAME link opens in a FRESH ANONYMOUS browser
// context (no cookies — link-bearer access, US1) where the traveler sees the
// agency's brand, day-by-day items and sell prices — and none of the
// platform's branding, net rates, markup, or budget internals (INV-020,
// FR-006/FR-007). Unknown tokens render the neutral unavailable state
// (FR-003). The tokenless /view placeholder is pinned by trust-boundary.spec.ts
// and smoke.spec.ts, both untouched by this feature.

const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const agentName = "Vera Viewer";
const agencyName = `Vista Voyages ${runId.slice(-6)}`;
const email = `vera-${runId}@example.test`;
const password = "client-view-9";

test.describe.configure({ mode: "serial" });

async function signUp(page: Page): Promise<void> {
  await signUpAgency(page, { name: agentName, email, password, agencyName });
}

/** Open a url in a brand-new, cookie-less context (the traveler's browser). */
async function openAnonymously(browser: Browser, url: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(url);
  return { context, page };
}

test("an agent shares a drafted trip and an anonymous traveler sees the white-label view (US1+US2)", async ({
  page,
  browser,
}) => {
  test.setTimeout(DRAFT_TIMEOUT_MS + 90_000);
  await signUp(page);
  await draftParisTrip(page);

  // US2: the share control lives inside the drafted plan; one click mints the link.
  const shareControl = page.getByTestId("share-control");
  await expect(shareControl).toBeVisible();
  await shareControl.getByRole("button", { name: "Share with client" }).click();
  const urlText = shareControl.getByTestId("share-url");
  await expect(urlText).toBeVisible({ timeout: 15_000 });
  const sharedUrl = (await urlText.textContent())?.trim() ?? "";
  expect(sharedUrl).toMatch(/\/view\/[0-9a-f-]{36}$/i);

  // US1: the traveler opens the link with NO session, in a fresh context.
  const { context, page: traveler } = await openAnonymously(browser, sharedUrl);
  try {
    // The agency is the brand — in the body AND the tab title (FR-006).
    await expect(traveler.getByText(agencyName).first()).toBeVisible();
    await expect(traveler).toHaveTitle(new RegExp(agencyName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

    // Day-by-day content with sell prices, exactly as formatted by the server
    // integers (FR-008) — and a trip total.
    await expect(traveler.getByRole("heading", { name: /Day 1/ })).toBeVisible();
    await expect(traveler.getByText(/[\d,]+\.\d{2} USD/).first()).toBeVisible();
    await expect(traveler.getByText(/Trip total/i)).toBeVisible();

    // spec 013 (FR-004): nothing is booked yet, so every shown price is an
    // estimate and the total says it includes estimates.
    await expect(traveler.locator(".tf-client-items .tf-price-note").first()).toBeVisible();
    await expect(traveler.locator(".tf-client-total .tf-price-note")).toHaveText("includes estimates");

    // INV-020 negatives on the TOKENIZED page: platform naming appears nowhere —
    // body, title — and agent-confidential vocabulary never reaches the page.
    await expect(traveler.getByText(/TripForge/i)).toHaveCount(0);
    await expect(traveler.getByText(/Trellis/i)).toHaveCount(0);
    await expect(traveler).not.toHaveTitle(/TripForge|Trellis/i);
    // Field-name scan over EVERYTHING the traveler's browser received for this
    // document (SSR HTML + RSC payload): the redacted projection's forbidden
    // vocabulary must be absent. Exact field names — "markupBps", not "markup" —
    // so external asset names can never mask a real leak. (Value-level leak
    // checks live in the L3 suite against the stored row.)
    const html = await traveler.content();
    for (const forbidden of ["TripForge", "Trellis", "netRate", "netMinor", "markupBps", "supplyRef", "budgetMode"]) {
      expect(html, `client view leaked "${forbidden}"`).not.toContain(forbidden);
    }

    // INV-024: no workspace affordances on the traveler surface.
    await expect(traveler.getByRole("link", { name: /workspace/i })).toHaveCount(0);
    await expect(traveler.getByRole("button", { name: /Sign out/i })).toHaveCount(0);
  } finally {
    await context.close();
  }

  // FR-004 (one durable link, idempotent re-share) is pinned by the L3 suite —
  // the UI exposes a single mint action per drafted plan, so there is no
  // browser-side double-share surface to exercise here.
});

test("a booked trip is priced from the booking record on the traveler view (spec 013 US1)", async ({
  page,
  browser,
}) => {
  test.setTimeout(DRAFT_TIMEOUT_MS + 120_000);
  // Fresh agency for this test — serial mode does not share the session context.
  await signUpAgency(page, {
    name: "Betty Booked",
    email: `betty-${runId}@example.test`,
    password,
    agencyName: `Booked Voyages ${runId.slice(-6)}`,
  });
  await draftParisTrip(page);

  // Quote at a deliberately NON-default markup and book every hold — the
  // seed-0025 live repro (quickstart §4).
  await page.getByLabel("Markup %").fill("22");
  await page.getByRole("button", { name: "Quote live prices" }).click();
  await expect(page.getByTestId("quote-review")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Book selected items" }).click();
  const confirmation = page.getByTestId("booking-confirmation");
  await expect(confirmation).toBeVisible({ timeout: 15_000 });
  await expect(confirmation.getByRole("heading", { name: "Booking confirmed" })).toBeVisible();

  // The confirmation's per-component client prices are the contract: exact
  // formatted server integers (net × 22%, spec 009 FR-007).
  const confirmedPrices = await confirmation.locator(".tf-price").allTextContents();
  expect(confirmedPrices.length).toBeGreaterThan(0);

  // Share the now-booked trip and open it as the traveler.
  const shareControl = page.getByTestId("share-control");
  await shareControl.getByRole("button", { name: "Share with client" }).click();
  const urlText = shareControl.getByTestId("share-url");
  await expect(urlText).toBeVisible({ timeout: 15_000 });
  const sharedUrl = (await urlText.textContent())?.trim() ?? "";

  const { context, page: traveler } = await openAnonymously(browser, sharedUrl);
  try {
    await expect(traveler.getByText(/Trip total/i)).toBeVisible();
    // spec 013 SC-001, UI-to-UI and planner-agnostic: every booked client
    // price the AGENT saw on the confirmation appears verbatim for the
    // TRAVELER — the page can no longer show the net-rate draft placeholder.
    for (const price of confirmedPrices) {
      await expect(traveler.getByText(price.trim()).first()).toBeVisible();
    }
    // Booked items are marked, and none of them reads as an estimate (FR-004).
    expect(await traveler.locator(".tf-client-booked").count()).toBeGreaterThan(0);
    expect(await traveler.locator("li:has(.tf-client-booked) .tf-price-note").count()).toBe(0);
  } finally {
    await context.close();
  }
});

test("an unknown token renders the neutral unavailable state (FR-003)", async ({ page }) => {
  await page.goto("/view/00000000-0000-4000-8000-000000000000");
  await expect(page.getByRole("heading", { name: /Your trip/i })).toBeVisible();
  await expect(page.getByText(/isn't available/i)).toBeVisible();
  // Neutral and white-label even when unavailable (INV-020).
  await expect(page.getByText(/TripForge/i)).toHaveCount(0);
  await expect(page).not.toHaveTitle(/TripForge|Trellis/i);
});
