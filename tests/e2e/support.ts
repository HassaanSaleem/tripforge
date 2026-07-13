import { execSync } from "node:child_process";
import { expect, type Page } from "@playwright/test";

interface AgencySignUp {
  name: string;
  email: string;
  password: string;
  agencyName: string;
}

/**
 * Self-serve agent sign-up that respects the platform's REAL auth rate
 * limiting. Every spec worker shares the compose stack's single client IP, so
 * a fullyParallel suite can exceed Better Auth's per-endpoint budget and
 * receive the genuine "Too many requests" refusal (witnessed live, iteration-3
 * seed-0009c: two consecutive full-suite runs failed a different journey's
 * sign-up each time once the suite reached four parallel sign-up journeys).
 * A real user retries after the advertised backoff — so does this helper,
 * boundedly. No assertion is weakened: the journey MUST still land on the
 * dashboard (spec 017 — the new post-sign-in default), and any non-rate-limit
 * failure still fails immediately below.
 */
export async function signUpAgency(page: Page, input: AgencySignUp): Promise<void> {
  await page.goto("/sign-up");
  await page.getByLabel("Your name").fill(input.name);
  await page.getByLabel("Email").fill(input.email);
  await page.getByLabel("Password").fill(input.password);
  await page.getByLabel("Agency name").fill(input.agencyName);

  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await page.getByRole("button", { name: /Create account & agency/i }).click();
    const outcome = await Promise.race([
      page.waitForURL(/\/dashboard$/, { timeout: 15_000 }).then(() => "ok" as const),
      page
        .getByText(/Too many requests/i)
        .waitFor({ state: "visible", timeout: 15_000 })
        .then(() => "rate_limited" as const),
    ]).catch(() => "rate_limited" as const);
    if (outcome === "ok" || attempt === maxAttempts) break;
    // The refusal window is seconds long — wait it out, then submit the same
    // still-filled form again, exactly as the alert instructs a user to.
    await page.waitForTimeout(11_000);
  }

  await expect(page).toHaveURL(/\/dashboard$/);
}

/**
 * Sign-in with the same bounded rate-limit patience. The sign-in page maps
 * EVERY server failure — including the rate limiter's 429 — to its one
 * "Invalid email or password." alert (sign-in-form.tsx; misleading-message
 * finding ticketed separately), so the retry keys on that alert. This masks
 * nothing: genuinely wrong credentials fail every retry and the terminal
 * workspace-landing assertion below still fails the test, while the
 * wrong-password NEGATIVE in sign-in.spec.ts asserts the alert directly and
 * does not use this helper.
 */
export async function signInAgency(page: Page, input: { email: string; password: string }): Promise<void> {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(input.email);
  await page.getByLabel("Password").fill(input.password);

  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await page.getByRole("button", { name: /^Sign in$/i }).click();
    const outcome = await Promise.race([
      page.waitForURL(/\/dashboard$/, { timeout: 15_000 }).then(() => "ok" as const),
      // Exact mapped message, not getByRole("alert") — Next.js injects its own
      // empty role="alert" route announcer on every page (see sign-in.spec.ts).
      page
        .getByText("Invalid email or password.", { exact: true })
        .waitFor({ state: "visible", timeout: 15_000 })
        .then(() => "refused" as const),
    ]).catch(() => "refused" as const);
    if (outcome === "ok" || attempt === maxAttempts) break;
    await page.waitForTimeout(11_000);
  }

  await expect(page).toHaveURL(/\/dashboard$/);
}

/** How long a live draft may take end-to-end (real LLM; FakeLLM is instant). */
export const DRAFT_TIMEOUT_MS = 90_000;

/**
 * Draft the canonical Paris trip through the planner form — the same trip the
 * L3 smoke proves live (Paris, hardCap 1000 USD) so e2e never depends on
 * untested fixture economics. Shared test ARRANGEMENT for journeys whose
 * subject needs an itinerary to exist (booking, client-view, marketplace);
 * planner-journey.spec.ts keeps its own inline flow because drafting IS its
 * subject there. `checkOut` varies per journey (trip length is not what these
 * suites assert). Owns navigating to the AI Builder's own route (spec 017 —
 * the planner is no longer on the page callers land on after sign-in/-up),
 * so callers never need their own `page.goto("/workspace")` before this.
 */
export async function draftParisTrip(page: Page, checkOut = "2026-09-04"): Promise<void> {
  await page.goto("/workspace");
  await page.getByLabel("Destination").fill("Paris");
  await page.getByLabel("Check-in").fill("2026-09-01");
  await page.getByLabel("Check-out").fill(checkOut);
  await page.getByLabel("Adults").fill("2");
  await page.getByLabel("Children").fill("0");
  await page.getByLabel("Trip style").selectOption("balanced");
  await page.getByLabel("Budget", { exact: true }).fill("1000");
  await page.getByLabel("Budget mode").selectOption("hardCap");
  await page.getByLabel("Currency").fill("USD");
  await page.getByRole("button", { name: "Draft itinerary" }).click();
  await expect(page.getByTestId("draft-result")).toBeVisible({ timeout: DRAFT_TIMEOUT_MS });
}

/**
 * OPERATOR-SIDE test arrangement (spec 011 research D10): vetting is a
 * platform-operator action — the ONLY product writer of agency_vetting is
 * packages/db/scripts/vet-agency.mjs, and nothing in the UI may vet. The e2e
 * journeys therefore perform the operator's half directly against the compose
 * Postgres (the same insert-the-row arrangement the L3 suites use), keyed by
 * the unique agency name the test itself created. Idempotent; fails loudly if
 * the agency does not exist.
 */
export function vetAgencyByName(agencyName: string): void {
  const escaped = agencyName.replace(/'/g, "''");
  const sql =
    `INSERT INTO agency_vetting (agency_id, vetted_by) ` +
    `SELECT id, 'e2e-operator' FROM organization WHERE name = '${escaped}' ` +
    `ON CONFLICT (agency_id) DO NOTHING RETURNING agency_id`;
  const out = execSync(
    `docker compose exec -T postgres psql -U tripforge -d tripforge -tAc "${sql.replace(/"/g, '\\"')}"`,
    { encoding: "utf8" },
  );
  const check = execSync(
    `docker compose exec -T postgres psql -U tripforge -d tripforge -tAc "SELECT count(*) FROM agency_vetting v JOIN organization o ON o.id = v.agency_id WHERE o.name = '${escaped}'"`,
    { encoding: "utf8" },
  );
  if (check.trim() !== "1") {
    throw new Error(`vetAgencyByName: agency "${agencyName}" not vetted (insert output: ${out.trim()})`);
  }
}
