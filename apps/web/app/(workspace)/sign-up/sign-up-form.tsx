// Self-serve sign-up (spec 007 US2/FR-003) — the ratified P0 onboarding path
// (iteration-2 IMP-1): create the account, create the agency (caller becomes
// owner), set it active, land in the workspace. Three sequential calls against
// the existing Better Auth endpoints (research D2); each failure surfaces a
// human-readable message and stops the chain (FR-004).
"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createAndActivateAgency, signUpWithEmail } from "../../../lib/auth-client.js";

/** URL-safe slug from the agency name + random suffix (org slugs are unique). */
function agencySlug(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const suffix = Math.random().toString(36).slice(2, 8);
  return base ? `${base}-${suffix}` : `agency-${suffix}`;
}

export function SignUpForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [agencyName, setAgencyName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const signUpError = await signUpWithEmail(name, email, password);
    if (signUpError) {
      setError(signUpError);
      setPending(false);
      return;
    }

    const agencyError = await createAndActivateAgency(agencyName, agencySlug(agencyName));
    if (agencyError) {
      setError(agencyError);
      setPending(false);
      return;
    }

    router.push("/workspace");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "grid", gap: "0.75rem", maxWidth: 360 }}>
      <label htmlFor="name">
        Your name
        <input
          id="name"
          name="name"
          type="text"
          required
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ display: "block", width: "100%" }}
        />
      </label>
      <label htmlFor="email">
        Email
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ display: "block", width: "100%" }}
        />
      </label>
      <label htmlFor="password">
        Password
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{ display: "block", width: "100%" }}
        />
      </label>
      <label htmlFor="agencyName">
        Agency name
        <input
          id="agencyName"
          name="agencyName"
          type="text"
          required
          value={agencyName}
          onChange={(e) => setAgencyName(e.target.value)}
          style={{ display: "block", width: "100%" }}
        />
      </label>
      {error ? <p role="alert">{error}</p> : null}
      <button type="submit" disabled={pending}>
        {pending ? "Creating…" : "Create account & agency"}
      </button>
    </form>
  );
}
