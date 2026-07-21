// Traveler-home sign-out (spec 033 FR-004). The workspace SignOutButton lands on
// the AGENT `/sign-in` and lives in the (workspace) route group; the trip-fork
// sign-out is an inline handler — neither is a reusable control that returns a
// traveler to their own surface. This one signs out via the same Better Auth
// `signOut()` and returns to `/view`, which then re-renders as the anonymous
// welcome (server component re-reading the now-anonymous session).
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "../../../lib/auth-client.js";

export function TravelerSignOut() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleSignOut() {
    setPending(true);
    await signOut();
    router.push("/view");
    router.refresh();
  }

  return (
    <button
      type="button"
      className="tf-link-btn"
      onClick={handleSignOut}
      disabled={pending}
      data-testid="home-sign-out"
    >
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}
