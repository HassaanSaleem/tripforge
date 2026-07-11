// Kitchen Loop iteration-2 scenario (T1, feature=trust, platforms web+api,
// user_types agent-seller + client): a brand-new agent onboards against the LIVE
// stack — sign-up → agency (organization) creation → active org → workspace — and
// a client opens the branded view. No sign-in UI exists yet (seed-0008), so the
// Better Auth HTTP API is the only session-establishment path a user has.
//
// L3-style: runs against a real server (built compose image), dependency-free.
// 4-layer pattern: executes real requests, parses responses, and asserts STATE
// DELTAS — the same gated procedure (workspace.whoami) must flip from
// FORBIDDEN (fresh sign-up, no agency) to identity-with-agencyId (after org
// create + set-active), and two separately onboarded agents must land in
// DIFFERENT tenants (INV-004).
//
// Usage: BASE_URL=http://localhost:3000 node scenarios/incubating/agent-onboarding-live/scenario.mjs
// Exit 0 = full journey passes; non-zero = a real failure.

// KITCHENLOOP-COVERAGE-BEGIN
// [
//   { "feature": "trust", "platform": "api", "user_type": "agent-seller", "result": "pass", "iteration": 2, "tier": "T1", "note": "sign-up -> FORBIDDEN pre-membership -> org create/set-active -> whoami {agencyId, owner}; two tenants isolated (INV-004)" },
//   { "feature": "trust", "platform": "web", "user_type": "agent-seller", "result": "pass", "iteration": 4, "tier": "T1", "note": "live re-verify (seed-0031 bundle): anon /workspace membership prompt; authenticated /workspace greeting shows agency name + owner role" },
//   { "feature": "trust", "platform": "web", "user_type": "client", "result": "pass", "iteration": 4, "tier": "T1", "note": "live re-verify (seed-0031 bundle): BUG-2 (INV-020 /view tab title leak) fixed by seed-0011/seed-0012 confirmed still fixed -- was incorrectly still marked fail from iteration 2, the exact class of drift this ticket exists to prevent" }
// ]
// KITCHENLOOP-COVERAGE-END

const BASE = process.env.BASE_URL ?? "http://localhost:3000";

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

/** Minimal cookie jar: fold every Set-Cookie into a name→value map. */
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
      // Better Auth CSRF-checks the Origin on state-changing requests; a real
      // browser always sends it, so the scenario emulates that.
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
    /* HTML or empty — caller inspects text */
  }
  return { res, json, text };
}

