# Pruebas de integración (con base de datos)

Referencias: §36, §44.20–22, ADR-011. Configuración: `tests/integration/vitest.config.ts`. Comando: `pnpm test:integration`.

## Qué cubren

Todo lo que necesita PostgreSQL real o el ensamblaje de varias capas, siempre con **adapters fake** (nunca Google/Gemini reales):

| Área                 | Ejemplos                                                                                                                                                                        |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repositorios Prisma  | round-trip de entidades, unicidad (`cloudEventId`, `googleConferenceRecordId`, `(meetingId, ingestionChecksum)`), full-text en español, filtros por alcance (`visibleToUserId`) |
| Idempotencia         | webhook Pub/Sub duplicado → un solo `InboundGoogleEvent` y un solo job; `NotificationLog.idempotencyKey`; upsert de Sheets por UUID                                             |
| Cadena de jobs       | `process-google-event → fetch-meeting-artifacts → analyze-meeting → reconcile-action-items` con fixtures; estados §32                                                           |
| Reglas con BD        | aprobación de `CompletionProposal` en transacción; rechazo de `COMPLETED` directo; auditoría escrita                                                                            |
| Digest               | generación para una semana con datos seed; `(weekStart, audience, version)` único                                                                                               |
| Importador legado    | dry-run y commit sobre `tests/fixtures/legacy/maestro-sintetico.xlsx`; re-ejecución sin duplicados; KPIs vs baseline                                                            |
| Contrato de adapters | respuestas de fakes validan contra los schemas Zod esperados                                                                                                                    |

Las pruebas unitarias puras (reglas, fechas, máquina de estados, RBAC) viven junto al código en `packages/*/src/**/*.test.ts` y no usan BD.

## Requisitos

1. PostgreSQL accesible: `pnpm docker:up` (local, puerto 5460) o el servicio `postgres:16` de CI.
2. Variables: se cargan `.env.test` (si existe) y luego `.env` de la raíz. Recomendado un `.env.test` con una base **distinta** a la de desarrollo:
   ```env
   DATABASE_URL=postgresql://smlxl:smlxl_password@localhost:5460/smlxl_test?schema=public
   ```
   El global setup rechaza URLs que contengan `prod`.
3. Migraciones aplicadas: `pnpm db:deploy` (CI) o `pnpm db:migrate` (local) con esa `DATABASE_URL`, y `pnpm db:generate`.

## Convenciones

- Archivos `*.test.ts` bajo `tests/integration/` (subcarpetas por área: `repositories/`, `jobs/`, `webhooks/`, `legacy-import/`, `digest/`).
- Sin paralelismo entre archivos (`fileParallelism: false`): comparten la base.
- Cada suite crea sus datos en `beforeAll/beforeEach` y limpia en `afterAll` (truncate de las tablas que tocó, en orden de FK). No depender del seed de demo salvo que la prueba lo declare explícitamente.
- Reloj: inyectar `Clock` fijo en los casos de uso; `TZ=UTC` en el proceso y `COMPANY_TIMEZONE=America/Mexico_City` en la configuración para probar `isOverdue`/semana ISO.
- Fixtures desde `tests/fixtures/` (ver su README); nunca datos reales.
- Los paquetes internos se resuelven por alias a `packages/<x>/src/index.ts`; no hace falta build previo, pero sí `pnpm db:generate`.
- Timeout por prueba 30 s; hooks 60 s.

## Ejecutar una sola suite

```bash
pnpm vitest run --config tests/integration/vitest.config.ts tests/integration/webhooks/pubsub-idempotency.test.ts
```

## En CI

`.github/workflows/ci.yml` levanta `postgres:16-alpine`, exporta `DATABASE_URL` local (sin secretos), ejecuta `pnpm db:deploy` y después `pnpm test:integration`. Reporte JUnit en `tests/integration/test-results/junit.xml`.
