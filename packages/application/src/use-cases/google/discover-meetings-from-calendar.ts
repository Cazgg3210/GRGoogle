import { JobNames } from '@smlxl/config'
import {
  ArtifactStatus,
  DomainErrorCode,
  MeetingProcessingStatus,
  MeetingSource,
  MeetingStatus,
  isDomainError,
  isInternalEmail,
  type CalendarEventSummary,
  type Meeting,
  type MeetingParticipant,
  type PlatformSettings,
  type Repositories,
  type User,
} from '@smlxl/domain'
import { metrics, MetricNames } from '@smlxl/observability'
import type { AppContext } from '../../context.js'
import { enqueueJob } from '../../context.js'
import { audit } from '../../shared.js'

/**
 * Descubrimiento preventivo de reuniones vía Calendar (§14): sync incremental
 * por usuario monitoreado con `syncToken`, upsert de Meetings con Meet URI,
 * auto-captura para hosts internos (§12.3) y safety net (§13.3, §54).
 */
export interface DiscoverMeetingsResult {
  users: number
  created: number
  updated: number
  cancelled: number
  autoCaptureApplied: number
  autoCaptureBlocked: number
  errors: Array<{ userEmail: string; code: string }>
}

const CALENDAR_ID = 'primary'
const WINDOW_DAYS = 30
const SAFETY_NET_DELAY_MS = 20 * 60 * 1000

export interface EnsureAutoCaptureResult {
  applied: boolean
  blockedReason?: string
}

/** §12.3: activa auto-transcripción/Smart Notes impersonando al organizador. Nunca lanza. */
export async function ensureAutoCapture(ctx: AppContext, meeting: Meeting): Promise<EnsureAutoCaptureResult> {
  if (!meeting.googleMeetingCode || !meeting.organizerEmail) return { applied: false, blockedReason: 'Sin meetingCode u organizador' }
  const organizer = meeting.organizerEmail
  try {
    const space = await ctx.meet.getSpaceByMeetingCode(meeting.googleMeetingCode, organizer)
    if (!space) {
      ctx.logger.warn({ meetingId: meeting.id }, 'Space de Meet no encontrado para auto-captura')
      return { applied: false, blockedReason: 'Space no encontrado' }
    }
    const result = await ctx.meet.patchArtifactConfig(space.name, { autoTranscription: true, autoSmartNotes: true }, organizer)
    await ctx.uow.run(async (repos) => {
      const current = await repos.meetings.findById(meeting.id)
      if (!current) return
      const status = result.applied ? ArtifactStatus.PENDING : ArtifactStatus.CAPABILITY_BLOCKED
      await repos.meetings.save({
        ...current,
        googleMeetingSpaceId: space.name,
        transcriptStatus: current.transcriptStatus === ArtifactStatus.NOT_REQUESTED || current.transcriptStatus === ArtifactStatus.CAPABILITY_BLOCKED ? status : current.transcriptStatus,
        smartNotesStatus: current.smartNotesStatus === ArtifactStatus.NOT_REQUESTED || current.smartNotesStatus === ArtifactStatus.CAPABILITY_BLOCKED ? status : current.smartNotesStatus,
        lastErrorCode: result.applied ? current.lastErrorCode : DomainErrorCode.GOOGLE_CAPABILITY_BLOCKED,
        lastErrorAt: result.applied ? current.lastErrorAt : ctx.clock.now(),
        updatedAt: ctx.clock.now(),
      })
      await audit(repos, ctx, {
        actorType: 'SYSTEM',
        action: result.applied ? 'meeting.auto_capture.applied' : 'meeting.auto_capture.blocked',
        entity: 'Meeting',
        entityId: meeting.id,
        after: { spaceName: space.name, blockedReason: result.blockedReason ?? null },
      })
    })
    if (!result.applied) ctx.logger.warn({ meetingId: meeting.id, blockedReason: result.blockedReason }, 'Auto-captura bloqueada por política/privilegios')
    return result
  } catch (err) {
    const code = isDomainError(err) ? err.code : DomainErrorCode.INTERNAL_ERROR
    ctx.logger.error({ meetingId: meeting.id, errorCode: code }, 'Error al configurar auto-captura')
    await ctx.uow.run(async (repos) => {
      await repos.meetings.updateProcessing(meeting.id, {
        transcriptStatus: ArtifactStatus.CAPABILITY_BLOCKED,
        smartNotesStatus: ArtifactStatus.CAPABILITY_BLOCKED,
        lastErrorCode: code,
        lastErrorAt: ctx.clock.now(),
      })
    })
    return { applied: false, blockedReason: code }
  }
}

