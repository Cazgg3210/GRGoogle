# ADR-012 — Ubicación del esquema Prisma y salida del cliente

**Estado:** Aceptada (2026-09-03)
**Referencias:** §6.4, §38, §40, ADR-001, ADR-003
**Código:** `prisma/schema.prisma`, `prisma/migrations/`, `packages/database/prisma.config.ts`, `packages/database/package.json`, `.gitignore`

## Contexto

§38 coloca `prisma/schema.prisma`, `migrations/` y `seed.ts` en la **raíz** del monorepo, mientras que el paquete que encapsula el acceso a datos es `packages/database`. Prisma genera el cliente en `node_modules/@prisma/client` por defecto, lo que en un monorepo pnpm con hoisting estricto produce resoluciones frágiles entre `apps/*` y `packages/*`. Además `DATABASE_URL` vive en el `.env` de la raíz (§40) y los comandos de Prisma se ejecutan desde el paquete.

## Decisión

- El esquema y las migraciones viven en la raíz (`prisma/`), tal como indica §38; `prisma/seed.ts` también.
- El **cliente se genera en `packages/database/src/generated/client`** (`generator client { output = "../packages/database/src/generated/client" }`), directorio ignorado en Git. `@smlxl/database` re-exporta el cliente y los repositorios; ninguna app importa `@prisma/client` directamente.
- `packages/database/prisma.config.ts` (`defineConfig`, `earlyAccess`) apunta al schema y a las migraciones de la raíz y carga `../../.env`; los scripts `generate/migrate/deploy/reset/studio/seed` del paquete usan `--schema ../../prisma/schema.prisma` y `dotenv -e ../../.env`.
- Los scripts de la raíz (`db:*`) delegan con `pnpm --filter @smlxl/database <script>`.
- En Docker se ejecuta `prisma generate` desde `packages/database` tras `pnpm install` y antes del build; en despliegue `prisma migrate deploy` corre como paso previo al arranque de la API.
- CI verifica que el schema y las migraciones coincidan (`prisma migrate diff --from-migrations --to-schema-datamodel --exit-code`).

## Consecuencias

- Una sola fuente de verdad del esquema visible en la raíz; migraciones revisables en PR.
- Resolución determinista del cliente en web, api y worker vía `@smlxl/database`.
- Quien clone el repo debe ejecutar `pnpm db:generate` antes de `typecheck` (Turbo lo encadena con `dependsOn: ["^build"]` porque `build` de `@smlxl/database` es `prisma generate`).
- `pnpm clean` en `@smlxl/database` borra `src/generated`.

## Alternativas consideradas

- **Schema dentro de `packages/database/prisma/`**: contradice §38; se optó por seguir la estructura del documento.
- **Salida por defecto en `node_modules`**: rechazada por fragilidad con pnpm y por dificultar builds Docker con filtros.
- **`prisma-client` generator (nueva API) o multi-file schema**: se evaluará al estabilizarse; no cambia la ubicación decidida.
