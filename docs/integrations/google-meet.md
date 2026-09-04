# Integración: Google Meet REST API

Referencias: §2.1, §5.2, §12, §15, §43 (0.3), ADR-002. Puerto: `MeetingCapturePort` (`packages/domain/src/ports.ts`). Adapters: `GoogleMeetAdapter` / `FakeMeetAdapter` en `packages/google-workspace`.

## Decisión (§12.1)

La captura se hace con **artefactos nativos** de Meet (transcripción y Smart Notes), no con un bot participante. Las capturas del tenant confirman "Toma notas por mí" y la opción "Iniciar también la transcripción".

## Recursos utilizados (Meet REST API v2)

| Recurso                                                    | Método                                       | Uso                                                                                                | Impersonación (`asUser`)        |
| ---------------------------------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------- |
| `spaces`                                                   | `spaces.get(spaces/{meetingCode})`           | resolver `space.name` canónico a partir del `meetingCode` del Calendar event                       | organizador interno             |
| `spaces`                                                   | `spaces.patch` (`config.artifactConfig`)     | activar `autoTranscriptionGeneration=ON` y `autoSmartNotesGeneration=ON` (§12.3)                   | organizador interno             |
| `conferenceRecords`                                        | `get`, `list(filter="space.meeting_code=…")` | metadata post-reunión; safety-net §54 para reuniones sin evento                                    | organizador o asistente interno |
| `conferenceRecords.participants` (+ `participantSessions`) | `list`                                       | participantes, tipo (`signedinUser`/`anonymousUser`/`phoneUser`), tiempos                          | idem                            |
| `conferenceRecords.transcripts`                            | `list`, `get`                                | estado (`STARTED`/`ENDED`/`FILE_GENERATED`), `docsDestination.document`                            | idem                            |
| `conferenceRecords.transcripts.entries`                    | `list`                                       | entradas por participante con `text`, `languageCode`, `startTime`, `endTime` → `TranscriptSegment` | idem                            |
| `conferenceRecords.smartNotes`                             | `list`, `get`                                | estado y `docsDestination` de Smart Notes (GA abril 2026)                                          | idem                            |

Persistir siempre los **nombres de recurso canónicos** (`spaces/abc`, `conferenceRecords/xyz`, `conferenceRecords/xyz/transcripts/t1`). El `meetingCode` puede reutilizarse y **no** es clave histórica (§12.2).

## Mapeo a entidades

| Google                                              | Entidad SMLXL                                                                                                                                      |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `space.name`                                        | `Meeting.googleMeetingSpaceId`                                                                                                                     |
| `space.meetingCode`                                 | `Meeting.googleMeetingCode`                                                                                                                        |
| `conferenceRecord.name`                             | `Meeting.googleConferenceRecordId` (UNIQUE)                                                                                                        |
| `conferenceRecord.startTime/endTime`                | `Meeting.startAt/endAt/durationSeconds`, `status=ENDED`                                                                                            |
| `participant.name`, `signedinUser.displayName/user` | `MeetingParticipant.googleParticipantId/displayName/email`, `internalUserId` si el email es del dominio                                            |
| `transcript.name`, `state`, `docsDestination`       | `Transcript.googleTranscriptId`, `sourceUri`, `sourceType=MEET_TRANSCRIPT`                                                                         |
| `transcripts.entries[]`                             | `TranscriptSegment` (`speakerLabel` = displayName, `sequence`, `startAt/endAt`) y `Transcript.rawText` concatenado + `ingestionChecksum` (SHA-256) |
| `smartNote.name`, `docsDestination`                 | `Transcript` con `sourceType=MEET_SMART_NOTES` (texto vía `DrivePort` si es necesario)                                                             |
| `languageCode` de entries                           | `Meeting.reportedLanguageCode`                                                                                                                     |

## Auto-generación de artefactos (§12.3)

```text
Calendar event con Meet creado/actualizado
  -> extraer meetingCode
  -> spaces.get(spaces/{meetingCode})
  -> guardar space.name
  -> si organizador @smlxl.mx y PlatformSetting.autoCaptureEnabled
       -> spaces.patch { config: { artifactConfig: { transcriptionConfig: { autoTranscriptionGeneration: ON },
                                                       smartNotesConfig:   { autoSmartNotesGeneration: ON } } } }
  -> persistir { applied, blockedReason } -> ArtifactStatus PENDING | CAPABILITY_BLOCKED
```

- Nunca `recordingConfig.autoRecordingGeneration` (§12.3).
- Si Google rechaza por política/privilegios: `CAPABILITY_BLOCKED`, se continúa sin romper la reunión y se muestra en "Calidad de captura".
- Requiere scope `meetings.space.settings` (candidato).

## Reuniones con organizador externo (§12.4)

- No se intenta `spaces.patch`.
- Tras la ventana estimada, `conferenceRecords.list(filter space.meeting_code=…)` impersonando al asistente interno.
- Si el ConferenceRecord y sus artefactos son accesibles, se ingieren; si no, `transcriptStatus/smartNotesStatus = UNAVAILABLE_EXTERNAL_HOST`. Nunca se inventa contenido.
- El caso es visible en UI (badge "Host externo") y en el digest de calidad de captura.

## Idioma (§12.5)

Se registra el idioma reportado por Google por entrada, el detectado por el modelo y `mixedLanguageDetected`. La UI muestra la calidad/confianza de extracción por reunión.

## Retención (§5.2, §15)

Las `transcripts.entries` se conservan ~30 días en Google. `fetch-meeting-artifacts` corre en cuanto llega `transcript.fileGenerated` (o cuando el safety-net detecta el artefacto). El texto persistido queda sujeto a `Transcript.retainedUntil` (ADR-009).

## Errores y reintentos (§34, §45.8)

| Situación                                                            | Código                                                        | Retry                                                                  |
| -------------------------------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------- |
| artefacto aún no listo (`state != FILE_GENERATED`, `entries` vacías) | `GOOGLE_MEET_ARTIFACT_NOT_AVAILABLE`                          | sí, backoff (5, 15, 45 min…) hasta 24 h; luego `WAITING_FOR_ARTIFACTS` |
| 403                                                                  | `GOOGLE_PERMISSION_DENIED` / `GOOGLE_CAPABILITY_BLOCKED`      | no; alerta a administradores                                           |
| 404                                                                  | `GOOGLE_NOT_FOUND`                                            | no (salvo carrera con evento reciente: 1 reintento)                    |
| 429 / 5xx / timeout                                                  | `GOOGLE_RATE_LIMIT` / `GOOGLE_UNAVAILABLE` / `GOOGLE_TIMEOUT` | sí                                                                     |
| transcript vacío                                                     | `TRANSCRIPT_EMPTY`                                            | no; reunión `COMPLETED` sin análisis, visible en calidad de captura    |

## Adapter fake

`FakeMeetAdapter` devuelve espacios, conference records, participantes y entries desde fixtures anonimizadas (`tests/fixtures/google/meet/`), incluyendo la reunión demo "Seguimiento contrato Cliente Alfa". Permite simular `CAPABILITY_BLOCKED`, host externo y transcript vacío mediante meeting codes especiales definidos en las fixtures.

## Pendientes de Fase 0 (`docs/google-spike-results.md`)

- Confirmar que `spaces.patch artifactConfig` funciona con DWD en Business Standard (0.3).
- Medir latencia fin de reunión → `fileGenerated` (0.4).
- Confirmar qué devuelve `conferenceRecords.list` para reuniones con host externo (0.5).
- Cerrar scopes `meetings.space.readonly` vs `meetings.space.created`.
