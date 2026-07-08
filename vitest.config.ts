import { defineConfig } from "vitest/config";

// Single root Vitest config (the loop oracle: `npm test`). Picks up L1 unit tests
// and L2 tRPC-caller contract tests colocated in each package's src/__tests__,
// plus unit tests for the repo-level live-verification scripts (tests/live) —
// dependency-free plain-node logic that must be CI-testable without a database
// or docker (spec 004 FR-014).
// Workspace packages export TS source directly (`exports` -> ./src/index.ts), so
// Vitest's esbuild transform resolves `@tripforge/*` imports with no build step.
export default defineConfig({
  test: {
    include: ["packages/**/src/**/*.test.ts", "tests/live/**/__tests__/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/.next/**"],
    environment: "node",
    passWithNoTests: false,
  },
});
