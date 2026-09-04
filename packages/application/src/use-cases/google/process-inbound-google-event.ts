import { JobNames } from '@smlxl/config'
import { MeetEventDataSchema, type WorkspaceCloudEvent } from '@smlxl/contracts'
import {
  ArtifactStatus,
  DomainErrorCode,
  GoogleMeetEventType,
  InboundEventProcessingStatus,
  MeetingProcessingStatus,
  MeetingSource,
  MeetingStatus,
  isDomainError,
  isInternalEmail,
  type InboundGoogleEvent,
  type Meeting,
  type MeetConferenceRecord,
  type Repositories,
} from '@smlxl/domain'
import { metrics, MetricNames } from '@smlxl/observability'
import type { AppContext } from '../../context.js'
import { enqueueJob } from '../../context.js'
import { audit, setProcessingStatus } from '../../shared.js'

/**
 * Procesa un CloudEvent de Google Workspace Events (§13.5): idempotente por
 * `cloudEventId`, payload redactado, y mapeo por tipo de evento.
 */
export interface ProcessInboundEventResult {
  duplicate: boolean
  status: InboundGoogleEvent['processingStatus']
  meetingId: string | null
  enqueuedJob: string | null
}

const RECORD_RE = /conferenceRecords\/[^/\s]+/

export function extractConferenceRecordName(event: WorkspaceCloudEvent): string | null {
  const data = MeetEventDataSchema.safeParse(event.data ?? {})
  if (data.success) {
    if (data.data.conferenceRecord?.name) return data.data.conferenceRecord.name
    const child = data.data.transcript?.name ?? data.data.smartNote?.name
    const m = child ? RECORD_RE.exec(child) : null
    if (m) return m[0]
  }
  const fromSubject = event.subject ? RECORD_RE.exec(event.subject) : null
  return fromSubject?.[0] ?? null
}

/** Payload redactado: sólo identificadores (nunca transcript ni datos personales, §13.5). */
export function redactEventPayload(event: WorkspaceCloudEvent): unknown {
  const data = MeetEventDataSchema.safeParse(event.data ?? {})
  return {
    id: event.id,
    type: event.type,
    source: event.source,
    subject: event.subject ?? null,
    time: event.time ?? null,
    data: data.success ? data.data : {},
  }
}

async function resolveSubscribedUserEmail(repos: Repositories, event: WorkspaceCloudEvent, meeting: Meeting | null): Promise<string | null> {
  const m = /users\/([^/\s]+)/.exec(event.source)
  if (m?.[1]) {
    const tail = decodeURIComponent(m[1])
    if (tail.includes('@')) return tail.toLowerCase()
    const byId = await repos.users.findByGoogleUserId(tail)
    if (byId) return byId.email
  }
  if (meeting?.organizerEmail && !meeting.isExternalHost) return meeting.organizerEmail
  const participants = meeting ? await repos.meetings.listParticipants(meeting.id) : []
  const internal = participants.find((p) => p.isInternal && p.email)
  if (internal?.email) return internal.email
  const monitored = await repos.users.list({ active: true, monitored: true })
  return monitored[0]?.email ?? null
}

/**
 * Encuentra o crea el Meeting para un conference record: por id canónico, o
 * enlazando con la reunión descubierta por Calendar (mismo meetingCode y
 * horario solapado), o creando una nueva con source WORKSPACE_EVENT.
 */
