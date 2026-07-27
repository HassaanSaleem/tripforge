// Invite-join panel (spec 040). Brand-neutral consumer client component
// (INV-024) driving clientView.groups.verify/join. An ineligible traveller is
// prompted to become a verified premium member first (the same v0 stub as the
// landing panel); the join returns a VALUE the panel renders as guidance and, on
// success, routes into the group.
"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { trpc } from "../../../../../../lib/trpc/client.js";
import { transportErrorMessage } from "../../../../../../lib/transport-error.js";

const GROUP_WORDING = {
  forbidden: "You don’t have access to do that.",
  badRequest: "That didn’t look right — please try again.",
} as const;

export function JoinGroupPanel({ inviteToken, eligible }: { inviteToken: string; eligible: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<null | "verify" | "join">(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function becomeVerified() {
    setBusy("verify");
    setError(null);
    try {
      await trpc.clientView.groups.verify.mutate();
      router.refresh();
    } catch (err) {
      setError(transportErrorMessage(err, GROUP_WORDING));
      setBusy(null);
    }
  }

  async function join() {
    setBusy("join");
    setError(null);
    setNotice(null);
    try {
      const result = await trpc.clientView.groups.join.mutate({ inviteToken });
      if (result.status === "joined") {
        router.push(`/view/groups/${result.groupId}`);
        return;
      }
      setBusy(null);
      if (result.status === "not_eligible") {
        setNotice("You need to be a verified premium member to join. Verify above, then join.");
        router.refresh();
      } else if (result.status === "not_found") {
        setError("This invite link isn’t valid.");
      } else {
        setError("This group is no longer open to new members.");
      }
    } catch (err) {
      setError(transportErrorMessage(err, GROUP_WORDING));
      setBusy(null);
    }
  }

  return (
    <section className="tf-card" data-testid="group-join-card">
      {!eligible ? (
        <>
          <p className="tf-eyebrow">Verified members only</p>
          <h2>First, become a verified premium member</h2>
          <p>Group trips are for verified, identity-validated premium members. Verify once, then join any group.</p>
          <button type="button" className="tf-btn tf-btn--cta" onClick={becomeVerified} disabled={busy === "verify"} data-testid="group-join-verify">
            {busy === "verify" ? "Verifying…" : "Verify & go premium"}
          </button>
        </>
      ) : (
        <>
          <p className="tf-eyebrow">Ready to join</p>
          <h2>Join this group</h2>
          <p>You&rsquo;ll be able to chat with the group and confirm you&rsquo;re in.</p>
          <button type="button" className="tf-btn tf-btn--cta" onClick={join} disabled={busy === "join"} data-testid="group-join-btn">
            {busy === "join" ? "Joining…" : "Join group"}
          </button>
        </>
      )}
      {notice ? (
        <p className="tf-field-hint" role="status" data-testid="group-join-notice">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p className="tf-field-hint" role="alert" data-testid="group-join-error">
          {error}
        </p>
      ) : null}
      <p>
        <Link href="/view/groups" className="tf-link-btn">
          Back to my groups
        </Link>
      </p>
    </section>
  );
}
