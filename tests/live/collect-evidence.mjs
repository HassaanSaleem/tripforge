// L4 evidence-archiving helper (spec 004 FR-012; INV-027). One command =
// capture + scan, so "forgot to scan the log" cannot happen:
//   1. capture `docker compose logs --no-color` -> <dir>/compose.log
//   2. gather playwright artifacts from their configured output dirs, if present
//   3. run the log-scan on the captured log; its verdict is this exit code
//
// Usage: node tests/live/collect-evidence.mjs --iteration <n> --ticket <id> [--dir <path>]
// Exit 0 clean / 1 non-allowlisted log findings / 2 usage-or-IO error (loud).
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

const iteration = argValue("--iteration");
const ticket = argValue("--ticket");
const dirOverride = argValue("--dir");

if (!dirOverride && (!iteration || !ticket)) {
  console.error(
    "usage: node tests/live/collect-evidence.mjs --iteration <n> --ticket <id> [--dir <path>]",
  );
  process.exit(2);
}

const dir = dirOverride ?? join(".kitchenloop", "evidence", iteration, ticket);
mkdirSync(dir, { recursive: true });

// 1. Compose log capture — a missing log is a failed stage, never an empty file.
let composeLog;
try {
  composeLog = execFileSync("docker", ["compose", "logs", "--no-color"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    timeout: 30_000,
  });
} catch (err) {
  console.error(`collect-evidence: docker compose logs failed (daemon down?): ${err.message}`);
  process.exit(2);
}
const logPath = join(dir, "compose.log");
writeFileSync(logPath, composeLog);
console.log(`collect-evidence: captured ${logPath} (${composeLog.length} bytes)`);

// 2. Playwright artifacts (playwright.config.ts outputDir/reporter targets).
for (const artifactDir of [".kitchenloop/evidence/test-results", ".kitchenloop/evidence/playwright-report"]) {
  if (existsSync(artifactDir) && !dir.startsWith(artifactDir)) {
    const dest = join(dir, artifactDir.split("/").pop());
    cpSync(artifactDir, dest, { recursive: true });
    console.log(`collect-evidence: copied ${artifactDir} -> ${dest}`);
  }
}

// 3. Scan verdict = exit code.
try {
  execFileSync(process.execPath, ["tests/live/log-scan.mjs", logPath], {
    stdio: "inherit",
    timeout: 60_000,
  });
  console.log("collect-evidence: log scan clean.");
} catch (err) {
  process.exit(typeof err.status === "number" ? err.status : 2);
}
