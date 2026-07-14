// Typed browser tRPC client (spec 008 research D1/D3) — the one way web client
// components call the server, over the SAME mounted /api/trpc surface mobile
// will consume (INV-018). Browser-only module: the relative same-origin URL
// carries the Better Auth session cookie automatically. No transformer — the
// server's initTRPC configures none.
import { createTRPCClient, httpBatchLink, httpSubscriptionLink, splitLink } from "@trpc/client";
import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import { inferSubscriptionOutput } from "@trpc/server";
import type { AppRouter } from "@tripforge/api";

/**
 * Subscriptions (itinerary.draft, spec 016 — INV-028 streaming) ride SSE via
 * httpSubscriptionLink; everything else keeps the existing batched
 * httpBatchLink. Same same-origin /api/trpc surface either way (INV-018).
 */
export const trpc = createTRPCClient<AppRouter>({
  links: [
    splitLink({
      condition: (op) => op.type === "subscription",
      true: httpSubscriptionLink({ url: "/api/trpc" }),
      false: httpBatchLink({ url: "/api/trpc" }),
    }),
  ],
});

/**
 * Draft input/event types via router inference (research D5): the server's
 * DraftEvent/TripRequest stay accessed only via inference here — the
 * PACKAGE-BOUNDARY export in packages/api/src/index.ts exists solely to
 * satisfy TS4023 declaration emit, not as a direct import surface for this
 * client (QS3-1 premature-export spirit preserved). Spec 019: `draft` is now
 * compare-only (1-3 unpersisted options); `selectDraft` persists the picked
 * one, mirroring the pre-spec-019 single-draft outcome shape exactly.
 */
export type DraftInput = inferRouterInputs<AppRouter>["workspace"]["itinerary"]["draft"];
export type DraftEvent = inferSubscriptionOutput<AppRouter["workspace"]["itinerary"]["draft"]>;
export type DraftOutput = Extract<DraftEvent, { type: "result" }>["outcome"];
export type DraftedOptions = Extract<DraftOutput, { status: "drafted" }>["options"];
export type DraftOption = DraftedOptions[number];

export type SelectDraftInput = inferRouterInputs<AppRouter>["workspace"]["itinerary"]["selectDraft"];
export type SelectDraftEvent = inferSubscriptionOutput<AppRouter["workspace"]["itinerary"]["selectDraft"]>;
export type SelectDraftOutput = Extract<SelectDraftEvent, { type: "result" }>["outcome"];

/**
 * Chat-edit input/outcome types via the same inference (spec 020): the
 * server's ChatEditOutcome/ApplyChatEditOutcome unions stay un-exported;
 * inference keeps the browser exactly in sync with the deployed contract.
 */
export type ChatEditInput = inferRouterInputs<AppRouter>["workspace"]["itinerary"]["chatEdit"];
export type ChatEditEvent = inferSubscriptionOutput<AppRouter["workspace"]["itinerary"]["chatEdit"]>;
export type ChatEditOutput = Extract<ChatEditEvent, { type: "result" }>["outcome"];
export type HotelSuggestion = Extract<ChatEditOutput, { status: "suggested" }>["suggestions"][number];
export type ApplyChatEditInput = inferRouterInputs<AppRouter>["workspace"]["itinerary"]["applyChatEdit"];
export type ApplyChatEditOutput = inferRouterOutputs<AppRouter>["workspace"]["itinerary"]["applyChatEdit"];

/**
 * Booking input/outcome types via the same inference (spec 009 research D1):
 * the server's quote/book outcome unions stay un-exported; inference keeps the
 * browser exactly in sync with the deployed money-path contract.
 */
export type QuoteInput = inferRouterInputs<AppRouter>["workspace"]["booking"]["quote"];
export type QuoteOutput = inferRouterOutputs<AppRouter>["workspace"]["booking"]["quote"];
export type BookInput = inferRouterInputs<AppRouter>["workspace"]["booking"]["book"];
export type BookOutput = inferRouterOutputs<AppRouter>["workspace"]["booking"]["book"];

