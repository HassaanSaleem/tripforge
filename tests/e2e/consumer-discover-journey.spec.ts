import { test, expect } from "@playwright/test";
import { signUpTraveler, signInTraveler } from "./support.js";

// Consumer "What's Hot" discovery feed journey (spec 039, ticket
// goal-consumer-whats-hot / GOAL.md D2.2; INV-027). Runs against the BUILT compose
// image with the keyless FakeLLM. Covers: a signed-in traveler opens the now-live
// Discover nav entry and sees a populated, image-forward feed per destination that
// replaces on switch (US1); every card's "Plan this" hands off into the CONSUMER
// planner (/view/plan) with the destination seeded into the chat, ready to Send
// (US2); the surface is brand-neutral (US3 / INV-020) and mounts no workspace
// affordance (INV-024); an anonymous visitor is redirected to sign-in (FR-002);
// and a broken image never hides a card's blurb/hotel/Plan-this (FR-010).

test.describe.configure({ mode: "serial" });

const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const traveler = {
  name: "Priya Traveler",
  email: `priya-${runId}@example.test`,
  password: "consumer-discover-pass-9",
};

test("a traveler browses What's Hot and 'Plan this' seeds the consumer planner (US1+US2+US3)", async ({ page }) => {
  test.setTimeout(150_000);

  // Sign up on the consumer surface with NO share token → lands on /view.
  await page.goto("/view/sign-up");
  await signUpTraveler(page, traveler, /\/view$/);

  // FR-008: Discover is a LIVE nav link (not a "Soon" signpost) on the traveler nav.
  const discoverNav = page.getByTestId("client-nav-discover");
  await expect(discoverNav).toHaveAttribute("href", "/view/discover");
  await discoverNav.click();
  await expect(page).toHaveURL(/\/view\/discover$/);
  // Marks itself active.
  await expect(page.getByTestId("client-nav-discover")).toHaveAttribute("aria-current", "page");

  // US1: a populated, image-forward feed for the default destination.
  const picker = page.getByTestId("discover-destination-picker");
  await expect(picker).toBeVisible();
  const grid = page.getByTestId("discover-feed-grid");
  const cards = grid.getByTestId("discover-feed-card");
  await expect(cards.first()).toBeVisible();
  expect(await cards.count()).toBeGreaterThanOrEqual(3);
  await expect(cards.first().getByTestId("discover-hotel-highlight")).toBeVisible();
  const firstTitle = await cards.first().locator("h3").textContent();

  // US1: switching destinations replaces the feed's contents (no stale carryover).
  const options = picker.getByTestId("discover-destination-option");
  const optionCount = await options.count();
  expect(optionCount).toBeGreaterThanOrEqual(2);
  for (let i = 0; i < optionCount; i++) {
    if ((await options.nth(i).getAttribute("aria-pressed")) !== "true") {
      await options.nth(i).click();
      break;
    }
  }
  await expect(cards.first()).toBeVisible();
  expect(await cards.first().locator("h3").textContent()).not.toBe(firstTitle);

  // US3 / INV-020: no platform wordmark on the consumer surface; INV-024: no
  // workspace affordance leaks in.
  await expect(page.getByText(/TripForge|Trellis/i)).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Agency workspace/i })).toHaveCount(0);

  // US2: "Plan this" hands off to the CONSUMER planner with the destination seeded.
  const planDestination = await cards.first().locator("h3").textContent(); // sanity: card renders text
  expect(planDestination?.trim().length ?? 0).toBeGreaterThan(0);
  await cards.first().getByTestId("discover-plan-this").click();
  await expect(page).toHaveURL(/\/view\/plan\?destination=/);
  await expect(page.getByRole("heading", { name: /Plan a trip with our AI/i })).toBeVisible();
  // The chat composer is pre-filled "Plan a trip to ${city}, ${country}" — the
  // traveler proceeds with one Send, no retyping (FR-006/FR-007, SC-003).
  await expect(page.getByTestId("consumer-chat-input")).toHaveValue(/^Plan a trip to [\w\s'-]+, [\w\s'-]+$/);

  // FR-007: the seed only pre-fills — it does NOT auto-submit (no chat message /
  // build spinner appears until the traveler acts).
  await expect(page.getByTestId("consumer-chat-message")).toHaveCount(0);

  // Proceed with one Send → the real budget-aware planner takes over (Constitution I
  // funnel is intact end-to-end).
  await page.getByRole("button", { name: /^Send$/ }).click();
  await expect(page.getByTestId("consumer-chat-message").first()).toBeVisible({ timeout: 30_000 });
});

test("an anonymous visitor to /view/discover is redirected to sign-in (FR-002)", async ({ page }) => {
  await page.goto("/view/discover");
  await expect(page).toHaveURL(/\/view\/sign-in/);
  // Never falls through to the anonymous dead-token catch-all or leaks the feed.
  await expect(page.getByTestId("discover-feed-grid")).toHaveCount(0);
});

test("a broken feed image still leaves the blurb, hotel highlight, and Plan this usable (FR-010)", async ({ page }) => {
  await page.goto("/view/sign-in");
  await signInTraveler(page, { email: traveler.email, password: traveler.password }, /\/view$/);

  // Force every image request to fail, isolating the shared card's fallback path.
  await page.route(/unsplash\.com/, (route) => route.abort());
  await page.goto("/view/discover");

  const firstCard = page.getByTestId("discover-feed-grid").getByTestId("discover-feed-card").first();
  await expect(firstCard.getByTestId("discover-card-image-fallback")).toBeVisible();
  await expect(firstCard.locator(".tf-discover-card-blurb")).toBeVisible();
  await expect(firstCard.getByTestId("discover-hotel-highlight")).toBeVisible();
  await expect(firstCard.getByTestId("discover-plan-this")).toBeVisible();
});
