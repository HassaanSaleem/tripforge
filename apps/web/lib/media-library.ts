// Pure display helpers for the content library (spec 015). DOM-free so the
// exact strings are pinned by L1 tests. No money logic here — this feature
// carries no pricing.
import { transportErrorMessage } from "./transport-error.js";

const SOURCE_LABELS: Record<string, string> = {
  "licensed-stock": "Licensed stock",
  "official-embed": "Official embed",
  "agent-upload": "Your upload",
  "traveler-ugc": "Traveler photo",
};

export function mediaSourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? source;
}

const KIND_LABELS: Record<string, string> = {
  image: "Image",
  video: "Video",
  embed: "Embed",
};

export function mediaKindLabel(kind: string): string {
  return KIND_LABELS[kind] ?? kind;
}

export function registerMediaErrorMessage(error: unknown): string {
  return transportErrorMessage(error, {
    forbidden: "Your media library requires an agency membership. Sign in with your agency account.",
    badRequest: "That source, kind, URL, or alt text isn't valid. Check the form and try again.",
  });
}

export function listMediaErrorMessage(error: unknown): string {
  return transportErrorMessage(error, {
    forbidden: "Your media library requires an agency membership. Sign in with your agency account.",
    badRequest: "The server rejected the request. Reload the page and try again.",
  });
}

export function attachMediaErrorMessage(error: unknown): string {
  return transportErrorMessage(error, {
    forbidden: "Your trips require an agency membership. Sign in with your agency account.",
    badRequest: "The server rejected the request. Reload the page and try again.",
    notFound: "That trip or media item is no longer available.",
  });
}
