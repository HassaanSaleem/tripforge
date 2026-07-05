// Public surface of @tripforge/db — Drizzle schema + client + tenant helpers.
export { createDb } from "./client.js";
export type { Db, DbHandle } from "./client.js";
export {
  schema,
  user,
  session,
  account,
  verification,
  organization,
  member,
  invitation,
} from "./schema.js";
export type { Schema } from "./schema.js";
export { tenantScope, scopedWhere } from "./tenant.js";
export { getMemberRole } from "./membership.js";
