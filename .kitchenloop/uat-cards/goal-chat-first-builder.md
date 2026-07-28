# UAT Card — goal-chat-first-builder (spec 035): chat-first, multi-turn build-to-book

**Ticket**: goal-chat-first-builder
**Surface**: agent AI Builder (`/workspace`), keyless FakeLLM demo stack
**How to run**: drive a real browser (Playwright MCP) against the already-running
built stack at **http://localhost:3000**. Screenshot each step. Do NOT read the
source, the diff, or any other file — follow ONLY these steps and report what the
browser actually shows.

This stack runs keyless (deterministic FakeLLM), so the exact phrases below always
produce the exact results below.

---

## Setup — create a fresh agent account

1. Go to `http://localhost:3000/sign-up`.
2. Fill the form:
   - **Your name**: `Uma Uat`
   - **Email**: use a unique address, e.g. `uma-uat-<random4>@example.test` (pick any 4 random digits)
   - **Password**: `uat-chatfirst-9`
   - **Agency name**: `Uma UAT Travel`
3. Click **Create account & agency**.
   - **Expected**: you land on the dashboard (URL ends in `/dashboard`).

---

## Step 1 — the AI Builder opens with CHAT as the primary surface

4. Go to `http://localhost:3000/workspace`.
   - **Expected**: a chat card is shown with the heading **"Describe the trip you want"** and a text box (placeholder starts with `e.g. "around EUR 2000`).
   - **Expected**: there is NO **"Draft itinerary"** button visible on the page (the structured form is hidden — chat is primary). There IS a small link that reads **"Prefer a guided form?"**.

## Step 2 — turn 1: name only a destination → the assistant asks for the budget

5. In the chat text box type exactly: `Plan a trip to Lisbon`
6. Click the **Send** button (inside the chat card).
   - **Expected**: your message appears, then an assistant reply appears that mentions the word **"budget"** (it asks for your budget for the trip to Lisbon).
   - **Expected**: NO trip options / no "Compare your options" section appears yet, and NO "Build my trip" button appears yet (a destination alone is not enough).

## Step 3 — turn 2: add the budget → the conversation accumulates and offers to proceed

7. In the SAME chat text box type exactly: `around EUR 2000 for 4 nights`
8. Click **Send**.
   - **Expected**: an assistant confirmation appears that summarises the trip and includes the word **"Lisbon"** and ends with **"Ready to build it?"** (proving the destination from turn 1 was remembered and combined with the budget from turn 2).
   - **Expected**: a **"Build my trip"** button now appears.

## Step 4 — proceed into the SAME compare-then-choose pipeline

9. Click **Build my trip**.
   - **Expected**: after a short pause, a **"Compare your options"** section appears with 1–3 option cards, each with a **"Choose this option"** button. (This is the same comparison the structured form produces.)
10. Click **"Choose this option"** on the first card.
    - **Expected**: a drafted itinerary appears — a heading with the trip title (containing **"Lisbon"**), a **"Day 1"** section, priced item lines, and a **"Total"**.
    - **Expected**: booking controls appear on the drafted trip (a **"Markup %"** field and a **"Quote live prices"** button) — the chat-built trip is bookable exactly like a form-built one.

> You reached a complete, bookable draft using ONLY the chat — you never typed into the structured form.

## Step 5 — the structured form is still available behind the toggle

11. Open a fresh builder: go to `http://localhost:3000/workspace` again.
    - **Expected**: chat is primary again (chat box present, no "Draft itinerary" button), with a **"Prefer a guided form?"** link.
12. Click **"Prefer a guided form?"**.
    - **Expected**: the structured form appears — a **"Destination"** field and a **"Draft itinerary"** button are now visible, and the chat card is gone.
    - **Expected**: a link now reads **"Build by chatting instead"**; clicking it brings the chat card back and hides the form.

---

## Verdict

Report **PASS** only if every **Expected** above was observed in the browser.
Report **PRODUCT_FAIL** with the failing step number and a screenshot if any
Expected did not hold. Do not modify any file.

Record your verdict on the final line exactly as: `**Overall:** PASS` or
`**Overall:** PRODUCT_FAIL`.
