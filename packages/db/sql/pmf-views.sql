-- PMF metric read models (spec 004, FR-009; Constitution "PMF instrumentation
-- is mandatory from v1", PRD §12). Applied by scripts/apply-views.mjs as part
-- of the migrate one-shot, so every migrated environment has the metrics.
--
-- Idempotent DROP + CREATE (not CREATE OR REPLACE): views hold no data, and
-- DROP+CREATE survives column renames/reorders that OR REPLACE rejects.
--
-- Money discipline (INV-009): every monetary aggregate is grouped by currency —
-- never summed across currencies. Amounts are integer minor units (bigint).

DROP VIEW IF EXISTS pmf_gbv;
CREATE VIEW pmf_gbv AS
SELECT currency,
       SUM(amount_minor)::bigint AS gbv_minor,
       COUNT(*)                  AS bookings
FROM pmf_event
WHERE type = 'booking_confirmed'
GROUP BY currency;

-- Active agent (v0 definition, spec Assumptions): an agency with >= 1
-- take_rate_accrued event in that currency. Integer floor division — a
-- reporting convention (precision loss <= 1 minor unit), not a ledger value.
DROP VIEW IF EXISTS pmf_take_rate_per_active_agent;
CREATE VIEW pmf_take_rate_per_active_agent AS
SELECT currency,
       SUM(amount_minor)::bigint AS revenue_minor,
       COUNT(DISTINCT agency_id) AS active_agents,
       (SUM(amount_minor) / COUNT(DISTINCT agency_id))::bigint
                                 AS revenue_minor_per_active_agent
FROM pmf_event
WHERE type = 'take_rate_accrued'
GROUP BY currency;

DROP VIEW IF EXISTS pmf_resold_vs_self_built;
CREATE VIEW pmf_resold_vs_self_built AS
SELECT COUNT(*) FILTER (WHERE source = 'licensed')   AS resold_trips,
       COUNT(*) FILTER (WHERE source = 'self_built') AS self_built_trips
FROM pmf_event
WHERE type = 'trip_created';

-- A trip (plan) converts when at least one booking is confirmed against its
-- itinerary (PRD §9.1 — the itinerary IS the plan).
DROP VIEW IF EXISTS pmf_plan_to_book;
CREATE VIEW pmf_plan_to_book AS
SELECT (SELECT COUNT(*) FROM pmf_event WHERE type = 'trip_created')  AS trips_created,
       (SELECT COUNT(DISTINCT itinerary_id) FROM pmf_event
         WHERE type = 'booking_confirmed')                            AS trips_booked;
