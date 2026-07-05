// Production LLMPort implementation — official Anthropic SDK (INV-013). Pinned to
// `claude-haiku-4-5`; the `effort` parameter is never sent (unsupported on Haiku).
// Not exercised by the test suite (which uses FakeLLM) and not called anywhere in
// the seed-0001 skeleton — the planner that drives it lands in seed-0005. It exists
// now so the port has a real backing and the boundary is proven wireable.
import Anthropic from "@anthropic-ai/sdk";
import { LLM_MODEL, type LLMPort, type LlmCompleteRequest, type LlmCompleteResponse } from "./port.js";

export interface AnthropicLLMOptions {
  apiKey: string;
  /** Metering hook — every call reports its usage + purpose (INV-013). */
  onUsage?: (record: { purpose: string; model: string; inputTokens: number; outputTokens: number }) => void;
}

export class AnthropicLLM implements LLMPort {
  private readonly client: Anthropic;
  private readonly onUsage?: AnthropicLLMOptions["onUsage"];

  constructor(options: AnthropicLLMOptions) {
    this.client = new Anthropic({ apiKey: options.apiKey });
    this.onUsage = options.onUsage;
  }

  async complete(req: LlmCompleteRequest): Promise<LlmCompleteResponse> {
    const message = await this.client.messages.create({
      model: LLM_MODEL,
      max_tokens: req.maxTokens,
      system: req.system,
      messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
      // NOTE: no `effort` param — unsupported on Haiku 4.5 (INV-013).
    });

    const text = message.content
      .map((block) => (block.type === "text" ? block.text : ""))
      .join("");

    const usage = { inputTokens: message.usage.input_tokens, outputTokens: message.usage.output_tokens };
    this.onUsage?.({ purpose: req.purpose, model: LLM_MODEL, ...usage });

    return { text, model: LLM_MODEL, usage };
  }
}