function participantsFromAttendees(
  ctx: AppContext,
  meetingId: string,
  event: CalendarEventSummary,
  usersByEmail: Map<string, User>,
  domain: string,
): MeetingParticipant[] {
  const emails = new Set<string>(event.attendees.map((a) => a.email.toLowerCase()))
  if (event.organizerEmail) emails.add(event.organizerEmail.toLowerCase())
  return [...emails].map((email) => {
    const user = usersByEmail.get(email) ?? null
    return {
      id: ctx.ids.next(),
      meetingId,
      internalUserId: user?.id ?? null,
      googleParticipantId: null,
      displayName: user?.displayName ?? email.split('@')[0] ?? email,
      email,
      participantType: 'UNKNOWN',
      isInternal: user !== null || isInternalEmail(email, domain),
      joinedAt: null,
      leftAt: null,
      speakingDurationSeconds: null,
    }
  })
}

async function upsertMeetingFromEvent(
  ctx: AppContext,
  repos: Repositories,
  event: CalendarEventSummary,
  settings: PlatformSettings,
  usersByEmail: Map<string, User>,
): Promise<{ meeting: Meeting | null; created: boolean; cancelled: boolean }> {
  const existing =
    (await repos.meetings.findByCalendarEventId(event.calendarEventId)) ??
    (event.meetingCode
      ? (await repos.meetings.findByMeetingCode(event.meetingCode)).find(
          (m) => Math.abs(m.startAt.getTime() - event.startAt.getTime()) < 3 * 60 * 60 * 1000,
        ) ?? null
      : null)
  const now = ctx.clock.now()
  if (event.status === 'cancelled') {
    if (!existing || existing.status === MeetingStatus.CANCELLED) return { meeting: existing, created: false, cancelled: false }
    if (existing.status === MeetingStatus.ENDED) return { meeting: existing, created: false, cancelled: false }
    const saved = await repos.meetings.save({ ...existing, status: MeetingStatus.CANCELLED, updatedAt: now })
    await audit(repos, ctx, { actorType: 'SYSTEM', action: 'meeting.cancelled', entity: 'Meeting', entityId: saved.id, before: { status: existing.status } })
    return { meeting: saved, created: false, cancelled: true }
  }
  if (!event.meetingCode) return { meeting: null, created: false, cancelled: false }
  const organizerEmail = event.organizerEmail?.toLowerCase() ?? event.creatorEmail?.toLowerCase() ?? null
  const organizer = organizerEmail ? (usersByEmail.get(organizerEmail) ?? null) : null
  const isExternalHost = !isInternalEmail(organizerEmail, settings.companyDomain)
  if (existing) {
    if (existing.status === MeetingStatus.ENDED || existing.status === MeetingStatus.CANCELLED) {
      return { meeting: existing, created: false, cancelled: false }
    }
    const changed =
      existing.title !== event.title ||
      existing.startAt.getTime() !== event.startAt.getTime() ||
      (existing.endAt?.getTime() ?? null) !== (event.endAt?.getTime() ?? null) ||
      existing.googleCalendarEventId !== event.calendarEventId
    if (!changed) return { meeting: existing, created: false, cancelled: false }
    const saved = await repos.meetings.save({
      ...existing,
      title: event.title,
      startAt: event.startAt,
      endAt: event.endAt,
      googleCalendarEventId: event.calendarEventId,
      organizerEmail,
      organizerUserId: organizer?.id ?? existing.organizerUserId,
      isExternalHost,
      updatedAt: now,
    })
    await repos.meetings.replaceParticipants(saved.id, participantsFromAttendees(ctx, saved.id, event, usersByEmail, settings.companyDomain))
    return { meeting: saved, created: false, cancelled: false }
  }
  const id = ctx.ids.next()
  const meeting: Meeting = {
    id,
    googleConferenceRecordId: null,
    googleMeetingSpaceId: null,
    googleMeetingCode: event.meetingCode,
    googleCalendarEventId: event.calendarEventId,
    title: event.title,
    organizerUserId: organizer?.id ?? null,
    organizerEmail,
    isExternalHost,
    startAt: event.startAt,
    endAt: event.endAt,
    durationSeconds: null,
    status: event.endAt && event.endAt.getTime() < now.getTime() ? MeetingStatus.SCHEDULED : MeetingStatus.SCHEDULED,
    source: MeetingSource.CALENDAR_DISCOVERY,
    processingStatus: MeetingProcessingStatus.DISCOVERED,
    transcriptStatus: ArtifactStatus.NOT_REQUESTED,
    smartNotesStatus: ArtifactStatus.NOT_REQUESTED,
    aiAnalysisStatus: 'NOT_STARTED',
    confidentialityLevel: 'NORMAL',
    excludedFromAi: false,
    reportedLanguageCode: event.timezone ? null : null,
    detectedLanguageCode: null,
    mixedLanguageDetected: false,
    lastErrorCode: null,
    lastErrorAt: null,
    areaId: organizer?.areaId ?? null,
    projectId: null,
    createdAt: now,
    updatedAt: now,
  }
  const saved = await repos.meetings.save(meeting)
  await repos.meetings.replaceParticipants(saved.id, participantsFromAttendees(ctx, saved.id, event, usersByEmail, settings.companyDomain))
  await audit(repos, ctx, {
    actorType: 'SYSTEM',
    action: 'meeting.discovered',
    entity: 'Meeting',
    entityId: saved.id,
    after: { source: saved.source, meetingCode: saved.googleMeetingCode, isExternalHost },
  })
  await ctx.events.publish({ type: 'MeetingDiscovered', meetingId: saved.id, source: saved.source, occurredAt: now })
  metrics.increment(MetricNames.MEETINGS_DISCOVERED, 1, { source: 'calendar' })
  return { meeting: saved, created: true, cancelled: false }
}

