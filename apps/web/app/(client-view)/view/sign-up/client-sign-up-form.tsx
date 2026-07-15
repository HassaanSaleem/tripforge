// Traveler sign-up form (spec 030 FR-002, contracts §3, research D1). Calls
// ONLY `signUpWithEmail` — NEVER `createAndActivateAgency`, the one call the
// workspace sign-up form (sign-up-form.tsx) chains on to turn the caller
// into an agent. This single omission is the entire mechanism that keeps the
// resulting account a traveler; no separate "account type" field exists or
// is needed.
"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { signUpWithEmail } from "../../../../lib/auth-client.js";
import { CredentialsFields, useSubmitState } from "../../../../lib/auth-form.js";

export function ClientSignUpForm({ returnTo }: { returnTo: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { pending, error, run } = useSubmitState();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const signedUp = await run(() => signUpWithEmail(name, email, password));
    if (!signedUp) return;
    router.push(returnTo);
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
      {error ? <p role="alert">{error}</p> : null}
      <button type="submit" className="tf-btn--cta" disabled={pending}>
        {pending ? "Creating…" : "Create account"}
      </button>
    </form>
  );
}
