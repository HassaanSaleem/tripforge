// Traveler marketplace browse grid (spec 041; GOAL.md D2.7). Client component:
// renders the traveler-safe listing cards (clientView.marketplace.browse) and
// forks a chosen listing (clientView.marketplace.fork), then navigates to the
// copy's /view/[token] trip flow (self-book or request-agent). The page is
// signed-in gated (INV-023), so every render is an authenticated traveler.
// Brand-neutral (INV-020): each card carries its OWN selling agency's name,
// never platform branding, and shows client-safe figures only (the "from"
// total — never net rate, markup, license price, or revenue-share).
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { TravelerMarketplaceCard } from "@tripforge/api";
import { trpc } from "../../../../lib/trpc/client.js";
import { transportErrorMessage } from "../../../../lib/transport-error.js";
import { formatMinorAmount } from "../../../../lib/planner-form.js";

interface MarketplaceBrowseProps {
  cards: TravelerMarketplaceCard[];
}

type CardState = { phase: "idle" } | { phase: "forking" } | { phase: "error"; message: string };

export function MarketplaceBrowse({ cards }: MarketplaceBrowseProps) {
  const router = useRouter();
  const [states, setStates] = useState<Record<string, CardState>>({});

  async function handleFork(listingId: string) {
    setStates((s) => ({ ...s, [listingId]: { phase: "forking" } }));
    try {
      const outcome = await trpc.clientView.marketplace.fork.mutate({ listingId });
      if (outcome.status === "forked") {
        // Land on the copy's own trip view — the self-book / request-agent fork.
        router.push(outcome.path);
        return;
      }
      setStates((s) => ({
        ...s,
        [listingId]: { phase: "error", message: "This trip is no longer available." },
      }));
    } catch (err) {
      setStates((s) => ({
        ...s,
        [listingId]: {
          phase: "error",
          message: transportErrorMessage(err, {
            forbidden: "You need to be signed in to plan and book this trip.",
            badRequest: "That trip couldn't be opened. Please try again.",
          }),
        },
      }));
    }
  }

  if (cards.length === 0) {
    return (
      <section className="tf-card">
        <p className="tf-empty-day" data-testid="marketplace-empty">
          No trips are on the marketplace yet — check back soon.
        </p>
      </section>
    );
  }

  return (
    <div className="tf-market-grid" data-testid="marketplace-list">
      {cards.map((card) => {
        const state = states[card.listingId] ?? { phase: "idle" };
        return (
          <article className="tf-market-card" data-testid="marketplace-card" key={card.listingId}>
            <p className="tf-market-seller">
              {card.agencyName}
              {card.sellerVetted ? (
                <span className="tf-badge tf-badge--verified" data-testid="marketplace-vetted">
                  Verified
                </span>
              ) : null}
            </p>
            <h3>{card.title}</h3>
            {card.fromTotalMinor !== null ? (
              <p className="tf-price tf-market-price" data-testid="marketplace-from-price">
                from {formatMinorAmount(card.fromTotalMinor, card.currency)}
              </p>
            ) : null}
            <button
              type="button"
              className="tf-btn tf-btn--cta"
              data-testid="marketplace-fork"
              disabled={state.phase === "forking"}
              onClick={() => handleFork(card.listingId)}
            >
              {state.phase === "forking" ? "Preparing…" : "Plan & book this trip"}
            </button>
            {state.phase === "error" ? (
              <p className="tf-price-note" role="alert" data-testid="marketplace-error">
                {state.message}
              </p>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
