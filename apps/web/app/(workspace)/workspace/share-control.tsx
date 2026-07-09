// Workspace share control (spec 010 US2, contract §4) — client component
// driving the agent-gated workspace.itinerary.share mutation through the typed
// browser tRPC client. The server returns a PATH; the absolute URL is joined
// with the browser's own origin (research D5). Idempotent server-side: sharing
// again always shows the same durable link (FR-004). Renders inside a verified
// agent's drafted plan only (spec 009 composition precedent, INV-024); every
// user-visible failure string comes from the pure mapping helpers.
"use client";

import { useState } from "react";
import { trpc } from "../../../lib/trpc/client.js";
import { shareErrorMessage, shareUrl } from "../../../lib/share-control.js";

type ShareViewState =
  | { phase: "idle" }
  | { phase: "sharing" }
  | { phase: "shared"; url: string; copied: boolean }
  | { phase: "failed"; message: string };

export function ShareControl({ itineraryId }: { itineraryId: string }) {
  const [view, setView] = useState<ShareViewState>({ phase: "idle" });
  const sharing = view.phase === "sharing";

  async function handleShare() {
    if (sharing) return;
    setView({ phase: "sharing" });
    try {
      const outcome = await trpc.workspace.itinerary.share.mutate({ itineraryId });
      setView({
        phase: "shared",
        url: shareUrl(outcome.path, window.location.origin),
        copied: false,
      });
    } catch (error) {
      setView({ phase: "failed", message: shareErrorMessage(error) });
    }
  }

  async function handleCopy() {
    if (view.phase !== "shared") return;
    try {
      await navigator.clipboard.writeText(view.url);
      setView({ ...view, copied: true });
    } catch {
      // Clipboard can be denied by the browser; the URL stays selectable text.
    }
  }

  return (
    <section className="tf-card tf-share" data-testid="share-control">
      <h3>Share with your client</h3>
      <p>
        Send your client a private, read-only view of this trip — your brand, your
        prices, nothing else.
      </p>
      {view.phase === "shared" ? (
        <div className="tf-share-link">
          <code data-testid="share-url">{view.url}</code>
          <button type="button" className="tf-btn--ghost" onClick={handleCopy}>
            {view.copied ? "Copied!" : "Copy link"}
          </button>
        </div>
      ) : (
        <button type="button" onClick={handleShare} disabled={sharing}>
          {sharing ? "Creating link…" : "Share with client"}
        </button>
      )}
      {view.phase === "failed" ? <p role="alert">{view.message}</p> : null}
    </section>
  );
}
