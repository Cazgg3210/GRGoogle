# CLAUDE.md — guía para sesiones de Claude Code

Proyecto: **SMLXL Meeting Intelligence & Action Tracking Platform** (monorepo pnpm + Turborepo, TypeScript strict).
Fuente autoritativa: `SMLXL_MASTER_PROMPT_PLATAFORMA_REUNIONES_IA_v1.0.md` (citar secciones como `§N`). Si una decisión técnica la contradice, escribir un ADR en `docs/adr/` antes de implementarla (§0).

## Comandos

```bash
pnpm install
pnpm docker:up            # PostgreSQL 16 en localhost:5460
pnpm db:generate          # prisma generate (schema: prisma/schema.prisma)
pnpm db:migrate           # prisma migrate dev
pnpm db:seed              # prisma/seed.ts
pnpm dev                  # web :3000, api :4000 (/docs), worker
pnpm lint && pnpm typecheck && pnpm test
pnpm test:integration     # requiere DATABASE_URL accesible
pnpm test:e2e             # Playwright contra http://localhost:3000
pnpm legacy:import --file ./imports/<x>.xlsx --dry-run
```

Todos los scripts de Prisma se ejecutan desde `packages/database` (ver `package.json` ahí) con el schema de la raíz (ADR-012). `DATABASE_URL` se lee del `.env` de la raíz.

## Dónde vive cada cosa

| Qué                                                          | Dónde                                                                                                                                                |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Enums, entidades, puertos, errores, eventos de dominio       | `packages/domain/src/{enums,entities,ports,errors,events}.ts`                                                                                        |
| Reglas de negocio puras                                      | `packages/domain/src/rules/` (`action-item-state-machine`, `dates`, `attention-score`, `confidence-gate`, `normalize`, `rbac`, `meeting-processing`) |
| Tipos IA (`AiMeetingAnalyzer`, `ExtractedActionItem`)        | `packages/domain/src/ai-types.ts`                                                                                                                    |
| Schemas Zod (IA, API, Google)                                | `packages/contracts/src/{ai,api,google}.ts`                                                                                                          |
| Env, flags, `JobNames`                                       | `packages/config/src/index.ts`                                                                                                                       |
| Logger pino con redacción, métricas                          | `packages/observability/src/index.ts`                                                                                                                |
| Prisma schema y migraciones                                  | `prisma/schema.prisma`, `prisma/migrations/`                                                                                                         |
| Cliente Prisma generado (ignorado en Git)                    | `packages/database/src/generated/`                                                                                                                   |
| Repositorios Prisma (implementan `Repositories` del dominio) | `packages/database/src/`                                                                                                                             |
| Casos de uso                                                 | `packages/application/src/`                                                                                                                          |
| Adapters Google (fake + real) y scopes                       | `packages/google-workspace/src/` (`scopes.ts`)                                                                                                       |
| Gemini + fake analyzer + prompts                             | `packages/ai/src/`                                                                                                                                   |
| Auth.js, JWT, dev bypass                                     | `packages/auth/src/`                                                                                                                                 |
| Componentes UI compartidos                                   | `packages/ui/src/`                                                                                                                                   |
| Web (Next.js 15, App Router)                                 | `apps/web/`                                                                                                                                          |
| API (Fastify, OpenAPI)                                       | `apps/api/`                                                                                                                                          |
| Worker (pg-boss)                                             | `apps/worker/`                                                                                                                                       |
| Contrato de endpoints                                        | `docs/api/endpoints.md`                                                                                                                              |
| Importador legado                                            | `scripts/legacy-import/`                                                                                                                             |
| Fixtures y pruebas                                           | `tests/{fixtures,integration,e2e}/`                                                                                                                  |

## Convenciones

- **TypeScript strict**, `noUncheckedIndexedAccess`, sin `any` (ESLint lo marca como error). `unknown` + narrowing.
- **ESM**: `"type": "module"`; los imports relativos llevan extensión `.js` (`./enums.js`), incluso en `.ts`.
- Prettier: sin punto y coma, comillas simples, `printWidth: 100`.
- **Idioma**: UI, textos de correo, mensajes de error visibles y documentación en **español**. Identificadores de código en inglés. Enums en `SCREAMING_SNAKE` y su etiqueta en español vive en la capa UI (ver `docs/ux/information-architecture.md`).
- **Dependencias entre capas**: `domain` no importa nada del workspace ni de infraestructura. `application` importa `domain`, `contracts`, `config`, `observability` y puertos; nunca Prisma, `googleapis` ni `@google/genai` directamente. `apps/*` componen adapters e inyectan casos de uso.
- **La IA nunca escribe `COMPLETED`**. `canTransition()` sólo lo permite desde `COMPLETION_PROPOSED` con actor `USER` y `viaApprovedCompletionProposal: true`. La IA sólo crea `PROPOSED` y `CompletionProposal`. No añadir atajos.
- **Toda mutación sensible se audita** (`AuditLogRepository.append` con `before/after`, `actorType`, `correlationId`). Los casos de uso corren dentro de `UnitOfWork.run`.
- **Feature flags** (§51) se leen de `SettingsRepository.get().featureFlags` (BD sobreescribe env). Toda automatización debe poder apagarse; lanzar `DomainError.featureDisabled(flag)` cuando aplique.
- **Adapters fake** son ciudadanos de primera clase: cada puerto Google/IA tiene implementación fake determinística; `googleMode()`/`aiMode()` en `@smlxl/config` deciden cuál se inyecta.
- **Structured output obligatorio**: toda salida IA se valida con los schemas de `@smlxl/contracts` (`MeetingAnalysisResultSchema`, etc.). Nunca regex sobre texto libre para crear compromisos.
- **Idempotencia**: webhooks por `cloudEventId` (`InboundEventRepository.insertIfAbsent`), correos por `idempotencyKey`, Sheets por `key` (UUID), jobs con `singletonKey`.
- **Logs**: usar `createLogger({ service })`; nunca loggear transcript, tokens, API keys ni cookies (la redacción es defensa en profundidad, no excusa).
- **Errores**: lanzar `DomainError` con un `DomainErrorCode` (§34); la API los mapea con `httpStatusForCode`.
- **Nada hardcodeado**: personas, correos, áreas, horarios y destinatarios vienen de BD/config (§45.15).
- **Secrets**: sólo en `.env` (ignorado) o en secretos del despliegue. Nunca en frontend ni en docs.
- **Scopes Google**: sólo los oficiales listados en `packages/google-workspace/src/scopes.ts` y `docs/security/google-oauth-scopes.md`. No inventar.

