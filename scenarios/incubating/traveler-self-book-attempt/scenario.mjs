// Kitchen Loop iteration-7 T2 Composition scenario: the self-drive traveler.
// A real traveler signs up for a consumer account, opens a booked trip an
// agent shared with them, and tries to carry it forward the two ways the
// `(client-view)` fork offers — "Book it myself" (self-drive) and "Have an
// agent arrange this for me" (handoff). It exercises the CAMPAIGN's marquee
// seam (GOAL.md Deliverable 2.4): today "Book it myself" is a confirmation-
// only stub. This scenario proves that MECHANICALLY at the API/DB layer, so
// the gap is a durable regression witness, not just a screenshot.
//
// What the companion live-browser pass established (Playwright MCP, this
// iteration, evidence at .kitchenloop/uat-runs/ + iteration-7-report.md):
//   • A fresh traveler signs up at /view/sign-up and is dropped on /view — a
//     static placeholder with NO planner, NO nav, NO link to My Trips.
//   • Opening /view/{token} while signed in renders the branded trip AND
//     auto-adds it to My Trips (a client_trip_link row appears).
//   • Clicking "Book it myself" swaps in a static "you're booking this trip
//     yourself" panel and fires ZERO network requests (browser network trace
//     showed only static assets) — no booking, no server call.
//   • Clicking "Have an agent arrange this" posts clientView.requestHandoff
//     and persists a trip_handoff_request (the ONLY write a traveler can make
//     against a shared trip).
//   • /discover (the What's-Hot feed) is agent-gated ("You need an agency
//     membership to use Discover") — there is no consumer discovery surface.
//
// This script re-proves the two load-bearing facts headlessly (4-layer L3:
// real HTTP against the built compose image → parsed responses → Postgres
// ground truth → state-delta assertions):
//   1. A signed-in traveler CANNOT self-book — clientView exposes no self-book
//      procedure, the agent-side workspace.booking.book is FORBIDDEN to a
//      traveler session (INV-024, no agency membership), and the itinerary's
//      booking_component count is unchanged by the whole traveler journey.
//   2. The handoff path DOES work — requestHandoff persists a
//      trip_handoff_request tied to the traveler's contact + this itinerary.
//
// Usage: docker compose up --build --wait
//        BASE_URL=http://localhost:3000 node scenarios/incubating/traveler-self-book-attempt/scenario.mjs

// KITCHENLOOP-COVERAGE-BEGIN
// [
//   { "feature": "booking", "platform": "web", "user_type": "client", "result": "fail", "iteration": 7, "tier": "T2", "note": "self-drive 'Book it myself' fork is a confirmation-only stub (GOAL.md D2.4 gap) — companion live-browser network trace fired ZERO mutations and booking_component count was unchanged; there is NO client-facing self-book procedure (clientView.book returns procedure-not-found) and the agent-side workspace.booking.book is FORBIDDEN to a traveler session; a client cannot book through the platform today" },
//   { "feature": "trust", "platform": "api", "user_type": "client", "result": "pass", "iteration": 7, "tier": "T2", "note": "an org-less signed-in traveler holding a valid share token can READ the trip (clientView.itinerary), attach it to My Trips (clientView.attachTrip), and request a handoff (clientView.requestHandoff), but is refused the agent-only workspace.booking.book (FORBIDDEN, INV-024) and every non-existent client procedure — the only write against a shared trip is the handoff request" }
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

/** Minimal cookie jar (same shape as fresh-draft-client-view / golden-path). */
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
/** tRPC SUBSCRIPTION over HTTP (spec 016, INV-028) — workspace.itinerary.draft
 * streams (SSE) rather than a single JSON mutation response. Mirrors the
 * fresh-draft-client-view helper. */
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
/** Operator-side psql against the compose Postgres (support.ts arrangement). */
function psql(sql) {
  return execFileSync(
    "docker",
    ["compose", "exec", "-T", "postgres", "psql", "-U", "tripforge", "-d", "tripforge", "-tAc", sql],
    { encoding: "utf8" },
  ).trim();
}

const TRIP = {
  destination: "Porto",
  checkIn: "2026-10-01",
  checkOut: "2026-10-03",
  party: { adults: 2, children: 0 },
  tripStyle: "balanced",
  budget: { mode: "hardCap", amountMinor: 150_000, currency: "USD" },
};
const MARKUP_BPS = 1800;

