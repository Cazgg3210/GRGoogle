import type { EnqueueOptions, JobHandler, JobQueuePort } from '@smlxl/domain'
import { newCorrelationId } from '@smlxl/observability'

/**
 * Cola en memoria para desarrollo sin worker y para pruebas. Ejecuta los
 * handlers registrados de forma inmediata (o al llamar `drain()` si se
 * configura `manual: true`).
 */
export class InMemoryJobQueue implements JobQueuePort {
  readonly enqueued: Array<{ name: string; payload: unknown; options: EnqueueOptions; correlationId: string }> = []
  readonly scheduled: Array<{ name: string; cron: string; payload: unknown }> = []
  private readonly handlers = new Map<string, JobHandler<unknown>>()
  private readonly singletons = new Set<string>()
  private counter = 0

  constructor(private readonly options: { manual?: boolean } = {}) {}

  async start(): Promise<void> {}
  async stop(): Promise<void> {}

  async enqueue<TPayload>(name: string, payload: TPayload, options: EnqueueOptions = {}): Promise<string | null> {
    const key = options.singletonKey ? `${name}:${options.singletonKey}` : null
    if (key && this.singletons.has(key)) return null
    if (key) this.singletons.add(key)
    const correlationId = options.correlationId ?? newCorrelationId()
    const id = `mem-${++this.counter}`
    this.enqueued.push({ name, payload, options, correlationId })
    if (!this.options.manual) {
      await this.execute(name, payload, id, correlationId)
      if (key) this.singletons.delete(key)
    }
    return id
  }

  async schedule<TPayload>(name: string, cron: string, payload: TPayload): Promise<void> {
    this.scheduled.push({ name, cron, payload })
  }

  async work<TPayload>(name: string, handler: JobHandler<TPayload>): Promise<void> {
    this.handlers.set(name, handler as JobHandler<unknown>)
  }

  /** Ejecuta todos los jobs pendientes (modo manual). */
  async drain(): Promise<number> {
    let count = 0
    while (this.enqueued.length > 0) {
      const job = this.enqueued.shift()!
      await this.execute(job.name, job.payload, `mem-drain-${++this.counter}`, job.correlationId)
      const key = job.options.singletonKey ? `${job.name}:${job.options.singletonKey}` : null
      if (key) this.singletons.delete(key)
      count++
    }
    return count
  }

  private async execute(name: string, payload: unknown, jobId: string, correlationId: string): Promise<void> {
    const handler = this.handlers.get(name)
    if (!handler) return
    await handler(payload, { jobId, correlationId, attempt: 1 })
  }
}
