import { test, expect, type Page } from "@playwright/test";
import { signInAgency, signUpAgency } from "./support.js";

// L4 planner journey (spec 008, ticket seed-0009a; INV-027). Runs against the
// BUILT compose image (playwright.config baseURL) under EITHER planner — the
// deterministic fake (INV-019, keyless stack) or the real Haiku tool loop
// (INV-013, when the stack env carries ANTHROPIC_API_KEY) — mirroring the L3
// smoke's dual-planner contract. The real planner answers in ~10-20s and its
// titles/day-splits vary run to run, so every assertion here is
// planner-agnostic: structure and exact money FORMATTING are pinned, never
// model-authored text. The exact per-failure message mapping is pinned by the
// planner-form L1 unit tests.
//
// Serial journey: self-serve sign-up → the workspace shows the planner form →
// draft a trip and see the rendered canonical itinerary + budget fit (US1) →
// a hopeless budget maps to ONE human-readable message with the form retained
// (US2) → a signed-out visitor keeps the membership prompt and never sees the
// planner (US3/FR-008). Existing negatives in smoke/trust-boundary/sign-in
// specs are NOT touched.
//
// US1 uses the same trip the L3 smoke proves live (Paris, hardCap 1000 USD) so
// e2e never depends on untested fixture economics.

// Draft round-trips are LLM-bound on keyed stacks (~10-20s observed live).
const DRAFT_TIMEOUT_MS = 90_000;

const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const agentName = "Pia Planner";
const agencyName = `Pia Travel ${runId.slice(-6)}`;
const email = `pia-${runId}@example.test`;
const password = "planner-pass-9";

test.describe.configure({ mode: "serial" });

async function signIn(page: Page): Promise<void> {
  // Rate-limit-aware shared helper (support.ts) — same landing assertion.
  await signInAgency(page, { email, password });
}

async function fillTripForm(page: Page): Promise<void> {
  await page.getByLabel("Destination").fill("Paris");
  await page.getByLabel("Check-in").fill("2026-09-01");
  await page.getByLabel("Check-out").fill("2026-09-04");
  await page.getByLabel("Adults").fill("2");
  await page.getByLabel("Children").fill("0");
  // Trip style / Budget mode are SegmentedControls (radiogroups of buttons),
  // not <select> elements (spec 018 research.md Decision 1 — accessible
  // "choose exactly one").
  await page.getByRole("radiogroup", { name: "Trip style" }).getByRole("radio", { name: "Balanced" }).click();
  await page.getByLabel("Budget", { exact: true }).fill("1000");
  await page.getByRole("radiogroup", { name: "Budget mode" }).getByRole("radio", { name: "Hard cap" }).click();
  await page.getByLabel("Currency").fill("USD");
}