async function findOrCreateMeetingForRecord(
  ctx: AppContext,
  repos: Repositories,
  recordName: string,
  event: WorkspaceCloudEvent,
): Promise<{ meeting: Meeting; created: boolean; record: MeetConferenceRecord | null }> {
  const existing = await repos.meetings.findByConferenceRecordId(recordName)
  if (existing) return { meeting: existing, created: false, record: null }
  const asUser = await resolveSubscribedUserEmail(repos, event, null)
  const settings = await ctx.getSettings()
  let record: MeetConferenceRecord | null = null
  let meetingCode: string | null = null
  if (asUser) {
    record = await ctx.meet.getConferenceRecord(recordName, asUser)
    if (record?.spaceName) {
      // `conferenceRecord.space` es el nombre canónico; el meetingCode se resuelve con spaces.get.
      const space = await ctx.meet.getSpaceByMeetingCode(record.spaceName, asUser).catch(() => null)
      meetingCode = space?.meetingCode || (/^spaces\/([a-z]{3}-[a-z]{4}-[a-z]{3})$/.exec(record.spaceName)?.[1] ?? null)
      if (!meetingCode) {
        const bySpace = (await repos.meetings.listByStatus(MeetingProcessingStatus.DISCOVERED, 500)).find((m) => m.googleMeetingSpaceId === record?.spaceName)
        if (bySpace) meetingCode = bySpace.googleMeetingCode
      }
    }
  }
  // El evento llega por la suscripción del usuario propietario del space → organizador interno.
  const organizerUser = asUser ? await repos.users.findByEmail(asUser) : null
  const now = ctx.clock.now()
  const start = record?.startTime ?? (event.time ? new Date(event.time) : now)
  if (meetingCode) {
    const candidates = await repos.meetings.findByMeetingCode(meetingCode)
    const linked = candidates
      .filter((m) => !m.googleConferenceRecordId && m.status !== MeetingStatus.CANCELLED)
      .find((m) => {
        const end = m.endAt ?? new Date(m.startAt.getTime() + 60 * 60 * 1000)
        return start.getTime() <= end.getTime() + 2 * 60 * 60 * 1000 && start.getTime() >= m.startAt.getTime() - 2 * 60 * 60 * 1000
      })
    if (linked) {
      const saved = await repos.meetings.save({ ...linked, googleConferenceRecordId: recordName, googleMeetingSpaceId: record?.spaceName ?? linked.googleMeetingSpaceId, updatedAt: now })
      return { meeting: saved, created: false, record }
    }
  }
  const organizerEmail = asUser ?? null
  const meeting: Meeting = {
    id: ctx.ids.next(),
    googleConferenceRecordId: recordName,
    googleMeetingSpaceId: record?.spaceName ?? null,
    googleMeetingCode: meetingCode,
    googleCalendarEventId: null,
    title: meetingCode ? `Reunión de Meet ${meetingCode}` : `Reunión de Meet ${recordName.replace('conferenceRecords/', '')}`,
    organizerUserId: organizerUser?.id ?? null,
    organizerEmail,
    // Sin organizador conocido, el evento llegó por la suscripción de un usuario interno → host interno.
    isExternalHost: asUser ? !isInternalEmail(asUser, settings.companyDomain) : true,
    startAt: start,
    endAt: record?.endTime ?? null,
    durationSeconds: record?.endTime ? Math.round((record.endTime.getTime() - start.getTime()) / 1000) : null,
    status: MeetingStatus.IN_PROGRESS,
    source: MeetingSource.WORKSPACE_EVENT,
    processingStatus: MeetingProcessingStatus.DISCOVERED,
    transcriptStatus: ArtifactStatus.NOT_REQUESTED,
    smartNotesStatus: ArtifactStatus.NOT_REQUESTED,
    aiAnalysisStatus: 'NOT_STARTED',
    confidentialityLevel: 'NORMAL',
    excludedFromAi: false,
    reportedLanguageCode: null,
    detectedLanguageCode: null,
    mixedLanguageDetected: false,
    lastErrorCode: null,
    lastErrorAt: null,
    areaId: organizerUser?.areaId ?? null,
    projectId: null,
    createdAt: now,
    updatedAt: now,
  }
  const saved = await repos.meetings.save(meeting)
  await audit(repos, ctx, { actorType: 'SYSTEM', action: 'meeting.discovered', entity: 'Meeting', entityId: saved.id, after: { source: saved.source, conferenceRecord: recordName } })
  await ctx.events.publish({ type: 'MeetingDiscovered', meetingId: saved.id, source: saved.source, occurredAt: now })
  metrics.increment(MetricNames.MEETINGS_DISCOVERED, 1, { source: 'workspace_event' })
  return { meeting: saved, created: true, record }
}

