// Better Auth HTTP surface — sign-in / sign-up / session / organization endpoints.
// The e2e sign-in journey (tests/e2e/smoke.spec.ts) drives these.
import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "../../../../lib/auth.js";

export const { GET, POST } = toNextJsHandler(auth);
