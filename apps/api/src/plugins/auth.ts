import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { verifyApiToken } from '@smlxl/auth/token'
import { DomainError, DomainErrorCode, hasPermission, type Permission, type Principal, type UserRepository } from '@smlxl/domain'
import type { Env } from '@smlxl/config'

declare module 'fastify' {
  interface FastifyRequest {
    principal: Principal | null
  }
}

export interface AuthPluginOptions {
  env: Env
  users: UserRepository
}

/**
 * Autenticación (docs/api/endpoints.md): JWT HS256 emitido por el frontend
 * (issuer smlxl-web, audience smlxl-api). Con AUTH_DEV_BYPASS acepta el header
 * `x-dev-user-email` (sólo desarrollo). El principal se construye desde BD
 * para que el rol/alcance siempre sea el vigente (RBAC server-side, §25).
 */
export function registerAuth(app: FastifyInstance, options: AuthPluginOptions): void {
  app.decorateRequest('principal', null)

  app.addHook('onRequest', async (request) => {
    request.principal = null
    let email: string | null = null
    const header = request.headers.authorization
    if (header?.startsWith('Bearer ')) {
      try {
        const claims = await verifyApiToken(header.slice(7), options.env.AUTH_SECRET)
        email = claims.email
      } catch {
        throw new DomainError(DomainErrorCode.UNAUTHORIZED, 'Token inválido o expirado')
      }
    } else if (options.env.AUTH_DEV_BYPASS && options.env.NODE_ENV !== 'production') {
      const dev = request.headers['x-dev-user-email']
      if (typeof dev === 'string' && dev.length > 0) email = dev
    }
    if (!email) return
    const found = await options.users.findByEmail(email.toLowerCase())
    if (!found || !found.active) {
      throw new DomainError(DomainErrorCode.UNAUTHORIZED, 'Usuario no autorizado en la plataforma')
    }
    const teamUserIds = found.role === 'MANAGER' ? await options.users.listTeamUserIds(found.id) : []
    request.principal = {
      id: found.id,
      role: found.role,
      areaId: found.areaId,
      email: found.email,
      managedAreaIds: found.areaId ? [found.areaId] : [],
      teamUserIds,
    }
  })
}

export function requirePrincipal(request: FastifyRequest): Principal {
  if (!request.principal) throw new DomainError(DomainErrorCode.UNAUTHORIZED, 'Se requiere autenticación')
  return request.principal
}

export function requirePermission(permission: Permission) {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    const principal = requirePrincipal(request)
    if (!hasPermission(principal, permission)) {
      throw DomainError.forbidden(`Se requiere el permiso ${permission}`)
    }
  }
}

export function requireAnyPermission(...permissions: Permission[]) {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    const principal = requirePrincipal(request)
    if (!permissions.some((p) => hasPermission(principal, p))) {
      throw DomainError.forbidden(`Se requiere alguno de: ${permissions.join(', ')}`)
    }
  }
}
