// Composition root factory. Wires the concrete adapters the app runs with. Tests
// build their own Container (often with the sandbox hotel + FakeLLM) so no handler
// constructs an adapter inline (clean-arch DI rule).
import { SandboxHotelAdapter } from "@tripforge/supply-adapter";
import { FakeLLM, type LLMPort } from "@tripforge/llm";
import type { Db } from "@tripforge/db";
import type { Container } from "./context.js";

export interface BuildContainerOptions {
  db?: Db;
  /**
   * LLM implementation. Defaults to the deterministic FakeLLM so nothing in the
   * skeleton makes a live provider call (INV-013). seed-0005 injects AnthropicLLM
   * (Haiku) here at the app composition root.
   */
  llm?: LLMPort;
}

export function buildContainer(options: BuildContainerOptions = {}): Container {
  return {
    hotel: new SandboxHotelAdapter(),
    llm: options.llm ?? new FakeLLM(),
    db: options.db,
  };
}
