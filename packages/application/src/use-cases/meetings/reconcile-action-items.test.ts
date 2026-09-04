import { beforeEach, describe, expect, it } from 'vitest'
import { ActionItemStatus, MeetingProcessingStatus, MeetingSource, MeetingStatus, ReconcileDecision, type ActionItem, type ExtractedActionItem, type Meeting, type ProcessingRun } from '@smlxl/domain'
import { createTestContext, seedDemoUsers, type SeededUsers, type TestContext } from '../../testing/index.js'
import { applyReconciliation, planReconciliation, scoreCandidate, type ReconcileContext } from './reconcile-action-items.js'

let ctx: TestContext
let users: SeededUsers
let meeting: Meeting
let run: ProcessingRun

function extracted(partial: Partial<ExtractedActionItem> & { title: string }): ExtractedActionItem {
  return { owner: null, dueDate: null, priority: null, statusHint: 'NEW', evidence: [{ text: 'evidencia', speaker: 'Andrés Escandón' }], confidence: 0.95, ...partial }
}

async function seedItem(partial: Partial<ActionItem> & { title: string }): Promise<ActionItem> {
  const now = ctx.clock.now()
  const seq = await ctx.repos.actionItems.nextSequence()
  const item: ActionItem = {
    id: ctx.ids.next(),
    externalKey: `ACT-${String(seq).padStart(6, '0')}`,
    description: null,
    type: 'ONE_OFF',
    ownerUserId: users.lucia.id,
    externalAssigneeId: null,
    ownerTextOriginal: null,
    collaboratorUserIds: [],
    areaId: users.areas.juridico.id,
    projectId: null,
    createdFromMeetingId: null,
    latestMeetingId: null,
    status: ActionItemStatus.PENDING,
    priority: 'MEDIUM',
    dueDate: null,
    dueDateTextOriginal: null,
    dateConfidence: null,
    startDate: null,
    completedAt: null,
    cancelledAt: null,
    confidence: null,
    requiresReview: false,
    sourceEvidence: [],
    recurrence: null,
    parentActionItemId: null,
    blocker: null,
    tags: [],
    migrationTrust: 'PLATFORM',
    legacyId: null,
    lastMentionedAt: null,
    createdAt: now,
    updatedAt: now,
    ...partial,
  }
  await ctx.repos.actionItems.save(item)
  await ctx.repos.actionItems.addStatusHistory({ id: ctx.ids.next(), actionItemId: item.id, fromStatus: null, toStatus: item.status, changedByUserId: null, changedBySystem: true, reason: 'seed', meetingId: null, changedAt: now })
  return item
}

async function reconcile(items: ExtractedActionItem[]) {
  const settings = await ctx.getSettings()
  const rc: ReconcileContext = { meeting, run, participants: await ctx.repos.meetings.listParticipants(meeting.id), settings, referenceDate: '2026-09-03' }
  return ctx.uow.run(async (repos) => {
    const plan = await planReconciliation(ctx, repos, rc, items)
    const summary = await applyReconciliation(ctx, repos, rc, plan)
    return { plan, summary }
  })
}

beforeEach(async () => {
  ctx = createTestContext()
  users = await seedDemoUsers(ctx)
  const now = ctx.clock.now()
  meeting = await ctx.repos.meetings.save({
    id: ctx.ids.next(), googleConferenceRecordId: 'conferenceRecords/x', googleMeetingSpaceId: null, googleMeetingCode: 'abc-defg-hij', googleCalendarEventId: null,
    title: 'Seguimiento contrato Cliente Alfa', organizerUserId: users.andres.id, organizerEmail: users.andres.email, isExternalHost: false, startAt: now, endAt: now, durationSeconds: 3600,
    status: MeetingStatus.ENDED, source: MeetingSource.WORKSPACE_EVENT, processingStatus: MeetingProcessingStatus.ANALYZING, transcriptStatus: 'INGESTED', smartNotesStatus: 'INGESTED', aiAnalysisStatus: 'RUNNING',
    confidentialityLevel: 'NORMAL', excludedFromAi: false, reportedLanguageCode: null, detectedLanguageCode: null, mixedLanguageDetected: false, lastErrorCode: null, lastErrorAt: null, areaId: users.areas.direccion.id, projectId: null, createdAt: now, updatedAt: now,
  })
  await ctx.repos.meetings.replaceParticipants(meeting.id, [
    { id: ctx.ids.next(), meetingId: meeting.id, internalUserId: users.andres.id, googleParticipantId: 'p1', displayName: 'Andrés Escandón', email: users.andres.email, participantType: 'SIGNED_IN_USER', isInternal: true, joinedAt: null, leftAt: null, speakingDurationSeconds: null },
    { id: ctx.ids.next(), meetingId: meeting.id, internalUserId: users.lucia.id, googleParticipantId: 'p2', displayName: 'Lucía Ferrer', email: users.lucia.email, participantType: 'SIGNED_IN_USER', isInternal: true, joinedAt: null, leftAt: null, speakingDurationSeconds: null },
    { id: ctx.ids.next(), meetingId: meeting.id, internalUserId: null, googleParticipantId: 'p3', displayName: 'Carlos Martínez', email: 'carlos.martinez@cliente-alfa.example', participantType: 'SIGNED_IN_USER', isInternal: false, joinedAt: null, leftAt: null, speakingDurationSeconds: null },
  ])
  run = await ctx.repos.processingRuns.save({ id: ctx.ids.next(), meetingId: meeting.id, kind: 'ANALYZE_MEETING', provider: 'fake', model: 'fake', promptVersion: 'v1', schemaVersion: '1.0.0', temperature: 0, inputTokens: 0, outputTokens: 0, cachedTokens: 0, estimatedCostUsd: 0, latencyMs: 1, success: true, errorCode: null, correlationId: 'c', startedAt: now, finishedAt: now })
})

