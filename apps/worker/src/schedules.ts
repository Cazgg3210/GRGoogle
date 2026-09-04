import { JobNames } from '@smlxl/config'
import type { Application } from '@smlxl/application'
import type { JobQueuePort } from '@smlxl/domain'
import type { Logger } from '@smlxl/observability'

/** Cron fijos (§31). El resumen semanal se deriva de su configuración (§18.2). */
export const CRON = {
  [JobNames.CALENDAR_INCREMENTAL_SYNC]: '*/15 * * * *',
  [JobNames.RENEW_GOOGLE_SUBSCRIPTIONS]: '0 3 * * *',
  [JobNames.SEND_DUE_REMINDERS]: '0 8 * * *',
  [JobNames.CLEANUP_EXPIRED_RAW_DATA]: '0 2 * * *',
  [JobNames.RETRY_FAILED_MEETING_PROCESSING]: '0 * * * *',
  [JobNames.RECONCILE_MISSING_EVENTS]: '*/30 * * * *',
} as const

export interface DigestSchedule {
  enabled: boolean
  cron: string
  timezone: string
  nextRunAt: Date | null
}

export interface ScheduleSummary {
  registered: Array<{ name: string; cron: string; timezone: string }>
  skipped: Array<{ name: string; reason: string }>
  digest: DigestSchedule
}

type Unschedulable = JobQueuePort & { unschedule?: (name: string) => Promise<void> }

async function unscheduleIfSupported(queue: Unschedulable, name: string): Promise<void> {
  if (typeof queue.unschedule === 'function') await queue.unschedule(name)
}

/** Registra los cron en la cola respetando feature flags (§51) y la zona horaria de la empresa. */
export async function registerSchedules(
  queue: JobQueuePort,
  application: Application,
  logger: Logger,
): Promise<ScheduleSummary> {
  const settings = await application.ctx.getSettings()
  const timezone = settings.companyTimezone
  const summary: ScheduleSummary = {
    registered: [],
    skipped: [],
    digest: { enabled: false, cron: '', timezone, nextRunAt: null },
  }

  const add = async (name: keyof typeof CRON): Promise<void> => {
    await queue.schedule(name, CRON[name], {}, { timezone })
    summary.registered.push({ name, cron: CRON[name], timezone })
  }

  if (settings.featureFlags.GOOGLE_INTEGRATION_ENABLED)
    await add(JobNames.CALENDAR_INCREMENTAL_SYNC)
  else {
    await unscheduleIfSupported(queue, JobNames.CALENDAR_INCREMENTAL_SYNC)
    summary.skipped.push({
      name: JobNames.CALENDAR_INCREMENTAL_SYNC,
      reason: 'GOOGLE_INTEGRATION_ENABLED=false',
    })
  }
  await add(JobNames.RENEW_GOOGLE_SUBSCRIPTIONS)
  await add(JobNames.SEND_DUE_REMINDERS)
  await add(JobNames.CLEANUP_EXPIRED_RAW_DATA)
  await add(JobNames.RETRY_FAILED_MEETING_PROCESSING)
  await add(JobNames.RECONCILE_MISSING_EVENTS)

  summary.digest = await applyDigestSchedule(queue, application, logger, null)
  logger.info(
    {
      registered: summary.registered.map((r) => `${r.name} (${r.cron})`),
      skipped: summary.skipped,
      digest: summary.digest,
    },
    'cron programados',
  )
  return summary
}

/**
 * (Re)programa GENERATE_WEEKLY_DIGEST a partir de la configuración vigente.
 * Sólo toca la cola cuando cambió respecto a `previous`.
 */
export async function applyDigestSchedule(
  queue: JobQueuePort,
  application: Application,
  logger: Logger,
  previous: DigestSchedule | null,
): Promise<DigestSchedule> {
  const settings = await application.ctx.getSettings()
  const current = await application.reports.scheduleWeeklyDigest({ register: false })
  const flagEnabled = settings.featureFlags.WEEKLY_DIGEST_ENABLED
  const next: DigestSchedule = {
    enabled: current.enabled && flagEnabled,
    cron: current.cron,
    timezone: current.timezone,
    nextRunAt: current.nextRunAt,
  }
  const changed =
    !previous ||
    previous.enabled !== next.enabled ||
    previous.cron !== next.cron ||
    previous.timezone !== next.timezone
  if (!changed) return next
  if (next.enabled) {
    await application.reports.scheduleWeeklyDigest({ register: true })
    logger.info(
      { cron: next.cron, timezone: next.timezone, nextRunAt: next.nextRunAt },
      'resumen semanal programado',
    )
  } else {
    await unscheduleIfSupported(queue, JobNames.GENERATE_WEEKLY_DIGEST)
    logger.info(
      { flagEnabled, configEnabled: current.enabled },
      'resumen semanal sin programación (deshabilitado)',
    )
  }
  return next
}

/** Reevalúa la configuración del digest periódicamente (por defecto cada hora) y reprograma si cambió. */
export function startDigestScheduleWatcher(
  queue: JobQueuePort,
  application: Application,
  logger: Logger,
  initial: DigestSchedule,
  intervalMs = 60 * 60 * 1000,
): () => void {
  let last = initial
  const timer = setInterval(() => {
    applyDigestSchedule(queue, application, logger, last)
      .then((s) => {
        last = s
      })
      .catch((err: unknown) =>
        logger.error({ err }, 'error reevaluando la programación del resumen semanal'),
      )
  }, intervalMs)
  timer.unref()
  return () => clearInterval(timer)
}
