import type { Env } from '@smlxl/config'
import { JobNames } from '@smlxl/config'
import type { WorkspaceCloudEvent } from '@smlxl/contracts'
import type {
  AiMeetingAnalyzer,
  CalendarPort,
  Clock,
  DirectoryPort,
  DomainEventPublisher,
  DrivePort,
  EnqueueOptions,
  IdGenerator,
  JobQueuePort,
  MailPort,
  MeetingCapturePort,
  PlatformSettings,
  Repositories,
  SheetsPort,
  UnitOfWork,
  WorkspaceEventsPort,
} from '@smlxl/domain'
import type { Logger } from '@smlxl/observability'

/**
 * Contexto de aplicación (§8.2): todo caso de uso recibe sólo puertos del
 * dominio; nunca Prisma, googleapis ni Gemini directamente.
 */
export interface AppContext {
  repos: Repositories
  uow: UnitOfWork
  clock: Clock
  ids: IdGenerator
  ai: AiMeetingAnalyzer
  meet: MeetingCapturePort
  calendar: CalendarPort
  workspaceEvents: WorkspaceEventsPort
  directory: DirectoryPort
  drive: DrivePort
  mail: MailPort
  sheets: SheetsPort
  queue: JobQueuePort
  events: DomainEventPublisher
  logger: Logger
  env: Env
  getSettings(): Promise<PlatformSettings>
}

/** Payloads tipados por job (§31). El worker registra handlers con estas formas. */
export interface JobPayloads {
  [JobNames.PROCESS_GOOGLE_EVENT]: { event: WorkspaceCloudEvent }
  [JobNames.FETCH_MEETING_ARTIFACTS]: { meetingId: string }
  [JobNames.ANALYZE_MEETING]: { meetingId: string; kind?: 'ANALYZE_MEETING' | 'REPROCESS' }
  [JobNames.RECONCILE_ACTION_ITEMS]: { meetingId: string; processingRunId: string }
  [JobNames.SEND_ACTION_ITEM_NOTIFICATION]: {
    actionItemId: string
    type: 'NEW_ASSIGNMENT'
    previousOwnerUserId?: string | null
  }
  [JobNames.SEND_DUE_REMINDERS]: { userId?: string }
  [JobNames.GENERATE_WEEKLY_DIGEST]: { weekOf?: string; sendAfterGenerate?: boolean }
  [JobNames.SEND_WEEKLY_DIGEST]: { digestId: string }
  [JobNames.SYNC_GOOGLE_SHEETS]: { dryRun?: boolean }
  [JobNames.RENEW_GOOGLE_SUBSCRIPTIONS]: Record<string, never>
  [JobNames.RETRY_FAILED_MEETING_PROCESSING]: { meetingId?: string }
  [JobNames.CLEANUP_EXPIRED_RAW_DATA]: Record<string, never>
  [JobNames.CALENDAR_INCREMENTAL_SYNC]: { userId?: string }
  [JobNames.RECONCILE_MISSING_EVENTS]: { meetingId?: string }
}

export type JobPayloadOf<N extends keyof JobPayloads> = JobPayloads[N]

/** Encola un job con payload tipado. */
export function enqueueJob<N extends keyof JobPayloads>(
  ctx: Pick<AppContext, 'queue'>,
  name: N,
  payload: JobPayloads[N],
  options?: EnqueueOptions,
): Promise<string | null> {
  return ctx.queue.enqueue(name, payload, options)
}
