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
import { buildContainer, createContext, type Container, type TrpcContext } from "@tripforge/api";
import { AnthropicLLM } from "@tripforge/llm";
import { optionalEnv } from "@tripforge/shared";
import { getDb } from "../db.js";
import { getSessionContext } from "../auth.js";

let container: Container | undefined;

function getContainer(): Container {
  if (!container) {
    const { db } = getDb();
    const apiKey = optionalEnv("ANTHROPIC_API_KEY", "");
    container = buildContainer({
      db,
      llm: apiKey ? new AnthropicLLM({ apiKey }) : undefined,
    });
  }
  return container;
}

export async function createTrpcContext(headers: Headers): Promise<TrpcContext> {
  const session = await getSessionContext(headers);
  return createContext({ session, container: getContainer() });
}
