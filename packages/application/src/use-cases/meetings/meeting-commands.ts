import { JobNames, aiMode } from '@smlxl/config'
import {
  ArtifactStatus,
  DomainError,
  DomainErrorCode,
  MeetingProcessingStatus,
  MeetingSource,
  MeetingStatus,
  Permission,
  TranscriptSourceType,
  canAccessMeeting,
  hasPermission,
  isInternalEmail,
  type ConfidentialityLevel,
  type Meeting,
  type MeetingParticipant,
  type Principal,
  type TranscriptSegment,
} from '@smlxl/domain'
import { metrics, MetricNames } from '@smlxl/observability'
import type { AppContext } from '../../context.js'
import { enqueueJob } from '../../context.js'
import { audit, requireMeeting, setProcessingStatus, sha256 } from '../../shared.js'

/** POST /meetings/manual: alta manual con transcripción pegada (§14.3 MANUAL_IMPORT). */
export interface CreateManualMeetingInput {
  title: string
  startAt: string
  endAt?: string | null
  organizerEmail?: string
  participantEmails: string[]
  transcriptText: string
  smartNotesText?: string | null
  confidentialityLevel: ConfidentialityLevel
  /** Si true (por defecto) encola el análisis IA. */
  analyze?: boolean
}

/** Parsea "Hablante: texto" por línea; sin hablante usa "Participante". */
export function parseManualTranscript(text: string): Array<{ speakerLabel: string; text: string }> {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((line) => {
      const m = /^([^:]{2,60}):\s*(.+)$/.exec(line)
      return m
        ? { speakerLabel: (m[1] as string).trim(), text: (m[2] as string).trim() }
        : { speakerLabel: 'Participante', text: line }
    })
}

