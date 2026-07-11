// Kitchen Loop iteration-3 FOURTH ideate pass (T2 Composition; itinerary-builder
// crossed with booking; platforms web+api; user_type under test: client, arranged
// by an agent-seller): the traveler reads the SAME share link across the trip's
// life — un-booked draft (all estimates), then partially booked at one markup,
// then a second booking generation at a DIFFERENT markup — and every price the
// client sees must be exactly what spec 013 pins: booked items priced from their
// own booking record and presented as confirmed, un-booked items kept as
// visually-distinct estimates, one server-side integer fold, and a traveler
// payload structurally free of net/markup/supplier/tenant data (FR-001..005).
//
// Novel seams vs the existing e2e/UAT coverage (which book the FULL trip in one
// generation): partial selection, two booking generations at different markups
// on one trip, holds-never-booked staying invisible to the traveler, and the
// estimate→confirmed transition of a single link over time.
//
// L3-style, 4-layer: real requests against the built compose image, parsed
// responses, STATE-DELTA assertions against compose Postgres (booking_component
// per-item sells, markup_ledger conservation, booking generations).
//
// Usage: docker compose up --build --wait
//        BASE_URL=http://localhost:3000 node scenarios/incubating/partially-booked-client-view/scenario.mjs
// Exit 0 = full journey passes; non-zero = a real failure.

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

/** Minimal cookie jar (same shape as golden-path-trade-live). */
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
  return { ...r, data: r.json?.result?.data ?? null };
}
/** tRPC query over HTTP (GET, ?input= JSON). */
async function trpcQuery(jar, proc, input) {
  const qs = input === undefined ? "" : `?input=${encodeURIComponent(JSON.stringify(input))}`;
  const r = await api(jar, "GET", `/api/trpc/${proc}${qs}`);
  return { ...r, data: r.json?.result?.data ?? null };
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
  destination: "Barcelona",
  checkIn: "2026-09-10",
  checkOut: "2026-09-13",
  party: { adults: 2, children: 0 },
  tripStyle: "balanced",
  budget: { mode: "hardCap", amountMinor: 100_000, currency: "USD" },
};
const FIRST_MARKUP_BPS = 2200; // first booking generation
const SECOND_MARKUP_BPS = 2500; // "book the rest later" at a different markup
const FIRST_BATCH_SIZE = 3; // book only the first 3 quoted items, leave the rest

/** Formats integer minor units the way the share page does (e.g. 15250 → "152.50"). */
const fmt = (minor) => (minor / 100).toFixed(2);

/** Recursively collect every object key in the traveler payload. */
function collectKeys(node, keys = new Set()) {
  if (Array.isArray(node)) node.forEach((n) => collectKeys(n, keys));
  else if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      keys.add(k);
      collectKeys(v, keys);
    }
  }
  return keys;
}

