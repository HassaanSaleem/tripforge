// L1 — destination grounding contract (web-search stopgap). The FakeLLM is
// deterministic: `failed` unless a catalog is scripted, so the keyless stack
// and every existing planner test keep their procedural supply unchanged. The
// zod schema is the validation boundary the real submit tool relies on.
import { describe, expect, it } from "vitest";
import { FakeLLM } from "../fake.js";
import { DestinationCatalogSchema, type DestinationCatalog } from "../destination-catalog.js";

const CATALOG: DestinationCatalog = {
  hotels: [{ name: "Shangrila Resort Skardu", description: "Lakeside resort.", nightlyRateMinor: 18_000 }],
  activities: [{ name: "Deosai National Park day-trip", description: "High-altitude plateau.", priceMinor: 6_000, durationMinutes: 480 }],
  transfers: [{ name: "Skardu Airport private transfer", priceMinor: 4_000, mode: "private" }],
};

describe("FakeLLM.discoverDestinationCatalog", () => {
  it("returns failed by default (keyless stack falls back to procedural supply)", async () => {
    const llm = new FakeLLM();
    const result = await llm.discoverDestinationCatalog({
      purpose: "test",
      destination: "Skardu",
      currency: "USD",
      nights: 6,
      party: { adults: 2, children: 0 },
    });
    expect(result.status).toBe("failed");
    expect(llm.catalogCalls).toHaveLength(1);
    expect(llm.catalogCalls[0]?.destination).toBe("Skardu");
  });

  it("returns a scripted catalog in order", async () => {
    const llm = new FakeLLM({ catalogScripts: [{ status: "discovered", catalog: CATALOG, usage: { inputTokens: 0, outputTokens: 0 } }] });
    const first = await llm.discoverDestinationCatalog({ purpose: "test", destination: "Skardu", currency: "USD", nights: 6, party: { adults: 2, children: 0 } });
    expect(first.status).toBe("discovered");
    if (first.status === "discovered") {
      expect(first.catalog.hotels[0]?.name).toBe("Shangrila Resort Skardu");
    }
    // Script exhausted → back to failed.
    const second = await llm.discoverDestinationCatalog({ purpose: "test", destination: "Hunza", currency: "USD", nights: 4, party: { adults: 2, children: 0 } });
    expect(second.status).toBe("failed");
  });
});

describe("DestinationCatalogSchema", () => {
  it("accepts a well-formed catalog", () => {
    expect(DestinationCatalogSchema.safeParse(CATALOG).success).toBe(true);
  });

  it("rejects an empty hotel name and a non-integer price", () => {
    expect(DestinationCatalogSchema.safeParse({ ...CATALOG, hotels: [{ ...CATALOG.hotels[0], name: "" }] }).success).toBe(false);
    expect(DestinationCatalogSchema.safeParse({ ...CATALOG, transfers: [{ ...CATALOG.transfers[0], priceMinor: 40.5 }] }).success).toBe(false);
  });
});
