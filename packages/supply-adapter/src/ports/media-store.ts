// Agency media library port (spec 015: content library v0). Unlike the
// bookable-component ports (hotel/activity/transfer/car-rental), there is no
// quote-then-book lifecycle here — a media asset is registered metadata, not
// an offer with a price hold (research D1: SupplyPort<Criteria,Offer,Quote>
// does not fit a storage repository, so this is a smaller, dedicated shape).
// v0 is URL-registration only (research D2): no binary ever crosses this
// boundary, so INV-025 (binaries never in the itinerary document) holds
// trivially. `source` mirrors itinerary-schema's closed MediaSource enum —
// redeclared locally so this package stays independent of
// @tripforge/itinerary-schema (no existing port imports it).
export type MediaSource = "licensed-stock" | "official-embed" | "agent-upload" | "traveler-ugc";
export type MediaKind = "image" | "video" | "embed";

export interface MediaAsset {
  id: string;
  agencyId: string;
  source: MediaSource;
  kind: MediaKind;
  url: string;
  alt: string;
  attribution?: string;
  createdAt: string; // ISO datetime
}

export interface RegisterMediaInput {
  agencyId: string;
  source: MediaSource;
  kind: MediaKind;
  url: string;
  alt: string;
  attribution?: string;
}

export type RegisterMediaOutcome =
  | { status: "registered"; asset: MediaAsset }
  | { status: "refused"; reason: "invalid_source" };

/**
 * The agency media library port. Handlers depend on THIS type, never a
 * concrete adapter class (clean-arch: "handlers depend on the port type").
 * `list`/`get` are tenant-scoped by construction — every implementation
 * MUST filter by `agencyId`, never return another agency's rows (INV-004).
 */
export interface MediaStorePort {
  register(input: RegisterMediaInput): Promise<RegisterMediaOutcome>;
  list(agencyId: string): Promise<MediaAsset[]>;
  get(agencyId: string, mediaAssetId: string): Promise<MediaAsset | null>;
}
