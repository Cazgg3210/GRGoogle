# Fase 0 — Spike Google Workspace con tenant SMLXL

> **ESTADO: PENDIENTE — requiere tenant SMLXL real (Super Admin), proyecto Google Cloud con facturación y credenciales que no existen en este repositorio.** Este documento es el runbook de ejecución y la plantilla de evidencia. Ninguna prueba se ha ejecutado todavía; las casillas y campos deben completarse durante el spike.

Referencias: §5.2, §5.3, §12, §13, §27, §43 (Fase 0), §44, §46.2. Prerrequisito: `docs/runbooks/google-auth.md` pasos 1–5.

## Objetivo y exit criteria (§43)

Eliminar incertidumbre antes de construir UI compleja. **Exit:** este documento con evidencia de cada llamada, scopes definitivos (actualizar `docs/security/google-oauth-scopes.md` y `packages/google-workspace/src/scopes.ts`), errores encontrados y ADRs derivados; preguntas P0 cerradas o escaladas.

## Reglas de evidencia

- Anonimizar correos y nombres en las capturas (`usuario1@smlxl.mx`); nunca pegar tokens, llaves ni JSON de credenciales.
- Guardar respuestas de API redactadas como fixtures en `tests/fixtures/google/<api>/` para alinear los adapters fake.
- Registrar fecha/hora en `America/Mexico_City`, cuenta impersonada, scope usado, latencia y código de respuesta.

## Plantilla de evidencia por llamada

```text
Prueba: 0.x
Fecha/hora:
Ejecutor:
Usuario impersonado (anonimizado):
API / método:
Scopes usados:
Request (redactado):
Respuesta (código, campos relevantes, redactado):
Latencia:
Resultado: OK | ERROR <código> | LIMITACIÓN
Observaciones:
Fixture guardada en:
```

---

## Prueba 0.1 — Proyecto Cloud

Checklist:

- [ ] Proyecto `smlxl-meeting-intelligence-dev` creado; ID: `__________`
- [ ] Facturación vinculada (P0-2 autorizada por: `__________`)
- [ ] APIs habilitadas: Meet REST API, Workspace Events API, Pub/Sub, Calendar API, Admin SDK, Cloud Identity, Drive, Docs, Gmail, Sheets, Vertex AI o Generative Language
- [ ] Pantalla de consentimiento OAuth interna; cliente OAuth web creado
- [ ] Service account `smlxl-meetings-sa` creada; Client ID anotado en el gestor de secretos

Campos a capturar: `GOOGLE_CLOUD_PROJECT_ID`, región elegida para Vertex (`GOOGLE_CLOUD_LOCATION`), decisión Gemini API vs Vertex AI.

Exit: `gcloud services list --enabled` muestra todas las APIs.

## Prueba 0.2 — Domain-Wide Delegation

Checklist:

- [ ] DWD autorizada en Admin Console con los scopes candidatos (lista en `google-oauth-scopes.md`)
- [ ] Impersonar **1 usuario piloto** (`usuario1@smlxl.mx`)
- [ ] `calendar.events.list(calendarId=primary, timeMin=hoy-7d, singleEvents=true)` → OK
- [ ] `calendar.events.list` con `syncToken` en segunda llamada → `nextSyncToken` recibido
- [ ] `meet.spaces.get(spaces/{meetingCode})` de una reunión del piloto → `space.name`, `meetingUri`, `config.artifactConfig`
- [ ] `meet.conferenceRecords.list(filter="space.name=…")` → lista (vacía o con registros)
- [ ] `admin.directory.users.list(domain=smlxl.mx)` impersonando a un admin → 10 usuarios; anotar si requiere `admin.directory.user.readonly`
- [ ] Resolver `//cloudidentity.googleapis.com/users/{id}` para el piloto (vía Directory `id` o Cloud Identity)

Llamadas esperadas y campos a capturar: código HTTP, `scope` mínimo con el que cada llamada funciona (probar quitando scopes), errores `403 unauthorized_client` (DWD no propagada) vs `403 insufficientPermissions` (scope).

