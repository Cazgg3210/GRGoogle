# Runbook: configuración de Google Cloud y Google Workspace

Referencias: §5.3.2, §6.6, §13, §27, §40, §43 (0.1, 0.2, 0.4), §44.25, ADR-005. Requiere: Super Admin de Google Workspace `smlxl.mx` y permisos de propietario en el proyecto Google Cloud. Ninguna credencial se copia en documentación (§27.3).

## 1. Proyecto Google Cloud

1. Crear proyecto dedicado, uno por entorno: `smlxl-meeting-intelligence-dev` y `smlxl-meeting-intelligence-prod` (P0-2 debe autorizar facturación).
2. Vincular cuenta de facturación (necesaria para Pub/Sub y Gemini/Vertex).
3. Habilitar APIs (§43 0.1):
   ```bash
   gcloud config set project <PROJECT_ID>
   gcloud services enable \
     meet.googleapis.com \
     workspaceevents.googleapis.com \
     pubsub.googleapis.com \
     calendar-json.googleapis.com \
     admin.googleapis.com \
     cloudidentity.googleapis.com \
     drive.googleapis.com \
     docs.googleapis.com \
     gmail.googleapis.com \
     sheets.googleapis.com \
     aiplatform.googleapis.com          # Vertex AI (o generativelanguage.googleapis.com para Gemini API)
   ```
4. Anotar `GOOGLE_CLOUD_PROJECT_ID`.

## 2. Service account con Domain-Wide Delegation

1. Crear la cuenta: `gcloud iam service-accounts create smlxl-meetings-sa --display-name "SMLXL Meetings (DWD)"`.
2. **No** asignar roles IAM de proyecto (no los necesita para llamar APIs de Workspace vía DWD).
3. Crear una llave JSON sólo si no es posible usar Workload Identity; guardarla directamente en el gestor de secretos de EasyPanel como `GOOGLE_SERVICE_ACCOUNT_CREDENTIALS` (JSON en línea) y `GOOGLE_SERVICE_ACCOUNT_EMAIL`. No descargarla a equipos personales ni al repositorio.
4. Copiar el **Client ID** numérico de la service account (Consola → IAM → Service accounts → detalles).

## 3. Autorizar DWD en Google Admin (Super Admin)

1. Admin Console → _Seguridad_ → _Control de acceso y datos_ → _Controles de API_ → _Delegación de todo el dominio_ → _Añadir nuevo_.
2. Pegar el Client ID.
3. Pegar los scopes aprobados (lista de `docs/security/google-oauth-scopes.md`, sólo los confirmados), separados por coma. Para el spike inicial:
   ```text
   https://www.googleapis.com/auth/meetings.space.readonly,
   https://www.googleapis.com/auth/meetings.space.settings,
   https://www.googleapis.com/auth/calendar.events.readonly,
   https://www.googleapis.com/auth/admin.directory.user.readonly,
   https://www.googleapis.com/auth/cloud-identity.users.readonly,
   https://www.googleapis.com/auth/gmail.send,
   https://www.googleapis.com/auth/spreadsheets
   ```
   (`drive.readonly`/`documents.readonly` sólo si el spike lo requiere; `meetings.space.created` como alternativa a `readonly`).
4. Autorizar y esperar propagación (minutos).
5. Verificar impersonando **un** usuario piloto (spike 0.2): listar su Calendar, `spaces.get` de una reunión suya, `conferenceRecords.list`.

## 4. Cliente OAuth para login (usuarios)

1. Consola → _APIs y servicios_ → _Pantalla de consentimiento_: tipo **Interno** (sólo usuarios de la organización), scopes `openid`, `email`, `profile`.
2. _Credenciales_ → _Crear ID de cliente OAuth_ → _Aplicación web_:
   - Orígenes autorizados: `APP_URL` (`https://reuniones.smlxl.mx`, `http://localhost:3000` en dev).
   - URI de redirección: `${APP_URL}/api/auth/callback/google`.
3. Guardar `GOOGLE_OAUTH_CLIENT_ID` y `GOOGLE_OAUTH_CLIENT_SECRET` como secretos.
4. `GOOGLE_WORKSPACE_DOMAIN=smlxl.mx`; Auth.js valida `hd` y sufijo.

## 5. Pub/Sub para Workspace Events

