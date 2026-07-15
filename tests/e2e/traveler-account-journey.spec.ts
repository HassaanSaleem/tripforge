import { test, expect, type Browser, type Page } from "@playwright/test";
import { DRAFT_TIMEOUT_MS, draftParisTrip, signInTraveler, signUpAgency, signUpTraveler } from "./support.js";

// Traveler client accounts journey (spec 030, ticket
// p2-consumer-accounts-identity; INV-027). Runs against the BUILT compose
// image. An agent shares two drafted trips; a fresh anonymous traveler
// creates an account from the client-view with NO agency step reachable
// anywhere in that flow (INV-024), sees the request-an-agent form pre-filled
// with their account's name/email (US1), edits the name and submits, signs
// out (form reverts to blank, US3), and signs back in on a DIFFERENT shared
// trip to see the same pre-fill (per-account, not per-trip, US1 AS3).

const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const owner = {
  name: "Sana Malik",
  email: `sana-${runId}@example.test`,
  password: "traveler-acct-pass-9",
  agencyName: `Coastal Escapes ${runId.slice(-6)}`,
};
const traveler = {
  name: "Amina Yusuf",
  email: `amina-${runId}@example.test`,
  password: "traveler-acct-pass-9",
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

test("a traveler can create an account with no agency step, see the request-agent form pre-filled, sign out, and see the same pre-fill on a different trip (US1+US2+US3)", async ({
  page,
  browser,
}) => {
  test.setTimeout(DRAFT_TIMEOUT_MS * 2 + 180_000);
  await signUpAgency(page, owner);

  await draftParisTrip(page);
  const firstUrl = await shareCurrentTrip(page);
  const firstToken = firstUrl.split("/view/")[1];

  await draftParisTrip(page, "2026-09-06");
  const secondUrl = await shareCurrentTrip(page);
  const secondToken = secondUrl.split("/view/")[1];

  const { context, page: travelerPage } = await openAnonymously(browser, firstUrl);
  try {
    // Anonymous first: the account strip offers sign-in, not a wall.
    const fork = travelerPage.getByTestId("trip-fork");
    await expect(fork).toBeVisible();
    await fork.getByTestId("account-sign-in-link").click();
    await expect(travelerPage).toHaveURL(new RegExp(`/view/sign-in\\?token=${firstToken}$`));

    // INV-024: the sign-up flow reachable from here offers NO agency/organization step.
    await travelerPage.getByRole("link", { name: /Create an account/i }).click();
    await expect(travelerPage).toHaveURL(new RegExp(`/view/sign-up\\?token=${firstToken}$`));
    await expect(travelerPage.getByLabel(/Agency/i)).toHaveCount(0);
    await expect(travelerPage.getByText(/agency|organization/i)).toHaveCount(0);

    await signUpTraveler(travelerPage, traveler, new RegExp(`/view/${firstToken}$`));

    // US1: signed in, the fork shows the account and the handoff form pre-fills.
    await expect(fork.getByText(`Signed in as ${traveler.name}`)).toBeVisible();
    await fork.getByTestId("fork-handoff").click();
    const form = travelerPage.getByTestId("trip-fork-handoff-inputs");
    await expect(form.getByLabel("Your name")).toHaveValue(traveler.name);
    await expect(form.getByLabel(/Email/)).toHaveValue(traveler.email);

    // Still editable: an edited value, not the account name, is what's submitted.
    await form.getByLabel("Your name").fill("Amina (on behalf of family)");
    await form.getByRole("button", { name: "Send request" }).click();
    await expect(travelerPage.getByTestId("trip-fork-handoff-submitted")).toBeVisible({ timeout: 15_000 });

    // US3: sign out reverts to the fully anonymous, blank-form experience.
    await travelerPage.goto(firstUrl);
    const strip = travelerPage.getByTestId("trip-fork-account-strip");
    await strip.getByTestId("account-sign-out").click();
    await expect(strip.getByTestId("account-sign-in-link")).toBeVisible({ timeout: 15_000 });
    await travelerPage.getByTestId("fork-handoff").click();
    await expect(travelerPage.getByTestId("trip-fork-handoff-inputs").getByLabel("Your name")).toHaveValue("");

    // Sign back in and open a DIFFERENT shared trip — same pre-fill (per-account, AS3).
    await travelerPage.goto(`/view/sign-in?token=${secondToken}`);
    await signInTraveler(travelerPage, traveler, new RegExp(`/view/${secondToken}$`));
    const secondFork = travelerPage.getByTestId("trip-fork");
    await expect(secondFork.getByText(`Signed in as ${traveler.name}`)).toBeVisible();
  } finally {
    await context.close();
  }
});
