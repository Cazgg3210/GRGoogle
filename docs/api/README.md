# API interna `/api/v1`

Referencias: §6.2, §25, §30, §34, `docs/api/endpoints.md` (contrato detallado), `packages/contracts/src/api.ts` (schemas).

## Servidor

`apps/api` (Fastify + TypeScript strict). Puerto `PORT_API` (4000). Todas las rutas de negocio cuelgan de `/api/v1`. Rutas técnicas: `GET /health` (`{ status, db, version }`) y `GET /metrics` (texto Prometheus, sólo red interna).

## OpenAPI y Swagger

- Los schemas Zod de `@smlxl/contracts` son la fuente de verdad. La API los registra con `fastify-type-provider-zod` (o equivalente) y genera el documento OpenAPI 3.1 automáticamente: **`GET /api/v1/openapi.json`**.
- Swagger UI: **`GET /docs`** (habilitado en development; en producción sólo si `NODE_ENV !== 'production'` o detrás de autenticación).
- Cada ruta declara `schema: { querystring, params, body, response }` con los mismos objetos Zod, por lo que validación, tipado y documentación no divergen. Añadir un endpoint = añadir schema en `contracts/api.ts` + ruta + fila en `endpoints.md`.

## Autenticación

| Mecanismo                         | Uso                                                                                                                                                                                                                                                                                   |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Authorization: Bearer <jwt>`     | usuarios. JWT HS256 emitido por `apps/web` (Auth.js v5 + `jose`) con `AUTH_SECRET`, `iss=smlxl-web`, `aud=smlxl-api`, claims `{ sub: userId, email, role, name }`, expiración corta. La API verifica firma/iss/aud/exp, carga el `User` activo y construye el `Principal` (`rbac.ts`) |
| `x-dev-user-email`                | sólo con `AUTH_DEV_BYPASS=true` y `NODE_ENV=development`; selecciona un usuario seed sin JWT                                                                                                                                                                                          |
| `?token=GOOGLE_PUBSUB_PUSH_TOKEN` | únicamente `POST /api/v1/webhooks/google/pubsub`                                                                                                                                                                                                                                      |

`GET /api/v1/session` devuelve `SessionDto` con el usuario y sus permisos efectivos para que la UI oculte controles; la autorización real es server-side en cada ruta (`hasPermission`, `canAccessMeeting`, `canAccessActionItem`, `canApproveCompletion`) y los listados se filtran por alcance (`visibleToUserId`).

## Formato de error

Todas las respuestas de error usan `ErrorResponseSchema`:

```json
{
  "code": "ACTION_ITEM_COMPLETION_REQUIRES_APPROVAL",
  "message": "Una tarea sólo puede completarse aprobando una propuesta de cierre",
  "details": { "from": "IN_PROGRESS", "to": "COMPLETED", "actor": "USER" },
  "correlationId": "5b0e…"
}
```

- `code` es un `DomainErrorCode` (§34, `packages/domain/src/errors.ts`).
- El status HTTP se deriva con `httpStatusForCode`: 404 `NOT_FOUND`/`GOOGLE_NOT_FOUND`; 403 `FORBIDDEN`/`GOOGLE_PERMISSION_DENIED`; 401 `UNAUTHORIZED`; 422 `VALIDATION_ERROR`, `ACTION_ITEM_INVALID_TRANSITION`, `ACTION_ITEM_COMPLETION_REQUIRES_APPROVAL`; 409 `CONFLICT`, `COMPLETION_PROPOSAL_NOT_PENDING`, `ACTION_ITEM_DUPLICATE_CANDIDATE`; 429 `GOOGLE_RATE_LIMIT`; 503 `FEATURE_DISABLED`, `AI_DISABLED`; 500 el resto.
- Errores de validación Zod se normalizan a `VALIDATION_ERROR` con `details.issues`.
- `correlationId` se propaga desde el header `x-correlation-id` (o se genera) y aparece en los logs.
- `details` nunca incluye secretos ni transcript.

## Paginación y filtros

`PaginationQuerySchema` (`page`, `pageSize`) → respuesta `{ items, total, page, pageSize }` (`pageSchema`). Filtros específicos en `MeetingListQuerySchema`, `ActionItemListQuerySchema` (incluye `view=`), `AuditQuerySchema`, `PeriodQuerySchema`.

## Idempotencia y mutaciones

- Mutaciones sensibles se auditan (`AuditLog`) con `actorUserId`, `before/after`, `correlationId`.
- `POST /meetings/:id/reprocess` y las sincronizaciones devuelven `{ queued: true, jobId }`: el trabajo corre en el worker.
- El webhook Pub/Sub es idempotente por `cloudEventId` (204 en duplicados).

## Contrato de endpoints

Tabla completa (método, ruta, schemas, permiso) en [`endpoints.md`](./endpoints.md). El frontend (`apps/web`) consume la API desde Server Components (`lib/api.ts`) y, para Client Components, a través del proxy `app/api/proxy/[...path]` que añade `Authorization`.
