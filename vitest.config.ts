import { defineConfig } from "vitest/config";

// Single root Vitest config (the loop oracle: `npm test`). Picks up L1 unit tests
// and L2 tRPC-caller contract tests colocated in each package's src/__tests__.
// Workspace packages export TS source directly (`exports` -> ./src/index.ts), so
// Vitest's esbuild transform resolves `@tripforge/*` imports with no build step.
export default defineConfig({
  test: {
    include: ["packages/**/src/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/.next/**"],
    environment: "node",
    passWithNoTests: false,
  },
});
