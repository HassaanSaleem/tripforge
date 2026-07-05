// Structured JSON logger (clean-arch skill: "Structured JSON logging via the
// packages/shared logger; console.log is not a logger outside scripts"). Every
// request-path log line can carry a requestId / agencyId / itineraryId via bindings.

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogFields = Record<string, unknown>;

export interface Logger {
  child(bindings: LogFields): Logger;
  debug(msg: string, fields?: LogFields): void;
  info(msg: string, fields?: LogFields): void;
  warn(msg: string, fields?: LogFields): void;
  error(msg: string, fields?: LogFields): void;
}

type Sink = (line: string) => void;

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function emit(sink: Sink, minLevel: LogLevel, bindings: LogFields, level: LogLevel, msg: string, fields?: LogFields): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel]) return;
  const record = { level, msg, ...bindings, ...fields };
  sink(JSON.stringify(record));
}

export interface LoggerOptions {
  level?: LogLevel;
  sink?: Sink;
  bindings?: LogFields;
}

export function createLogger(options: LoggerOptions = {}): Logger {
  const minLevel = options.level ?? "info";
  const sink: Sink = options.sink ?? ((line) => process.stdout.write(line + "\n"));
  const bindings = options.bindings ?? {};

  return {
    child(extra: LogFields): Logger {
      return createLogger({ level: minLevel, sink, bindings: { ...bindings, ...extra } });
    },
    debug: (msg, fields) => emit(sink, minLevel, bindings, "debug", msg, fields),
    info: (msg, fields) => emit(sink, minLevel, bindings, "info", msg, fields),
    warn: (msg, fields) => emit(sink, minLevel, bindings, "warn", msg, fields),
    error: (msg, fields) => emit(sink, minLevel, bindings, "error", msg, fields),
  };
}
