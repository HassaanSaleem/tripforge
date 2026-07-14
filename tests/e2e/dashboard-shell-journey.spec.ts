import { test, expect } from "@playwright/test";
import { DRAFT_TIMEOUT_MS, draftParisTrip, signInAgency, signUpAgency, vetAgencyByName } from "./support.js";

// L4 dashboard app shell journey (spec 017, ticket demo-02-shell; INV-027).
// Runs against the BUILT compose image. Covers: sign-in lands on the
// dashboard (US1), a fresh agency sees a fully-rendered zero-state (US1
// SC-003), every sidebar destination is reachable with correct active
// marking (US2), the sidebar collapses on a narrow viewport (US2 FR-008),
// the Discover placeholder is honest, not broken (US2 FR-010), and — after
// real activity (draft → book → list → license) — the dashboard reflects it
// per-currency with two-tenant isolation (US1 FR-003, SC-002).

test.describe.configure({ mode: "serial" });

const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const seller = {
  name: "Deshi Dashboard",
  email: `deshi-${runId}@example.test`,
  password: "dashboard-pass-9",
  agencyName: `Delta Shell Co ${runId.slice(-6)}`,
};
const buyer = {
  name: "Shea Shellbuyer",
  email: `shea-${runId}@example.test`,
  password: "dashboard-pass-9",
  agencyName: `Shell Buyers Co ${runId.slice(-6)}`,
};
const listingTitle = `Paris shell-witness ${runId.slice(-6)}`;

test("a fresh agency lands on a fully-rendered zero-state dashboard (US1 SC-003)", async ({ page }) => {
  await signUpAgency(page, seller);
  await expect(page).toHaveURL(/\/dashboard$/);

  const stats = page.getByTestId("dashboard-stats");
  await expect(stats).toBeVisible();
  await expect(page.getByTestId("stat-gbv")).toContainText("—");
  await expect(page.getByTestId("stat-earnings")).toContainText("—");
  await expect(page.getByTestId("stat-trips")).toContainText("0");
  await expect(page.getByTestId("stat-listings")).toContainText("0");
  await expect(page.getByTestId("stat-licenses")).toContainText("0");
  await expect(page.getByTestId("activity-empty")).toBeVisible();
  await expect(page.getByTestId("quick-action-plan")).toBeVisible();
  await expect(page.getByTestId("quick-action-marketplace")).toBeVisible();
});

test("all eight sidebar destinations are reachable with correct active marking (US2; spec 021 added Group Travel, spec 022 added Trip Requests)", async ({ page }) => {
  await signInAgency(page, { email: seller.email, password: seller.password });
  const nav = page.getByRole("navigation", { name: "Main navigation" });

  const destinations: Array<[name: string, path: string]> = [
    ["Dashboard", "/dashboard"],
    ["AI Builder", "/workspace"],
    ["Trips", "/trips"],
    ["Marketplace", "/marketplace"],
    ["Group Travel", "/group-travel"],
    ["Media", "/media"],
    ["Trip Requests", "/trip-requests"],
    // Discover stays LAST — the assertion right after this loop checks the
    // page it lands on.
    ["Discover", "/discover"],
  ];

  for (const [name, path] of destinations) {
    await nav.getByRole("link", { name }).click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(nav.getByRole("link", { name })).toHaveAttribute("aria-current", "page");
    // Every other destination is present but NOT marked active.
    for (const [otherName] of destinations) {
      if (otherName === name) continue;
      await expect(nav.getByRole("link", { name: otherName })).not.toHaveAttribute("aria-current", "page");
    }
    // The top header (identity, role, sign-out) stays present on every destination.
    await expect(page.getByText(seller.name, { exact: true })).toBeVisible();
  }

  // Discover now shows the real "what's hot" feed (spec 023), not the
  // former placeholder — a destination is preselected and its feed populated.
  await expect(page.getByTestId("discover-destination-picker")).toBeVisible();
  await expect(page.getByTestId("discover-feed-grid").getByTestId("discover-feed-card").first()).toBeVisible();
});

