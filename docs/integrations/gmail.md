# Integración: Gmail (notificaciones y digest)

Referencias: §17, §18, §46.2 P0-8, §47 P1-7/9/10/11/17. Puerto: `MailPort`. Adapters: `GmailAdapter` / `FakeMailAdapter`. Jobs: `send-action-item-notification`, `send-due-reminders`, `send-weekly-digest`.

## Cuenta remitente

Cuenta funcional dedicada (propuesta `seguimiento@smlxl.mx`; nombre definitivo pendiente, P0-8), configurada en `GMAIL_SENDER_EMAIL`. La service account impersona **únicamente** ese buzón con scope `gmail.send` (candidato — confirmar en spike). Nunca se envía desde buzones personales ni se leen correos.

## Tipos de mensaje (§17)

| #   | `NotificationType`         | Destinatario                                              | Disparador                                                               | Preferencia de usuario                                      |
| --- | -------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------- |
| 1   | `POST_MEETING_SUMMARY`     | participantes internos                                    | reunión `COMPLETED`/`REVIEW_REQUIRED`                                    | `postMeetingSummary` (default **off**)                      |
| 2   | `NEW_ASSIGNMENT`           | owner                                                     | tarea creada/reasignada a la persona (IA aceptada o humano)              | `newAssignment` (on)                                        |
| 3   | `DUE_SOON`                 | owner                                                     | `dueDate - now <= dueSoonDays` (default 2 días, P1-10)                   | `dueSoon` (on)                                              |
| 4   | `OVERDUE`                  | owner (+ manager si escalamiento configurado, P1-11)      | primer día vencida y luego semanal                                       | `overdue` (on)                                              |
| 5   | `WEEKLY_DIGEST_INDIVIDUAL` | cada usuario con tareas abiertas                          | mismo horario del digest                                                 | `weeklyDigestIndividual` (on)                               |
| 6   | `WEEKLY_DIGEST_EXECUTIVE`  | `WeeklyDigestConfig.recipientUserIds` (gerente + gestora) | `generate-weekly-digest` → `send-weekly-digest`                          | no desactivable por usuario; se configura en Administración |
| 7   | `AREA_SUMMARY`             | managers del área                                         | opcional, mismo horario                                                  | `areaSummary` (default off)                                 |
| 8   | `OPERATIONAL_ERROR`        | usuarios `ADMIN`                                          | suscripción expirada, DWD denegado, IA inválida repetida, Sheets fallida | siempre                                                     |

Preferencias en `User.notificationPreferences` (`NotificationPreferences`, defaults en `DEFAULT_NOTIFICATION_PREFERENCES`), editables en **Configuración**.

## No generar spam (§17)

- Un correo por evento y destinatario, deduplicado con `NotificationLog.idempotencyKey` (`tipo:entidad:fecha`), que `MailPort.send` respeta (`skipped=true` si ya existe).
- Agrupación: varias tareas nuevas en la misma corrida → un solo correo `NEW_ASSIGNMENT` con la lista.
- Recordatorios `DUE_SOON` una vez por tarea; `OVERDUE` máximo semanal.
- Sin correos a externos (`ExternalAssignee`) hasta decisión P1-7; el adapter rechaza destinatarios fuera del dominio salvo lista explícita en configuración.
- Ventana de silencio: no enviar entre 21:00 y 07:00 `COMPANY_TIMEZONE` salvo `OPERATIONAL_ERROR`.

## Contenido y enlaces

- HTML + texto plano (`MailMessage.html/text`), plantillas en español en `packages/application` (o `apps/worker/templates`), sin transcript completo.
- Enlaces profundos a la plataforma (`${APP_URL}/pendientes/${id}`, `/revision-ia`, `/reportes/…`). Las acciones (aprobar/rechazar) **no** se ejecutan desde el correo: enlace seguro a la plataforma con sesión (P1-9).
- Digest directivo: secciones A–G de §18.3, incluyendo bandeja de aprobación con enlaces a tareas `COMPLETION_PROPOSED`. El job de envío nunca cambia estados.

## Modo fake

`FakeMailAdapter` no envía: guarda el mensaje renderizado y lo expone como **vista previa** en la UI (paso 12 de la demo §50 y `WeeklyDigestDto.emailPreviewHtml`). Registra igualmente `NotificationLog` para probar idempotencia.

## Errores

`EMAIL_SEND_FAILED` (retryable para 429/5xx; no retryable para 400/403), métricas `email_sent`, `google_api_errors{api="gmail"}`. Tras 3 fallos consecutivos de un tipo se emite `OPERATIONAL_ERROR` a administradores (por otro canal si Gmail está caído: log de nivel `error`).

## Variables y flags

`GMAIL_NOTIFICATIONS_ENABLED` (false → fake/preview), `GMAIL_SENDER_EMAIL`, credenciales DWD, `WEEKLY_DIGEST_ENABLED`, `APP_URL`.
