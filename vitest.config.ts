import { defineConfig } from "vitest/config";

// Single root Vitest config (the loop oracle: `npm test`). Picks up L1 unit tests
// and L2 tRPC-caller contract tests colocated in each package's src/__tests__,
// plus unit tests for the repo-level live-verification scripts (tests/live) —
// dependency-free plain-node logic that must be CI-testable without a database
// or docker (spec 004 FR-014).
// Workspace packages export TS source directly (`exports` -> ./src/index.ts), so
// Vitest's esbuild transform resolves `@tripforge/*` imports with no build step.
// apps/web/lib holds the web app's pure view-logic helpers (spec 008 research D8)
// — DOM-free, so they run under the same node environment.
// scripts/kitchenloop covers the loop's own dependency-free derivation tooling
// (seed-0035 — the coverage-matrix derivation guard needs the same CI-testable
// bar as the product's pure logic).
export default defineConfig({
  test: {
    include: [
      "packages/**/src/**/*.test.ts",
      "tests/live/**/__tests__/**/*.test.ts",
      "apps/web/lib/**/*.test.ts",
      "scripts/kitchenloop/**/*.test.ts",
    ],
    exclude: ["**/node_modules/**", "**/dist/**", "**/.next/**"],
    environment: "node",
    passWithNoTests: false,
  },
});
