// Generalized transport/authorization failure → human message mapping (spec 009
// research D6) — the one shape every browser feature calling the workspace tRPC
// surface shares. UNAUTHORIZED and the network fallback read the same everywhere;
// FORBIDDEN/BAD_REQUEST (and optionally NOT_FOUND) carry feature wording. Pure and
// DOM-free so the exact strings are pinned by L1 tests (contract §3); raw error
// text never passes through (FR-006).
import { TRPCClientError } from "@trpc/client";

export interface TransportWording {
  forbidden: string;
  badRequest: string;
  notFound?: string;
}

const SESSION_EXPIRED = "Your session has expired. Please sign in again.";
const NETWORK_FALLBACK = "Could not reach the server. Check your connection and try again.";

export function transportErrorMessage(error: unknown, wording: TransportWording): string {
  if (error instanceof TRPCClientError) {
    const code: unknown = error.data?.code;
    if (code === "UNAUTHORIZED") {
      return SESSION_EXPIRED;
    }
    if (code === "FORBIDDEN") {
      return wording.forbidden;
    }
    if (code === "BAD_REQUEST") {
      return wording.badRequest;
    }
    if (code === "NOT_FOUND" && wording.notFound !== undefined) {
      return wording.notFound;
    }
  }
  return NETWORK_FALLBACK;
}
