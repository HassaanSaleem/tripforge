// Builds the tRPC request context for a real HTTP request: derive the SessionContext
// from Better Auth, and inject the composition-root container.
//
// The container is a PER-PROCESS singleton (spec 005 research D6): it holds no
// request state — ports, rates, db handle — so reuse is safe under INV-028, and
// it keeps the sandbox suppliers' issued-quote memory alive across the
// draft→quote→book HTTP sequence on the compose stack (real aggregator adapters
// are stateless over HTTP; supplier-side quote state lives with the supplier).
//
// LLM wiring (INV-013/019): deterministic FakeLLM by default — the stack is
// fully functional with zero keys; AnthropicLLM (Haiku-pinned) is injected when
// ANTHROPIC_API_KEY is configured.
import { buildContainer, createAppCaller, createContext, type Container, type TrpcContext } from "@tripforge/api";
import { AnthropicLLM } from "@tripforge/llm";
import { optionalEnv } from "@tripforge/shared";
import { getDb } from "../db.js";
import { getSessionContext } from "../auth.js";

let container: Container | undefined;

/** Exported for the one non-tRPC caller that needs direct container access:
 * the media-serving route (`app/api/media/[id]/route.ts`) streams raw bytes,
 * a shape tRPC's JSON transport can't return — see spec 027 research D3. */
export function getContainer(): Container {
  if (!container) {
    const { db } = getDb();
    const apiKey = optionalEnv("ANTHROPIC_API_KEY", "");
    container = buildContainer({
      db,
      llm: apiKey ? new AnthropicLLM({ apiKey }) : undefined,
      // Same origin BETTER_AUTH_URL already uses (spec 027 research D6) — an
      // uploaded media asset's url must match the browser's real origin.
      publicBaseUrl: optionalEnv("BETTER_AUTH_URL", "http://localhost:3000"),
    });
  }
  return container;
}

export async function createTrpcContext(headers: Headers): Promise<TrpcContext> {
  const session = await getSessionContext(headers);
  return createContext({ session, container: getContainer() });
}

/**
 * In-process caller with NO session, for anonymous server components (spec 010
 * research D3 — the client-view page). Same procedures, same contract as the
 * mounted /api/trpc surface (INV-018); public procedures only will succeed.
 */
export function getAnonymousCaller() {
  return createAppCaller(createContext({ session: null, container: getContainer() }));
}
