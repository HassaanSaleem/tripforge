// The traveler's shared-itinerary page (spec 010 US1/US3, contract §3).
// WHITE-LABEL surface (INV-020/024): the agency's name is the brand carrier in
// body AND tab title; platform naming appears nowhere; no workspace affordances
// for any session state. Server component — the page renders exactly the
// redacted ClientItineraryView the public procedure returns (allowlist
// projection; agent-confidential values never reach this process's output),
// through the in-process caller over the same tRPC surface mobile will consume
// (INV-018, research D3). force-dynamic: a private, per-token view must never
// be cached or serve stale booked-state (INV-028 — the DB row is the state).
import { cache } from "react";
import type { Metadata } from "next";
import type { ClientViewItem } from "@tripforge/api";
import { getAnonymousCaller } from "../../../../lib/trpc/server.js";
import { formatMinorAmount } from "../../../../lib/planner-form.js";
import { itemKindLabel, scheduleLine } from "../../../../lib/client-view.js";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Per-request dedupe between generateMetadata and the page render (research
// D11). A non-uuid token is not_found WITHOUT touching the procedure.
const resolveView = cache(async (token: string) => {
  if (!UUID_RE.test(token)) return { status: "not_found" as const };
  return getAnonymousCaller().clientView.itinerary({ token });
});

interface PageProps {
  params: Promise<{ token: string }>;
}

// Neutral metadata for the unavailable state — platform naming FORBIDDEN either
// way (INV-020); unguessable links stay out of search indexes (FR-003).
const NOINDEX = { index: false, follow: false };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { token } = await params;
  const result = await resolveView(token);
  if (result.status !== "found") {
    return {
      title: "Your trip",
      description: "Your travel proposal and itinerary, shared by your travel agent.",
      robots: NOINDEX,
    };
  }
  return {
    title: `${result.view.title} — ${result.view.agencyName}`,
    description: `Your travel itinerary, shared by ${result.view.agencyName}.`,
    robots: NOINDEX,
  };
}

export default async function SharedItineraryPage({ params }: PageProps) {
  const { token } = await params;
  const result = await resolveView(token);

  if (result.status !== "found") {
    return (
      <div data-plain className="tf-client-root">
        <main>
          <section className="tf-card tf-client-unavailable">
            <h1>Your trip</h1>
            <p>
              This trip link isn&apos;t available. Ask your travel agent for a fresh
              link to your itinerary.
            </p>
          </section>
        </main>
      </div>
    );
  }

  const { view } = result;
  return (
    <div data-plain className="tf-client-root">
      <main>
        <header className="tf-client-head">
          <p className="tf-eyebrow">{view.agencyName}</p>
          <h1>{view.title}</h1>
          <p>Prepared for you by {view.agencyName}.</p>
          {view.totalSellMinor !== null ? (
            <p className="tf-client-total">
              Trip total{" "}
              <strong className="tf-price">
                {formatMinorAmount(view.totalSellMinor, view.currency)}
              </strong>
            </p>
          ) : null}
        </header>

        {view.days.length === 0 ? (
          <section className="tf-card">
            <p className="tf-empty-day">Your agent is still planning this trip.</p>
          </section>
        ) : (
          view.days.map((day) => (
            <article key={day.dayNumber} className="tf-card tf-day">
              <div className="tf-day-head">
                <h2>
                  Day {day.dayNumber}
                  {day.date ? ` — ${day.date}` : ""}
                </h2>
              </div>
              {day.items.length === 0 ? (
                <p className="tf-empty-day">A free day — nothing scheduled yet.</p>
              ) : (
                <ul className="tf-items tf-client-items">
                  {day.items.map((item, index) => (
                    <ItemRow key={index} item={item} currency={view.currency} />
                  ))}
                </ul>
              )}
            </article>
          ))
        )}

        <footer className="tf-client-foot">
          <small>Shared with you by {view.agencyName}.</small>
        </footer>
      </main>
    </div>
  );
}

function ItemRow({ item, currency }: { item: ClientViewItem; currency: string }) {
  const schedule = scheduleLine(item);
  return (
    <li>
      <span className={`d d--${item.kind}`} aria-hidden="true" />
      <span className="tf-client-item">
        <span>
          <span className="tf-item-kind">{itemKindLabel(item.kind)}</span>: {item.title}
          {item.booked ? <span className="tf-badge tf-client-booked">Booked</span> : null}
        </span>
        {schedule ? <small>{schedule}</small> : null}
      </span>
      {item.sellMinor !== null ? (
        <span className="tf-price">{formatMinorAmount(item.sellMinor, currency)}</span>
      ) : (
        <span aria-hidden="true" />
      )}
    </li>
  );
}
