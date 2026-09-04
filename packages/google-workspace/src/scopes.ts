/**
 * Inventario de scopes OAuth de Google Workspace por adapter (§13.4, §27.2).
 *
 * Todos son candidatos: el set definitivo se cierra en el spike de Fase 0
 * (docs/security/google-oauth-scopes.md). Sólo se listan scopes oficiales;
 * nunca inventar scopes (§45.6).
 */
export const GOOGLE_SCOPES = {
  meet: {
    /** candidato; confirmar en spike (docs/security/google-oauth-scopes.md) — lectura de spaces/conference records/artefactos. */
    SPACE_READONLY: 'https://www.googleapis.com/auth/meetings.space.readonly',
    /** candidato; confirmar en spike (docs/security/google-oauth-scopes.md) — spaces creados por el usuario impersonado. */
    SPACE_CREATED: 'https://www.googleapis.com/auth/meetings.space.created',
    /** candidato; confirmar en spike (docs/security/google-oauth-scopes.md) — spaces.patch artifactConfig (auto-captura §12.3). */
    SPACE_SETTINGS: 'https://www.googleapis.com/auth/meetings.space.settings',
  },
  calendar: {
    /** candidato; confirmar en spike (docs/security/google-oauth-scopes.md) — events.list incremental (§14.2). */
    EVENTS_READONLY: 'https://www.googleapis.com/auth/calendar.events.readonly',
    /** candidato; confirmar en spike (docs/security/google-oauth-scopes.md) — lectura de calendarios (fallback). */
    READONLY: 'https://www.googleapis.com/auth/calendar.readonly',
  },
  gmail: {
    /** candidato; confirmar en spike (docs/security/google-oauth-scopes.md) — envío desde el buzón remitente (§17). */
    SEND: 'https://www.googleapis.com/auth/gmail.send',
  },
  sheets: {
    /** candidato; confirmar en spike (docs/security/google-oauth-scopes.md) — proyección Pendientes/Reuniones (§16.9). */
    SPREADSHEETS: 'https://www.googleapis.com/auth/spreadsheets',
  },
  drive: {
    /** candidato; confirmar en spike (docs/security/google-oauth-scopes.md) — export de Smart Notes (§15). */
    READONLY: 'https://www.googleapis.com/auth/drive.readonly',
    /** candidato; confirmar en spike (docs/security/google-oauth-scopes.md) — documents.get para Smart Notes. */
    DOCUMENTS_READONLY: 'https://www.googleapis.com/auth/documents.readonly',
  },
  directory: {
    /** candidato; confirmar en spike (docs/security/google-oauth-scopes.md) — users.list del dominio (§13.2). */
    USER_READONLY: 'https://www.googleapis.com/auth/admin.directory.user.readonly',
    /** candidato; confirmar en spike (docs/security/google-oauth-scopes.md) — resolver `//cloudidentity.googleapis.com/users/{id}`. */
    CLOUD_IDENTITY_USERS_READONLY: 'https://www.googleapis.com/auth/cloud-identity.users.readonly',
  },
  workspaceEvents: {
    /**
     * candidato; confirmar en spike (docs/security/google-oauth-scopes.md) — las suscripciones a eventos de Meet
     * se autorizan con los scopes de Meet (readonly/created); no existe scope propio inventado aquí.
     */
    MEET_SPACE_READONLY: 'https://www.googleapis.com/auth/meetings.space.readonly',
    MEET_SPACE_CREATED: 'https://www.googleapis.com/auth/meetings.space.created',
  },
} as const

export type GoogleScopeGroup = keyof typeof GOOGLE_SCOPES

/** Lista plana (única) de scopes por grupo de adapter. */
export function scopesFor(...groups: GoogleScopeGroup[]): string[] {
  const out = new Set<string>()
  for (const g of groups) for (const s of Object.values(GOOGLE_SCOPES[g])) out.add(s)
  return [...out]
}

/** Todos los scopes candidatos (para documentación/DWD). */
export const ALL_GOOGLE_SCOPES: readonly string[] = scopesFor(
  'meet',
  'calendar',
  'gmail',
  'sheets',
  'drive',
  'directory',
  'workspaceEvents',
)
