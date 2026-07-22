// Kitchen Loop iteration-11 T3 Frontier scenario: the traveler at group travel.
//
// GOAL.md Deliverable 2.5/2.6 asks for a two-sided consumer group-trip surface:
// a signed-in traveler should be able to browse joinable group departures,
// create/post a group with friends, invite friends, chat in the group, require
// all parties to confirm before finalization, and join an agent-hosted
// departure. This script documents the current frontier rather than building it.
//
// Finding witnessed at the API boundary:
//   1. workspace.groupTravel.post/cancel/browse/join are all agentProcedure.
//      A traveler session is FORBIDDEN from every one of them, and the refusal
//      lands in the auth middleware BEFORE any resolver/DB access (agentProcedure
//      throws on the missing agencyId) — so the boundary holds regardless of
//      whether a real departure exists; no arrange step is needed to prove it.
//   2. groupTravel.join is not a traveler join action: the agent actor joins a
//      seat on behalf of travelerName/travelerEmail. The named traveler is data,
//      not the authenticated caller (see joinGroupDepartureInputSchema).
//   3. There is no clientView group-travel procedure for browse, create/post,
//      invite, chat, all-party confirmation, or joining an agent-hosted
//      departure. Those attempts resolve as missing tRPC procedures (NOT_FOUND).
//
// This is a T3 gap-analysis witness, not a feature build. It runs against the
// booted compose image and re-proves the boundary headlessly (real HTTP →
// parsed tRPC error envelope → typed code assertions). GOAL D2.5/D2.6 is the
// campaign's newest/thinnest deliverable; this file flips green the day a
// traveler-authenticated group-trip surface (clientView group-travel) lands.
//
// Usage: docker compose up --build --wait
//        BASE_URL=http://localhost:3000 node scenarios/incubating/traveler-group-trip-attempt/scenario.mjs
//
// KITCHENLOOP-COVERAGE-BEGIN
// [
//   { "feature": "trust", "platform": "api", "user_type": "client", "result": "pass", "iteration": 11, "tier": "T3", "note": "the group-travel trust boundary holds for a traveler: workspace.groupTravel.post/browse/join/cancel are all agentProcedure — an org-less signed-in traveler is refused FORBIDDEN in the auth middleware BEFORE any resolver/DB access, and an anonymous caller is UNAUTHORIZED. INV-024 holds for group departures exactly as it does for booking and marketplace (re-confirms iter-7 trust×api×client from the group-trip angle)." },
//   { "feature": "marketplace", "platform": "api", "user_type": "client", "result": "fail", "iteration": 11, "tier": "T3", "note": "GOAL D2.5/D2.6 consumer group-trip surface is absent: no clientView group-travel API for browsing joinable departures, traveler-created posts, invites, in-group chat, all-party confirmation, or traveler-authenticated join of an agent-hosted departure (each NOT_FOUND). The only join accepts travelerName/travelerEmail as agent-entered DATA, not the authenticated caller — the traveler is a passive name, never an actor. Compounds the broader consumer-marketplace-surface gap (browse/license also agent-only, see traveler-marketplace-attempt)." }
// ]
// KITCHENLOOP-COVERAGE-END

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const runId = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.error(`  FAIL ${name}${detail ? ` - ${detail}` : ""}`);
  }
}

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
      origin: BASE,
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
    /* HTML or empty - caller inspects text */
  }
  return { res, json, text };
}

async function trpcMutate(jar, proc, input) {
  const r = await api(jar, "POST", `/api/trpc/${proc}`, input);
  return { ...r, data: r.json?.result?.data ?? null, error: r.json?.error ?? null };
}

async function trpcQuery(jar, proc, input) {
  const qs = input === undefined ? "" : `?input=${encodeURIComponent(JSON.stringify(input))}`;
  const r = await api(jar, "GET", `/api/trpc/${proc}${qs}`);
  return { ...r, data: r.json?.result?.data ?? null, error: r.json?.error ?? null };
}

// tRPC's non-batched error envelope is { error: { code, message, data: { code,
// httpStatus, ... } } } where data.code is the STRING ("FORBIDDEN") and the
// top-level code is the numeric JSON-RPC code. Prefer the string; the HTTP
// status is a robust fallback (FORBIDDEN→403, UNAUTHORIZED→401, NOT_FOUND→404).
function errCode(r) {
  return r.error?.data?.code ?? (typeof r.error?.code === "string" ? r.error.code : null);
}
const isForbidden = (r) => errCode(r) === "FORBIDDEN" || r.res.status === 403;
const isUnauthorized = (r) => errCode(r) === "UNAUTHORIZED" || r.res.status === 401;
// A missing tRPC procedure returns no data and a NOT_FOUND / 404 error envelope
// (JSON) — but tolerate a bare non-2xx too, so the assertion holds even if the
// handler ever returns a non-JSON 404 for an unknown path.
const isMissingProcedure = (r) => r.data === null && (r.error !== null || !r.res.ok);

