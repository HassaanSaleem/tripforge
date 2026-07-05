/** @type {import('next').NextConfig} */
const nextConfig = {
  // Standalone output so the Docker image ships a minimal server (INV-019/027).
  output: "standalone",
  // Workspace packages export TS source directly — Next transpiles them.
  transpilePackages: [
    "@tripforge/api",
    "@tripforge/db",
    "@tripforge/domain",
    "@tripforge/itinerary-schema",
    "@tripforge/llm",
    "@tripforge/shared",
    "@tripforge/supply-adapter",
  ],
  // The monorepo root is the tracing root for the standalone build.
  outputFileTracingRoot: new URL("../../", import.meta.url).pathname,
  reactStrictMode: true,
  // The workspace packages (and app) use ESM-correct `.js` import specifiers that
  // point at `.ts` source. esbuild/tsc rewrite these; webpack needs this alias so
  // `./foo.js` resolves to `foo.ts` during `next build` (incl. transpiled packages).
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
    };
    return config;
  },
};

export default nextConfig;
