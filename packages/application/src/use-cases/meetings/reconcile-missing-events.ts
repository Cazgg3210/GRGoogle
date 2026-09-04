import { JobNames } from '@smlxl/config'
import {
  ArtifactStatus,
  DomainErrorCode,
  MeetingProcessingStatus,
  MeetingStatus,
  isDomainError,
  isInternalEmail,
  type Meeting,
} from '@smlxl/domain'
import { metrics, MetricNames } from '@smlxl/observability'
import type { AppContext } from '../../context.js'
import { enqueueJob } from '../../context.js'
import { audit, setProcessingStatus } from '../../shared.js'

/**
 * Safety net (§13.3, §54): para reuniones cuya ventana terminó sin evento de
 * conferencia, consulta `conferenceRecords.list` impersonando a un asistente
 * interno; si aparece, enlaza y encola la ingesta; si no, marca según host.
 */
export interface ReconcileMissingEventsResult {
  checked: number
  linked: number
  unavailableExternal: number
  stillWaiting: number
  failed: number
}

const LOOKBACK_MS = 48 * 60 * 60 * 1000
const FAIL_AFTER_MS = 24 * 60 * 60 * 1000

async function candidatesMeetings(ctx: AppContext, meetingId?: string): Promise<Meeting[]> {
  if (meetingId) {
    const m = await ctx.repos.meetings.findById(meetingId)
    return m ? [m] : []
  }
  const now = ctx.clock.now().getTime()
  const discovered = await ctx.repos.meetings.listByStatus(MeetingProcessingStatus.DISCOVERED, 500)
  const waiting = await ctx.repos.meetings.listByStatus(MeetingProcessingStatus.WAITING_FOR_ARTIFACTS, 500)
  return [...discovered, ...waiting].filter((m) => {
    const end = (m.endAt ?? new Date(m.startAt.getTime() + 60 * 60 * 1000)).getTime()
    return end < now && end > now - LOOKBACK_MS && m.status !== MeetingStatus.CANCELLED
  })
}