## Cómo agregar…

**Un caso de uso**

1. Definir entrada/salida tipada en `packages/application/src/<área>/<nombre>.ts`; recibir `Repositories`/puertos por constructor o `UnitOfWork`.
2. Aplicar reglas del dominio (`assertTransition`, `canAccessActionItem`, `confidenceBand`…); no duplicarlas.
3. Auditar y publicar `DomainEvent` si corresponde.
4. Prueba unitaria con repos en memoria (`@smlxl/application/testing`).
5. Exponerlo en API (ruta + schema en `contracts/api.ts` + fila en `docs/api/endpoints.md`) y/o en un job del worker.

**Un adapter**

1. Si falta el puerto, declararlo en `packages/domain/src/ports.ts`.
2. Implementar `Fake<Nombre>Adapter` (determinístico, con fixtures en `tests/fixtures/`) y `Google<Nombre>Adapter` en `packages/google-workspace/src/` (timeout, retry con backoff, mapeo a `DomainErrorCode`).
3. Añadir scopes en `scopes.ts` y en `docs/security/google-oauth-scopes.md` con estado "candidato — confirmar en spike".
4. Registrar en la composición (`apps/api`, `apps/worker`) según `googleMode()`.
5. Prueba de contrato: la respuesta del adapter valida contra el schema esperado.

**Un endpoint**

1. Schema de request/response en `packages/contracts/src/api.ts`.
2. Ruta en `apps/api` con validación Zod, permiso RBAC (`hasPermission` / `canAccess*`) y respuesta tipada.
3. Fila en `docs/api/endpoints.md`. OpenAPI se regenera automáticamente.
4. Cliente en `apps/web/lib/api.ts` (Server Components) o vía proxy `app/api/proxy/[...path]`.

**Una pantalla**

1. Ruta en `apps/web/app/(app)/<ruta>/page.tsx` (rutas en español: `/inicio`, `/reuniones`, `/pendientes`, `/revision-ia`, `/reportes`, `/equipo`, `/integraciones`, `/configuracion`, `/administracion`).
2. Datos vía API con el JWT de sesión; nunca llamar Google/Gemini desde web.
3. Componentes de `packages/ui`; textos en español; etiquetas de enums centralizadas.
4. Ocultar controles según `SessionDto.permissions`, pero el permiso real se valida en la API.
5. Escenario E2E en `tests/e2e/specs/` con selectores `getByRole`/texto en español.

**Un job**

1. Nombre en `JobNames` (`packages/config`).
2. Handler en `apps/worker` que delega en un caso de uso; idempotente, con `correlationId`, métricas y mapeo de errores.
3. Encolar con `singletonKey` cuando aplique; documentar la cadena en `docs/architecture/data-flow.md`.

## Reglas de pruebas

- Unitarias junto al código (`*.test.ts`, vitest). Sin BD ni red.
- Integración en `tests/integration/` (vitest + PostgreSQL real, `DATABASE_URL` de test). Cada suite limpia su propio estado.
- Fixtures anonimizadas en `tests/fixtures/`; nunca datos reales de SMLXL.
- E2E en `tests/e2e/specs/` con Playwright; los escenarios marcados `test.fixme()` se activan cuando la UI final existe.
- `pnpm lint && pnpm typecheck && pnpm test` deben pasar antes de proponer cambios.

## No hacer

- No llamar Google/Gemini desde componentes React ni Route Handlers de Next.
- No usar Google Sheets como base de datos ni la posición de fila como identificador.
- No cerrar tareas automáticamente; no permitir que el job de digest cambie estados.
- No añadir Redis/BullMQ, bots de reunión ni multi-tenant sin ADR.
- No ejecutar migraciones destructivas automáticas.
- No escribir documentación de resumen fuera de `docs/` y `README.md`.