async function main() {
  console.log(`Traveler self-book-attempt scenario against ${BASE} (run ${runId})`);

  // ── Arrange: an agent drafts a trip, books its components, and shares it ───
  const agent = new Map();
  const agencyName = `Ericeira Surf Trips ${runId}`;
  await api(agent, "POST", "/api/auth/sign-up/email", {
    email: `agent-${runId}@example.test`,
    password: "self-book-scenario-7",
    name: "Scenario Agent",
  });
  const org = await api(agent, "POST", "/api/auth/organization/create", {
    name: agencyName,
    slug: `est-${runId}`,
  });
  const orgId = org.json?.id ?? org.json?.organization?.id;
  check("arrange: agency created", !!orgId, org.text.slice(0, 200));
  await api(agent, "POST", "/api/auth/organization/set-active", { organizationId: orgId });

  // Spec 019 compare-then-choose: draft returns options, selectDraft persists.
  const compare = await trpcSubscribe(agent, "workspace.itinerary.draft", TRIP);
  const options = compare.data?.options ?? [];
  check("arrange: AI drafts budget-fit options", compare.data?.status === "drafted" && options.length > 0, compare.text.slice(0, 200));
  const picked = options.find((o) => o.variant === "balanced") ?? options[0];
  const select = await trpcSubscribe(agent, "workspace.itinerary.selectDraft", { tripRequest: TRIP, variant: picked?.variant });
  const itineraryId = select.data?.itinerary?.id;
  check("arrange: an itinerary is persisted", select.data?.status === "drafted" && !!itineraryId, select.text.slice(0, 200));

  const quote = await trpcMutate(agent, "workspace.booking.quote", { itineraryId, markupBps: MARKUP_BPS });
  const held = (quote.data?.items ?? []).filter((i) => i.outcome === "held").map((i) => i.quote);
  check("arrange: at least one component holds a firm price", held.length > 0, quote.text.slice(0, 200));
  const book = await trpcMutate(agent, "workspace.booking.book", {
    itineraryId,
    quoteRowIds: held.map((r) => r.quoteRowId),
  });
  const confirmed = (book.data?.components ?? []).filter((c) => c.outcome === "confirmed");
  check("arrange: the agent books the held components", book.data?.status === "confirmed" && confirmed.length === held.length, book.text.slice(0, 200));

  const share = await trpcMutate(agent, "workspace.itinerary.share", { itineraryId });
  const token = share.data?.token;
  check("arrange: share link minted", share.data?.status === "shared" && !!token, share.text.slice(0, 200));

  // Ground truth: how many components are booked BEFORE the traveler touches it.
  const bookedBefore = psql(`SELECT count(*) FROM booking_component WHERE itinerary_id = '${itineraryId}'`);
  check("arrange: booking_component reflects the agent's booking", Number(bookedBefore) === confirmed.length, `db ${bookedBefore} vs confirmed ${confirmed.length}`);

  // ── The traveler signs up for a consumer account (org-less, spec 030) ─────
  const traveler = new Map();
  const travelerEmail = `traveler-${runId}@example.test`;
  const signUp = await api(traveler, "POST", "/api/auth/sign-up/email", {
    email: travelerEmail,
    password: "traveler-pass-7",
    name: "Farah Idrissi",
  });
  check("traveler: consumer sign-up succeeds", signUp.res.status === 200, `got ${signUp.res.status}`);
  const travelerUserId = psql(`SELECT id FROM "user" WHERE email = '${travelerEmail}'`);
  check("traveler: an org-less user row exists", !!travelerUserId, travelerUserId);
  check(
    "traveler: the account has NO agency membership (consumer identity, INV-024)",
    psql(`SELECT count(*) FROM member WHERE user_id = '${travelerUserId}'`) === "0",
  );

  // ── Read side (trust x api x client): the traveler can see the branded trip
  const view = await trpcQuery(traveler, "clientView.itinerary", { token });
  const v = view.data?.view;
  check("traveler: the shared trip resolves for the signed-in traveler", view.data?.status === "found" && !!v, view.text.slice(0, 200));
  check("traveler: the trip is branded to the agency, not the platform", v?.agencyName === agencyName, `got ${v?.agencyName}`);
  const viewItems = (v?.days ?? []).flatMap((d) => d.items);
  check("traveler: at least one item shows as Booked (the agent's booking)", viewItems.some((i) => i.booked === true), JSON.stringify(viewItems.map((i) => i.booked)));
  const payload = JSON.stringify(view.data);
  for (const forbidden of ["netRate", "netMinor", "markup", "supplyRef", "agencyId", "provenance"]) {
    check(`traveler: confidential key "${forbidden}" absent from the traveler payload`, !payload.includes(forbidden));
  }

  // ── Trip history: opening a shared trip attaches it to My Trips ───────────
  const attach = await trpcMutate(traveler, "clientView.attachTrip", { token });
  check("traveler: attaching the trip succeeds", attach.error === null, attach.text.slice(0, 200));
  const myTrips = await trpcQuery(traveler, "clientView.myTrips", undefined);
  const myTripRows = myTrips.data?.trips ?? myTrips.data ?? [];
  check("traveler: the trip now appears in My Trips", Array.isArray(myTripRows) && myTripRows.length >= 1, myTrips.text.slice(0, 200));
  check(
    "traveler: exactly one client_trip_link row was created for this traveler",
    psql(`SELECT count(*) FROM client_trip_link WHERE user_id = '${travelerUserId}'`) === "1",
  );

  // ── THE GAP (booking x web x client): the traveler cannot self-book ───────
  // 1. There is no client-facing self-book procedure at all.
  const clientBook = await trpcMutate(traveler, "clientView.book", { token, itineraryId });
  check(
    "gap: clientView.book does NOT exist — no self-book procedure on the client surface (D2.4)",
    !clientBook.data && clientBook.error !== null,
    `unexpectedly got data=${JSON.stringify(clientBook.data)} error=${JSON.stringify(clientBook.error)?.slice(0, 160)}`,
  );
  // 2. The agent-side money path is FORBIDDEN to a traveler session (INV-024):
  //    a consumer cannot escalate into the agent booking procedures.
  const travelerBook = await trpcMutate(traveler, "workspace.booking.book", { itineraryId, quoteRowIds: [] });
  check(
    "gap: the agent-only workspace.booking.book is refused for the traveler (FORBIDDEN, INV-024)",
    !travelerBook.data && travelerBook.error !== null,
    `unexpectedly got data=${JSON.stringify(travelerBook.data)}`,
  );
  const travelerQuote = await trpcMutate(traveler, "workspace.booking.quote", { itineraryId, markupBps: MARKUP_BPS });
  check(
    "gap: the agent-only workspace.booking.quote is likewise refused for the traveler",
    !travelerQuote.data && travelerQuote.error !== null,
    `unexpectedly got data=${JSON.stringify(travelerQuote.data)}`,
  );
  // 3. State conservation: none of the traveler's attempts created a booking.
  const bookedAfter = psql(`SELECT count(*) FROM booking_component WHERE itinerary_id = '${itineraryId}'`);
  check(
    "gap: the traveler journey created ZERO new bookings (self-book is a stub)",
    bookedAfter === bookedBefore,
    `booking_component ${bookedBefore} -> ${bookedAfter}`,
  );

  // ── THE WORKING SEAM: request-an-agent handoff persists ───────────────────
  const handoffBefore = psql(`SELECT count(*) FROM trip_handoff_request WHERE itinerary_id = '${itineraryId}'`);
  const handoff = await trpcMutate(traveler, "clientView.requestHandoff", {
    token,
    contactName: "Farah Idrissi",
    contactEmail: travelerEmail,
    notes: "Please confirm the Porto stay and activities.",
  });
  check("handoff: requestHandoff returns submitted", handoff.data?.status === "submitted", handoff.text.slice(0, 200));
  const handoffAfter = psql(`SELECT count(*) FROM trip_handoff_request WHERE itinerary_id = '${itineraryId}'`);
  check(
    "handoff: exactly one trip_handoff_request was persisted for this itinerary",
    Number(handoffAfter) === Number(handoffBefore) + 1,
    `${handoffBefore} -> ${handoffAfter}`,
  );
  check(
    "handoff: the persisted request carries the traveler's contact name",
    psql(`SELECT contact_name FROM trip_handoff_request WHERE itinerary_id = '${itineraryId}' ORDER BY created_at DESC LIMIT 1`) === "Farah Idrissi",
  );

  console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("scenario crashed:", err);
  process.exit(1);
});