export async function createManualMeeting(
  ctx: AppContext,
  principal: Principal,
  input: CreateManualMeetingInput,
): Promise<{ meetingId: string; enqueuedAnalysis: boolean }> {
  if (!hasPermission(principal, Permission.ACTION_ITEM_CREATE))
    throw DomainError.forbidden('No tienes permiso para crear reuniones manuales')
  const settings = await ctx.getSettings()
  const now = ctx.clock.now()
  const startAt = new Date(input.startAt)
  if (Number.isNaN(startAt.getTime()))
    throw new DomainError(DomainErrorCode.VALIDATION_ERROR, 'startAt inválido')
  const endAt = input.endAt ? new Date(input.endAt) : null
  const organizerEmail = (input.organizerEmail ?? principal.email).toLowerCase()
  const organizer = await ctx.repos.users.findByEmail(organizerEmail)
  const lines = parseManualTranscript(input.transcriptText)
  if (lines.length === 0)
    throw new DomainError(DomainErrorCode.TRANSCRIPT_EMPTY, 'La transcripción está vacía')
  const aiEnabled =
    (input.analyze ?? true) &&
    (settings.featureFlags.AI_PROCESSING_ENABLED || aiMode(ctx.env) === 'FAKE')
  const meetingId = ctx.ids.next()
  await ctx.uow.run(async (repos) => {
    const meeting: Meeting = {
      id: meetingId,
      googleConferenceRecordId: null,
      googleMeetingSpaceId: null,
      googleMeetingCode: null,
      googleCalendarEventId: null,
      title: input.title,
      organizerUserId: organizer?.id ?? null,
      organizerEmail,
      isExternalHost: !isInternalEmail(organizerEmail, settings.companyDomain),
      startAt,
      endAt,
      durationSeconds: endAt ? Math.round((endAt.getTime() - startAt.getTime()) / 1000) : null,
      status: MeetingStatus.ENDED,
      source: MeetingSource.MANUAL_IMPORT,
      processingStatus: MeetingProcessingStatus.DISCOVERED,
      transcriptStatus: ArtifactStatus.INGESTED,
      smartNotesStatus: input.smartNotesText
        ? ArtifactStatus.INGESTED
        : ArtifactStatus.NOT_REQUESTED,
      aiAnalysisStatus: aiEnabled ? 'QUEUED' : 'NOT_STARTED',
      confidentialityLevel: input.confidentialityLevel,
      excludedFromAi: false,
      reportedLanguageCode: null,
      detectedLanguageCode: null,
      mixedLanguageDetected: false,
      lastErrorCode: null,
      lastErrorAt: null,
      areaId: organizer?.areaId ?? principal.areaId,
      projectId: null,
      createdAt: now,
      updatedAt: now,
    }
    await repos.meetings.save(meeting)
    const emails = new Set([organizerEmail, ...input.participantEmails.map((e) => e.toLowerCase())])
    const participants: MeetingParticipant[] = []
    for (const email of emails) {
      const user = await repos.users.findByEmail(email)
      participants.push({
        id: ctx.ids.next(),
        meetingId,
        internalUserId: user?.id ?? null,
        googleParticipantId: null,
        displayName: user?.displayName ?? email.split('@')[0] ?? email,
        email,
        participantType: 'UNKNOWN',
        isInternal: user !== null || isInternalEmail(email, settings.companyDomain),
        joinedAt: null,
        leftAt: null,
        speakingDurationSeconds: null,
      })
    }
    await repos.meetings.replaceParticipants(meetingId, participants)
    const transcriptId = ctx.ids.next()
    const segments: TranscriptSegment[] = lines.map((l, i) => {
      const p = participants.find(
        (x) => x.displayName.toLowerCase() === l.speakerLabel.toLowerCase(),
      )
      return {
        id: ctx.ids.next(),
        transcriptId,
        participantId: p?.id ?? null,
        speakerLabel: l.speakerLabel,
        text: l.text,
        startAt: null,
        endAt: null,
        sequence: i + 1,
      }
    })
    const retainedUntil = settings.rawTranscriptRetentionDays
      ? new Date(now.getTime() + settings.rawTranscriptRetentionDays * 86_400_000)
      : null
    await repos.transcripts.save(
      {
        id: transcriptId,
        meetingId,
        sourceType: TranscriptSourceType.MANUAL,
        googleTranscriptId: null,
        languageCode: null,
        startedAt: startAt,
        endedAt: endAt,
        rawText: input.transcriptText,
        structuredPayload: null,
        sourceUri: null,
        retainedUntil,
        ingestionChecksum: sha256(input.transcriptText),
        createdAt: now,
      },
      segments,
    )
    if (input.smartNotesText) {
      await repos.transcripts.save(
        {
          id: ctx.ids.next(),
          meetingId,
          sourceType: TranscriptSourceType.MEET_SMART_NOTES,
          googleTranscriptId: null,
          languageCode: null,
          startedAt: startAt,
          endedAt: endAt,
          rawText: input.smartNotesText,
          structuredPayload: null,
          sourceUri: null,
          retainedUntil,
          ingestionChecksum: sha256(`notes|${input.smartNotesText}`),
          createdAt: now,
        },
        [],
      )
    }
    let m = meeting
    m = await setProcessingStatus(repos, m, MeetingProcessingStatus.ARTIFACTS_AVAILABLE)
    m = await setProcessingStatus(repos, m, MeetingProcessingStatus.INGESTING)
    m = await setProcessingStatus(repos, m, MeetingProcessingStatus.INGESTED)
    if (!aiEnabled)
      await setProcessingStatus(repos, m, MeetingProcessingStatus.COMPLETED, {
        aiAnalysisStatus: 'SKIPPED',
      })
    await audit(repos, ctx, {
      actorType: 'USER',
      actorUserId: principal.id,
      action: 'meeting.manual_created',
      entity: 'Meeting',
      entityId: meetingId,
      after: { title: input.title, participants: participants.length },
    })
    metrics.increment(MetricNames.MEETINGS_DISCOVERED, 1, { source: 'manual' })
    metrics.increment(MetricNames.TRANSCRIPTS_INGESTED, 1, { source: 'manual' })
  })
  await ctx.events.publish({
    type: 'MeetingDiscovered',
    meetingId,
    source: MeetingSource.MANUAL_IMPORT,
    occurredAt: now,
  })
  await ctx.events.publish({
    type: 'MeetingIngested',
    meetingId,
    transcriptId: null,
    occurredAt: now,
  })
  if (aiEnabled)
    await enqueueJob(
      ctx,
      JobNames.ANALYZE_MEETING,
      { meetingId, kind: 'ANALYZE_MEETING' },
      { singletonKey: `analyze:${meetingId}` },
    )
  return { meetingId, enqueuedAnalysis: aiEnabled }
}

