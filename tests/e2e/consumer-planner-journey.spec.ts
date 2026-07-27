import { test, expect } from "@playwright/test";
import { signUpTraveler } from "./support.js";

// Consumer AI planner journey (spec 038, ticket goal-consumer-planner; INV-027).
// Runs against the BUILT compose image with the keyless FakeLLM (no API key). A
// fresh traveler with NO share token signs up, opens the now-live "Plan a trip",
// builds a live-priced budget-fit trip by chatting, picks an option, and hands it
// to an agent — the Principle-I funnel. Also pins INV-020 (sell prices only, no
// net/markup) on the traveler-facing compare.

const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const traveler = {
  name: "Marco Silva",
  email: `marco-${runId}@example.test`,
  password: "consumer-planner-pass-9",
};

async function sendChatTurn(page: import("@playwright/test").Page, text: string): Promise<void> {
  await page.getByTestId("consumer-chat-input").fill(text);
  await page.getByRole("button", { name: /^Send$/ }).click();
}

test("a traveler plans a budget-fit trip by chatting and requests an agent to arrange it (US1+US2+US3)", async ({
  page,
}) => {
  test.setTimeout(150_000);

  // Sign up on the consumer surface with NO share token → lands on /view.
  await page.goto("/view/sign-up");
  await signUpTraveler(page, traveler, /\/view$/);

  // US3: "Plan a trip" is a LIVE tile on the home (not coming-soon).
  const planTile = page.getByTestId("home-plan");
  await expect(planTile).toHaveAttribute("href", "/view/plan");
  await planTile.click();
  await expect(page).toHaveURL(/\/view\/plan$/);
  await expect(page.getByRole("heading", { name: /Plan a trip with our AI/i })).toBeVisible();

  // US1: build a trip by chatting across turns (destination first, budget later).
  await sendChatTurn(page, "Plan a trip to Lisbon");
  // Still missing a budget — no build CTA yet.
  await expect(page.getByTestId("consumer-build-cta")).toHaveCount(0);
  await sendChatTurn(page, "around EUR 2000 for 4 nights, 2 people");

  const buildCta = page.getByTestId("consumer-build-cta");
  await expect(buildCta).toBeVisible({ timeout: 30_000 });
  await buildCta.click();

  // Live-priced compare — at least one option with a total + per-category breakdown.
  const options = page.getByTestId("consumer-compare-option");
  await expect(options.first()).toBeVisible({ timeout: 90_000 });
  await expect(page.getByTestId("consumer-option-total").first()).toBeVisible();
  await expect(page.getByTestId("consumer-option-breakdown").first()).toBeVisible();
  // INV-020: no net-rate / markup wording ever reaches the traveler.
  await expect(page.getByText(/net rate|markup/i)).toHaveCount(0);

  // Pick the first option → plan detail + the fork.
  await page.getByTestId("consumer-choose-option").first().click();
  await expect(page.getByTestId("consumer-plan-detail")).toBeVisible();
  await expect(page.getByTestId("consumer-fork")).toBeVisible();

  // US2: "Book it myself" is an honest signpost (no booking fired).
  await page.getByTestId("consumer-fork-self-drive").click();
  await expect(page.getByTestId("consumer-self-drive-note")).toContainText(/agent has prepared|agent to arrange/i);

  // US2: request an agent to arrange & book the self-planned trip.
  await page.getByTestId("consumer-self-drive-to-handoff").click();
  const form = page.getByTestId("consumer-handoff-form");
  await expect(form).toBeVisible();
  // Name is pre-filled from the signed-in account.
  await expect(page.getByTestId("consumer-handoff-name")).toHaveValue(traveler.name);
  await page.getByTestId("consumer-handoff-submit").click();

  await expect(page.getByTestId("consumer-handoff-submitted")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("consumer-handoff-submitted")).toContainText(/agent will be in touch/i);

  // INV-020/INV-024 on the whole surface: brand-neutral, no workspace affordance.
  await expect(page.getByText(/TripForge|Trellis/i)).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Agency workspace/i })).toHaveCount(0);
});
