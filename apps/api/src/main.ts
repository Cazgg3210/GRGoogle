import { createRuntime, installShutdownHandlers } from './bootstrap.js'
import { registerRoutes } from './routes/index.js'
import { buildServer } from './server.js'

const API_VERSION = '0.1.0'

async function main(): Promise<void> {
  const runtime = await createRuntime({ service: 'api' })
  const { env, logger } = runtime
  const app = await buildServer({ env, logger, users: runtime.repos.users })
  registerRoutes(app, {
    application: runtime.application,
    ctx: runtime.ctx,
    env,
    version: API_VERSION,
    checkDatabase: runtime.checkDatabase,
    jobStats: () => runtime.queue.queueStats(),
  })
  await app.listen({ port: env.PORT_API, host: '0.0.0.0' })
  logger.info({ port: env.PORT_API, docs: `${env.API_URL}/docs` }, 'API escuchando')
  installShutdownHandlers(logger, async () => {
    await app.close()
    await runtime.shutdown()
  })
}

main().catch((err: unknown) => {
  console.error('[api] error fatal al iniciar', err)
  process.exit(1)
})
