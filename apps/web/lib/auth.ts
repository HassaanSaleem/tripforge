// Better Auth server (architecture §1.3): Postgres via the Drizzle adapter, the
// organization plugin (agency = org, roles owner/admin/member), email verification
// through mailpit locally. This module also derives the app's SessionContext from a
// Better Auth session + active organization — the ONLY place the Better Auth runtime
// type is touched; packages/api stays framework-agnostic and unit-testable.
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins";
import { schema, getMemberRole } from "@tripforge/db";
import { optionalEnv } from "@tripforge/shared";
import type { SessionContext, AgencyRole } from "@tripforge/api";
import { getDb } from "./db.js";

const { db } = getDb();

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema }),
  baseURL: optionalEnv("BETTER_AUTH_URL", "http://localhost:3000"),
  secret: optionalEnv("BETTER_AUTH_SECRET", "dev-only-insecure-secret-change-me"),
  emailAndPassword: { enabled: true },
  plugins: [organization()],
});

/**
 * Map a Better Auth session to the app SessionContext (INV-023/024). No session ⇒
 * null (anonymous). A session with an active organization + a member role ⇒ AGENT
 * (agencyId = organization.id, INV-004). Otherwise ⇒ TRAVELER (userId only). Absence
 * of a verified agency membership never yields agent privileges (least privilege).
 */
export async function getSessionContext(headers: Headers): Promise<SessionContext | null> {
  const result = await auth.api.getSession({ headers });
  if (!result) return null;

  const userId = result.user.id;
  const activeOrganizationId = result.session.activeOrganizationId ?? undefined;
  if (!activeOrganizationId) {
    return { userId };
  }

  const role = (await getMemberRole(db, activeOrganizationId, userId)) as AgencyRole | undefined;
  if (!role) return { userId };

  return { userId, agencyId: activeOrganizationId, agencyRole: role };
}
