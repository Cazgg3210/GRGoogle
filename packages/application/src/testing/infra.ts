import type { Clock, EnqueueOptions, IdGenerator, JobHandler, JobQueuePort } from '@smlxl/domain'

/** Reloj controlable para tests. */
export class FixedClock implements Clock {
  private current: Date
  constructor(start: Date | string = '2026-09-03T18:00:00Z') {
    this.current = new Date(start)
  }
  now(): Date {
    return new Date(this.current)
  }
  set(date: Date | string): void {
    this.current = new Date(date)
  }
  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms)
  }
  advanceDays(days: number): void {
    this.advance(days * 86_400_000)
  }
}

/** Ids determinísticos con forma UUID v4 (válidos para los schemas `uuid()`). */
export class SequentialIdGenerator implements IdGenerator {
  private n = 0
  constructor(private readonly prefix = '0000') {}
  next(): string {
    this.n += 1
    const tail = String(this.n).padStart(12, '0')
    return `${this.prefix.padStart(8, '0')}-0000-4000-8000-${tail}`
  }
  get count(): number {
    return this.n
  }
}

export interface QueuedJob {
  id: string
  name: string
  payload: unknown
  options: EnqueueOptions | undefined
  status: 'pending' | 'done' | 'failed'
  error?: unknown
}

/**
 * Cola en memoria: registra jobs encolados y ejecuta los handlers registrados
 * con `runAll()` (incluye los jobs encolados durante la ejecución).
 */
export class InMemoryQueue implements JobQueuePort {
  readonly jobs: QueuedJob[] = []
  readonly schedules: Array<{ name: string; cron: string; payload: unknown; timezone?: string }> =
    []
  private readonly handlers = new Map<string, JobHandler<unknown>>()
  private seq = 0
  started = false

  async enqueue<TPayload>(
    name: string,
    payload: TPayload,
    options?: EnqueueOptions,
  ): Promise<string | null> {
    if (
      options?.singletonKey &&
      this.jobs.some(
        (j) =>
          j.status === 'pending' &&
          j.name === name &&
          j.options?.singletonKey === options.singletonKey,
      )
    )
      return null
    this.seq += 1
    const id = `job-${this.seq}`
    this.jobs.push({ id, name, payload, options, status: 'pending' })
    return id
  }

  async schedule<TPayload>(
    name: string,
    cron: string,
    payload: TPayload,
    options?: { timezone?: string },
  ): Promise<void> {
    const existing = this.schedules.findIndex((s) => s.name === name)
    const entry = { name, cron, payload, timezone: options?.timezone }
    if (existing >= 0) this.schedules[existing] = entry
    else this.schedules.push(entry)
  }

  async work<TPayload>(name: string, handler: JobHandler<TPayload>): Promise<void> {
    this.handlers.set(name, handler as JobHandler<unknown>)
  }

  async start(): Promise<void> {
    this.started = true
  }

  async stop(): Promise<void> {
    this.started = false
  }

  pending(name?: string): QueuedJob[] {
    return this.jobs.filter((j) => j.status === 'pending' && (!name || j.name === name))
  }

  /** Ejecuta los jobs pendientes en orden hasta vaciar la cola (máx. `maxIterations`). */
  async runAll(
    options: { maxIterations?: number; throwOnError?: boolean } = {},
  ): Promise<{ executed: number; failed: number }> {
    const max = options.maxIterations ?? 200
    let executed = 0
    let failed = 0
    for (let i = 0; i < max; i++) {
      const job = this.jobs.find((j) => j.status === 'pending')
      if (!job) break
      const handler = this.handlers.get(job.name)
      if (!handler) {
        job.status = 'failed'
        job.error = new Error(`Sin handler para ${job.name}`)
        failed += 1
        continue
      }
      try {
        await handler(job.payload, {
          jobId: job.id,
          correlationId: job.options?.correlationId ?? job.id,
          attempt: 1,
        })
        job.status = 'done'
        executed += 1
      } catch (err) {
        job.status = 'failed'
        job.error = err
        failed += 1
        if (options.throwOnError) throw err
      }
    }
    return { executed, failed }
  }
}
