// Regenerates .kitchenloop/coverage-matrix.yaml from the machine-parseable
// KITCHENLOOP-COVERAGE block each scenarios/incubating/*/scenario.mjs file
// declares near its top. This is the fix for seed-0031: coverage-matrix.yaml
// and loop-state.md used to be two independently hand-authored summaries of
// "what have we tested" with no derivation link, so they could (and did)
// silently disagree with each other and with the scenario files themselves.
//
// Single source of truth going forward: each scenario script's own
// KITCHENLOOP-COVERAGE block. This script is the ONLY writer of
// coverage-matrix.yaml's tested/tested_combos/coverage_pct fields — never
// hand-edit them.
//
// Usage: node scripts/kitchenloop/derive-coverage.mjs
// Exit 0 = matrix regenerated; non-zero = a scenario file has a missing or
// malformed COVERAGE block, or declares a feature/platform/user_type outside
// kitchenloop.yaml's spec.dimensions vocabulary (typo guard).
//
// NOTE: lives directly under scripts/kitchenloop/, not a coverage/
// subdirectory — .gitignore has a repo-wide `coverage/` rule (test-coverage
// output dirs) that would otherwise swallow this file.

import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SCENARIOS_DIR = path.join(REPO_ROOT, "scenarios/incubating");
const MATRIX_PATH = path.join(REPO_ROOT, ".kitchenloop/coverage-matrix.yaml");
const CONFIG_PATH = path.join(REPO_ROOT, "kitchenloop.yaml");

function extractDimension(yamlText, key) {
  const lines = yamlText.split("\n");
  const headerRe = new RegExp(`^\\s{4}${key}:\\s*$`);
  const start = lines.findIndex((l) => headerRe.test(l));
  if (start === -1) throw new Error(`kitchenloop.yaml: spec.dimensions.${key} not found`);
  const items = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(/^\s{4}-\s*"([^"]+)"/);
    if (m) {
      items.push(m[1]);
      continue;
    }
    if (/^\s{4}#/.test(line)) continue; // inline comment at list-item indent
    break; // anything else ends the list
  }
  return items;
}

function loadDimensions() {
  const text = readFileSync(CONFIG_PATH, "utf8");
  return {
    features: extractDimension(text, "features"),
    platforms: extractDimension(text, "platforms"),
    user_types: extractDimension(text, "user_types"),
  };
}

function extractCoverage(scenarioPath) {
  const text = readFileSync(scenarioPath, "utf8");
  const m = text.match(/\/\/ KITCHENLOOP-COVERAGE-BEGIN([\s\S]*?)\/\/ KITCHENLOOP-COVERAGE-END/);
  if (!m) return null;
  const jsonText = m[1]
    .split("\n")
    .map((line) => line.replace(/^\/\/ ?/, ""))
    .join("\n");
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch (err) {
    throw new Error(`${scenarioPath}: KITCHENLOOP-COVERAGE block is not valid JSON — ${err.message}`);
  }
  if (!Array.isArray(parsed)) {
    throw new Error(`${scenarioPath}: KITCHENLOOP-COVERAGE block must be a JSON array`);
  }
  return parsed;
}

function collectEntries(dims) {
  const scenarioDirs = readdirSync(SCENARIOS_DIR).filter((name) =>
    statSync(path.join(SCENARIOS_DIR, name)).isDirectory(),
  );
  const entries = [];
  for (const dir of scenarioDirs) {
    const scenarioPath = path.join(SCENARIOS_DIR, dir, "scenario.mjs");
    let coverage;
    try {
      coverage = extractCoverage(scenarioPath);
    } catch {
      continue; // no scenario.mjs in this dir (e.g. a README-only stub)
    }
    if (coverage === null) {
      throw new Error(
        `${scenarioPath}: missing KITCHENLOOP-COVERAGE-BEGIN/END block — every incubating scenario must declare its coverage claim (seed-0031)`,
      );
    }
    for (const raw of coverage) {
      const { feature, platform, user_type, result, iteration, tier, note } = raw;
      for (const [field, value, vocab] of [
        ["feature", feature, dims.features],
        ["platform", platform, dims.platforms],
        ["user_type", user_type, dims.user_types],
      ]) {
        if (!vocab.includes(value)) {
          throw new Error(
            `${scenarioPath}: COVERAGE entry has ${field}="${value}", not in kitchenloop.yaml spec.dimensions.${field === "user_type" ? "user_types" : `${field}s`} (${vocab.join(", ")})`,
          );
        }
      }
      if (result !== "pass" && result !== "fail") {
        throw new Error(`${scenarioPath}: COVERAGE entry result must be "pass" or "fail", got "${result}"`);
      }
      if (typeof iteration !== "number") {
        throw new Error(`${scenarioPath}: COVERAGE entry missing numeric "iteration"`);
      }
      entries.push({ feature, platform, user_type, result, iteration, tier: tier ?? "", note: note ?? "", scenario: dir });
    }
  }
  return entries;
}

