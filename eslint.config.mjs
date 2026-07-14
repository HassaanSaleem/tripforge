// Flat ESLint config for the TripForge monorepo.
// Loop-infrastructure (scripts/), docs, specs, and generated artifacts are out of
// scope per the clean-architecture skill ("Skip when editing loop infrastructure").
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "**/next-env.d.ts",
      "**/dist/**",
      "**/.turbo/**",
      "**/coverage/**",
      "scripts/**",
      ".specify/**",
      ".kitchenloop/**",
      "docs/**",
      "specs/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // TS/bundler resolve names and unused vars; the core rules only false-positive
    // on Node/DOM globals and duplicate the TS-aware rules below.
    rules: {
      "no-undef": "off",
      "no-unused-vars": "off",
    },
  },
  {
    files: ["**/*.{ts,tsx,mts,cts}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // Money/handlers must not use `any` as an escape hatch on public surfaces.
      "@typescript-eslint/no-explicit-any": "error",
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
  {
    // Node scripts (L3 smoke, playwright config, operator/CLI ops scripts) run
    // in Node with console output — apps/web/scripts/ mirrors the existing
    // packages/db/scripts/ operator-script precedent (dependency-cruiser and
    // knip both already exempt that class of file for the same reason).
    files: ["tests/**/*.{ts,mjs}", "*.config.{ts,mjs,cjs}", "**/*.config.{ts,mjs,cjs}", "apps/web/scripts/**/*.ts"],
    rules: {
      "no-console": "off",
    },
  },
);
