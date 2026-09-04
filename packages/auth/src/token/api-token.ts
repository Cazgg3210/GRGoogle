import { SignJWT, jwtVerify, errors as joseErrors } from 'jose'

/**
 * Token interno web -> API (docs/api/endpoints.md "Autenticación").
 *
 * El frontend (Auth.js) emite un JWT HS256 firmado con AUTH_SECRET; la API lo
 * verifica y construye el Principal. Este módulo NO importa Next.js ni Auth.js
 * para que `apps/api` pueda reutilizar `verifyApiToken` tal cual.
 */

export const API_TOKEN_ISSUER = 'smlxl-web'
export const API_TOKEN_AUDIENCE = 'smlxl-api'
export const DEFAULT_API_TOKEN_TTL_SECONDS = 3600

export type ApiTokenRole = 'ADMIN' | 'DIRECTOR' | 'MANAGER' | 'MEMBER' | 'AUDITOR'

export interface ApiTokenInput {
  /** Id del usuario en la plataforma (uuid). En bypass sin API alcanzable puede ser el email. */
  sub: string
  email: string
  role: ApiTokenRole
  name: string
}

export interface ApiTokenClaims extends ApiTokenInput {
  iss: typeof API_TOKEN_ISSUER
  aud: typeof API_TOKEN_AUDIENCE
  /** Epoch seconds. */
  iat: number
  /** Epoch seconds. */
  exp: number
}

export type ApiTokenErrorReason = 'EXPIRED' | 'INVALID' | 'MALFORMED_CLAIMS'

export class ApiTokenError extends Error {
  readonly reason: ApiTokenErrorReason
  constructor(reason: ApiTokenErrorReason, message: string, cause?: unknown) {
    super(message, cause !== undefined ? { cause } : undefined)
    this.name = 'ApiTokenError'
    this.reason = reason
  }
}

const ROLES: readonly ApiTokenRole[] = ['ADMIN', 'DIRECTOR', 'MANAGER', 'MEMBER', 'AUDITOR']

export function isApiTokenRole(value: unknown): value is ApiTokenRole {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value)
}

function secretKey(secret: string): Uint8Array {
  if (!secret || secret.length < 8) {
    throw new Error('AUTH_SECRET inválido: se requiere una cadena de al menos 8 caracteres')
  }
  return new TextEncoder().encode(secret)
}

export async function mintApiToken(
  input: ApiTokenInput,
  secret: string,
  ttlSeconds: number = DEFAULT_API_TOKEN_TTL_SECONDS,
): Promise<string> {
  if (!input.sub) throw new Error('sub requerido para emitir token')
  if (!isApiTokenRole(input.role)) throw new Error(`Rol desconocido: ${String(input.role)}`)
  const now = Math.floor(Date.now() / 1000)
  return new SignJWT({ email: input.email, role: input.role, name: input.name })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(input.sub)
    .setIssuer(API_TOKEN_ISSUER)
    .setAudience(API_TOKEN_AUDIENCE)
    .setIssuedAt(now)
    .setExpirationTime(now + ttlSeconds)
    .sign(secretKey(secret))
}

export async function verifyApiToken(token: string, secret: string): Promise<ApiTokenClaims> {
  let payload: Record<string, unknown>
  try {
    const result = await jwtVerify(token, secretKey(secret), {
      issuer: API_TOKEN_ISSUER,
      audience: API_TOKEN_AUDIENCE,
      algorithms: ['HS256'],
    })
    payload = result.payload as Record<string, unknown>
  } catch (err) {
    if (err instanceof joseErrors.JWTExpired) {
      throw new ApiTokenError('EXPIRED', 'El token de sesión expiró', err)
    }
    throw new ApiTokenError('INVALID', 'Token de sesión inválido', err)
  }
  const { sub, email, role, name, iat, exp } = payload
  if (
    typeof sub !== 'string' ||
    typeof email !== 'string' ||
    !isApiTokenRole(role) ||
    typeof iat !== 'number' ||
    typeof exp !== 'number'
  ) {
    throw new ApiTokenError('MALFORMED_CLAIMS', 'El token no contiene los claims esperados')
  }
  return {
    sub,
    email,
    role,
    name: typeof name === 'string' ? name : '',
    iss: API_TOKEN_ISSUER,
    aud: API_TOKEN_AUDIENCE,
    iat,
    exp,
  }
}

/** Segundos restantes de vida del token (negativo si ya expiró). */
export function apiTokenSecondsLeft(claims: Pick<ApiTokenClaims, 'exp'>, now = new Date()): number {
  return claims.exp - Math.floor(now.getTime() / 1000)
}
