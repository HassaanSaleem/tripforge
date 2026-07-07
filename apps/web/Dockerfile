# Multi-stage build of apps/web as a Next.js standalone server (INV-019/027).
# Built image is the artifact the live-verification gate boots — never a dev server.
FROM node:20-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /app

# ─── deps: install the whole workspace from the lockfile ─────────────────────
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/api/package.json packages/api/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/itinerary-schema/package.json packages/itinerary-schema/package.json
COPY packages/llm/package.json packages/llm/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/supply-adapter/package.json packages/supply-adapter/package.json
RUN pnpm install --frozen-lockfile

# ─── migrate: one-shot schema push (drizzle-kit) before the app boots ────────
# Copy the WHOLE installed workspace from deps, not just the root node_modules:
# pnpm places each package's bins in its own node_modules (apps/web/node_modules/
# .bin/next, packages/db/node_modules/.bin/drizzle-kit). Copying only the root
# breaks every fresh checkout — it only ever worked when a host's node_modules
# leaked in through `COPY . .` (now excluded via .dockerignore).
FROM base AS migrate
COPY --from=deps /app ./
COPY . .
CMD ["pnpm", "--filter", "@tripforge/db", "run", "db:push"]

# ─── build: compile the Next.js standalone output ────────────────────────────
FROM base AS build
COPY --from=deps /app ./
COPY . .
RUN pnpm --filter @tripforge/web build

# ─── runner: minimal image running the traced standalone server ──────────────
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=build --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public
USER nextjs
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
