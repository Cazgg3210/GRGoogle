import type { ErrorResponseDto } from '@smlxl/contracts'

/**
 * Cliente HTTP tipado hacia /api/v1 (isomórfico). El servidor lo usa con el
 * apiToken de sesión; el cliente lo usa contra /api/proxy (que agrega el token).
 */

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details: Record<string, unknown> | undefined
  readonly correlationId: string | undefined

  constructor(status: number, body: ErrorResponseDto) {
    super(body.message || `Error ${status}`)
    this.name = 'ApiError'
    this.status = status
    this.code = body.code
    this.details = body.details
    this.correlationId = body.correlationId
  }

  static network(cause: unknown): ApiError {
    const err = new ApiError(0, {
      code: 'NETWORK_ERROR',
      message: 'No se pudo conectar con el servicio de la plataforma',
    })
    if (cause instanceof Error) err.cause = cause
    return err
  }
}

export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError
}

export type QueryValue = string | number | boolean | null | undefined
export type QueryParams = Record<string, QueryValue | QueryValue[]>

export function buildQuery(params?: QueryParams): string {
  if (!params) return ''
  const sp = new URLSearchParams()
  for (const [key, raw] of Object.entries(params)) {
    const values = Array.isArray(raw) ? raw : [raw]
    for (const v of values) {
      if (v === undefined || v === null || v === '') continue
      sp.append(key, String(v))
    }
  }
  const qs = sp.toString()
  return qs ? `?${qs}` : ''
}

export type HeaderProvider = () => Promise<Record<string, string>> | Record<string, string>

export interface ApiClientOptions {
  baseUrl: string
  getHeaders?: HeaderProvider
  fetchImpl?: typeof fetch
  /** Milisegundos antes de abortar. */
  timeoutMs?: number
}

export interface RequestOptions {
  query?: QueryParams
  signal?: AbortSignal
  /** Next.js: opciones de caché/revalidación. */
  next?: { revalidate?: number | false; tags?: string[] }
}

export interface ApiClient {
  get<T>(path: string, options?: RequestOptions): Promise<T>
  post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T>
  patch<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T>
  put<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T>
  delete<T>(path: string, options?: RequestOptions): Promise<T>
}

async function parseError(res: Response): Promise<ErrorResponseDto> {
  const fallback: ErrorResponseDto = {
    code: res.status === 401 ? 'UNAUTHORIZED' : res.status === 403 ? 'FORBIDDEN' : res.status === 404 ? 'NOT_FOUND' : 'INTERNAL_ERROR',
    message: res.statusText || `Error ${res.status}`,
  }
  try {
    const text = await res.text()
    if (!text) return fallback
    const json = JSON.parse(text) as Partial<ErrorResponseDto>
    if (json && typeof json === 'object' && typeof json.code === 'string') {
      return {
        code: json.code,
        message: typeof json.message === 'string' ? json.message : fallback.message,
        details: json.details,
        correlationId: json.correlationId,
      }
    }
    return fallback
  } catch {
    return fallback
  }
}

export function createApiClient(opts: ApiClientOptions): ApiClient {
  const base = opts.baseUrl.replace(/\/$/, '')
  const fetchImpl = opts.fetchImpl ?? fetch
  const timeoutMs = opts.timeoutMs ?? 15_000

  async function request<T>(method: string, path: string, body: unknown, options: RequestOptions = {}): Promise<T> {
    const url = `${base}${path.startsWith('/') ? path : `/${path}`}${buildQuery(options.query)}`
    const headers: Record<string, string> = { Accept: 'application/json' }
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    if (opts.getHeaders) Object.assign(headers, await opts.getHeaders())

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(new Error('timeout')), timeoutMs)
    if (options.signal) options.signal.addEventListener('abort', () => controller.abort(options.signal?.reason))

    let res: Response
    try {
      const init: RequestInit & { next?: RequestOptions['next'] } = {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
        cache: 'no-store',
      }
      if (options.next) init.next = options.next
      res = await fetchImpl(url, init)
    } catch (cause) {
      throw ApiError.network(cause)
    } finally {
      clearTimeout(timer)
    }

    if (!res.ok) throw new ApiError(res.status, await parseError(res))
    if (res.status === 204) return undefined as T
    const text = await res.text()
    if (!text) return undefined as T
    return JSON.parse(text) as T
  }

  return {
    get: (path, options) => request('GET', path, undefined, options),
    post: (path, body, options) => request('POST', path, body ?? {}, options),
    patch: (path, body, options) => request('PATCH', path, body ?? {}, options),
    put: (path, body, options) => request('PUT', path, body ?? {}, options),
    delete: (path, options) => request('DELETE', path, undefined, options),
  }
}

export interface Page<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

export type Result<T> = { ok: true; data: T } | { ok: false; error: ApiError }

/** Envuelve una llamada para que las páginas de servidor nunca truenen el render. */
export async function safe<T>(promise: Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await promise }
  } catch (err) {
    if (isApiError(err)) return { ok: false, error: err }
    const wrapped = ApiError.network(err)
    return { ok: false, error: wrapped }
  }
}
