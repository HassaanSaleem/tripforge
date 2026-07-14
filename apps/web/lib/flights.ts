// Flights card pure logic (spec 026, ticket demo-10-flights-deeplink):
// deterministic, seeded indicative options + a generic external deep-link URL.
// DOM-free, no network call, no randomness (Constitution V — flights are
// deep-link only, never merchant-of-record; no real flight-search vendor is
// integrated). Lives in apps/web/lib (not packages/domain) to match this
// repo's existing convention for pure client-view logic — see
// specs/026-flights-deeplink/research.md.

export interface IndicativeFlightOption {
  airline: string;
  departureLabel: string;
  returnLabel: string;
  priceMinor: number;
  currency: string;
}

// Generic, fictional airline pool — matches the sandbox-supply convention of
// non-branded seed content (packages/supply-adapter/src/sandbox/hotel.ts's
// "{destination} Grand" style), never a real carrier's trademark.
const AIRLINE_POOL = [
  "Meridian Air",
  "Skyline Airways",
  "Northwind Airlines",
  "Coastal Jet",
  "Aurora Airlines",
  "Vantage Air",
] as const;

const DEPARTURE_TIMES = ["06:45", "08:15", "11:30", "14:05", "17:50", "20:10"] as const;

// Stable, non-cryptographic string hash (FNV-1a variant) — deterministic
// across processes/machines, unlike Math.random or object hashing.
function stableHash(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * 2-3 deterministic, seeded indicative flight options for a trip's
 * destination and dates (spec 026 FR-001/002/003/010). Never throws — an
 * empty or unusual destination string still yields a labeled fallback set
 * (spec Edge Cases). Never calls a network service; "indicative" only, never
 * a real-time fare (spec Assumptions).
 */
export function indicativeFlightOptions(
  destination: string,
  checkIn: string,
  checkOut: string,
  currency: string,
): IndicativeFlightOption[] {
  const label = destination.trim() || "your destination";
  const seed = stableHash(`${label.toLowerCase()}|${checkIn}|${checkOut}`);
  const optionCount = 2 + (seed % 2); // 2 or 3, deterministic per trip

  return Array.from({ length: optionCount }, (_, i) => {
    const optionSeed = stableHash(`${label.toLowerCase()}|${checkIn}|${checkOut}|${i}`);
    // `?? POOL[0]` (not a non-null assertion): computed indexing into a
    // fixed-length `as const` tuple is flagged `T | undefined` by
    // noUncheckedIndexedAccess even though the modulo keeps it in bounds;
    // POOL[0] on the same tuple is a literal index, so TS types it as the
    // exact element (never undefined) — a real, always-correct fallback.
    const airline = AIRLINE_POOL[optionSeed % AIRLINE_POOL.length] ?? AIRLINE_POOL[0];
    const departureTime = DEPARTURE_TIMES[optionSeed % DEPARTURE_TIMES.length] ?? DEPARTURE_TIMES[0];
    const returnTime = DEPARTURE_TIMES[(optionSeed >>> 4) % DEPARTURE_TIMES.length] ?? DEPARTURE_TIMES[0];
    // Indicative price band: 250-1200 in the trip's currency (minor units),
    // varied deterministically per option — never a real fare quote.
    const priceMinor = 25_000 + (optionSeed % 95_001);
    return {
      airline,
      departureLabel: checkIn ? `Departs ${checkIn}, ${departureTime}` : `Departs ${departureTime}`,
      returnLabel: checkOut ? `Returns ${checkOut}, ${returnTime}` : `Returns ${returnTime}`,
      priceMinor,
      currency,
    };
  });
}

/**
 * A generic external flight-search deep-link (spec 026 FR-004/FR-011): no
 * commercial partner integration exists yet, so this resolves to a real,
 * always-clickable public search entry point parameterized by destination and
 * dates only — no origin parameter, since no part of the product captures a
 * departure city today (spec Assumptions).
 */
export function buildFlightSearchUrl(destination: string, checkIn: string, checkOut: string): string {
  const label = destination.trim() || "flights";
  const query = `Flights to ${label} ${checkIn} - ${checkOut}`.trim();
  return `https://www.google.com/travel/flights?q=${encodeURIComponent(query)}`;
}