/** PATCH /meetings/:id — confidencialidad, exclusión IA, área/proyecto. */
export interface UpdateMeetingInput {
  confidentialityLevel?: ConfidentialityLevel
  excludedFromAi?: boolean
  areaId?: string | null
  projectId?: string | null
}

export async function updateMeeting(
  ctx: AppContext,
  principal: Principal,
  meetingId: string,
  input: UpdateMeetingInput,
): Promise<Meeting> {
  const meeting = requireMeeting(await ctx.repos.meetings.findById(meetingId), meetingId)
  const participants = await ctx.repos.meetings.listParticipants(meetingId)
  if (
    !canAccessMeeting(principal, {
      ...meeting,
      participantUserIds: participants
        .map((p) => p.internalUserId)
        .filter((x): x is string => x !== null),
    })
  ) {
    throw DomainError.forbidden('No tienes acceso a esta reunión')
  }
  if (
    input.confidentialityLevel !== undefined &&
    !hasPermission(principal, Permission.MEETING_SET_CONFIDENTIALITY)
  )
    throw DomainError.forbidden('No puedes cambiar la confidencialidad')
  if (input.excludedFromAi !== undefined && !hasPermission(principal, Permission.MEETING_EXCLUDE))
    throw DomainError.forbidden('No puedes excluir reuniones del análisis')
  if (
    (input.areaId !== undefined || input.projectId !== undefined) &&
    !hasPermission(principal, Permission.ACTION_ITEM_UPDATE)
  )
    throw DomainError.forbidden('No puedes editar la reunión')
  const now = ctx.clock.now()
  return ctx.uow.run(async (repos) => {
    const before = {
      confidentialityLevel: meeting.confidentialityLevel,
      excludedFromAi: meeting.excludedFromAi,
      areaId: meeting.areaId,
      projectId: meeting.projectId,
    }
    let next: Meeting = {
      ...meeting,
      confidentialityLevel: input.confidentialityLevel ?? meeting.confidentialityLevel,
      excludedFromAi: input.excludedFromAi ?? meeting.excludedFromAi,
      areaId: input.areaId === undefined ? meeting.areaId : input.areaId,
      projectId: input.projectId === undefined ? meeting.projectId : input.projectId,
      updatedAt: now,
    }
    if (input.excludedFromAi === true && !meeting.excludedFromAi) {
      next = {
        ...next,
        processingStatus: MeetingProcessingStatus.EXCLUDED,
        aiAnalysisStatus: 'SKIPPED',
      }
    } else if (
      input.excludedFromAi === false &&
      meeting.excludedFromAi &&
      meeting.processingStatus === MeetingProcessingStatus.EXCLUDED
    ) {
      next = { ...next, processingStatus: MeetingProcessingStatus.DISCOVERED }
    }
    const saved = await repos.meetings.save(next)
    await audit(repos, ctx, {
      actorType: 'USER',
      actorUserId: principal.id,
      action: 'meeting.updated',
      entity: 'Meeting',
      entityId: meetingId,
      before,
      after: {
        confidentialityLevel: saved.confidentialityLevel,
        excludedFromAi: saved.excludedFromAi,
        areaId: saved.areaId,
        projectId: saved.projectId,
      },
    })
    return saved
  })
}
