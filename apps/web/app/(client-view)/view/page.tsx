// White-labeled CLIENT VIEW surface (travelers) — route group (client-view),
// INV-024. Carries the AGENT'S brand only; no TripForge/platform branding leaks in
// (INV-020). At the skeleton stage this is a neutral placeholder; real client views
// render a specific agency's brand + a shared itinerary.
export default function ClientViewPage() {
  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: "2rem", maxWidth: 720 }}>
      <h1>Your trip</h1>
      <p>
        This is the traveler-facing view. It shows your agent&apos;s branded proposal
        and itinerary — no platform branding appears here.
      </p>
    </main>
  );
}
