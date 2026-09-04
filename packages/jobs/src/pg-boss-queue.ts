import PgBoss from 'pg-boss'
import type { EnqueueOptions, JobHandler, JobQueuePort } from '@smlxl/domain'
import { JobNames } from '@smlxl/config'
import { metrics, MetricNames, newCorrelationId, type Logger } from '@smlxl/observability'

/**
 * Implementación de JobQueuePort sobre pg-boss (§6.3). Sin Redis: los jobs
 * viven en PostgreSQL (schema `pgboss`). Todos los jobs son idempotentes por
 * diseño en Application; aquí garantizamos reintentos con backoff, dead-letter
 * y correlationId.
 */
export interface PgBossQueueOptions {
  connectionString: string
  logger: Logger
  schema?: string
  /** Reintentos por defecto para jobs sin opción explícita. */
  defaultRetryLimit?: number
  /** Nombres de colas a crear al iniciar (idempotente). */
  queueNames?: readonly string[]
}

interface Envelope<T> {
  payload: T
  correlationId: string
}

const DEAD_LETTER_SUFFIX = '__dead'

export class PgBossJobQueue implements JobQueuePort {
  private readonly boss: PgBoss
  private readonly logger: Logger
  private readonly defaultRetryLimit: number
  private readonly queueNames: readonly string[]
  private started = false

  constructor(options: PgBossQueueOptions) {
    this.logger = options.logger.child({ component: 'pg-boss' })
    this.defaultRetryLimit = options.defaultRetryLimit ?? 5
    this.queueNames = options.queueNames ?? Object.values(JobNames)
    this.boss = new PgBoss({
      connectionString: options.connectionString,
      schema: options.schema ?? 'pgboss',
      application_name: 'smlxl-jobs',
      retryLimit: this.defaultRetryLimit,
      retryBackoff: true,
      retryDelay: 30,
      expireInMinutes: 30,
      archiveCompletedAfterSeconds: 60 * 60 * 24,
      deleteAfterDays: 14,
      monitorStateIntervalSeconds: 60,
    })
    this.boss.on('error', (err) => this.logger.error({ err }, 'pg-boss error'))
  }

  async start(): Promise<void> {
    if (this.started) return
    await this.boss.start()
    for (const name of this.queueNames) {
      await this.ensureQueue(name)
    }
    this.started = true
    this.logger.info({ queues: this.queueNames.length }, 'cola de trabajos iniciada')
  }

  async stop(): Promise<void> {
    if (!this.started) return
    await this.boss.stop({ graceful: true, timeout: 15_000 })
    this.started = false
  }

  async enqueue<TPayload>(
    name: string,
    payload: TPayload,
    options: EnqueueOptions = {},
  ): Promise<string | null> {
    const envelope: Envelope<TPayload> = {
      payload,
      correlationId: options.correlationId ?? newCorrelationId(),
    }
    const sendOptions: PgBoss.SendOptions = {
      retryLimit: options.retryLimit ?? this.defaultRetryLimit,
      retryBackoff: options.retryBackoff ?? true,
      retryDelay: 30,
      deadLetter: `${name}${DEAD_LETTER_SUFFIX}`,
    }
    if (options.singletonKey) sendOptions.singletonKey = options.singletonKey
    if (options.startAfterSeconds) sendOptions.startAfter = options.startAfterSeconds
    if (options.priority !== undefined) sendOptions.priority = options.priority
    const jobId = await this.boss.send(name, envelope as object, sendOptions)
    this.logger.debug(
      {
        jobName: name,
        jobId,
        correlationId: envelope.correlationId,
        singletonKey: options.singletonKey,
      },
      jobId ? 'job encolado' : 'job omitido (singleton en vuelo)',
    )
    return jobId
  }

  async schedule<TPayload>(
    name: string,
    cron: string,
    payload: TPayload,
    options: { timezone?: string } = {},
  ): Promise<void> {
    const envelope: Envelope<TPayload> = { payload, correlationId: `cron:${name}` }
    await this.boss.schedule(name, cron, envelope as object, {
      tz: options.timezone ?? 'America/Mexico_City',
      retryLimit: this.defaultRetryLimit,
      retryBackoff: true,
    })
    this.logger.info({ jobName: name, cron, tz: options.timezone }, 'job programado')
  }

  async unschedule(name: string): Promise<void> {
    await this.boss.unschedule(name)
  }

  async work<TPayload>(
    name: string,
    handler: JobHandler<TPayload>,
    options: { concurrency?: number } = {},
  ): Promise<void> {
    await this.ensureQueue(name)
    await this.boss.work<Envelope<TPayload>>(
      name,
      {
        batchSize: 1,
        includeMetadata: true,
        pollingIntervalSeconds: 2,
        ...(options.concurrency ? {} : {}),
      },
      async (jobs) => {
        for (const job of jobs) {
          const correlationId = job.data?.correlationId ?? newCorrelationId()
          const started = Date.now()
          const log = this.logger.child({
            jobId: job.id,
            jobName: name,
            correlationId,
            attempt: job.retryCount + 1,
          })
          try {
            await handler(job.data.payload, {
              jobId: job.id,
              correlationId,
              attempt: job.retryCount + 1,
            })
            log.info({ durationMs: Date.now() - started }, 'job completado')
          } catch (err) {
            metrics.increment(MetricNames.JOBS_FAILED, 1, { job: name })
            const errorCode = (err as { code?: string })?.code ?? 'UNKNOWN'
            log.error({ err, errorCode, durationMs: Date.now() - started }, 'job falló')
            throw err
          }
        }
      },
    )
  }

  /** Conteos por cola para /admin/jobs. */
  async queueStats(): Promise<
    Array<{
      name: string
      created: number
      active: number
      completed: number
      failed: number
      retry: number
    }>
  > {
    const out: Array<{
      name: string
      created: number
      active: number
      completed: number
      failed: number
      retry: number
    }> = []
    for (const name of this.queueNames) {
      const created = await this.boss.getQueueSize(name, { before: 'active' })
      const active = await this.boss
        .getQueueSize(name, { before: 'completed' })
        .then((n) => Math.max(0, n - created))
      out.push({ name, created, active, completed: 0, failed: 0, retry: 0 })
    }
    return out
  }

  /** Acceso controlado para pruebas/operación. */
  get raw(): PgBoss {
    return this.boss
  }

  private async ensureQueue(name: string): Promise<void> {
    // La cola dead-letter debe existir antes que la principal: `queue.dead_letter` es una FK en pg-boss v10.
    const deadName = `${name}${DEAD_LETTER_SUFFIX}`
    const dead = await this.boss.getQueue(deadName)
    if (!dead) {
      await this.boss.createQueue(deadName, { name: deadName, retryLimit: 0 })
    }
    const existing = await this.boss.getQueue(name)
    if (!existing) {
      await this.boss.createQueue(name, {
        name,
        retryLimit: this.defaultRetryLimit,
        retryBackoff: true,
        retryDelay: 30,
        deadLetter: deadName,
      })
    }
  }
}
