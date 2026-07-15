import { test, expect } from "@playwright/test";
import { signUpTraveler } from "./support.js";

// My Trips empty state (ticket my-trips-empty-state-nav). A separate spec
// file from traveler-trip-history-journey.spec.ts on purpose: that file's
// "history persists across sign-out/sign-in" step is a known DB-connection-
// pool hang (ticket e2e-traveler-trip-history-signout-hang, parked away from
// the loop) — this file never exercises that step, so it stays safe to run
// on its own with a normal bounded timeout.

const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const traveler = {
  name: "Fresh Traveler",
  email: `fresh-mt-${runId}@example.test`,
  password: "empty-trips-pass-9",
};

test("a signed-in traveler with no linked trips sees the My Trips empty state, not a blank list", async ({ page }) => {
  await page.goto("/view/sign-up");
  await signUpTraveler(page, traveler, /\/view$/);

  await page.goto("/view/my-trips");
  await expect(page).toHaveURL(/\/view\/my-trips$/);
  await expect(page.getByTestId("my-trips-empty")).toBeVisible();
  await expect(page.getByText(/No trips yet/i)).toBeVisible();
  await expect(page.getByTestId("my-trips-list")).toHaveCount(0);
});