/**
 * Marketplace + picker types via the same inference (spec 011 research D1):
 * the trade-layer outcome unions and the my-itineraries projection stay
 * un-exported server-side; inference keeps the browser exactly in sync.
 */
export type BrowseListingsOutput = inferRouterOutputs<AppRouter>["workspace"]["marketplace"]["browseListings"];
export type CreateListingInput = inferRouterInputs<AppRouter>["workspace"]["marketplace"]["createListing"];
export type CreateListingOutput = inferRouterOutputs<AppRouter>["workspace"]["marketplace"]["createListing"];
export type LicenseListingOutput = inferRouterOutputs<AppRouter>["workspace"]["marketplace"]["licenseListing"];
export type RateListingOutput = inferRouterOutputs<AppRouter>["workspace"]["marketplace"]["rateListing"];
export type DeactivateListingOutput = inferRouterOutputs<AppRouter>["workspace"]["marketplace"]["deactivateListing"];
export type MyItinerariesOutput = inferRouterOutputs<AppRouter>["workspace"]["itinerary"]["list"];

/**
 * Itinerary overview via the same inference (spec 012 research D4): the
 * workspace list's open/continue view renders the canonical document and
 * booking summaries exactly as the deployed contract returns them.
 */
export type GetItineraryOutput = inferRouterOutputs<AppRouter>["workspace"]["itinerary"]["get"];

/**
 * Content library types via the same inference (spec 015 contracts §1-5):
 * the media asset shape and attach/detach outcomes stay un-exported
 * server-side; inference keeps the browser exactly in sync.
 */
export type MediaListOutput = inferRouterOutputs<AppRouter>["workspace"]["media"]["list"];
export type MediaAsset = MediaListOutput["assets"][number];
export type RegisterMediaInput = inferRouterInputs<AppRouter>["workspace"]["media"]["register"];
export type RegisterMediaOutput = inferRouterOutputs<AppRouter>["workspace"]["media"]["register"];
/** Real upload (spec 027 contracts §1, seed-0022a). */
export type UploadMediaInput = inferRouterInputs<AppRouter>["workspace"]["media"]["upload"];
export type UploadMediaOutput = inferRouterOutputs<AppRouter>["workspace"]["media"]["upload"];
export type AttachMediaInput = inferRouterInputs<AppRouter>["workspace"]["itinerary"]["attachMedia"];
export type AttachMediaOutput = inferRouterOutputs<AppRouter>["workspace"]["itinerary"]["attachMedia"];

/**
 * Agent Home dashboard aggregate via the same inference (spec 017): the
 * GBV/earnings/counts/recent-activity shape stays un-exported server-side;
 * inference keeps the browser exactly in sync.
 */
export type DashboardStatsOutput = inferRouterOutputs<AppRouter>["workspace"]["dashboard"]["stats"];

/**
 * Group travel types via the same inference (spec 021 contracts §1-4): the
 * post/browse/join outcome unions stay un-exported server-side; inference
 * keeps the browser exactly in sync with the deployed contract.
 */
export type PostGroupDepartureInput = inferRouterInputs<AppRouter>["workspace"]["groupTravel"]["post"];
export type PostGroupDepartureOutput = inferRouterOutputs<AppRouter>["workspace"]["groupTravel"]["post"];
export type CancelGroupDepartureOutput = inferRouterOutputs<AppRouter>["workspace"]["groupTravel"]["cancel"];
export type BrowseGroupDeparturesOutput = inferRouterOutputs<AppRouter>["workspace"]["groupTravel"]["browse"];
export type JoinGroupDepartureInput = inferRouterInputs<AppRouter>["workspace"]["groupTravel"]["join"];
export type JoinGroupDepartureOutput = inferRouterOutputs<AppRouter>["workspace"]["groupTravel"]["join"];

/**
 * Trip handoff request types via the same inference (spec 022 contracts
 * §1-3): the "Trip requests" inbox.
 */
export type ListTripHandoffsOutput = inferRouterOutputs<AppRouter>["workspace"]["tripHandoffs"]["list"];
export type AcceptTripHandoffOutput = inferRouterOutputs<AppRouter>["workspace"]["tripHandoffs"]["accept"];
