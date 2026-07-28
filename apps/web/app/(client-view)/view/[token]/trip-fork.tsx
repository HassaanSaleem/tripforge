// The self-drive vs. request-an-agent fork (spec 022; spec 036 makes self-drive
// real). Client component: possession of the share token is the only grant
// needed to VIEW and REQUEST (INV-018) — but "Book it myself" is now a real
// MONEY PATH (spec 036), so it requires a signed-in session: an anonymous
// visitor is prompted to sign in first (FR-009), and a signed-in traveler runs
// a review → confirm → result flow that calls clientView.selfBook. That
// procedure books the shared itinerary's un-booked items through the same
// quote-then-book path an agent uses, attributed to the OWNING agency (never
// the traveler), and returns a redacted per-leg outcome (INV-020). Renders
// inside the (client-view) route group only — inherits the brand-neutral
// layout.tsx (INV-020) and imports nothing agent-facing.
//
// Sign-in is OPTIONAL for the request-an-agent handoff (spec 030): `identity`,
// when present, only sets defaultValue on the uncontrolled contact inputs.
"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { SelfBookOutcome, TravelerIdentity } from "@tripforge/api";
import { trpc } from "../../../../lib/trpc/client.js";
import { transportErrorMessage } from "../../../../lib/transport-error.js";
import { signOut } from "../../../../lib/auth-client.js";
import { formatMinorAmount } from "../../../../lib/planner-form.js";

type ForkChoice = "self_drive" | "handoff";

type HandoffState =
  | { phase: "idle" }
  | { phase: "submitting" }
  | { phase: "submitted" }
  | { phase: "refused"; message: string };

type SelfBookState =
  | { phase: "review" }
  | { phase: "booking" }
  | { phase: "done"; outcome: SelfBookOutcome }
  | { phase: "error"; message: string };

/** A trip item the traveler is about to self-book — the client-safe subset the
 * page already renders (INV-020: no netRate/supplyRef/ids), used for the
 * review "what you'll book" list. */
export interface SelfBookReviewItem {
  title: string;
  kind: "stay" | "activity" | "transfer";
  sellMinor: number | null;
}

const KIND_LABEL: Record<SelfBookReviewItem["kind"], string> = {
  stay: "Stay",
  activity: "Activity",
  transfer: "Transfer",
};

/** Operator-confirmation guidance derived from the traveler's OWN real trip
 * components (spec 036 FR-012) — sourced, never fabricated destination facts. */
const CONFIRM_NOTE: Record<SelfBookReviewItem["kind"], string> = {
  stay: "Check-in and check-out times are set by the property.",
  activity: "Confirm the meeting point and what's included with the operator.",
  transfer: "Confirm your pickup time and luggage limits with the transfer operator.",
};

function reasonLabel(reason: "price_changed" | "supplier_unavailable" | "already_booked"): string {
  switch (reason) {
    case "price_changed":
      return "The price changed before we could book it — please try again.";
    case "supplier_unavailable":
      return "Temporarily unavailable — please try again.";
    case "already_booked":
      return "Already booked.";
  }
}

