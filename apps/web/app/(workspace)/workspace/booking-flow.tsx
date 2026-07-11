// Booking flow (spec 009 US1–US3, contract §2) — client component driving the
// EXISTING agent-gated workspace.booking.quote/book mutations through the typed
// browser tRPC client (research D1). Renders held prices, expiry, and booking
// outcomes exactly as returned — the page performs no money arithmetic (FR-007);
// the only numeric input conversion is markup percent → integer basis points
// (research D5). Booking truth always comes from the platform's own responses
// (research D10). Every user-visible failure string comes from the pure mapping
// helpers (contract §3). Composed ONLY inside the planner's drafted state, so it
// can never render for a non-agent (FR-009, research D2). Presentation rides the
// seed-0009s theme kit (.tf-*).
"use client";

import { useMemo, useState } from "react";
import { trpc, type BookOutput, type QuoteOutput } from "../../../lib/trpc/client.js";
import { formatMinorAmount } from "../../../lib/planner-form.js";
import {
  bookFailureMessage,
  bookStatusLabel,
  bookingErrorMessage,
  formatHoldExpiry,
  formatMarkupBps,
  initialMarkupPercent,
  itemMetaIndex,
  itemMetaOf,
  quoteFailureMessage,
  toMarkupBps,
  type DraftedItinerary,
  type ItemMeta,
  type QuoteItem,
} from "../../../lib/booking-flow.js";

type BookingViewState =
  | { phase: "idle" }
  | { phase: "quoting" }
  | { phase: "reviewed"; items: QuoteItem[] }
  | { phase: "booking"; items: QuoteItem[] }
  | { phase: "concluded"; outcome: BookOutput }
  | { phase: "failed"; message: string };

export function BookingFlow({
  itinerary,
  latestBookedMarkupBps,
}: {
  itinerary: DraftedItinerary;
  /** The trip's most recently booked generation's markup (null if nothing
   * booked yet) — reopening a partially-booked trip should reflect what was
   * ALREADY booked instead of silently resetting to the 15% default (seed-0028). */
  latestBookedMarkupBps: number | null;
}) {
  const [markupPercent, setMarkupPercent] = useState(() => initialMarkupPercent(latestBookedMarkupBps));
  const [inputError, setInputError] = useState<string | null>(null);
  const [view, setView] = useState<BookingViewState>({ phase: "idle" });
  const [selection, setSelection] = useState<ReadonlySet<string>>(new Set());
  const meta = useMemo(() => itemMetaIndex(itinerary), [itinerary]);

  const busy = view.phase === "quoting" || view.phase === "booking";

  async function handleQuote() {
    if (busy) return;
    const mapped = toMarkupBps(markupPercent);
    if ("error" in mapped) {
      setInputError(mapped.error);
      return;
    }
    setInputError(null);
    setView({ phase: "quoting" });
    try {
      const outcome: QuoteOutput = await trpc.workspace.booking.quote.mutate({
        itineraryId: itinerary.id,
        markupBps: mapped.bps,
      });
      // Held items are pre-selected (FR-004); the Set is keyed by the server's
      // own hold ids, so booking sends exactly the holds on screen.
      setSelection(
        new Set(outcome.items.flatMap((item) => (item.outcome === "held" ? [item.quote.quoteRowId] : []))),
      );
      setView({ phase: "reviewed", items: outcome.items });
    } catch (error) {
      setView({ phase: "failed", message: bookingErrorMessage(error) });
    }
  }

  async function handleBook() {
    if (view.phase !== "reviewed" || selection.size === 0) return;
    const items = view.items;
    setView({ phase: "booking", items });
    try {
      const outcome: BookOutput = await trpc.workspace.booking.book.mutate({
        itineraryId: itinerary.id,
        quoteRowIds: [...selection],
      });
      setView({ phase: "concluded", outcome });
    } catch (error) {
      setView({ phase: "failed", message: bookingErrorMessage(error) });
    }
  }

  function toggleSelection(quoteRowId: string) {
    setSelection((current) => {
      const next = new Set(current);
      if (next.has(quoteRowId)) {
        next.delete(quoteRowId);
      } else {
        next.add(quoteRowId);
      }
      return next;
    });
  }

  return (
    <section className="tf-card tf-booking" data-testid="booking-flow">
      <p className="tf-eyebrow">Inline booking</p>
      <h3>Book this trip at your markup</h3>
      <p>
        Quote firm net-rate holds for the plan&apos;s bookable items, review your client
        prices, and book — every price is computed and guaranteed by the platform.
      </p>
      <div className="tf-booking-controls">
        <label htmlFor="markupPercent">
          Markup %
          <input
            id="markupPercent"
            name="markupPercent"
            type="number"
            min={0}
            max={100}
            step="0.01"
            value={markupPercent}
            disabled={busy}
            onChange={(e) => setMarkupPercent(e.target.value)}
          />
        </label>
        <button type="button" className="tf-btn--cta" disabled={busy} onClick={handleQuote}>
          {view.phase === "quoting" ? "Quoting…" : "Quote live prices"}
        </button>
      </div>
      {view.phase === "quoting" ? (
        <p className="tf-drafting" aria-live="polite">
          <span className="tf-spin" aria-hidden="true" />
          Holding live prices with suppliers…
        </p>
      ) : null}
      {inputError ? <p role="alert">{inputError}</p> : null}
      {view.phase === "failed" ? <p role="alert">{view.message}</p> : null}
      {view.phase === "reviewed" || view.phase === "booking" ? (
        <QuoteReview
          items={view.items}
          meta={meta}
          selection={selection}
          booking={view.phase === "booking"}
          onToggle={toggleSelection}
          onBook={handleBook}
        />
      ) : null}
      {view.phase === "concluded" ? <Confirmation outcome={view.outcome} meta={meta} /> : null}
    </section>
  );
}

