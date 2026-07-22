// Kitchen Loop iteration-7 T2 Composition scenario, UPDATED for spec 036: the
// self-drive traveler now BOOKS. A real traveler signs up for a consumer
// account, opens an un-booked proposal an agent shared with them, and carries
// it forward the two ways the `(client-view)` fork offers — "Book it myself"
// (self-drive) and "Have an agent arrange this for me" (handoff).
//
// This scenario is the durable witness for GOAL.md Deliverable 2.4. It was
// filed (iter-7) proving the gap — "Book it myself" was a confirmation-only
// stub that fired ZERO server calls and booked nothing. Spec 036 CLOSED that
// gap, so this witness now proves the seam WORKS: a signed-in traveler
// self-books through `clientView.selfBook`, real `booking_component` rows
// appear attributed to the OWNING agency with the traveler as the PMF actor,
// and INV-024 still holds (the traveler is still FORBIDDEN the agent-only
// workspace booking procedures — self-book runs on the client-view surface).
//
// 4-layer L3: real HTTP against the built compose image → parsed responses →
// Postgres ground truth → state-delta assertions. Load-bearing facts:
//   1. A signed-in traveler CAN self-book an un-booked shared proposal via
//      clientView.selfBook — booking_component rises from 0 to N, every row
//      carrying the OWNING agency's agency_id (INV-004) and the traveler's
//      user id as the booking_confirmed actor.
//   2. The agent-only workspace.booking.{book,quote} stays FORBIDDEN to the
//      traveler session (INV-024) — self-book is the ONLY booking path a
//      consumer has, and it never escalates into a workspace procedure.
//   3. A repeat self-book of a now-fully-booked trip is a clean no-op
//      (nothing_to_book) with ZERO new rows — conservation.
//   4. The handoff path still works — requestHandoff persists a
//      trip_handoff_request tied to the traveler's contact + this itinerary.
//
// Usage: docker compose up --build --wait
//        BASE_URL=http://localhost:3000 node scenarios/incubating/traveler-self-book-attempt/scenario.mjs

// KITCHENLOOP-COVERAGE-BEGIN
// [
//   { "feature": "booking", "platform": "web", "user_type": "client", "result": "pass", "iteration": 8, "tier": "T2", "note": "self-drive 'Book it myself' is now a REAL money path (spec 036, GOAL.md D2.4): a signed-in traveler self-books an un-booked shared proposal via clientView.selfBook — booking_component count rises from 0 to N, every row attributed to the OWNING agency (INV-004) with the traveler as the booking_confirmed PMF actor; the agent-only workspace.booking.book stays FORBIDDEN to the traveler (INV-024); a repeat self-book of a fully-booked trip is a nothing_to_book no-op with zero new rows" },
//   { "feature": "trust", "platform": "api", "user_type": "client", "result": "pass", "iteration": 8, "tier": "T2", "note": "an org-less signed-in traveler holding a valid share token can READ the trip (clientView.itinerary), attach it to My Trips (clientView.attachTrip), self-book it (clientView.selfBook), and request a handoff (clientView.requestHandoff), but is refused the agent-only workspace.booking.book/quote (FORBIDDEN, INV-024) and every non-existent client procedure — every write against a shared trip goes through a client-view procedure, never a workspace one" }
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

