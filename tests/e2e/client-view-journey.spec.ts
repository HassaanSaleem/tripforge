import { test, expect, type Page, type Browser } from "@playwright/test";
import { signUpAgency } from "./support.js";

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

const DRAFT_TIMEOUT_MS = 90_000;

const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const agentName = "Vera Viewer";
const agencyName = `Vista Voyages ${runId.slice(-6)}`;
const email = `vera-${runId}@example.test`;
const password = "client-view-9";

test.describe.configure({ mode: "serial" });

async function signUp(page: Page): Promise<void> {
  await signUpAgency(page, { name: agentName, email, password, agencyName });
}

async function draftTrip(page: Page): Promise<void> {
  // The same trip the L3 smoke proves live (Paris, hardCap 1000 USD) so e2e
  // never depends on untested fixture economics.
  await page.getByLabel("Destination").fill("Paris");
  await page.getByLabel("Check-in").fill("2026-09-01");
  await page.getByLabel("Check-out").fill("2026-09-04");
  await page.getByLabel("Adults").fill("2");
  await page.getByLabel("Children").fill("0");
  await page.getByLabel("Trip style").selectOption("balanced");
  await page.getByLabel("Budget", { exact: true }).fill("1000");
  await page.getByLabel("Budget mode").selectOption("hardCap");
  await page.getByLabel("Currency").fill("USD");
  await page.getByRole("button", { name: "Draft itinerary" }).click();
  await expect(page.getByTestId("draft-result")).toBeVisible({ timeout: DRAFT_TIMEOUT_MS });
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
  await draftTrip(page);

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

test("an unknown token renders the neutral unavailable state (FR-003)", async ({ page }) => {
  await page.goto("/view/00000000-0000-4000-8000-000000000000");
  await expect(page.getByRole("heading", { name: /Your trip/i })).toBeVisible();
  await expect(page.getByText(/isn't available/i)).toBeVisible();
  // Neutral and white-label even when unavailable (INV-020).
  await expect(page.getByText(/TripForge/i)).toHaveCount(0);
  await expect(page).not.toHaveTitle(/TripForge|Trellis/i);
});
