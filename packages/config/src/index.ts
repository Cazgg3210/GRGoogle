import { z } from 'zod'
import { DEFAULT_COMPANY_TIMEZONE, FEATURE_FLAG_NAMES, type FeatureFlags } from '@smlxl/domain'

/**
 * Configuración por entorno (§40) y feature flags (§51).
 * Los valores de env son defaults; la administración puede sobreescribir flags en BD.
 */

const bool = z
  .union([z.boolean(), z.string()])
  .transform((v) =>
    typeof v === 'boolean' ? v : ['1', 'true', 'yes', 'on'].includes(v.trim().toLowerCase()),
  )

export const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_URL: z.string().url().default('http://localhost:3000'),
  API_URL: z.string().url().default('http://localhost:4000'),
  PORT_API: z.coerce.number().int().default(4000),
  PORT_WEB: z.coerce.number().int().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  COMPANY_TIMEZONE: z.string().default(DEFAULT_COMPANY_TIMEZONE),

  DATABASE_URL: z.string().min(1),

  AUTH_SECRET: z.string().min(8).default('dev-secret-change-me'),
  AUTH_DEV_BYPASS: bool.default(false),
  /** Correo con el que la web consulta el directorio para el selector de usuarios demo (solo bypass). */
  AUTH_DEV_BOOTSTRAP_EMAIL: z.string().email().optional().default('gestora@smlxl.mx'),
  GOOGLE_OAUTH_CLIENT_ID: z.string().optional().default(''),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().optional().default(''),
  GOOGLE_WORKSPACE_DOMAIN: z.string().default('smlxl.mx'),

  GOOGLE_CLOUD_PROJECT_ID: z.string().optional().default(''),
  GOOGLE_PUBSUB_TOPIC: z.string().optional().default(''),
  GOOGLE_PUBSUB_SUBSCRIPTION: z.string().optional().default(''),
  GOOGLE_PUBSUB_PUSH_TOKEN: z.string().optional().default(''),
  GOOGLE_SERVICE_ACCOUNT_EMAIL: z.string().optional().default(''),
  GOOGLE_SERVICE_ACCOUNT_CREDENTIALS: z.string().optional().default(''),

  GEMINI_API_KEY: z.string().optional().default(''),
  GEMINI_MODEL: z.string().default('gemini-2.5-flash'),
  GOOGLE_GENAI_USE_VERTEXAI: bool.default(false),
  GOOGLE_CLOUD_LOCATION: z.string().default('us-central1'),

  GOOGLE_SHEETS_SPREADSHEET_ID: z.string().optional().default(''),
  GMAIL_SENDER_EMAIL: z.string().optional().default(''),

  GOOGLE_INTEGRATION_ENABLED: bool.default(false),
  GOOGLE_MEET_EVENTS_ENABLED: bool.default(false),
  AI_PROCESSING_ENABLED: bool.default(false),
  AI_COMPLETION_PROPOSALS_ENABLED: bool.default(true),
  GMAIL_NOTIFICATIONS_ENABLED: bool.default(false),
  SHEETS_SYNC_ENABLED: bool.default(false),
  WEEKLY_DIGEST_ENABLED: bool.default(true),
})

export type Env = z.infer<typeof EnvSchema>

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.safeParse(source)
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
    throw new Error(`Configuración de entorno inválida: ${issues}`)
  }
  const env = parsed.data
  if (env.NODE_ENV === 'production' && env.AUTH_DEV_BYPASS) {
    throw new Error('AUTH_DEV_BYPASS no puede estar activo en producción')
  }
  if (env.NODE_ENV === 'production' && env.AUTH_SECRET === 'dev-secret-change-me') {
    throw new Error('AUTH_SECRET debe configurarse en producción')
  }
  return env
}

export function featureFlagsFromEnv(env: Env): FeatureFlags {
  const flags = {} as FeatureFlags
  for (const name of FEATURE_FLAG_NAMES) flags[name] = env[name]
  return flags
}

/** Modo de integración Google: REAL sólo si el flag está activo y hay credenciales. */
export function googleMode(env: Env): 'FAKE' | 'REAL' {
  if (!env.GOOGLE_INTEGRATION_ENABLED) return 'FAKE'
  if (!env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS && !env.GOOGLE_SERVICE_ACCOUNT_EMAIL) return 'FAKE'
  return 'REAL'
}

export function aiMode(env: Env): 'FAKE' | 'GEMINI' {
  if (!env.AI_PROCESSING_ENABLED) return 'FAKE'
  if (env.GOOGLE_GENAI_USE_VERTEXAI) return env.GOOGLE_CLOUD_PROJECT_ID ? 'GEMINI' : 'FAKE'
  return env.GEMINI_API_KEY ? 'GEMINI' : 'FAKE'
}

/** Nombres de jobs (§31). Un solo lugar para evitar strings dispersos. */
export const JobNames = {
  PROCESS_GOOGLE_EVENT: 'process-google-event',
  FETCH_MEETING_ARTIFACTS: 'fetch-meeting-artifacts',
  ANALYZE_MEETING: 'analyze-meeting',
  RECONCILE_ACTION_ITEMS: 'reconcile-action-items',
  SEND_ACTION_ITEM_NOTIFICATION: 'send-action-item-notification',
  SEND_DUE_REMINDERS: 'send-due-reminders',
  GENERATE_WEEKLY_DIGEST: 'generate-weekly-digest',
  SEND_WEEKLY_DIGEST: 'send-weekly-digest',
  SYNC_GOOGLE_SHEETS: 'sync-google-sheets',
  RENEW_GOOGLE_SUBSCRIPTIONS: 'renew-google-subscriptions',
  RETRY_FAILED_MEETING_PROCESSING: 'retry-failed-meeting-processing',
  CLEANUP_EXPIRED_RAW_DATA: 'cleanup-expired-raw-data',
  CALENDAR_INCREMENTAL_SYNC: 'calendar-incremental-sync',
  RECONCILE_MISSING_EVENTS: 'reconcile-missing-events',
} as const
export type JobName = (typeof JobNames)[keyof typeof JobNames]