export async function discoverMeetingsFromCalendar(ctx: AppContext, options: { userId?: string } = {}): Promise<DiscoverMeetingsResult> {
  const settings = await ctx.getSettings()
  const result: DiscoverMeetingsResult = { users: 0, created: 0, updated: 0, cancelled: 0, autoCaptureApplied: 0, autoCaptureBlocked: 0, errors: [] }
  let monitored = await ctx.repos.users.list({ active: true, monitored: true })
  if (options.userId) monitored = monitored.filter((u) => u.id === options.userId)
  const allUsers = await ctx.repos.users.list()
  const usersByEmail = new Map(allUsers.map((u) => [u.email.toLowerCase(), u]))
  const now = ctx.clock.now()
  for (const user of monitored) {
    result.users += 1
    const cursor = (await ctx.repos.calendarCursors.find(user.id, CALENDAR_ID)) ?? {
      id: ctx.ids.next(),
      userId: user.id,
      calendarId: CALENDAR_ID,
      syncToken: null,
      lastFullSyncAt: null,
      lastIncrementalSyncAt: null,
      lastError: null,
    }
    try {
      let sync = await ctx.calendar.syncEvents({ userEmail: user.email, calendarId: CALENDAR_ID, syncToken: cursor.syncToken })
      let fullSync = cursor.syncToken === null
      if (sync.fullSyncRequired) {
        ctx.logger.info({ userId: user.id }, 'syncToken inválido; reiniciando sync completo de Calendar')
        fullSync = true
        sync = await ctx.calendar.syncEvents({
          userEmail: user.email,
          calendarId: CALENDAR_ID,
          syncToken: null,
          timeMin: new Date(now.getTime() - WINDOW_DAYS * 86_400_000),
          timeMax: new Date(now.getTime() + WINDOW_DAYS * 86_400_000),
        })
      } else if (cursor.syncToken === null) {
        // Primera sincronización: acotar ventana ±30 días.
        sync = await ctx.calendar.syncEvents({
          userEmail: user.email,
          calendarId: CALENDAR_ID,
          syncToken: null,
          timeMin: new Date(now.getTime() - WINDOW_DAYS * 86_400_000),
          timeMax: new Date(now.getTime() + WINDOW_DAYS * 86_400_000),
        })
      }
      const toCapture: Meeting[] = []
      await ctx.uow.run(async (repos) => {
        for (const event of sync.events) {
          const { meeting, created, cancelled } = await upsertMeetingFromEvent(ctx, repos, event, settings, usersByEmail)
          if (created) result.created += 1
          else if (cancelled) result.cancelled += 1
          else if (meeting) result.updated += 1
          if (!meeting || cancelled || meeting.status !== MeetingStatus.SCHEDULED) continue
          if (created || meeting.transcriptStatus === ArtifactStatus.NOT_REQUESTED) {
            if (!meeting.isExternalHost && settings.autoCaptureEnabled && meeting.startAt.getTime() > now.getTime()) toCapture.push(meeting)
          }
          if (created) {
            const endAt = meeting.endAt ?? new Date(meeting.startAt.getTime() + 60 * 60 * 1000)
            const startAfterSeconds = Math.max(0, Math.round((endAt.getTime() + SAFETY_NET_DELAY_MS - now.getTime()) / 1000))
            await enqueueJob(ctx, JobNames.RECONCILE_MISSING_EVENTS, { meetingId: meeting.id }, { singletonKey: `reconcile:${meeting.id}`, startAfterSeconds })
          }
        }
        await repos.calendarCursors.save({
          ...cursor,
          syncToken: sync.nextSyncToken,
          lastFullSyncAt: fullSync ? now : cursor.lastFullSyncAt,
          lastIncrementalSyncAt: now,
          lastError: null,
        })
      })
      for (const meeting of toCapture) {
        const capture = await ensureAutoCapture(ctx, meeting)
        if (capture.applied) result.autoCaptureApplied += 1
        else result.autoCaptureBlocked += 1
      }
    } catch (err) {
      const code = isDomainError(err) ? err.code : DomainErrorCode.INTERNAL_ERROR
      ctx.logger.error({ userId: user.id, errorCode: code }, 'Error sincronizando Calendar del usuario')
      result.errors.push({ userEmail: user.email, code })
      await ctx.repos.calendarCursors.save({ ...cursor, lastError: `${code}: ${err instanceof Error ? err.message : 'error'}`.slice(0, 500) })
    }
  }
  return result
}
