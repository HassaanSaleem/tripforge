// Kitchen Loop iteration-9 T1 Foundation scenario: a brand-new agent builds a
// client trip ENTIRELY through the chat-first AI builder, then books it.
//
// GOAL.md Deliverable 3 promotes the AI builder to CHAT-FIRST: "a chat fills the
// same fields the form collects … once the itinerary has what it needs, the flow
// proceeds into the booking workflow." PR #7 (spec 035) shipped this on the agent
// surface — the multi-turn conversation accumulates, resolves to the SAME trip
// request the form produces, and hands into the UNCHANGED compare→choose→book
// pipeline. This is the campaign's flagship deliverable, freshly merged.
//
// This T1 pass asks the T1 question of that flagship — "does the basic stuff work
// perfectly?" — and probes the ADJACENT easy-path phrasings a real brand-new user
// would type, which the single pinned e2e (tests/e2e/chat-first-journey.spec.ts —
// always "Plan a trip to Lisbon" then a budget) never exercises.
//
// A companion live-browser (Playwright MCP) pass this iteration drove the FULL
// web build-to-book end-to-end (sign-up → chat multi-turn → Build my trip →
// compare → choose → quote 15% → BOOK confirmed, 7 items, zero console errors;
// evidence in .kitchenloop/uat-runs/chat-first-build-to-book/ + iteration-9-report.md).
// This script is the durable API/DB regression witness for the same behavior.
//
// What this witnesses (4-layer L3: real HTTP against the built compose image →
// parsed responses → Postgres ground truth → state-delta asserts):
//   1. MULTI-TURN ACCUMULATION. Turn 1 (destination only) → needsInfo, no draft;
//      Turn 2 (budget+duration, carrying turn 1 as priorMessages) → resolves by
//      accumulating across turns — neither turn resolves alone (spec 035 FR-001).
//      Deterministic under the keyless FakeLLM (SC-004).
//   2. SINGLE-SHOT. Everything in one message resolves in one turn.
//   3. CHAT → DRAFT → BOOK. The resolved chat request drives the UNCHANGED
//      draft→selectDraft→quote→book money path; markup_ledger conserves
//      net+markup=sell on every row (INV-009/010).
//   4. STATE CONSERVATION on needsInfo. A message that cannot resolve creates
//      ZERO itineraries (no side effect before the agent confirms).
//   5. THREE DOCUMENTED KEYLESS-EXTRACTOR FINDINGS (pinned known behavior, same
//      convention as golden-path/content-library-media-gap). These assert the
//      CURRENT behavior faithfully so a future fix flips them loudly — they are
//      NOT desired behavior:
//        • FRICTION-1 — a bare leading city with no "to"/"in" preposition
//          ("Barcelona, 5 nights, …") is NOT recognized as a destination.
//        • FRICTION-2 — a word-form currency ("3000 euros") is NOT recognized as
//          a budget (only ISO codes EUR/USD/GBP and symbols $/€/£ parse).
//        • BUG-1 — the "keep chatting to adjust it" affordance SILENTLY DROPS a
//          correction to an already-stated field: appending "make it 7 nights"
//          to a transcript that already said "5 nights" still resolves to 5
//          (append-only transcript + first-regex-match-wins extractor), while the
//          UI re-confirms the stale value as if it heard the change.
//
// Usage: docker compose up --build --wait
//        BASE_URL=http://localhost:3000 node scenarios/incubating/chat-first-build-to-book/scenario.mjs

// KITCHENLOOP-COVERAGE-BEGIN
// [
//   { "feature": "itinerary-builder", "platform": "api", "user_type": "agent-seller", "result": "pass", "iteration": 9, "tier": "T1", "note": "chat-first build-to-book robustness (spec 035): HTTP interpretChatRequest accumulates a multi-turn transcript (destination turn 1 → needsInfo, budget turn 2 with priorMessages → resolved), resolves single-shot, and the resolved chat request drives the UNCHANGED draft→select→quote→book money path with markup_ledger net+markup=sell conserved; needsInfo creates zero itineraries. Also pins 3 keyless-extractor findings as known behavior: bare-leading-destination + word-currency both fall to needsInfo, and a mid-conversation override of an already-stated field is silently dropped (BUG-1)" },
//   { "feature": "itinerary-builder", "platform": "web", "user_type": "agent-seller", "result": "pass", "iteration": 9, "tier": "T1", "note": "companion live-browser (Playwright MCP) pass: a brand-new agency signs up and builds a Lisbon trip across TWO chat turns on the now-PRIMARY chat surface (form hidden behind a toggle), clicks 'Build my trip' → compare (3 options) → choose → drafted itinerary → quote at 15% (7 items held, USD→EUR FX) → BOOK confirmed with supplier refs; zero console errors/warnings across the whole journey (evidence in .kitchenloop/uat-runs/chat-first-build-to-book/)" }
// ]
// KITCHENLOOP-COVERAGE-END