test("the sidebar collapses on a narrow viewport and stays operable (US2 FR-008)", async ({ page }) => {
  await page.setViewportSize({ width: 420, height: 800 });
  await signInAgency(page, { email: seller.email, password: seller.password });

  const nav = page.getByRole("navigation", { name: "Main navigation" });
  const toggle = page.getByLabel("Toggle navigation");
  await expect(toggle).toBeVisible();
  // Collapsed by default — the nav's links are present in the DOM but not
  // within the visible viewport until the toggle opens it.
  await expect(nav).not.toBeInViewport();

  await toggle.click();
  await expect(nav).toBeInViewport();
  await nav.getByRole("link", { name: "Trips" }).click();
  await expect(page).toHaveURL(/\/trips$/);
});

test("live activity (draft, book, list, license) is reflected on the dashboard, two-tenant isolated (US1 FR-003, SC-002)", async ({
  page,
}) => {
  test.setTimeout(DRAFT_TIMEOUT_MS + 120_000);
  await signInAgency(page, { email: seller.email, password: seller.password });
  vetAgencyByName(seller.agencyName);

  await draftParisTrip(page, "2026-09-03");
  await page.getByRole("button", { name: "Quote live prices" }).click();
  await expect(page.getByTestId("quote-review")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Book selected items" }).click();
  await expect(page.getByTestId("booking-confirmation")).toBeVisible({ timeout: 15_000 });

  await page.goto("/marketplace");
  await page.getByLabel("Itinerary").selectOption({ index: 1 });
  await page.getByLabel("Listing title").fill(listingTitle);
  await page.getByLabel(/License fee/).fill("250");
  await page.getByLabel("License terms").fill("White-label permitted; keep attribution lineage.");
  await page.getByLabel("Revenue share %").fill("7.5");
  await page.getByRole("button", { name: /List it on the marketplace/i }).click();
  await expect(page.getByTestId("listing-created")).toBeVisible({ timeout: 15_000 });

  await page.goto("/dashboard");
  await expect(page.getByTestId("stat-trips")).toContainText("1");
  await expect(page.getByTestId("stat-listings")).toContainText("1");
  // GBV is now non-zero, in the trip's own currency — never a bare "—".
  await expect(page.getByTestId("stat-gbv")).toContainText(/[\d,]+\.\d{2} USD/);
  await expect(page.getByTestId("activity-list")).toBeVisible();
  await expect(page.getByTestId("activity-list").getByText(/Trip drafted/)).toBeVisible();
  await expect(page.getByTestId("activity-list").getByText(/Booking confirmed/)).toBeVisible();

  // A second agency licenses the listing — the seller earns; the buyer gets
  // a license, and NEITHER agency's dashboard shows the other's numbers.
  const buyerContext = await page.context().browser()?.newContext();
  if (!buyerContext) throw new Error("could not open a fresh browser context for the buyer");
  const buyerPage = await buyerContext.newPage();
  try {
    await signUpAgency(buyerPage, buyer);
    vetAgencyByName(buyer.agencyName);
    await buyerPage.goto("/marketplace");
    const card = buyerPage.getByTestId("listing-card").filter({ hasText: listingTitle });
    await expect(card).toHaveCount(1, { timeout: 15_000 });
    await card.getByRole("button", { name: /License this trip/i }).click();
    await expect(buyerPage.getByTestId("license-receipt")).toBeVisible({ timeout: 15_000 });

    await buyerPage.goto("/dashboard");
    await expect(buyerPage.getByTestId("stat-licenses")).toContainText("1");
    await expect(buyerPage.getByTestId("stat-trips")).toContainText("1"); // the white-label copy is the buyer's own itinerary row
    await expect(buyerPage.getByTestId("stat-listings")).toContainText("0"); // licensing isn't selling
    await expect(buyerPage.getByTestId("stat-earnings")).toContainText("—");
    await expect(buyerPage.getByTestId("stat-gbv")).toContainText("—"); // the buyer never booked anything
    // The buyer never booked — "Booking confirmed" never appears on their own
    // activity (the white-label copy itself IS legitimately theirs, so it
    // correctly shows as their own "Trip drafted"/"Listing licensed" rows;
    // what must never cross tenants is the seller's money/booking activity).
    await expect(buyerPage.getByTestId("activity-list").getByText(/Booking confirmed/)).toHaveCount(0);

    await page.goto("/dashboard");
    await expect(page.getByTestId("stat-earnings")).toContainText(/[\d,]+\.\d{2} USD/);
    // The seller's dashboard never shows the buyer's license count.
    await expect(page.getByTestId("stat-licenses")).toContainText("0");
  } finally {
    await buyerContext.close();
  }
});