function QuoteReview({
  items,
  meta,
  selection,
  booking,
  onToggle,
  onBook,
}: {
  items: QuoteItem[];
  meta: Map<string, ItemMeta>;
  selection: ReadonlySet<string>;
  booking: boolean;
  onToggle: (quoteRowId: string) => void;
  onBook: () => void;
}) {
  const heldCount = items.filter((item) => item.outcome === "held").length;
  return (
    <div data-testid="quote-review" className="tf-quote-review">
      {heldCount === 0 ? (
        // Per-item reasons still render below (contract §2.1) — e.g. a fully
        // booked plan reports every item as already booked.
        <p>No items could be held at live prices. Adjust the plan or quote again.</p>
      ) : null}
      {items.length === 0 ? null : (
        <table className="tf-quote-table">
          <thead>
            <tr>
              <th>Book</th>
              <th>Item</th>
              <th align="right">Net rate</th>
              <th>Markup</th>
              <th align="right">Client price</th>
              <th>Hold</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <QuoteRow
                key={item.outcome === "held" ? item.quote.quoteRowId : `failed-${item.itemId}`}
                item={item}
                meta={itemMetaOf(meta, item.itemId)}
                selected={item.outcome === "held" && selection.has(item.quote.quoteRowId)}
                booking={booking}
                onToggle={onToggle}
              />
            ))}
          </tbody>
        </table>
      )}
      {heldCount === 0 ? null : (
        // Absent (never merely disabled) when nothing is holdable (contract §2.1).
        <button
          type="button"
          className="tf-btn--cta"
          disabled={booking || selection.size === 0}
          onClick={onBook}
        >
          {booking ? "Booking…" : "Book selected items"}
        </button>
      )}
    </div>
  );
}

function QuoteRow({
  item,
  meta,
  selected,
  booking,
  onToggle,
}: {
  item: QuoteItem;
  meta: ItemMeta;
  selected: boolean;
  booking: boolean;
  onToggle: (quoteRowId: string) => void;
}) {
  if (item.outcome === "failed") {
    return (
      <tr className="tf-row-failed">
        <td />
        <td>
          <span className="tf-item-kind">{meta.kind}</span> {meta.title}
        </td>
        <td colSpan={4}>{quoteFailureMessage(item.reason)}</td>
      </tr>
    );
  }
  const { quote } = item;
  return (
    <tr>
      <td>
        <input
          type="checkbox"
          checked={selected}
          disabled={booking}
          aria-label={`Book ${meta.title}`}
          onChange={() => onToggle(quote.quoteRowId)}
        />
      </td>
      <td>
        <span className="tf-item-kind">{meta.kind}</span> {meta.title}
      </td>
      <td align="right" className="tf-price">
        {formatMinorAmount(quote.netMinor, quote.netCurrency)}
      </td>
      <td>{formatMarkupBps(quote.markupBps)}</td>
      <td align="right" className="tf-price">
        {formatMinorAmount(quote.sellMinor, quote.currency)}
      </td>
      <td className="tf-hold">{formatHoldExpiry(quote.expiresAt)}</td>
    </tr>
  );
}

function Confirmation({ outcome, meta }: { outcome: BookOutput; meta: Map<string, ItemMeta> }) {
  const tone =
    outcome.status === "confirmed" ? "ok" : outcome.status === "failed" ? "fail" : "partial";
  return (
    <div data-testid="booking-confirmation" className={`tf-confirmation tf-confirmation--${tone}`}>
      <h3>{bookStatusLabel(outcome.status)}</h3>
      {outcome.bookingId ? (
        <p>
          Booking reference: <code>{outcome.bookingId}</code>
        </p>
      ) : null}
      <ul className="tf-components">
        {outcome.components.map((component) => {
          const itemMeta = itemMetaOf(meta, component.itemId);
          return (
            <li
              key={component.quoteRowId}
              className={component.outcome === "confirmed" ? "tf-component--ok" : "tf-component--fail"}
            >
              <span className="tf-item-kind">{itemMeta.kind}</span> {itemMeta.title} —{" "}
              {component.outcome === "confirmed" ? (
                <>
                  confirmed · supplier ref <code>{component.supplierBookingId}</code> ·{" "}
                  <span className="tf-price">
                    {formatMinorAmount(component.sellMinor, component.currency)}
                  </span>
                </>
              ) : (
                bookFailureMessage(component.reason)
              )}
            </li>
          );
        })}
      </ul>
      <p className="tf-confirmation-note">
        Quote again anytime — booked items stay booked; the platform never books an item twice.
      </p>
    </div>
  );
}
