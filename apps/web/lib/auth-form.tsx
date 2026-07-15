// Shared auth-form primitives (quality-sweep QS3/iter-3-delta finding, ticket
// 17836062783099932400): sign-in-form.tsx and sign-up-form.tsx independently
// duplicated the same email+password labeled-input markup and the same
// pending/error submit-state plumbing. Hoisted here — extend if a third auth
// surface needs it, don't generalize further until it does.
//
// Relocated from apps/web/app/(workspace)/auth-form.tsx (spec 030): the
// (client-view) route group's traveler sign-in/sign-up forms are the third
// auth surface the header comment above anticipated, so this file moved out
// of the (workspace) route group into a neutral shared location both route
// groups can import without either reaching into the other's directory.
"use client";

import { useState } from "react";
import type { AuthActionError } from "./auth-client.js";

export function CredentialsFields({
  email,
  onEmailChange,
  password,
  onPasswordChange,
  passwordAutoComplete,
}: {
  email: string;
  onEmailChange: (value: string) => void;
  password: string;
  onPasswordChange: (value: string) => void;
  /** "current-password" for sign-in, "new-password" for sign-up. */
  passwordAutoComplete: "current-password" | "new-password";
}) {
  return (
    <>
      <label htmlFor="email">
        Email
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => onEmailChange(e.target.value)}
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
          autoComplete={passwordAutoComplete}
          value={password}
          onChange={(e) => onPasswordChange(e.target.value)}
        />
      </label>
    </>
  );
}

/**
 * The pending/error state machine both forms drive their submit handler
 * through: `run` sets pending, clears the previous error, awaits the action,
 * and on a returned error message stores it + clears pending (the caller
 * decides what to do next — sign-in stops, sign-up chains a second `run`).
 * Returns true iff the action succeeded (no error message).
 */
export function useSubmitState() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<AuthActionError>): Promise<boolean> {
    setPending(true);
    setError(null);
    const failure = await action();
    if (failure) {
      setError(failure);
      setPending(false);
      return false;
    }
    return true;
  }

  return { pending, error, run };
}