function dedupe(entries) {
  const byKey = new Map();
  for (const e of entries) {
    const key = `${e.feature}|${e.platform}|${e.user_type}`;
    const existing = byKey.get(key);
    if (!existing || e.iteration > existing.iteration) byKey.set(key, e);
  }
  return [...byKey.values()];
}

function yamlEscape(str) {
  return str.replace(/"/g, '\\"');
}

function renderMatrix(dims, tested) {
  const totalCombos = dims.features.length * dims.platforms.length * dims.user_types.length;
  const testedCombos = tested.length;
  const coveragePct = Math.round((testedCombos / totalCombos) * 1000) / 10;
  const today = new Date().toISOString().slice(0, 10);

  const sorted = [...tested].sort((a, b) =>
    a.iteration - b.iteration ||
    a.feature.localeCompare(b.feature) ||
    a.platform.localeCompare(b.platform) ||
    a.user_type.localeCompare(b.user_type),
  );

  const lines = [];
  lines.push("# Coverage Matrix — tripforge");
  lines.push("#");
  lines.push("# GENERATED FILE — do not hand-edit tested/tested_combos/coverage_pct below.");
  lines.push("# Source of truth: the KITCHENLOOP-COVERAGE block each scenarios/incubating/*/");
  lines.push("# scenario.mjs declares near its top. Regenerate with:");
  lines.push("#   node scripts/kitchenloop/derive-coverage.mjs");
  lines.push("# (seed-0031 — replaces the old hand-appended-by-two-phases convention, which");
  lines.push("# had silently drifted from both loop-state.md and the scenario files.)");
  lines.push("");
  lines.push(`last_updated: "${today}"`);
  lines.push(`total_combos: ${totalCombos}   # ${dims.features.length} features x ${dims.platforms.length} platforms x ${dims.user_types.length} user_types (kitchenloop.yaml spec.dimensions)`);
  lines.push(`tested_combos: ${testedCombos}`);
  lines.push(`coverage_pct: ${coveragePct}`);
  lines.push("");
  lines.push("tested:");
  let lastIteration = null;
  for (const e of sorted) {
    if (e.iteration !== lastIteration) {
      lines.push(`  # ── iteration ${e.iteration} ──`);
      lastIteration = e.iteration;
    }
    lines.push(`  - combo: { feature: "${e.feature}", platform: "${e.platform}", user_type: "${e.user_type}" }`);
    lines.push(`    iteration: ${e.iteration}`);
    const comment = [e.note, `witness: ${e.scenario}`].filter(Boolean).join(" — ");
    lines.push(`    result: "${e.result}"${comment ? `   # ${yamlEscape(comment)}` : ""}`);
    if (e.tier) lines.push(`    tier: "${e.tier}"`);
  }
  lines.push("");
  return lines.join("\n");
}

function main() {
  const dims = loadDimensions();
  const entries = collectEntries(dims);
  const tested = dedupe(entries);
  const yaml = renderMatrix(dims, tested);
  writeFileSync(MATRIX_PATH, yaml, "utf8");
  console.log(`derive-coverage: wrote ${MATRIX_PATH} — ${tested.length} unique combos from ${entries.length} declared entries across ${new Set(entries.map((e) => e.scenario)).size} scenarios.`);
}

main();
