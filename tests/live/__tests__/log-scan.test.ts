// L1 units for the log-scan logic (spec 004 FR-011/FR-014, SC-005). Pure —
// no docker, no filesystem: scanLines is exercised directly.
import { describe, expect, it } from "vitest";

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — plain-node ESM module without type declarations (dependency-free by design)
import { LOG_ERROR_PATTERN, scanLines } from "../log-scan.mjs";

const entry = (substring: string, justification = "documented-benign (test fixture)") => ({
  substring,
  justification,
});

describe("scanLines", () => {
  it("passes a clean log", () => {
    const { matches, skipped } = scanLines(["all good", "still fine"], []);
    expect(matches).toEqual([]);
    expect(skipped).toEqual([]);
  });

  it.each(["ERROR boom", "FATAL: died", "Unhandled rejection in x"])(
    "fails on pattern word in %j",
    (line) => {
      const { matches } = scanLines(["ok", line, "ok"], []);
      expect(matches).toEqual([line]);
    },
  );

  it("does NOT match case variants — pattern fidelity with the sealed gate", () => {
    // verification.live.log_error_pattern is case-sensitive; the helper must not
    // silently broaden it (spec edge case).
    const { matches } = scanLines(["error: lowercase", "fatal issue", "unhandled thing"], []);
    expect(matches).toEqual([]);
    expect(LOG_ERROR_PATTERN.flags).not.toContain("i");
  });

  it("reports every match, not just the first", () => {
    const lines = ["ERROR one", "fine", "FATAL two", "Unhandled three"];
    const { matches } = scanLines(lines, []);
    expect(matches).toEqual(["ERROR one", "FATAL two", "Unhandled three"]);
  });

  it("skips an allowlisted line visibly (returned in skipped, not matches)", () => {
    const e = entry("known benign ERROR marker");
    const { matches, skipped } = scanLines(["prefix known benign ERROR marker suffix"], [e]);
    expect(matches).toEqual([]);
    expect(skipped).toEqual([{ line: "prefix known benign ERROR marker suffix", entry: e }]);
  });

  it("an entry with an empty justification allowlists NOTHING (FR-011)", () => {
    const { matches, skipped } = scanLines(
      ["ERROR covered-but-unjustified"],
      [entry("covered-but-unjustified", ""), entry("covered-but-unjustified", "   ")],
    );
    expect(skipped).toEqual([]);
    expect(matches).toEqual(["ERROR covered-but-unjustified"]);
  });

  it("an entry with an empty substring allowlists nothing (cannot blanket-skip)", () => {
    const { matches } = scanLines(["ERROR real"], [entry("")]);
    expect(matches).toEqual(["ERROR real"]);
  });

  it("only lines containing the substring are skipped; others still fail", () => {
    const e = entry("benign-marker");
    const { matches, skipped } = scanLines(["ERROR benign-marker", "ERROR different"], [e]);
    expect(skipped.map((s: { line: string }) => s.line)).toEqual(["ERROR benign-marker"]);
    expect(matches).toEqual(["ERROR different"]);
  });
});
