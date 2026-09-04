import type { FastifyInstance } from 'fastify'
import { ZodError } from 'zod'
import { hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod'
import { DomainErrorCode, httpStatusForCode, isDomainError } from '@smlxl/domain'
import type { ErrorResponseDto } from '@smlxl/contracts'

/**
 * Traduce DomainError / errores de validación a `ErrorResponseSchema` (§34).
 * Nunca expone stack traces ni datos sensibles al cliente.
 */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    const correlationId = request.id
    if (isDomainError(error)) {
      const status = httpStatusForCode(error.code)
      if (status >= 500) request.log.error({ err: error, errorCode: error.code }, 'error de dominio')
      else request.log.warn({ errorCode: error.code }, error.message)
      const body: ErrorResponseDto = { code: error.code, message: error.message, details: error.details, correlationId }
      return reply.status(status).send(body)
    }
    if (hasZodFastifySchemaValidationErrors(error) || error instanceof ZodError) {
      const issues = error instanceof ZodError ? error.issues : error.validation
      const body: ErrorResponseDto = {
        code: DomainErrorCode.VALIDATION_ERROR,
        message: 'Datos de entrada inválidos',
        details: { issues },
        correlationId,
      }
      return reply.status(422).send(body)
    }
    const statusCode = (error as { statusCode?: number }).statusCode
    if (statusCode && statusCode < 500) {
      const body: ErrorResponseDto = {
        code: statusCode === 401 ? DomainErrorCode.UNAUTHORIZED : statusCode === 403 ? DomainErrorCode.FORBIDDEN : statusCode === 404 ? DomainErrorCode.NOT_FOUND : DomainErrorCode.VALIDATION_ERROR,
        message: (error as { message?: string }).message ?? 'Solicitud inválida',
        correlationId,
      }
      return reply.status(statusCode).send(body)
    }
    request.log.error({ err: error }, 'error no controlado')
    const body: ErrorResponseDto = { code: DomainErrorCode.INTERNAL_ERROR, message: 'Error interno', correlationId }
    return reply.status(500).send(body)
  })

  app.setNotFoundHandler((request, reply) => {
    const body: ErrorResponseDto = { code: DomainErrorCode.NOT_FOUND, message: `Ruta no encontrada: ${request.method} ${request.url}`, correlationId: request.id }
    return reply.status(404).send(body)
  })
}
