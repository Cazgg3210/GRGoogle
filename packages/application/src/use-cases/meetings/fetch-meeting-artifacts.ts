import { JobNames, aiMode } from '@smlxl/config'
import {
  ArtifactStatus,
  DomainError,
  DomainErrorCode,
  MeetingProcessingStatus,
  TranscriptSourceType,
  isDomainError,
  isInternalEmail,
  type Meeting,
  type MeetingParticipant,
  type MeetParticipant,
  type Repositories,
  type Transcript,
  type TranscriptSegment,
} from '@smlxl/domain'
import { metrics, MetricNames } from '@smlxl/observability'
import type { AppContext } from '../../context.js'
import { enqueueJob } from '../../context.js'
import { audit, setProcessingStatus, sha256 } from '../../shared.js'

/**
 * ProcessMeetingArtifact / FetchMeetingArtifacts (§12, §15): recupera
 * participantes, transcript entries y Smart Notes vía Meet REST API impersonando
 * a un usuario interno, persiste Transcript/Segments (idempotente por checksum)
 * y encola el análisis IA.
 */
export interface FetchArtifactsResult {
  meetingId: string
  transcriptIngested: boolean
  smartNotesIngested: boolean
  skippedAsDuplicate: boolean
  processingStatus: Meeting['processingStatus']
  enqueuedAnalysis: boolean
}

export const MAX_ARTIFACT_ATTEMPTS = 6

async function chooseImpersonation(repos: Repositories, meeting: Meeting, domain: string): Promise<string | null> {
  if (meeting.organizerEmail && isInternalEmail(meeting.organizerEmail, domain)) return meeting.organizerEmail
  const participants = await repos.meetings.listParticipants(meeting.id)
  const internal = participants.find((p) => p.isInternal && p.email && isInternalEmail(p.email, domain))
  if (internal?.email) return internal.email
  if (meeting.organizerUserId) {
    const organizer = await repos.users.findById(meeting.organizerUserId)
    if (organizer) return organizer.email
  }
  // Último recurso: un usuario monitoreado activo (la suscripción que entregó el evento es suya).
  const monitored = await repos.users.list({ active: true, monitored: true })
  return monitored[0]?.email ?? null
}

async function mapParticipants(repos: Repositories, ctx: AppContext, meeting: Meeting, raw: MeetParticipant[], domain: string): Promise<MeetingParticipant[]> {
  const out: MeetingParticipant[] = []
  for (const p of raw) {
    const email = p.email?.toLowerCase() ?? null
    const user = email ? await repos.users.findByEmail(email) : null
    out.push({
      id: ctx.ids.next(),
      meetingId: meeting.id,
      internalUserId: user?.id ?? null,
      googleParticipantId: p.name,
      displayName: p.displayName,
      email,
      participantType: p.type,
      isInternal: user !== null || isInternalEmail(email, domain),
      joinedAt: p.earliestStartTime,
      leftAt: p.latestEndTime,
      speakingDurationSeconds: null,
    })
  }
  return out
}

