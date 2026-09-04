# syntax=docker/dockerfile:1.7
# ============================================================================
# apps/api — Fastify (SMLXL Meeting Intelligence)
#
# Contexto de build: la RAÍZ del monorepo (docker-compose.yml y EasyPanel ya lo
# hacen así). Multi-stage: base -> deps -> build -> runtime.
#
# SUPUESTOS (ajustar cuando apps/api exista):
#   - `pnpm --filter @smlxl/api build` produce `apps/api/dist/main.js` (bundle
#     ESM con esbuild/tsc; los paquetes @smlxl/* se compilan dentro del bundle y
#     las dependencias de terceros quedan externas en node_modules).
#   - El cliente Prisma se genera en packages/database/src/generated (ADR-012)
#     y se resuelve en runtime desde ahí; por eso se copia el árbol pruned
#     completo (/app) y no sólo dist/.
#   - La API expone GET /health en el puerto 4000.
# ============================================================================

ARG NODE_IMAGE=node:20-alpine
ARG PNPM_VERSION=9.12.0

# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS base
ARG PNPM_VERSION
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    CI=true \
    TURBO_TELEMETRY_DISABLED=1 \
    NEXT_TELEMETRY_DISABLED=1
# openssl + libc6-compat: requeridos por los motores de Prisma en Alpine.
RUN apk add --no-cache libc6-compat openssl \
 && corepack enable \
 && corepack prepare pnpm@${PNPM_VERSION} --activate
WORKDIR /app

# ---------------------------------------------------------------------------
# deps: descarga el store a partir del lockfile (cacheable) e instala sólo lo
# necesario para @smlxl/api y sus dependencias del workspace ("...").
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm fetch
COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --offline --filter "@smlxl/api..."

# ---------------------------------------------------------------------------
# build: genera Prisma, compila y deja únicamente dependencias de producción.
FROM deps AS build
RUN pnpm --filter @smlxl/database generate
RUN pnpm --filter "@smlxl/api..." run build
# Prune a producción manteniendo los enlaces del workspace.
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --offline --prod --filter "@smlxl/api..." \
 && rm -rf /app/.turbo /app/apps/web /app/apps/worker /app/tests /app/docs /app/docker

# ---------------------------------------------------------------------------
FROM base AS runtime
ENV NODE_ENV=production \
    PORT_API=4000
COPY --from=build --chown=node:node /app /app
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4000/health >/dev/null 2>&1 || exit 1
WORKDIR /app/apps/api
# Las migraciones se aplican como paso previo en el despliegue:
#   pnpm --filter @smlxl/database deploy   (prisma migrate deploy)
CMD ["node", "dist/main.js"]
