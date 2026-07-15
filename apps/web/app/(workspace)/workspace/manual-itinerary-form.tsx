// Manual itinerary builder (spec 029 contracts/manual-itinerary.md) — the
// "bring your own trip" entry point alongside the AI planner. A repeatable
// day/item form (no equivalent existed anywhere in apps/web before this
// feature — the AI-planner form is a single-shot field set, not a builder).
// Reuses the SAME destination/dates/party fields the planner's own form
// collects (research D5) so the synthesized TripRequest downstream is built
// from real values. No price fields anywhere here — every item starts
// unpriced by construction (server contract); a real supplier rate is
// attached later via the existing chat-edit panel on the reopened trip.
// Presentation rides the seed-0009s theme kit (.tf-*).
"use client";

import { useState, type FormEvent } from "react";
import { trpc, type CreateManualItineraryInput } from "../../../lib/trpc/client.js";
import { transportErrorMessage } from "../../../lib/transport-error.js";

type StayItemDraft = { kind: "stay"; title: string; checkIn: string; checkOut: string; adults: string; children: string };
type ActivityItemDraft = { kind: "activity"; title: string; startsAt: string; durationMinutes: string };
type TransferItemDraft = { kind: "transfer"; title: string; from: string; to: string; mode: "private" | "shared" | "rail" | "other" };
type ItemDraft = StayItemDraft | ActivityItemDraft | TransferItemDraft;
// Partial<ItemDraft> would only keep keys common to all three kinds (kind,
// title) — a union of per-kind partials is needed so a kind-specific field
// patch (e.g. { checkIn }) type-checks against the matching member.
type ItemDraftPatch = Partial<StayItemDraft> | Partial<ActivityItemDraft> | Partial<TransferItemDraft>;

interface DayDraft {
  date: string;
  items: ItemDraft[];
}

function newStayItem(): StayItemDraft {
  return { kind: "stay", title: "", checkIn: "", checkOut: "", adults: "2", children: "0" };
}

function newDay(): DayDraft {
  return { date: "", items: [] };
}

function newItemForKind(kind: ItemDraft["kind"]): ItemDraft {
  switch (kind) {
    case "stay":
      return newStayItem();
    case "activity":
      return { kind: "activity", title: "", startsAt: "", durationMinutes: "" };
    case "transfer":
      return { kind: "transfer", title: "", from: "", to: "", mode: "private" };
  }
}

/** Pre-submit validation + payload mapping (mirrors lib/planner-form.ts's
 * toTripRequest pattern) — checks a user can fix before hitting the server;
 * the server independently re-validates everything (INV-023). */
function toCreateManualInput(values: {
  title: string;
  currency: string;
  destination: string;
  checkIn: string;
  checkOut: string;
  adults: string;
  children: string;
  days: DayDraft[];
}): { input: CreateManualItineraryInput } | { error: string } {
  const title = values.title.trim();
  if (!title) return { error: "Enter a trip title." };
  const currency = values.currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) return { error: "Currency must be a 3-letter code (e.g. EUR)." };
  const destination = values.destination.trim();
  if (!destination) return { error: "Enter a destination." };
  if (!values.checkIn || !values.checkOut) return { error: "Choose both check-in and check-out dates." };
  if (values.checkOut <= values.checkIn) return { error: "Check-out must be after check-in." };
  const adults = Number(values.adults);
  if (!Number.isInteger(adults) || adults < 1) return { error: "Adults must be a whole number of at least 1." };
  const children = values.children.trim() === "" ? 0 : Number(values.children);
  if (!Number.isInteger(children) || children < 0) return { error: "Children must be a whole number of 0 or more." };

  const days: CreateManualItineraryInput["days"] = [];
  for (const [dayIndex, day] of values.days.entries()) {
    const items: (typeof days)[number]["items"] = [];
    for (const [itemIndex, item] of day.items.entries()) {
      const itemLabel = `Day ${dayIndex + 1}, item ${itemIndex + 1}`;
      const itemTitle = item.title.trim();
      if (!itemTitle) return { error: `${itemLabel}: enter a title.` };
      if (item.kind === "stay") {
        if (!item.checkIn || !item.checkOut) return { error: `${itemLabel}: choose check-in and check-out dates.` };
        const stayAdults = Number(item.adults);
        if (!Number.isInteger(stayAdults) || stayAdults < 1) return { error: `${itemLabel}: adults must be at least 1.` };
        const stayChildren = item.children.trim() === "" ? 0 : Number(item.children);
        if (!Number.isInteger(stayChildren) || stayChildren < 0) return { error: `${itemLabel}: children must be 0 or more.` };
        items.push({
          kind: "stay",
          title: itemTitle,
          checkIn: item.checkIn,
          checkOut: item.checkOut,
          occupancy: { adults: stayAdults, children: stayChildren },
        });
      } else if (item.kind === "activity") {
        const durationMinutes = item.durationMinutes.trim() === "" ? undefined : Number(item.durationMinutes);
        if (durationMinutes !== undefined && (!Number.isInteger(durationMinutes) || durationMinutes <= 0)) {
          return { error: `${itemLabel}: duration must be a positive whole number of minutes.` };
        }
        items.push({
          kind: "activity",
          title: itemTitle,
          ...(item.startsAt.trim() === "" ? {} : { startsAt: item.startsAt }),
          ...(durationMinutes !== undefined ? { durationMinutes } : {}),
        });
      } else {
        const from = item.from.trim();
        const to = item.to.trim();
        if (!from || !to) return { error: `${itemLabel}: enter both a from and a to location.` };
        items.push({ kind: "transfer", title: itemTitle, from, to, mode: item.mode });
      }
    }
    days.push({ dayNumber: dayIndex + 1, ...(day.date ? { date: day.date } : {}), items });
  }

  return {
    input: { title, currency, destination, checkIn: values.checkIn, checkOut: values.checkOut, party: { adults, children }, days },
  };
}