import { execFileSync } from "node:child_process";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const runId = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

/** Minimal cookie jar (same shape as traveler-marketplace-attempt / golden-path). */
function absorbCookies(jar, res) {
  for (const line of res.headers.getSetCookie?.() ?? []) {
    const [pair] = line.split(";");
    const eq = pair.indexOf("=");
    if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
}
const cookieHeader = (jar) => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");

async function api(jar, method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      origin: BASE, // Better Auth CSRF-checks Origin like a real browser sends it
      ...(jar.size ? { cookie: cookieHeader(jar) } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  absorbCookies(jar, res);
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* HTML or empty — caller inspects text */
  }
  return { res, json, text };
}

/** tRPC mutation over HTTP (single, non-batched). */
async function trpcMutate(jar, proc, input) {
  const r = await api(jar, "POST", `/api/trpc/${proc}`, input);
  return { ...r, data: r.json?.result?.data ?? null, error: r.json?.error ?? null };
}
/** tRPC query over HTTP (GET, ?input= JSON). */
async function trpcQuery(jar, proc, input) {
  const qs = input === undefined ? "" : `?input=${encodeURIComponent(JSON.stringify(input))}`;
  const r = await api(jar, "GET", `/api/trpc/${proc}${qs}`);
  return { ...r, data: r.json?.result?.data ?? null, error: r.json?.error ?? null };
}
/** tRPC SUBSCRIPTION over HTTP (spec 016, INV-028) — draft/selectDraft stream
 * (SSE) rather than a single JSON mutation response. */
async function trpcSubscribe(jar, proc, input) {
  const url = `${BASE}/api/trpc/${proc}?input=${encodeURIComponent(JSON.stringify(input))}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      accept: "text/event-stream",
      origin: BASE,
      ...(jar.size ? { cookie: cookieHeader(jar) } : {}),
    },
  });
  absorbCookies(jar, res);
  const text = await res.text();
  const frames = text
    .split("\n\n")
    .map((b) => b.trim())
    .filter(Boolean)
    .map((block) => {
      let event = null;
      const dataLines = [];
      for (const line of block.split("\n")) {
        if (line.startsWith("event:")) event = line.slice("event:".length).trim();
        else if (line.startsWith("data:")) dataLines.push(line.slice("data:".length).trim());
      }
      return { event, data: dataLines.join("\n") };
    });
  const events = frames.filter((f) => f.event === null).map((f) => JSON.parse(f.data));
  const terminal = events.find((e) => e?.type === "result");
  return { res, text, data: terminal?.outcome ?? null };
}
/** Operator-side psql against the compose Postgres. */
function psql(sql) {
  return execFileSync(
    "docker",
    ["compose", "exec", "-T", "postgres", "psql", "-U", "tripforge", "-d", "tripforge", "-tAc", sql],
    { encoding: "utf8" },
  ).trim();
}

/** Whole-number nights between two ISO (YYYY-MM-DD) dates — mirrors the UI's own
 * nightsBetween (chat-entry.tsx) so the witness reads duration the same way. */
function nights(tripRequest) {
  return Math.round((Date.parse(tripRequest.checkOut) - Date.parse(tripRequest.checkIn)) / 86_400_000);
}

async function interpret(jar, message, priorMessages) {
  const input = priorMessages ? { message, priorMessages } : { message };
  return trpcMutate(jar, "workspace.itinerary.interpretChatRequest", input);
}

async function main() {
  console.log(`Chat-first build-to-book scenario against ${BASE} (run ${runId})`);

  // ── Arrange: a brand-new agency signs up (the agent-seller) ───────────────
  const agent = new Map();
  const agencyName = `Chat First Voyages ${runId}`;
  await api(agent, "POST", "/api/auth/sign-up/email", {
    email: `agent-${runId}@example.test`,
    password: "chat-first-9",
    name: "Scenario Agent",
  });
  const org = await api(agent, "POST", "/api/auth/organization/create", { name: agencyName, slug: `cfv-${runId}` });
  const orgId = org.json?.id ?? org.json?.organization?.id;
  check("arrange: agency created", !!orgId, org.text.slice(0, 200));
  await api(agent, "POST", "/api/auth/organization/set-active", { organizationId: orgId });

  // ── 1. MULTI-TURN ACCUMULATION (the primary happy path) ───────────────────
  const t1 = await interpret(agent, "Plan a trip to Lisbon");
  check("multi-turn: turn 1 (destination only) → needsInfo, no draft", t1.data?.status === "needsInfo", t1.text.slice(0, 200));
  check("multi-turn: turn 1 clarifying reply asks for the missing budget", /budget/i.test(t1.data?.reply ?? ""), t1.data?.reply);

  const t2 = await interpret(agent, "around EUR 2000 for 4 nights", ["Plan a trip to Lisbon"]);
  check("multi-turn: turn 2 (budget, carrying turn 1) RESOLVES by accumulation", t2.data?.status === "resolved", t2.text.slice(0, 200));
  const lisbon = t2.data?.tripRequest;
  check("multi-turn: destination accumulated from turn 1 = Lisbon", lisbon?.destination === "Lisbon", lisbon?.destination);
  check(
    "multi-turn: budget from turn 2 = EUR 2000 (200000 minor)",
    lisbon?.budget?.amountMinor === 200_000 && lisbon?.budget?.currency === "EUR",
    JSON.stringify(lisbon?.budget),
  );
  check("multi-turn: duration = 4 nights", nights(lisbon) === 4, `nights=${lisbon ? nights(lisbon) : "n/a"}`);
  check("multi-turn: party defaults to 2 adults, 0 children", lisbon?.party?.adults === 2 && lisbon?.party?.children === 0, JSON.stringify(lisbon?.party));

  const t2again = await interpret(agent, "around EUR 2000 for 4 nights", ["Plan a trip to Lisbon"]);
  check(
    "multi-turn: determinism — the same transcript resolves identically (SC-004)",
    JSON.stringify(t2again.data) === JSON.stringify(t2.data),
    "resolved outputs differ across identical calls",
  );

  // ── 2. SINGLE-SHOT resolution ─────────────────────────────────────────────
  const single = await interpret(agent, "Plan a trip to Rome for 2 people, 5 nights, around USD 3000, boutique style");
  check("single-shot: everything in one message RESOLVES", single.data?.status === "resolved", single.text.slice(0, 200));
  const rome = single.data?.tripRequest;
  check("single-shot: destination = Rome", rome?.destination === "Rome", rome?.destination);
  check("single-shot: budget = USD 3000 (300000 minor)", rome?.budget?.amountMinor === 300_000 && rome?.budget?.currency === "USD", JSON.stringify(rome?.budget));
  check("single-shot: duration = 5 nights", nights(rome) === 5, `nights=${rome ? nights(rome) : "n/a"}`);
  check("single-shot: 'boutique' maps to premium style", rome?.tripStyle === "premium", rome?.tripStyle);
  check("single-shot: 'for 2 people' = 2 adults", rome?.party?.adults === 2, JSON.stringify(rome?.party));

  // ── 3. CHAT → DRAFT → BOOK (the resolved chat request drives the money path) ─
  const draft = await trpcSubscribe(agent, "workspace.itinerary.draft", lisbon);
  const options = draft.data?.options ?? [];
  check("handoff: the resolved chat request drives the UNCHANGED draft pipeline", draft.data?.status === "drafted" && options.length > 0, draft.text.slice(0, 200));
  const picked = options.find((o) => o.variant === "balanced") ?? options[0];
  const select = await trpcSubscribe(agent, "workspace.itinerary.selectDraft", { tripRequest: lisbon, variant: picked?.variant });
  const itineraryId = select.data?.itinerary?.id;
  check("handoff: choosing an option persists a real Lisbon itinerary", select.data?.status === "drafted" && !!itineraryId, select.text.slice(0, 200));
  check("handoff: the persisted itinerary is titled for the chat destination", /lisbon/i.test(select.data?.itinerary?.title ?? ""), select.data?.itinerary?.title);

  const quote = await trpcMutate(agent, "workspace.booking.quote", { itineraryId, markupBps: 1500 });
  const held = (quote.data?.items ?? []).filter((i) => i.outcome === "held");
  check("handoff: quote at 15% markup holds ≥1 bookable item at firm net rates", quote.data?.status === "quoted" && held.length >= 1, quote.text.slice(0, 200));
  const quoteRowIds = held.flatMap((h) => (h.outcome === "held" ? [h.quote.quoteRowId] : []));
  const book = await trpcMutate(agent, "workspace.booking.book", { itineraryId, quoteRowIds });
  check("handoff: the chat-built trip BOOKS through the unchanged money path", book.data?.status === "confirmed", book.text.slice(0, 200));
  check(
    "handoff: every booked component is confirmed",
    Array.isArray(book.data?.components) && book.data.components.length >= 1 && book.data.components.every((c) => c.outcome === "confirmed"),
    JSON.stringify((book.data?.components ?? []).map((c) => c.outcome)),
  );

  // Money conservation on the platform's own ledger: net + markup = sell, every row.
  const violations = psql(`SELECT count(*) FROM markup_ledger WHERE agency_id = '${orgId}' AND net_minor + markup_minor <> sell_minor`);
  const ledgerCount = psql(`SELECT count(*) FROM markup_ledger WHERE agency_id = '${orgId}'`);
  check("handoff: markup ledger has rows for the chat-built booking", Number(ledgerCount) >= 1, `rows=${ledgerCount}`);
  check("handoff: markup ledger conserves net+markup=sell on every row (INV-009/010)", violations === "0", `violating rows=${violations}`);

  // ── 4. STATE CONSERVATION on needsInfo (no side effect before confirmation) ─
  const listBefore = (await trpcQuery(agent, "workspace.itinerary.list", undefined)).data?.itineraries?.length ?? null;
  const ni = await interpret(agent, "Plan a trip for 2 with a EUR 2000 budget"); // no destination
  check("conservation: a message missing a destination returns needsInfo", ni.data?.status === "needsInfo", ni.text.slice(0, 200));
  const listAfter = (await trpcQuery(agent, "workspace.itinerary.list", undefined)).data?.itineraries?.length ?? null;
  check(
    "conservation: needsInfo creates ZERO itineraries (interpret has no side effect)",
    listBefore !== null && listAfter === listBefore,
    `itinerary list ${listBefore} -> ${listAfter}`,
  );

  // ── 5. DOCUMENTED KEYLESS-EXTRACTOR FINDINGS (pinned known behavior) ───────
  // These assert CURRENT behavior faithfully. They are NOT desired behavior — a
  // fix (accept bare-leading destinations / word currencies / last-match-wins
  // override) SHOULD flip them, at which point this block is updated. See the
  // iteration-9 report FRICTION-1/FRICTION-2/BUG-1 for the full analysis.

  // FRICTION-1 — a bare leading city with no "to"/"in" is not seen as a destination.
  const bare = await interpret(agent, "Barcelona, 5 nights, 2 people, around EUR 3000");
  check(
    "finding FRICTION-1: a bare leading destination (no 'to'/'in') falls to needsInfo, asking for a destination already given",
    bare.data?.status === "needsInfo" && /which destination/i.test(bare.data?.reply ?? ""),
    `status=${bare.data?.status} reply=${bare.data?.reply}`,
  );

  // FRICTION-2 — a word-form currency is not recognized as a budget (dest IS captured).
  const wordCur = await interpret(agent, "Plan a trip to Rome, around 3000 euros for 5 nights");
  check(
    "finding FRICTION-2: a word-form currency ('3000 euros') is not parsed as a budget → needsInfo (only ISO codes/symbols parse)",
    wordCur.data?.status === "needsInfo" && /budget/i.test(wordCur.data?.reply ?? ""),
    `status=${wordCur.data?.status} reply=${wordCur.data?.reply}`,
  );

  // BUG-1 — the "keep chatting to adjust it" affordance silently drops a
  // correction to an already-stated field (append-only transcript + first-match).
  const priorFive = "Plan a trip to Lisbon for 2, 5 nights, EUR 2000";
  const before = await interpret(agent, priorFive);
  check("finding BUG-1 (setup): the initial message resolves to 5 nights", before.data?.status === "resolved" && nights(before.data.tripRequest) === 5, `nights=${before.data?.status === "resolved" ? nights(before.data.tripRequest) : "n/a"}`);
  const adjusted = await interpret(agent, "actually make it 7 nights instead", [priorFive]);
  check(
    "finding BUG-1: an override of an already-stated field is IGNORED — 'make it 7 nights' still resolves to 5 (KNOWN BUG, not desired)",
    adjusted.data?.status === "resolved" && nights(adjusted.data.tripRequest) === 5,
    `resolved nights=${adjusted.data?.status === "resolved" ? nights(adjusted.data.tripRequest) : "n/a"} (a fix would make this 7 and flip this assertion)`,
  );

  console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("scenario crashed:", err);
  process.exit(1);
});
