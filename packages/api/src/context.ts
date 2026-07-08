// Request context (application layer). The SessionContext is derived by the app
// from the Better Auth session + active organization — packages/api never touches
// Better Auth's runtime types, so it is unit-testable with a plain object.
import type {
  ActivityPort,
  CarRentalPort,
  HotelPort,
  TransferPort,
} from "@tripforge/supply-adapter";
import type { LLMPort } from "@tripforge/llm";
import type { Db } from "@tripforge/db";
import type { ExchangeRate } from "@tripforge/domain";

/** Agency org role (architecture §1.4) — kept to three at MVP. */
export type AgencyRole = "owner" | "admin" | "member";

/**
 * The identity a procedure authorizes against (INV-023). An AGENT has an `agencyId`
 * (the tenant, = organization.id — INV-004) and an `agencyRole`. A TRAVELER is a
 * standalone user with neither. Absence of a verified agency ⇒ not an agent ⇒
 * workspace denied (least privilege).
 */
export interface SessionContext {
  userId: string;
  agencyId?: string;
  agencyRole?: AgencyRole;
}

/** An agent session, after the workspace middleware has proven agency membership. */
export interface AgentSessionContext extends SessionContext {
  agencyId: string;
  agencyRole: AgencyRole;
}

/**
 * Composition root (clean-arch: "one composition root, in the api package"). Ports
 * and adapters are injected here — handlers receive them, never construct them. `db`
 * is optional so pure application/RBAC tests need no database.
 */
export interface Container {
  hotel: HotelPort;
  activity: ActivityPort;
  transfer: TransferPort;
  carRental: CarRentalPort;
  llm: LLMPort;
  /** Fixed deterministic table at P0 (spec 005 research D8); conversions are
   * explicit, recorded operations (INV-009). */
  rates: readonly ExchangeRate[];
  db?: Db;
}

export interface TrpcContext {
  session: SessionContext | null;
  container: Container;
}

export interface CreateContextArgs {
  session: SessionContext | null;
  container: Container;
}

export function createContext(args: CreateContextArgs): TrpcContext {
  return { session: args.session, container: args.container };
}
