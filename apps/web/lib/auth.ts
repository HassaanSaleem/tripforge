// Better Auth server (architecture §1.3): Postgres via the Drizzle adapter, the
// organization plugin (agency = org, roles owner/admin/member), email verification
// through mailpit locally. This module also derives the app's SessionContext from a
// Better Auth session + active organization — the ONLY place the Better Auth runtime
// type is touched; packages/api stays framework-agnostic and unit-testable.
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins";
import {
  schema,
  getMemberRole,
  getOrganizationName,
  getPrimaryMembership,
} from "@tripforge/db";
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
  databaseHooks: {
    session: {
      create: {
        // Auto-activate the user's (single) agency when a session is created
        // (spec 007 D1) so agent-gated procedures pass without a manual
        // "select agency" step. Serverless-correct (INV-028): the result
        // persists on the session ROW; nothing lives in process memory. Users
        // without a membership keep a traveler session (no active org).
        before: async (session) => {
          const membership = await getPrimaryMembership(db, session.userId);
          if (!membership) return;
          return {
            data: { ...session, activeOrganizationId: membership.organizationId },
          };
        },
      },
    },
  },
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

/** Display identity for the workspace greeting (spec 007 FR-006 / IMP-2). */
export interface WorkspaceIdentity {
  userName: string;
  agencyName: string;
  role: AgencyRole;
}

/**
 * Human-name identity for the workspace greeting — null unless the caller is a
 * verified agent (same ladder as getSessionContext; INV-023 is still enforced
 * per tRPC procedure — this helper is presentation, not authorization).
 */
export async function getWorkspaceIdentity(headers: Headers): Promise<WorkspaceIdentity | null> {
  const result = await auth.api.getSession({ headers });
  if (!result) return null;

  const activeOrganizationId = result.session.activeOrganizationId ?? undefined;
  if (!activeOrganizationId) return null;

  const role = (await getMemberRole(db, activeOrganizationId, result.user.id)) as
    | AgencyRole
    | undefined;
  if (!role) return null;

  const agencyName = await getOrganizationName(db, activeOrganizationId);
  return {
    userName: result.user.name,
    agencyName: agencyName ?? "Your agency",
    role,
  };
}
