import { z } from 'zod'
import { metrics } from '@smlxl/observability'
import type { AppServer } from '../server.js'

export interface HealthDeps {
  checkDatabase: () => Promise<boolean>
  version: string
}

const HealthResponseSchema = z.object({
  status: z.string(),
  db: z.string(),
  version: z.string(),
  time: z.string(),
})

export function registerHealthRoutes(app: AppServer, deps: HealthDeps): void {
  app.get(
    '/health',
    {
      schema: {
        tags: ['sistema'],
        security: [],
        response: { 200: HealthResponseSchema, 503: HealthResponseSchema },
      },
    },
    async (_request, reply) => {
      const dbOk = await deps.checkDatabase().catch(() => false)
      const body = {
        status: dbOk ? 'ok' : 'degraded',
        db: dbOk ? 'up' : 'down',
        version: deps.version,
        time: new Date().toISOString(),
      }
      return reply.status(dbOk ? 200 : 503).send(body)
    },
  )

  app.get(
    '/metrics',
    { schema: { tags: ['sistema'], security: [], hide: true } },
    async (_request, reply) => {
      return reply.type('text/plain').send(metrics.toPrometheus())
    },
  )
}