export function TripFork({
  token,
  identity,
  reviewItems,
  currency,
}: {
  token: string;
  identity: TravelerIdentity | null;
  reviewItems: SelfBookReviewItem[];
  currency: string;
}) {
  const router = useRouter();
  const [choice, setChoice] = useState<ForkChoice | null>(null);
  const [handoff, setHandoff] = useState<HandoffState>({ phase: "idle" });
  const [selfBook, setSelfBook] = useState<SelfBookState>({ phase: "review" });

  async function handleSignOut() {
    await signOut();
    router.refresh();
  }

  async function handleSelfBook() {
    if (selfBook.phase === "booking") return;
    setSelfBook({ phase: "booking" });
    try {
      const outcome = await trpc.clientView.selfBook.mutate({ token });
      setSelfBook({ phase: "done", outcome });
      // Refresh the server component so the itinerary above shows the new
      // Booked badges + updated total (force-dynamic re-reads the DB).
      router.refresh();
    } catch (error) {
      setSelfBook({
        phase: "error",
        message: transportErrorMessage(error, {
          forbidden: "This trip link can't be booked right now.",
          badRequest: "We couldn't book this trip. Please try again.",
        }),
      });
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (handoff.phase === "submitting") return;
    const form = new FormData(event.currentTarget);
    const contactName = String(form.get("contactName") ?? "").trim();
    if (contactName === "") {
      setHandoff({ phase: "refused", message: "Enter your name so the agent can reach you." });
      return;
    }
    const contactEmail = String(form.get("contactEmail") ?? "").trim();
    const notes = String(form.get("notes") ?? "").trim();
    setHandoff({ phase: "submitting" });
    try {
      const outcome = await trpc.clientView.requestHandoff.mutate({
        token,
        contactName,
        ...(contactEmail === "" ? {} : { contactEmail }),
        ...(notes === "" ? {} : { notes }),
      });
      if (outcome.status === "submitted") {
        setHandoff({ phase: "submitted" });
      } else {
        setHandoff({ phase: "refused", message: "This trip link isn't available anymore." });
      }
    } catch (error) {
      setHandoff({
        phase: "refused",
        message: transportErrorMessage(error, {
          forbidden: "This trip link can't take requests right now.",
          badRequest: "Enter your name so the agent can reach you.",
        }),
      });
    }
  }

  if (choice === null) {
    return (
      <section className="tf-card tf-client-fork" data-testid="trip-fork">
        <p className="tf-client-account-strip" data-testid="trip-fork-account-strip">
          {identity ? (
            <>
              Signed in as {identity.name} ·{" "}
              <a href="/view/my-trips" data-testid="my-trips-link">
                My Trips
              </a>{" "}
              ·{" "}
              <button type="button" className="tf-link-btn" onClick={handleSignOut} data-testid="account-sign-out">
                Sign out
              </button>
            </>
          ) : (
            <>
              Have an account?{" "}
              <a href={`/view/sign-in?token=${token}`} data-testid="account-sign-in-link">
                Sign in
              </a>{" "}
              to fill in your details automatically.
            </>
          )}
        </p>
        <p className="tf-eyebrow">What next?</p>
        <h2>Ready to move forward?</h2>
        <div className="tf-client-fork-choices">
          <button
            type="button"
            className="tf-btn"
            onClick={() => setChoice("self_drive")}
            data-testid="fork-self-drive"
          >
            Book it myself
          </button>
          <button
            type="button"
            className="tf-btn tf-btn--cta"
            onClick={() => setChoice("handoff")}
            data-testid="fork-handoff"
          >
            Have an agent arrange this for me
          </button>
        </div>
      </section>
    );
  }

  if (choice === "self_drive") {
    // MONEY PATH → sign-in required (FR-009). An anonymous visitor is prompted
    // to sign in and cannot fire a booking.
    if (!identity) {
      return (
        <section className="tf-card tf-client-fork" data-testid="trip-fork-self-drive-signin">
          <p className="tf-eyebrow">Book it myself</p>
          <h2>Sign in to book this trip yourself</h2>
          <p>Booking through the platform needs an account so we can confirm and track your trip.</p>
          <a className="tf-btn tf-btn--cta" href={`/view/sign-in?token=${token}`} data-testid="self-drive-sign-in-link">
            Sign in to continue
          </a>
        </section>
      );
    }

    if (selfBook.phase === "done") {
      return <SelfBookResult outcome={selfBook.outcome} currency={currency} />;
    }

    if (selfBook.phase === "error") {
      return (
        <section className="tf-card tf-client-fork" data-testid="trip-fork-self-drive-error">
          <p className="tf-eyebrow">Book it myself</p>
          <h2>We couldn&apos;t book that</h2>
          <p role="alert">{selfBook.message}</p>
          <p className="tf-price-note">Nothing was charged. You can try again.</p>
          <button type="button" className="tf-btn tf-btn--cta" onClick={() => setSelfBook({ phase: "review" })}>
            Try again
          </button>
        </section>
      );
    }

    // review / booking
    const booking = selfBook.phase === "booking";
    if (reviewItems.length === 0) {
      return (
        <section className="tf-card tf-client-fork" data-testid="trip-fork-self-drive-nothing">
          <p className="tf-eyebrow">Book it myself</p>
          <h2>Everything here is already booked</h2>
          <p>There&apos;s nothing left to book on this trip. Reach out to your agent if something looks off.</p>
        </section>
      );
    }
    return (
      <section className="tf-card tf-client-fork" data-testid="trip-fork-self-drive-review">
        <p className="tf-eyebrow">Book it myself</p>
        <h2>Review &amp; book your trip</h2>
        <p>You&apos;re about to book these parts of your trip through the platform:</p>
        <ul className="tf-items tf-client-items" data-testid="self-book-review-list">
          {reviewItems.map((item, index) => (
            <li key={index}>
              <span className={`d d--${item.kind}`} aria-hidden="true" />
              <span className="tf-client-item">
                <span>
                  <span className="tf-item-kind">{KIND_LABEL[item.kind]}</span>: {item.title}
                </span>
              </span>
              {item.sellMinor !== null ? (
                <span className="tf-price">{formatMinorAmount(item.sellMinor, currency)}</span>
              ) : (
                <span aria-hidden="true" />
              )}
            </li>
          ))}
        </ul>

        <div className="tf-client-advisory" data-testid="self-book-advisory">
          <p className="tf-eyebrow">Before you book</p>
          <ul>
            {[...new Set(reviewItems.map((i) => i.kind))].map((kind) => (
              <li key={kind}>{CONFIRM_NOTE[kind]}</li>
            ))}
            <li>Flights, where needed, are booked separately.</li>
            <li>
              Check entry and travel-advisory requirements for your destination with an official source such as the{" "}
              <a href="https://www.iatatravelcentre.com/" target="_blank" rel="noreferrer">
                IATA Travel Centre
              </a>{" "}
              before you travel.
            </li>
          </ul>
        </div>

        <button
          type="button"
          className="tf-btn tf-btn--cta"
          onClick={handleSelfBook}
          disabled={booking}
          data-testid="self-book-confirm"
        >
          {booking ? "Booking your trip…" : "Confirm booking"}
        </button>
      </section>
    );
  }

  if (handoff.phase === "submitted") {
    return (
      <section className="tf-card tf-client-fork" data-testid="trip-fork-handoff-submitted">
        <p className="tf-eyebrow">Request sent</p>
        <h2>Your agent has been notified</h2>
        <p>They&apos;ll be in touch to take it from here.</p>
      </section>
    );
  }

  return (
    <section className="tf-card tf-client-fork" data-testid="trip-fork-handoff-form">
      <p className="tf-eyebrow">Have an agent arrange this for me</p>
      <h2>Tell your agent how to reach you</h2>
      <form onSubmit={handleSubmit} data-testid="trip-fork-handoff-inputs">
        <label>
          Your name
          <input
            type="text"
            name="contactName"
            required
            maxLength={200}
            defaultValue={identity?.name ?? ""}
            disabled={handoff.phase === "submitting"}
          />
        </label>
        <label>
          Email (optional)
          <input
            type="email"
            name="contactEmail"
            maxLength={320}
            defaultValue={identity?.email ?? ""}
            disabled={handoff.phase === "submitting"}
          />
        </label>
        <label>
          Notes (optional)
          <textarea name="notes" maxLength={2000} disabled={handoff.phase === "submitting"} />
        </label>
        {handoff.phase === "refused" ? <p role="alert">{handoff.message}</p> : null}
        <button type="submit" className="tf-btn tf-btn--cta" disabled={handoff.phase === "submitting"}>
          {handoff.phase === "submitting" ? "Sending…" : "Send request"}
        </button>
      </form>
    </section>
  );
}

/** The redacted self-book result (INV-020): per-leg confirmed/failed + total. */
function SelfBookResult({ outcome, currency }: { outcome: SelfBookOutcome; currency: string }) {
  if (outcome.status === "not_found") {
    return (
      <section className="tf-card tf-client-fork" data-testid="trip-fork-self-drive-result">
        <p className="tf-eyebrow">Book it myself</p>
        <h2>This trip link isn&apos;t available anymore</h2>
        <p>Ask your travel agent for a fresh link to your itinerary.</p>
      </section>
    );
  }
  if (outcome.status === "nothing_to_book") {
    return (
      <section className="tf-card tf-client-fork" data-testid="trip-fork-self-drive-result">
        <p className="tf-eyebrow">Book it myself</p>
        <h2>Everything here is already booked</h2>
        <p>There was nothing left to book on this trip.</p>
      </section>
    );
  }

  const confirmed = outcome.legs.filter((l) => l.outcome === "confirmed");
  const failed = outcome.legs.filter((l) => l.outcome === "failed");
  const heading =
    outcome.status === "confirmed"
      ? "You're all booked!"
      : outcome.status === "partially_confirmed"
        ? "Some of your trip is booked"
        : "We couldn't complete your booking";

  return (
    <section className="tf-card tf-client-fork" data-testid="trip-fork-self-drive-result">
      <p className="tf-eyebrow">Book it myself</p>
      <h2>{heading}</h2>
      {confirmed.length > 0 ? (
        <>
          <p className="tf-client-total" data-testid="self-book-total">
            Booked total{" "}
            <strong className="tf-price">{formatMinorAmount(outcome.totalChargedMinor, outcome.currency || currency)}</strong>
          </p>
          <ul className="tf-items tf-client-items" data-testid="self-book-confirmed-list">
            {confirmed.map((leg, index) => (
              <li key={index}>
                <span className={`d d--${leg.kind}`} aria-hidden="true" />
                <span className="tf-client-item">
                  <span>
                    <span className="tf-item-kind">{KIND_LABEL[leg.kind]}</span>: {leg.title}
                    <span className="tf-badge tf-client-booked">Booked</span>
                  </span>
                </span>
                {leg.outcome === "confirmed" ? (
                  <span className="tf-price tf-price--booked">
                    {formatMinorAmount(leg.sellMinor, leg.currency || currency)}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="tf-price-note">Nothing was charged.</p>
      )}
      {failed.length > 0 ? (
        <div data-testid="self-book-failed-list">
          <p className="tf-eyebrow">Couldn&apos;t book</p>
          <ul className="tf-items tf-client-items">
            {failed.map((leg, index) => (
              <li key={index}>
                <span className="tf-client-item">
                  <span>
                    <span className="tf-item-kind">{KIND_LABEL[leg.kind]}</span>: {leg.title}
                  </span>
                  {leg.outcome === "failed" ? <small>{reasonLabel(leg.reason)}</small> : null}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
