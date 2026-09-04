# ADR-004 — Ingesta de reuniones event-driven

**Estado:** Aceptada (2026-09-03)
**Referencias:** §2.1, §6.3, §13, §14, §29, §31, §32, §54

## Contexto

Google Workspace Events entrega por Pub/Sub eventos de conferencia, transcripción y Smart Notes de los espacios que posee cada usuario suscrito. No existe suscripción de dominio para Meet; el TTL es finito; los eventos pueden duplicarse, llegar desordenados o perderse; las reuniones con host externo no generan eventos internos.

## Decisión

Arquitectura **event-driven con tres capas de cobertura**:

1. **Workspace Events → Pub/Sub → webhook** `POST /api/v1/webhooks/google/pubsub` (token) que sólo registra `InboundGoogleEvent` (idempotente por `cloudEventId`) y encola `process-google-event`. Una suscripción `target=user` por usuario monitoreado, **sin resource data** (§13.2).
2. **Calendar incremental sync** por usuario con `syncToken` como inventario preventivo y disparador de `artifactConfig` (§14).
3. **Safety-net** `reconcile-missing-events` que consulta `conferenceRecords.list` para reuniones terminadas sin evento (§54).

El procesamiento corre en el worker con **pg-boss** como `JobQueuePort`: cadena `process-google-event → fetch-meeting-artifacts → analyze-meeting → reconcile-action-items → notificaciones/sheets`, con `singletonKey`, retry exponencial, dead-letter, `correlationId` y métricas. El estado de la reunión sigue la máquina de §32 (`rules/meeting-processing.ts`).

## Consecuencias

- La API responde 204 rápido; el trabajo pesado es asíncrono y reintentable.
- Eventos duplicados no generan reuniones/tareas duplicadas (§44.20); eventos perdidos se recuperan por reconciliación (§44.21).
- Se necesita renovación de suscripciones (<48 h) y alertas (runbook `subscription-renewal.md`).
- Complejidad operativa: tres mecanismos que deben observarse; mitigado con la pantalla Integraciones y métricas.
- Sin Redis en MVP; `JobQueuePort` permite migrar a BullMQ si el volumen lo exige.

## Alternativas consideradas

- **Polling puro de Meet API**: más simple pero con latencia y consumo de cuota; se conserva sólo como safety-net.
- **Eventos con resource data embebido**: descartado por exposición de datos en Pub/Sub y menor TTL.
- **Procesar en línea en el webhook**: descartado; timeouts de push y falta de reintentos controlados.
