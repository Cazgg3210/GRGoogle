import { createRuntime, installShutdownHandlers } from './bootstrap.js'
import { registerJobHandlers } from './handlers.js'
import { registerSchedules, startDigestScheduleWatcher } from './schedules.js'

async function main(): Promise<void> {
  const runtime = await createRuntime({ service: 'worker' })
  const { logger } = runtime
  const jobs = await registerJobHandlers(runtime.queue, runtime.application, logger)
  const schedules = await registerSchedules(runtime.queue, runtime.application, logger)
  const stopWatcher = startDigestScheduleWatcher(runtime.queue, runtime.application, logger, schedules.digest)
  logger.info({ jobs: jobs.length, cron: schedules.registered.length, skipped: schedules.skipped.length, digestEnabled: schedules.digest.enabled }, 'worker listo')
  installShutdownHandlers(logger, async () => {
    stopWatcher()
    await runtime.shutdown()
  })
}

main().catch((err: unknown) => {
  console.error('[worker] error fatal al iniciar', err)
  process.exit(1)
})