describe('scoreCandidate', () => {
  it('pondera título, responsable, proyecto y clave referenciada', async () => {
    const item = await seedItem({ title: 'Revisar anexo de penalizaciones', projectId: 'p1' })
    const s = scoreCandidate({ title: 'Revisar anexo de penalizaciones', relatedOpenActionKey: item.externalKey }, item, { userId: users.lucia.id, externalAssigneeId: null }, 'p1')
    expect(s.score).toBe(1)
    expect(s).toMatchObject({ sameOwner: true, sameProject: true, keyReferenced: true })
    const weak = scoreCandidate({ title: 'Otra cosa distinta' }, item, { userId: null, externalAssigneeId: null }, null)
    expect(weak.score).toBeLessThan(0.3)
  })
})

describe('reconciliación', () => {
  it('CREATE_NEW: banda AUTO_ACCEPT crea PENDING con responsable resuelto por nombre y fecha', async () => {
    const { plan, summary } = await reconcile([extracted({ title: 'Enviar propuesta comercial a Cliente Beta', owner: { name: 'Lucia Ferrer', evidence: 'yo la envío' }, dueDate: '2026-09-08', dueDateTextOriginal: 'el martes', confidence: 0.95 })])
    expect(plan[0]?.decision).toBe(ReconcileDecision.CREATE_NEW)
    expect(summary).toMatchObject({ created: 1, reviewItems: 0 })
    const [item] = await ctx.repos.actionItems.listAll({})
    expect(item).toMatchObject({ status: ActionItemStatus.PENDING, ownerUserId: users.lucia.id, requiresReview: false, externalKey: 'ACT-000001', createdFromMeetingId: meeting.id })
    expect(item?.dueDate?.toISOString()).toBe('2026-09-08T06:00:00.000Z')
    expect((await ctx.repos.actionItems.listLinks(item?.id ?? '')).map((l) => l.relationType)).toEqual(['CREATED'])
    expect(ctx.state.audit.some((a) => a.action === 'action_item.created' && a.actorType === 'AI')).toBe(true)
    expect(ctx.events.events.some((e) => e.type === 'ActionItemCreated')).toBe(true)
  })

  it('banda PROPOSAL crea PROPOSED + revisión LOW_CONFIDENCE; banda REVIEW sólo revisión', async () => {
    const { summary } = await reconcile([
      extracted({ title: 'Preparar plan de onboarding', owner: { name: 'Lucía Ferrer', evidence: 'x' }, confidence: 0.75 }),
      extracted({ title: 'Ver si conviene cambiar de proveedor', confidence: 0.4 }),
    ])
    expect(summary).toMatchObject({ created: 1, reviewItems: 2 })
    const items = await ctx.repos.actionItems.listAll({})
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ status: ActionItemStatus.PROPOSED, requiresReview: true })
    const reviews = await ctx.repos.aiReview.listPending()
    expect(reviews.find((r) => r.proposedActionItemId === items[0]?.id)?.reasons).toEqual(['LOW_CONFIDENCE'])
    const onlyReview = reviews.find((r) => r.proposedActionItemId === null)
    expect(onlyReview?.reasons).toContain('LOW_CONFIDENCE')
  })

  it('responsable externo crea ExternalAssignee; área como responsable y fecha ambigua generan razones', async () => {
    const { summary } = await reconcile([
      extracted({ title: 'Enviar carta de intención firmada', owner: { name: 'Carlos Martínez', email: 'carlos.martinez@cliente-alfa.example', evidence: 'x' }, confidence: 0.95 }),
      extracted({ title: 'Revisar anexo de penalizaciones', owner: { name: 'Jurídico', evidence: 'x' }, dueDateTextOriginal: 'cuando se pueda', confidence: 0.95 }),
    ])
    expect(summary.created).toBe(2)
    const items = await ctx.repos.actionItems.listAll({})
    const carta = items.find((i) => i.title.startsWith('Enviar carta'))
    expect(carta?.externalAssigneeId).not.toBeNull()
    expect((await ctx.repos.externalAssignees.list())[0]?.displayName).toBe('Carlos Martínez')
    const anexo = items.find((i) => i.title.startsWith('Revisar anexo'))
    expect(anexo).toMatchObject({ ownerUserId: null, areaId: users.areas.juridico.id, requiresReview: true })
    const review = (await ctx.repos.aiReview.listPending()).find((r) => r.proposedActionItemId === anexo?.id)
    expect(review?.reasons).toEqual(expect.arrayContaining(['AMBIGUOUS_OWNER', 'AMBIGUOUS_DUE_DATE']))
  })

  it('LINK_EXISTING cuando coincide fuertemente y sólo se menciona', async () => {
    const existing = await seedItem({ title: 'Revisar anexo de penalizaciones del contrato' })
    const { plan, summary } = await reconcile([extracted({ title: 'Revisar anexo de penalizaciones del contrato', owner: { name: 'Lucía Ferrer', evidence: 'x' } })])
    expect(plan[0]?.decision).toBe(ReconcileDecision.LINK_EXISTING)
    expect(summary).toMatchObject({ linked: 1, created: 0 })
    const links = await ctx.repos.actionItems.listLinks(existing.id)
    expect(links.map((l) => l.relationType)).toEqual(['MENTIONED'])
    expect((await ctx.repos.actionItems.findById(existing.id))?.latestMeetingId).toBe(meeting.id)
  })

  it('UPDATE_EXISTING aplica nueva fecha con confianza alta; con confianza media crea CONFLICT_WITH_EXISTING', async () => {
    const a = await seedItem({ title: 'Enviar reporte mensual de ventas' })
    const b = await seedItem({ title: 'Actualizar inventario de bodega norte' })
    const { plan, summary } = await reconcile([
      extracted({ title: 'Enviar reporte mensual de ventas', owner: { name: 'Lucía Ferrer', evidence: 'x' }, statusHint: 'UPDATE', dueDate: '2026-09-15', confidence: 0.95 }),
      extracted({ title: 'Actualizar inventario de bodega norte', owner: { name: 'Lucía Ferrer', evidence: 'x' }, statusHint: 'UPDATE', dueDate: '2026-09-20', confidence: 0.8 }),
    ])
    expect(plan.map((p) => p.decision)).toEqual([ReconcileDecision.UPDATE_EXISTING, ReconcileDecision.UPDATE_EXISTING])
    expect(summary).toMatchObject({ updated: 2, reviewItems: 1 })
    expect((await ctx.repos.actionItems.findById(a.id))?.dueDate?.toISOString()).toBe('2026-09-15T06:00:00.000Z')
    expect((await ctx.repos.actionItems.findById(b.id))?.dueDate).toBeNull()
    const review = (await ctx.repos.aiReview.listPending())[0]
    expect(review).toMatchObject({ candidateActionItemId: b.id, reasons: ['CONFLICT_WITH_EXISTING'] })
    expect(review?.suggestedDueDate?.toISOString()).toBe('2026-09-20T06:00:00.000Z')
  })

  it('BLOCKED nunca cambia el estado: vincula BLOCKED y crea revisión', async () => {
    const item = await seedItem({ title: 'Liberar rutas nuevas de transporte' })
    await reconcile([extracted({ title: 'Liberar rutas nuevas de transporte', owner: { name: 'Lucía Ferrer', evidence: 'x' }, statusHint: 'BLOCKED', description: 'esperando póliza', confidence: 0.95 })])
    const after = await ctx.repos.actionItems.findById(item.id)
    expect(after?.status).toBe(ActionItemStatus.PENDING)
    expect(after?.blocker).toBe('esperando póliza')
    expect((await ctx.repos.actionItems.listLinks(item.id)).map((l) => l.relationType)).toEqual(['BLOCKED'])
    expect((await ctx.repos.aiReview.listPending())[0]?.reasons).toEqual(['CONFLICT_WITH_EXISTING'])
  })

  it('MARK_DONE_CANDIDATE propone cierre (COMPLETION_PROPOSED) y nunca COMPLETED', async () => {
    const item = await seedItem({ title: 'Enviar presupuesto de licencias', status: ActionItemStatus.IN_PROGRESS })
    const { plan, summary } = await reconcile([extracted({ title: 'Enviar presupuesto de licencias', owner: { name: 'Lucía Ferrer', evidence: 'x' }, statusHint: 'DONE', confidence: 0.86 })])
    expect(plan[0]?.decision).toBe(ReconcileDecision.MARK_DONE_CANDIDATE)
    expect(summary).toMatchObject({ proposals: 1, reviewItems: 1 })
    const after = await ctx.repos.actionItems.findById(item.id)
    expect(after?.status).toBe(ActionItemStatus.COMPLETION_PROPOSED)
    expect(after?.completedAt).toBeNull()
    const proposal = await ctx.repos.completionProposals.findPendingByActionItem(item.id)
    expect(proposal).toMatchObject({ proposedByType: 'AI', proposedFromMeetingId: meeting.id, confidence: 0.86 })
    expect((await ctx.repos.actionItems.listStatusHistory(item.id)).at(-1)).toMatchObject({ fromStatus: 'IN_PROGRESS', toStatus: 'COMPLETION_PROPOSED', changedBySystem: true })
    expect((await ctx.repos.aiReview.listPending())[0]?.reasons).toEqual(['POSSIBLE_COMPLETION'])
    expect(ctx.state.actionItems.size).toBe(1)
    expect([...ctx.state.actionItems.values()].every((i) => i.status !== ActionItemStatus.COMPLETED)).toBe(true)
  })

  it('MARK_DONE con flag AI_COMPLETION_PROPOSALS_ENABLED=false sólo crea revisión', async () => {
    const s = await ctx.getSettings()
    await ctx.repos.settings.save({ ...s, featureFlags: { ...s.featureFlags, AI_COMPLETION_PROPOSALS_ENABLED: false } }, null)
    const item = await seedItem({ title: 'Enviar presupuesto de licencias' })
    const { summary } = await reconcile([extracted({ title: 'Enviar presupuesto de licencias', owner: { name: 'Lucía Ferrer', evidence: 'x' }, statusHint: 'DONE', confidence: 0.95 })])
    expect(summary).toMatchObject({ proposals: 0, reviewItems: 1, linked: 1 })
    expect((await ctx.repos.actionItems.findById(item.id))?.status).toBe(ActionItemStatus.PENDING)
  })

  it('REOPEN_CANDIDATE: candidato completado nunca se reabre automáticamente', async () => {
    const item = await seedItem({ title: 'Configurar servidor de respaldo', status: ActionItemStatus.COMPLETED, completedAt: ctx.clock.now() })
    const { plan } = await reconcile([extracted({ title: 'Configurar servidor de respaldo', owner: { name: 'Lucía Ferrer', evidence: 'x' }, relatedOpenActionKey: item.externalKey, statusHint: 'UPDATE' })])
    expect(plan[0]?.decision).toBe(ReconcileDecision.REOPEN_CANDIDATE)
    expect((await ctx.repos.actionItems.findById(item.id))?.status).toBe(ActionItemStatus.COMPLETED)
    expect((await ctx.repos.aiReview.listPending())[0]?.reasons).toEqual(['CONFLICT_WITH_EXISTING'])
  })

  it('zona gris usa el juez LLM: REQUIRES_HUMAN_REVIEW → POSSIBLE_DUPLICATE sin crear tarea', async () => {
    const item = await seedItem({ title: 'Preparar reporte de avance del proyecto bodega', ownerUserId: users.mariana.id })
    const { plan, summary } = await reconcile([extracted({ title: 'Preparar reporte de avance de bodega', owner: { name: 'Mariana Solís', evidence: 'x' }, confidence: 0.95 })])
    expect(plan[0]?.candidate?.item.id).toBe(item.id)
    expect(plan[0]?.decision).toBe(ReconcileDecision.REQUIRES_HUMAN_REVIEW)
    expect(plan[0]?.judgeRationale).toBeTruthy()
    expect(summary).toMatchObject({ created: 0, reviewItems: 1 })
    expect((await ctx.repos.aiReview.listPending())[0]?.reasons).toContain('POSSIBLE_DUPLICATE')
    expect(ctx.fakeAi.calls.some((c) => c.kind === 'reconcile')).toBe(true)
  })
})
