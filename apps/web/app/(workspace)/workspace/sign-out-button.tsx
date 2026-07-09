// Sign-out (spec 007 US3/FR-007) — ends the Better Auth session, then lands on
// /sign-in with server components re-reading the (now anonymous) session.
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "../../../lib/auth-client.js";

export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleSignOut() {
    setPending(true);
    await signOut();
    router.push("/sign-in");
    router.refresh();
  }

  return (
    <button type="button" onClick={handleSignOut} disabled={pending}>
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}
