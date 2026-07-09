import { test, expect } from "@playwright/test";
import { signInAgency, signUpAgency } from "./support.js";

// L4 session-establishment journey (spec 007, ticket seed-0008; INV-023/024,
// INV-027). Runs against the BUILT compose image (playwright.config baseURL).
//
// One serial journey: self-serve sign-up (US2) → named workspace greeting with
// NO raw IDs (US1/FR-006/IMP-2) → sign out (US3) → sign in again on a FRESH
// session (US1 — this leg proves the session-creation hook auto-activates the
// agency without any manual step, research D1) → wrong-password negative
// (FR-004). Existing negatives (anonymous workspace prompt, INV-020 client
// view) live in smoke.spec.ts / trust-boundary.spec.ts and are NOT weakened.

const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const agentName = "Ada Tour";
const agencyName = `Ada Tours ${runId.slice(-6)}`;
const email = `ada-${runId}@example.test`;
const password = "correct-horse-9";

test.describe.configure({ mode: "serial" });

test("self-serve sign-up creates account + agency and lands in the workspace (US2)", async ({
  page,
}) => {
  // Rate-limit-aware shared helper (support.ts) asserts the workspace landing.
  await signUpAgency(page, { name: agentName, email, password, agencyName });

  // Greeted by HUMAN names — user, agency, role (FR-006).
  await expect(page.getByText(agentName, { exact: true })).toBeVisible();
  await expect(page.getByText(agencyName, { exact: true })).toBeVisible();
  await expect(page.getByText(/role\s+owner/i)).toBeVisible();
  // IMP-2 negative: no raw internal IDs in the greeting (the pre-fix page
  // rendered code-formatted user/agency ids).
  await expect(page.locator("main code")).toHaveCount(0);
});

test("sign-out ends the session; sign-in re-establishes agent context on a fresh session (US3 → US1)", async ({
  page,
}) => {
  // Sign in (fresh browser context in this test — no cookies carried over):
  // the session-create hook must auto-activate the agency (research D1).
  // Rate-limit-aware shared helper (support.ts) — same landing assertion.
  await signInAgency(page, { email, password });
  await expect(page.getByText(agentName, { exact: true })).toBeVisible();
  await expect(page.getByText(agencyName, { exact: true })).toBeVisible();

  // Sign out (US3): back to /sign-in; the workspace reverts to the prompt.
  await page.getByRole("button", { name: /Sign out/i }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await page.goto("/workspace");
  await expect(page.getByText(/agency membership/i)).toBeVisible();
  await expect(page.getByText(agentName)).toHaveCount(0);
});

test("wrong password is refused with a human-readable error and no session (FR-004)", async ({
  page,
}) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("wrong-password-1");
  await page.getByRole("button", { name: /^Sign in$/i }).click();

  // Stays on the sign-in page with the single mapped message (research D8).
  // (getByText, not bare getByRole("alert") — Next.js injects its own empty
  // role="alert" route announcer, which strict mode would collide with.)
  await expect(page.getByText("Invalid email or password.", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/sign-in$/);

  // No session was established: the workspace still shows the prompt.
  await page.goto("/workspace");
  await expect(page.getByText(/agency membership/i)).toBeVisible();
});

test("an already-signed-in agent visiting /sign-in is sent to the workspace (D7 edge case)", async ({
  page,
}) => {
  await signInAgency(page, { email, password });

  await page.goto("/sign-in");
  await expect(page).toHaveURL(/\/workspace$/);
  await expect(page.getByText(agentName, { exact: true })).toBeVisible();
});
