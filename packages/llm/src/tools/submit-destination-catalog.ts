// submit_destination_catalog — the structured-output tool for
// discoverDestinationCatalog (mirrors submit_itinerary_drafts): its zod schema
// validates the model's web-search-grounded catalog at the tool boundary and
// feeds violations back for retry, so a malformed catalog is never accepted.
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { DestinationCatalogSchema, type DestinationCatalog } from "../destination-catalog.js";

export function submitDestinationCatalogTool(capture: (catalog: DestinationCatalog) => void) {
  return betaZodTool({
    name: "submit_destination_catalog",
    description:
      "Submit the FINAL destination catalog. Call exactly once, AFTER using web_search " +
      "to confirm the real places, with real named hotels, attractions, and airport " +
      "transfers for the requested destination. This ends the discovery session.",
    inputSchema: DestinationCatalogSchema,
    run: ({ hotels, activities, transfers }) => {
      capture({ hotels, activities, transfers });
      return "Catalog received. Discovery complete.";
    },
  });
}
