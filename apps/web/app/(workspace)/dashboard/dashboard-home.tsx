// Agent Home dashboard (spec 017 contract §4) — client component driving the
// new agent-gated workspace.dashboard.stats read through the typed browser
// tRPC client. Every stat tile renders a correct value whether the agency is
// fresh (all-zero/empty) or populated (FR-003); currency totals pass through
// formatCurrencyTotals/formatMinorAmount only — zero client-side money
// arithmetic (FR-011). Presentation rides the seed-0009s theme kit (.tf-*).
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { trpc, type DashboardStatsOutput } from "../../../lib/trpc/client.js";
import { formatCreatedDate } from "../../../lib/itinerary-list.js";
import { formatCurrencyTotals, dashboardStatsErrorMessage } from "../../../lib/dashboard-stats.js";

type StatsState =
  | { phase: "loading" }
  | { phase: "loaded"; stats: DashboardStatsOutput }
  | { phase: "failed"; message: string };

export function DashboardHome() {
  const [state, setState] = useState<StatsState>({ phase: "loading" });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const stats = await trpc.workspace.dashboard.stats.query();
        if (!cancelled) setState({ phase: "loaded", stats });
      } catch (error) {
        if (!cancelled) setState({ phase: "failed", message: dashboardStatsErrorMessage(error) });
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="tf-dashboard" data-testid="dashboard-home">
      <section className="tf-card" data-testid="dashboard-stats">
        <p className="tf-eyebrow">Agent Home</p>
        <h2>At a glance</h2>

        {state.phase === "loading" ? (
          <p className="tf-trip-note" aria-live="polite">
            Loading your stats…
          </p>
        ) : null}
        {state.phase === "failed" ? <p role="alert">{state.message}</p> : null}
        {state.phase === "loaded" ? (
          <div className="tf-stat-grid">
            <StatTile label="GBV" value={formatCurrencyTotals(state.stats.gbvByCurrency)} testId="stat-gbv" />
            <StatTile
              label="Earnings"
              value={formatCurrencyTotals(state.stats.earningsByCurrency)}
              testId="stat-earnings"
            />
            <StatTile label="Active trips" value={String(state.stats.activeTripCount)} testId="stat-trips" />
            <StatTile label="Listings" value={String(state.stats.listingCount)} testId="stat-listings" />
            <StatTile label="Licenses" value={String(state.stats.licenseCount)} testId="stat-licenses" />
          </div>
        ) : null}
      </section>

      <section className="tf-card tf-activity" data-testid="dashboard-activity">
        <p className="tf-eyebrow">Recent activity</p>
        <h2>What's happened lately</h2>
        {state.phase === "loaded" && state.stats.recentActivity.length === 0 ? (
          <p className="tf-trip-note" data-testid="activity-empty">
            Nothing yet — draft a trip in the AI Builder, or license one on the marketplace.
          </p>
        ) : null}
        {state.phase === "loaded" && state.stats.recentActivity.length > 0 ? (
          <ul className="tf-activity-list" data-testid="activity-list">
            {state.stats.recentActivity.map((entry, index) => (
              <li key={`${entry.kind}-${entry.occurredAt}-${index}`} className="tf-activity-row">
                <span>{entry.label}</span>
                <time dateTime={entry.occurredAt}>{formatCreatedDate(entry.occurredAt)}</time>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="tf-quick-actions" aria-label="Quick actions">
        <Link href="/workspace" className="tf-card tf-quick-action" data-testid="quick-action-plan">
          <b>Start a new trip</b>
          <span>Describe a trip and let the AI Builder draft a budget-fit itinerary.</span>
        </Link>
        <Link href="/marketplace" className="tf-card tf-quick-action" data-testid="quick-action-marketplace">
          <b>Browse marketplace</b>
          <span>License a proven trip from another agency as a white-label copy.</span>
        </Link>
      </section>
    </div>
  );
}

function StatTile({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <div className="tf-stat-tile" data-testid={testId}>
      <span className="tf-eyebrow">{label}</span>
      <b className="tf-price">{value}</b>
    </div>
  );
}