async function main() {
  console.log(`Partially-booked client-view scenario against ${BASE} (run ${runId})`);

  // ── Agent-seller arranges the trip ────────────────────────────────────────
  const jar = new Map();
  const signUp = await api(jar, "POST", "/api/auth/sign-up/email", {
    email: `agent-${runId}@example.test`,
    password: "partial-booker-pass-7",
    name: "Scenario Agent",
  });
  check("agent: sign-up succeeds", signUp.res.status === 200, `got ${signUp.res.status}`);
  const agencyName = `Partial Booking Co ${runId}`;
  const org = await api(jar, "POST", "/api/auth/organization/create", {
    name: agencyName,
    slug: `partial-${runId}`,
  });
  const orgId = org.json?.id ?? org.json?.organization?.id;
  check("agent: agency created", !!orgId, org.text.slice(0, 200));
  await api(jar, "POST", "/api/auth/organization/set-active", { organizationId: orgId });

  const draft = await trpcMutate(jar, "workspace.itinerary.draft", TRIP);
  const itineraryId = draft.data?.itinerary?.id;
  check("agent: AI draft persists an itinerary", draft.data?.status === "drafted" && !!itineraryId, draft.text.slice(0, 300));

  // Stored per-item draft prices — the traveler's "estimate" source of truth.
  const doc = await trpcQuery(jar, "workspace.itinerary.get", { itineraryId });
  const docItems = (doc.data?.itinerary?.days ?? []).flatMap((d) => d.items ?? []);
  const storedMinor = new Map(
    docItems.filter((i) => i.pricing?.sellPrice).map((i) => [i.id, i.pricing.sellPrice.amountMinor]),
  );
  check("agent: draft document has priced items to work with", storedMinor.size >= 4, `only ${storedMinor.size} priced items`);

  const share = await trpcMutate(jar, "workspace.itinerary.share", { itineraryId });
  const token = share.data?.token;
  check("agent: share link minted", share.data?.status === "shared" && !!token, share.text.slice(0, 200));

  const anon = new Map(); // the traveler has no session — ever

  // ── Life stage 1: un-booked draft — everything is an estimate (US3/SC-004) ─
  {
    const view = await trpcQuery(anon, "clientView.itinerary", { token });
    const v = view.data?.view;
    check("client(unbooked): token resolves anonymously", view.data?.status === "found" && !!v, view.text.slice(0, 300));
    const items = (v?.days ?? []).flatMap((d) => d.items);
    check(
      "client(unbooked): nothing claims to be confirmed — every item booked:false",
      items.length > 0 && items.every((i) => i.booked === false),
      JSON.stringify(items.map((i) => i.booked)),
    );
    const expectedTotal = [...storedMinor.values()].reduce((a, b) => a + b, 0);
    check(
      `client(unbooked): total is exactly the stored document fold (${expectedTotal})`,
      v?.totalSellMinor === expectedTotal,
      `got ${v?.totalSellMinor}`,
    );
  }

  // ── First booking generation: PARTIAL selection at 22% ────────────────────
  const quote1 = await trpcMutate(jar, "workspace.booking.quote", {
    itineraryId,
    markupBps: FIRST_MARKUP_BPS,
  });
  const held1 = (quote1.data?.items ?? []).filter((i) => i.outcome === "held");
  check(
    `agent: first quote holds every priced item (${storedMinor.size})`,
    quote1.data?.status === "quoted" && held1.length === storedMinor.size,
    `held ${held1.length}`,
  );

  const firstBatch = held1.slice(0, FIRST_BATCH_SIZE);
  const restItemIds = new Set(held1.slice(FIRST_BATCH_SIZE).map((i) => i.itemId));
  const book1 = await trpcMutate(jar, "workspace.booking.book", {
    itineraryId,
    quoteRowIds: firstBatch.map((i) => i.quote.quoteRowId),
  });
  const confirmed1 = (book1.data?.components ?? []).filter((c) => c.outcome === "confirmed");
  check(
    `agent: booking the ${FIRST_BATCH_SIZE}-item subset confirms exactly those items`,
    book1.data?.status === "confirmed" && confirmed1.length === FIRST_BATCH_SIZE,
    book1.text.slice(0, 300),
  );
  const bookedSell1 = new Map(firstBatch.map((i) => [i.itemId, i.quote.sellMinor]));

  // ── Life stage 2: partially booked — confirmed vs estimates (US2/FR-002/004)
  {
    const view = await trpcQuery(anon, "clientView.itinerary", { token });
    const v = view.data?.view;
    const items = (v?.days ?? []).flatMap((d) => d.items);
    // Items are projected in document order with no ids (trust boundary), so key
    // the assertions off the same order the document declares.
    const orderedDocIds = docItems.map((i) => i.id);
    let expectedTotal = 0;
    items.forEach((it, idx) => {
      const docId = orderedDocIds[idx];
      if (bookedSell1.has(docId)) {
        check(
          `client(partial): item ${idx + 1} is booked at ITS booking's sell ${bookedSell1.get(docId)} (never the stored draft price)`,
          it.booked === true && it.sellMinor === bookedSell1.get(docId),
          `got booked=${it.booked} sellMinor=${it.sellMinor}`,
        );
        expectedTotal += bookedSell1.get(docId);
      } else {
        check(
          `client(partial): item ${idx + 1} stays an un-booked estimate at the stored price ${storedMinor.get(docId)}`,
          it.booked === false && it.sellMinor === storedMinor.get(docId),
          `got booked=${it.booked} sellMinor=${it.sellMinor}`,
        );
        expectedTotal += storedMinor.get(docId) ?? 0;
      }
    });
    check(
      `client(partial): total folds booked sells + stored estimates once (${expectedTotal}, FR-002)`,
      v?.totalSellMinor === expectedTotal,
      `got ${v?.totalSellMinor}`,
    );

    // The share PAGE distinguishes the two price presentations (FR-004) and
    // stays white-labeled (INV-020) with no net-rate strings (FR-005/SC-002).
    const page = await fetch(`${BASE}/view/${token}`).then((r) => r.text());
    const rendered = page.split("self.__next_f")[0]; // SSR body, before the RSC stream
    check("client(partial): page marks un-booked prices as estimates", /estimate/.test(rendered), "no estimate tag");
    check("client(partial): page total is honest that it includes estimates", /includes estimates/.test(rendered), "no qualifier on the total");
    check("client(partial): page shows Booked marks for confirmed items", /Booked/.test(rendered), "no Booked mark");
    check("client(partial): page never names the platform (INV-020)", !/TripForge|Trellis/.test(rendered), "platform brand leaked");
    for (const [itemId, sell] of bookedSell1) {
      const net = held1.find((i) => i.itemId === itemId)?.quote.netMinor;
      if (net !== undefined && net !== sell && fmt(net) !== fmt(sell)) {
        const netStr = fmt(net);
        const collidesWithEstimate = [...storedMinor.entries()].some(
          ([otherId, stored]) => !bookedSell1.has(otherId) && fmt(stored) === netStr,
        );
        if (!collidesWithEstimate) {
          check(
            `client(partial): booked item's net rate ${netStr} appears nowhere on the page (SC-002)`,
            !rendered.includes(netStr),
            "net-rate string rendered to the traveler",
          );
        }
      }
    }
  }

  // ── Second booking generation: the rest is quoted LATER at 25% ────────────
  const quote2 = await trpcMutate(jar, "workspace.booking.quote", {
    itineraryId,
    markupBps: SECOND_MARKUP_BPS,
  });
  const held2 = (quote2.data?.items ?? []).filter((i) => i.outcome === "held");
  check(
    "agent: re-quote holds ONLY the un-booked items (booked ones are exclusivity-protected, spec 005 FR-016)",
    held2.length === restItemIds.size && held2.every((i) => restItemIds.has(i.itemId)),
    `held ${JSON.stringify(held2.map((i) => i.itemId))} expected ${JSON.stringify([...restItemIds])}`,
  );

  // Book exactly ONE of them; the remaining holds must never reach the traveler.
  const second = held2[0];
  const book2 = await trpcMutate(jar, "workspace.booking.book", {
    itineraryId,
    quoteRowIds: [second.quote.quoteRowId],
  });
  check(
    "agent: second-generation single-item booking confirms",
    book2.data?.status === "confirmed" &&
      (book2.data?.components ?? []).filter((c) => c.outcome === "confirmed").length === 1,
    book2.text.slice(0, 300),
  );

  // ── Life stage 3: two booking generations at different markups ────────────
  {
    const view = await trpcQuery(anon, "clientView.itinerary", { token });
    const v = view.data?.view;
    const items = (v?.days ?? []).flatMap((d) => d.items);
    const orderedDocIds = docItems.map((i) => i.id);
    const idx2 = orderedDocIds.indexOf(second.itemId);
    check(
      `client(two-gen): the 25%-generation item shows ITS OWN booked sell ${second.quote.sellMinor} (not a 22% figure, not the estimate)`,
      items[idx2]?.booked === true && items[idx2]?.sellMinor === second.quote.sellMinor,
      `got ${JSON.stringify(items[idx2])}`,
    );
    for (const [itemId, sell] of bookedSell1) {
      const i = orderedDocIds.indexOf(itemId);
      check(
        `client(two-gen): first-generation item ${i + 1} still shows its 22% sell ${sell}`,
        items[i]?.booked === true && items[i]?.sellMinor === sell,
        `got ${JSON.stringify(items[i])}`,
      );
    }
    const stillUnbooked = [...restItemIds].filter((id) => id !== second.itemId);
    for (const itemId of stillUnbooked) {
      const i = orderedDocIds.indexOf(itemId);
      check(
        `client(two-gen): held-but-never-booked item ${i + 1} stays an ESTIMATE (holds are invisible to travelers)`,
        items[i]?.booked === false && items[i]?.sellMinor === storedMinor.get(itemId),
        `got ${JSON.stringify(items[i])}`,
      );
    }
    const expectedTotal =
      [...bookedSell1.values()].reduce((a, b) => a + b, 0) +
      second.quote.sellMinor +
      stillUnbooked.reduce((a, id) => a + (storedMinor.get(id) ?? 0), 0);
    check(
      `client(two-gen): total folds both generations + estimates exactly (${expectedTotal})`,
      v?.totalSellMinor === expectedTotal,
      `got ${v?.totalSellMinor}`,
    );

    // Trust boundary, structurally (SC-002): the payload's key set is the
    // allowlist — nothing net/markup/supplier/tenant/provenance-shaped.
    const keys = [...collectKeys(view.data)];
    const forbidden = keys.filter((k) =>
      /net|markup|supplier|provenance|tenant|agencyId|orgId|quoteRow|hold|expires/i.test(k),
    );
    check(
      "client(two-gen): traveler payload keys are structurally clean of agent-side data (FR-005)",
      forbidden.length === 0,
      `forbidden keys: ${JSON.stringify(forbidden)}`,
    );
  }

  // ── State deltas: the platform's own money integers agree with the client ──
  const componentCount = psql(`SELECT count(*) FROM booking_component WHERE agency_id = '${orgId}'`);
  check(
    `db: exactly ${FIRST_BATCH_SIZE + 1} booking components exist (partial selection never over-books)`,
    componentCount === String(FIRST_BATCH_SIZE + 1),
    `got ${componentCount}`,
  );
  const bookingCount = psql(`SELECT count(*) FROM booking WHERE agency_id = '${orgId}' AND status = 'confirmed'`);
  check("db: the two generations are two confirmed bookings", bookingCount === "2", `got ${bookingCount}`);
  const violations = psql(
    `SELECT count(*) FROM markup_ledger WHERE agency_id = '${orgId}' AND net_minor + markup_minor <> sell_minor`,
  );
  check("db: markup ledger conserves net+markup=sell on every row", violations === "0", `${violations} violations`);
  const ledgerSells = psql(
    `SELECT string_agg(sell_minor::text, ',' ORDER BY sell_minor) FROM markup_ledger WHERE agency_id = '${orgId}'`,
  );
  const expectedSells = [...bookedSell1.values(), second.quote.sellMinor].sort((a, b) => a - b).join(",");
  check(
    "db: ledger sells are exactly the booked quote sells across both generations",
    ledgerSells === expectedSells,
    `ledger [${ledgerSells}] vs expected [${expectedSells}]`,
  );
  const componentSells = psql(
    `SELECT string_agg(sell_minor::text, ',' ORDER BY sell_minor) FROM booking_component WHERE agency_id = '${orgId}'`,
  );
  check(
    "db: booking_component sells (the client view's source of truth) match the ledger",
    componentSells === expectedSells,
    `components [${componentSells}] vs expected [${expectedSells}]`,
  );

  // ── Unknown token: typed unavailable state, no existence oracle ────────────
  const bogus = await trpcQuery(anon, "clientView.itinerary", { token: "00000000-0000-4000-8000-000000000000" });
  check(
    "client: unknown token resolves to the typed unavailable state",
    bogus.res.status === 200 && bogus.data?.status !== "found" && !bogus.data?.view,
    bogus.text.slice(0, 200),
  );

  console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("scenario crashed:", err);
  process.exit(1);
});
