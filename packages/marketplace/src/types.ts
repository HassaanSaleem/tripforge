// Shared marketplace flow types. The acting agency member is a PLAIN value —
// not the api session type — so this package never depends on packages/api
// (spec 006 research D1); the router narrows its session into this shape.
import type { Db } from "@tripforge/db";

export interface MarketplaceActor {
  /** Tenant scope (INV-004) — the caller's agency. */
  readonly agencyId: string;
  readonly userId: string;
}

/** Drizzle transaction handle as flows receive it inside db.transaction. */
export type DbTx = Parameters<Parameters<Db["transaction"]>[0]>[0];