Exit: las cuatro APIs responden 200 impersonando al piloto con el set mínimo documentado.

## Prueba 0.3 — Auto-artefactos

Checklist:

1. [ ] Crear reunión interna de prueba (organizador piloto) desde Calendar con Meet
2. [ ] `spaces.get(spaces/{meetingCode})` → capturar `artifactConfig` inicial
3. [ ] `spaces.patch` con `updateMask=config.artifactConfig.transcriptionConfig.autoTranscriptionGeneration,config.artifactConfig.smartNotesConfig.autoSmartNotesGeneration` valores `ON` (scope `meetings.space.settings`) → capturar respuesta o error de política
4. [ ] Iniciar la reunión con 2+ participantes, hablar ≥ 3 minutos en español
5. [ ] Confirmar en la UI de Meet que "Toma notas por mí" y transcripción arrancan automáticamente (capturas anonimizadas)
6. [ ] Terminar la reunión; esperar
7. [ ] `conferenceRecords.list` → `conferenceRecord.name`, `startTime`, `endTime`
8. [ ] `transcripts.list` → `state`, `docsDestination.document`; `transcripts.entries.list` → número de entradas, `languageCode`, `participant`
9. [ ] `smartNotes.list` → `state`, `docsDestination`
10. [ ] `participants.list` + `participantSessions.list`
11. [ ] Ubicación de artefactos en Drive (propietario, carpeta)

Campos a capturar: si `spaces.patch` fue aceptado o devolvió `CAPABILITY_BLOCKED` (política del tenant), tiempo hasta `FILE_GENERATED`, tamaño de entries, idioma reportado, calidad del texto (muestra anonimizada).

Exit: transcript entries y Smart Notes recuperados por API para una reunión interna con configuración automática (o documentar que la política impide auto y qué ajuste de Admin lo habilita).

## Prueba 0.4 — Workspace Events + Pub/Sub

Checklist:

- [ ] Topic `meet-events` creado; IAM `roles/pubsub.publisher` a `meet-api-event-push@system.gserviceaccount.com`
- [ ] Suscripción push a un endpoint HTTPS de prueba (túnel o entorno dev) con `?token=`
- [ ] `workspaceevents.subscriptions.create` impersonando al piloto: `targetResource=//cloudidentity.googleapis.com/users/{id}`, 8 `eventTypes` de §13.1, `notificationEndpoint.pubsubTopic`, **sin** `payloadOptions.includeResource` → capturar `name`, `expireTime`, `state`
- [ ] Realizar reunión de prueba con notas/transcripción
- [ ] Recibir `conference.v2.started` y `conference.v2.ended` (capturar atributos CloudEvent y `data`)
- [ ] Recibir `transcript.v2.fileGenerated` y `smartNote.v2.fileGenerated` (capturar `data.transcript.name` / `data.smartNote.name`)
- [ ] Verificar que `subject` identifica al usuario suscrito
- [ ] Recuperar `transcripts.entries` y `smartNotes` metadata a partir de los nombres recibidos
- [ ] Medir latencia fin de reunión → `fileGenerated` (transcript y Smart Notes por separado)
- [ ] Probar duplicado: republicar el mismo mensaje → la plataforma responde 204 sin reprocesar
- [ ] Probar validación OIDC del push (si se configuró `push-auth-service-account`)

Campos a capturar: formato exacto del envelope (`message.attributes` vs `message.data`), `expireTime` inicial, latencias, orden de llegada de eventos.

Exit: los 4 eventos clave recibidos y los artefactos recuperados a partir de ellos; fixtures guardadas en `tests/fixtures/google/events/`.

## Prueba 0.5 — Host externo

Checklist:

- [ ] Crear reunión desde una cuenta Google **externa** (gmail.com u otro dominio) invitando al piloto
- [ ] Verificar que **no** llega evento de Workspace Events a la suscripción del piloto
- [ ] Calendar sync del piloto detecta el evento con `hangoutLink` y organizador externo
- [ ] Tras la reunión: `conferenceRecords.list(filter="space.meeting_code=…")` impersonando al piloto → capturar resultado (200 con registros / vacío / 403)
- [ ] Si hay registro: `transcripts.list`, `entries.list`, `smartNotes.list` → capturar accesibilidad
- [ ] Repetir con el host externo habilitando transcripción manualmente
- [ ] Documentar qué puede ver el asistente interno en la UI de Meet/Drive vs API