1. Crear topic: `gcloud pubsub topics create meet-events` → `GOOGLE_PUBSUB_TOPIC=projects/<PROJECT_ID>/topics/meet-events`.
2. Permitir que Workspace Events publique:
   ```bash
   gcloud pubsub topics add-iam-policy-binding meet-events \
     --member="serviceAccount:meet-api-event-push@system.gserviceaccount.com" \
     --role="roles/pubsub.publisher"
   ```
3. Generar token del push: `openssl rand -base64 32` → `GOOGLE_PUBSUB_PUSH_TOKEN`.
4. Crear la suscripción push apuntando a la API pública (HTTPS obligatorio):
   ```bash
   gcloud pubsub subscriptions create meet-events-push \
     --topic=meet-events \
     --push-endpoint="https://api.reuniones.smlxl.mx/api/v1/webhooks/google/pubsub?token=<TOKEN>" \
     --ack-deadline=30 \
     --min-retry-delay=10s --max-retry-delay=600s
   ```
   Opcional recomendado (validar en Fase 0): `--push-auth-service-account=<SA>` y `--push-auth-token-audience=<endpoint>` para verificación OIDC además del token.
5. `GOOGLE_PUBSUB_SUBSCRIPTION=projects/<PROJECT_ID>/subscriptions/meet-events-push`.
6. Dead-letter topic opcional para mensajes que fallen > 5 veces.
7. Para desarrollo local usar un túnel HTTPS temporal o el endpoint de simulación (`/integrations/simulate/meeting-ended`).

## 6. Gemini / Vertex AI

- Prototipo: Gemini API con `GEMINI_API_KEY` (AI Studio) y `GOOGLE_GENAI_USE_VERTEXAI=false`.
- Producción (recomendado): Vertex AI con `GOOGLE_GENAI_USE_VERTEXAI=true`, `GOOGLE_CLOUD_PROJECT_ID`, `GOOGLE_CLOUD_LOCATION` y una service account **distinta** con rol `roles/aiplatform.user` (no reutilizar la de DWD).

## 7. Cuenta remitente y Sheet

- Crear la cuenta funcional (P0-8), p. ej. `seguimiento@smlxl.mx`; `GMAIL_SENDER_EMAIL`.
- Crear el Sheet de proyección con esa cuenta; `GOOGLE_SHEETS_SPREADSHEET_ID`.

## 8. Variables de entorno resultantes

| Variable                                                                                                                                        | Origen                             |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `GOOGLE_CLOUD_PROJECT_ID`                                                                                                                       | paso 1                             |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_CREDENTIALS`                                                                            | paso 2 (secreto)                   |
| `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`                                                                                          | paso 4 (secreto)                   |
| `GOOGLE_WORKSPACE_DOMAIN`                                                                                                                       | `smlxl.mx`                         |
| `GOOGLE_PUBSUB_TOPIC`, `GOOGLE_PUBSUB_SUBSCRIPTION`, `GOOGLE_PUBSUB_PUSH_TOKEN`                                                                 | paso 5 (token secreto)             |
| `GEMINI_API_KEY` o `GOOGLE_GENAI_USE_VERTEXAI` + `GOOGLE_CLOUD_LOCATION`                                                                        | paso 6                             |
| `GMAIL_SENDER_EMAIL`, `GOOGLE_SHEETS_SPREADSHEET_ID`                                                                                            | paso 7                             |
| Flags `GOOGLE_INTEGRATION_ENABLED`, `GOOGLE_MEET_EVENTS_ENABLED`, `AI_PROCESSING_ENABLED`, `GMAIL_NOTIFICATIONS_ENABLED`, `SHEETS_SYNC_ENABLED` | activar de forma incremental (§51) |

## 9. Verificación en la plataforma

1. Arrancar API/worker con los flags en `true` progresivamente.
2. **Integraciones → Estado Google** (`GET /api/v1/integrations/google/status`): muestra por scope/API si la prueba de impersonación funciona.
3. **Integraciones → Sincronizar suscripciones**: debe crear una suscripción por usuario monitoreado.
4. Realizar una reunión de prueba con notas activadas y confirmar que llega el evento (`InboundGoogleEvent`) y se procesa.

## 10. Rotación y revocación

- Rotar la llave de la service account al menos cada 90 días; eliminar llaves antiguas en la consola.
- Para revocar acceso: quitar el Client ID de la delegación en Admin Console y deshabilitar la service account.
- Rotar `GOOGLE_PUBSUB_PUSH_TOKEN` recreando la suscripción push.
