import { test, expect, type Browser, type Page } from "@playwright/test";
import { DRAFT_TIMEOUT_MS, draftParisTrip, signInTraveler, signUpAgency, signUpTraveler } from "./support.js";

// Traveler trip history journey (spec 031, ticket p2-consumer-trip-history;
// INV-027). Runs against the BUILT compose image. An agent shares two
// drafted trips; a signed-in traveler who opens only the FIRST trip sees
// exactly that trip (and no other) in "My Trips" (US1+US2), opening it lands
// on the same branded page (US1), and a signed-out visitor gets neither the
// "My Trips" link nor any access to /view/my-trips (US3).

const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const owner = {
  name: "Tariq Hadid",
  email: `tariq-${runId}@example.test`,
  password: "trip-history-pass-9",
  agencyName: `Highland Journeys ${runId.slice(-6)}`,
};
const traveler = {
  name: "Amina Yusuf",
  email: `amina-th-${runId}@example.test`,
  password: "trip-history-pass-9",
};

async function openAnonymously(browser: Browser, url: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(url);
  return { context, page };
}

async function shareCurrentTrip(page: Page): Promise<string> {
  const shareControl = page.getByTestId("share-control");
  await shareControl.getByRole("button", { name: "Share with client" }).click();
  const urlText = shareControl.getByTestId("share-url");
  await expect(urlText).toBeVisible({ timeout: 15_000 });
  return (await urlText.textContent())?.trim() ?? "";
}

test("a traveler's My Trips lists only the trips they've opened, opens the same branded page, and is unreachable while signed out (US1+US2+US3)", async ({
  page,
  browser,
}) => {
  // Two real drafts (each up to DRAFT_TIMEOUT_MS twice: compare-options +
  // draft-result) plus an agency sign-up and TWO traveler sign-ups/sign-in
  // (each with bounded rate-limit retries) and a dozen navigations — a
  // longer budget than the single-draft journeys (spec 030's own DRAFT_TIMEOUT_MS
  // * 2 + 180_000) need.
  test.setTimeout(DRAFT_TIMEOUT_MS * 4 + 240_000);

  let firstUrl = "";
  let firstToken = "";
  let secondUrl = "";
  let secondToken = "";

  await test.step("agent: sign up, draft + share two trips", async () => {
    await signUpAgency(page, owner);

    await draftParisTrip(page);
    firstUrl = await shareCurrentTrip(page);
    firstToken = firstUrl.split("/view/")[1];

    await draftParisTrip(page, "2026-09-06");
    secondUrl = await shareCurrentTrip(page);
    secondToken = secondUrl.split("/view/")[1];
  });

  const { context, page: travelerPage } = await openAnonymously(browser, firstUrl);
  try {
    await test.step("US3: signed out — no My Trips link, /view/my-trips redirects to sign-in", async () => {
      const fork = travelerPage.getByTestId("trip-fork");
      await expect(fork).toBeVisible();
      await expect(fork.getByTestId("my-trips-link")).toHaveCount(0);

      await travelerPage.goto("/view/my-trips");
      await expect(travelerPage).toHaveURL(/\/view\/sign-in$/);
    });

    await test.step("traveler signs up from the first trip", async () => {
      await travelerPage.goto(`/view/sign-up?token=${firstToken}`);
      await signUpTraveler(travelerPage, traveler, new RegExp(`/view/${firstToken}$`));
    });

    const fork = travelerPage.getByTestId("trip-fork");
    const myTripsLink = fork.getByTestId("my-trips-link");

    await test.step("US1+US2: My Trips lists exactly the ONE trip opened so far", async () => {
      await expect(myTripsLink).toBeVisible();
      await myTripsLink.click();
      await expect(travelerPage).toHaveURL(/\/view\/my-trips$/);
      const list = travelerPage.getByTestId("my-trips-list");
      await expect(list).toBeVisible();
      const rows = list.getByTestId("my-trips-row");
      await expect(rows).toHaveCount(1);

      // US1: selecting the listed trip opens the SAME branded page.
      await rows.first().click();
      await expect(travelerPage).toHaveURL(new RegExp(`/view/${firstToken}$`));
      await expect(travelerPage.getByTestId("trip-fork")).toBeVisible();
    });

    await test.step("US2: opening the second trip adds it, first trip not duplicated", async () => {
      await travelerPage.goto(firstUrl);
      await travelerPage.goto(secondUrl);
      await travelerPage.goto("/view/my-trips");
      await expect(travelerPage.getByTestId("my-trips-row")).toHaveCount(2);
    });

    await test.step("history persists across sign-out/sign-in (spec.md edge case)", async () => {
      await travelerPage.goto(firstUrl);
      const accountStrip = travelerPage.getByTestId("trip-fork-account-strip");
      await accountStrip.getByTestId("account-sign-out").click();
      // Sign-out is async (Better Auth call + router.refresh) — WAIT for the
      // account strip to actually flip to its signed-out state before navigating,
      // or the /view/sign-in visit races an as-yet-valid session cookie and the
      // page's "already signed in → return to trip" redirect (resolve-client-auth-
      // return-to.ts) bounces us straight back to /view/<token>, leaving no email
      // field for signInTraveler to fill. Keying on the signed-out affordance makes
      // the sign-out deterministically complete first (no arbitrary sleep).
      await expect(accountStrip.getByTestId("account-sign-in-link")).toBeVisible();
      await travelerPage.goto(`/view/sign-in?token=${firstToken}`);
      await signInTraveler(travelerPage, traveler, new RegExp(`/view/${firstToken}$`));
      await travelerPage.goto("/view/my-trips");
      await expect(travelerPage.getByTestId("my-trips-row")).toHaveCount(2);
    });
  } finally {
    await context.close();
  }

  await test.step("cross-traveler isolation: a different traveler's My Trips shows only their own trip", async () => {
    const other = {
      name: "Jonas Berg",
      email: `jonas-th-${runId}@example.test`,
      password: "trip-history-pass-9",
    };
    const { context: otherContext, page: otherPage } = await openAnonymously(browser, secondUrl);
    try {
      await otherPage.goto(`/view/sign-up?token=${secondToken}`);
      await signUpTraveler(otherPage, other, new RegExp(`/view/${secondToken}$`));
      await otherPage.goto("/view/my-trips");
      const otherRows = otherPage.getByTestId("my-trips-row");
      await expect(otherRows).toHaveCount(1);
    } finally {
      await otherContext.close();
    }
  });
});
