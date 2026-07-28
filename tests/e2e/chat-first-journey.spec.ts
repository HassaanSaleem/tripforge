import { test, expect, type Page } from "@playwright/test";
import { DRAFT_TIMEOUT_MS, signInAgency, signUpAgency } from "./support.js";

// L4 chat-first journey (spec 035, ticket goal-chat-first-builder; INV-027).
// Runs against the BUILT compose image (playwright.config baseURL) under EITHER
// planner — the deterministic FakeLLM (keyless stack) or the real Haiku tool
// loop — so every assertion is planner-agnostic: structure is pinned, never
// model-authored prose. Under the keyless FakeLLM the multi-turn transcript is
// deterministic (spec 035 SC-004), so the two-turn conversation below always
// resolves to a Lisbon trip.
//
// Journey: self-serve sign-up → the AI Builder opens with CHAT as the primary
// surface (the structured form is hidden behind a toggle) → the agent builds a
// trip across TWO chat turns (destination, then budget) → the assistant offers
// "Build my trip" → the SAME compare→choose pipeline drafts a real itinerary —
// all WITHOUT ever touching the form. A second test proves the form is still
// reachable via the toggle (FR-005).

// KITCHENLOOP-COVERAGE-BEGIN
// [
//   { "feature": "itinerary-builder", "platform": "web", "user_type": "agent-seller", "result": "pass", "iteration": 8, "tier": "T2", "note": "agent builds a trip across a multi-turn chat (destination in one turn, budget in another) on the now-PRIMARY chat surface, the assistant offers 'Build my trip', and the SAME compare→choose pipeline drafts it without touching the structured form; the form stays reachable behind a toggle (spec 035 US1/US2)" }
// ]
// KITCHENLOOP-COVERAGE-END

const DRAFT_MAX = DRAFT_TIMEOUT_MS;

const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const agentName = "Cyra Chat";
const agencyName = `Cyra Travel ${runId.slice(-6)}`;
const email = `cyra-${runId}@example.test`;
const password = "chat-first-9";

test.describe.configure({ mode: "serial" });

async function sendChatTurn(page: Page, text: string): Promise<void> {
  const chat = page.getByTestId("chat-entry");
  await chat.getByTestId("chat-entry-input").fill(text);
  await chat.getByRole("button", { name: "Send" }).click();
}

test("an agent builds a trip across a multi-turn chat and proceeds to booking, no form (US1)", async ({
  page,
}) => {
  test.setTimeout(DRAFT_MAX + 40_000);
  await signUpAgency(page, { name: agentName, email, password, agencyName });

  await page.goto("/workspace");
  // Chat is the PRIMARY surface (spec 035 FR-005): the chat entry is present and
  // the structured form is NOT rendered until the toggle is used.
  await expect(page.getByTestId("chat-entry")).toBeVisible();
  await expect(page.getByRole("button", { name: "Draft itinerary" })).toHaveCount(0);

  // Turn 1 — destination only: the assistant asks for the still-missing budget
  // and does NOT draft (FR-003). No compare view appears.
  await sendChatTurn(page, "Plan a trip to Lisbon");
  const assistantReply = page.locator('[data-testid="chat-entry-message"][data-role="assistant"]').first();
  await expect(assistantReply).toBeVisible({ timeout: DRAFT_MAX });
  await expect(assistantReply).toContainText(/budget/i);
  await expect(page.getByTestId("compare-options")).toHaveCount(0);

  // Turn 2 — budget + duration carried WITH turn 1's context: the conversation
  // accumulates and resolves, so the assistant OFFERS to proceed (FR-001/FR-002).
  await sendChatTurn(page, "around EUR 2000 for 4 nights");
  const buildCta = page.getByTestId("chat-build-cta");
  await expect(buildCta).toBeVisible({ timeout: DRAFT_MAX });
  // The confirmation summarises the resolved trip (planner-agnostic: the
  // destination the agent named).
  await expect(page.getByTestId("chat-entry-confirm")).toBeVisible();

  // Proceed → the SAME compare→choose pipeline the form uses (FR-004), never a
  // chat-specific path.
  await buildCta.click();
  await expect(page.getByTestId("compare-options")).toBeVisible({ timeout: DRAFT_MAX });
  await page.getByTestId("compare-option").first().getByRole("button", { name: "Choose this option" }).click();

  // A real, persisted itinerary — reached entirely by chat, form untouched.
  await expect(page.getByTestId("draft-result")).toBeVisible({ timeout: DRAFT_MAX });
  await expect(page.getByTestId("draft-result").getByRole("heading", { level: 2 })).toBeVisible();
  // The booking flow appears on the chat-built trip exactly as via the form.
  await expect(page.getByTestId("booking-flow")).toBeVisible();
});

test("the structured form stays available behind a toggle (US2)", async ({ page }) => {
  test.setTimeout(60_000);
  // A fresh idle builder (no ?destination=) — chat primary, form hidden.
  await signInAgency(page, { email, password });
  await page.goto("/workspace");

  await expect(page.getByTestId("chat-entry")).toBeVisible();
  await expect(page.getByRole("button", { name: "Draft itinerary" })).toHaveCount(0);

  // Toggle reveals the structured form (FR-005) …
  await page.getByTestId("entry-toggle-form").click();
  await expect(page.getByRole("button", { name: "Draft itinerary" })).toBeVisible();
  await expect(page.getByLabel("Destination")).toBeVisible();
  await expect(page.getByTestId("chat-entry")).toHaveCount(0);

  // … and toggles back to chat.
  await page.getByTestId("entry-toggle-chat").click();
  await expect(page.getByTestId("chat-entry")).toBeVisible();
  await expect(page.getByRole("button", { name: "Draft itinerary" })).toHaveCount(0);
});
