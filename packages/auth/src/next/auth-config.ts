import type { NextAuthConfig, Session } from 'next-auth'
import type { JWT } from 'next-auth/jwt'
import Google from 'next-auth/providers/google'
import Credentials from 'next-auth/providers/credentials'
import type { SessionDto } from '@smlxl/contracts'
import {
  DEFAULT_API_TOKEN_TTL_SECONDS,
  isApiTokenRole,
  mintApiToken,
  type ApiTokenRole,
} from '../token/api-token.js'

/**
 * Configuración Auth.js v5 (§6.5): Google OAuth restringido al dominio de la
 * empresa + allowlist verificada contra `GET /api/v1/session`. Con
 * AUTH_DEV_BYPASS se agrega un proveedor de credenciales "Acceso de desarrollo".
 *
 * El JWT de Auth.js guarda `apiToken` (HS256, ver ../token/api-token.ts) que
 * el frontend envía a la API en `Authorization: Bearer`.
 */

export interface AuthEnv {
  NODE_ENV: 'development' | 'test' | 'production'
  API_URL: string
  AUTH_SECRET: string
  AUTH_DEV_BYPASS: boolean
  GOOGLE_OAUTH_CLIENT_ID: string
  GOOGLE_OAUTH_CLIENT_SECRET: string
  GOOGLE_WORKSPACE_DOMAIN: string
}

/** Minutos antes de expirar en los que el jwt callback re-emite el apiToken. */
const REFRESH_WINDOW_SECONDS = 5 * 60
const API_TIMEOUT_MS = 4000
export const DEV_CREDENTIALS_PROVIDER_ID = 'dev-bypass'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      email: string
      name: string
      role: ApiTokenRole
      image?: string | null
    }
    /** JWT HS256 para la API interna. */
    apiToken: string
    /** Epoch seconds de expiración del apiToken. */
    apiTokenExpiresAt: number
    /** True cuando el usuario entró por el proveedor de desarrollo. */
    devBypass: boolean
  }
  interface User {
    role?: ApiTokenRole
    platformUserId?: string
    devBypass?: boolean
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    userId?: string
    email?: string
    role?: ApiTokenRole
    name?: string
    apiToken?: string
    apiTokenExp?: number
    devBypass?: boolean
    /** Marca que ya se intentó confirmar el usuario contra la API. */
    apiSessionChecked?: boolean
  }
}

export type ApiSessionLookup =
  { ok: true; session: SessionDto } | { ok: false; reason: 'NOT_ALLOWED' | 'UNREACHABLE' }

function emailAllowed(email: string | null | undefined, domain: string): email is string {
  if (!email) return false
  return email.trim().toLowerCase().endsWith(`@${domain.toLowerCase()}`)
}

/**
 * Consulta `GET /api/v1/session` para confirmar que el usuario existe y está
 * activo. Emite un token de arranque con `sub = email` (la API resuelve el
 * usuario por email cuando `sub` no es un uuid) y, en bypass, agrega
 * `x-dev-user-email`.
 */
export async function lookupApiSession(
  env: AuthEnv,
  identity: { email: string; name: string; role?: ApiTokenRole; userId?: string },
): Promise<ApiSessionLookup> {
  const token = await mintApiToken(
    {
      sub: identity.userId ?? identity.email,
      email: identity.email,
      role: identity.role ?? 'MEMBER',
      name: identity.name,
    },
    env.AUTH_SECRET,
    120,
  )
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
  }
  if (env.AUTH_DEV_BYPASS) headers['x-dev-user-email'] = identity.email
  try {
    const res = await fetch(`${env.API_URL.replace(/\/$/, '')}/api/v1/session`, {
      headers,
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
      cache: 'no-store',
    })
    if (res.status === 401 || res.status === 403 || res.status === 404) {
      return { ok: false, reason: 'NOT_ALLOWED' }
    }
    if (!res.ok) return { ok: false, reason: 'UNREACHABLE' }
    const dto = (await res.json()) as SessionDto
    if (!dto?.user?.id || !dto.user.active) return { ok: false, reason: 'NOT_ALLOWED' }
    return { ok: true, session: dto }
  } catch {
    return { ok: false, reason: 'UNREACHABLE' }
  }
}