export async function reconcileMissingEvents(ctx: AppContext, input: { meetingId?: string } = {}): Promise<ReconcileMissingEventsResult> {
  const settings = await ctx.getSettings()
  const result: ReconcileMissingEventsResult = { checked: 0, linked: 0, unavailableExternal: 0, stillWaiting: 0, failed: 0 }
  const now = ctx.clock.now()
  for (const meeting of await candidatesMeetings(ctx, input.meetingId)) {
    if (meeting.status === MeetingStatus.CANCELLED) continue
    const end = meeting.endAt ?? new Date(meeting.startAt.getTime() + 60 * 60 * 1000)
    if (end.getTime() > now.getTime()) {
      result.stillWaiting += 1
      continue
    }
    result.checked += 1
    if (meeting.googleConferenceRecordId) {
      // Ya tiene record pero sigue esperando: reintentar ingesta.
      if (meeting.processingStatus === MeetingProcessingStatus.WAITING_FOR_ARTIFACTS || meeting.processingStatus === MeetingProcessingStatus.DISCOVERED) {
        await enqueueJob(ctx, JobNames.FETCH_MEETING_ARTIFACTS, { meetingId: meeting.id }, { singletonKey: `fetch:${meeting.id}` })
        result.linked += 1
      }
      continue
    }
    if (!meeting.googleMeetingCode) {
      result.stillWaiting += 1
      continue
    }
    const participants = await ctx.repos.meetings.listParticipants(meeting.id)
    const internal =
      (meeting.organizerEmail && isInternalEmail(meeting.organizerEmail, settings.companyDomain) ? meeting.organizerEmail : null) ??
      participants.find((p) => p.isInternal && p.email && isInternalEmail(p.email, settings.companyDomain))?.email ??
      null
    try {
      const records = internal ? await ctx.meet.listConferenceRecordsByMeetingCode(meeting.googleMeetingCode, internal) : []
      const match = records
        .filter((r) => Math.abs(r.startTime.getTime() - meeting.startAt.getTime()) < 6 * 60 * 60 * 1000)
        .sort((a, b) => Math.abs(a.startTime.getTime() - meeting.startAt.getTime()) - Math.abs(b.startTime.getTime() - meeting.startAt.getTime()))[0]
      if (match) {
        await ctx.uow.run(async (repos) => {
          const m = (await repos.meetings.findById(meeting.id)) ?? meeting
          const endAt = match.endTime ?? m.endAt
          const saved = await repos.meetings.save({
            ...m,
            googleConferenceRecordId: match.name,
            googleMeetingSpaceId: match.spaceName || m.googleMeetingSpaceId,
            status: MeetingStatus.ENDED,
            endAt,
            durationSeconds: endAt ? Math.round((endAt.getTime() - match.startTime.getTime()) / 1000) : m.durationSeconds,
            transcriptStatus: m.transcriptStatus === ArtifactStatus.NOT_REQUESTED || m.transcriptStatus === ArtifactStatus.CAPABILITY_BLOCKED ? ArtifactStatus.PENDING : m.transcriptStatus,
            smartNotesStatus: m.smartNotesStatus === ArtifactStatus.NOT_REQUESTED || m.smartNotesStatus === ArtifactStatus.CAPABILITY_BLOCKED ? ArtifactStatus.PENDING : m.smartNotesStatus,
            updatedAt: now,
          })
          if (saved.processingStatus === MeetingProcessingStatus.DISCOVERED) await setProcessingStatus(repos, saved, MeetingProcessingStatus.WAITING_FOR_ARTIFACTS)
          await audit(repos, ctx, { actorType: 'SYSTEM', action: 'meeting.conference_record_reconciled', entity: 'Meeting', entityId: m.id, after: { conferenceRecord: match.name, asUser: internal } })
        })
        await enqueueJob(ctx, JobNames.FETCH_MEETING_ARTIFACTS, { meetingId: meeting.id }, { singletonKey: `fetch:${meeting.id}`, startAfterSeconds: 60 })
        result.linked += 1
        continue
      }
      if (meeting.isExternalHost || !internal) {
        await ctx.uow.run(async (repos) => {
          const m = (await repos.meetings.findById(meeting.id)) ?? meeting
          const patch = { transcriptStatus: ArtifactStatus.UNAVAILABLE_EXTERNAL_HOST, smartNotesStatus: ArtifactStatus.UNAVAILABLE_EXTERNAL_HOST, aiAnalysisStatus: 'SKIPPED' as const, status: MeetingStatus.ENDED }
          let cur = m
          if (cur.processingStatus === MeetingProcessingStatus.DISCOVERED) cur = await setProcessingStatus(repos, cur, MeetingProcessingStatus.WAITING_FOR_ARTIFACTS)
          await setProcessingStatus(repos, cur, MeetingProcessingStatus.COMPLETED, patch)
          await audit(repos, ctx, { actorType: 'SYSTEM', action: 'meeting.artifacts.unavailable_external_host', entity: 'Meeting', entityId: m.id })
        })
        result.unavailableExternal += 1
        continue
      }
      // Host interno sin record: seguir esperando; FAILED tras 24h.
      if (now.getTime() - end.getTime() > FAIL_AFTER_MS) {
        await ctx.uow.run(async (repos) => {
          const m = (await repos.meetings.findById(meeting.id)) ?? meeting
          let cur = m
          if (cur.processingStatus === MeetingProcessingStatus.DISCOVERED) cur = await setProcessingStatus(repos, cur, MeetingProcessingStatus.WAITING_FOR_ARTIFACTS)
          await setProcessingStatus(repos, cur, MeetingProcessingStatus.FAILED, { status: MeetingStatus.ENDED, transcriptStatus: ArtifactStatus.UNAVAILABLE, smartNotesStatus: ArtifactStatus.UNAVAILABLE, lastErrorCode: DomainErrorCode.GOOGLE_MEET_ARTIFACT_NOT_AVAILABLE, lastErrorAt: now })
        })
        await ctx.events.publish({ type: 'MeetingProcessingFailed', meetingId: meeting.id, errorCode: DomainErrorCode.GOOGLE_MEET_ARTIFACT_NOT_AVAILABLE, occurredAt: now })
        metrics.increment(MetricNames.MEETINGS_FAILED)
        result.failed += 1
      } else {
        await ctx.uow.run(async (repos) => {
          const m = (await repos.meetings.findById(meeting.id)) ?? meeting
          if (m.processingStatus === MeetingProcessingStatus.DISCOVERED) await setProcessingStatus(repos, m, MeetingProcessingStatus.WAITING_FOR_ARTIFACTS)
        })
        await enqueueJob(ctx, JobNames.RECONCILE_MISSING_EVENTS, { meetingId: meeting.id }, { singletonKey: `reconcile:${meeting.id}`, startAfterSeconds: 60 * 60 })
        result.stillWaiting += 1
      }
    } catch (err) {
      const code = isDomainError(err) ? err.code : DomainErrorCode.INTERNAL_ERROR
      ctx.logger.error({ meetingId: meeting.id, errorCode: code }, 'Error en safety net de eventos')
      await ctx.repos.meetings.updateProcessing(meeting.id, { lastErrorCode: code, lastErrorAt: now })
      result.failed += 1
    }
  }
  return result
}
