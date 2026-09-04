import { z } from 'zod'
import { JobNames, googleMode, type JobName } from '@smlxl/config'
import { WorkspaceCloudEventSchema } from '@smlxl/contracts'
import type { Application } from '@smlxl/application'
import {
  DomainErrorCode,
  isDomainError,
  type JobHandlerContext,
  type JobQueuePort,
} from '@smlxl/domain'
import type { Logger } from '@smlxl/observability'

const Id = z.string().min(1)

/** Validación de payloads por job (§31). Un payload inválido falla el job (y queda en dead-letter tras los reintentos). */
export const JobPayloadSchemas = {
  [JobNames.PROCESS_GOOGLE_EVENT]: z.object({ event: WorkspaceCloudEventSchema }),
  [JobNames.FETCH_MEETING_ARTIFACTS]: z.object({ meetingId: Id }),
  [JobNames.ANALYZE_MEETING]: z.object({
    meetingId: Id,
    kind: z.enum(['ANALYZE_MEETING', 'REPROCESS']).optional(),
  }),
  [JobNames.RECONCILE_ACTION_ITEMS]: z.object({ meetingId: Id, processingRunId: Id }),
  [JobNames.SEND_ACTION_ITEM_NOTIFICATION]: z.object({
    actionItemId: Id,
    type: z.literal('NEW_ASSIGNMENT'),
    previousOwnerUserId: Id.nullable().optional(),
  }),
  [JobNames.SEND_DUE_REMINDERS]: z.object({ userId: Id.optional() }),
  [JobNames.GENERATE_WEEKLY_DIGEST]: z.object({
    weekOf: z.string().optional(),
    sendAfterGenerate: z.boolean().optional(),
  }),
  [JobNames.SEND_WEEKLY_DIGEST]: z.object({ digestId: Id }),
  [JobNames.SYNC_GOOGLE_SHEETS]: z.object({ dryRun: z.boolean().optional() }),
  [JobNames.RENEW_GOOGLE_SUBSCRIPTIONS]: z.object({}),
  [JobNames.RETRY_FAILED_MEETING_PROCESSING]: z.object({ meetingId: Id.optional() }),
  [JobNames.CLEANUP_EXPIRED_RAW_DATA]: z.object({}),
  [JobNames.CALENDAR_INCREMENTAL_SYNC]: z.object({ userId: Id.optional() }),
  [JobNames.RECONCILE_MISSING_EVENTS]: z.object({ meetingId: Id.optional() }),
} as const satisfies Record<JobName, z.ZodTypeAny>

type PayloadOf<N extends JobName> = z.infer<(typeof JobPayloadSchemas)[N]>
type Handler<N extends JobName> = (
  payload: PayloadOf<N>,
  job: JobHandlerContext,
  log: Logger,
) => Promise<void>

function isFeatureDisabled(err: unknown): boolean {
  return isDomainError(err) && err.code === DomainErrorCode.FEATURE_DISABLED
}

/**
 * Handlers de la cola (§31). Cada job valida su payload, delega en un caso de
 * uso de `@smlxl/application` y relanza los errores para que pg-boss reintente
 * con backoff. Los feature flags (§51) se respetan: un job deshabilitado
 * termina con un log, nunca con error.
 */
