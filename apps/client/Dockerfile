# Build context = racine du repo (Coolify: Build Context = /, Dockerfile = apps/client/Dockerfile)
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /app

FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/client/package.json apps/client/
RUN pnpm install --frozen-lockfile --filter @rts/client...

FROM deps AS build
COPY packages/shared packages/shared
COPY apps/client apps/client
# NEXT_PUBLIC_* injectées au BUILD (Coolify: Build Variables). ARG -> ENV pour que `next build` les lise.
ARG NEXT_PUBLIC_COLYSEUS_URL
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_COLYSEUS_URL=$NEXT_PUBLIC_COLYSEUS_URL \
    NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
RUN pnpm --filter @rts/shared build && pnpm --filter @rts/client build

FROM base AS runtime
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
WORKDIR /app
# Sortie "standalone" (outputFileTracingRoot = racine du monorepo)
COPY --from=build /app/apps/client/.next/standalone ./
COPY --from=build /app/apps/client/.next/static ./apps/client/.next/static
COPY --from=build /app/apps/client/public ./apps/client/public
EXPOSE 3000
CMD ["node", "apps/client/server.js"]
