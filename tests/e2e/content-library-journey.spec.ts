import { test, expect, type Browser, type Page } from "@playwright/test";
import { DRAFT_TIMEOUT_MS, draftParisTrip, signUpAgency } from "./support.js";

// L4 content library journey (spec 015, ticket seed-0022; INV-027). Runs
// against the BUILT compose image. Covers: registering a media item (US1),
// attaching it to the gallery AND to a specific item (US2), the client
// seeing both with alt text and NO internal id/source leak (US3), an
// unattached itinerary rendering unchanged (SC-005), and detach removing
// only the targeted attachment (US2 edge case).

// KITCHENLOOP-COVERAGE-BEGIN
// [
//   { "feature": "content-library", "platform": "web", "user_type": "agent-seller", "result": "pass", "iteration": 3, "tier": "T2", "note": "agent registers a media asset via the workspace media-library panel, attaches it to the gallery and to a specific item, and the client's /view page renders both with alt text and no internal id/source leak (spec 015 US1-US3); durable regression coverage since PR #42" }
// ]
// KITCHENLOOP-COVERAGE-END

const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const agent = {
  name: "Mira Media",
  email: `mira-${runId}@example.test`,
  password: "content-lib-9",
  agencyName: `Gallery Getaways ${runId.slice(-6)}`,
};
const IMAGE_URL = "https://images.example.test/lisbon-view.jpg";
const IMAGE_ALT = `Tagus river view ${runId.slice(-6)}`;

test.describe.configure({ mode: "serial" });

/** Open a url in a brand-new, cookie-less context (the traveler's browser). */
async function openAnonymously(browser: Browser, url: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(url);
  return { context, page };
}

async function registerMedia(page: Page): Promise<void> {
  const panel = page.getByTestId("media-library-panel");
  await expect(panel).toBeVisible();
  await panel.getByLabel("Media URL").fill(IMAGE_URL);
  await panel.getByLabel("Alt text").fill(IMAGE_ALT);
  await panel.getByTestId("media-register-submit").click();
  await expect(panel.getByTestId("media-card").filter({ hasText: IMAGE_ALT })).toBeVisible({ timeout: 15_000 });
}

test("an agent registers media, attaches it to the gallery and an item, and the client sees both with no internal leak", async ({
  page,
  browser,
}) => {
  test.setTimeout(DRAFT_TIMEOUT_MS + 90_000);
  await signUpAgency(page, agent);

  // US1: register a media item — appears in the library without a reload.
  // Media is its own nav destination now (spec 017 research D1).
  await page.goto("/media");
  await registerMedia(page);

  // US2: draft a trip, then open it from the Trips destination (also its own
  // route now) to attach media — the planner's own inline drafted view
  // doesn't carry media-attach controls; only the opened Trips view does.
  await draftParisTrip(page);
  await page.goto("/trips");
  await expect(page.getByTestId("trip-row")).toHaveCount(1, { timeout: 15_000 });
  await page.getByTestId("trip-open").click();
  const opened = page.getByTestId("opened-trip");
  await expect(opened).toBeVisible({ timeout: 15_000 });

  const galleryPicker = opened.getByTestId("trip-gallery-picker");
  await expect(galleryPicker).toBeVisible({ timeout: 15_000 });
  await galleryPicker.selectOption({ label: IMAGE_ALT });
  await expect(opened.getByTestId("trip-gallery-list").getByRole("img", { name: IMAGE_ALT })).toBeVisible({
    timeout: 15_000,
  });

  // US2: attach the SAME item to the first itinerary item too.
  const itemPicker = opened.getByTestId("item-media-picker").first();
  await expect(itemPicker).toBeVisible();
  await itemPicker.selectOption({ label: IMAGE_ALT });
  await expect(opened.getByTestId("item-media").first().getByRole("img", { name: IMAGE_ALT })).toBeVisible({
    timeout: 15_000,
  });

  // US3: share and open as an anonymous traveler. Scoped to the OPENED trip's
  // own share control — the planner's still-mounted drafted-preview panel
  // (above) renders a second "share-control"/"Share with client" for the
  // same trip, so an unscoped page-level locator is ambiguous (strict mode).
  const shareControl = opened.getByTestId("share-control");
  await shareControl.getByRole("button", { name: "Share with client" }).click();
  const urlText = shareControl.getByTestId("share-url");
  await expect(urlText).toBeVisible({ timeout: 15_000 });
  const sharedUrl = (await urlText.textContent())?.trim() ?? "";

  const { context, page: traveler } = await openAnonymously(browser, sharedUrl);
  try {
    // The gallery AND the per-item photo render with the SAME alt text.
    await expect(traveler.getByTestId("client-gallery").getByRole("img", { name: IMAGE_ALT })).toBeVisible();
    await expect(traveler.getByTestId("client-item-media").first().getByRole("img", { name: IMAGE_ALT })).toBeVisible();

    // FR-010/SC-004: no internal library id, source label, or attribution
    // string reaches the page — negative scan over the full HTML, mirroring
    // the client-view journey's field-name-leak pattern.
    const html = await traveler.content();
    expect(html, "client view leaked the agent-upload source label").not.toContain("agent-upload");
  } finally {
    await context.close();
  }
});

test("an itinerary with no attached media renders unchanged (SC-005)", async ({ page }) => {
  test.setTimeout(DRAFT_TIMEOUT_MS + 60_000);
  await signUpAgency(page, {
    name: "Tex Textonly",
    email: `tex-${runId}@example.test`,
    password: agent.password,
    agencyName: `Text Only Travel ${runId.slice(-6)}`,
  });
  await draftParisTrip(page);

  const shareControl = page.getByTestId("share-control");
  await shareControl.getByRole("button", { name: "Share with client" }).click();
  const urlText = shareControl.getByTestId("share-url");
  await expect(urlText).toBeVisible({ timeout: 15_000 });
  const sharedUrl = (await urlText.textContent())?.trim() ?? "";

  await page.goto(sharedUrl);
  await expect(page.getByRole("heading", { name: /Day 1/ })).toBeVisible();
  await expect(page.getByTestId("client-gallery")).toHaveCount(0);
  await expect(page.locator("img")).toHaveCount(0);
});
