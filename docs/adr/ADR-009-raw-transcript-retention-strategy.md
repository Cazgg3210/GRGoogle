# ADR-009 — Estrategia de retención de transcripciones

**Estado:** Aceptada (2026-09-03); valor de retención pendiente (P0-7)
**Referencias:** §5.2, §5.3.4, §9.3, §15, §26, §28, §31 (`cleanup-expired-raw-data`), §42, §46.2 P0-7

## Contexto

Las `transcripts.entries` de Meet REST API se conservan ~30 días; la evidencia de tareas necesita citas persistentes; §28 exige una política interna sobre quién consulta transcripts y cuánto tiempo se conserva texto bruto y derivado. La política todavía no existe.

## Decisión

- **Ingesta oportuna**: al recibir `transcript.fileGenerated` se persisten `Transcript.rawText`, `TranscriptSegment[]` y `structuredPayload` (checksum idempotente).
- **Separación de capas de datos**:
  - texto bruto (`transcripts.rawText`, `transcript_segments`) — sujeto a `retainedUntil`;
  - derivados (`MeetingSummary`, `Decision`, `ActionItem.sourceEvidence`, `CompletionProposal.evidence`, links con evidencia) — se conservan con la tarea; contienen sólo las citas necesarias;
  - metadata de reunión — permanente.
- `PlatformSetting.rawTranscriptRetentionDays` (null por defecto = **sin borrado automático** hasta que exista política); `Transcript.retainedUntil = ingestedAt + días`. El job `cleanup-expired-raw-data` borra texto bruto vencido y deja el registro `Transcript` con `rawText=''` y `structuredPayload=null` (auditado).
- Acceso al texto bruto sólo con `MEETING_READ_TRANSCRIPT` y `canAccessMeeting`; reuniones `excludedFromAi` pueden conservar transcript sin análisis.
- Los documentos en Google Drive conservan su propia política; la plataforma no los replica (§42).
- Logs nunca contienen transcript (§33).

## Consecuencias

- La evidencia de tareas sobrevive al borrado del transcript, con contexto limitado (±2 segmentos guardados en la cita).
- Reprocesar una reunión cuyo texto bruto fue borrado no es posible (`TRANSCRIPT_EMPTY`); se informa en UI.
- Hasta fijar P0-7 el volumen crece; se documenta como riesgo en `decisions-log.md`.

## Alternativas consideradas

- **No persistir transcript, sólo derivados**: rechazado; impide reproceso con nuevos prompts y "Ver evidencia" con contexto.
- **Retención fija de 30 días**: rechazado hasta que negocio/jurídico decidan; el default null es explícito y reversible.
