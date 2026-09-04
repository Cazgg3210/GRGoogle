import { DomainError, DomainErrorCode, isDomainError } from '@smlxl/domain'
import { metrics, MetricNames } from '@smlxl/observability'

/**
 * Envoltorio de resiliencia para llamadas a Google APIs (§45.8):
 * timeout por AbortSignal, backoff exponencial con jitter en 429/5xx/red,
 * y mapeo de errores HTTP a códigos de dominio (§34).
 */
export interface GoogleRetryOptions {
  timeoutMs?: number
  retries?: number
  /** Base del backoff (ms). */
  baseDelayMs?: number
  /** Nombre de la operación (métricas/logs). */
  operation?: string
  /** Inyectable para tests: por defecto `setTimeout`. */
  sleep?: (ms: number) => Promise<void>
  /** Inyectable para tests: aleatoriedad del jitter [0,1). */
  random?: () => number
}

const DEFAULTS = { timeoutMs: 30_000, retries: 3, baseDelayMs: 500 }

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504])
const NETWORK_CODES = new Set([
  'ECONNRESET',
  'ETIMEDOUT',
  'ECONNREFUSED',
  'EAI_AGAIN',
  'ENOTFOUND',
  'EPIPE',
  'ERR_NETWORK',
  'ECONNABORTED',
])

interface HttpLikeError {
  status?: number | string
  code?: string | number
  name?: string
  message?: string
  response?: { status?: number; data?: unknown }
  cause?: unknown
}

function asHttpLike(err: unknown): HttpLikeError {
  return typeof err === 'object' && err !== null ? (err as HttpLikeError) : {}
}

/** Extrae el status HTTP de un GaxiosError/ApiError o similares. */
export function httpStatusOf(err: unknown): number | null {
  const e = asHttpLike(err)
  const candidates = [e.status, e.response?.status, e.code]
  for (const c of candidates) {
    const n = typeof c === 'string' ? Number(c) : c
    if (typeof n === 'number' && Number.isFinite(n) && n >= 100 && n < 600) return n
  }
  return null
}

function isAbortError(err: unknown): boolean {
  const e = asHttpLike(err)
  return (
    e.name === 'AbortError' || e.code === 'ABORT_ERR' || /aborted|timeout/i.test(e.message ?? '')
  )
}

function isNetworkError(err: unknown): boolean {
  const e = asHttpLike(err)
  if (typeof e.code === 'string' && NETWORK_CODES.has(e.code)) return true
  const cause = asHttpLike(e.cause)
  return typeof cause.code === 'string' && NETWORK_CODES.has(cause.code)
}

/** Mapea cualquier error de Google (GaxiosError, ApiError, red, abort) a DomainError. */
export function mapGoogleError(err: unknown, operation = 'google'): DomainError {
  if (isDomainError(err)) return err
  const status = httpStatusOf(err)
  const message = asHttpLike(err).message ?? 'Error de Google API'
  const details = { operation, status }
  if (isAbortError(err) && status === null) {
    return new DomainError(DomainErrorCode.GOOGLE_TIMEOUT, `Timeout en ${operation}`, {
      retryable: true,
      details,
      cause: err,
    })
  }
  if (status === 403 || status === 401) {
    return new DomainError(
      DomainErrorCode.GOOGLE_PERMISSION_DENIED,
      `Permiso denegado en ${operation}: ${message}`,
      {
        details,
        cause: err,
      },
    )
  }
  if (status === 404) {
    return new DomainError(
      DomainErrorCode.GOOGLE_NOT_FOUND,
      `Recurso no encontrado en ${operation}`,
      {
        details,
        cause: err,
      },
    )
  }
  if (status === 429) {
    return new DomainError(DomainErrorCode.GOOGLE_RATE_LIMIT, `Límite de cuota en ${operation}`, {
      retryable: true,
      details,
      cause: err,
    })
  }
  if (status !== null && status >= 500) {
    return new DomainError(
      DomainErrorCode.GOOGLE_UNAVAILABLE,
      `Google no disponible en ${operation} (${status})`,
      {
        retryable: true,
        details,
        cause: err,
      },
    )
  }
  if (status === null && isNetworkError(err)) {
    return new DomainError(
      DomainErrorCode.GOOGLE_UNAVAILABLE,
      `Error de red en ${operation}: ${message}`,
      {
        retryable: true,
        details,
        cause: err,
      },
    )
  }
  if (status === 400 || status === 409 || status === 412 || status === 422) {
    return new DomainError(
      DomainErrorCode.VALIDATION_ERROR,
      `Google rechazó la solicitud en ${operation}: ${message}`,
      {
        details,
        cause: err,
      },
    )
  }
  return new DomainError(DomainErrorCode.GOOGLE_UNAVAILABLE, `Error en ${operation}: ${message}`, {
    retryable: false,
    details,
    cause: err,
  })
}

export function isRetryableGoogleError(err: unknown): boolean {
  if (isDomainError(err)) return err.retryable
  const status = httpStatusOf(err)
  if (status !== null) return RETRYABLE_STATUS.has(status)
  return isNetworkError(err) || isAbortError(err)
}

const defaultSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/**
 * Ejecuta `fn` con timeout y reintentos. `fn` recibe un AbortSignal que debe
 * propagar a la llamada HTTP (gaxios `signal`).
 */
export async function withGoogleRetry<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  options: GoogleRetryOptions = {},
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? DEFAULTS.timeoutMs
  const retries = options.retries ?? DEFAULTS.retries
  const base = options.baseDelayMs ?? DEFAULTS.baseDelayMs
  const sleep = options.sleep ?? defaultSleep
  const random = options.random ?? Math.random
  const operation = options.operation ?? 'google'

  let attempt = 0
  for (;;) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(new Error(`timeout ${operation}`)), timeoutMs)
    try {
      return await fn(controller.signal)
    } catch (err) {
      const mapped = mapGoogleError(err, operation)
      metrics.increment(MetricNames.GOOGLE_API_ERRORS, 1, { operation, code: mapped.code })
      if (!mapped.retryable || attempt >= retries) throw mapped
      attempt += 1
      const delay = Math.round(base * 2 ** (attempt - 1) * (0.5 + random()))
      await sleep(delay)
    } finally {
      clearTimeout(timer)
    }
  }
}
