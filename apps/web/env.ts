import { EnvSchema } from '@smlxl/config'

/**
 * Subconjunto de variables que necesita la web (server). Nunca se exponen
 * secretos al cliente: sólo NEXT_PUBLIC_* llega al navegador.
 */
const WebEnvSchema = EnvSchema.pick({
  NODE_ENV: true,
  APP_URL: true,
  API_URL: true,
  AUTH_SECRET: true,
  AUTH_DEV_BYPASS: true,
  AUTH_DEV_BOOTSTRAP_EMAIL: true,
  GOOGLE_OAUTH_CLIENT_ID: true,
  GOOGLE_OAUTH_CLIENT_SECRET: true,
  GOOGLE_WORKSPACE_DOMAIN: true,
  COMPANY_TIMEZONE: true,
})

export type WebEnv = ReturnType<typeof WebEnvSchema.parse>

function load(): WebEnv {
  const parsed = WebEnvSchema.safeParse(process.env)
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
    throw new Error(`Configuración de entorno inválida (web): ${issues}`)
  }
  // `next build` corre con NODE_ENV=production aunque el .env local tenga bypass;
  // el guard sólo aplica al servidor real (next start), no a la fase de build.
  const building = process.env.NEXT_PHASE === 'phase-production-build'
  if (parsed.data.NODE_ENV === 'production' && parsed.data.AUTH_DEV_BYPASS && !building) {
    throw new Error('AUTH_DEV_BYPASS no puede estar activo en producción')
  }
  return parsed.data
}

export const env: WebEnv = load()

export const API_BASE_URL = `${env.API_URL.replace(/\/$/, '')}/api/v1`
