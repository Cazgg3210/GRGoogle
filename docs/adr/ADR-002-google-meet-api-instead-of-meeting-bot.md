# ADR-002 — Google Meet REST API en lugar de un bot de reunión

**Estado:** Aceptada (2026-09-03)
**Referencias:** §2.1, §2.2, §5.1, §5.2, §12, §52, §53, §57

## Contexto

El requerimiento original describía un "asistente virtual" presente en todas las reuniones. Las capturas del tenant SMLXL (Business Standard) confirman "Toma notas por mí" y transcripción nativa en Meet; la documentación oficial confirma que Meet REST API v2 expone `transcripts`, `transcripts.entries` y `smartNotes`, que Workspace Events publica eventos de esos artefactos y que un `Space` admite auto-generación (§5.2). Construir un bot de audio/video implica infraestructura de medios, presencia visible en la reunión, costos y riesgos de privacidad.

## Decisión

La captura se realiza **exclusivamente con artefactos nativos de Google Meet** recuperados por Meet REST API, disparada por Workspace Events + Pub/Sub, con Calendar como inventario y safety-net. No se construye un bot participante en el MVP. El puerto `MeetingCapturePort` aísla al dominio del proveedor de captura.

## Consecuencias

- Tiempo de desarrollo concentrado en reconciliación, trazabilidad, seguimiento y control (valor diferencial, §57).
- Dependencia de que la transcripción/Smart Notes se generen: mitigada con `artifactConfig` automático, capability check, fallback a transcripción sola y visibilidad en "Calidad de captura" (§20.6, §53).
- Reuniones con host externo sólo con cobertura best effort (`UNAVAILABLE_EXTERNAL_HOST`, §12.4).
- Retención de `transcripts.entries` ~30 días obliga a ingesta oportuna (ADR-009).
- Si se cumplen los criterios de §52, se añadirá un adapter `MeetingCaptureProvider` sin tocar el dominio.

## Alternativas consideradas

- **Bot participante (audio/video)**: descartado como primera versión; sólo último recurso (§2.2, §52).
- **Proveedor externo de meeting intelligence**: descartado por costo, privacidad y porque Google ya entrega los artefactos en el plan actual.
- **Parsear los Google Docs de notas**: sólo como complemento vía `DrivePort` cuando la API estructurada no baste (§15).
