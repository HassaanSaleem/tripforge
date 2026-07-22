import { test, expect } from "@playwright/test";
import { signUpTraveler } from "./support.js";

// Consumer-surface navigation side panel (spec 037, ticket goal-client-side-panel;
// INV-027). Runs against the BUILT compose image. Two journeys:
//  (1) a SIGNED-IN traveler gets a persistent nav panel and can move between the
//      built sections (Home ⇄ My Trips) via it, sees the not-yet-built sections as
//      non-link "coming soon" signposts, and signs out from the panel;
//  (2) the ANONYMOUS surfaces (the tokenless /view welcome and a /view/[token]
//      proposal route) carry NO nav panel and NO platform branding — the panel is
//      the traveler's own-surface chrome only and must never leak onto the
//      brand-neutral share view (INV-020 / INV-018 / INV-024, FR-005/FR-006).

const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const traveler = {
  name: "Priya Anand",
  email: `priya-nav-${runId}@example.test`,
  password: "consumer-nav-pass-7",
};

test("a signed-in traveler navigates the consumer surface via the persistent panel (US1)", async ({
  page,
}) => {
  test.setTimeout(120_000);

  // Anonymous /view: welcome only, NO nav panel yet.
  await page.goto("/view");
  await expect(page.getByTestId("client-nav")).toHaveCount(0);
  await page.getByTestId("welcome-sign-up").click();
  await expect(page).toHaveURL(/\/view\/sign-up$/);
  await signUpTraveler(page, traveler, /\/view$/);

  // Signed-in home: the persistent nav panel is now present.
  const nav = page.getByRole("navigation", { name: "Traveler navigation" });
  await expect(nav).toBeVisible();
  await expect(page.getByTestId("client-nav")).toHaveCount(1);

  // Built sections are links; Home is the current section on /view.
  const homeLink = nav.getByRole("link", { name: "Home", exact: true });
  const myTripsLink = nav.getByRole("link", { name: "My Trips", exact: true });
  await expect(homeLink).toBeVisible();
  await expect(myTripsLink).toBeVisible();
  await expect(homeLink).toHaveAttribute("aria-current", "page");

  // FR-002/FR-003: exactly the two built destinations are links; the three
  // not-yet-built sections are non-link "coming soon" signposts (no dead ends).
  await expect(nav.getByRole("link")).toHaveCount(2);
  for (const soon of ["client-nav-plan", "client-nav-discover", "client-nav-groupTrips"]) {
    const item = page.getByTestId(soon);
    await expect(item).toBeVisible();
    await expect(item).toContainText(/Soon/i);
    await expect(item.locator("a")).toHaveCount(0);
  }

  // FR-004/FR-006: brand-neutral, no workspace affordance on the signed-in surface.
  await expect(page.getByText(/TripForge/i)).toHaveCount(0);
  await expect(page.getByText(/Trellis/i)).toHaveCount(0);
  await expect(page).not.toHaveTitle(/TripForge|Trellis/i);
  await expect(page.getByRole("link", { name: /Agency workspace/i })).toHaveCount(0);
  await expect(page.getByText(/agency membership/i)).toHaveCount(0);

  // Navigate to My Trips via the PANEL (not the home tile).
  await myTripsLink.click();
  await expect(page).toHaveURL(/\/view\/my-trips$/);
  const navOnMyTrips = page.getByRole("navigation", { name: "Traveler navigation" });
  await expect(navOnMyTrips).toBeVisible();
  await expect(navOnMyTrips.getByRole("link", { name: "My Trips", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page.getByTestId("my-trips-empty")).toBeVisible();

  // Navigate back Home via the panel.
  await navOnMyTrips.getByRole("link", { name: "Home", exact: true }).click();
  await expect(page).toHaveURL(/\/view$/);
  await expect(
    page.getByRole("navigation", { name: "Traveler navigation" }).getByRole("link", { name: "Home", exact: true }),
  ).toHaveAttribute("aria-current", "page");

  // Sign out from the panel's Account region → back to the anonymous welcome.
  await page.getByTestId("home-sign-out").click();
  await expect(page.getByTestId("traveler-welcome")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("client-nav")).toHaveCount(0);
});

test("the anonymous surfaces carry no nav panel and no platform branding (US2, INV-020/018)", async ({
  page,
}) => {
  // Tokenless /view welcome (signed out): brand-neutral, no panel.
  await page.goto("/view");
  await expect(page.getByRole("heading", { name: /Your trip/i })).toBeVisible();
  await expect(page.getByTestId("client-nav")).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Traveler navigation" })).toHaveCount(0);
  await expect(page.getByText(/TripForge/i)).toHaveCount(0);
  await expect(page.getByText(/Trellis/i)).toHaveCount(0);
  await expect(page).not.toHaveTitle(/TripForge|Trellis/i);

  // A /view/[token] proposal route (unknown token → the same brand-neutral
  // (client-view) group, untouched by this feature) must render NO consumer nav
  // panel: the panel never leaks onto the share view (FR-005).
  await page.goto("/view/00000000-0000-4000-8000-000000000000");
  await expect(page.getByTestId("client-nav")).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Traveler navigation" })).toHaveCount(0);
  await expect(page.getByText(/TripForge/i)).toHaveCount(0);
  await expect(page).not.toHaveTitle(/TripForge|Trellis/i);
});
