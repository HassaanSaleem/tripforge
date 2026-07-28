import { test, expect } from "@playwright/test";

// Spec 032 — two-sided landing pages (global + /for-travelers + /for-agents).
// Live journey against the BUILT compose image (INV-027). Covers FR-001/002/
// 004/005/007/008/009/010/014 and SC-001..006. Presentation/routing only — no
// money path, no schema, no auth surface.

// Nav actions are scoped to the shared .home-nav so ambiguous labels (e.g. a
// footer "For travelers" link) never race the nav link (memory:
// e2e-nav-label-substring-collision).
const nav = (page: import("@playwright/test").Page) => page.locator(".home-nav");

test("global landing is a two-sided overview that forks to both stories (FR-001, smoke preserved)", async ({
  page,
}) => {
  await page.goto("/");
  // Smoke contract preserved: heading "TripForge" + an "Agency workspace" link.
  await expect(page.getByRole("heading", { name: "TripForge" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Agency workspace/i })).toBeVisible();
  // Both audiences forked from the shared nav.
  await expect(nav(page).getByRole("link", { name: "For travelers", exact: true })).toBeVisible();
  await expect(nav(page).getByRole("link", { name: "For agents", exact: true })).toBeVisible();
});

test("shared nav round-trips across all three pages with no dead ends (FR-009, SC-002)", async ({
  page,
}) => {
  await page.goto("/");
  await nav(page).getByRole("link", { name: "For travelers", exact: true }).click();
  await expect(page).toHaveURL(/\/for-travelers$/);

  await nav(page).getByRole("link", { name: "For agents", exact: true }).click();
  await expect(page).toHaveURL(/\/for-agents$/);

  await nav(page).getByRole("link", { name: "TripForge home" }).click();
  await expect(page).toHaveURL(/\/$|\/$/);
  await expect(page.getByRole("heading", { name: "TripForge" })).toBeVisible();

  // Both sign-in entry points reachable from the nav on the home page.
  await expect(nav(page).getByRole("link", { name: "Traveler sign in", exact: true })).toHaveAttribute(
    "href",
    "/view/sign-in",
  );
  await expect(nav(page).getByRole("link", { name: "Agent sign in", exact: true })).toHaveAttribute(
    "href",
    "/sign-in",
  );
});

test("travelers page: non-autoplay demo video with poster + real source, CTA to sign-in (FR-004/005)", async ({
  page,
}) => {
  await page.goto("/for-travelers");
  const video = page.locator("video.lp-video-el");
  await expect(video).toBeVisible();
  // Poster is a staged real still; the source is the staged real demo (FR-012).
  await expect(video).toHaveAttribute("poster", /\/shots\/clients\/.+\.png$/);
  await expect(page.locator('video.lp-video-el source[src="/demos/tripforge-clients.mp4"]')).toHaveCount(1);
  // Never autoplay-with-sound: neither the autoplay nor a muted-autoplay config.
  const cfg = await video.evaluate((el) => {
    const v = el as HTMLVideoElement;
    return { autoplay: v.autoplay, muted: v.muted, preload: v.preload, controls: v.controls };
  });
  expect(cfg.autoplay).toBe(false);
  expect(cfg.muted).toBe(false);
  expect(cfg.controls).toBe(true);
  expect(cfg.preload).toBe("metadata");
  // Primary CTA routes to traveler sign-in. Name is a substring match: the
  // visible label carries a decorative "→" (site convention), so an exact match
  // would miss it; this still pins the human label AND the href.
  await expect(
    page.getByRole("link", { name: "Sign in to see your trips" }).first(),
  ).toHaveAttribute("href", "/view/sign-in");
});

test("agents page: non-autoplay demo video with poster + real source, CTA to sign-up (FR-007/008)", async ({
  page,
}) => {
  await page.goto("/for-agents");
  const video = page.locator("video.lp-video-el");
  await expect(video).toBeVisible();
  await expect(video).toHaveAttribute("poster", /\/shots\/agent\/.+\.png$/);
  await expect(page.locator('video.lp-video-el source[src="/demos/tripforge-agents.mp4"]')).toHaveCount(1);
  const cfg = await video.evaluate((el) => {
    const v = el as HTMLVideoElement;
    return { autoplay: v.autoplay, muted: v.muted, preload: v.preload, controls: v.controls };
  });
  expect(cfg.autoplay).toBe(false);
  expect(cfg.muted).toBe(false);
  expect(cfg.controls).toBe(true);
  expect(cfg.preload).toBe("metadata");
  // Primary CTA routes to agent sign-up (multiple such links exist — assert at
  // least one; substring name because the label carries a decorative "→").
  await expect(
    page.getByRole("link", { name: "Create an agency account" }).first(),
  ).toHaveAttribute("href", "/sign-up");
});

test("no horizontal scroll at a 375px mobile viewport on all three pages (FR-010, SC-004)", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 800 });
  for (const route of ["/", "/for-travelers", "/for-agents"]) {
    await page.goto(route);
    const overflow = await page.evaluate(() => {
      const el = document.documentElement;
      return el.scrollWidth - el.clientWidth;
    });
    // Allow a 1px rounding tolerance; anything more is a real horizontal scrollbar.
    expect(overflow, `horizontal overflow on ${route}`).toBeLessThanOrEqual(1);
  }
});
