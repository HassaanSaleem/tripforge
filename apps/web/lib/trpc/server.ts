// Builds the tRPC request context for a real HTTP request: derive the SessionContext
// from Better Auth, and inject the composition-root container (db + sandbox ports +
// FakeLLM — the skeleton makes no live AI call, INV-013/019).
import { buildContainer, createContext, type TrpcContext } from "@tripforge/api";
import { getDb } from "../db.js";
import { getSessionContext } from "../auth.js";

export async function createTrpcContext(headers: Headers): Promise<TrpcContext> {
  const session = await getSessionContext(headers);
  const { db } = getDb();
  return createContext({ session, container: buildContainer({ db }) });
}
