// Traveler sign-in form (spec 030 FR-001/FR-007, contracts §2). Same Better
// Auth email+password endpoint the workspace sign-in drives
// (signInWithEmail, reused unchanged — no traveler-specific auth call
// exists or is needed); the only difference from the workspace form is the
// redirect target, which lands back on the shared trip page the traveler
// started from instead of the agent dashboard.
"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { signInWithEmail } from "../../../../lib/auth-client.js";
import { CredentialsFields, useSubmitState } from "../../../../lib/auth-form.js";

export function ClientSignInForm({ returnTo }: { returnTo: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { pending, error, run } = useSubmitState();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const ok = await run(async () => {
      const signInError = await signInWithEmail(email, password);
      return signInError ? "Invalid email or password." : null;
    });
    if (!ok) return;
    router.push(returnTo);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit}>
      <CredentialsFields
        email={email}
        onEmailChange={setEmail}
        password={password}
        onPasswordChange={setPassword}
        passwordAutoComplete="current-password"
      />
      {error ? <p role="alert">{error}</p> : null}
      <button type="submit" className="tf-btn--cta" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