Exit: tabla de capacidades para host externo (evento / conference record / transcript / smart notes: accesible sí/no) → alimenta P0-1 y `UNAVAILABLE_EXTERNAL_HOST`.

## Prueba 0.6 — Renovación de suscripciones

Checklist:

- [ ] Anotar `expireTime` de la suscripción creada en 0.4 (sin resource data) — ¿7 días?
- [ ] Crear una segunda suscripción **con** `includeResource=true` y anotar `expireTime` (comparar TTL)
- [ ] `subscriptions.patch` con `updateMask=expire_time` / `ttl` para renovar → nuevo `expireTime`
- [ ] Dejar expirar una suscripción de prueba y capturar `state` y comportamiento (¿se elimina? ¿`SUSPENDED`?)
- [ ] Recrear tras expiración y confirmar que no se reciben eventos retroactivos
- [ ] Ejecutar el job `renew-google-subscriptions` contra el tenant y verificar `lastRenewedAt`

Exit: TTL real documentado; frecuencia del job confirmada (≥ diaria, margen 48 h).

---

## Preguntas P0 a cerrar durante el spike (§46.2)

| P0   | Pregunta                                                             | Evidencia necesaria                     | Respuesta | Decisión/ADR                     |
| ---- | -------------------------------------------------------------------- | --------------------------------------- | --------- | -------------------------------- |
| P0-1 | "Todas las reuniones" incluye organizadas por externos               | resultado 0.5                           |           |                                  |
| P0-2 | Proyecto GCP dedicado y facturación autorizados                      | 0.1                                     |           |                                  |
| P0-3 | CSV de las 10 cuentas (email, nombre, área, rol, activo, monitorear) | Directory 0.2 + confirmación de negocio |           | carga en Administración          |
| P0-4 | Definición de "Vencido" y fecha compromiso                           | entrevista con gestora                  |           | regla de `dueDate` en importador |
| P0-5 | Destino del Sheet (A/B/C)                                            | decisión de negocio                     |           | ADR-008 (B por defecto)          |
| P0-6 | Historial a migrar                                                   | decisión de negocio                     |           | runbook legacy-import            |
| P0-7 | Retención de transcript/Smart Notes/derivados                        | política interna §28                    |           | ADR-009                          |
| P0-8 | Cuenta remitente funcional                                           | creación en Admin                       |           | `GMAIL_SENDER_EMAIL`             |

## Scopes definitivos (completar)

| Scope                           | Resultado del spike | Estado final |
| ------------------------------- | ------------------- | ------------ |
| `meetings.space.readonly`       |                     | candidato    |
| `meetings.space.created`        |                     | candidato    |
| `meetings.space.settings`       |                     | candidato    |
| `calendar.events.readonly`      |                     | candidato    |
| `calendar.readonly`             |                     | candidato    |
| `gmail.send`                    |                     | candidato    |
| `spreadsheets`                  |                     | candidato    |
| `drive.readonly`                |                     | candidato    |
| `documents.readonly`            |                     | candidato    |
| `admin.directory.user.readonly` |                     | candidato    |
| `cloud-identity.users.readonly` |                     | candidato    |

## Errores encontrados

| Prueba | Código/mensaje (redactado) | Causa | Solución | Mapeo a `DomainErrorCode` |
| ------ | -------------------------- | ----- | -------- | ------------------------- |
|        |                            |       |          |                           |

## Decisiones derivadas

- [ ] Actualizar `google-oauth-scopes.md` y `scopes.ts`
- [ ] Actualizar fixtures de adapters fake con respuestas reales anonimizadas
- [ ] ADR nuevo si algo contradice la especificación
- [ ] Marcar este documento como **COMPLETADO** con fecha y ejecutor
