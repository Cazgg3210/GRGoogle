# Inventario de scopes OAuth de Google

Referencias: §13.4, §27.2, §43 (Fase 0), §45.6, ADR-005. Código: `packages/google-workspace/src/scopes.ts`.

Regla: **sólo scopes oficiales de Google**; ningún scope se inventa. Todos los scopes de este inventario están en estado **"candidato — confirmar en spike"** hasta que la Fase 0 (`docs/google-spike-results.md`) documente la evidencia de cada llamada. Los scopes se solicitan por grupo de adapter, no como un único superconjunto.

## Scopes de la service account (Domain-Wide Delegation)

| Scope                                                           | Adapter / puerto                                                           | Para qué                                                                                                                                                                                           | Nota de mínimo privilegio                                                                                                                                      | Estado                         |
| --------------------------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| `https://www.googleapis.com/auth/meetings.space.readonly`       | `GoogleMeetAdapter` (`MeetingCapturePort`), `GoogleWorkspaceEventsAdapter` | `spaces.get`, `conferenceRecords.get/list`, `participants.list`, `transcripts.list`, `transcripts.entries.list`, `smartNotes.list`; autorización de suscripciones Workspace Events a recursos Meet | lectura únicamente; preferido sobre `meetings.space.created` cuando la lectura de artefactos de reuniones ajenas al creador sea necesaria (host externo §12.4) | candidato — confirmar en spike |
| `https://www.googleapis.com/auth/meetings.space.created`        | `GoogleMeetAdapter`, `GoogleWorkspaceEventsAdapter`                        | acceso a espacios **creados por el usuario impersonado**; alternativa más acotada a `readonly` si el spike demuestra que basta para organizadores internos                                         | más restrictivo que `readonly`; se elegirá uno de los dos según resultados 0.2–0.5                                                                             | candidato — confirmar en spike |
| `https://www.googleapis.com/auth/meetings.space.settings`       | `GoogleMeetAdapter`                                                        | `spaces.patch` de `artifactConfig` (auto transcript / Smart Notes, §12.3)                                                                                                                          | sólo se solicita si `PlatformSetting.autoCaptureEnabled`; nunca activa grabación                                                                               | candidato — confirmar en spike |
| `https://www.googleapis.com/auth/calendar.events.readonly`      | `GoogleCalendarAdapter` (`CalendarPort`)                                   | `events.list` incremental con `syncToken` por usuario (§14.2)                                                                                                                                      | preferido: sólo eventos, sin ACL ni calendarios secundarios                                                                                                    | candidato — confirmar en spike |
| `https://www.googleapis.com/auth/calendar.readonly`             | `GoogleCalendarAdapter`                                                    | fallback si `events.readonly` no cubre `calendarList` o metadatos necesarios                                                                                                                       | usar sólo si el spike demuestra que `events.readonly` es insuficiente                                                                                          | candidato — confirmar en spike |
| `https://www.googleapis.com/auth/gmail.send`                    | `GmailAdapter` (`MailPort`)                                                | `users.messages.send` impersonando al buzón remitente (`GMAIL_SENDER_EMAIL`, §17)                                                                                                                  | sólo envío; nunca `gmail.readonly`/`mail.google.com`; impersonación limitada a la cuenta funcional                                                             | candidato — confirmar en spike |
| `https://www.googleapis.com/auth/spreadsheets`                  | `GoogleSheetsAdapter` (`SheetsPort`)                                       | `values.batchUpdate`/`values.get` sobre `GOOGLE_SHEETS_SPREADSHEET_ID` (§16.9)                                                                                                                     | el adapter restringe por configuración a un único spreadsheet; evaluar en spike si `drive.file` + Sheet creado por la app permite mayor acotamiento            | candidato — confirmar en spike |
| `https://www.googleapis.com/auth/drive.readonly`                | `GoogleDriveAdapter` (`DrivePort`)                                         | `files.export` del Google Doc de Smart Notes/transcript sólo cuando Meet API no entregue contenido estructurado (§15)                                                                              | opcional; se omite si el spike confirma que `smartNotes` y `transcripts.entries` bastan                                                                        | candidato — confirmar en spike |
| `https://www.googleapis.com/auth/documents.readonly`            | `GoogleDriveAdapter`                                                       | `documents.get` como alternativa a export de Drive                                                                                                                                                 | mutuamente excluyente con `drive.readonly` según resultado del spike                                                                                           | candidato — confirmar en spike |
| `https://www.googleapis.com/auth/admin.directory.user.readonly` | `GoogleDirectoryAdapter` (`DirectoryPort`)                                 | `users.list` del dominio para cargar las 10 cuentas sin hardcode (§44.2)                                                                                                                           | lectura; impersonar a un administrador sólo para esta llamada                                                                                                  | candidato — confirmar en spike |
| `https://www.googleapis.com/auth/cloud-identity.users.readonly` | `GoogleDirectoryAdapter`                                                   | resolver `//cloudidentity.googleapis.com/users/{id}` como `targetResource` de suscripciones Workspace Events (§13.2)                                                                               | alternativa a Directory si el spike muestra que basta uno de los dos                                                                                           | candidato — confirmar en spike |
| `https://www.googleapis.com/auth/userinfo.profile`              | `GoogleDirectoryAdapter`                                                   | `oauth2.userinfo.get` impersonando al propio usuario monitoreado para obtener su id de Google cuando la cuenta administradora no tiene lectura del directorio                                      | no requiere rol de administrador; sólo lee el perfil básico del usuario impersonado                                                                            | en uso (Fase 2)                |

## Scopes del cliente OAuth de login (usuarios finales)

| Scope     | Uso                                                                | Nota      | Estado    |
| --------- | ------------------------------------------------------------------ | --------- | --------- |
| `openid`  | OIDC                                                               | identidad | requerido |
| `email`   | correo verificado; se valida el sufijo `@smlxl.mx` y el claim `hd` | mínimo    | requerido |
| `profile` | nombre y foto para la UI                                           | mínimo    | requerido |

El login **no** solicita scopes de Meet/Calendar/Gmail: el acceso a datos de Workspace se hace exclusivamente por DWD desde el backend.

## Scopes explícitamente NO solicitados

`https://mail.google.com/`, `gmail.readonly`, `gmail.modify`, `drive` (completo), `calendar` (escritura), `admin.directory.user` (escritura), cualquier scope de grabación de video. Si un caso de uso futuro los requiere, se documenta un ADR.

## Configuración de Domain-Wide Delegation (Super Admin)

Detalle operativo en `docs/runbooks/google-auth.md`. Resumen:

1. En Google Cloud: crear la service account dedicada (`smlxl-meetings-sa@<proyecto>.iam.gserviceaccount.com`), sin roles IAM de proyecto, y anotar su **Client ID** numérico.
2. En Google Admin Console → _Seguridad → Control de acceso y datos → Controles de API → Delegación de todo el dominio_ → _Añadir nuevo_: pegar el Client ID y la lista de scopes autorizados separados por coma (sólo los de la tabla que resulten confirmados).
3. Autorizar. Los cambios pueden tardar unos minutos en propagarse.
4. Verificar con el spike 0.2 impersonando **un** usuario piloto por scope.
5. Registrar en este documento la fecha de autorización y el set definitivo; cambiar el estado de "candidato" a "confirmado" o "descartado".

## Registro de cambios de scopes

| Fecha      | Cambio                           | Evidencia                      |
| ---------- | -------------------------------- | ------------------------------ |
| 2026-09-03 | inventario inicial de candidatos | esta versión                   |
| —          | (pendiente Fase 0)               | `docs/google-spike-results.md` |
