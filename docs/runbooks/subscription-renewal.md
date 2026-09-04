# Runbook: renovación de suscripciones Workspace Events

Referencias: §13.2, §13.5, §31, §43 (0.6), §44.3, §53, §54. Job: `renew-google-subscriptions`. Entidad: `GoogleWorkspaceSubscription`.

## Comportamiento automático

- El worker programa `renew-google-subscriptions` **al menos una vez al día** (cron `0 */6 * * *` recomendado, 4 veces al día para tolerar caídas).
- Para cada suscripción con `expiresAt - now < 48h`: `WorkspaceEventsPort.renewSubscription(name, asUser=monitoredUserEmail)` → actualiza `expiresAt`, `lastRenewedAt`, `state=ACTIVE`.
- Para usuarios monitoreados sin suscripción, o con `state ∈ {EXPIRED, SUSPENDED, DELETED, ERROR}`: `createUserSubscription` (recrea).
- Para usuarios que dejaron de estar monitoreados o inactivos: `deleteSubscription` y `state=DELETED`.
- Errores: `lastErrorCode`, `lastErrorAt`, métrica `google_api_errors{api="events"}`; tras 2 corridas fallidas consecutivas se envía `OPERATIONAL_ERROR` a administradores.

TTL esperado sin resource data: hasta 7 días (confirmar en spike 0.6). Con 48 h de margen y 4 corridas diarias hay ≥ 8 oportunidades de renovación antes de expirar.

## Alertas y dónde mirar

| Señal                                             | Dónde                                                                                                                                  |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Suscripciones con `expiresAt < now + 24h`         | Integraciones → Estado Google (`GoogleStatusDto.subscriptions[]`) marca en ámbar; rojo si expiradas                                    |
| `state=ERROR` con `lastErrorCode`                 | misma pantalla; detalle en logs con `correlationId`                                                                                    |
| Correo `OPERATIONAL_ERROR`                        | administradores                                                                                                                        |
| Ausencia de eventos entrantes en > 24 h laborales | `InboundGoogleEvent.listRecent` vacío en Integraciones; el safety-net sigue creando reuniones por Calendar pero con artefactos tardíos |

## Renovación manual

1. UI: **Integraciones → Sincronizar suscripciones** (`POST /api/v1/integrations/google/subscriptions/sync`, permiso `INTEGRATION_MANAGE`). Ejecuta la misma lógica que el job de inmediato y devuelve el estado actualizado.
2. Por usuario: desde la tabla de suscripciones, botón **Recrear** (elimina y crea).
3. Si Google responde `GOOGLE_PERMISSION_DENIED`: verificar DWD (scopes Meet) y que el usuario esté activo en Workspace; si el usuario fue suspendido, marcar `monitored=false`.

## Qué pasa si una suscripción expira

- Google deja de enviar eventos de los espacios de ese usuario; la plataforma no recibe `conference.ended` ni `fileGenerated`.
- **Safety-net (§54)**: `reconcile-missing-events` (cada 30–60 min) toma reuniones de Calendar cuya ventana terminó y sin conference record, consulta `conferenceRecords.list(filter space.meeting_code)` impersonando al organizador/asistente interno y, si hay artefactos, encola `fetch-meeting-artifacts`. Las reuniones se procesan con retraso, pero no se pierden mientras las `transcripts.entries` sigan disponibles (~30 días).
- Al recrear la suscripción no se recuperan eventos pasados: el safety-net es el mecanismo de recuperación.
- La suscripción expirada aparece en "Calidad de captura" como riesgo y en el digest semanal (sección D).

## Verificación tras una renovación

1. `GoogleWorkspaceSubscription.expiresAt` en el futuro (> 5 días si TTL de 7).
2. `state=ACTIVE`, `lastErrorCode=null`.
3. Realizar una reunión corta con el usuario y confirmar `InboundGoogleEvent` con `type=…conference.v2.started` en menos de un minuto.

## Cambios en el conjunto de usuarios monitoreados

- Administración → Usuarios → `monitored` (o `PlatformSetting.monitoredUserEmails`). El próximo `renew-google-subscriptions` (o el botón de sincronizar) crea/elimina suscripciones. Ningún correo se hardcodea (§44.2).
