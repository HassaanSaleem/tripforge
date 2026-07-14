import { test, expect, type Browser } from "@playwright/test";
import { DRAFT_TIMEOUT_MS, draftParisTrip, signUpAgency } from "./support.js";

// L4 request-agent fork journey (spec 022, ticket demo-09-request-agent;
// INV-027). Runs against the BUILT compose image. An agent shares a drafted
// trip; a fresh anonymous traveler opens it and sees the two-choice fork:
// "Book it myself" shows a confirmation stub with NO server call and NO
// persisted state (US3), while a SECOND anonymous open of the same link
// chooses "Have an agent arrange this for me," submits a name/notes, and
// creates a trip handoff request the owning agent sees in their "Trip
// Requests" inbox and can accept (US1+US2). A second, unrelated agency's
// inbox never shows it (INV-004).

const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const owner = {
  name: "Priya Patel",
  email: `priya-${runId}@example.test`,
  password: "trip-handoff-pass-9",
  agencyName: `Kaido Journeys ${runId.slice(-6)}`,
};
const other = {
  name: "Otto Nilsen",
  email: `otto-${runId}@example.test`,
  password: "trip-handoff-pass-9",
  agencyName: `Outsider Travel ${runId.slice(-6)}`,
};

/** Open a url in a brand-new, cookie-less context (the traveler's browser). */
async function openAnonymously(browser: Browser, url: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(url);
  return { context, page };
}

test("the request-agent fork: self-drive is a no-op stub, request-an-agent reaches the owning agent's inbox and is accepted, and a different agency never sees it (US1+US2+US3, INV-004)", async ({
  page,
  browser,
}) => {
  test.setTimeout(DRAFT_TIMEOUT_MS + 120_000);
  await signUpAgency(page, owner);
  await draftParisTrip(page);

  const shareControl = page.getByTestId("share-control");
  await shareControl.getByRole("button", { name: "Share with client" }).click();
  const urlText = shareControl.getByTestId("share-url");
  await expect(urlText).toBeVisible({ timeout: 15_000 });
  const sharedUrl = (await urlText.textContent())?.trim() ?? "";

  // US3: "Book it myself" is a confirmation-only stub — no persisted request.
  const selfDrive = await openAnonymously(browser, sharedUrl);
  try {
    const fork = selfDrive.page.getByTestId("trip-fork");
    await expect(fork).toBeVisible();
    await fork.getByTestId("fork-self-drive").click();
    await expect(selfDrive.page.getByTestId("trip-fork-self-drive")).toBeVisible();
    await expect(selfDrive.page.getByText(/booking this trip yourself/i)).toBeVisible();
  } finally {
    await selfDrive.context.close();
  }

  // US1: a FRESH anonymous open of the SAME link chooses request-an-agent.
  const handoff = await openAnonymously(browser, sharedUrl);
  try {
    const fork = handoff.page.getByTestId("trip-fork");
    await expect(fork).toBeVisible();
    await fork.getByTestId("fork-handoff").click();

    const form = handoff.page.getByTestId("trip-fork-handoff-inputs");
    await expect(form).toBeVisible();
    await form.getByLabel("Your name").fill("Jonas Berg");
    await form.getByLabel(/Notes/).fill("Would love help with transfers.");
    await form.getByRole("button", { name: "Send request" }).click();
    await expect(handoff.page.getByTestId("trip-fork-handoff-submitted")).toBeVisible({ timeout: 15_000 });
  } finally {
    await handoff.context.close();
  }

  // US2: the owning agent (still logged in on `page`) sees and accepts it.
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Trip Requests" }).click();
  await expect(page).toHaveURL(/\/trip-requests$/);
  const row = page.getByTestId("trip-handoff-row").filter({ hasText: "Jonas Berg" });
  await expect(row).toBeVisible({ timeout: 15_000 });
  await expect(row.getByText("New")).toBeVisible();
  await row.getByTestId("trip-handoff-accept").click();
  await expect(row.getByText("Accepted")).toBeVisible({ timeout: 15_000 });

  // INV-004: a different, unrelated agency never sees it.
  const otherContext = await browser.newContext();
  const otherPage = await otherContext.newPage();
  try {
    await signUpAgency(otherPage, other);
    await otherPage.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Trip Requests" }).click();
    await expect(otherPage).toHaveURL(/\/trip-requests$/);
    await expect(otherPage.getByTestId("trip-handoffs-empty")).toBeVisible();
    await expect(otherPage.getByText("Jonas Berg")).toHaveCount(0);
  } finally {
    await otherContext.close();
  }
});