export async function fetchMeetingArtifacts(ctx: AppContext, input: { meetingId: string; attempt?: number; correlationId?: string }): Promise<FetchArtifactsResult> {
  const attempt = input.attempt ?? 1
  const settings = await ctx.getSettings()
  const domain = settings.companyDomain
  const meeting0 = await ctx.repos.meetings.findById(input.meetingId)
  if (!meeting0) throw DomainError.notFound('Meeting', input.meetingId)
  if (meeting0.excludedFromAi && meeting0.processingStatus === MeetingProcessingStatus.EXCLUDED) {
    return { meetingId: meeting0.id, transcriptIngested: false, smartNotesIngested: false, skippedAsDuplicate: false, processingStatus: meeting0.processingStatus, enqueuedAnalysis: false }
  }
  const now = ctx.clock.now()

  const markUnavailableExternal = async (): Promise<FetchArtifactsResult> => {
    await ctx.uow.run(async (repos) => {
      const m = (await repos.meetings.findById(meeting0.id)) ?? meeting0
      const target = m.processingStatus === MeetingProcessingStatus.WAITING_FOR_ARTIFACTS || m.processingStatus === MeetingProcessingStatus.DISCOVERED ? MeetingProcessingStatus.COMPLETED : m.processingStatus
      const patch = { transcriptStatus: ArtifactStatus.UNAVAILABLE_EXTERNAL_HOST, smartNotesStatus: ArtifactStatus.UNAVAILABLE_EXTERNAL_HOST, aiAnalysisStatus: 'SKIPPED' as const }
      if (m.processingStatus === MeetingProcessingStatus.DISCOVERED) {
        const w = await setProcessingStatus(repos, m, MeetingProcessingStatus.WAITING_FOR_ARTIFACTS)
        await setProcessingStatus(repos, w, MeetingProcessingStatus.COMPLETED, patch)
      } else if (target !== m.processingStatus) await setProcessingStatus(repos, m, target, patch)
      else await repos.meetings.updateProcessing(m.id, patch)
      await audit(repos, ctx, { actorType: 'SYSTEM', action: 'meeting.artifacts.unavailable_external_host', entity: 'Meeting', entityId: m.id, correlationId: input.correlationId })
    })
    ctx.logger.info({ meetingId: meeting0.id }, 'Reunión con host externo sin artefactos accesibles')
    return { meetingId: meeting0.id, transcriptIngested: false, smartNotesIngested: false, skippedAsDuplicate: false, processingStatus: MeetingProcessingStatus.COMPLETED, enqueuedAnalysis: false }
  }

  const asUser = await chooseImpersonation(ctx.repos, meeting0, domain)
  if (!asUser) {
    if (meeting0.isExternalHost) return markUnavailableExternal()
    throw new DomainError(DomainErrorCode.GOOGLE_PERMISSION_DENIED, 'No hay usuario interno para impersonar en la reunión', { details: { meetingId: meeting0.id } })
  }
  if (!meeting0.googleConferenceRecordId) {
    if (attempt < MAX_ARTIFACT_ATTEMPTS) {
      throw new DomainError(DomainErrorCode.GOOGLE_MEET_ARTIFACT_NOT_AVAILABLE, 'La reunión aún no tiene conference record', { retryable: true, details: { meetingId: meeting0.id, attempt } })
    }
    await ctx.uow.run(async (repos) => {
      await repos.meetings.updateProcessing(meeting0.id, { processingStatus: MeetingProcessingStatus.FAILED, lastErrorCode: DomainErrorCode.GOOGLE_MEET_ARTIFACT_NOT_AVAILABLE, lastErrorAt: now })
    })
    metrics.increment(MetricNames.MEETINGS_FAILED)
    return { meetingId: meeting0.id, transcriptIngested: false, smartNotesIngested: false, skippedAsDuplicate: false, processingStatus: MeetingProcessingStatus.FAILED, enqueuedAnalysis: false }
  }
  const recordName = meeting0.googleConferenceRecordId

  try {
    // 1) Participantes (reemplazo completo con datos de Meet).
    const rawParticipants = await ctx.meet.listParticipants(recordName, asUser)
    // 2) Transcripts + entries.
    const transcriptsMeta = (await ctx.meet.listTranscripts(recordName, asUser)).filter((t) => t.state === 'FILE_GENERATED' || t.state === 'ENDED')
    const entriesByTranscript = new Map<string, Awaited<ReturnType<typeof ctx.meet.listTranscriptEntries>>>()
    for (const t of transcriptsMeta) entriesByTranscript.set(t.name, await ctx.meet.listTranscriptEntries(t.name, asUser))
    // 3) Smart notes → texto vía Docs.
    const smartNotes = (await ctx.meet.listSmartNotes(recordName, asUser)).filter((n) => n.state === 'FILE_GENERATED' || n.state === 'ENDED')
    let smartNotesText: string | null = null
    let smartNotesMeta = null as (typeof smartNotes)[number] | null
    for (const n of smartNotes) {
      if (!n.docsDocumentId) continue
      const text = await ctx.drive.exportDocumentText(n.docsDocumentId, asUser)
      if (text && text.trim().length > 0) {
        smartNotesText = text
        smartNotesMeta = n
        break
      }
    }
    const hasEntries = [...entriesByTranscript.values()].some((e) => e.length > 0)
    if (!hasEntries && !smartNotesText) {
      if (meeting0.isExternalHost && rawParticipants.length === 0) return markUnavailableExternal()
      if (attempt < MAX_ARTIFACT_ATTEMPTS) {
        await ctx.repos.meetings.updateProcessing(meeting0.id, { lastErrorCode: DomainErrorCode.GOOGLE_MEET_ARTIFACT_NOT_AVAILABLE, lastErrorAt: now })
        throw new DomainError(DomainErrorCode.GOOGLE_MEET_ARTIFACT_NOT_AVAILABLE, 'Google aún no expone artefactos de la reunión', { retryable: true, details: { meetingId: meeting0.id, attempt } })
      }
      await ctx.uow.run(async (repos) => {
        const m = (await repos.meetings.findById(meeting0.id)) ?? meeting0
        const patch = { transcriptStatus: ArtifactStatus.UNAVAILABLE, smartNotesStatus: ArtifactStatus.UNAVAILABLE, lastErrorCode: DomainErrorCode.GOOGLE_MEET_ARTIFACT_NOT_AVAILABLE, lastErrorAt: now }
        if (m.processingStatus !== MeetingProcessingStatus.FAILED) await setProcessingStatus(repos, m, MeetingProcessingStatus.FAILED, patch)
        else await repos.meetings.updateProcessing(m.id, patch)
        await ctx.events.publish({ type: 'MeetingProcessingFailed', meetingId: m.id, errorCode: DomainErrorCode.GOOGLE_MEET_ARTIFACT_NOT_AVAILABLE, occurredAt: now })
      })
      metrics.increment(MetricNames.MEETINGS_FAILED)
      return { meetingId: meeting0.id, transcriptIngested: false, smartNotesIngested: false, skippedAsDuplicate: false, processingStatus: MeetingProcessingStatus.FAILED, enqueuedAnalysis: false }
    }

    let transcriptIngested = false
    let smartNotesIngested = false
    let skippedAsDuplicate = false
    let transcriptId: string | null = null
    const finalStatus = await ctx.uow.run(async (repos) => {
      let meeting = (await repos.meetings.findById(meeting0.id)) ?? meeting0
      if (meeting.processingStatus === MeetingProcessingStatus.DISCOVERED) meeting = await setProcessingStatus(repos, meeting, MeetingProcessingStatus.WAITING_FOR_ARTIFACTS)
      if (meeting.processingStatus === MeetingProcessingStatus.WAITING_FOR_ARTIFACTS) meeting = await setProcessingStatus(repos, meeting, MeetingProcessingStatus.ARTIFACTS_AVAILABLE)
      if (meeting.processingStatus === MeetingProcessingStatus.FAILED) meeting = await setProcessingStatus(repos, meeting, MeetingProcessingStatus.INGESTING)
      if (meeting.processingStatus === MeetingProcessingStatus.ARTIFACTS_AVAILABLE) meeting = await setProcessingStatus(repos, meeting, MeetingProcessingStatus.INGESTING)

      const participants = await mapParticipants(repos, ctx, meeting, rawParticipants, domain)
      if (participants.length > 0) await repos.meetings.replaceParticipants(meeting.id, participants)
      const participantByGoogleId = new Map(participants.map((p) => [p.googleParticipantId ?? '', p]))
      const retainedUntil = settings.rawTranscriptRetentionDays ? new Date(now.getTime() + settings.rawTranscriptRetentionDays * 86_400_000) : null

      let languageCode: string | null = null
      for (const meta of transcriptsMeta) {
        const entries = entriesByTranscript.get(meta.name) ?? []
        if (entries.length === 0) continue
        const checksum = sha256(entries.map((e) => `${e.name}|${e.participantName ?? ''}|${e.text}`).join('\n'))
        const dup = await repos.transcripts.findByChecksum(meeting.id, checksum)
        if (dup) {
          skippedAsDuplicate = true
          transcriptIngested = true
          transcriptId = dup.id
          continue
        }
        languageCode = entries.find((e) => e.languageCode)?.languageCode ?? languageCode
        const tId = ctx.ids.next()
        const segments: TranscriptSegment[] = entries.map((e, i) => {
          const p = e.participantName ? participantByGoogleId.get(e.participantName) : undefined
          return {
            id: ctx.ids.next(),
            transcriptId: tId,
            participantId: p?.id ?? null,
            speakerLabel: p?.displayName ?? (e.participantName ? e.participantName.split('/').pop() ?? 'Participante' : 'Participante'),
            text: e.text,
            startAt: e.startTime,
            endAt: e.endTime,
            sequence: i + 1,
          }
        })
        const transcript: Transcript = {
          id: tId,
          meetingId: meeting.id,
          sourceType: TranscriptSourceType.MEET_TRANSCRIPT,
          googleTranscriptId: meta.name,
          languageCode,
          startedAt: meta.startTime,
          endedAt: meta.endTime,
          rawText: segments.map((s) => `${s.speakerLabel}: ${s.text}`).join('\n'),
          structuredPayload: null,
          sourceUri: meta.docsDocumentId ? `https://docs.google.com/document/d/${meta.docsDocumentId}/view` : null,
          retainedUntil,
          ingestionChecksum: checksum,
          createdAt: now,
        }
        await repos.transcripts.save(transcript, segments)
        transcriptIngested = true
        transcriptId = tId
        metrics.increment(MetricNames.TRANSCRIPTS_INGESTED, 1, { source: 'meet_transcript' })
      }
      if (smartNotesText && smartNotesMeta) {
        const checksum = sha256(`smartnotes|${smartNotesMeta.name}|${smartNotesText}`)
        const dup = await repos.transcripts.findByChecksum(meeting.id, checksum)
        if (!dup) {
          await repos.transcripts.save(
            {
              id: ctx.ids.next(),
              meetingId: meeting.id,
              sourceType: TranscriptSourceType.MEET_SMART_NOTES,
              googleTranscriptId: smartNotesMeta.name,
              languageCode,
              startedAt: smartNotesMeta.startTime,
              endedAt: smartNotesMeta.endTime,
              rawText: smartNotesText,
              structuredPayload: null,
              sourceUri: smartNotesMeta.docsDocumentId ? `https://docs.google.com/document/d/${smartNotesMeta.docsDocumentId}/view` : null,
              retainedUntil,
              ingestionChecksum: checksum,
              createdAt: now,
            },
            [],
          )
          metrics.increment(MetricNames.TRANSCRIPTS_INGESTED, 1, { source: 'smart_notes' })
        }
        smartNotesIngested = true
      }
      const patch = {
        transcriptStatus: transcriptIngested ? ArtifactStatus.INGESTED : ArtifactStatus.UNAVAILABLE,
        smartNotesStatus: smartNotesIngested ? ArtifactStatus.INGESTED : ArtifactStatus.UNAVAILABLE,
        lastErrorCode: null,
        lastErrorAt: null,
        detectedLanguageCode: meeting.detectedLanguageCode,
      }
      meeting = await setProcessingStatus(repos, meeting, MeetingProcessingStatus.INGESTED, patch)
      await audit(repos, ctx, {
        actorType: 'SYSTEM',
        action: 'meeting.artifacts.ingested',
        entity: 'Meeting',
        entityId: meeting.id,
        after: { transcriptIngested, smartNotesIngested, skippedAsDuplicate, asUser },
        correlationId: input.correlationId,
      })
      await ctx.events.publish({ type: 'MeetingIngested', meetingId: meeting.id, transcriptId, occurredAt: now })

      const aiEnabled = settings.featureFlags.AI_PROCESSING_ENABLED || aiMode(ctx.env) === 'FAKE'
      if (!meeting.excludedFromAi && aiEnabled) {
        await repos.meetings.updateProcessing(meeting.id, { aiAnalysisStatus: 'QUEUED' })
        return { status: MeetingProcessingStatus.INGESTED, enqueue: true }
      }
      await setProcessingStatus(repos, meeting, MeetingProcessingStatus.COMPLETED, { aiAnalysisStatus: 'SKIPPED' })
      return { status: MeetingProcessingStatus.COMPLETED, enqueue: false }
    })
    if (finalStatus.enqueue) {
      await enqueueJob(ctx, JobNames.ANALYZE_MEETING, { meetingId: meeting0.id, kind: 'ANALYZE_MEETING' }, { singletonKey: `analyze:${meeting0.id}`, correlationId: input.correlationId })
    }
    return { meetingId: meeting0.id, transcriptIngested, smartNotesIngested, skippedAsDuplicate, processingStatus: finalStatus.status, enqueuedAnalysis: finalStatus.enqueue }
  } catch (err) {
    if (isDomainError(err) && err.code === DomainErrorCode.GOOGLE_MEET_ARTIFACT_NOT_AVAILABLE) throw err
    const code = isDomainError(err) ? err.code : DomainErrorCode.INTERNAL_ERROR
    if (meeting0.isExternalHost && isDomainError(err) && (err.code === DomainErrorCode.GOOGLE_PERMISSION_DENIED || err.code === DomainErrorCode.GOOGLE_NOT_FOUND)) {
      return markUnavailableExternal()
    }
    ctx.logger.error({ meetingId: meeting0.id, errorCode: code }, 'Error recuperando artefactos de Meet')
    await ctx.repos.meetings.updateProcessing(meeting0.id, {
      lastErrorCode: code,
      lastErrorAt: now,
      ...(isDomainError(err) && err.retryable ? {} : { processingStatus: MeetingProcessingStatus.FAILED, transcriptStatus: ArtifactStatus.FAILED }),
    })
    if (!(isDomainError(err) && err.retryable)) {
      metrics.increment(MetricNames.MEETINGS_FAILED)
      await ctx.events.publish({ type: 'MeetingProcessingFailed', meetingId: meeting0.id, errorCode: code, occurredAt: now })
    }
    throw err
  }
}
