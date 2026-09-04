# Integración: Google Sheets (proyección posterior al go-live)

Referencias: §5.3.5, §16.1, §16.9, §44.19, §45.16, §46.2 P0-5, ADR-003, ADR-008. Puerto: `SheetsPort`. Adapters: `GoogleSheetsAdapter` / `FakeSheetsAdapter`. Job: `sync-google-sheets`.

## Decisión

PostgreSQL es la fuente maestra. El Sheet es una **proyección/exportación** (opción **B** de P0-5, adoptada por defecto en el prototipo; ver `docs/decisions-log.md`). No se usa Google Sheets como base de datos ni se implementa sincronización bidireccional salvo que se confirme que los usuarios seguirán editando el Sheet (opción C, requeriría ADR).

## Reglas

1. Cada fila lleva `ActionItem.id` / `Meeting.id` (UUID) en la primera columna y es la **clave de upsert**. Nunca se identifica una fila por su posición (§44.19).
2. La sincronización es idempotente: `SheetsPort.upsertRows({ spreadsheetId, sheetName, keyColumn: 'UUID', columns, rows })` lee la columna clave, actualiza filas existentes y agrega las nuevas al final.
3. Nunca se borran filas; una tarea cancelada/completada se refleja en la columna _Estado_.
4. Los valores derivados (_Días abierto_, _Vencido_, _Semana_) se calculan en la plataforma; el Sheet no los recalcula con fórmulas de negocio.
5. Si un usuario edita una celda en el Sheet, la siguiente sincronización la sobrescribe (se advierte en la primera fila del Sheet y en la UI de Integraciones).

## Hojas

### `Pendientes`

| UUID | Legacy ID | Estado | Prioridad | Actividad | Responsable | Área | Proyecto | Fecha compromiso | Reunión origen | Última mención | Días abierto | Vencido |
| ---- | --------- | ------ | --------- | --------- | ----------- | ---- | -------- | ---------------- | -------------- | -------------- | -----------: | ------- |

- _Estado_ y _Prioridad_ en etiquetas en español (`Pendiente`, `En progreso`, `Bloqueada`, `Esperando`, `Cierre propuesto`, `Completada`, `Cancelada`; `Baja`/`Media`/`Alta`/`Urgente`).
- _Responsable_: `User.displayName` o `ExternalAssignee.displayName` (con empresa entre paréntesis).
- _Reunión origen_: título + fecha de `createdFromMeetingId`; _Última mención_: fecha de `lastMentionedAt`.
- _Vencido_: `Sí`/`No` derivado con `isOverdue` en `COMPANY_TIMEZONE`.
- Filtro por defecto: tareas abiertas + completadas en los últimos 90 días (configurable).

### `Reuniones`

| Fecha | Reunión | Organizador | Participantes | Resumen | # Acuerdos | # Tareas nuevas | Link plataforma |
| ----- | ------- | ----------- | ------------- | ------- | ---------: | --------------: | --------------- |

- Clave: `Meeting.id` en una columna oculta `UUID` (primera columna) para el upsert.
- _Resumen_: resumen ejecutivo en 1–3 bullets, sin transcript.
- _Link plataforma_: `${APP_URL}/reuniones/${id}`.

## Disparadores

| Disparador                                                       | Condición                                                                                    |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Tras `reconcile-action-items`                                    | `SHEETS_SYNC_ENABLED=true` y `GOOGLE_SHEETS_SPREADSHEET_ID` configurado                      |
| Cron (cada hora)                                                 | idem                                                                                         |
| Manual `POST /api/v1/integrations/google/sheets/sync { dryRun }` | permiso `SHEETS_SYNC`; `dryRun=true` devuelve `SheetsSyncResultDto` con preview sin escribir |
| Digest semanal con `attachSpreadsheet=true`                      | exporta un CSV/XLSX generado desde la misma proyección (no depende del Sheet)                |

## Modo fake

`FakeSheetsAdapter` mantiene las hojas en memoria y devuelve la vista previa que muestra la pantalla **Integraciones → Sheets** (paso 13 de la demo §50). El resultado `{ inserted, updated }` se calcula igual que en el adapter real.

## Scopes y credenciales

`https://www.googleapis.com/auth/spreadsheets` (candidato — confirmar en spike; evaluar `drive.file` si el Sheet lo crea la propia app). Impersonación de una cuenta funcional propietaria del Sheet (misma que `GMAIL_SENDER_EMAIL` salvo decisión distinta).

## Errores

`SHEETS_SYNC_FAILED` (retryable para 429/5xx), `GOOGLE_PERMISSION_DENIED` (no retryable; alerta a administradores). Métricas: `google_api_errors{api="sheets"}`.

## Migración del workbook legado

El importador (`docs/runbooks/legacy-import.md`) lee el **XLSX** original, no este Sheet. Tras el go-live el workbook queda como histórico y el Sheet de proyección lo sustituye para consulta.