function createManualErrorMessage(error: unknown): string {
  return transportErrorMessage(error, {
    forbidden: "Building a trip requires an agency membership. Sign in with your agency account.",
    badRequest: "The server rejected the trip details. Check the form values and try again.",
  });
}

export function ManualItineraryForm({
  onCreated,
  onCancel,
}: {
  onCreated: (itineraryId: string) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [currency, setCurrency] = useState("EUR");
  const [destination, setDestination] = useState("");
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [adults, setAdults] = useState("2");
  const [children, setChildren] = useState("0");
  const [days, setDays] = useState<DayDraft[]>([newDay()]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateDay(dayIndex: number, patch: Partial<DayDraft>) {
    setDays((prev) => prev.map((day, i) => (i === dayIndex ? { ...day, ...patch } : day)));
  }

  function addItem(dayIndex: number, kind: ItemDraft["kind"]) {
    setDays((prev) => prev.map((day, i) => (i === dayIndex ? { ...day, items: [...day.items, newItemForKind(kind)] } : day)));
  }

  function updateItem(dayIndex: number, itemIndex: number, patch: ItemDraftPatch) {
    setDays((prev) =>
      prev.map((day, i) =>
        i === dayIndex
          ? { ...day, items: day.items.map((item, j) => (j === itemIndex ? ({ ...item, ...patch } as ItemDraft) : item)) }
          : day,
      ),
    );
  }

  function removeItem(dayIndex: number, itemIndex: number) {
    setDays((prev) =>
      prev.map((day, i) => (i === dayIndex ? { ...day, items: day.items.filter((_, j) => j !== itemIndex) } : day)),
    );
  }

  function removeDay(dayIndex: number) {
    setDays((prev) => prev.filter((_, i) => i !== dayIndex));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const mapped = toCreateManualInput({ title, currency, destination, checkIn, checkOut, adults, children, days });
    if ("error" in mapped) {
      setError(mapped.error);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const outcome = await trpc.workspace.itinerary.createManual.mutate(mapped.input);
      onCreated(outcome.itinerary.id);
    } catch (err) {
      setError(createManualErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="tf-card tf-triplist" data-testid="manual-itinerary-form">
      <p className="tf-eyebrow">Build a trip manually</p>
      <h2>Bring your own itinerary</h2>
      <p className="tf-trip-note">
        Enter days and items by hand — no AI drafting. Attach real supplier rates to any item later from the trip view.
      </p>

      {error ? <p role="alert">{error}</p> : null}

      <form onSubmit={(e) => void handleSubmit(e)} className="tf-planner-form">
        <label htmlFor="manual-title">
          Trip title
          <input id="manual-title" required value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label htmlFor="manual-currency">
          Currency
          <input id="manual-currency" required maxLength={3} value={currency} onChange={(e) => setCurrency(e.target.value)} />
        </label>
        <label htmlFor="manual-destination">
          Destination
          <input id="manual-destination" required value={destination} onChange={(e) => setDestination(e.target.value)} />
        </label>
        <label htmlFor="manual-checkin">
          Check-in
          <input id="manual-checkin" type="date" required value={checkIn} onChange={(e) => setCheckIn(e.target.value)} />
        </label>
        <label htmlFor="manual-checkout">
          Check-out
          <input id="manual-checkout" type="date" required value={checkOut} onChange={(e) => setCheckOut(e.target.value)} />
        </label>
        <label htmlFor="manual-adults">
          Adults
          <input id="manual-adults" type="number" min={1} step={1} required value={adults} onChange={(e) => setAdults(e.target.value)} />
        </label>
        <label htmlFor="manual-children">
          Children
          <input id="manual-children" type="number" min={0} step={1} value={children} onChange={(e) => setChildren(e.target.value)} />
        </label>

      <div data-testid="manual-days">
        {days.map((day, dayIndex) => (
          <fieldset key={dayIndex} className="tf-card" data-testid={`manual-day-${dayIndex}`}>
            <legend>Day {dayIndex + 1}</legend>
            <label htmlFor={`manual-day-date-${dayIndex}`}>
              Date (optional)
              <input
                id={`manual-day-date-${dayIndex}`}
                type="date"
                value={day.date}
                onChange={(e) => updateDay(dayIndex, { date: e.target.value })}
              />
            </label>
            <button type="button" className="tf-btn--ghost" onClick={() => removeDay(dayIndex)} data-testid={`manual-day-remove-${dayIndex}`}>
              Remove day
            </button>

            {day.items.map((item, itemIndex) => (
              <div key={itemIndex} className="tf-trip-row" data-testid={`manual-item-${dayIndex}-${itemIndex}`}>
                <span className="tf-badge">{item.kind}</span>
                <label>
                  Title
                  <input value={item.title} onChange={(e) => updateItem(dayIndex, itemIndex, { title: e.target.value })} />
                </label>
                {item.kind === "stay" ? (
                  <>
                    <label>
                      Check-in
                      <input type="date" value={item.checkIn} onChange={(e) => updateItem(dayIndex, itemIndex, { checkIn: e.target.value })} />
                    </label>
                    <label>
                      Check-out
                      <input type="date" value={item.checkOut} onChange={(e) => updateItem(dayIndex, itemIndex, { checkOut: e.target.value })} />
                    </label>
                    <label>
                      Adults
                      <input type="number" min={1} value={item.adults} onChange={(e) => updateItem(dayIndex, itemIndex, { adults: e.target.value })} />
                    </label>
                    <label>
                      Children
                      <input type="number" min={0} value={item.children} onChange={(e) => updateItem(dayIndex, itemIndex, { children: e.target.value })} />
                    </label>
                  </>
                ) : null}
                {item.kind === "activity" ? (
                  <>
                    <label>
                      Start time (optional)
                      <input
                        type="datetime-local"
                        value={item.startsAt}
                        onChange={(e) => updateItem(dayIndex, itemIndex, { startsAt: e.target.value })}
                      />
                    </label>
                    <label>
                      Duration (minutes, optional)
                      <input
                        type="number"
                        min={1}
                        value={item.durationMinutes}
                        onChange={(e) => updateItem(dayIndex, itemIndex, { durationMinutes: e.target.value })}
                      />
                    </label>
                  </>
                ) : null}
                {item.kind === "transfer" ? (
                  <>
                    <label>
                      From
                      <input value={item.from} onChange={(e) => updateItem(dayIndex, itemIndex, { from: e.target.value })} />
                    </label>
                    <label>
                      To
                      <input value={item.to} onChange={(e) => updateItem(dayIndex, itemIndex, { to: e.target.value })} />
                    </label>
                    <label>
                      Mode
                      <select value={item.mode} onChange={(e) => updateItem(dayIndex, itemIndex, { mode: e.target.value as TransferItemDraft["mode"] })}>
                        <option value="private">Private</option>
                        <option value="shared">Shared</option>
                        <option value="rail">Rail</option>
                        <option value="other">Other</option>
                      </select>
                    </label>
                  </>
                ) : null}
                <button type="button" className="tf-btn--ghost" onClick={() => removeItem(dayIndex, itemIndex)} data-testid={`manual-item-remove-${dayIndex}-${itemIndex}`}>
                  Remove item
                </button>
              </div>
            ))}

            <div className="tf-segmented" role="group" aria-label={`Add an item to day ${dayIndex + 1}`}>
              <button type="button" onClick={() => addItem(dayIndex, "stay")} data-testid={`manual-add-stay-${dayIndex}`}>
                + Stay
              </button>
              <button type="button" onClick={() => addItem(dayIndex, "activity")} data-testid={`manual-add-activity-${dayIndex}`}>
                + Activity
              </button>
              <button type="button" onClick={() => addItem(dayIndex, "transfer")} data-testid={`manual-add-transfer-${dayIndex}`}>
                + Transfer
              </button>
            </div>
          </fieldset>
        ))}
      </div>

      <button type="button" className="tf-btn--ghost" onClick={() => setDays((prev) => [...prev, newDay()])} data-testid="manual-add-day">
        + Add day
      </button>

      <div>
        <button type="submit" className="tf-btn--cta" disabled={submitting} data-testid="manual-submit">
          {submitting ? "Creating…" : "Create trip"}
        </button>
        <button type="button" className="tf-btn--ghost" onClick={onCancel} data-testid="manual-cancel">
          Cancel
        </button>
      </div>
      </form>
    </section>
  );
}