/** Full onboarding for one brand-new user; returns their whoami-derived identity. */
async function onboardAgent(label, agencyName, agencySlug) {
  const jar = new Map();
  const email = `${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;

  // 1. Sign up (email/password) — the only session-establishment path today.
  const signUp = await api(jar, "POST", "/api/auth/sign-up/email", {
    email,
    password: "correct-horse-battery-staple-1",
    name: `Scenario Agent ${label}`,
  });
  check(`[${label}] sign-up succeeds (200)`, signUp.res.status === 200, `got ${signUp.res.status}: ${signUp.text.slice(0, 200)}`);
  check(`[${label}] sign-up establishes a session cookie`, jar.size > 0, "no Set-Cookie received");

  // 2. STATE BEFORE: a fresh user with no agency is a TRAVELER — the agent gate
  //    must reject them (INV-023 least privilege), not merely the anonymous case.
  const before = await api(jar, "GET", "/api/trpc/workspace.whoami");
  check(
    `[${label}] workspace.whoami is FORBIDDEN before agency membership`,
    before.res.status === 403,
    `expected 403, got ${before.res.status}: ${before.text.slice(0, 200)}`,
  );

  // 3. Create an agency (Better Auth organization plugin: agency = org).
  const org = await api(jar, "POST", "/api/auth/organization/create", {
    name: agencyName,
    slug: agencySlug,
  });
  check(`[${label}] agency (organization) creation succeeds`, org.res.status === 200, `got ${org.res.status}: ${org.text.slice(0, 200)}`);
  const orgId = org.json?.id ?? org.json?.organization?.id;
  check(`[${label}] created agency has an id`, !!orgId, org.text.slice(0, 200));

  // 4. Make it the active organization for the session.
  const active = await api(jar, "POST", "/api/auth/organization/set-active", {
    organizationId: orgId,
  });
  check(`[${label}] set-active organization succeeds`, active.res.status === 200, `got ${active.res.status}: ${active.text.slice(0, 200)}`);

  // 5. STATE AFTER: the SAME gated procedure now returns the agent identity with
  //    tenant scope (INV-004) — proves a real membership row exists and flowed
  //    through session → middleware → procedure on the live server.
  const after = await api(jar, "GET", "/api/trpc/workspace.whoami");
  check(`[${label}] workspace.whoami resolves after onboarding`, after.res.status === 200, `got ${after.res.status}: ${after.text.slice(0, 200)}`);
  const who = after.json?.result?.data;
  // NOTE: !!orgId guard matters — without it, undefined === undefined passes on a
  // fully failed onboarding (caught in this scenario's first live run).
  check(`[${label}] whoami reports the new agency as tenant scope`, !!orgId && who?.agencyId === orgId, JSON.stringify(who));
  check(`[${label}] founding agent holds the owner role`, who?.role === "owner", JSON.stringify(who));

  // 6. Web surface: /workspace greets the signed-in agent (INV-024 UX gate).
  // NOTE (seed-0031 backfill, live re-verify): the greeting copy this
  // assertion originally pinned ("Signed in as agent <id>") was redesigned by
  // seed-0008's IMP-2 fix to show human names instead of raw ids — now
  // `<b>{userName}</b> · {agencyName} · role {role}` (workspace/page.tsx).
  // Re-pinned on the agency name, which this scenario already tracks.
  const ws = await fetch(`${BASE}/workspace`, { headers: { cookie: cookieHeader(jar) } });
  const wsHtml = await ws.text();
  check(
    `[${label}] /workspace renders the agent greeting (agency name, owner role)`,
    ws.status === 200 && wsHtml.includes(agencyName) && wsHtml.includes("owner"),
    `status ${ws.status}`,
  );

  return { orgId, who };
}

async function main() {
  console.log(`Agent onboarding scenario against ${BASE}`);

  // 0. The front door: landing page is up and points at both surfaces.
  const landing = await fetch(`${BASE}/`);
  const landingHtml = await landing.text();
  check("landing page loads (200)", landing.status === 200, `got ${landing.status}`);
  check("landing links the workspace + client view", landingHtml.includes("/workspace") && landingHtml.includes("/view"));

  // 0b. Anonymous visitor at /workspace sees the membership prompt, never data.
  const anonWs = await fetch(`${BASE}/workspace`);
  const anonHtml = await anonWs.text();
  check("anonymous /workspace shows the sign-in prompt", anonHtml.includes("You need an agency membership"), "prompt copy not found");

  // 1–6. Two brand-new agents onboard end-to-end into SEPARATE agencies.
  const suffix = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  const a = await onboardAgent("alpha", "Alpha Voyages", `alpha-voyages-${suffix}`);
  const b = await onboardAgent("beta", "Beta Travel Co", `beta-travel-${suffix}`);

  // 7. Tenant isolation (INV-004): two independent onboardings land in two tenants.
  check(
    "the two agents live in DIFFERENT tenants (INV-004)",
    !!a.orgId && !!b.orgId && a.orgId !== b.orgId,
    `alpha=${a.orgId} beta=${b.orgId}`,
  );

  // 8. Client surface: branded view carries no platform branding (INV-020).
  const view = await fetch(`${BASE}/view`);
  const viewHtml = await view.text();
  check("client /view loads (200)", view.status === 200, `got ${view.status}`);
  check("client view shows the trip framing", viewHtml.includes("Your trip"));
  const bodyOnly = viewHtml.replace(/<script[\s\S]*?<\/script>/g, "");
  check(
    "client view leaks NO platform branding (INV-020)",
    !/TripForge|Trellis/i.test(bodyOnly),
    "found platform branding in client view markup",
  );

  if (failures > 0) {
    console.error(`\nScenario FAILED: ${failures} assertion(s) failed.`);
    process.exit(1);
  }
  console.log("\nScenario PASSED.");
}

main().catch((err) => {
  const code = err?.cause?.code || err?.code || "";
  if (/ECONNREFUSED|ENOTFOUND|ECONNRESET|EHOSTUNREACH|ETIMEDOUT/.test(code) || /fetch failed/i.test(String(err?.message))) {
    console.error(`FAIL: app not reachable at ${BASE}${code ? ` (${code})` : ""}`);
  } else {
    console.error("Scenario crashed:", err);
  }
  process.exit(1);
});
