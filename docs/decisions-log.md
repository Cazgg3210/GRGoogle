# Registro de decisiones abiertas y defaults del prototipo

Referencias: §5.3, §46.2 (P0), §47 (P1), §49. Regla: **no bloquear el prototipo por P1/P2; sí bloquear producción por P0.** Cada default es reversible por configuración o por ADR.

## P0 — deben cerrarse antes de producción

| ID   | Pregunta                                                                      | Default adoptado en el prototipo                                                                                                                | Dónde se cambia                                   | Estado                           |
| ---- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | -------------------------------- |
| P0-1 | ¿"Todas las reuniones" incluye las organizadas por externos?                  | Cobertura automática para las organizadas por las 10 cuentas; **best effort** para host externo con `UNAVAILABLE_EXTERNAL_HOST` visible (§12.4) | resultado spike 0.5; sin cambio de código         | abierta                          |
| P0-2 | Proyecto GCP dedicado con facturación                                         | Se asume autorizado para dev y prod; prototipo corre en modo FAKE sin GCP                                                                       | `docs/runbooks/google-auth.md`                    | abierta                          |
| P0-3 | Listado real de las 10 cuentas (email, nombre, área, rol, activo, monitorear) | Seed demo (§37) con usuarios ficticios: Director, Andrés, Jurídico, Operaciones, gestora; ninguno hardcodeado en código                         | Administración → Usuarios / Directory sync        | abierta                          |
| P0-4 | Qué significa "Vencido" hoy; fecha compromiso                                 | `dueDate=null` en migración; `isOverdue` derivado sólo de `dueDate` real; UI muestra `SIN FECHA` y permite asignar                              | importador + regla de negocio en `rules/dates.ts` | abierta                          |
| P0-5 | Sheet tras el go-live (A/B/C)                                                 | **B**: plataforma maestra + exportación periódica (ADR-008)                                                                                     | `SHEETS_SYNC_ENABLED`; ADR nuevo para C           | abierta (recomendación B)        |
| P0-6 | Historial a migrar                                                            | Importar **todas** (166 + 7): completas como historial (`migrationTrust=LEGACY`), abiertas al backlog; sesión de depuración antes de go-live    | flags del importador                              | abierta (recomendación adoptada) |
| P0-7 | Retención de transcript/Smart Notes/derivados                                 | `rawTranscriptRetentionDays=null` (**sin borrado automático**) hasta política (ADR-009)                                                         | Administración → Ajustes                          | abierta                          |
| P0-8 | Cuenta remitente                                                              | `GMAIL_SENDER_EMAIL` vacío; propuesta `seguimiento@smlxl.mx`; en FAKE se muestra preview                                                        | env / Admin                                       | abierta                          |

## P1 — defaults funcionales adoptados

