# ADR-001 — Arquitectura de monorepo

**Estado:** Aceptada (2026-09-03)
**Referencias:** §6, §8, §38, §45

## Contexto

La solución tiene tres procesos (web Next.js, API Fastify, worker pg-boss) que comparten dominio, casos de uso, contratos Zod, configuración y adapters. El estándar técnico del propietario es TypeScript strict con Next.js/Fastify/Prisma. §8 exige separación Presentation → Application → Domain → Infrastructure y §45 prohíbe duplicar reglas de negocio.

## Decisión

Un monorepo **pnpm workspaces + Turborepo** con la estructura de §38:

- `apps/web`, `apps/api`, `apps/worker`;
- `packages/domain` (sin dependencias de runtime), `application`, `contracts`, `config`, `observability`, `database`, `google-workspace`, `ai`, `auth`, `ui`;
- `prisma/` en la raíz; `docs/`, `tests/`, `docker/`, `scripts/`, `.github/workflows/`.

Convenciones: ESM (`"type": "module"`, imports relativos con `.js`), `tsconfig.base.json` strict con `noUncheckedIndexedAccess`, ESLint con `no-explicit-any: error`, Prettier común, paquetes internos consumidos desde `src/index.ts` (sin build intermedio) y `tsc --noEmit` como `build`/`typecheck` en librerías. Turbo orquesta `build/dev/lint/typecheck/test` con caché y `globalEnv` declarado en `turbo.json`.

Regla de dependencias: `domain` ← `contracts/config/observability` ← `application` ← `database/google-workspace/ai/auth` ← `apps/*`. El dominio nunca importa infraestructura (§8.1).

## Consecuencias

- Un solo `pnpm install`, un lockfile, cambios atómicos entre API y web.
- El worker reutiliza casos de uso sin copiarlos (§6.3).
- Las imágenes Docker deben construirse desde la raíz con filtros de workspace (`pnpm --filter @smlxl/api...`), lo que alarga el contexto de build (mitigado con `.dockerignore` y `pnpm fetch`).
- Añadir un paquete implica actualizar `pnpm-workspace.yaml` (glob ya cubre `packages/*`) y `turbo.json` si tiene tareas nuevas.

## Alternativas consideradas

- **Repos separados por app**: descartado; duplicaría dominio y contratos y rompería §45.2.
- **Nx**: funcional, pero Turborepo es más simple para el tamaño del proyecto y coherente con otros proyectos del propietario.
- **Toda la lógica en Next.js Route Handlers**: prohibido por §6.2.
