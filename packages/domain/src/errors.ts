/**
 * Códigos de error de dominio (§34). La UI los traduce a mensajes comprensibles;
 * la API los expone en `code`; los logs los registran en `errorCode`.
 */
export const DomainErrorCode = {
  // Google
  GOOGLE_MEET_ARTIFACT_NOT_AVAILABLE: 'GOOGLE_MEET_ARTIFACT_NOT_AVAILABLE',
  GOOGLE_PERMISSION_DENIED: 'GOOGLE_PERMISSION_DENIED',
  GOOGLE_SUBSCRIPTION_EXPIRED: 'GOOGLE_SUBSCRIPTION_EXPIRED',
  GOOGLE_RATE_LIMIT: 'GOOGLE_RATE_LIMIT',
  GOOGLE_NOT_FOUND: 'GOOGLE_NOT_FOUND',
  GOOGLE_TIMEOUT: 'GOOGLE_TIMEOUT',
  GOOGLE_UNAVAILABLE: 'GOOGLE_UNAVAILABLE',
  GOOGLE_CAPABILITY_BLOCKED: 'GOOGLE_CAPABILITY_BLOCKED',
  // Transcript / IA
  TRANSCRIPT_EMPTY: 'TRANSCRIPT_EMPTY',
  AI_INVALID_OUTPUT: 'AI_INVALID_OUTPUT',
  AI_LOW_CONFIDENCE: 'AI_LOW_CONFIDENCE',
  AI_PROVIDER_ERROR: 'AI_PROVIDER_ERROR',
  AI_DISABLED: 'AI_DISABLED',
  // Action items
  ACTION_ITEM_AMBIGUOUS_OWNER: 'ACTION_ITEM_AMBIGUOUS_OWNER',
  ACTION_ITEM_DUPLICATE_CANDIDATE: 'ACTION_ITEM_DUPLICATE_CANDIDATE',
  ACTION_ITEM_INVALID_TRANSITION: 'ACTION_ITEM_INVALID_TRANSITION',
  ACTION_ITEM_COMPLETION_REQUIRES_APPROVAL: 'ACTION_ITEM_COMPLETION_REQUIRES_APPROVAL',
  COMPLETION_PROPOSAL_NOT_PENDING: 'COMPLETION_PROPOSAL_NOT_PENDING',
  // Integraciones salida
  SHEETS_SYNC_FAILED: 'SHEETS_SYNC_FAILED',
  EMAIL_SEND_FAILED: 'EMAIL_SEND_FAILED',
  // Genéricos
  NOT_FOUND: 'NOT_FOUND',
  FORBIDDEN: 'FORBIDDEN',
  UNAUTHORIZED: 'UNAUTHORIZED',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  CONFLICT: 'CONFLICT',
  FEATURE_DISABLED: 'FEATURE_DISABLED',
  MEETING_EXCLUDED: 'MEETING_EXCLUDED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const
export type DomainErrorCode = (typeof DomainErrorCode)[keyof typeof DomainErrorCode]

export interface DomainErrorOptions {
  /** Si el error es transitorio y el job puede reintentar. */
  retryable?: boolean
  /** Detalles seguros para exponer (nunca secretos ni transcript completo). */
  details?: Record<string, unknown>
  cause?: unknown
}

export class DomainError extends Error {
  readonly code: DomainErrorCode
  readonly retryable: boolean
  readonly details: Record<string, unknown> | undefined

  constructor(code: DomainErrorCode, message: string, options: DomainErrorOptions = {}) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined)
    this.name = 'DomainError'
    this.code = code
    this.retryable = options.retryable ?? false
    this.details = options.details
  }

  static notFound(entity: string, id: string): DomainError {
    return new DomainError(DomainErrorCode.NOT_FOUND, `${entity} ${id} no encontrado`, {
      details: { entity, id },
    })
  }

  static forbidden(message = 'Operación no permitida'): DomainError {
    return new DomainError(DomainErrorCode.FORBIDDEN, message)
  }

  static featureDisabled(flag: string): DomainError {
    return new DomainError(
      DomainErrorCode.FEATURE_DISABLED,
      `La funcionalidad ${flag} está deshabilitada`,
      { details: { flag } },
    )
  }
}

export function isDomainError(err: unknown): err is DomainError {
  return err instanceof DomainError
}

/** Mapea códigos de dominio a códigos HTTP. Vive en dominio para que API y worker no dupliquen la regla. */
export function httpStatusForCode(code: DomainErrorCode): number {
  switch (code) {
    case DomainErrorCode.NOT_FOUND:
    case DomainErrorCode.GOOGLE_NOT_FOUND:
      return 404
    case DomainErrorCode.FORBIDDEN:
    case DomainErrorCode.GOOGLE_PERMISSION_DENIED:
      return 403
    case DomainErrorCode.UNAUTHORIZED:
      return 401
    case DomainErrorCode.VALIDATION_ERROR:
    case DomainErrorCode.ACTION_ITEM_INVALID_TRANSITION:
    case DomainErrorCode.ACTION_ITEM_COMPLETION_REQUIRES_APPROVAL:
      return 422
    case DomainErrorCode.CONFLICT:
    case DomainErrorCode.COMPLETION_PROPOSAL_NOT_PENDING:
    case DomainErrorCode.ACTION_ITEM_DUPLICATE_CANDIDATE:
      return 409
    case DomainErrorCode.GOOGLE_RATE_LIMIT:
      return 429
    case DomainErrorCode.FEATURE_DISABLED:
    case DomainErrorCode.AI_DISABLED:
      return 503
    default:
      return 500
  }
}
