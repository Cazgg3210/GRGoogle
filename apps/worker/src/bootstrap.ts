import { createAiAnalyzer } from '@smlxl/ai'
import { createApplication, type AppContext, type Application } from '@smlxl/application'
import { featureFlagsFromEnv, googleMode, loadEnv, type Env } from '@smlxl/config'
import {
  PrismaUnitOfWork,
  SystemClock,
  UuidGenerator,
  createPrismaClient,
  createRepositories,
  type PrismaClient,
} from '@smlxl/database'
import type { DomainEvent, DomainEventPublisher, Repositories } from '@smlxl/domain'
import { createGoogleAdapters } from '@smlxl/google-workspace'
import { PgBossJobQueue } from '@smlxl/jobs'
import { createLogger, type Logger } from '@smlxl/observability'

/** Publisher mínimo: los eventos de dominio se registran en el log (§8.2); el worker reacciona vía jobs. */
export class LoggingEventPublisher implements DomainEventPublisher {
  constructor(private readonly logger: Logger) {}
  async publish(event: DomainEvent): Promise<void> {
    this.logger.debug({ domainEvent: event.type, ...event }, 'evento de dominio')
  }
}

export interface Runtime {
  env: Env
  logger: Logger
  prisma: PrismaClient
  repos: Repositories
  queue: PgBossJobQueue
  ctx: AppContext
  application: Application
  checkDatabase(): Promise<boolean>
  shutdown(): Promise<void>
}

/**
 * Raíz de composición (§8.2): Prisma → repos/UoW, adapters Google (FAKE/REAL
 * según `googleMode`), IA (FAKE/GEMINI), cola pg-boss y `createApplication`.
 * Falla rápido si la base de datos no responde.
 */
export async function createRuntime(options: { service: string }): Promise<Runtime> {
  const env = loadEnv()
  const logger = createLogger({ service: options.service, level: env.LOG_LEVEL })
  const prisma = createPrismaClient(env.DATABASE_URL)
  const checkDatabase = async (): Promise<boolean> => {
    await prisma.$queryRaw`SELECT 1`
    return true
  }
  try {
    await checkDatabase()
  } catch (err) {
    logger.fatal({ err }, 'No se pudo conectar a PostgreSQL (DATABASE_URL); abortando')
    await prisma.$disconnect().catch(() => undefined)
    throw err
  }

  const defaults = {
    featureFlags: featureFlagsFromEnv(env),
    companyTimezone: env.COMPANY_TIMEZONE,
    companyDomain: env.GOOGLE_WORKSPACE_DOMAIN,
  }
  const repos = createRepositories(prisma, defaults)
  const uow = new PrismaUnitOfWork(prisma, defaults)
  const clock = new SystemClock()
  const ids = new UuidGenerator()
  const settings = await repos.settings.get()
  const mode = googleMode(env)
  const google = createGoogleAdapters(env, mode, {
    monitoredUserEmails: settings.monitoredUserEmails,
    now: () => clock.now(),
    adminEmail: env.GMAIL_SENDER_EMAIL,
  })
  const ai = createAiAnalyzer(env, { logger })
  const queue = new PgBossJobQueue({ connectionString: env.DATABASE_URL, logger })
  try {
    await queue.start()
  } catch (err) {
    logger.fatal(
      { err },
      'No se pudo iniciar la cola de trabajos (pg-boss) en PostgreSQL; abortando',
    )
    await prisma.$disconnect().catch(() => undefined)
    throw err
  }

  const ctx: AppContext = {
    repos,
    uow,
    clock,
    ids,
    ai,
    meet: google.meet,
    calendar: google.calendar,
    workspaceEvents: google.workspaceEvents,
    directory: google.directory,
    drive: google.drive,
    mail: google.mail,
    sheets: google.sheets,
    queue,
    events: new LoggingEventPublisher(logger),
    logger,
    env,
    getSettings: () => repos.settings.get(),
  }
  const application = createApplication(ctx)
  logger.info(
    {
      googleMode: mode,
      ai: ai.providerName,
      nodeEnv: env.NODE_ENV,
      devBypass: env.AUTH_DEV_BYPASS,
    },
    'runtime listo',
  )

  let stopped = false
  return {
    env,
    logger,
    prisma,
    repos,
    queue,
    ctx,
    application,
    checkDatabase: () => checkDatabase().catch(() => false),
    async shutdown() {
      if (stopped) return
      stopped = true
      await queue.stop().catch((err: unknown) => logger.warn({ err }, 'error deteniendo la cola'))
      await prisma
        .$disconnect()
        .catch((err: unknown) => logger.warn({ err }, 'error cerrando Prisma'))
    },
  }
}

/** Instala manejadores de SIGINT/SIGTERM que ejecutan `close` una sola vez. */
export function installShutdownHandlers(logger: Logger, close: () => Promise<void>): void {
  let closing = false
  const handle = (signal: string): void => {
    if (closing) return
    closing = true
    logger.info({ signal }, 'apagado ordenado iniciado')
    const timer = setTimeout(() => {
      logger.error('apagado ordenado excedió el tiempo límite; saliendo')
      process.exit(1)
    }, 20_000)
    timer.unref()
    close()
      .then(() => process.exit(0))
      .catch((err: unknown) => {
        logger.error({ err }, 'error durante el apagado')
        process.exit(1)
      })
  }
  process.once('SIGINT', () => handle('SIGINT'))
  process.once('SIGTERM', () => handle('SIGTERM'))
  process.on('unhandledRejection', (reason) =>
    logger.error({ err: reason }, 'promesa rechazada sin manejar'),
  )
}
