# WhatsApp Bookmark Manager - production image
FROM node:20-alpine AS base

# Builder stage
FROM base AS builder
WORKDIR /app

COPY package.json package-lock.json* ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/api/package.json packages/api/
COPY packages/db/package.json packages/db/
COPY packages/env/package.json packages/env/
COPY packages/types/package.json packages/types/
COPY packages/ui/package.json packages/ui/
COPY packages/config/package.json packages/config/

RUN npm ci

COPY . .

# Build web (TanStack Start) — clear VITE_SERVER_URL so API calls use same origin
RUN VITE_SERVER_URL="" npm run build --workspace=web

# Build server
RUN npm run build --workspace=server

# Generate DB migrations (required for runMigrations at startup)
RUN npm run db:generate --workspace=@bookmark/db || true
RUN mkdir -p /app/apps/server/dist/migrations && \
  (cp -r /app/packages/db/src/migrations/. /app/apps/server/dist/migrations/ 2>/dev/null || true)

# Runner stage
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/apps/server/dist ./apps/server/dist
COPY --from=builder /app/apps/web/dist ./apps/web/dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/server/node_modules ./apps/server/node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/apps/server/package.json ./apps/server/
COPY --from=builder /app/packages/api ./packages/api
COPY --from=builder /app/packages/db ./packages/db
COPY --from=builder /app/packages/env ./packages/env
COPY --from=builder /app/packages/types ./packages/types
COPY --from=builder /app/packages/ui ./packages/ui
COPY --from=builder /app/packages/config ./packages/config

RUN mkdir -p /app/data/whatsapp_auth

EXPOSE 3000

# Server output may be index.mjs or index.js depending on tsdown
CMD ["node", "apps/server/dist/index.mjs"]
