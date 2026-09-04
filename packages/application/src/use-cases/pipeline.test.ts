import { beforeEach, describe, expect, it } from 'vitest'
import { JobNames } from '@smlxl/config'
import { createFakeConferenceEndedEvent } from '@smlxl/google-workspace'
import { ActionItemStatus, ArtifactStatus, DomainErrorCode, MeetingProcessingStatus, MeetingStatus } from '@smlxl/domain'
import { createTestContext, principalOf, seedDemoUsers, type SeededUsers, type TestContext } from '../testing/index.js'
import { discoverMeetingsFromCalendar } from './google/discover-meetings-from-calendar.js'
import { ensureWorkspaceSubscriptions } from './google/ensure-workspace-subscriptions.js'
import { processInboundGoogleEvent } from './google/process-inbound-google-event.js'
import { fetchMeetingArtifacts } from './meetings/fetch-meeting-artifacts.js'
import { analyzeMeeting } from './meetings/analyze-meeting.js'
import { simulateMeetingEnded } from './meetings/simulate-meeting-ended.js'
import { reconcileMissingEvents } from './meetings/reconcile-missing-events.js'
import { reprocessMeeting } from './meetings/reprocess-meeting.js'
import { cleanupExpiredRawData } from './meetings/cleanup-expired-raw-data.js'
import { createManualMeeting } from './meetings/meeting-commands.js'
import { getMeetingDetail, listMeetings } from '../queries/meetings.js'
import { searchKnowledge } from '../queries/search.js'
import { getGoogleStatus } from '../queries/misc.js'

let ctx: TestContext
let u: SeededUsers

beforeEach(async () => {
  ctx = createTestContext()
  u = await seedDemoUsers(ctx)
})

describe('descubrimiento por Calendar', () => {
  it('crea reuniones, detecta host externo, cancela, aplica/bloquea auto-captura y encola safety net', async () => {
    const res = await discoverMeetingsFromCalendar(ctx)
    expect(res.users).toBe(3)
    expect(res.created).toBe(4)
    expect(res.errors).toEqual([])
    const meetings = [...ctx.state.meetings.values()]
    const beta = meetings.find((m) => m.title === 'Kickoff con Proveedor Beta')
    expect(beta).toMatchObject({ isExternalHost: true, organizerUserId: null, source: 'CALENDAR_DISCOVERY', googleMeetingCode: 'qrs-tuvw-xyz' })
    const alfa = meetings.find((m) => m.title === 'Seguimiento contrato Cliente Alfa')
    expect(alfa).toMatchObject({ isExternalHost: false, organizerUserId: u.andres.id })
    expect((await ctx.repos.meetings.listParticipants(alfa?.id ?? '')).some((p) => p.email === 'carlos.martinez@cliente-alfa.example' && !p.isInternal)).toBe(true)
    // Futura interna con bloqueo de política → CAPABILITY_BLOCKED; auditado; nunca lanza.
    const pipeline = meetings.find((m) => m.title === 'Revisión de pipeline comercial')
    expect(pipeline).toMatchObject({ transcriptStatus: ArtifactStatus.CAPABILITY_BLOCKED, smartNotesStatus: ArtifactStatus.CAPABILITY_BLOCKED, lastErrorCode: DomainErrorCode.GOOGLE_CAPABILITY_BLOCKED })
    expect(res.autoCaptureBlocked).toBe(1)
    expect(ctx.state.audit.some((a) => a.action === 'meeting.auto_capture.blocked')).toBe(true)
    // La externa futura no se toca.
    expect(beta?.transcriptStatus).toBe(ArtifactStatus.NOT_REQUESTED)
    expect(ctx.google.meet.patchCalls.every((c) => c.asUser === 'lucia.ferrer@smlxl.mx')).toBe(true)
    expect(ctx.queue.pending(JobNames.RECONCILE_MISSING_EVENTS)).toHaveLength(4)
    // Cursor guardado; segunda corrida incremental no duplica.
    expect((await ctx.repos.calendarCursors.list())).toHaveLength(3)
    const again = await discoverMeetingsFromCalendar(ctx)
    expect(again.created).toBe(0)
    expect(ctx.state.meetings.size).toBe(4)
    // Cancelación posterior.
    ctx.google.calendar.addEvent({ userEmail: u.andres.email, calendarEventId: 'cal-evt-alfa-001', title: 'Seguimiento contrato Cliente Alfa', organizerEmail: u.andres.email, attendees: [], startOffsetMinutes: -1500, durationMinutes: 60, meetingCode: 'abc-defg-hij', status: 'cancelled', recurringEventId: null })
    const third = await discoverMeetingsFromCalendar(ctx)
    expect(third.cancelled).toBe(1)
    expect((await ctx.repos.meetings.findById(alfa?.id ?? ''))?.status).toBe(MeetingStatus.CANCELLED)
  })

  it('token inválido fuerza sync completo y errores por usuario no abortan el loop', async () => {
    await discoverMeetingsFromCalendar(ctx)
    const cursor = (await ctx.repos.calendarCursors.find(u.andres.id, 'primary'))
    ctx.google.calendar.invalidateToken(cursor?.syncToken ?? '')
    const res = await discoverMeetingsFromCalendar(ctx)
    expect(res.errors).toEqual([])
    expect((await ctx.repos.calendarCursors.find(u.andres.id, 'primary'))?.lastFullSyncAt).not.toBeNull()
  })
})