test("an agent drafts a trip and sees the rendered itinerary + budget fit (US1)", async ({
  page,
}) => {
  test.setTimeout(DRAFT_TIMEOUT_MS + 30_000);
  // Fresh self-serve agent (same journey sign-in.spec.ts pins), via the
  // rate-limit-aware shared helper (support.ts) — same landing assertion.
  await signUpAgency(page, { name: agentName, email, password, agencyName });

  // The planner form is its own nav destination now (spec 017 research D1) —
  // sign-up lands on the dashboard, so navigate to the AI Builder explicitly.
  await page.goto("/workspace");
  // Chat is the primary build path (spec 035); this journey drives the
  // structured form, which is behind the "Prefer a guided form?" toggle.
  await page.getByTestId("entry-toggle-form").click();
  await expect(page.getByRole("button", { name: "Draft itinerary" })).toBeVisible();

  await fillTripForm(page);

  // Shape the network so the pending state is observable (FR-003): hold the
  // draft call briefly — no response or assertion is altered.
  await page.route("**/api/trpc/workspace.itinerary.draft*", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 700));
    await route.continue();
  });
  // The draft request now streams (spec 016, INV-028) — assert the wire
  // format directly (content-type) rather than racing the UI on which
  // progress label happens to be visible when the FakeLLM path resolves
  // its five progress events near-instantly once the connection opens.
  const draftResponse = page.waitForResponse((res) => res.url().includes("/api/trpc/workspace.itinerary.draft"));
  await page.getByRole("button", { name: "Draft itinerary" }).click();
  await expect(page.getByRole("button", { name: "Drafting…" })).toBeDisabled();
  expect((await draftResponse).headers()["content-type"]).toContain("text/event-stream");

  // Draft now returns 1-3 unpersisted OPTIONS to compare (spec 019 US1) —
  // picking one is the only way an option becomes a real, saved trip (US2).
  // Mirrors support.ts draftParisTrip(), which every OTHER e2e spec already
  // uses; this spec keeps its own inline flow because drafting IS its subject.
  await expect(page.getByTestId("compare-options")).toBeVisible({ timeout: DRAFT_TIMEOUT_MS });
  await page.getByTestId("compare-option").first().getByRole("button", { name: "Choose this option" }).click();

  // Rendered canonical draft (FR-004): title, days, priced items. The title
  // and day-split are planner-authored (vary under the real model) — assert
  // the structure, not the prose.
  const result = page.getByTestId("draft-result");
  await expect(result).toBeVisible({ timeout: DRAFT_TIMEOUT_MS });
  await expect(result.getByRole("heading", { level: 2 })).toBeVisible();
  await expect(result.getByRole("heading", { name: /^Day 1/ })).toBeVisible();
  // Every kept item line shows an exact formatted minor-unit amount in the
  // trip currency (FR-009) — kind prefix, then title, then price.
  await expect(result.getByText(/: .+ — [\d,]+\.\d{2} USD/).first()).toBeVisible();
  await expect(result.getByText(/Total/)).toBeVisible();

  // Budget-fit summary (FR-005): per-category allocated/planned/state.
  const fit = page.getByTestId("budget-fit");
  await expect(fit).toBeVisible();
  await expect(fit.getByRole("row", { name: /accommodation/ })).toBeVisible();
  await expect(fit.getByText(/fits|underFilled|overTarget/).first()).toBeVisible();

  // Flights card (spec 026, ticket demo-10-flights-deeplink): 2-3 indicative
  // options render alongside the drafted result (US1) — display only, never
  // an in-platform booking (Constitution V / PRD §9.3).
  const flightsCard = page.getByTestId("flights-card");
  await expect(flightsCard).toBeVisible();
  const optionCount = await flightsCard.getByTestId("flights-options").locator("li").count();
  expect(optionCount === 2 || optionCount === 3).toBe(true);

  // The deep-link action hands off to an EXTERNAL tab, never an in-platform
  // booking (US2/FR-004/FR-006/FR-007) — the original drafted-result view is
  // untouched by the handoff.
  const deepLink = flightsCard.getByTestId("flights-deep-link");
  await expect(deepLink).toBeVisible();
  await expect(deepLink).toHaveAttribute("target", "_blank");
  const [popup] = await Promise.all([page.waitForEvent("popup"), deepLink.click()]);
  await popup.waitForLoadState("domcontentloaded").catch(() => undefined);
  expect(new URL(popup.url()).origin).not.toBe(new URL(page.url()).origin);
  await popup.close();
  await expect(result).toBeVisible();
});

test("a hopeless budget maps to one human-readable message and keeps the form (US2)", async ({
  page,
}) => {
  test.setTimeout(DRAFT_TIMEOUT_MS + 30_000);
  await signIn(page);
  await page.goto("/workspace");
  await page.getByTestId("entry-toggle-form").click();
  await fillTripForm(page);
  await page.getByLabel("Budget", { exact: true }).fill("1");
  await page.getByLabel("Currency").fill("EUR");
  await page.getByRole("button", { name: "Draft itinerary" }).click();

  // A typed planner_failed outcome rendered as an exact pure-helper string
  // (contract §2.3) — never a raw error payload. Under the deterministic fake
  // this is always the no_proposals mapping; the real model usually reaches
  // the same assemble-drop but may fail its own output contract instead, so
  // both planner_failed strings are accepted. The one-string-per-failure
  // mapping itself is pinned exactly by the planner-form L1 tests.
  await expect(
    page.getByText(
      /No bookable options fit this trip and budget\. Try adjusting the budget, dates, or destination\.|The planner could not produce a usable plan this time\. Please try again\./,
    ),
  ).toBeVisible({ timeout: DRAFT_TIMEOUT_MS });
  await expect(page.getByTestId("draft-result")).toHaveCount(0);
  // The form survives the failure (FR-006).
  await expect(page.getByLabel("Destination")).toHaveValue("Paris");
});

test("a signed-out visitor keeps the membership prompt and never sees the planner (US3)", async ({
  page,
}) => {
  await page.goto("/workspace");
  await expect(page.getByText(/agency membership/i)).toBeVisible();
  await expect(page.getByRole("link", { name: /sign in/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /create an account and agency/i })).toBeVisible();
  await expect(page.getByRole("button", { name: "Draft itinerary" })).toHaveCount(0);
  await expect(page.getByTestId("draft-result")).toHaveCount(0);
});
