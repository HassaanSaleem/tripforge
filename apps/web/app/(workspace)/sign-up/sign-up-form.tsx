// Self-serve sign-up (spec 007 US2/FR-003) — the ratified P0 onboarding path
// (iteration-2 IMP-1): create the account, create the agency (caller becomes
// owner), set it active, land in the workspace. Three sequential calls against
// the existing Better Auth endpoints (research D2); each failure surfaces a
// human-readable message and stops the chain (FR-004).
"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createAndActivateAgency, signUpWithEmail } from "../../../lib/auth-client.js";
import { CredentialsFields, useSubmitState } from "../auth-form.js";

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
  const { pending, error, run } = useSubmitState();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const signedUp = await run(() => signUpWithEmail(name, email, password));
    if (!signedUp) return;

    const agencyCreated = await run(() => createAndActivateAgency(agencyName, agencySlug(agencyName)));
    if (!agencyCreated) return;

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit}>
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
        />
      </label>
      <CredentialsFields
        email={email}
        onEmailChange={setEmail}
        password={password}
        onPasswordChange={setPassword}
        passwordAutoComplete="new-password"
      />
      <label htmlFor="agencyName">
        Agency name
        <input
          id="agencyName"
          name="agencyName"
          type="text"
          required
          value={agencyName}
          onChange={(e) => setAgencyName(e.target.value)}
        />
      </label>
      {error ? <p role="alert">{error}</p> : null}
      <button type="submit" className="tf-btn--cta" disabled={pending}>
        {pending ? "Creating…" : "Create account & agency"}
      </button>
    </form>
  );
}
