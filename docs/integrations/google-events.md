# Integración: Google Workspace Events + Cloud Pub/Sub

Referencias: §13, §31, §43 (0.4, 0.6), §54, ADR-004. Puerto: `WorkspaceEventsPort`. Adapters: `GoogleWorkspaceEventsAdapter` / `FakeWorkspaceEventsAdapter`. Contratos: `packages/contracts/src/google.ts`.

## Tipos de evento suscritos (§13.1)

Constantes en `GoogleMeetEventType` (`packages/domain/src/enums.ts`):

| Tipo                                                | Qué hace la plataforma                                                                                                                   |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `google.workspace.meet.conference.v2.started`       | crea/actualiza `Meeting` (`status=IN_PROGRESS`, `source=WORKSPACE_EVENT`, `googleConferenceRecordId`)                                    |
| `google.workspace.meet.conference.v2.ended`         | `status=ENDED`, `processingStatus=WAITING_FOR_ARTIFACTS`; encola `fetch-meeting-artifacts` con retraso corto para participantes/metadata |
| `google.workspace.meet.transcript.v2.started`       | `transcriptStatus=PENDING`                                                                                                               |
| `google.workspace.meet.transcript.v2.ended`         | sin cambio de estado (espera `fileGenerated`)                                                                                            |
| `google.workspace.meet.transcript.v2.fileGenerated` | `transcriptStatus=AVAILABLE`, `processingStatus=ARTIFACTS_AVAILABLE`; encola `fetch-meeting-artifacts`                                   |
| `google.workspace.meet.smartNote.v2.started`        | `smartNotesStatus=PENDING`                                                                                                               |
| `google.workspace.meet.smartNote.v2.ended`          | sin cambio                                                                                                                               |
| `google.workspace.meet.smartNote.v2.fileGenerated`  | `smartNotesStatus=AVAILABLE`; encola `fetch-meeting-artifacts`                                                                           |

Los eventos de participante son opcionales y no se suscriben en el MVP.

## Una suscripción por usuario (§13.2)

No existe una suscripción Meet "de dominio". La suscripción `target=user` recibe eventos de los espacios **que ese usuario posee**. Por tanto:

```text
por cada User con monitored=true (cargados de Directory, sin hardcode)
  -> DirectoryPort.resolveUserResourceName(email) -> //cloudidentity.googleapis.com/users/{id}
  -> WorkspaceEventsPort.createUserSubscription({ userEmail, userResourceName, eventTypes: ALL_GOOGLE_MEET_EVENT_TYPES, pubsubTopic })
       (impersonando al propio usuario; scopes Meet readonly/created)
  -> persistir GoogleWorkspaceSubscription { googleSubscriptionName, targetResource, eventTypes, expiresAt, state=ACTIVE }
```

`GoogleWorkspaceSubscription.monitoredUserId` es único: una suscripción activa por usuario. El endpoint `POST /api/v1/integrations/google/subscriptions/sync` crea las faltantes y renueva las próximas a expirar.

## Payload sin resource data (§13.2)

Se crean las suscripciones **sin** `payloadOptions.includeResource`. Motivos: menor exposición de datos en Pub/Sub, TTL máximo (hasta 7 días), eventos pequeños e idempotencia sencilla; Meet REST API es la fuente estructurada.

CloudEvent recibido (atributos en `message.attributes`, cuerpo en `message.data` base64):

```json
{
  "id": "<cloudEventId>",
  "type": "google.workspace.meet.transcript.v2.fileGenerated",
  "source": "//meet.googleapis.com",
  "subject": "//cloudidentity.googleapis.com/users/1234567890",
  "time": "2026-09-03T18:05:12Z",
  "data": { "transcript": { "name": "conferenceRecords/abc/transcripts/t1" } }
}
```

Validación: `PubSubPushEnvelopeSchema` → `WorkspaceCloudEventSchema` → `MeetEventDataSchema` (`conferenceRecord.name`, `transcript.name`, `smartNote.name`). El `conferenceRecord` se deriva del prefijo del nombre del artefacto.

## Webhook `POST /api/v1/webhooks/google/pubsub`

1. Verificar `?token=` contra `GOOGLE_PUBSUB_PUSH_TOKEN` (comparación en tiempo constante). Recomendado además validar el token OIDC del push (a confirmar en Fase 0).
2. Parsear y validar el envelope.
3. `InboundEventRepository.insertIfAbsent({ cloudEventId, type, source, subject, occurredAt, resourceName, rawPayloadRedacted })`.
4. Si `created=false` → 204 y métrica `webhook_duplicates`.
5. Si `created=true` → `enqueue(JobNames.PROCESS_GOOGLE_EVENT, { cloudEventId }, { singletonKey: cloudEventId })` → 204.
6. Cualquier error interno responde 5xx para que Pub/Sub reintente; la idempotencia evita duplicados.

## Idempotencia (§13.5)

- `InboundGoogleEvent.cloudEventId` UNIQUE.
- Nunca se procesa dos veces el mismo `conferenceRecord + artifactResource + artifactState` como operación nueva: `fetch-meeting-artifacts` usa `singletonKey=meetingId` y `Transcript.(meetingId, ingestionChecksum)` UNIQUE.
- Los eventos fuera de orden (p. ej. `fileGenerated` antes de `ended`) se toleran: cada handler aplica `assertProcessingTransition` y, si la transición no aplica, registra `IGNORED` sin error.

## TTL y renovación (§13.2, §43 0.6)

- Sin resource data la suscripción puede vivir hasta **7 días** (a confirmar en 0.6).
- Job `renew-google-subscriptions` **al menos diario**: renueva cuando `expiresAt - now < 48h`; recrea las que estén `EXPIRED`, `SUSPENDED` o `ERROR`; actualiza `lastRenewedAt`, `lastErrorCode`, `lastErrorAt`.
- Runbook: `docs/runbooks/subscription-renewal.md`.

## Safety-net (§13.3, §54)

`reconcile-missing-events` compara reuniones conocidas por Calendar con conference records y artefactos disponibles para recuperar eventos perdidos y cubrir reuniones con host externo. No se depende exclusivamente de Pub/Sub.

## Modo fake

`FakeWorkspaceEventsAdapter` simula creación/renovación con `expiresAt = now + 7d`. `POST /api/v1/integrations/simulate/meeting-ended` genera un CloudEvent sintético (`conference.ended` + `transcript.fileGenerated`) y lo inyecta en el mismo camino que el webhook, disparando el pipeline completo con fixtures.

## Variables

`GOOGLE_MEET_EVENTS_ENABLED`, `GOOGLE_CLOUD_PROJECT_ID`, `GOOGLE_PUBSUB_TOPIC` (`projects/<p>/topics/<t>`), `GOOGLE_PUBSUB_SUBSCRIPTION`, `GOOGLE_PUBSUB_PUSH_TOKEN`, credenciales DWD.

## Pendientes de Fase 0

- Confirmar TTL real con y sin resource data (0.6).
- Confirmar que `subject` identifica al usuario monitoreado y que los eventos de artefactos traen el nombre completo del recurso (0.4).
- Medir latencia `conference.ended → fileGenerated` (0.4).
- Verificar permisos IAM mínimos para que Workspace Events publique en el topic (`roles/pubsub.publisher` para `meet-api-event-push@system.gserviceaccount.com`).
