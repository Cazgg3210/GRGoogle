import { googleMode } from '@smlxl/config'
import {
  createFakeConferenceEndedEvent,
  loadDefaultFixtures,
  type FakeGoogleFixtures,
} from '@smlxl/google-workspace'
import {
  DomainError,
  DomainErrorCode,
  MeetingProcessingStatus,
  Permission,
  hasPermission,
  type Principal,
} from '@smlxl/domain'
import type { AppContext } from '../../context.js'
import { analyzeMeeting, type AnalyzeMeetingResult } from './analyze-meeting.js'
import { fetchMeetingArtifacts, type FetchArtifactsResult } from './fetch-meeting-artifacts.js'
import { processInboundGoogleEvent } from '../google/process-inbound-google-event.js'
import { discoverMeetingsFromCalendar } from '../google/discover-meetings-from-calendar.js'

/**
 * Demo end-to-end en modo FAKE (§37, §50): evento conference.ended → ingesta →
 * análisis, todo síncrono (sin cola). Devuelve el id de la reunión procesada.
 */
export interface SimulateMeetingEndedResult {
  meetingId: string
  conferenceRecordName: string
  inbound: { duplicate: boolean; status: string }
  artifacts: FetchArtifactsResult | null
  analysis: AnalyzeMeetingResult | null
}

export async function simulateMeetingEnded(
  ctx: AppContext,
  principal: Principal,
  input: { meetingId?: string; meetingCode?: string; fixtures?: FakeGoogleFixtures } = {},
): Promise<SimulateMeetingEndedResult> {
  if (!hasPermission(principal, Permission.INTEGRATION_MANAGE))
    throw DomainError.forbidden('No tienes permiso para simular eventos')
  if (googleMode(ctx.env) !== 'FAKE') {
    throw new DomainError(
      DomainErrorCode.FEATURE_DISABLED,
      'La simulación sólo está disponible en modo FAKE de Google',
      { details: { mode: 'REAL' } },
    )
  }
  const fixtures = input.fixtures ?? loadDefaultFixtures()
  let meetingCode = input.meetingCode ?? null
  if (input.meetingId) {
    const meeting = await ctx.repos.meetings.findById(input.meetingId)
    if (!meeting) throw DomainError.notFound('Meeting', input.meetingId)
    meetingCode = meeting.googleMeetingCode ?? meetingCode
    if (!meetingCode && meeting.googleConferenceRecordId)
      meetingCode = meeting.googleConferenceRecordId
    if (!meetingCode)
      throw new DomainError(
        DomainErrorCode.VALIDATION_ERROR,
        'La reunión no tiene meetingCode para simular',
      )
  }
  if (!meetingCode) {
    // Sin reunión indicada: descubrir desde Calendar fake y usar la primera reunión demo con record disponible.
    await discoverMeetingsFromCalendar(ctx)
    const record =
      fixtures.conferenceRecords.find((r) => r.accessibleTo === null) ??
      fixtures.conferenceRecords[0]
    if (!record)
      throw new DomainError(DomainErrorCode.NOT_FOUND, 'No hay fixtures de conference records')
    meetingCode = record.meetingCode
  }
  const record = fixtures.conferenceRecords.find(
    (r) => r.meetingCode === meetingCode || r.name === meetingCode,
  )
  if (!record)
    throw new DomainError(
      DomainErrorCode.NOT_FOUND,
      `No existe fixture de conference record para ${meetingCode}`,
    )
  const subscribed = record.participants.find(
    (p) => p.email && p.email.endsWith(`@${ctx.env.GOOGLE_WORKSPACE_DOMAIN}`),
  )?.email
  const event = createFakeConferenceEndedEvent(record.name, {
    fixtures,
    ...(subscribed ? { subscribedUserEmail: subscribed } : {}),
    occurredAt: ctx.clock.now(),
  })
  const inbound = await processInboundGoogleEvent(ctx, event)
  const meetingId =
    inbound.meetingId ??
    (await ctx.repos.meetings.findByConferenceRecordId(record.name))?.id ??
    null
  if (!meetingId)
    throw new DomainError(DomainErrorCode.INTERNAL_ERROR, 'La simulación no produjo una reunión')
  let artifacts: FetchArtifactsResult | null = null
  let analysis: AnalyzeMeetingResult | null = null
  try {
    artifacts = await fetchMeetingArtifacts(ctx, { meetingId, attempt: 1 })
  } catch (err) {
    ctx.logger.warn(
      { meetingId, errorCode: err instanceof DomainError ? err.code : 'ERR' },
      'Simulación: ingesta falló',
    )
    throw err
  }
  if (
    artifacts.enqueuedAnalysis ||
    artifacts.processingStatus === MeetingProcessingStatus.INGESTED
  ) {
    analysis = await analyzeMeeting(ctx, { meetingId, kind: 'ANALYZE_MEETING' })
  }
  return {
    meetingId,
    conferenceRecordName: record.name,
    inbound: { duplicate: inbound.duplicate, status: inbound.status },
    artifacts,
    analysis,
  }
}
