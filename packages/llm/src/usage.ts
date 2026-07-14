// Token-metering vocabulary — a leaf module with no internal dependencies so it
// can be shared by both the LLMPort boundary (port.ts) and the chat-edit
// vocabulary (chat-edit.ts) without forming an import cycle (INV-017).
// Every LLM call is metered (tokens, purpose, model) at the port boundary.
export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
}
