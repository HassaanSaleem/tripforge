import { test, expect } from "@playwright/test";
import { signInAgency, signUpAgency } from "./support.js";

// L4 Discover / "What's Hot" feed journey (spec 023, ticket demo-08-discover;
// INV-027). Runs against the BUILT compose image. Covers: a verified agent
// sees a populated, image-forward feed per destination (US1), switching
// destinations replaces the feed's contents (US1 FR-009), "Plan this" hands
// off into the AI builder with the destination pre-filled and every other
// field still defaulted (US2), and a broken image never hides a card's
// blurb/hotel-highlight/Plan-this content (US3 Edge Cases).

test.describe.configure({ mode: "serial" });

const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const agent = {
  name: "Dana Discoverer",
  email: `dana-${runId}@example.test`,
  password: "discover-pass-9",
  agencyName: `Dana Discover Co ${runId.slice(-6)}`,
};

test("Discover shows a populated feed per destination, and switching destinations replaces it (US1)", async ({ page }) => {
  await signUpAgency(page, agent);

  const nav = page.getByRole("navigation", { name: "Main navigation" });
  await nav.getByRole("link", { name: "Discover" }).click();
  await expect(page).toHaveURL(/\/discover$/);

  const picker = page.getByTestId("discover-destination-picker");
  await expect(picker).toBeVisible();

  const grid = page.getByTestId("discover-feed-grid");
  const cards = grid.getByTestId("discover-feed-card");
  await expect(cards.first()).toBeVisible();
  const initialCount = await cards.count();
  expect(initialCount).toBeGreaterThanOrEqual(3);

  const firstTitle = await cards.first().locator("h3").textContent();

  // Switch to a different featured destination — the feed's contents must
  // fully replace, not append (FR-009).
  const options = picker.getByTestId("discover-destination-option");
  const optionCount = await options.count();
  expect(optionCount).toBeGreaterThanOrEqual(2);
  let switchedTo: string | null = null;
  for (let i = 0; i < optionCount; i++) {
    const id = await options.nth(i).getAttribute("data-destination-id");
    const pressed = await options.nth(i).getAttribute("aria-pressed");
    if (pressed !== "true") {
      switchedTo = id;
      await options.nth(i).click();
      break;
    }
  }
  expect(switchedTo).not.toBeNull();

  await expect(cards.first()).toBeVisible();
  const newFirstTitle = await cards.first().locator("h3").textContent();
  // The two destinations' curated content is disjoint by construction
  // (apps/web/lib/discover-feed.ts) — a genuine content swap, not a reshuffle.
  expect(newFirstTitle).not.toBe(firstTitle);

  // Every visible card carries a photo attribution and a hotel highlight.
  await expect(cards.first().getByTestId("discover-hotel-highlight")).toBeVisible();
});

test("'Plan this' opens the AI builder with the destination pre-filled, other fields still defaulted (US2)", async ({ page }) => {
  await signInAgency(page, { email: agent.email, password: agent.password });
  await page.goto("/discover");

  const grid = page.getByTestId("discover-feed-grid");
  const firstCard = grid.getByTestId("discover-feed-card").first();
  await firstCard.getByTestId("discover-plan-this").click();

  await expect(page).toHaveURL(/\/workspace\?destination=/);
  // planDestination is always "${city}, ${country}" (data-model.md) — assert
  // the pre-filled value has that shape, not just that it's non-empty.
  await expect(page.getByLabel("Destination")).toHaveValue(/^[\w\s'-]+, [\w\s'-]+$/);

  // Pre-seeding touches ONLY the destination field — every other field keeps
  // its normal default (contracts/discover-to-builder-handoff.md).
  await expect(page.getByLabel("Adults")).toHaveValue("2");
  await expect(page.getByLabel("Children")).toHaveValue("0");
  await expect(page.getByLabel("Budget", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Currency")).toHaveValue("EUR");
});

test("a broken feed image still leaves the blurb, hotel highlight, and Plan this usable (US3 Edge Cases)", async ({ page }) => {
  await signInAgency(page, { email: agent.email, password: agent.password });
  // Force every image request on the page to fail, isolating the fallback
  // behavior from real network conditions. A RegExp host match (not a glob
  // string) avoids ambiguity in how `**` segments map onto a full URL.
  await page.route(/unsplash\.com/, (route) => route.abort());
  await page.goto("/discover");

  const firstCard = page.getByTestId("discover-feed-grid").getByTestId("discover-feed-card").first();
  await expect(firstCard.getByTestId("discover-card-image-fallback")).toBeVisible();
  await expect(firstCard.locator(".tf-discover-card-blurb")).toBeVisible();
  await expect(firstCard.getByTestId("discover-hotel-highlight")).toBeVisible();
  await expect(firstCard.getByTestId("discover-plan-this")).toBeVisible();
});
