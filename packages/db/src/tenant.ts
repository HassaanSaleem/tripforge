// Tenant scoping primitive (INV-004). Every tenant-owned table carries the owning
// `agencyId` (= organization.id) and every query path filters by it. This helper
// makes the filter a named, reusable concept so a handler cannot "forget" tenancy
// — later seeds build their scoped queries on top of it.
import { eq, and, type SQL, type Column } from "drizzle-orm";

/** Build the tenant predicate for a table's agencyId column. */
export function tenantScope(agencyIdColumn: Column, agencyId: string): SQL {
  const predicate = eq(agencyIdColumn, agencyId);
  return predicate;
}

/** Combine the tenant predicate with additional conditions (AND). */
export function scopedWhere(agencyIdColumn: Column, agencyId: string, ...rest: Array<SQL | undefined>): SQL | undefined {
  return and(tenantScope(agencyIdColumn, agencyId), ...rest);
}
