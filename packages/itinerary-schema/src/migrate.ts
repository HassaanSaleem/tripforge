// Migration convention (FR-002, INV-002). One SCHEMA_VERSION source of truth, a
// registry of PURE old→new migrators, and strict rejection of any unknown version —
// never a silent accept. Any future shape change bumps SCHEMA_VERSION, adds a
// migrator here, records a From→To note in that feature's plan, and is OPERATOR-GATED
// (ALWAYS-HALT) — the loop proposes, the owner authorizes the bump.
import { ItinerarySchema, SCHEMA_VERSION, type Itinerary } from "./itinerary.js";

export { SCHEMA_VERSION };

/** A pure old→new upgrade. Takes an unknown (unvalidated) value and reshapes it. */
type Migrator = (input: unknown) => unknown;

// Worked example + safety net (plan.md From→To): the "0.0.0" stub carried only
// { schemaVersion, id, agencyId, title, provenance }. v0 adds currency + days +
// media + pricing. No "0.0.0" data was ever persisted, so this is the convention's
// example, not a data backfill. The stub had no currency, so the upgrade settles it
// to "USD" with a zero-total pricing block (kept currency-consistent, FR-008).
export function upgradeFrom000(input: unknown): unknown {
  const stub = (input ?? {}) as Record<string, unknown>;
  const currency = "USD";
  return {
    schemaVersion: SCHEMA_VERSION,
    id: stub.id,
    agencyId: stub.agencyId,
    title: stub.title,
    currency,
    days: [],
    media: [],
    pricing: {
      budgetMode: "target",
      total: { amountMinor: 0, currency },
      categories: [],
    },
    provenance: stub.provenance ?? { rebrandLineage: [] },
  };
}

const MIGRATORS: Record<string, Migrator> = {
  "0.0.0": upgradeFrom000,
};

/**
 * Parse-and-validate an unknown value into a canonical Itinerary. If the input
 * declares an older, registered schemaVersion it is migrated first; an unknown
 * version is rejected (no silent accept). Strict validation rejects unknown fields.
 */
export function parseItinerary(input: unknown): Itinerary {
  const version = (input as { schemaVersion?: string } | null | undefined)?.schemaVersion;
  if (version && version !== SCHEMA_VERSION) {
    const up = MIGRATORS[version];
    if (!up) {
      throw new Error(`unknown itinerary schemaVersion: ${version}`);
    }
    input = up(input);
  }
  return ItinerarySchema.parse(input);
}
