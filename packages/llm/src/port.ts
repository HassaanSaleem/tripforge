// LLMPort — the ONLY boundary through which LLM calls may pass (INV-013). Backed by
// the official Anthropic SDK in production; deterministic fakes in tests. Every call
// is metered (tokens, purpose, model).
//
// Model policy: ALL calls run on `claude-haiku-4-5` — no Opus-tier models (operator
// decision 2026-07-03). The model is a pinned type so a non-Haiku model is a compile
// error, not a runtime surprise. Haiku 4.5 does NOT support the `effort` parameter —
// it is intentionally absent from this interface.

/** The single allowed model. Widening this is an operator decision (INV-013). */
export const LLM_MODEL = "claude-haiku-4-5" as const;
export type LlmModel = typeof LLM_MODEL;

export interface LlmMessage {
  role: "user" | "assistant";
  content: string;
}

export interface LlmCompleteRequest {
  /** Why this call is being made — recorded in metering (INV-013). */
  purpose: string;
  system?: string;
  messages: LlmMessage[];
  maxTokens: number;
}

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface LlmCompleteResponse {
  text: string;
  model: LlmModel;
  usage: LlmUsage;
}

export interface LLMPort {
  complete(req: LlmCompleteRequest): Promise<LlmCompleteResponse>;
}