| ID    | Pregunta                                        | Default adoptado                                                                                                                                                                                           | Dónde se cambia           |
| ----- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| P1-1  | Duración promedio de reuniones                  | chunking activado a partir de ~200 segmentos (aprox. 45 min)                                                                                                                                               | `packages/ai` config      |
| P1-2  | Reuniones bilingües                             | se registra `mixedLanguageDetected`; baja confianza global; sin soporte especial                                                                                                                           | prompts                   |
| P1-3  | `Proyecto / Frente` como catálogo administrable | **Sí**: `Project` + `ProjectAlias` en Administración                                                                                                                                                       | —                         |
| P1-4  | Múltiples responsables                          | **Un owner + colaboradores** (`ActionItemCollaborator`)                                                                                                                                                    | —                         |
| P1-5  | `Entregado` vs `Completo`                       | `Entregado → COMPLETION_PROPOSED` (requiere aprobación); `Completo → COMPLETED` con `migrationTrust=LEGACY`                                                                                                | `initialStatusFromLegacy` |
| P1-6  | Tareas recurrentes                              | `type=RECURRING` + `recurrence`; instancias con `parentActionItemId`; nunca se cierran "para siempre"                                                                                                      | importador / UI           |
| P1-7  | Notificaciones a externos                       | **No** en MVP; `ExternalAssignee` sólo registro; adapter rechaza destinatarios externos                                                                                                                    | configuración de correo   |
| P1-8  | Quién aprueba `COMPLETION_PROPOSED`             | Roles con `ACTION_ITEM_APPROVE_COMPLETION`: **ADMIN, DIRECTOR, MANAGER** con alcance sobre la tarea; el responsable no aprueba su propio cierre salvo que tenga uno de esos roles (`canApproveCompletion`) | `rules/rbac.ts`           |
| P1-9  | Aprobar desde el email                          | **No**: enlace seguro a la plataforma, sin mutación por correo                                                                                                                                             | —                         |
| P1-10 | Días de aviso previo al vencimiento             | **2 días** (`DEFAULT_NOTIFICATION_PREFERENCES.dueSoonDays`), editable por usuario                                                                                                                          | Configuración             |
| P1-11 | Escalamiento de vencidas                        | Primer aviso al owner; copia al `managerId` a partir de la segunda semana vencida                                                                                                                          | job `send-due-reminders`  |
| P1-12 | SLA por área/prioridad                          | No en MVP; prioridad influye sólo en `attentionScore`                                                                                                                                                      | —                         |
| P1-13 | Comentarios internos por tarea                  | **Sí** (`ActionItemComment`)                                                                                                                                                                               | —                         |
| P1-14 | Adjuntos                                        | Links de Drive en descripción/comentarios; sin binarios propios                                                                                                                                            | —                         |
| P1-15 | KPI de cumplimiento individual visible          | Dirección/gestora (`REPORT_GLOBAL`) y managers para su área (`REPORT_AREA`); MEMBER ve sólo el propio                                                                                                      | `rules/rbac.ts`           |
| P1-16 | PDF del digest                                  | No en MVP; HTML en web y correo; adjunto CSV/XLSX opcional                                                                                                                                                 | —                         |
| P1-17 | Frecuencia de recordatorios                     | Sólo por vencimiento (previo + vencida) + digest semanal; sin recordatorio diario                                                                                                                          | preferencias              |

## Otros defaults técnicos

| Tema                        | Default                                                                                                      | Referencia                  |
| --------------------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------- |
| Digest                      | viernes 18:00 `America/Mexico_City`, destinatarios configurables (gerente + gestora), una versión para ambos | §18.2, `WeeklyDigestConfig` |
| Umbrales de confianza       | `autoAccept=0.90`, `proposal=0.70`                                                                           | §10.2, `confidence-gate.ts` |
| Auto-captura de artefactos  | `autoCaptureEnabled=true` para organizadores internos; nunca grabación de video                              | §12.3                       |
| Renovación de suscripciones | job cada 6 h; renovar si faltan < 48 h                                                                       | §13.2                       |
| Safety-net                  | cada 30–60 min sobre reuniones terminadas sin evento                                                         | §54                         |
| Modelo IA                   | `gemini-2.5-flash` vía Gemini API en prototipo; Vertex AI recomendado en producción                          | ADR-006                     |
| Proveedor de cola           | pg-boss sobre PostgreSQL; sin Redis                                                                          | §6.3                        |
| Áreas iniciales             | del legado (§20.2), cargadas por seed/importador, editables                                                  | §9.10                       |
| Bot de reunión              | no; reconsiderar sólo bajo §52                                                                               | ADR-002                     |

## P2 — fuera del MVP (§48)

WhatsApp, Slack/Google Chat, CRM/ERP, Notion/Asana/Jira, análisis de sentimiento, asistente conversacional, agenda automática, eventos de Calendar automáticos, portal para terceros. No se desarrollan salvo requerimiento expreso.

## Información pendiente de recibir (§49)

1. Listado de las 10 cuentas con área y rol (P0-3).
2. 2–3 transcripciones/Smart Notes reales anonimizadas (para calibrar prompts y fixtures).
3. Ejemplo del reporte semanal manual actual.
4. Definición de `Vencido?` y fecha compromiso (P0-4).
5. Catálogo canónico de proyectos/frentes.
6. Nombres/correos de gerente y gestora (configurar en `WeeklyDigestConfig`).
7. Decisión sobre el Sheet (P0-5).
8. Política mínima de retención/confidencialidad (P0-7, §28).
