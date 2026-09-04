import { JobNames } from '@smlxl/config'
import {
  DomainError,
  DomainErrorCode,
  MeetingProcessingStatus,
  Permission,
  TranscriptSourceType,
  hasPermission,
  type Meeting,
  type Principal,
} from '@smlxl/domain'
import type { AppContext } from '../../context.js'
import { enqueueJob } from '../../context.js'
import { audit, requireMeeting } from '../../shared.js'

export interface RetryFailedMeetingsResult {
  candidates: number
  requeued: number
  skipped: number
  jobs: Array<{ meetingId: string; job: string; jobId: string | null }>
}

const RETRY_WINDOW_DAYS = 7

/**
 * Job RETRY_FAILED_MEETING_PROCESSING (§31): reintenta reuniones en FAILED
 * (una concreta o las recientes) sin principal — actor SYSTEM. Reutiliza la
 * misma decisión que `reprocessMeeting`: con transcripción → ANALYZE_MEETING
 * (REPROCESS); sin ella → volver a WAITING_FOR_ARTIFACTS y FETCH_MEETING_ARTIFACTS.
 * Idempotente por `singletonKey`.
 */
export async function retryFailedMeetings(
  ctx: AppContext,
  input: { meetingId?: string; limit?: number } = {},
): Promise<RetryFailedMeetingsResult> {
  const result: RetryFailedMeetingsResult = { candidates: 0, requeued: 0, skipped: 0, jobs: [] }
  const now = ctx.clock.now()
  let meetings: Meeting[]
  if (input.meetingId) {
    const m = requireMeeting(await ctx.repos.meetings.findById(input.meetingId), input.meetingId)
    meetings = [m]
  } else {
    meetings = await ctx.repos.meetings.listByStatus(
      MeetingProcessingStatus.FAILED,
      input.limit ?? 20,
    )
  }
  for (const meeting of meetings) {
    result.candidates += 1
    const tooOld =
      meeting.lastErrorAt !== null &&
      now.getTime() - meeting.lastErrorAt.getTime() > RETRY_WINDOW_DAYS * 86_400_000
    if (
      meeting.processingStatus !== MeetingProcessingStatus.FAILED ||
      meeting.excludedFromAi ||
      (tooOld && !input.meetingId)
    ) {
      result.skipped += 1
      continue
    }
    const transcripts = await ctx.repos.transcripts.findByMeeting(meeting.id)
    const hasTranscript = transcripts.some(
      (t) =>
        t.sourceType === TranscriptSourceType.MEET_TRANSCRIPT ||
        t.sourceType === TranscriptSourceType.MANUAL ||
        t.sourceType === TranscriptSourceType.MEET_SMART_NOTES,
    )
    const job = hasTranscript ? JobNames.ANALYZE_MEETING : JobNames.FETCH_MEETING_ARTIFACTS
    const jobId = hasTranscript
      ? await enqueueJob(
          ctx,
          JobNames.ANALYZE_MEETING,
          { meetingId: meeting.id, kind: 'REPROCESS' },
          { singletonKey: `analyze:${meeting.id}` },
        )
      : await enqueueJob(
          ctx,
          JobNames.FETCH_MEETING_ARTIFACTS,
          { meetingId: meeting.id },
          { singletonKey: `fetch:${meeting.id}` },
        )
    await ctx.uow.run(async (repos) => {
      if (!hasTranscript) {
        await repos.meetings.updateProcessing(meeting.id, {
          processingStatus: MeetingProcessingStatus.WAITING_FOR_ARTIFACTS,
          lastErrorCode: null,
          lastErrorAt: null,
        })
      } else {
        await repos.meetings.updateProcessing(meeting.id, { aiAnalysisStatus: 'QUEUED' })
      }
      await audit(repos, ctx, {
        actorType: 'SYSTEM',
        action: 'meeting.retry_requested',
        entity: 'Meeting',
        entityId: meeting.id,
        after: { job, jobId, previousErrorCode: meeting.lastErrorCode },
      })
    })
    result.requeued += 1
    result.jobs.push({ meetingId: meeting.id, job, jobId })
  }
  return result
}

/** Reprocesa una reunión con la versión de prompt vigente sin perder el análisis anterior (§10.4). */
export async function reprocessMeeting(
  ctx: AppContext,
  principal: Principal,
  meetingId: string,
): Promise<{ queued: true; jobId: string | null; job: string }> {
  if (!hasPermission(principal, Permission.MEETING_REPROCESS))
    throw DomainError.forbidden('No tienes permiso para reprocesar reuniones')
  const meeting = requireMeeting(await ctx.repos.meetings.findById(meetingId), meetingId)
  if (meeting.excludedFromAi)
    throw new DomainError(
      DomainErrorCode.MEETING_EXCLUDED,
      'La reunión está excluida del análisis IA',
    )
  const allowed: string[] = [
    MeetingProcessingStatus.FAILED,
    MeetingProcessingStatus.COMPLETED,
    MeetingProcessingStatus.ANALYZED,
    MeetingProcessingStatus.REVIEW_REQUIRED,
    MeetingProcessingStatus.INGESTED,
    MeetingProcessingStatus.WAITING_FOR_ARTIFACTS,
  ]
  if (!allowed.includes(meeting.processingStatus)) {
    throw new DomainError(
      DomainErrorCode.CONFLICT,
      `La reunión está en estado ${meeting.processingStatus} y no puede reprocesarse ahora`,
    )
  }
  const transcripts = await ctx.repos.transcripts.findByMeeting(meetingId)
  const hasTranscript = transcripts.some(
    (t) =>
      t.sourceType === TranscriptSourceType.MEET_TRANSCRIPT ||
      t.sourceType === TranscriptSourceType.MANUAL ||
      t.sourceType === TranscriptSourceType.MEET_SMART_NOTES,
  )
  const job = hasTranscript ? JobNames.ANALYZE_MEETING : JobNames.FETCH_MEETING_ARTIFACTS
  const jobId = hasTranscript
    ? await enqueueJob(
        ctx,
        JobNames.ANALYZE_MEETING,
        { meetingId, kind: 'REPROCESS' },
        { singletonKey: `analyze:${meetingId}` },
      )
    : await enqueueJob(
        ctx,
        JobNames.FETCH_MEETING_ARTIFACTS,
        { meetingId },
        { singletonKey: `fetch:${meetingId}` },
      )
  await ctx.uow.run(async (repos) => {
    if (meeting.processingStatus === MeetingProcessingStatus.FAILED && !hasTranscript) {
      await repos.meetings.updateProcessing(meetingId, {
        processingStatus: MeetingProcessingStatus.WAITING_FOR_ARTIFACTS,
        lastErrorCode: null,
        lastErrorAt: null,
      })
    }
    await repos.meetings.updateProcessing(meetingId, {
      aiAnalysisStatus: hasTranscript ? 'QUEUED' : meeting.aiAnalysisStatus,
    })
    await audit(repos, ctx, {
      actorType: 'USER',
      actorUserId: principal.id,
      action: 'meeting.reprocess_requested',
      entity: 'Meeting',
      entityId: meetingId,
      after: { job, jobId },
    })
  })
  return { queued: true, jobId, job }
}
