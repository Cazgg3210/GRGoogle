import { randomUUID } from 'node:crypto'
import pino, { type Logger as PinoLogger } from 'pino'

/**
 * Logs JSON estructurados (§33) con redacción de secretos y contenido sensible.
 * Nunca se loggea transcript completo, tokens OAuth, API keys ni cookies.
 */
export type Logger = PinoLogger

const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'headers.authorization',
  'headers.cookie',
  '*.accessToken',
  '*.refreshToken',
  '*.access_token',
  '*.refresh_token',
  '*.apiKey',
  '*.api_key',
  '*.password',
  '*.secret',
  '*.rawText',
  '*.transcript',
  '*.privateKey',
  '*.private_key',
  'GEMINI_API_KEY',
  'GOOGLE_SERVICE_ACCOUNT_CREDENTIALS',
  'GOOGLE_OAUTH_CLIENT_SECRET',
  'AUTH_SECRET',
]

export interface LoggerOptions {
  service: string
  level?: string
  pretty?: boolean
}

export function createLogger(options: LoggerOptions): Logger {
  const pretty = options.pretty ?? process.env.NODE_ENV !== 'production'
  return pino({
    level: options.level ?? process.env.LOG_LEVEL ?? 'info',
    base: { service: options.service },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
    ...(pretty
      ? { transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname' } } }
      : {}),
  })
}

export function newCorrelationId(): string {
  return randomUUID()
}

/** Campos estándar de contexto (§33). */
export interface LogContext {
  requestId?: string
  correlationId?: string
  userId?: string | null
  meetingId?: string | null
  jobId?: string | null
  googleEventId?: string | null
  durationMs?: number
  errorCode?: string | null
}

// ---------------------------------------------------------------------------
// Métricas (§33): contador en memoria + exposición /metrics en formato texto.
// Suficiente para MVP; migrable a prom-client sin tocar llamadas.
// ---------------------------------------------------------------------------

export const MetricNames = {
  MEETINGS_DISCOVERED: 'meetings_discovered',
  MEETINGS_PROCESSED: 'meetings_processed',
  MEETINGS_FAILED: 'meetings_failed',
  TRANSCRIPTS_INGESTED: 'transcripts_ingested',
  AI_RUNS: 'ai_runs',
  AI_FAILURES: 'ai_failures',
  AI_REVIEW_ITEMS: 'ai_review_items',
  ACTION_ITEMS_CREATED: 'action_items_created',
  ACTION_ITEMS_MERGED: 'action_items_merged',
  GOOGLE_API_ERRORS: 'google_api_errors',
  EMAIL_SENT: 'email_sent',
  DIGEST_GENERATED: 'digest_generated',
  JOBS_FAILED: 'jobs_failed',
  WEBHOOK_DUPLICATES: 'webhook_duplicates',
} as const
export type MetricName = (typeof MetricNames)[keyof typeof MetricNames]

class MetricsRegistry {
  private counters = new Map<string, number>()
  private histograms = new Map<string, { count: number; sum: number; max: number }>()

  increment(name: MetricName | string, value = 1, labels?: Record<string, string>): void {
    const key = this.key(name, labels)
    this.counters.set(key, (this.counters.get(key) ?? 0) + value)
  }

  observe(name: string, value: number, labels?: Record<string, string>): void {
    const key = this.key(name, labels)
    const h = this.histograms.get(key) ?? { count: 0, sum: 0, max: 0 }
    h.count += 1
    h.sum += value
    h.max = Math.max(h.max, value)
    this.histograms.set(key, h)
  }

  snapshot(): { counters: Record<string, number>; histograms: Record<string, { count: number; sum: number; max: number; avg: number }> } {
    const counters: Record<string, number> = {}
    for (const [k, v] of this.counters) counters[k] = v
    const histograms: Record<string, { count: number; sum: number; max: number; avg: number }> = {}
    for (const [k, h] of this.histograms) histograms[k] = { ...h, avg: h.count ? h.sum / h.count : 0 }
    return { counters, histograms }
  }

  /** Exposición en formato de texto tipo Prometheus. */
  toPrometheus(): string {
    const lines: string[] = []
    for (const [k, v] of this.counters) lines.push(`${k} ${v}`)
    for (const [k, h] of this.histograms) {
      lines.push(`${k}_count ${h.count}`)
      lines.push(`${k}_sum ${h.sum}`)
      lines.push(`${k}_max ${h.max}`)
    }
    return lines.join('\n') + '\n'
  }

  reset(): void {
    this.counters.clear()
    this.histograms.clear()
  }

  private key(name: string, labels?: Record<string, string>): string {
    if (!labels || Object.keys(labels).length === 0) return name
    const l = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}="${v}"`)
      .join(',')
    return `${name}{${l}}`
  }
}

export const metrics = new MetricsRegistry()

/** Mide la duración de una operación y la registra como histograma. */
export async function timed<T>(name: string, fn: () => Promise<T>, labels?: Record<string, string>): Promise<T> {
  const start = Date.now()
  try {
    return await fn()
  } finally {
    metrics.observe(name, Date.now() - start, labels)
  }
}