export function buildJobHandlers(application: Application): { [N in JobName]: Handler<N> } {
  const { ctx } = application
  return {
    [JobNames.PROCESS_GOOGLE_EVENT]: async ({ event }, job, log) => {
      const r = await application.google.processInboundGoogleEvent(event, {
        correlationId: job.correlationId,
      })
      log.info({ googleEventId: event.id, ...r }, 'evento Google procesado')
    },
    [JobNames.FETCH_MEETING_ARTIFACTS]: async ({ meetingId }, job, log) => {
      const r = await application.meetings.fetchMeetingArtifacts({
        meetingId,
        attempt: job.attempt,
        correlationId: job.correlationId,
      })
      log.info(r, 'artefactos de reunión procesados')
    },
    [JobNames.ANALYZE_MEETING]: async ({ meetingId, kind }, job, log) => {
      const r = await application.meetings.analyzeMeeting({
        meetingId,
        kind: kind ?? 'ANALYZE_MEETING',
        correlationId: job.correlationId,
      })
      log.info(
        {
          meetingId,
          processingStatus: r.processingStatus,
          skipped: r.skipped,
          reconcile: r.reconcile,
        },
        'reunión analizada',
      )
    },
    [JobNames.RECONCILE_ACTION_ITEMS]: async ({ meetingId, processingRunId }, _job, log) => {
      // La reconciliación (§16.2) se ejecuta dentro de ANALYZE_MEETING en la misma transacción; este job es un no-op de compatibilidad.
      log.info(
        { meetingId, processingRunId },
        'RECONCILE_ACTION_ITEMS: la reconciliación ya se aplicó en ANALYZE_MEETING; sin acción',
      )
    },
    [JobNames.SEND_ACTION_ITEM_NOTIFICATION]: async ({ actionItemId }, _job, log) => {
      const r = await application.actionItems.sendNewAssignmentEmail(actionItemId)
      log.info({ actionItemId, ...r }, 'notificación de asignación procesada')
    },
    [JobNames.SEND_DUE_REMINDERS]: async ({ userId }, _job, log) => {
      const r = await application.notifications.sendReminders(userId ? { userId } : {})
      log.info(
        r,
        r.disabled
          ? 'recordatorios deshabilitados (GMAIL_NOTIFICATIONS_ENABLED)'
          : 'recordatorios enviados',
      )
    },
    [JobNames.GENERATE_WEEKLY_DIGEST]: async ({ weekOf, sendAfterGenerate }, _job, log) => {
      const settings = await ctx.getSettings()
      if (!settings.featureFlags.WEEKLY_DIGEST_ENABLED) {
        log.info('WEEKLY_DIGEST_ENABLED desactivado; no se genera el resumen semanal')
        return
      }
      const digest = await application.reports.generateWeeklyDigest(null, weekOf ? { weekOf } : {})
      log.info(
        { digestId: digest.id, weekStart: digest.weekStart, version: digest.version },
        'resumen semanal generado',
      )
      if (!sendAfterGenerate) return
      try {
        const sent = await application.reports.sendWeeklyDigest(null, digest.id)
        log.info(
          { digestId: sent.id, recipients: sent.recipientEmails.length },
          'resumen semanal enviado',
        )
      } catch (err) {
        if (isFeatureDisabled(err))
          log.info(
            { digestId: digest.id, reason: (err as Error).message },
            'envío del resumen deshabilitado; se conserva generado',
          )
        else throw err
      }
    },
    [JobNames.SEND_WEEKLY_DIGEST]: async ({ digestId }, _job, log) => {
      try {
        const sent = await application.reports.sendWeeklyDigest(null, digestId)
        log.info({ digestId, recipients: sent.recipientEmails.length }, 'resumen semanal enviado')
      } catch (err) {
        if (isFeatureDisabled(err))
          log.info({ digestId, reason: (err as Error).message }, 'envío del resumen deshabilitado')
        else throw err
      }
    },
    [JobNames.SYNC_GOOGLE_SHEETS]: async ({ dryRun }, _job, log) => {
      const settings = await ctx.getSettings()
      if (!dryRun && !settings.featureFlags.SHEETS_SYNC_ENABLED) {
        log.info('SHEETS_SYNC_ENABLED desactivado; no se sincroniza Google Sheets')
        return
      }
      const r = await application.sheets.syncTasksToGoogleSheets(null, { dryRun: dryRun ?? false })
      log.info(
        {
          spreadsheetId: r.spreadsheetId,
          pendientes: r.pendientes,
          reuniones: r.reuniones,
          dryRun: dryRun ?? false,
        },
        'Google Sheets sincronizado',
      )
    },
    [JobNames.RENEW_GOOGLE_SUBSCRIPTIONS]: async (_payload, _job, log) => {
      const r = await application.google.ensureWorkspaceSubscriptions()
      log.info(r, 'suscripciones Workspace Events verificadas')
    },
    [JobNames.RETRY_FAILED_MEETING_PROCESSING]: async ({ meetingId }, _job, log) => {
      const r = await application.meetings.retryFailedMeetings(meetingId ? { meetingId } : {})
      log.info(
        { candidates: r.candidates, requeued: r.requeued, skipped: r.skipped },
        'reintento de reuniones fallidas',
      )
    },
    [JobNames.CLEANUP_EXPIRED_RAW_DATA]: async (_payload, _job, log) => {
      const r = await application.meetings.cleanupExpiredRawData()
      log.info(r, 'limpieza de transcripciones brutas expiradas')
    },
    [JobNames.CALENDAR_INCREMENTAL_SYNC]: async ({ userId }, _job, log) => {
      const settings = await ctx.getSettings()
      if (googleMode(ctx.env) === 'REAL' && !settings.featureFlags.GOOGLE_INTEGRATION_ENABLED) {
        log.info('GOOGLE_INTEGRATION_ENABLED desactivado; no se sincroniza Calendar')
        return
      }
      const r = await application.google.discoverMeetingsFromCalendar(userId ? { userId } : {})
      log.info({ ...r, errors: r.errors.length }, 'sincronización incremental de Calendar')
    },
    [JobNames.RECONCILE_MISSING_EVENTS]: async ({ meetingId }, _job, log) => {
      const r = await application.google.reconcileMissingEvents(meetingId ? { meetingId } : {})
      log.info(r, 'reconciliación de eventos faltantes')
    },
  }
}

/** Registra un handler por cada `JobNames` en la cola; el payload se valida con Zod antes de ejecutar. */
export async function registerJobHandlers(
  queue: JobQueuePort,
  application: Application,
  logger: Logger,
): Promise<JobName[]> {
  const handlers = buildJobHandlers(application)
  const registered: JobName[] = []
  for (const name of Object.values(JobNames)) {
    const schema = JobPayloadSchemas[name]
    const handler = handlers[name] as Handler<JobName>
    await queue.work<unknown>(name, async (payload, job) => {
      const log = logger.child({
        jobName: name,
        jobId: job.jobId,
        correlationId: job.correlationId,
        attempt: job.attempt,
      })
      const parsed = schema.safeParse(payload ?? {})
      if (!parsed.success) {
        log.error({ issues: parsed.error.issues }, 'payload de job inválido')
        throw parsed.error
      }
      await handler(parsed.data as never, job, log)
    })
    registered.push(name)
  }
  logger.info({ jobs: registered.length }, 'handlers de jobs registrados')
  return registered
}
