# syntax=docker/dockerfile:1.7
# ============================================================================
# apps/web — Next.js 15 (SMLXL Meeting Intelligence)
#
# Contexto de build: la RAÍZ del monorepo.
#
# SUPUESTOS (ajustar cuando apps/web exista):
#   - next.config.{js,mjs,ts} declara `output: 'standalone'` y
#     `outputFileTracingRoot: path.join(__dirname, '../../')` para que el
#     standalone incluya los paquetes del workspace (@smlxl/ui, @smlxl/contracts…).
#   - Con esa configuración Next genera `apps/web/.next/standalone/apps/web/server.js`
#     y un `node_modules` pruned en `apps/web/.next/standalone/`.
#   - La web nunca contiene credenciales Google/Gemini; sólo NEXT_PUBLIC_API_URL
#     es pública. Las variables NEXT_PUBLIC_* se fijan en build (ARG).
#   - La web no requiere el cliente Prisma; toda lectura pasa por la API.
# ============================================================================

ARG NODE_IMAGE=node:20-alpine
ARG PNPM_VERSION=9.12.0

# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS base
ARG PNPM_VERSION
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    CI=true \
    NEXT_TELEMETRY_DISABLED=1 \
    TURBO_TELEMETRY_DISABLED=1
RUN apk add --no-cache libc6-compat \
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
    pnpm install --frozen-lockfile --offline --filter "@smlxl/web..."

# ---------------------------------------------------------------------------
FROM deps AS build
ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
RUN pnpm --filter "@smlxl/web..." run build

# ---------------------------------------------------------------------------
FROM base AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0
# Salida standalone de Next (monorepo): server.js queda bajo apps/web/.
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /app/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/login >/dev/null 2>&1 || exit 1
CMD ["node", "apps/web/server.js"]
