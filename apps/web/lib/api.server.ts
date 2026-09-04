import 'server-only'
import { cache } from 'react'
import { permissionsFor, type UserRole } from '@smlxl/domain'
import type { SessionDto } from '@smlxl/contracts'
import { getApiToken } from '@smlxl/auth/next'
import { auth } from '@/auth'
import { API_BASE_URL, env } from '@/env'
import { createApiClient, safe, type ApiClient } from './api'

export { safe }

/** Headers de autenticación para la API a partir de la sesión Auth.js. */
export async function authHeaders(): Promise<Record<string, string>> {
  const session = await auth()
  const headers: Record<string, string> = {}
  const token = getApiToken(session)
  if (token) headers.Authorization = `Bearer ${token}`
  if (env.AUTH_DEV_BYPASS && session?.user?.email) headers['x-dev-user-email'] = session.user.email
  return headers
}

/** Cliente para Server Components / Server Actions. */
export const api: ApiClient = createApiClient({ baseUrl: API_BASE_URL, getHeaders: authHeaders })

/** Cliente con credenciales de arranque (solo bypass): usado en /login para listar usuarios demo. */
export function bootstrapApi(email: string, token: string): ApiClient {
  return createApiClient({
    baseUrl: API_BASE_URL,
    getHeaders: () => ({ Authorization: `Bearer ${token}`, 'x-dev-user-email': email }),
    timeoutMs: 4000,
  })
}

export interface AppSession {
  userId: string
  email: string
  name: string
  role: UserRole
  permissions: string[]
  devBypass: boolean
  /** True si `/session` respondió; false si se derivó del JWT (API inalcanzable). */
  verified: boolean
  dto: SessionDto | null
}

/**
 * Sesión efectiva para el layout: usuario + permisos desde `GET /session`.
 * Si la API no responde se derivan los permisos del rol del JWT sólo para
 * ocultar navegación; el RBAC real siempre lo aplica la API.
 */
export const getAppSession = cache(async (): Promise<AppSession | null> => {
  const session = await auth()
  if (!session?.user) return null
  const base: AppSession = {
    userId: session.user.id,
    email: session.user.email,
    name: session.user.name,
    role: session.user.role,
    permissions: [...permissionsFor(session.user.role)],
    devBypass: session.devBypass,
    verified: false,
    dto: null,
  }
  const result = await safe(api.get<SessionDto>('/session'))
  if (!result.ok) return base
  return {
    ...base,
    userId: result.data.user.id,
    name: result.data.user.displayName,
    role: result.data.user.role,
    permissions: result.data.permissions,
    verified: true,
    dto: result.data,
  }
})