export function createAuthConfig(env: AuthEnv): NextAuthConfig {
  const domain = env.GOOGLE_WORKSPACE_DOMAIN
  const isProd = env.NODE_ENV === 'production'
  const providers: NextAuthConfig['providers'] = []

  if (env.GOOGLE_OAUTH_CLIENT_ID && env.GOOGLE_OAUTH_CLIENT_SECRET) {
    providers.push(
      Google({
        clientId: env.GOOGLE_OAUTH_CLIENT_ID,
        clientSecret: env.GOOGLE_OAUTH_CLIENT_SECRET,
        authorization: {
          params: { hd: domain, prompt: 'select_account', scope: 'openid email profile' },
        },
        profile(profile) {
          return {
            id: profile.sub,
            email: profile.email,
            name: profile.name ?? profile.email,
            image: profile.picture ?? null,
          }
        },
      }),
    )
  }

  if (env.AUTH_DEV_BYPASS && !isProd) {
    providers.push(
      Credentials({
        id: DEV_CREDENTIALS_PROVIDER_ID,
        name: 'Acceso de desarrollo',
        credentials: {
          email: { label: 'Correo corporativo', type: 'email' },
        },
        async authorize(credentials) {
          const email =
            typeof credentials?.email === 'string' ? credentials.email.trim().toLowerCase() : ''
          if (!emailAllowed(email, domain)) return null
          const localName = email.split('@')[0] ?? email
          const lookup = await lookupApiSession(env, { email, name: localName })
          if (lookup.ok) {
            return {
              id: lookup.session.user.id,
              platformUserId: lookup.session.user.id,
              email: lookup.session.user.email,
              name: lookup.session.user.displayName,
              role: lookup.session.user.role,
              devBypass: true,
            }
          }
          if (lookup.reason === 'NOT_ALLOWED') return null
          // API no disponible en desarrollo: sesión mínima como MEMBER.
          return {
            id: email,
            platformUserId: email,
            email,
            name: localName,
            role: 'MEMBER',
            devBypass: true,
          }
        },
      }),
    )
  }

  return {
    secret: env.AUTH_SECRET,
    trustHost: true,
    session: { strategy: 'jwt', maxAge: 8 * 60 * 60 },
    pages: { signIn: '/login', error: '/login' },
    providers,
    callbacks: {
      async signIn({ user, account }) {
        if (account?.provider === DEV_CREDENTIALS_PROVIDER_ID) return true
        if (!emailAllowed(user.email, domain)) return false
        const lookup = await lookupApiSession(env, {
          email: user.email,
          name: user.name ?? user.email,
        })
        if (lookup.ok) return true
        if (lookup.reason === 'NOT_ALLOWED') return false
        // API inalcanzable: sólo se permite en modo bypass de desarrollo.
        return env.AUTH_DEV_BYPASS && !isProd
      },
      async jwt({ token, user, account }) {
        if (user) {
          token.email = user.email ?? token.email
          token.name = user.name ?? token.name
          token.devBypass = user.devBypass ?? account?.provider === DEV_CREDENTIALS_PROVIDER_ID
          if (user.platformUserId && user.role) {
            token.userId = user.platformUserId
            token.role = user.role
            token.apiSessionChecked = true
          } else {
            token.apiSessionChecked = false
          }
        }
        if (!token.apiSessionChecked && token.email) {
          const lookup = await lookupApiSession(env, {
            email: token.email,
            name: token.name ?? token.email,
          })
          if (lookup.ok) {
            token.userId = lookup.session.user.id
            token.role = lookup.session.user.role
            token.name = lookup.session.user.displayName
            token.apiSessionChecked = true
          } else {
            token.userId = token.userId ?? token.email
            token.role = token.role ?? 'MEMBER'
            // Se reintenta en la siguiente petición hasta que la API responda.
            token.apiSessionChecked = lookup.reason === 'NOT_ALLOWED'
          }
        }
        const now = Math.floor(Date.now() / 1000)
        const needsToken =
          !token.apiToken || !token.apiTokenExp || token.apiTokenExp - now < REFRESH_WINDOW_SECONDS
        if (needsToken && token.email && token.userId && isApiTokenRole(token.role)) {
          token.apiToken = await mintApiToken(
            {
              sub: token.userId,
              email: token.email,
              role: token.role,
              name: token.name ?? token.email,
            },
            env.AUTH_SECRET,
            DEFAULT_API_TOKEN_TTL_SECONDS,
          )
          token.apiTokenExp = now + DEFAULT_API_TOKEN_TTL_SECONDS
        }
        return token
      },
      session({ session, token }) {
        return {
          ...session,
          user: {
            ...session.user,
            id: token.userId ?? '',
            email: token.email ?? session.user.email ?? '',
            name: token.name ?? session.user.name ?? '',
            role: isApiTokenRole(token.role) ? token.role : 'MEMBER',
          },
          apiToken: token.apiToken ?? '',
          apiTokenExpiresAt: token.apiTokenExp ?? 0,
          devBypass: token.devBypass ?? false,
        }
      },
    },
  }
}

export function getApiToken(session: Session | null | undefined): string | null {
  if (!session?.apiToken) return null
  return session.apiToken
}

export function apiTokenFromJwt(token: JWT | null | undefined): string | null {
  return token?.apiToken ?? null
}
