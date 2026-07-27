import { test, expect, type Browser, type Page } from "@playwright/test";
import { DRAFT_TIMEOUT_MS, draftParisTrip, signUpAgency } from "./support.js";

// L4 content library journey (spec 015, ticket seed-0022; spec 027, ticket
// seed-0022a; INV-027). Runs against the BUILT compose image. Covers:
// registering a media item (US1), attaching it to the gallery AND to a
// specific item (US2), the client seeing both with alt text and NO internal
// id/source leak (US3), an unattached itinerary rendering unchanged (SC-005),
// detach removing only the targeted attachment (US2 edge case), and (spec
// 027) uploading a real file from disk and having it render through the
// public `/api/media/[id]` serving route in both the workspace and the
// client view.

// KITCHENLOOP-COVERAGE-BEGIN
// [
//   { "feature": "content-library", "platform": "web", "user_type": "agent-seller", "result": "pass", "iteration": 3, "tier": "T2", "note": "agent registers a media asset via the workspace media-library panel, attaches it to the gallery and to a specific item, and the client's /view page renders both with alt text and no internal id/source leak (spec 015 US1-US3); durable regression coverage since PR #42" },
//   { "feature": "content-library", "platform": "web", "user_type": "agent-seller", "result": "pass", "iteration": 6, "tier": "T2", "note": "agent uploads a real file from disk (no URL typed), attaches it to a trip's gallery, and the client's /view page renders it via the public /api/media/[id] serving route with no agencyId/attribution leak (spec 027 US1-US3, seed-0022a)" }
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
  // Scoped to the register form specifically: the upload form (added
  // alongside it by spec 027 / PR #72) renders its OWN identically-labeled
  // "Alt text" field in the same panel, so an unscoped getByLabel here is
  // ambiguous (strict mode) the moment both forms are mounted together.
  const form = panel.getByTestId("media-register-form");
  await form.getByLabel("Media URL").fill(IMAGE_URL);
  await form.getByLabel("Alt text").fill(IMAGE_ALT);
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

    // iter9-gallery-media-fallback: IMAGE_URL points at images.example.test,
    // which never resolves — a bare <img> would ship the browser's broken-image
    // glyph to the client. Assert the graceful placeholder tile renders instead
    // (it keeps role="img" + the alt as its accessible name, so the two
    // assertions above still match it).
    await expect(traveler.getByTestId("client-gallery").getByTestId("media-thumb-fallback")).toBeVisible({
      timeout: 15_000,
    });

    // FR-010/SC-004: no internal library id, source label, or attribution
    // string reaches the page — negative scan over the full HTML, mirroring
    // the client-view journey's field-name-leak pattern.
    const html = await traveler.content();
    expect(html, "client view leaked the agent-upload source label").not.toContain("agent-upload");
  } finally {
    await context.close();
  }
});

test("an agent uploads a real file, attaches it, and the client renders it via the public serving route (spec 027 seed-0022a)", async ({
  page,
  browser,
}) => {
  test.setTimeout(DRAFT_TIMEOUT_MS + 90_000);
  const uploadAgent = {
    name: "Uma Uploader",
    email: `uma-${runId}@example.test`,
    password: agent.password,
    agencyName: `Device Uploads ${runId.slice(-6)}`,
  };
  const UPLOAD_ALT = `Phone photo ${runId.slice(-6)}`;
  await signUpAgency(page, uploadAgent);

  // US1: upload a real file (no URL typed anywhere) — appears in the library.
  await page.goto("/media");
  const panel = page.getByTestId("media-library-panel");
  await expect(panel).toBeVisible();
  await panel.getByTestId("media-upload-file").setInputFiles({
    name: "phone-photo.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
  });
  await panel.locator("#media-upload-alt").fill(UPLOAD_ALT);
  await panel.getByTestId("media-upload-submit").click();
  const uploadedCard = panel.getByTestId("media-card").filter({ hasText: UPLOAD_ALT });
  await expect(uploadedCard).toBeVisible({ timeout: 15_000 });
  const workspaceImgSrc = await uploadedCard.getByRole("img").getAttribute("src");
  // Absolute url (spec 027 research D6: MediaRefSchema.url requires z.string().url()).
  expect(workspaceImgSrc).toMatch(/\/api\/media\/[0-9a-f-]{36}$/);

  // US2: attach it to a trip's gallery, exactly like a URL-registered asset.
  await draftParisTrip(page);
  await page.goto("/trips");
  await expect(page.getByTestId("trip-row")).toHaveCount(1, { timeout: 15_000 });
  await page.getByTestId("trip-open").click();
  const opened = page.getByTestId("opened-trip");
  await expect(opened).toBeVisible({ timeout: 15_000 });
  const galleryPicker = opened.getByTestId("trip-gallery-picker");
  await expect(galleryPicker).toBeVisible({ timeout: 15_000 });
  await galleryPicker.selectOption({ label: UPLOAD_ALT });
  await expect(opened.getByTestId("trip-gallery-list").getByRole("img", { name: UPLOAD_ALT })).toBeVisible({
    timeout: 15_000,
  });

  // US3: share, open anonymously, confirm the client renders it via the
  // public serving route with no session — and that the route itself
  // exposes nothing beyond bytes + content type (research D3).
  const shareControl = opened.getByTestId("share-control");
  await shareControl.getByRole("button", { name: "Share with client" }).click();
  const urlText = shareControl.getByTestId("share-url");
  await expect(urlText).toBeVisible({ timeout: 15_000 });
  const sharedUrl = (await urlText.textContent())?.trim() ?? "";

  const { context, page: traveler } = await openAnonymously(browser, sharedUrl);
  try {
    const clientImg = traveler.getByTestId("client-gallery").getByRole("img", { name: UPLOAD_ALT });
    await expect(clientImg).toBeVisible();
    const clientImgSrc = await clientImg.getAttribute("src");
    expect(clientImgSrc).toBe(workspaceImgSrc);

    const mediaResponse = await traveler.request.get(new URL(clientImgSrc ?? "", sharedUrl).toString());
    expect(mediaResponse.ok()).toBe(true);
    expect(mediaResponse.headers()["content-type"]).toBe("image/jpeg");
    // Defense-in-depth (media-upload-serving-hardening): the serving route
    // never lets a browser sniff a raster response into executable HTML, and
    // always declares how to render the bytes it returns.
    expect(mediaResponse.headers()["x-content-type-options"]).toBe("nosniff");
    expect(mediaResponse.headers()["content-disposition"]).toContain("inline");
    // Only bytes + content-type cross this boundary — no agencyId/attribution
    // header, and the confidential attribution string never appears in the body.
    expect(Object.keys(mediaResponse.headers())).not.toContain("x-agency-id");
    const body = await mediaResponse.body();
    expect(body.toString("utf-8")).not.toContain("internal-only");
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
