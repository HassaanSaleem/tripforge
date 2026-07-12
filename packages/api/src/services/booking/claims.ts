// Hold-claim persistence (seed-0015 claim-order discipline). Isolated from
// the quote and book flows because the id-ordered locking discipline here is
// a distinct, reused-elsewhere invariant: every multi-row lock acquisition on
// booking_quote (the recording transaction's FK KEY SHARE, the re-established
// supplier_quote_id updates, and claim release) must take its locks in the
// SAME id order the claim gate uses, or writers deadlock (40P01).
import { inArray, bookingQuote as bookingQuoteTable } from "@tripforge/db";
import type { Container } from "../../context.js";

/** Take FOR UPDATE locks on the given booking_quote rows in CLAIM ORDER —
 * ascending id, the exact order the claim gate locks in — so the caller's
 * subsequent writes to those rows can never form a lock cycle with a
 * concurrent claimant (seed-0015). Structural executor: a transaction or a
 * Db, same as PmfEventExecutor. */
export async function lockQuoteRowsInClaimOrder(
  tx: Pick<NonNullable<Container["db"]>, "select">,
  quoteRowIds: string[],
): Promise<void> {
  if (quoteRowIds.length === 0) return;
  await tx
    .select({ id: bookingQuoteTable.id })
    .from(bookingQuoteTable)
    .where(inArray(bookingQuoteTable.id, quoteRowIds))
    .orderBy(bookingQuoteTable.id)
    .for("update");
}

/** Release claimed-but-unbooked holds: `consumed_at` back to NULL, returning
 * them to bookable. Only ever called on rows this request claimed, so no
 * concurrent booking can hold them (research D12) — but a concurrent claim
 * gate's sibling lock set spans consumed rows too, so the release must not
 * let a bare multi-row UPDATE take row locks in arbitrary plan order: it
 * locks the row set in claim order first (seed-0015). */
export async function releaseClaims(db: NonNullable<Container["db"]>, quoteRowIds: string[]): Promise<void> {
  if (quoteRowIds.length === 0) return;
  await db.transaction(async (tx) => {
    await lockQuoteRowsInClaimOrder(tx, quoteRowIds);
    await tx.update(bookingQuoteTable).set({ consumedAt: null }).where(inArray(bookingQuoteTable.id, quoteRowIds));
  });
}