export async function processInboundGoogleEvent(ctx: AppContext, event: WorkspaceCloudEvent, options: { correlationId?: string } = {}): Promise<ProcessInboundEventResult> {
  const now = ctx.clock.now()
  const recordName = extractConferenceRecordName(event)
  const inserted = await ctx.repos.inboundEvents.insertIfAbsent({
    id: ctx.ids.next(),
    cloudEventId: event.id,
    type: event.type,
    source: event.source,
    subject: event.subject ?? null,
    occurredAt: event.time ? new Date(event.time) : null,
    resourceName: recordName,
    rawPayloadRedacted: redactEventPayload(event),
    receivedAt: now,
    processedAt: null,
    processingStatus: InboundEventProcessingStatus.RECEIVED,
    attempts: 0,
    lastErrorCode: null,
  })
  if (!inserted.created && inserted.event.processingStatus !== InboundEventProcessingStatus.FAILED) {
    metrics.increment(MetricNames.WEBHOOK_DUPLICATES)
    ctx.logger.info({ googleEventId: event.id }, 'Evento duplicado ignorado')
    return { duplicate: true, status: inserted.event.processingStatus, meetingId: null, enqueuedJob: null }
  }
  const stored = inserted.event
  let meetingId: string | null = null
  let enqueuedJob: string | null = null
  let status: InboundGoogleEvent['processingStatus'] = InboundEventProcessingStatus.PROCESSED
  let errorCode: string | null = null
  try {
    if (!recordName) {
      status = InboundEventProcessingStatus.IGNORED
    } else {
      await ctx.uow.run(async (repos) => {
        switch (event.type) {
          case GoogleMeetEventType.CONFERENCE_STARTED: {
            const { meeting } = await findOrCreateMeetingForRecord(ctx, repos, recordName, event)
            meetingId = meeting.id
            if (meeting.status !== MeetingStatus.ENDED) await repos.meetings.updateProcessing(meeting.id, { status: MeetingStatus.IN_PROGRESS })
            break
          }
          case GoogleMeetEventType.CONFERENCE_ENDED: {
            const { meeting, record } = await findOrCreateMeetingForRecord(ctx, repos, recordName, event)
            meetingId = meeting.id
            const endAt = record?.endTime ?? (event.time ? new Date(event.time) : now)
            const startAt = record?.startTime ?? meeting.startAt
            const patch = {
              status: MeetingStatus.ENDED,
              endAt,
              durationSeconds: Math.max(0, Math.round((endAt.getTime() - startAt.getTime()) / 1000)),
              transcriptStatus: meeting.transcriptStatus === ArtifactStatus.NOT_REQUESTED ? ArtifactStatus.PENDING : meeting.transcriptStatus,
              smartNotesStatus: meeting.smartNotesStatus === ArtifactStatus.NOT_REQUESTED ? ArtifactStatus.PENDING : meeting.smartNotesStatus,
            }
            if (meeting.processingStatus === MeetingProcessingStatus.DISCOVERED) {
              await setProcessingStatus(repos, meeting, MeetingProcessingStatus.WAITING_FOR_ARTIFACTS, patch)
            } else {
              await repos.meetings.updateProcessing(meeting.id, patch)
            }
            enqueuedJob = await enqueueJob(ctx, JobNames.FETCH_MEETING_ARTIFACTS, { meetingId: meeting.id }, { singletonKey: `fetch:${meeting.id}`, startAfterSeconds: 120, correlationId: options.correlationId })
            await audit(repos, ctx, { actorType: 'SYSTEM', action: 'meeting.ended', entity: 'Meeting', entityId: meeting.id, after: { conferenceRecord: recordName, endAt }, correlationId: options.correlationId })
            break
          }
          case GoogleMeetEventType.TRANSCRIPT_FILE_GENERATED:
          case GoogleMeetEventType.SMART_NOTE_FILE_GENERATED:
          case GoogleMeetEventType.TRANSCRIPT_ENDED:
          case GoogleMeetEventType.SMART_NOTE_ENDED:
          case GoogleMeetEventType.TRANSCRIPT_STARTED:
          case GoogleMeetEventType.SMART_NOTE_STARTED: {
            const { meeting } = await findOrCreateMeetingForRecord(ctx, repos, recordName, event)
            meetingId = meeting.id
            const isTranscript = event.type.includes('.transcript.')
            const generated = event.type.endsWith('fileGenerated')
            const started = event.type.endsWith('started')
            const artifactStatus = generated ? ArtifactStatus.AVAILABLE : started ? ArtifactStatus.PENDING : ArtifactStatus.PENDING
            const patch = isTranscript ? { transcriptStatus: artifactStatus } : { smartNotesStatus: artifactStatus }
            if (generated) {
              await ctx.events.publish({ type: 'MeetingArtifactsAvailable', meetingId: meeting.id, occurredAt: now })
              if (meeting.processingStatus === MeetingProcessingStatus.WAITING_FOR_ARTIFACTS || meeting.processingStatus === MeetingProcessingStatus.DISCOVERED) {
                await setProcessingStatus(repos, meeting, MeetingProcessingStatus.ARTIFACTS_AVAILABLE, patch)
              } else {
                await repos.meetings.updateProcessing(meeting.id, patch)
              }
              enqueuedJob = await enqueueJob(ctx, JobNames.FETCH_MEETING_ARTIFACTS, { meetingId: meeting.id }, { singletonKey: `fetch:${meeting.id}`, startAfterSeconds: 30, correlationId: options.correlationId })
            } else {
              const current = isTranscript ? meeting.transcriptStatus : meeting.smartNotesStatus
              if (current === ArtifactStatus.NOT_REQUESTED || current === ArtifactStatus.CAPABILITY_BLOCKED) await repos.meetings.updateProcessing(meeting.id, patch)
            }
            break
          }
          default:
            status = InboundEventProcessingStatus.IGNORED
        }
      })
    }
  } catch (err) {
    status = InboundEventProcessingStatus.FAILED
    errorCode = isDomainError(err) ? err.code : DomainErrorCode.INTERNAL_ERROR
    ctx.logger.error({ googleEventId: event.id, errorCode, meetingId }, 'Error procesando evento de Google')
    metrics.increment(MetricNames.JOBS_FAILED, 1, { job: JobNames.PROCESS_GOOGLE_EVENT })
    await ctx.repos.inboundEvents.save({ ...stored, processingStatus: status, attempts: stored.attempts + 1, lastErrorCode: errorCode, processedAt: ctx.clock.now() })
    throw err
  }
  await ctx.repos.inboundEvents.save({ ...stored, processingStatus: status, attempts: stored.attempts + 1, lastErrorCode: null, processedAt: ctx.clock.now() })
  return { duplicate: false, status, meetingId, enqueuedJob }
}
