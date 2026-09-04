# Runbook: reprocesar una reunión

Referencias: §8.2 (`ReprocessMeeting`), §10.4, §31, §32, §34, §44.22. Permiso: `MEETING_REPROCESS` (ADMIN, DIRECTOR).

## Cuándo reprocesar

| Situación                      | Síntoma en UI                                                                                             | Acción                                                                                             |
| ------------------------------ | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Artefactos llegaron tarde      | `processingStatus=WAITING_FOR_ARTIFACTS` o `COMPLETED` sin transcript, calidad de captura "sin artefacto" | reprocesar desde artefactos                                                                        |
| Error transitorio de Google    | `FAILED` con `GOOGLE_RATE_LIMIT`, `GOOGLE_UNAVAILABLE`, `GOOGLE_TIMEOUT`                                  | normalmente lo cubre `retry-failed-meeting-processing`; manual si persiste                         |
| Salida IA inválida             | `FAILED` con `AI_INVALID_OUTPUT` / `AI_PROVIDER_ERROR`                                                    | reprocesar análisis                                                                                |
| Nueva versión de prompt/modelo | reunión `COMPLETED` con `promptVersion` antigua                                                           | reprocesar análisis (crea nueva corrida)                                                           |
| Reunión excluida por error     | `EXCLUDED`                                                                                                | reincluir (PATCH `excludedFromAi=false`) y reprocesar                                              |
| Permiso denegado               | `FAILED` con `GOOGLE_PERMISSION_DENIED` / `GOOGLE_CAPABILITY_BLOCKED`                                     | corregir DWD/scopes primero (`google-auth.md`); reprocesar después                                 |
| Host externo sin acceso        | `UNAVAILABLE_EXTERNAL_HOST`                                                                               | no reprocesar; pedir al organizador externo el documento y cargarlo como reunión manual si procede |

## Cómo

### Desde la UI

Reuniones → detalle → botón **Reprocesar** (tab _Historial IA_). Opciones:

- **Volver a obtener artefactos y analizar** (`stage=ARTIFACTS`): vuelve a llamar Meet REST API y re-ingiere si el `ingestionChecksum` cambia.
- **Solo analizar de nuevo** (`stage=ANALYSIS`): usa el transcript persistido y crea un nuevo `ProcessingRun`.

### Desde la API

```http
POST /api/v1/meetings/{id}/reprocess
Authorization: Bearer <jwt>
```

Respuesta `{ queued: true, jobId }`. Cuerpo opcional `{ stage: 'ARTIFACTS' | 'ANALYSIS' }` (default `ANALYSIS` si hay transcript ingerido, `ARTIFACTS` si no).

### Desde el worker (operador)

Encolar directamente `fetch-meeting-artifacts` o `analyze-meeting` con `{ meetingId, reason: 'manual' }` usando el panel **Administración → Jobs** (`GET /api/v1/admin/jobs`) o un script en `scripts/`.

## Qué hace el caso de uso `ReprocessMeeting`

1. Verifica permiso y que la reunión no esté `EXCLUDED` ni `excludedFromAi` (si lo está: `MEETING_EXCLUDED`).
2. Verifica el flag `AI_PROCESSING_ENABLED` para `ANALYSIS` (si está apagado: `AI_DISABLED`; con adapters fake se permite).
3. Transición `assertProcessingTransition(actual → ANALYZING | ARTIFACTS_AVAILABLE)`; `FAILED` y `COMPLETED` admiten reproceso (§32).
4. Audita `MEETING_REPROCESS_REQUESTED` con `before/after`.
5. Encola el job con `singletonKey=meetingId` (si ya hay uno en vuelo, responde el existente).

## Qué se conserva y qué cambia

- Se crea un `ProcessingRun` nuevo (`kind=REPROCESS`) con `promptVersion`, `model` y `schemaVersion` actuales; los anteriores permanecen (§10.4) y se ven en _Historial IA_.
- `MeetingSummary` y `Decision` nuevas se agregan; la UI muestra la última y permite comparar.
- Tareas ya aceptadas por humanos **no se modifican**: la reconciliación las trata como candidatos (`LINK_EXISTING`/`UPDATE_EXISTING` → Revisión IA si hay conflicto).
- Tareas `PROPOSED` de corridas anteriores sin resolver se marcan como supersedidas en `AiReviewItem.resolutionNote` y se generan las nuevas propuestas.
- `CompletionProposal` pendientes se conservan; no se duplican para la misma tarea (`findPendingByActionItem`).

## Estados esperados durante el reproceso (§32)

```text
FAILED/COMPLETED -> ARTIFACTS_AVAILABLE -> INGESTING -> INGESTED -> ANALYZING -> ANALYZED -> COMPLETED | REVIEW_REQUIRED
COMPLETED        -> ANALYZING -> ANALYZED -> COMPLETED | REVIEW_REQUIRED
```

## Códigos de error (§34) y su lectura en UI

| Código                                                            | Mensaje UI                                     | Siguiente paso                                   |
| ----------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------ |
| `GOOGLE_MEET_ARTIFACT_NOT_AVAILABLE`                              | "Google aún no generó la transcripción"        | esperar; el retry automático continúa hasta 24 h |
| `GOOGLE_PERMISSION_DENIED`                                        | "Sin permiso para leer esta reunión en Google" | revisar DWD/scopes                               |
| `GOOGLE_SUBSCRIPTION_EXPIRED`                                     | "La suscripción a eventos expiró"              | `subscription-renewal.md`                        |
| `GOOGLE_RATE_LIMIT`                                               | "Google limitó las llamadas; se reintentará"   | nada                                             |
| `TRANSCRIPT_EMPTY`                                                | "La transcripción está vacía"                  | verificar que se activó en la reunión            |
| `AI_INVALID_OUTPUT`                                               | "La IA devolvió un resultado inválido"         | reprocesar; si persiste, revisar prompt/modelo   |
| `AI_LOW_CONFIDENCE`                                               | "Resultado con baja confianza"                 | revisar en Revisión IA                           |
| `ACTION_ITEM_AMBIGUOUS_OWNER` / `ACTION_ITEM_DUPLICATE_CANDIDATE` | (no bloquean)                                  | resolver en Revisión IA                          |
| `MEETING_EXCLUDED`                                                | "La reunión está excluida del análisis"        | reincluir si corresponde                         |

## Verificación

1. Tab _Historial IA_: nueva corrida con `success=true`, tokens y latencia.
2. Tab _Compromisos_: tareas nuevas/actualizadas con evidencia.
3. `AuditLog` con `MEETING_REPROCESS_REQUESTED` y `MEETING_ANALYZED`.
4. Métricas `ai_runs` incrementadas; `meetings_failed` sin cambios.
