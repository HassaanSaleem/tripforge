// Pure display helper for the workspace "Trip requests" inbox (spec 022
// contract §2/§3). DOM-free so it can be L1-tested; no money logic (this
// feature has none).
import { transportErrorMessage } from "./transport-error.js";

export function tripHandoffsErrorMessage(error: unknown): string {
  return transportErrorMessage(error, {
    forbidden: "Trip requests require an agency membership. Sign in with your agency account.",
    badRequest: "The server rejected the request. Reload the page and try again.",
    notFound: "That request is no longer available.",
  });
}
