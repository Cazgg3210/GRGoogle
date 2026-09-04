# syntax=docker/dockerfile:1.7
# ============================================================================
# apps/worker — pg-boss (SMLXL Meeting Intelligence)
#
# Contexto de build: la RAÍZ del monorepo. Misma estructura que api.Dockerfile.
#
# SUPUESTOS (ajustar cuando apps/worker exista):
#   - `pnpm --filter @smlxl/worker build` produce `apps/worker/dist/main.js`.
#   - El cliente Prisma se genera en packages/database/src/generated (ADR-012).
#   - El worker no expone puertos; su salud se observa por logs/métricas y por
#     el estado de las colas en `GET /api/v1/admin/jobs` de la API.
# ============================================================================

ARG NODE_IMAGE=node:20-alpine
ARG PNPM_VERSION=9.12.0

# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS base
ARG PNPM_VERSION
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    CI=true \
    TURBO_TELEMETRY_DISABLED=1
RUN apk add --no-cache libc6-compat openssl \
 && corepack enable \
 && corepack prepare pnpm@${PNPM_VERSION} --activate
WORKDIR /app

# ---------------------------------------------------------------------------
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm fetch
COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --offline --filter "@smlxl/worker..."

# ---------------------------------------------------------------------------
FROM deps AS build
RUN pnpm --filter @smlxl/database generate
RUN pnpm --filter "@smlxl/worker..." run build
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --offline --prod --filter "@smlxl/worker..." \
 && rm -rf /app/.turbo /app/apps/web /app/apps/api /app/tests/integration /app/tests/e2e /app/docs /app/docker

# ---------------------------------------------------------------------------
FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build --chown=node:node /app /app
USER node
WORKDIR /app/apps/worker
# Apagado ordenado: pg-boss termina los jobs en vuelo al recibir SIGTERM.
STOPSIGNAL SIGTERM
CMD ["node_modules/.bin/tsx", "src/main.ts"]