async function main() {
  console.log(`Traveler self-book scenario against ${BASE} (run ${runId})`);

  // ── Arrange: an agent drafts a trip and shares it UN-BOOKED (a proposal) ───
  const agent = new Map();
  const agencyName = `Ericeira Surf Trips ${runId}`;
  await api(agent, "POST", "/api/auth/sign-up/email", {
    email: `agent-${runId}@example.test`,
    password: "self-book-scenario-8",
    name: "Scenario Agent",
  });
  const org = await api(agent, "POST", "/api/auth/organization/create", {
    name: agencyName,
    slug: `est-${runId}`,
  });
  const orgId = org.json?.id ?? org.json?.organization?.id;
  check("arrange: agency created", !!orgId, org.text.slice(0, 200));
  await api(agent, "POST", "/api/auth/organization/set-active", { organizationId: orgId });
  const agencyId = psql(`SELECT id FROM organization WHERE slug = 'est-${runId}'`);
  check("arrange: agency row exists", !!agencyId, agencyId);

  // Spec 019 compare-then-choose: draft returns options, selectDraft persists.
  const compare = await trpcSubscribe(agent, "workspace.itinerary.draft", TRIP);
  const options = compare.data?.options ?? [];
  check("arrange: AI drafts budget-fit options", compare.data?.status === "drafted" && options.length > 0, compare.text.slice(0, 200));
  const picked = options.find((o) => o.variant === "balanced") ?? options[0];
  const select = await trpcSubscribe(agent, "workspace.itinerary.selectDraft", { tripRequest: TRIP, variant: picked?.variant });
  const itineraryId = select.data?.itinerary?.id;
  check("arrange: an itinerary is persisted", select.data?.status === "drafted" && !!itineraryId, select.text.slice(0, 200));

  // Share WITHOUT booking — the traveler has real work to self-book.
  const share = await trpcMutate(agent, "workspace.itinerary.share", { itineraryId });
  const token = share.data?.token;
  check("arrange: share link minted", share.data?.status === "shared" && !!token, share.text.slice(0, 200));

  // Ground truth: nothing booked before the traveler acts.
  const bookedBefore = psql(`SELECT count(*) FROM booking_component WHERE itinerary_id = '${itineraryId}'`);
  check("arrange: the shared proposal is un-booked (booking_component = 0)", Number(bookedBefore) === 0, `db ${bookedBefore}`);

  // ── The traveler signs up for a consumer account (org-less, spec 030) ─────
  const traveler = new Map();
  const travelerEmail = `traveler-${runId}@example.test`;
  const signUp = await api(traveler, "POST", "/api/auth/sign-up/email", {
    email: travelerEmail,
    password: "traveler-pass-8",
    name: "Farah Idrissi",
  });
  check("traveler: consumer sign-up succeeds", signUp.res.status === 200, `got ${signUp.res.status}`);
  const travelerUserId = psql(`SELECT id FROM "user" WHERE email = '${travelerEmail}'`);
  check("traveler: an org-less user row exists", !!travelerUserId, travelerUserId);
  check(
    "traveler: the account has NO agency membership (consumer identity, INV-024)",
    psql(`SELECT count(*) FROM member WHERE user_id = '${travelerUserId}'`) === "0",
  );

  // ── Read side (trust x api x client): the traveler sees the branded trip ──
  const view = await trpcQuery(traveler, "clientView.itinerary", { token });
  const v = view.data?.view;
  check("traveler: the shared trip resolves for the signed-in traveler", view.data?.status === "found" && !!v, view.text.slice(0, 200));
  check("traveler: the trip is branded to the agency, not the platform", v?.agencyName === agencyName, `got ${v?.agencyName}`);
  const viewItems = (v?.days ?? []).flatMap((d) => d.items);
  check("traveler: no item is booked yet (un-booked proposal)", viewItems.every((i) => i.booked === false), JSON.stringify(viewItems.map((i) => i.booked)));

  // ── THE SEAM (booking x web x client): the traveler SELF-BOOKS ────────────
  const selfBook = await trpcMutate(traveler, "clientView.selfBook", { token });
  check(
    "self-book: clientView.selfBook confirms the traveler's booking",
    selfBook.data?.status === "confirmed" && Array.isArray(selfBook.data?.legs) && selfBook.data.legs.length > 0,
    `got status=${selfBook.data?.status} error=${JSON.stringify(selfBook.error)?.slice(0, 160)}`,
  );
  const confirmedLegs = (selfBook.data?.legs ?? []).filter((l) => l.outcome === "confirmed");
  check("self-book: every leg confirmed", confirmedLegs.length === (selfBook.data?.legs ?? []).length && confirmedLegs.length > 0, JSON.stringify((selfBook.data?.legs ?? []).map((l) => l.outcome)));
  check(
    "self-book: totalChargedMinor equals the sum of confirmed leg sells",
    selfBook.data?.totalChargedMinor === confirmedLegs.reduce((s, l) => s + l.sellMinor, 0),
    `total ${selfBook.data?.totalChargedMinor}`,
  );

  // Redaction (INV-020): no confidential field crosses the boundary.
  const selfBookPayload = JSON.stringify(selfBook.data).toLowerCase();
  for (const forbidden of ["netminor", "markup", "merchantofrecord", "supplierbookingid", "offerid", "supplyref"]) {
    check(`self-book: confidential key "${forbidden}" absent from the traveler payload`, !selfBookPayload.includes(forbidden));
  }

  // Ground truth: real booking_component rows now exist, attributed to the
  // OWNING agency (INV-004), and the booking_confirmed PMF actor is the traveler.
  const bookedAfter = psql(`SELECT count(*) FROM booking_component WHERE itinerary_id = '${itineraryId}'`);
  check(
    "self-book: booking_component count rose to match the confirmed legs",
    Number(bookedAfter) === confirmedLegs.length && Number(bookedAfter) > 0,
    `booking_component ${bookedBefore} -> ${bookedAfter}, legs ${confirmedLegs.length}`,
  );
  check(
    "self-book: every booking_component is attributed to the OWNING agency (INV-004)",
    psql(`SELECT count(*) FROM booking_component WHERE itinerary_id = '${itineraryId}' AND agency_id = '${agencyId}'`) === String(bookedAfter),
  );
  check(
    "self-book: the booking_confirmed PMF actor is the TRAVELER (client-ownership attribution)",
    psql(`SELECT count(*) FROM pmf_event WHERE itinerary_id = '${itineraryId}' AND type = 'booking_confirmed' AND actor_user_id = '${travelerUserId}'`) === String(bookedAfter),
  );

  // ── INV-024 STILL HOLDS: the agent-only workspace path is FORBIDDEN ───────
  const travelerBook = await trpcMutate(traveler, "workspace.booking.book", { itineraryId, quoteRowIds: [] });
  check(
    "guard: the agent-only workspace.booking.book is refused for the traveler (FORBIDDEN, INV-024)",
    !travelerBook.data && travelerBook.error !== null,
    `unexpectedly got data=${JSON.stringify(travelerBook.data)}`,
  );
  const travelerQuote = await trpcMutate(traveler, "workspace.booking.quote", { itineraryId, markupBps: 1500 });
  check(
    "guard: the agent-only workspace.booking.quote is likewise refused for the traveler",
    !travelerQuote.data && travelerQuote.error !== null,
    `unexpectedly got data=${JSON.stringify(travelerQuote.data)}`,
  );

  // ── Conservation: a repeat self-book of the now-booked trip is a no-op ────
  const beforeRepeat = psql(`SELECT count(*) FROM booking_component WHERE itinerary_id = '${itineraryId}'`);
  const repeat = await trpcMutate(traveler, "clientView.selfBook", { token });
  check("self-book: a repeat self-book of the fully-booked trip is nothing_to_book", repeat.data?.status === "nothing_to_book", repeat.text.slice(0, 200));
  const afterRepeat = psql(`SELECT count(*) FROM booking_component WHERE itinerary_id = '${itineraryId}'`);
  check("self-book: the repeat wrote ZERO new booking_component rows (conservation)", beforeRepeat === afterRepeat, `${beforeRepeat} -> ${afterRepeat}`);

  // ── THE OTHER SEAM: request-an-agent handoff still persists ────────────────
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

  console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("scenario crashed:", err);
  process.exit(1);
});
