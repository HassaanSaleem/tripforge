// Composition root factory. Wires the concrete adapters the app runs with. Tests
// build their own Container (often with the sandbox hotel + FakeLLM) so no handler
// constructs an adapter inline (clean-arch DI rule).
import {
  SandboxActivityAdapter,
  SandboxCarRentalAdapter,
  SandboxHotelAdapter,
  SandboxMediaStoreAdapter,
  SandboxTransferAdapter,
} from "@tripforge/supply-adapter";
import { FakeLLM, type LLMPort } from "@tripforge/llm";
import type { Db } from "@tripforge/db";
import type { ExchangeRate } from "@tripforge/domain";
import type { Container } from "./context.js";
import { STATIC_RATES } from "./rates.js";

export interface BuildContainerOptions {
  db?: Db;
  /**
   * LLM implementation. Defaults to the deterministic FakeLLM so nothing makes
   * a live provider call without a key (INV-013/019); the app composition root
   * injects AnthropicLLM (Haiku) when ANTHROPIC_API_KEY is configured.
   */
  llm?: LLMPort;
  /** Exchange-rate table override (tests); defaults to the fixed P0 table. */
  rates?: readonly ExchangeRate[];
}

export function buildContainer(options: BuildContainerOptions = {}): Container {
  return {
    hotel: new SandboxHotelAdapter(),
    activity: new SandboxActivityAdapter(),
    transfer: new SandboxTransferAdapter(),
    carRental: new SandboxCarRentalAdapter(),
    mediaStore: new SandboxMediaStoreAdapter(options.db),
    llm: options.llm ?? new FakeLLM(),
    rates: options.rates ?? STATIC_RATES,
    db: options.db,
  };
}
