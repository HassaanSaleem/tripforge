// Group trips landing panel (spec 040). Brand-neutral consumer client component
// (INV-024) that drives the clientView.groups.* procedures over the same tRPC
// surface mobile will consume (INV-018): become a verified premium member (v0
// stub), create a group around one of your trips, and open any of your groups.
// Business refusals from the server are VALUES rendered as guidance, never thrown.
"use client";

import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { trpc, type GroupSummaryView } from "../../../../lib/trpc/client.js";
import { transportErrorMessage } from "../../../../lib/transport-error.js";

const GROUP_WORDING = {
  forbidden: "You don’t have access to do that.",
  badRequest: "That didn’t look right — please try again.",
} as const;

interface TripOption {
  token: string;
  title: string;
  agencyName: string;
}

interface GroupsPanelProps {
  eligible: boolean;
  groups: GroupSummaryView[];
  trips: TripOption[];
}

const STATUS_LABEL: Record<GroupSummaryView["status"], string> = {
  forming: "Forming",
  finalized: "Finalized",
  cancelled: "Cancelled",
};

export function GroupsPanel({ eligible, groups, trips }: GroupsPanelProps) {
  const router = useRouter();
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  const [token, setToken] = useState<string>(trips[0]?.token ?? "");
  const [title, setTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const canCreate = useMemo(() => token !== "" && title.trim().length > 0 && !creating, [token, title, creating]);

  async function becomeVerified() {
    setVerifying(true);
    setVerifyError(null);
    try {
      await trpc.clientView.groups.verify.mutate();
      router.refresh();
    } catch (err) {
      setVerifyError(transportErrorMessage(err, GROUP_WORDING));
      setVerifying(false);
    }
  }

  async function createGroup(event: FormEvent) {
    event.preventDefault();
    if (!canCreate) return;
    setCreating(true);
    setCreateError(null);
    try {
      const result = await trpc.clientView.groups.create.mutate({ token, title: title.trim() });
      if (result.status === "created") {
        router.push(`/view/groups/${result.groupId}`);
        return;
      }
      setCreateError(
        result.status === "not_eligible"
          ? "You need to be a verified premium member to create a group."
          : "That trip could not be found. Open it from My Trips first.",
      );
      setCreating(false);
    } catch (err) {
      setCreateError(transportErrorMessage(err, GROUP_WORDING));
      setCreating(false);
    }
  }

  return (
    <>
      {!eligible ? (
        <section className="tf-card" data-testid="groups-verify-card">
          <p className="tf-eyebrow">Verified members only</p>
          <h2>Become a verified premium member</h2>
          <p>
            Group trips are for <strong>verified, identity-validated premium members</strong> — so everyone in a
            group is a real, accountable traveller before anyone can post or join (a trust rule enforced on every
            action, not just a badge).
          </p>
          <p className="tf-field-hint">
            In this preview, verification is one tap. Identity checks and premium billing are wired in later — the
            rule that an unverified member can never post or join is already enforced.
          </p>
          <button
            type="button"
            className="tf-btn tf-btn--cta"
            onClick={becomeVerified}
            disabled={verifying}
            data-testid="groups-verify-btn"
          >
            {verifying ? "Verifying…" : "Verify & go premium"}
          </button>
          {verifyError ? (
            <p className="tf-field-hint" role="alert" data-testid="groups-verify-error">
              {verifyError}
            </p>
          ) : null}
        </section>
      ) : (
        <section className="tf-card" data-testid="groups-create-card">
          <p className="tf-eyebrow">Start a group</p>
          <h2>Create a group trip</h2>
          {trips.length === 0 ? (
            <p className="tf-empty-day" data-testid="groups-no-trips">
              You need a trip to build a group around. Open a trip your agent shared with you (it appears in{" "}
              <Link href="/view/my-trips">My Trips</Link>), then come back here.
            </p>
          ) : (
            <form onSubmit={createGroup} className="tf-client-request-form" data-testid="groups-create-form">
              <label>
                <span>Trip</span>
                <select value={token} onChange={(e) => setToken(e.target.value)} data-testid="groups-create-trip">
                  {trips.map((trip) => (
                    <option key={trip.token} value={trip.token}>
                      {trip.title} — {trip.agencyName}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Group name</span>
                <input
                  name="groupName"
                  type="text"
                  value={title}
                  maxLength={120}
                  placeholder="e.g. Anand family — Lisbon"
                  onChange={(e) => setTitle(e.target.value)}
                  data-testid="groups-create-name"
                  required
                />
              </label>
              <button type="submit" className="tf-btn tf-btn--cta" disabled={!canCreate} data-testid="groups-create-submit">
                {creating ? "Creating…" : "Create group"}
              </button>
              {createError ? (
                <p className="tf-field-hint" role="alert" data-testid="groups-create-error">
                  {createError}
                </p>
              ) : null}
            </form>
          )}
        </section>
      )}

      <section className="tf-card" data-testid="groups-my-list-card">
        <p className="tf-eyebrow">Your groups</p>
        <h2>My groups</h2>
        {groups.length === 0 ? (
          <p className="tf-empty-day" data-testid="groups-empty">
            You&rsquo;re not in any group yet. Create one above, or open an invite link a friend sent you.
          </p>
        ) : (
          <ul className="tf-items tf-client-items" data-testid="groups-list">
            {groups.map((group) => (
              <li key={group.id}>
                <span className="d" aria-hidden="true" />
                <Link href={`/view/groups/${group.id}`} className="tf-client-item" data-testid="groups-row">
                  <span>
                    <span className="tf-item-kind">{group.tripTitle}</span>: {group.title}
                  </span>
                </Link>
                <span className="tf-badge" data-testid="groups-row-status">
                  {STATUS_LABEL[group.status]} · {group.confirmedCount}/{group.memberCount} in
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
