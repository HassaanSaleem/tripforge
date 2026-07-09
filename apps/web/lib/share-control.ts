// Pure view logic for the workspace share control (spec 010 contract §4):
// share path → absolute URL join, and transport/authorization failure → human
// message mapping (shared strings via transport-error.ts — research D5). DOM-free
// so it runs under the root Vitest node environment; the component may only
// display strings that come from here. The server returns a PATH — the serving
// origin is the browser's business (the alternate-port origin lesson, seed-0009a).
import { transportErrorMessage } from "./transport-error.js";

/**
 * Join the server-returned share path with the browser's own origin. The one
 * URL construction this feature performs — no config, no env, no server-side
 * origin guessing.
 */
export function shareUrl(path: string, origin: string): string {
  return new URL(path, origin).toString();
}

/**
 * Transport/authorization failures with share wording (contract §4). The share
 * mutation has no typed business failures — cross-tenant/unknown itineraries
 * surface as NOT_FOUND (FR-002).
 */
export function shareErrorMessage(error: unknown): string {
  return transportErrorMessage(error, {
    forbidden: "Sharing requires an agency membership. Sign in with your agency account.",
    badRequest: "The server rejected the share request. Draft the itinerary again and retry.",
    notFound: "This itinerary is no longer available in your workspace.",
  });
}
