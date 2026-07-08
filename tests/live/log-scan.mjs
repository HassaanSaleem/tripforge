// L4 log-scan helper (spec 004 FR-011; INV-027 log review). Fails on any line
// matching the live gate's error pattern that is not covered by the allowlist.
//
// Pattern fidelity: /ERROR|FATAL|Unhandled/ applied CASE-SENSITIVELY per line —
// this mirrors verification.live.log_error_pattern in the sealed kitchenloop.yaml
// exactly. The sealed file is not parsed here (that would add a YAML dependency);
// any operator change to the gate pattern must be mirrored in this constant.
//
// Usage:  node tests/live/log-scan.mjs <logfile | ->     (- reads stdin)
// Exit 0: no non-allowlisted match (allowlisted matches printed visibly as SKIP)
// Exit 1: non-allowlisted matches (each printed as "MATCH: <line>")
// Exit 2: usage/IO error (missing file, unreadable/malformed allowlist)
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

export const LOG_ERROR_PATTERN = /ERROR|FATAL|Unhandled/;

/**
 * Pure scan: returns { matches, skipped } where matches are offending lines and
 * skipped are allowlisted ones (with the entry that covered them). An allowlist
 * entry only applies when its substring occurs in the line AND its justification
 * is a non-empty string — an unjustified entry allowlists nothing (FR-011).
 */
export function scanLines(lines, entries) {
  const matches = [];
  const skipped = [];
  const usable = (entries ?? []).filter(
    (e) =>
      typeof e?.substring === "string" &&
      e.substring.length > 0 &&
      typeof e?.justification === "string" &&
      e.justification.trim().length > 0,
  );
  for (const line of lines) {
    if (!LOG_ERROR_PATTERN.test(line)) continue;
    const covering = usable.find((e) => line.includes(e.substring));
    if (covering) {
      skipped.push({ line, entry: covering });
    } else {
      matches.push(line);
    }
  }
  return { matches, skipped };
}

function main() {
  const target = process.argv[2];
  if (!target) {
    console.error("usage: node tests/live/log-scan.mjs <logfile | ->");
    process.exit(2);
  }

  let content;
  try {
    content = readFileSync(target === "-" ? 0 : target, "utf8");
  } catch (err) {
    console.error(`log-scan: cannot read ${target}: ${err.message}`);
    process.exit(2);
  }

  let entries;
  try {
    const allowlistPath = join(dirname(fileURLToPath(import.meta.url)), "log-allowlist.json");
    entries = JSON.parse(readFileSync(allowlistPath, "utf8")).entries;
    if (!Array.isArray(entries)) throw new Error("allowlist .entries is not an array");
  } catch (err) {
    console.error(`log-scan: unreadable allowlist: ${err.message}`);
    process.exit(2);
  }

  const { matches, skipped } = scanLines(content.split("\n"), entries);
  for (const { line, entry } of skipped) {
    console.log(`SKIP (allowlisted): ${line}  [${entry.justification}]`);
  }
  for (const line of matches) {
    console.error(`MATCH: ${line}`);
  }
  if (matches.length > 0) {
    console.error(`log-scan: FAIL — ${matches.length} non-allowlisted error line(s).`);
    process.exit(1);
  }
  console.log(`log-scan: clean (${skipped.length} allowlisted skip(s)).`);
}

// Run as CLI only (module import gets the pure functions for unit tests).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