const DEPARTURE_ID = "3f1e9a52-7c44-4b8e-9a3e-2f60d1a0b9c1";
const ITINERARY_ID = "b7a3c9d0-1e2f-4a5b-8c6d-7e8f9a0b1c2d";

async function main() {
  console.log(`Traveler group-trip attempt scenario against ${BASE} (run ${runId})`);

  const traveler = new Map();
  const travelerEmail = `traveler-group-${runId}@example.test`;
  const signUp = await api(traveler, "POST", "/api/auth/sign-up/email", {
    email: travelerEmail,
    password: "traveler-group-pass-11",
    name: "Nadia Chen",
  });
  check("traveler: consumer sign-up succeeds", signUp.res.status === 200, `got ${signUp.res.status}`);

  const me = await trpcQuery(traveler, "clientView.me", undefined);
  check("traveler: the consumer is authenticated on the client surface", me.error === null && !!me.data, me.text.slice(0, 200));

  const browse = await trpcQuery(traveler, "workspace.groupTravel.browse", undefined);
  check(
    "gap: browsing group departures through workspace.groupTravel is FORBIDDEN to a traveler (D2.6 — can't even discover joinable departures)",
    browse.data === null && isForbidden(browse),
    `code=${errCode(browse)} status=${browse.res.status} text=${browse.text.slice(0, 200)}`,
  );

  const post = await trpcMutate(traveler, "workspace.groupTravel.post", {
    itineraryId: ITINERARY_ID,
    departureDate: "2026-11-01",
    capacity: 4,
    pricePerSeatMinor: 45_000,
  });
  check(
    "gap: traveler-created group posting is FORBIDDEN on the only post procedure (D2.5 — a traveler cannot organize a group)",
    post.data === null && isForbidden(post),
    `code=${errCode(post)} status=${post.res.status} text=${post.text.slice(0, 200)}`,
  );

  const join = await trpcMutate(traveler, "workspace.groupTravel.join", {
    departureId: DEPARTURE_ID,
    travelerName: "Nadia Chen",
    travelerEmail,
  });
  check(
    "gap: traveler-authenticated join is FORBIDDEN; current join is agent-on-behalf-of-client only (D2.6)",
    join.data === null && isForbidden(join),
    `code=${errCode(join)} status=${join.res.status} text=${join.text.slice(0, 200)}`,
  );

  const cancel = await trpcMutate(traveler, "workspace.groupTravel.cancel", { departureId: DEPARTURE_ID });
  check(
    "boundary: traveler cannot cancel a group departure through workspace.groupTravel",
    cancel.data === null && isForbidden(cancel),
    `code=${errCode(cancel)} status=${cancel.res.status} text=${cancel.text.slice(0, 200)}`,
  );

  const anonymous = new Map();
  const anonymousBrowse = await trpcQuery(anonymous, "workspace.groupTravel.browse", undefined);
  check(
    "boundary: anonymous group-travel browse is UNAUTHORIZED, distinct from traveler FORBIDDEN",
    anonymousBrowse.data === null && isUnauthorized(anonymousBrowse),
    `code=${errCode(anonymousBrowse)} status=${anonymousBrowse.res.status} text=${anonymousBrowse.text.slice(0, 200)}`,
  );

  for (const [name, call] of [
    ["browse group departures", () => trpcQuery(traveler, "clientView.groupTravel.browse", undefined)],
    ["create/post group", () => trpcMutate(traveler, "clientView.groupTravel.post", { title: "Friends in Lisbon" })],
    ["invite friends", () => trpcMutate(traveler, "clientView.groupTravel.invite", { departureId: DEPARTURE_ID, email: "friend@example.test" })],
    ["in-group chat", () => trpcMutate(traveler, "clientView.groupTravel.chat", { departureId: DEPARTURE_ID, message: "Who is in?" })],
    ["all-party confirm", () => trpcMutate(traveler, "clientView.groupTravel.confirm", { departureId: DEPARTURE_ID })],
    ["join agent-hosted departure", () => trpcMutate(traveler, "clientView.groupTravel.join", { departureId: DEPARTURE_ID })],
  ]) {
    const result = await call();
    check(
      `gap: clientView has no group-travel procedure for ${name}`,
      isMissingProcedure(result),
      `status=${result.res.status} data=${JSON.stringify(result.data)} error=${JSON.stringify(result.error)?.slice(0, 180)}`,
    );
  }

  if (failures) {
    console.error(`\n${failures} failure(s)`);
    process.exit(1);
  }
  console.log("\nPASS: traveler group-trip frontier documented; no consumer group-travel API exists yet.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