describe('suscripciones Workspace Events', () => {
  it('crea por usuario monitoreado, renueva cerca de expirar y registra errores sin abortar', async () => {
    ctx.google.workspaceEvents.failFor.add(u.mariana.email)
    const first = await ensureWorkspaceSubscriptions(ctx)
    expect(first).toMatchObject({ users: 3, created: 2, errors: [{ userEmail: u.mariana.email, code: DomainErrorCode.GOOGLE_PERMISSION_DENIED }] })
    expect((await ctx.repos.googleSubscriptions.findByUser(u.mariana.id))?.state).toBe('ERROR')
    ctx.google.workspaceEvents.failFor.clear()
    const second = await ensureWorkspaceSubscriptions(ctx)
    expect(second).toMatchObject({ created: 1, unchanged: 2 })
    ctx.clock.advanceDays(6)
    const third = await ensureWorkspaceSubscriptions(ctx)
    expect(third.renewed).toBe(3)
    const status = await getGoogleStatus(ctx, principalOf(u.admin))
    expect(status.mode).toBe('FAKE')
    expect(status.subscriptions).toHaveLength(3)
  })
})

describe('pipeline evento → artefactos → análisis', () => {
  it('conference.ended es idempotente y enlaza con la reunión descubierta por Calendar', async () => {
    await discoverMeetingsFromCalendar(ctx)
    const before = ctx.state.meetings.size
    const event = createFakeConferenceEndedEvent('abc-defg-hij', { subscribedUserEmail: u.andres.email, id: 'evt-1' })
    const r1 = await processInboundGoogleEvent(ctx, event)
    expect(r1).toMatchObject({ duplicate: false, status: 'PROCESSED', enqueuedJob: 'job-5' })
    expect(ctx.state.meetings.size).toBe(before)
    const meeting = await ctx.repos.meetings.findByConferenceRecordId('conferenceRecords/fake-alfa-001')
    expect(meeting).toMatchObject({ title: 'Seguimiento contrato Cliente Alfa', status: MeetingStatus.ENDED, processingStatus: MeetingProcessingStatus.WAITING_FOR_ARTIFACTS, transcriptStatus: ArtifactStatus.PENDING })
    const r2 = await processInboundGoogleEvent(ctx, event)
    expect(r2.duplicate).toBe(true)
    expect(ctx.queue.pending(JobNames.FETCH_MEETING_ARTIFACTS)).toHaveLength(1)
    const unknown = await processInboundGoogleEvent(ctx, { ...event, id: 'evt-2', type: 'google.workspace.meet.participant.v2.joined' })
    expect(unknown.status).toBe('IGNORED')
    expect((await ctx.repos.inboundEvents.listRecent(10)).map((e) => e.processingStatus).sort()).toEqual(['IGNORED', 'PROCESSED'])
  })

  it('crea la reunión desde el evento cuando no fue descubierta y procesa end-to-end (fixture Alfa → 3 items)', async () => {
    // Sin descubrimiento previo: la reunión nace del evento con el usuario suscrito como organizador.
    const opsEvent = createFakeConferenceEndedEvent('wxy-zabc-def', { subscribedUserEmail: u.mariana.email })
    const ops = await processInboundGoogleEvent(ctx, opsEvent)
    expect(await ctx.repos.meetings.findById(ops.meetingId as string)).toMatchObject({ source: 'WORKSPACE_EVENT', organizerEmail: u.mariana.email, organizerUserId: u.mariana.id, googleMeetingCode: 'wxy-zabc-def', isExternalHost: false })
    // Con descubrimiento previo, el evento enlaza a la reunión de Calendar (título conocido → escenario fake).
    await discoverMeetingsFromCalendar(ctx)
    expect(ctx.state.meetings.size).toBe(4)
    const event = createFakeConferenceEndedEvent('abc-defg-hij', { subscribedUserEmail: u.andres.email })
    const r = await processInboundGoogleEvent(ctx, event)
    const meetingId = r.meetingId as string
    expect((await ctx.repos.meetings.findById(meetingId))?.title).toBe('Seguimiento contrato Cliente Alfa')
    const artifacts = await fetchMeetingArtifacts(ctx, { meetingId })
    expect(artifacts).toMatchObject({ transcriptIngested: true, smartNotesIngested: true, skippedAsDuplicate: false, processingStatus: MeetingProcessingStatus.INGESTED, enqueuedAnalysis: true })
    const transcripts = await ctx.repos.transcripts.findByMeeting(meetingId)
    expect(transcripts.map((t) => t.sourceType).sort()).toEqual(['MEET_SMART_NOTES', 'MEET_TRANSCRIPT'])
    const segments = await ctx.repos.transcripts.listSegments(transcripts.find((t) => t.sourceType === 'MEET_TRANSCRIPT')?.id ?? '')
    expect(segments.length).toBeGreaterThan(20)
    expect(segments[0]?.speakerLabel).toBe('Andrés Escandón')
    expect(segments[0]?.participantId).not.toBeNull()
    expect((await ctx.repos.meetings.listParticipants(meetingId)).find((p) => p.displayName === 'Lucía Ferrer')?.internalUserId).toBe(u.lucia.id)
    // Segunda ingesta: idempotente por checksum.
    const again = await fetchMeetingArtifacts(ctx, { meetingId })
    expect(again.skippedAsDuplicate).toBe(true)
    expect((await ctx.repos.transcripts.findByMeeting(meetingId))).toHaveLength(2)
    // Análisis con escenario fake.
    const analysis = await analyzeMeeting(ctx, { meetingId })
    expect(analysis.reconcile).toMatchObject({ created: 3, reviewItems: 3 })
    expect(analysis.processingStatus).toBe(MeetingProcessingStatus.REVIEW_REQUIRED)
    const items = await ctx.repos.actionItems.listAll({})
    expect(items).toHaveLength(3)
    const carta = items.find((i) => i.title.startsWith('Enviar carta'))
    expect(carta).toMatchObject({ status: ActionItemStatus.PROPOSED, ownerUserId: null })
    expect(carta?.externalAssigneeId).not.toBeNull()
    const anexo = items.find((i) => i.title.startsWith('Revisar anexo'))
    expect(anexo).toMatchObject({ status: ActionItemStatus.PENDING, priority: 'HIGH', areaId: u.areas.juridico.id })
    expect(anexo?.dueDate?.toISOString().slice(0, 10)).toBe('2026-09-04')
    const presupuesto = items.find((i) => i.title.includes('presupuesto'))
    expect(presupuesto?.status).toBe(ActionItemStatus.PROPOSED)
    expect(items.every((i) => i.status !== ActionItemStatus.COMPLETED)).toBe(true)
    const detail = await getMeetingDetail(ctx, principalOf(u.andres), meetingId)
    expect(detail.summary?.executiveSummary.length).toBeGreaterThanOrEqual(3)
    expect(detail.decisions).toHaveLength(2)
    expect(detail.processingRuns[0]).toMatchObject({ success: true, provider: 'fake', promptVersion: 'v1' })
    expect(detail.captureQuality).toEqual(['WITH_TRANSCRIPT', 'WITH_SMART_NOTES'])
    expect(detail.pendingReviewCount).toBe(3)
    // MEMBER que no participó no ve la reunión.
    await expect(getMeetingDetail(ctx, principalOf({ ...u.mariana, id: 'otro' }), meetingId)).rejects.toMatchObject({ code: DomainErrorCode.FORBIDDEN })
    // Búsqueda devuelve reuniones fuente.
    const search = await searchKnowledge(ctx, principalOf(u.andres), 'carta de intención')
    expect(search.actionItems.length).toBeGreaterThan(0)
    expect(search.sourceMeetingIds).toContain(meetingId)
    // Reproceso: nuevo run sin perder el anterior (se vacía la cola para que el singletonKey no deduplique).
    for (const j of ctx.queue.pending()) j.status = 'done'
    await reprocessMeeting(ctx, principalOf(u.andres), meetingId)
    const job = ctx.queue.pending(JobNames.ANALYZE_MEETING)[0]
    expect(job?.payload).toEqual({ meetingId, kind: 'REPROCESS' })
    await analyzeMeeting(ctx, { meetingId, kind: 'REPROCESS' })
    expect((await ctx.repos.processingRuns.listByMeeting(meetingId))).toHaveLength(2)
    expect((await ctx.repos.summaries.listByMeeting(meetingId))).toHaveLength(2)
    expect((await ctx.repos.actionItems.listAll({}))).toHaveLength(3)
  })

  it('simulateMeetingEnded ejecuta todo el pipeline en modo FAKE', async () => {
    const res = await simulateMeetingEnded(ctx, principalOf(u.admin), {})
    expect(res.conferenceRecordName).toBe('conferenceRecords/fake-alfa-001')
    expect(res.analysis?.reconcile?.created).toBe(3)
    const list = await listMeetings(ctx, principalOf(u.andres), {})
    expect(list.items.find((m) => m.id === res.meetingId)?.actionItemCount).toBe(3)
    await expect(simulateMeetingEnded(ctx, principalOf(u.mariana), {})).rejects.toMatchObject({ code: DomainErrorCode.FORBIDDEN })
  })

  it('host externo sin artefactos accesibles → UNAVAILABLE_EXTERNAL_HOST y COMPLETED (safety net)', async () => {
    await discoverMeetingsFromCalendar(ctx)
    // Reunión interna pasada sin evento: el safety net encuentra el record y encola la ingesta.
    const ops = [...ctx.state.meetings.values()].find((m) => m.title === 'Sincronización semanal Operaciones')
    const r2 = await reconcileMissingEvents(ctx, { meetingId: ops?.id })
    expect(r2.linked).toBe(1)
    expect((await ctx.repos.meetings.findById(ops?.id ?? ''))?.googleConferenceRecordId).toBe('conferenceRecords/fake-ops-002')
    const fetched = await fetchMeetingArtifacts(ctx, { meetingId: ops?.id ?? '' })
    expect(fetched.transcriptIngested).toBe(true)
    const analysis = await analyzeMeeting(ctx, { meetingId: ops?.id ?? '' })
    expect(analysis.reconcile?.created).toBeGreaterThan(0)
    // Externa futura: aún no termina → sigue esperando; tras la ventana → host externo no accesible.
    const beta = [...ctx.state.meetings.values()].find((m) => m.title === 'Kickoff con Proveedor Beta')
    expect(await reconcileMissingEvents(ctx, { meetingId: beta?.id })).toMatchObject({ checked: 0, stillWaiting: 1 })
    ctx.clock.advanceDays(3)
    const res = await reconcileMissingEvents(ctx, { meetingId: beta?.id })
    expect(res).toMatchObject({ checked: 1, unavailableExternal: 1 })
    const after = await ctx.repos.meetings.findById(beta?.id ?? '')
    expect(after).toMatchObject({ processingStatus: MeetingProcessingStatus.COMPLETED, transcriptStatus: ArtifactStatus.UNAVAILABLE_EXTERNAL_HOST, aiAnalysisStatus: 'SKIPPED' })
  })

  it('artefactos aún no disponibles → error reintentable y FAILED tras el máximo de intentos', async () => {
    const now = ctx.clock.now()
    const meeting = await ctx.repos.meetings.save({ id: ctx.ids.next(), googleConferenceRecordId: 'conferenceRecords/fake-ext-003', googleMeetingSpaceId: null, googleMeetingCode: 'qrs-tuvw-xyz', googleCalendarEventId: null, title: 'Interna sin artefactos', organizerUserId: u.lucia.id, organizerEmail: u.lucia.email, isExternalHost: false, startAt: now, endAt: now, durationSeconds: 0, status: 'ENDED', source: 'WORKSPACE_EVENT', processingStatus: MeetingProcessingStatus.WAITING_FOR_ARTIFACTS, transcriptStatus: 'PENDING', smartNotesStatus: 'PENDING', aiAnalysisStatus: 'NOT_STARTED', confidentialityLevel: 'NORMAL', excludedFromAi: false, reportedLanguageCode: null, detectedLanguageCode: null, mixedLanguageDetected: false, lastErrorCode: null, lastErrorAt: null, areaId: null, projectId: null, createdAt: now, updatedAt: now })
    await expect(fetchMeetingArtifacts(ctx, { meetingId: meeting.id, attempt: 1 })).rejects.toMatchObject({ code: DomainErrorCode.GOOGLE_MEET_ARTIFACT_NOT_AVAILABLE, retryable: true })
    const res = await fetchMeetingArtifacts(ctx, { meetingId: meeting.id, attempt: 6 })
    expect(res.processingStatus).toBe(MeetingProcessingStatus.FAILED)
    expect((await ctx.repos.meetings.findById(meeting.id))?.lastErrorCode).toBe(DomainErrorCode.GOOGLE_MEET_ARTIFACT_NOT_AVAILABLE)
  })

  it('reunión manual se ingesta, analiza heurísticamente y la retención purga el texto bruto', async () => {
    const { meetingId, enqueuedAnalysis } = await createManualMeeting(ctx, principalOf(u.mariana), {
      title: 'Reunión manual de operaciones',
      startAt: '2026-09-02T15:00:00Z',
      participantEmails: [u.lucia.email],
      transcriptText: 'Mariana Solís: Yo voy a preparar el reporte de avance del proyecto de bodega para el jueves.\nLucía Ferrer: Acordamos mover el corte de nómina al día quince.',
      confidentialityLevel: 'NORMAL',
    })
    expect(enqueuedAnalysis).toBe(true)
    const analysis = await analyzeMeeting(ctx, { meetingId })
    expect(analysis.reconcile?.created).toBeGreaterThanOrEqual(1)
    expect((await ctx.repos.decisions.listByMeeting(meetingId))).toHaveLength(1)
    ctx.clock.advanceDays(91)
    const purged = await cleanupExpiredRawData(ctx)
    expect(purged.deleted).toBe(1)
    expect((await ctx.repos.transcripts.findByMeeting(meetingId))[0]?.rawText).toBe('')
    expect((await ctx.repos.actionItems.listAll({})).length).toBeGreaterThan(0)
  })
})
