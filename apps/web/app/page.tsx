// Root landing. The two real experiences live in the (workspace) and (client-view)
// route groups (INV-024) — this page just points at them for the skeleton.
import Link from "next/link";

export default function HomePage() {
  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: "2rem", maxWidth: 640 }}>
      <h1>TripForge</h1>
      <p>AI-native itinerary platform — build, book, and trade trips.</p>
      <ul>
        <li>
          <Link href="/workspace">Agency workspace</Link> — for agents (sign-in required)
        </li>
        <li>
          <Link href="/view">Client view</Link> — white-labeled traveler experience
        </li>
      </ul>
    </main>
  );
}
