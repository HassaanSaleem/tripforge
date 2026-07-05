import { defineConfig } from "drizzle-kit";

// Drizzle Kit config — used by `db:push` (compose migrate step) and `db:generate`.
export default defineConfig({
  schema: "./src/schema.ts",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://tripforge:tripforge@localhost:5432/tripforge",
  },
});
