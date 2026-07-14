// Group-travel panel (spec 021 contracts §1-4) — client component driving the
// agent-gated workspace.groupTravel procedures plus workspace.itinerary.list
// through the typed browser tRPC client (marketplace-panel.tsx precedent).
// Renders departures exactly as returned — the page performs no money
// arithmetic beyond the post form's one major→minor conversion
// (group-travel-flow.ts). Browse state is reloaded from the server after each
// successful action — no optimistic seat state is ever invented client-side.
"use client";

import { useEffect, useState, type FormEvent } from "react";
import { trpc } from "../../../lib/trpc/client.js";
import {
  groupTravelErrorMessage,
  joinGroupDepartureFailureMessage,
  toPostGroupDepartureInput,
  type PostFormValues,
} from "../../../lib/group-travel-flow.js";
import { GroupTripCard } from "./group-trip-card.js";
import { GroupDepartureForm, readPostFormValues } from "./group-departure-form.js";
import {
  INITIAL_POST_FORM,
  type BrowseState,
  type CancelState,
  type JoinState,
  type PickerState,
  type PostFormState,
} from "./group-travel-panel-types.js";

export function GroupTravelPanel() {
  const [browse, setBrowse] = useState<BrowseState>({ phase: "loading" });
  const [picker, setPicker] = useState<PickerState>({ phase: "loading" });
  const [values, setValues] = useState<PostFormValues>(INITIAL_POST_FORM);
  const [form, setForm] = useState<PostFormState>({ phase: "idle" });
  const [join, setJoin] = useState<JoinState>(null);
  const [cancel, setCancel] = useState<CancelState>(null);

  async function loadDepartures() {
    try {
      const outcome = await trpc.workspace.groupTravel.browse.query();
      setBrowse({ phase: "loaded", departures: outcome.departures });
    } catch (error) {
      setBrowse({ phase: "failed", message: groupTravelErrorMessage(error) });
    }
  }

  async function loadItineraries() {
    try {
      const outcome = await trpc.workspace.itinerary.list.query();
      setPicker({ phase: "loaded", itineraries: outcome.itineraries });
    } catch (error) {
      setPicker({ phase: "failed", message: groupTravelErrorMessage(error) });
    }
  }

  useEffect(() => {
    void loadDepartures();
    void loadItineraries();
  }, []);

  function update<K extends keyof PostFormValues>(field: K, value: PostFormValues[K]) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  function currencyOf(itineraryId: string): string {
    return picker.phase === "loaded"
      ? (picker.itineraries.find((itinerary) => itinerary.id === itineraryId)?.currency ?? "")
      : "";
  }

  const pickedCurrency = currencyOf(values.itineraryId);

  async function handlePost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (form.phase === "submitting") return;
    const submitted = readPostFormValues(event.currentTarget);
    setValues(submitted);
    const mapped = toPostGroupDepartureInput(submitted, pickedCurrency);
    if ("error" in mapped) {
      setForm({ phase: "refused", message: mapped.error });
      return;
    }
    setForm({ phase: "submitting" });
    try {
      await trpc.workspace.groupTravel.post.mutate(mapped.input);
      setForm({ phase: "posted" });
      setValues(INITIAL_POST_FORM);
      await loadDepartures();
    } catch (error) {
      setForm({ phase: "refused", message: groupTravelErrorMessage(error) });
    }
  }

  async function handleJoin(departureId: string, travelerName: string, travelerEmail: string) {
    if (join?.kind === "busy") return;
    const name = travelerName.trim();
    if (name === "") {
      setJoin({ departureId, kind: "refused", message: "Enter the client's name to join a seat." });
      return;
    }
    setJoin({ departureId, kind: "busy" });
    try {
      const outcome = await trpc.workspace.groupTravel.join.mutate({
        departureId,
        travelerName: name,
        ...(travelerEmail.trim() === "" ? {} : { travelerEmail: travelerEmail.trim() }),
      });
      if (outcome.status === "joined") {
        setJoin({ departureId, kind: "joined", seatsRemaining: outcome.seatsRemaining });
        // Seats-remaining is server-derived — reload so every viewer's next
        // render shows the same count (marketplace-panel.tsx FR-011 precedent).
        await loadDepartures();
      } else {
        setJoin({ departureId, kind: "refused", message: joinGroupDepartureFailureMessage(outcome) });
      }
    } catch (error) {
      setJoin({ departureId, kind: "refused", message: groupTravelErrorMessage(error) });
    }
  }

  async function handleCancel(departureId: string) {
    if (cancel?.kind === "busy") return;
    setCancel({ departureId, kind: "busy" });
    try {
      const outcome = await trpc.workspace.groupTravel.cancel.mutate({ departureId });
      if (outcome.status === "cancelled") {
        setCancel({ departureId, kind: "cancelled" });
        await loadDepartures();
      } else {
        setCancel({ departureId, kind: "refused", message: "This departure is already cancelled." });
      }
    } catch (error) {
      setCancel({ departureId, kind: "refused", message: groupTravelErrorMessage(error) });
    }
  }

  return (
    <div className="tf-market">
      <section className="tf-card" data-testid="group-travel-browse">
        <p className="tf-eyebrow">Live departures</p>
        <h2>Group trips on the marketplace now</h2>
        {browse.phase === "loading" ? (
          <p className="tf-drafting" aria-live="polite">
            <span className="tf-spin" aria-hidden="true" />
            Loading live departures…
          </p>
        ) : null}
        {browse.phase === "failed" ? <p role="alert">{browse.message}</p> : null}
        {browse.phase === "loaded" && browse.departures.length === 0 ? (
          <p className="tf-market-empty">
            No group departures posted yet — post one of yours below and be the first.
          </p>
        ) : null}
        {browse.phase === "loaded" && browse.departures.length > 0 ? (
          <div className="tf-market-grid">
            {browse.departures.map((departure) => (
              <GroupTripCard
                key={departure.departureId}
                departure={departure}
                join={join}
                onJoin={handleJoin}
                cancel={cancel}
                onCancel={handleCancel}
              />
            ))}
          </div>
        ) : null}
      </section>

      <section className="tf-card" data-testid="group-departure-form">
        <p className="tf-eyebrow">Post a group departure</p>
        <h2>Sell seats on a group trip</h2>
        <p>
          Post one of your itineraries with a departure date, total capacity, and per-seat
          price. Clients (or you, on their behalf) join a seat until it sells out — capacity is
          enforced by the platform, even under simultaneous joins.
        </p>
        <GroupDepartureForm
          picker={picker}
          values={values}
          form={form}
          pickedCurrency={pickedCurrency}
          onUpdate={update}
          onSubmit={handlePost}
        />
      </section>
    </div>
  );
}
