// Live INV-028 acceptance tool (spec 005, research D11): prove a held quote
// books from a DIFFERENT web server process than the one that issued it — the
// Vercel quote→book topology a single smoke run cannot exercise. Dependency-free
// plain node, like the rest of tests/integration (harness research D1).
//
// Usage against a booted compose stack (BASE_URL defaults to localhost:3000):
//   node tests/integration/uat-fresh-process.mjs quote
//     bootstraps an agent (sign-up → agency → active org), drafts an itinerary,
//     quotes every bookable item, saves the holds + credentials to the state
//     file, prints `HOLDS_SAVED count=N`.
//   <caller restarts the web container — e.g. `docker compose restart web` —
//    wiping every in-process supplier hold>
//   node tests/integration/uat-fresh-process.mjs book
//     signs in fresh, books the SAVED holds WITHOUT re-quoting, prints
//     `BOOK_CONFIRMED status=confirmed components=N/N` on success.
//   node tests/integration/uat-fresh-process.mjs book-race
//     fires TWO concurrent book requests for the saved holds (seed-0005d):
//     exactly one wins, the loser is refused per component, prints
//     `RACE_ONE_WINNER …` on success.
import { readFileSync, writeFileSync } from "node:fs";
import { createHttpSession } from "./harness.mjs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const STATE_FILE = process.env.UAT_STATE_FILE ?? "/tmp/tripforge-uat-hold.json";
const mode = process.argv[2];

function fail(msg, detail) {
  console.error(`FAIL: ${msg}${detail ? `\n${detail}` : ""}`);
  process.exit(1);
}

if (mode === "quote") {
  const agent = createHttpSession(BASE);
  const stamp = `${Date.now()}-${process.pid}`;
  const email = `uat-inv028-${stamp}@example.test`;
  const password = "uat-inv028-password-1";

  const su = await agent.api("POST", "/api/auth/sign-up/email", {
    name: "UAT INV-028 Agent",
    email,
    password,
  });
  if (!su.res.ok) fail(`sign-up (${su.res.status})`, su.text.slice(0, 200));
  const org = await agent.api("POST", "/api/auth/organization/create", {
    name: `UAT INV-028 Agency ${stamp}`,
    slug: `uat-inv028-${stamp}`,
  });
  const organizationId = org.json?.id ?? org.json?.organization?.id;
  if (org.res.status !== 200 || !organizationId) fail(`agency create (${org.res.status})`, org.text.slice(0, 200));
  const active = await agent.api("POST", "/api/auth/organization/set-active", { organizationId });
  if (active.res.status !== 200) fail(`set-active (${active.res.status})`, active.text.slice(0, 200));

  // Streamed (spec 016, INV-028) — SSE subscription, not a POST mutation.
  const draft = await agent.apiSubscribe(
    "/api/trpc/workspace.itinerary.draft",
    {
      destination: "Paris",
      checkIn: "2026-09-01",
      checkOut: "2026-09-03",
      party: { adults: 2, children: 0 },
      budget: { mode: "hardCap", amountMinor: 100000, currency: "USD" },
    },
    { timeoutMs: 45_000 },
  );
  const drafted = draft.outcome;
  if (drafted?.status !== "drafted") fail("draft", draft.text.slice(0, 300));
  const itineraryId = drafted.itinerary.id;

  const quote = await agent.api("POST", "/api/trpc/workspace.booking.quote", { itineraryId, markupBps: 1500 });
  const quoted = quote.json?.result?.data;
  const quoteRowIds = (quoted?.items ?? [])
    .filter((i) => i.outcome === "held")
    .map((i) => i.quote.quoteRowId);
  if (quoted?.status !== "quoted" || quoteRowIds.length === 0) fail("quote", quote.text.slice(0, 300));

  writeFileSync(STATE_FILE, JSON.stringify({ email, password, organizationId, itineraryId, quoteRowIds }));
  console.log(`HOLDS_SAVED count=${quoteRowIds.length} state=${STATE_FILE}`);
} else if (mode === "book") {
  const state = JSON.parse(readFileSync(STATE_FILE, "utf8"));
  const agent = createHttpSession(BASE);

  const si = await agent.api("POST", "/api/auth/sign-in/email", {
    email: state.email,
    password: state.password,
  });
  if (!si.res.ok) fail(`sign-in (${si.res.status})`, si.text.slice(0, 200));
  const active = await agent.api("POST", "/api/auth/organization/set-active", {
    organizationId: state.organizationId,
  });
  if (active.res.status !== 200) fail(`set-active (${active.res.status})`, active.text.slice(0, 200));

  const book = await agent.api("POST", "/api/trpc/workspace.booking.book", {
    itineraryId: state.itineraryId,
    quoteRowIds: state.quoteRowIds,
  });
  const booked = book.json?.result?.data;
  if (booked?.status !== "confirmed") fail(`book status=${booked?.status ?? "no-status"}`, book.text.slice(0, 400));
  const confirmed = booked.components.filter((c) => c.outcome === "confirmed").length;
  console.log(`BOOK_CONFIRMED status=${booked.status} components=${confirmed}/${state.quoteRowIds.length}`);
} else if (mode === "book-race") {
  // seed-0005d: two CONCURRENT booking attempts for the same saved holds —
  // exactly one may win (FR-009 reserve-then-book); the loser is refused with
  // `already_consumed` on every component and records nothing.
  const state = JSON.parse(readFileSync(STATE_FILE, "utf8"));
  const signIn = async () => {
    const agent = createHttpSession(BASE);
    const si = await agent.api("POST", "/api/auth/sign-in/email", {
      email: state.email,
      password: state.password,
    });
    if (!si.res.ok) fail(`sign-in (${si.res.status})`, si.text.slice(0, 200));
    const active = await agent.api("POST", "/api/auth/organization/set-active", {
      organizationId: state.organizationId,
    });
    if (active.res.status !== 200) fail(`set-active (${active.res.status})`, active.text.slice(0, 200));
    return agent;
  };
  const [agentA, agentB] = await Promise.all([signIn(), signIn()]);
  const book = (agent) =>
    agent.api("POST", "/api/trpc/workspace.booking.book", {
      itineraryId: state.itineraryId,
      quoteRowIds: state.quoteRowIds,
    });
  const [ra, rb] = await Promise.all([book(agentA), book(agentB)]);
  const oa = ra.json?.result?.data;
  const ob = rb.json?.result?.data;
  if (!oa?.status || !ob?.status) fail("book-race responses", `${ra.text.slice(0, 200)}\n${rb.text.slice(0, 200)}`);
  const statuses = [oa.status, ob.status].sort();
  if (!(statuses[0] === "confirmed" && statuses[1] === "failed"))
    fail(`race statuses=[${statuses.join(",")}] want exactly one winner [confirmed,failed]`);
  const loser = oa.status === "failed" ? oa : ob;
  const refusals = loser.components.filter((c) => c.outcome === "failed" && c.reason === "already_consumed").length;
  if (refusals !== state.quoteRowIds.length)
    fail(`loser refusals=${refusals}/${state.quoteRowIds.length}`, JSON.stringify(loser.components).slice(0, 300));
  console.log(`RACE_ONE_WINNER statuses=confirmed+failed loserRefusals=${refusals}/${state.quoteRowIds.length}`);
} else {
  fail("usage: node tests/integration/uat-fresh-process.mjs quote|book|book-race");
}
