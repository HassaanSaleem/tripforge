import { test, expect } from "@playwright/test";
import { signUpTraveler } from "./support.js";

// Traveler home journey (spec 033, ticket goal-traveler-account; INV-027). Runs
// against the BUILT compose image. A fresh visitor with NO share token: sees the
// brand-neutral anonymous welcome on /view, creates an account, lands on a real
// personalized HOME (not the old static placeholder), reaches My Trips, and signs
// out back to the anonymous welcome. Also pins the trust boundary on BOTH states
// (INV-020 no platform branding; INV-024 no workspace affordance) — the signed-in
// home is exercised here since smoke/trust-boundary only cover anonymous /view.

const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const traveler = {
  name: "Rania Haddad",
  email: `rania-${runId}@example.test`,
  password: "traveler-home-pass-9",
};

test("a traveler signs up with no share token, lands on a real home, reaches My Trips, and signs out (US1+US2+US3)", async ({
  page,
}) => {
  test.setTimeout(120_000);

  // Anonymous /view: brand-neutral welcome, no trip data, no workspace affordance.
  await page.goto("/view");
  await expect(page.getByRole("heading", { name: /Your trip/i })).toBeVisible();
  await expect(page.getByTestId("welcome-sign-in")).toBeVisible();
  await expect(page.getByTestId("welcome-sign-up")).toBeVisible();
  await expect(page.getByText(/TripForge/i)).toHaveCount(0);
  await expect(page.getByText(/Trellis/i)).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Agency workspace/i })).toHaveCount(0);

  // Create an account from the consumer surface with NO share token in the URL.
  await page.getByTestId("welcome-sign-up").click();
  await expect(page).toHaveURL(/\/view\/sign-up$/);
  // INV-024: no agency/organization step is reachable in the traveler sign-up.
  await expect(page.getByText(/agency|organization/i)).toHaveCount(0);
  await signUpTraveler(page, traveler, /\/view$/);

  // US1: the personalized home, NOT the old static placeholder.
  await expect(page.getByTestId("traveler-home-greeting")).toHaveText(`Welcome, ${traveler.name}`);
  await expect(page.getByText("This is the traveler-facing view")).toHaveCount(0);
  await expect(page.getByTestId("home-my-trips")).toBeVisible();
  // "Plan a trip" went LIVE in spec 038 — a real link to the consumer planner.
  await expect(page.getByTestId("home-plan")).toHaveAttribute("href", "/view/plan");
  await expect(page.getByTestId("home-plan")).not.toContainText(/Coming soon/i);
  // FR-003: Discover is still an honest coming-soon signpost, not a dead link.
  await expect(page.getByTestId("home-discover")).toContainText(/Coming soon/i);
  await expect(page.getByTestId("home-discover").locator("a")).toHaveCount(0);
  // INV-020/024 on the SIGNED-IN home too.
  await expect(page.getByText(/TripForge/i)).toHaveCount(0);
  await expect(page.getByText(/Trellis/i)).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Agency workspace/i })).toHaveCount(0);

  // US1 AS2: reach My Trips from the home.
  await page.getByTestId("home-my-trips").click();
  await expect(page).toHaveURL(/\/view\/my-trips$/);
  await expect(page.getByTestId("my-trips-empty")).toBeVisible();

  // US2: sign out from the home returns to the anonymous welcome (no stale greeting).
  await page.goto("/view");
  await expect(page.getByTestId("traveler-home-greeting")).toBeVisible();
  await page.getByTestId("home-sign-out").click();
  await expect(page.getByTestId("traveler-welcome")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("traveler-home-greeting")).toHaveCount(0);
});

// consumer-copy-honesty-interim (FRICTION-7): a hopeful /view/marketplace or
// /view/discover URL used to fall through to /view/[token] and render the
// dead-token message. As static segments they now show an honest coming-soon
// affordance pointing at My Trips — still brand-neutral (INV-020).
for (const route of ["/view/marketplace", "/view/discover"]) {
  test(`${route}: honest coming-soon affordance, not the dead-token message`, async ({ page }) => {
    await page.goto(route);
    await expect(page.getByTestId("discovery-coming")).toBeVisible();
    await expect(page.getByRole("link", { name: "Go to My Trips" })).toHaveAttribute("href", "/view/my-trips");
    await expect(page.getByText(/isn't available/i)).toHaveCount(0);
    // INV-020: no platform naming on the consumer surface.
    await expect(page.getByText(/TripForge/i)).toHaveCount(0);
    await expect(page.getByText(/Trellis/i)).toHaveCount(0);
  });
}
