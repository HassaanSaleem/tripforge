# UAT Card — Consumer-surface copy honesty (batch-consumer-friction-coverage)

**Tickets:** consumer-copy-honesty-interim (primary, browser-verifiable)
**Surface:** the consumer/traveler surface of the live compose stack
**How to run:** drive a real browser (Playwright MCP) against the running stack
at `http://localhost:3000`. Every step is navigation-only — no sign-up, no data
setup, no tokens to transcribe. Read the visible page text and check each
expected string exactly. Screenshot each step.

The product claim under test: **the consumer surface never advertises a
capability that isn't built, and never dead-ends a traveler.** Before this change
it (a) told travelers to "plan a trip" and "book it yourself through the
platform" (neither built), (b) sent hopeful discovery URLs to a dead "trip link
isn't available" message, and (c) pointed travelers on /discover only at
"create an account and agency" (become an agent).

---

## Step 1 — /for-travelers no longer promises unbuilt AI planning
1. Navigate to `http://localhost:3000/for-travelers`.
2. **Expected — PASS if ALL true:**
   - The primary call-to-action button/link in the hero reads exactly
     **`Sign in to see your trips`** (with a trailing arrow). It links to
     `/view/sign-in`.
   - The intro paragraph contains the exact sentence
     **`Planning your own trip with AI is coming to your traveler account.`**
   - The text **`Sign in to plan a trip`** appears **nowhere** on the page.
   - The text **`book it through the platform`** appears **nowhere** on the page.
3. **FAIL** if the CTA still says "Sign in to plan a trip", or the page claims
   the traveler can plan with AI / self-checkout now without a "coming" caveat.

## Step 2 — /view/marketplace shows an honest coming-soon affordance
1. Navigate to `http://localhost:3000/view/marketplace`.
2. **Expected — PASS if ALL true:**
   - The page heading reads **`Browse trips`** with a **`Coming soon`** eyebrow.
   - There is a link **`Go to My Trips`** pointing to `/view/my-trips`.
   - The dead-token text **`This trip link isn't available`** appears **nowhere**.
3. **FAIL** if the page shows the "This trip link isn't available. Ask your
   travel agent for a fresh link" dead-token message.

## Step 3 — /view/discover shows an honest coming-soon affordance
1. Navigate to `http://localhost:3000/view/discover`.
2. **Expected — PASS if ALL true:**
   - The page heading reads **`Discover what's hot`** with a **`Coming soon`**
     eyebrow.
   - There is a link **`Go to My Trips`** pointing to `/view/my-trips`.
   - The dead-token text **`This trip link isn't available`** appears **nowhere**.
3. **FAIL** if the page shows the dead-token message.

## Step 4 — /view/sign-in states a consistent account value prop
1. Navigate to `http://localhost:3000/view/sign-in`.
2. **Expected — PASS if true:**
   - The form tagline reads exactly
     **`Sign in to see your trips and have your name and email fill in automatically.`**
3. **FAIL** if the tagline is autofill-only (e.g. "Sign in to have your name and
   email fill in automatically." with no mention of seeing your trips).

## Step 5 — /discover offers travelers a way out (not just "become an agent")
1. Navigate to `http://localhost:3000/discover` (no sign-in).
2. **Expected — PASS if ALL true:**
   - The page still shows the agent path
     (**`You need an agency membership to use Discover`**).
   - AND it shows a traveler path: the sentence
     **`Not an agent? If a travel agent shared a trip with you,`** followed by a
     link **`go to your trips`** pointing to `/view`.
3. **FAIL** if the only options on the page point at becoming an agent
   (sign in via your agency / create an account and agency) with no traveler
   affordance.

---

## Overall verdict
- **PASS** — all five steps meet every expected string.
- **PRODUCT_FAIL** — any step fails as described (record which step + what you saw).
- **UAT_SPEC_FAIL** — a step is impossible to execute as written (e.g. a route
  errors out), independent of the product claim.

End your evidence with a single line: `**Overall:** <PASS|PRODUCT_FAIL|UAT_SPEC_FAIL|EVAL_CHEAT_FAIL>`
