// Deterministic LLMPort fake (INV-013: "the test suite runs against deterministic
// fakes at the LLMPort boundary — no live provider or API key required"). Returns a
// scripted or echo response so planner tests are reproducible with zero network.
import { LLM_MODEL, type LLMPort, type LlmCompleteRequest, type LlmCompleteResponse } from "./port.js";

export class FakeLLM implements LLMPort {
  private readonly scripted: string[];
  public readonly calls: LlmCompleteRequest[] = [];

  /** Provide canned responses (consumed in order); falls back to echoing the last user message. */
  constructor(scripted: string[] = []) {
    this.scripted = [...scripted];
  }

  async complete(req: LlmCompleteRequest): Promise<LlmCompleteResponse> {
    this.calls.push(req);
    const next = this.scripted.shift();
    const lastUser = [...req.messages].reverse().find((m) => m.role === "user");
    const text = next ?? `echo:${lastUser?.content ?? ""}`;
    return {
      text,
      model: LLM_MODEL,
      usage: { inputTokens: 0, outputTokens: 0 },
    };
  }
}
