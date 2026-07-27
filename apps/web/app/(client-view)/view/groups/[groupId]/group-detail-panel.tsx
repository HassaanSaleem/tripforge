// Group trip detail panel (spec 040). Brand-neutral consumer client component
// (INV-024) driving clientView.groups.* over the shared tRPC surface (INV-018):
// the roster + per-member confirmation, the in-group chat, the member confirm
// action, and the organizer's finalize (gated on all-party confirmation) and
// cancel. Server refusals are VALUES surfaced as guidance; the trip figures are
// the client-facing view on the trip's own /view page (INV-020) — never re-derived.
"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { trpc, type GroupDetail } from "../../../../../lib/trpc/client.js";
import { transportErrorMessage } from "../../../../../lib/transport-error.js";

const STATUS_LABEL: Record<GroupDetail["status"], string> = {
  forming: "Forming",
  finalized: "Finalized",
  cancelled: "Cancelled",
};

const GROUP_WORDING = {
  forbidden: "You don’t have access to do that.",
  badRequest: "That didn’t look right — please try again.",
} as const;

export function GroupDetailPanel({ group }: { group: GroupDetail }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState<null | "message" | "confirm" | "finalize" | "cancel">(null);
  const [error, setError] = useState<string | null>(null);
  const [finalizeNote, setFinalizeNote] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const forming = group.status === "forming";

  async function run<T>(kind: NonNullable<typeof busy>, fn: () => Promise<T>): Promise<T | undefined> {
    setBusy(kind);
    setError(null);
    try {
      const result = await fn();
      return result;
    } catch (err) {
      setError(transportErrorMessage(err, GROUP_WORDING));
      setBusy(null);
      return undefined;
    }
  }

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    if (body.trim().length === 0) return;
    const result = await run("message", () => trpc.clientView.groups.message.mutate({ groupId: group.id, body: body.trim() }));
    if (result?.status === "posted") {
      setBody("");
      router.refresh();
    } else if (result) {
      setError(result.status === "forbidden" ? "You are not a member of this group." : "This group is closed to new messages.");
      setBusy(null);
    }
  }

  async function confirm() {
    const result = await run("confirm", () => trpc.clientView.groups.confirm.mutate({ groupId: group.id }));
    if (result?.status === "confirmed") router.refresh();
    else if (result) {
      setError("This group can no longer take confirmations.");
      setBusy(null);
    }
  }

  async function finalize() {
    setFinalizeNote(null);
    const result = await run("finalize", () => trpc.clientView.groups.finalize.mutate({ groupId: group.id }));
    if (!result) return;
    if (result.status === "finalized") {
      router.refresh();
      return;
    }
    setBusy(null);
    if (result.status === "awaiting_confirmations") {
      setFinalizeNote(
        `Waiting on ${result.pending.length} member${result.pending.length === 1 ? "" : "s"}: ${result.pending.map((p) => p.name).join(", ")}.`,
      );
    } else {
      setError(result.status === "forbidden" ? "Only the organizer can finalize this group." : "This group can no longer be finalized.");
    }
  }

  async function cancel() {
    const result = await run("cancel", () => trpc.clientView.groups.cancel.mutate({ groupId: group.id }));
    if (result?.status === "cancelled") router.refresh();
    else if (result) {
      setError("This group can no longer be cancelled.");
      setBusy(null);
    }
  }

  function copyInvite() {
    const url = `${window.location.origin}/view/groups/join/${group.inviteToken}`;
    void navigator.clipboard?.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <>
      <header className="tf-client-head">
        <p className="tf-eyebrow">Group trip</p>
        <h1 data-testid="group-detail-title">{group.title}</h1>
        <p>
          <span className="tf-item-kind">{group.tripTitle}</span>
          {group.tripToken ? (
            <>
              {" · "}
              <Link href={`/view/${group.tripToken}`} data-testid="group-detail-view-trip">
                View trip
              </Link>
            </>
          ) : null}
          {" · "}
          <span className="tf-badge" data-testid="group-detail-status">
            {STATUS_LABEL[group.status]}
          </span>
        </p>
      </header>

      {forming ? (
        <section className="tf-card" data-testid="group-invite-card">
          <p className="tf-eyebrow">Invite</p>
          <h2>Invite verified members</h2>
          <p className="tf-field-hint">Share this link — only verified premium members can join.</p>
          <p>
            <code data-testid="group-invite-path">/view/groups/join/{group.inviteToken}</code>
          </p>
          <button type="button" className="tf-btn tf-btn--ghost" onClick={copyInvite} data-testid="group-invite-copy">
            {copied ? "Copied!" : "Copy invite link"}
          </button>
        </section>
      ) : null}

      <section className="tf-card" data-testid="group-roster-card">
        <p className="tf-eyebrow">Who&rsquo;s in</p>
        <h2>
          Members{" "}
          <span className="tf-badge" data-testid="group-confirm-summary">
            {group.members.filter((m) => m.confirmationStatus === "confirmed").length}/{group.members.length} confirmed
          </span>
        </h2>
        <ul className="tf-items tf-client-items" data-testid="group-roster">
          {group.members.map((member) => (
            <li key={member.userId}>
              <span className="d" aria-hidden="true" />
              <span className="tf-client-item">
                <span>
                  <span className="tf-item-kind">{member.role === "organizer" ? "Organizer" : "Member"}</span>: {member.name}
                </span>
              </span>
              <span
                className={member.confirmationStatus === "confirmed" ? "tf-badge tf-price--booked" : "tf-badge"}
                data-testid="group-member-confirmation"
              >
                {member.confirmationStatus === "confirmed" ? "Confirmed" : "Pending"}
              </span>
            </li>
          ))}
        </ul>
        {group.allConfirmed ? (
          <p className="tf-field-hint" data-testid="group-all-confirmed">Everyone has confirmed.</p>
        ) : null}
      </section>

      <section className="tf-card" data-testid="group-chat-card">
        <p className="tf-eyebrow">Group chat</p>
        <h2>Messages</h2>
        {group.messages.length === 0 ? (
          <p className="tf-empty-day" data-testid="group-chat-empty">No messages yet — say hello to the group.</p>
        ) : (
          <ul className="tf-items" data-testid="group-chat-messages">
            {group.messages.map((message) => (
              <li key={message.id} data-testid="group-chat-message">
                <span className="tf-item-kind">{message.senderName}</span>: {message.body}
              </li>
            ))}
          </ul>
        )}
        {group.status !== "cancelled" ? (
          <form onSubmit={sendMessage} className="tf-chat-form" data-testid="group-chat-form">
            <input
              type="text"
              value={body}
              maxLength={2000}
              placeholder="Message the group…"
              onChange={(e) => setBody(e.target.value)}
              data-testid="group-chat-input"
            />
            <button type="submit" className="tf-btn tf-btn--cta" disabled={busy === "message" || body.trim().length === 0} data-testid="group-chat-send">
              {busy === "message" ? "Sending…" : "Send"}
            </button>
          </form>
        ) : null}
      </section>

      {forming ? (
        <section className="tf-card" data-testid="group-actions-card">
          <p className="tf-eyebrow">Ready?</p>
          <h2>Confirm &amp; finalize</h2>
          {group.myConfirmation === "pending" ? (
            <button type="button" className="tf-btn tf-btn--cta" onClick={confirm} disabled={busy === "confirm"} data-testid="group-confirm-btn">
              {busy === "confirm" ? "Confirming…" : "I’m in — confirm"}
            </button>
          ) : (
            <p className="tf-field-hint" data-testid="group-confirmed-note">You&rsquo;ve confirmed. {group.iAmOrganizer ? "Finalize once everyone else is in." : "Waiting for the organizer to finalize."}</p>
          )}
          {group.iAmOrganizer ? (
            <div className="tf-client-fork-choices">
              <button type="button" className="tf-btn tf-btn--cta" onClick={finalize} disabled={busy === "finalize"} data-testid="group-finalize-btn">
                {busy === "finalize" ? "Finalizing…" : "Finalize trip"}
              </button>
              <button type="button" className="tf-btn tf-btn--ghost" onClick={cancel} disabled={busy === "cancel"} data-testid="group-cancel-btn">
                {busy === "cancel" ? "Cancelling…" : "Cancel group"}
              </button>
            </div>
          ) : null}
          {finalizeNote ? (
            <p className="tf-field-hint" role="status" data-testid="group-finalize-note">
              {finalizeNote}
            </p>
          ) : null}
        </section>
      ) : (
        <section className="tf-card" data-testid="group-outcome-card">
          <p className="tf-eyebrow">{group.status === "finalized" ? "All set" : "Group closed"}</p>
          <h2>{group.status === "finalized" ? "This trip is finalized" : "This group was cancelled"}</h2>
          <p className="tf-field-hint">
            {group.status === "finalized"
              ? "Everyone confirmed. Each member can book their part of the trip from the trip page."
              : "The organizer cancelled this group. Your existing trips are unaffected."}
          </p>
        </section>
      )}

      {error ? (
        <p className="tf-field-hint" role="alert" data-testid="group-detail-error">
          {error}
        </p>
      ) : null}
    </>
  );
}
