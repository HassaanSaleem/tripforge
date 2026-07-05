// Machine-checked architecture boundaries (INV-017 + INV-001 + INV-005).
// docs/architecture/system-architecture.md §3 "Platform" invariants:
//   apps → packages only; domain imports no adapters; itinerary-schema & shared
//   are leaves. Nothing outside itinerary-schema declares an itinerary type;
//   nothing outside supply-adapter mentions a supplier API shape.
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      comment: "Circular dependencies indicate a boundary violation.",
      from: {},
      to: { circular: true },
    },
    {
      name: "domain-imports-no-adapters",
      severity: "error",
      comment:
        "INV-017: packages/domain is pure business logic and must not import any adapter " +
        "(supply-adapter, db, llm) or app.",
      from: { path: "^packages/domain/" },
      to: {
        path: "^packages/(supply-adapter|db|llm|api)/|^apps/",
      },
    },
    {
      name: "itinerary-schema-is-a-leaf",
      severity: "error",
      comment:
        "INV-017: packages/itinerary-schema is a leaf — it may not import other workspace packages.",
      from: { path: "^packages/itinerary-schema/" },
      to: { path: "^packages/(?!itinerary-schema/)|^apps/" },
    },
    {
      name: "shared-is-a-leaf",
      severity: "error",
      comment:
        "INV-017: packages/shared is a leaf — it may not import other workspace packages.",
      from: { path: "^packages/shared/" },
      to: { path: "^packages/(?!shared/)|^apps/" },
    },
    {
      name: "packages-never-import-apps",
      severity: "error",
      comment: "INV-017: dependency direction is apps → packages, never the reverse.",
      from: { path: "^packages/" },
      to: { path: "^apps/" },
    },
    {
      name: "no-orphans",
      severity: "warn",
      comment: "Orphan modules (nothing imports them) usually mean a missing wiring step.",
      from: {
        orphan: true,
        pathNot: [
          "\\.d\\.ts$",
          "index\\.ts$",
          "(^|/)__tests__/",
          // Framework entry points — entered by Next.js / tooling, not imported.
          "^apps/web/app/", // Next.js App Router pages/layouts/routes
          "\\.config\\.(js|cjs|mjs|ts)$", // next/vitest/playwright/drizzle configs
        ],
      },
      to: {},
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsConfig: { fileName: "tsconfig.base.json" },
    tsPreCompilationDeps: true,
    exclude: {
      path: "(node_modules|\\.next|dist|\\.turbo|__tests__|\\.test\\.ts$)",
    },
  },
};
