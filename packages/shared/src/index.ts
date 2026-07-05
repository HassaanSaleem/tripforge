// Public surface of @tripforge/shared. Leaf package (INV-017): imports nothing
// from other workspace packages.
export { ok, err, isOk, isErr } from "./result.js";
export type { Result, Ok, Err } from "./result.js";
export { createLogger } from "./logger.js";
export type { Logger, LogLevel, LogFields, LoggerOptions } from "./logger.js";
export { requireEnv, optionalEnv } from "./config.js";
