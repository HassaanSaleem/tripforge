// Sign-in form (spec 007 US1/FR-001) — client component driving the existing
// Better Auth email+password endpoint. Any credential failure maps to ONE
// human-readable message and no navigation (FR-004, research D8).
"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { signInWithEmail } from "../../../lib/auth-client.js";
import { CredentialsFields, useSubmitState } from "../auth-form.js";

export function SignInForm() {
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
    router.push("/workspace");
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
