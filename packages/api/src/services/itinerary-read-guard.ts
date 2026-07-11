// Classifies what parseItinerary (INV-001 boundary re-validation) can throw,
// shared by every read-path call site that must distinguish "this stored
// document fails current-schema re-validation" from a genuine server fault
// (seed-0021). Duck-typed, not `instanceof ZodError`: @tripforge/itinerary-schema
// pins zod v3 while packages/api pins zod v4 — two distinct installed
// packages in the pnpm workspace, so a ZodError thrown by ItinerarySchema.parse
// is not an `instanceof` match against api's own "zod" import. `.name` +
// `.issues` is the part of zod's error shape stable across both majors.
interface ZodErrorShape extends Error {
  issues: Array<{ path: PropertyKey[]; message: string }>;
}

function asZodErrorShape(err: unknown): ZodErrorShape | undefined {
  if (!(err instanceof Error) || err.name !== "ZodError") return undefined;
  const issues = (err as unknown as { issues?: unknown }).issues;
  return Array.isArray(issues) ? (err as unknown as ZodErrorShape) : undefined;
}

export function isItineraryValidationError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (err.message.startsWith("unknown itinerary schemaVersion")) return true;
  return asZodErrorShape(err) !== undefined;
}

/** Safe one-line summary for logs — issue count + first path, never a raw
 * stack and never the document's own field values. */
export function summarizeItineraryValidationError(err: unknown): string {
  const zodErr = asZodErrorShape(err);
  if (zodErr) {
    const first = zodErr.issues[0];
    const path = first ? (first.path.length > 0 ? first.path.join(".") : "(root)") : "(unknown)";
    return `${zodErr.issues.length} issue(s), first at ${path}: ${first?.message ?? ""}`;
  }
  if (err instanceof Error) return err.message;
  return "unknown validation error";
}
