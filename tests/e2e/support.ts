import { expect, type Page } from "@playwright/test";

export interface AgencySignUp {
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
 * boundedly. No assertion is weakened: the journey MUST still land in the
 * workspace, and any non-rate-limit failure still fails immediately below.
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
      page.waitForURL(/\/workspace$/, { timeout: 15_000 }).then(() => "ok" as const),
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

  await expect(page).toHaveURL(/\/workspace$/);
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
      page.waitForURL(/\/workspace$/, { timeout: 15_000 }).then(() => "ok" as const),
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

  await expect(page).toHaveURL(/\/workspace$/);
}
