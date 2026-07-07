// T002 / US1 (FR-006, Constitution Compliance & Content Sourcing): a MediaRef is a
// reference (needs a storageKey OR url) whose `source` is a CLOSED, licensed-only
// enum — there is deliberately no member that could represent scraped or
// AI-fabricated-as-real imagery, so such a value must fail validation.
import { describe, it, expect } from "vitest";
import { MediaRefSchema } from "../index.js";

const validImage = {
  id: "m1",
  kind: "image" as const,
  storageKey: "media/lisbon/hotel1.jpg",
  source: "licensed-stock" as const,
  alt: "Hotel facade",
};

describe("MediaRef (US1, FR-006)", () => {
  it("accepts a licensed image referenced by storageKey", () => {
    expect(MediaRefSchema.safeParse(validImage).success).toBe(true);
  });

  it("accepts an official embed referenced by url", () => {
    const embed = { id: "e1", kind: "embed", url: "https://example.com/embed/1", source: "official-embed", alt: "Embed" };
    expect(MediaRefSchema.safeParse(embed).success).toBe(true);
  });

  it("rejects a media ref with neither storageKey nor url", () => {
    const { storageKey: _drop, ...noRef } = validImage;
    expect(MediaRefSchema.safeParse(noRef).success).toBe(false);
  });

  it("rejects a scraped/fabricated source not in the licensed enum (Constitution Compliance)", () => {
    expect(MediaRefSchema.safeParse({ ...validImage, source: "scraped" }).success).toBe(false);
    expect(MediaRefSchema.safeParse({ ...validImage, source: "ai-generated" }).success).toBe(false);
  });

  it("rejects an empty alt text (accessibility + provenance discipline)", () => {
    expect(MediaRefSchema.safeParse({ ...validImage, alt: "" }).success).toBe(false);
  });
});
